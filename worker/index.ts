import { createRemoteJWKSet, jwtVerify } from 'jose';
import { isBuildingManagementTemplate, reportInstanceLabel } from '../src/data/reportCatalogue';
import { normalizeAreaName } from '../src/lib/reportFormatting';
import { migrateReportData } from '../src/lib/reportMigration';
import { reportValidationMessage, validateReportForFinalization } from '../src/lib/reportValidation';
import { CURRENT_REPORT_SCHEMA_VERSION, isReportType } from '../src/types/report';
import type { ProInspectIntegrationContext, ReportData, ReportPhoto, ReportStatus, ReportType, UserRole } from '../src/types/report';

interface Env {
  DB: D1Database;
  REPORT_STORAGE: R2Bucket;
  REPORT_RECOVERY_STORAGE: R2Bucket;
  TEAM_DOMAIN?: string;
  POLICY_AUD?: string;
  DEV_USER_EMAIL?: string;
  DEV_USER_ROLE?: string;
  ADMIN_EMAILS?: string;
  EDITOR_EMAILS?: string;
  VIEWER_EMAILS?: string;
  DEFAULT_ROLE?: string;
  PROINSPECT_HANDOFF_SIGNING_KEY?: string;
  PROINSPECT_INGEST_URL?: string;
  PROINSPECT_INGEST_TOKEN?: string;
}

interface PropertyRow {
  id: string;
  address: string;
  reference: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

interface ReportRow {
  id: string;
  property_id: string;
  report_type: ReportType;
  status: ReportStatus;
  revision: number;
  report_data: string;
  completed_pdf_key: string | null;
  supersedes_report_id: string | null;
  superseded_by_report_id: string | null;
  superseded_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }
}

interface AuthenticatedUser {
  email: string;
  role: UserRole;
}

function emailSet(value?: string): Set<string> {
  return new Set(
    (value || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

function normalizeRole(value?: string): UserRole | null {
  return value === 'viewer' || value === 'editor' || value === 'admin' ? value : null;
}

function resolveRole(email: string, env: Env): UserRole {
  const normalized = email.toLowerCase();
  if (emailSet(env.ADMIN_EMAILS).has(normalized)) return 'admin';
  if (emailSet(env.VIEWER_EMAILS).has(normalized)) return 'viewer';
  if (emailSet(env.EDITOR_EMAILS).has(normalized)) return 'editor';
  return normalizeRole(env.DEFAULT_ROLE) || 'editor';
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function verifyProInspectHandoffToken(
  token: string,
  env: Env
): Promise<ProInspectIntegrationContext> {
  const signingKey = env.PROINSPECT_HANDOFF_SIGNING_KEY?.trim();
  if (!signingKey) {
    throw new HttpError(
      503,
      'ProInspect platform handoff is not configured.',
      'proinspect-handoff-not-configured'
    );
  }

  const [payloadPart, signaturePart, extra] = token.split('.');
  if (!payloadPart || !signaturePart || extra) {
    throw new HttpError(400, 'Invalid ProInspect handoff token.', 'invalid-proinspect-handoff');
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    decodeBase64Url(signaturePart),
    new TextEncoder().encode(payloadPart)
  );
  if (!valid) {
    throw new HttpError(403, 'ProInspect handoff signature is invalid.', 'invalid-proinspect-handoff');
  }

  let payload: ProInspectIntegrationContext;
  try {
    payload = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(payloadPart))
    ) as ProInspectIntegrationContext;
  } catch {
    throw new HttpError(400, 'ProInspect handoff payload is invalid.', 'invalid-proinspect-handoff');
  }

  if (
    payload.v !== 1 ||
    payload.iss !== 'proinspect-platform' ||
    !payload.propertyId ||
    !payload.propertyAddress ||
    !isReportType(payload.reportType) ||
    !Number.isFinite(payload.exp) ||
    payload.exp * 1000 < Date.now()
  ) {
    throw new HttpError(400, 'ProInspect handoff is invalid or has expired.', 'invalid-proinspect-handoff');
  }

  const allowedAudiences = new Set(['client', 'tenant', 'staff']);
  payload.audiences = Array.isArray(payload.audiences)
    ? payload.audiences.filter(
        (audience): audience is 'client' | 'tenant' | 'staff' =>
          allowedAudiences.has(audience)
      )
    : ['client', 'staff'];

  return payload;
}

function reportDocumentCategory(
  reportType: ReportType
): 'property_condition_report' | 'inspection_report' | 'property_report' {
  if (['Entry', 'Exit', 'PropertyOnboarding'].includes(reportType)) {
    return 'property_condition_report';
  }
  if (
    [
      'Routine',
      'CommercialIngoing',
      'CommercialPeriodic',
      'CommercialExit',
      'CommonProperty',
      'BuildingManagement',
      'BuildingManagementDaily',
      'BuildingManagementMonthly',
      'VacantProperty',
    ].includes(reportType)
  ) {
    return 'inspection_report';
  }
  return 'property_report';
}

async function publishCompletedReportToPlatform(
  env: Env,
  report: ReportData,
  storageKey: string
): Promise<void> {
  const context = report.integrationContext;
  if (!context) return;

  const ingestUrl = env.PROINSPECT_INGEST_URL?.trim();
  const ingestToken = env.PROINSPECT_INGEST_TOKEN?.trim();
  if (!ingestUrl || !ingestToken) {
    throw new HttpError(
      503,
      'ProInspect report publication is not configured.',
      'proinspect-ingest-not-configured'
    );
  }

  const object = await getStoredObject(env, storageKey);
  if (!object) {
    throw new HttpError(503, 'Completed PDF could not be reopened for publication.', 'proinspect-ingest-pdf-missing');
  }

  const safeAddress = (report.details.propertyAddress || 'Property')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const safeType = reportInstanceLabel(report.details)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Report';
  const safeDate = (report.details.inspectionDate || '').replace(/[^0-9-]/g, '');
  const fileName =
    'ProInspect_' +
    safeType +
    '_' +
    safeAddress +
    (safeDate ? '_' + safeDate : '') +
    '.pdf';

  const headers = new Headers({
    'content-type': 'application/pdf',
    'x-report-ingest-token': ingestToken,
    'x-report-source-id': report.id || '',
    'x-property-id': context.propertyId,
    'x-document-title': reportInstanceLabel(report.details),
    'x-file-name': fileName,
    'x-document-category': reportDocumentCategory(report.details.reportType),
    'x-document-audiences': context.audiences.join(','),
  });
  if (context.tenancyId) headers.set('x-tenancy-id', context.tenancyId);
  if (context.bookingId) headers.set('x-booking-id', context.bookingId);
  if (context.workOrderId) headers.set('x-work-order-id', context.workOrderId);

  const response = await fetch(ingestUrl, {
    method: 'POST',
    headers,
    body: object.body,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new HttpError(
      502,
      'Completed report could not be published back to the ProInspect platform.' +
        (message ? ' ' + message.slice(0, 240) : ''),
      'proinspect-ingest-failed'
    );
  }
}

function requireRole(user: AuthenticatedUser, minimum: 'editor' | 'admin'): void {
  const rank: Record<UserRole, number> = { viewer: 0, editor: 1, admin: 2 };
  if (rank[user.role] < rank[minimum]) {
    throw new HttpError(403, 'Your account does not have permission to perform this action.', 'insufficient-role');
  }
}

function securityHeaders(initial?: HeadersInit): Headers {
  const headers = new Headers(initial);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return headers;
}

function unexpectedErrorResponse(error: unknown): Response {
  console.error('Unhandled Worker error:', error);
  const message = error instanceof Error ? error.message : String(error);

  if (/no such table/i.test(message)) {
    return json(
      { error: 'Database schema is not initialized. Apply the D1 migrations before using the application.' },
      503
    );
  }

  if (/D1_ERROR|database/i.test(message)) {
    return json(
      { error: 'Database operation failed. Check Cloudflare Worker/D1 logs for the underlying error.' },
      500
    );
  }

  if (/R2|object storage|bucket/i.test(message)) {
    return json(
      { error: 'File storage operation failed. Check Cloudflare Worker/R2 logs for the underlying error.' },
      500
    );
  }

  return json({ error: 'Unexpected server error.', code: 'unexpected-server-error' }, 500);
}

let cachedJwksDomain = '';
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: securityHeaders({
      'Cache-Control': 'no-store',
    }),
  });
}

function mapProperty(row: PropertyRow) {
  return {
    id: row.id,
    address: row.address,
    reference: row.reference || undefined,
    notes: row.notes || undefined,
    archivedAt: row.archived_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by || undefined,
    updatedBy: row.updated_by || undefined,
  };
}

function parseReport(row: ReportRow): ReportData {
  const parsed = migrateReportData(JSON.parse(row.report_data) as ReportData);
  return {
    ...parsed,
    id: row.id,
    propertyId: row.property_id,
    status: row.status,
    revision: row.revision,
    completedPdfKey: row.completed_pdf_key || undefined,
    supersedesReportId: row.supersedes_report_id || undefined,
    supersededByReportId: row.superseded_by_report_id || undefined,
    supersededAt: row.superseded_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photos: (parsed.photos || []).map((photo) => ({
      ...photo,
      dataUrl: undefined,
      url: `/api/reports/${encodeURIComponent(row.id)}/photos/${encodeURIComponent(photo.id)}`,
    })),
  };
}

function storageReportType(reportType: ReportType): ReportType {
  return reportType;
}

function reportSummary(row: ReportRow) {
  const report = JSON.parse(row.report_data) as ReportData;
  return {
    id: row.id,
    propertyId: row.property_id,
    reportType: report.details?.reportType || row.report_type,
    title: report.details ? reportInstanceLabel(report.details) : undefined,
    status: row.status,
    revision: row.revision,
    inspectionDate: report.details?.inspectionDate || '',
    completedPdfKey: row.completed_pdf_key || undefined,
    supersedesReportId: row.supersedes_report_id || undefined,
    supersededByReportId: row.superseded_by_report_id || undefined,
    supersededAt: row.superseded_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by || undefined,
    updatedBy: row.updated_by || undefined,
  };
}

async function authenticate(request: Request, env: Env): Promise<AuthenticatedUser> {
  const hostname = new URL(request.url).hostname;
  if ((hostname === 'localhost' || hostname === '127.0.0.1') && env.DEV_USER_EMAIL) {
    return {
      email: env.DEV_USER_EMAIL,
      role: normalizeRole(env.DEV_USER_ROLE) || 'admin',
    };
  }

  if (!env.TEAM_DOMAIN || !env.POLICY_AUD) {
    throw new HttpError(503, 'Cloudflare Access is not configured for this deployment.');
  }

  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) {
    throw new HttpError(401, 'Cloudflare Access authentication is required.');
  }

  const issuer = env.TEAM_DOMAIN.replace(/\/$/, '');
  if (!cachedJwks || cachedJwksDomain !== issuer) {
    cachedJwksDomain = issuer;
    cachedJwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  }

  try {
    const { payload } = await jwtVerify(token, cachedJwks, {
      issuer,
      audience: env.POLICY_AUD,
    });
    const email = typeof payload.email === 'string' ? payload.email : undefined;
    if (!email) throw new Error('Access token does not include an email address.');
    return { email, role: resolveRole(email, env) };
  } catch {
    throw new HttpError(403, 'Cloudflare Access token validation failed.');
  }
}

async function getPropertyRow(env: Env, id: string): Promise<PropertyRow> {
  const row = await env.DB.prepare('SELECT * FROM properties WHERE id = ?').bind(id).first<PropertyRow>();
  if (!row) throw new HttpError(404, 'Property not found.');
  return row;
}

async function getReportRow(env: Env, id: string): Promise<ReportRow> {
  const row = await env.DB.prepare('SELECT * FROM reports WHERE id = ?').bind(id).first<ReportRow>();
  if (!row) throw new HttpError(404, 'Report not found.');
  return row;
}

async function updateReportData(
  env: Env,
  row: ReportRow,
  report: ReportData,
  userEmail: string,
  expectedRevision: number,
  status: ReportStatus = row.status,
  completedPdfKey: string | null = row.completed_pdf_key
): Promise<ReportData> {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw new HttpError(400, 'A valid report revision is required.', 'report-revision-required');
  }

  const now = new Date().toISOString();
  const nextRevision = expectedRevision + 1;
  const stored: ReportData = {
    ...migrateReportData(report),
    schemaVersion: CURRENT_REPORT_SCHEMA_VERSION,
    id: row.id,
    propertyId: row.property_id,
    status,
    revision: nextRevision,
    completedPdfKey: completedPdfKey || undefined,
    supersedesReportId: row.supersedes_report_id || undefined,
    supersededByReportId: row.superseded_by_report_id || undefined,
    supersededAt: row.superseded_at || undefined,
    createdAt: row.created_at,
    updatedAt: now,
    photos: (report.photos || []).map((photo) => ({
      ...photo,
      dataUrl: undefined,
      url: undefined,
    })),
  };

  const result = await env.DB.prepare(
    `UPDATE reports
     SET report_type = ?, status = ?, revision = ?, report_data = ?, completed_pdf_key = ?, updated_at = ?, updated_by = ?
     WHERE id = ? AND revision = ? AND status = ?`
  )
    .bind(
      storageReportType(stored.details.reportType),
      status,
      nextRevision,
      JSON.stringify(stored),
      completedPdfKey,
      now,
      userEmail,
      row.id,
      expectedRevision,
      row.status
    )
    .run();

  if ((result.meta?.changes || 0) !== 1) {
    throw new HttpError(
      409,
      'This report changed in another browser or device. Resolve the conflict before continuing.',
      'report-revision-conflict',
      { expectedRevision }
    );
  }

  return parseReport(await getReportRow(env, row.id));
}

function recoveryKey(key: string): string {
  return key.startsWith('reports/') ? `recovery/${key}` : `recovery/${key}`;
}

async function getStoredObject(env: Env, key: string): Promise<R2ObjectBody | null> {
  const primary = await env.REPORT_STORAGE.get(key);
  if (primary) return primary;
  return env.REPORT_RECOVERY_STORAGE.get(recoveryKey(key));
}

async function deleteStoragePair(env: Env, key: string): Promise<void> {
  await Promise.all([
    env.REPORT_STORAGE.delete(key),
    env.REPORT_RECOVERY_STORAGE.delete(recoveryKey(key)),
  ]);
}

// Wait for both writes to settle before cleanup so a late write cannot recreate an orphan.
async function mirrorWrites(env: Env, key: string, writes: Promise<R2Object | null>[]): Promise<(R2Object | null)[]> {
  const results = await Promise.allSettled(writes);
  if (results.some((result) => result.status === 'rejected' || !result.value)) {
    await deleteStoragePair(env, key).catch(() => undefined);
    throw new HttpError(503, 'The file could not be saved to both storage copies. Retry the operation.', 'storage-mirror-failed');
  }
  return results.map((result) => result.status === 'fulfilled' ? result.value : null);
}

async function deleteObjectPrefix(bucket: R2Bucket, prefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix, cursor, limit: 1000 });
    const keys = listed.objects.map((object) => object.key);
    if (keys.length) await bucket.delete(keys);
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

async function deleteReportObjects(env: Env, reportId: string): Promise<void> {
  await Promise.all([
    deleteObjectPrefix(env.REPORT_STORAGE, `reports/${reportId}/`),
    deleteObjectPrefix(env.REPORT_RECOVERY_STORAGE, `recovery/reports/${reportId}/`),
  ]);
}


async function findDuplicateProperty(env: Env, address: string, excludeId?: string): Promise<PropertyRow | null> {
  const sql = excludeId
    ? 'SELECT * FROM properties WHERE lower(trim(address)) = lower(trim(?)) AND id <> ? LIMIT 1'
    : 'SELECT * FROM properties WHERE lower(trim(address)) = lower(trim(?)) LIMIT 1';
  return excludeId
    ? env.DB.prepare(sql).bind(address, excludeId).first<PropertyRow>()
    : env.DB.prepare(sql).bind(address).first<PropertyRow>();
}

async function copyPhotoForReport(
  env: Env,
  sourcePhoto: ReportPhoto,
  sourceReport: ReportData,
  newReportId: string,
  userEmail: string
): Promise<ReportPhoto> {
  const sourceStoredPhoto = sourceReport.photos.find((photo) => photo.id === sourcePhoto.id);
  const sourceKey = sourceStoredPhoto?.storageKey;
  if (!sourceStoredPhoto || (sourcePhoto.storageKey && sourcePhoto.storageKey !== sourceKey)) {
    throw new HttpError(409, 'Reload the source report before copying its stored photos.', 'photo-manifest-conflict');
  }
  if (!sourceKey) {
    return { ...sourcePhoto, dataUrl: undefined, url: undefined, storageKey: undefined };
  }

  const sourceObject = await getStoredObject(env, sourceKey);
  if (!sourceObject) {
    throw new HttpError(
      409,
      'A stored photo could not be copied for the replacement draft.',
      'photo-storage-missing',
      { photoId: sourcePhoto.id }
    );
  }

  const bytes = await sourceObject.arrayBuffer();
  const newKey = 'reports/' + newReportId + '/photos/' + sourcePhoto.id + '.jpg';
  const metadata = {
    httpMetadata: { contentType: 'image/jpeg' },
    customMetadata: { reportId: newReportId, photoId: sourcePhoto.id, uploadedBy: userEmail },
  };

  await mirrorWrites(env, newKey, [
    env.REPORT_STORAGE.put(newKey, bytes, metadata),
    env.REPORT_RECOVERY_STORAGE.put(recoveryKey(newKey), bytes, metadata),
  ]);

  return { ...sourcePhoto, dataUrl: undefined, url: undefined, storageKey: newKey };
}

async function createClonedDraft(
  env: Env,
  sourceRow: ReportRow,
  sourceSnapshot: ReportData,
  userEmail: string,
  supersedesReportId?: string
): Promise<ReportData> {
  if (!isReportType(sourceSnapshot.details?.reportType)) {
    throw new HttpError(400, 'The source report contains an unknown report type.', 'unknown-report-type');
  }

  const newId = crypto.randomUUID();
  const now = new Date().toISOString();
  const sourceCloud = parseReport(sourceRow);
  const copiedPhotos: ReportPhoto[] = [];

  try {
    for (const photo of sourceSnapshot.photos || []) {
      copiedPhotos.push(await copyPhotoForReport(env, photo, sourceCloud, newId, userEmail));
    }

    const draft: ReportData = {
      ...migrateReportData(sourceSnapshot),
      id: newId,
      propertyId: sourceRow.property_id,
      status: 'draft',
      revision: 1,
      completedPdfKey: undefined,
      supersedesReportId,
      supersededByReportId: undefined,
      supersededAt: undefined,
      createdAt: now,
      updatedAt: now,
      photos: copiedPhotos,
    };

    await env.DB.prepare(
      'INSERT INTO reports (id, property_id, report_type, status, revision, report_data, completed_pdf_key, supersedes_report_id, superseded_by_report_id, superseded_at, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, ?, ?, ?, ?)'
    )
      .bind(
        newId,
        sourceRow.property_id,
        storageReportType(draft.details.reportType),
        'draft',
        1,
        JSON.stringify(draft),
        supersedesReportId || null,
        now,
        now,
        userEmail,
        userEmail
      )
      .run();

    return parseReport(await getReportRow(env, newId));
  } catch (error) {
    await deleteReportObjects(env, newId).catch(() => undefined);
    throw error;
  }
}

async function ensureCorrectionSourceSuperseded(
  env: Env,
  replacementRow: ReportRow,
  userEmail: string
): Promise<void> {
  if (!replacementRow.supersedes_report_id) return;

  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    "UPDATE reports SET status = 'superseded', superseded_at = COALESCE(superseded_at, ?), updated_at = ?, updated_by = ? WHERE id = ? AND status = 'completed' AND superseded_by_report_id = ?"
  )
    .bind(now, now, userEmail, replacementRow.supersedes_report_id, replacementRow.id)
    .run();

  if ((result.meta?.changes || 0) === 1) return;

  const original = await getReportRow(env, replacementRow.supersedes_report_id);
  if (original.status === 'superseded' && original.superseded_by_report_id === replacementRow.id) {
    return;
  }

  throw new HttpError(
    409,
    'The replacement report is complete, but the original report could not yet be marked as superseded. Retry finalisation to complete the correction link.',
    'correction-source-update-pending'
  );
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
      throw new HttpError(403, 'Cross-origin mutations are not permitted.', 'invalid-origin');
    }
  }
  const user = await authenticate(request, env);
  const userEmail = user.email;
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

  if (request.method === 'GET' && url.pathname === '/api/me') {
    return json(user);
  }

  if (
    request.method === 'GET' &&
    url.pathname === '/api/integrations/proinspect/handoff'
  ) {
    requireRole(user, 'editor');
    const token = url.searchParams.get('token') || '';
    if (!token) {
      throw new HttpError(400, 'ProInspect handoff token is required.', 'invalid-proinspect-handoff');
    }
    return json(await verifyProInspectHandoffToken(token, env));
  }


  if (parts[1] === 'properties') {
    if (parts.length === 2 && request.method === 'GET') {
      const includeArchived = url.searchParams.get('includeArchived') === 'true' && user.role === 'admin';
      const result = includeArchived
        ? await env.DB.prepare('SELECT * FROM properties ORDER BY archived_at IS NOT NULL, updated_at DESC').all<PropertyRow>()
        : await env.DB.prepare('SELECT * FROM properties WHERE archived_at IS NULL ORDER BY updated_at DESC').all<PropertyRow>();
      return json((result.results || []).map(mapProperty));
    }

    if (parts.length === 2 && request.method === 'POST') {
      requireRole(user, 'editor');
      const body = await request.json() as { address?: string; reference?: string; notes?: string; allowDuplicate?: boolean };
      const address = body.address?.trim();
      if (!address) throw new HttpError(400, 'Property address is required.', 'property-address-required');

      const duplicate = await findDuplicateProperty(env, address);
      if (duplicate && !body.allowDuplicate) {
        throw new HttpError(
          409,
          'A property already exists at "' + duplicate.address + '". Open the existing property or explicitly confirm that a duplicate container is required.',
          'duplicate-property',
          { propertyId: duplicate.id, archived: Boolean(duplicate.archived_at) }
        );
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare(
        'INSERT INTO properties (id, address, reference, notes, archived_at, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)'
      )
        .bind(id, address, body.reference?.trim() || null, body.notes?.trim() || null, now, now, userEmail, userEmail)
        .run();

      return json(mapProperty({
        id,
        address,
        reference: body.reference?.trim() || null,
        notes: body.notes?.trim() || null,
        archived_at: null,
        created_at: now,
        updated_at: now,
        created_by: userEmail,
        updated_by: userEmail,
      }), 201);
    }

    if (parts.length === 3) {
      const propertyId = parts[2];
      if (request.method === 'GET') {
        const property = await getPropertyRow(env, propertyId);
        const reports = await env.DB.prepare(
          'SELECT * FROM reports WHERE property_id = ? ORDER BY updated_at DESC'
        ).bind(propertyId).all<ReportRow>();
        return json({ property: mapProperty(property), reports: (reports.results || []).map(reportSummary) });
      }

      if (request.method === 'PUT') {
        requireRole(user, 'editor');
        await getPropertyRow(env, propertyId);
        const body = await request.json() as { address?: string; reference?: string; notes?: string; allowDuplicate?: boolean };
        const address = body.address?.trim();
        if (!address) throw new HttpError(400, 'Property address is required.', 'property-address-required');

        const duplicate = await findDuplicateProperty(env, address, propertyId);
        if (duplicate && !body.allowDuplicate) {
          throw new HttpError(
            409,
            'Another property already exists at "' + duplicate.address + '". Confirm the duplicate address before saving.',
            'duplicate-property',
            { propertyId: duplicate.id, archived: Boolean(duplicate.archived_at) }
          );
        }

        const now = new Date().toISOString();
        await env.DB.prepare(
          'UPDATE properties SET address = ?, reference = ?, notes = ?, updated_at = ?, updated_by = ? WHERE id = ?'
        )
          .bind(address, body.reference?.trim() || null, body.notes?.trim() || null, now, userEmail, propertyId)
          .run();
        return json(mapProperty(await getPropertyRow(env, propertyId)));
      }
    }

    if (parts.length === 4 && (parts[3] === 'archive' || parts[3] === 'restore') && request.method === 'POST') {
      requireRole(user, 'admin');
      const propertyId = parts[2];
      await getPropertyRow(env, propertyId);
      const archivedAt = parts[3] === 'archive' ? new Date().toISOString() : null;
      const now = new Date().toISOString();
      await env.DB.prepare(
        'UPDATE properties SET archived_at = ?, updated_at = ?, updated_by = ? WHERE id = ?'
      ).bind(archivedAt, now, userEmail, propertyId).run();
      return json(mapProperty(await getPropertyRow(env, propertyId)));
    }

    if (parts.length === 4 && parts[3] === 'reports' && request.method === 'POST') {
      requireRole(user, 'editor');
      const propertyId = parts[2];
      const property = await getPropertyRow(env, propertyId);
      if (property.archived_at) {
        throw new HttpError(409, 'Restore this archived property before creating a report.', 'property-archived');
      }

      const body = await request.json() as { reportType?: unknown; report?: ReportData };
      if (!body.report || !isReportType(body.reportType)) {
        throw new HttpError(400, 'A valid report type and report data are required.', 'invalid-report');
      }

      const id = body.report.id || crypto.randomUUID();
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
        throw new HttpError(400, 'Invalid report identifier.', 'invalid-report-id');
      }
      const now = new Date().toISOString();
      const report: ReportData = {
        ...migrateReportData(body.report),
        id,
        propertyId,
        status: 'draft',
        revision: 1,
        completedPdfKey: undefined,
        supersedesReportId: undefined,
        supersededByReportId: undefined,
        supersededAt: undefined,
        createdAt: now,
        updatedAt: now,
        details: { ...body.report.details, reportType: body.reportType, propertyAddress: property.address },
        photos: [],
      };

      await env.DB.prepare(
        'INSERT INTO reports (id, property_id, report_type, status, revision, report_data, completed_pdf_key, supersedes_report_id, superseded_by_report_id, superseded_at, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?)'
      )
        .bind(id, propertyId, storageReportType(body.reportType), 'draft', 1, JSON.stringify(report), now, now, userEmail, userEmail)
        .run();

      return json(parseReport(await getReportRow(env, id)), 201);
    }
  }

  if (parts[1] === 'reports' && parts[2]) {
    const reportId = parts[2];

    if (parts.length === 3 && request.method === 'GET') {
      return json(parseReport(await getReportRow(env, reportId)));
    }

    if (parts.length === 3 && request.method === 'PUT') {
      requireRole(user, 'editor');
      const row = await getReportRow(env, reportId);
      if (row.status !== 'draft') throw new HttpError(409, 'Only draft reports can be edited.', 'report-immutable');

      const body = await request.json() as { report?: ReportData; expectedRevision?: number };
      if (!body.report) throw new HttpError(400, 'Report data is required.', 'report-data-required');
      if (!isReportType(body.report.details?.reportType)) {
        throw new HttpError(400, 'The report contains an unknown report type.', 'unknown-report-type');
      }

      const current = parseReport(row);
      if (body.report.details.reportType !== current.details.reportType) {
        throw new HttpError(409, 'The report type cannot be changed after the report has been created.', 'report-type-immutable');
      }

      if (Number(body.expectedRevision) !== row.revision) {
        throw new HttpError(409, 'Reload the latest report before saving.', 'report-revision-conflict');
      }
      const incoming = body.report.photos;
      const ids = new Set((incoming || []).map((photo) => photo.id));
      if (!Array.isArray(incoming) || incoming.length !== current.photos.length || ids.size !== incoming.length ||
          current.photos.some((photo) => !ids.has(photo.id))) {
        throw new HttpError(409, 'Use the photo upload/delete workflow to change the photo manifest.', 'photo-manifest-conflict');
      }
      const photos = incoming.map((photo) => {
        const stored = current.photos.find((item) => item.id === photo.id)!;
        if (photo.storageKey && photo.storageKey !== stored.storageKey) {
          throw new HttpError(400, 'Stored photo references cannot be changed by the browser.', 'photo-storage-invalid');
        }
        return { ...photo, storageKey: stored.storageKey, url: undefined, dataUrl: undefined };
      });
      return json(await updateReportData(env, row, { ...body.report, photos }, userEmail, Number(body.expectedRevision)));
    }

    if (parts.length === 3 && request.method === 'DELETE') {
      requireRole(user, 'editor');
      const row = await getReportRow(env, reportId);
      if (row.status !== 'draft') throw new HttpError(409, 'Completed or superseded reports cannot be deleted.', 'report-immutable');

      const expectedRevision = Number(url.searchParams.get('expectedRevision'));
      if (!Number.isInteger(expectedRevision) || expectedRevision !== row.revision) {
        throw new HttpError(409, 'This draft changed before it could be deleted. Reload it first.', 'report-revision-conflict');
      }

      const result = await env.DB.prepare(
        'DELETE FROM reports WHERE id = ? AND revision = ? AND status = ?'
      ).bind(reportId, expectedRevision, 'draft').run();

      if ((result.meta?.changes || 0) !== 1) {
        throw new HttpError(409, 'This draft changed before it could be deleted. Reload it first.', 'report-revision-conflict');
      }

      if (row.supersedes_report_id) {
        await env.DB.prepare(
          "UPDATE reports SET superseded_by_report_id = NULL, updated_at = ?, updated_by = ? WHERE id = ? AND superseded_by_report_id = ? AND status = 'completed'"
        ).bind(new Date().toISOString(), userEmail, row.supersedes_report_id, reportId).run();
      }

      try {
        await deleteReportObjects(env, reportId);
      } catch (error) {
        console.error('Draft report deleted from D1 but R2 cleanup failed:', error);
      }
      return json({ success: true });
    }

    if (parts.length === 4 && parts[3] === 'clone' && request.method === 'POST') {
      requireRole(user, 'editor');
      const sourceRow = await getReportRow(env, reportId);
      const body = await request.json() as { report?: ReportData };
      if (!body.report) throw new HttpError(400, 'Local draft data is required.', 'report-data-required');
      if (body.report.details?.reportType !== parseReport(sourceRow).details.reportType) {
        throw new HttpError(409, 'A conflict copy must keep the original report type.', 'report-type-immutable');
      }
      return json(await createClonedDraft(env, sourceRow, body.report, userEmail), 201);
    }

    if (parts.length === 4 && parts[3] === 'correction' && request.method === 'POST') {
      requireRole(user, 'editor');
      const sourceRow = await getReportRow(env, reportId);
      if (sourceRow.status !== 'completed') {
        throw new HttpError(409, 'Only a completed report can be corrected.', 'correction-source-invalid');
      }
      if (sourceRow.superseded_by_report_id) {
        throw new HttpError(
          409,
          'A correction has already been created for this report.',
          'correction-already-exists',
          { replacementReportId: sourceRow.superseded_by_report_id }
        );
      }

      const sourceReport = parseReport(sourceRow);
      const draft = await createClonedDraft(env, sourceRow, sourceReport, userEmail, sourceRow.id);
      const reserve = await env.DB.prepare(
        "UPDATE reports SET superseded_by_report_id = ?, updated_at = ?, updated_by = ? WHERE id = ? AND status = 'completed' AND superseded_by_report_id IS NULL"
      ).bind(draft.id, new Date().toISOString(), userEmail, sourceRow.id).run();

      if ((reserve.meta?.changes || 0) !== 1) {
        await env.DB.prepare('DELETE FROM reports WHERE id = ?').bind(draft.id).run().catch(() => undefined);
        await deleteReportObjects(env, draft.id!).catch(() => undefined);
        throw new HttpError(409, 'Another correction was created at the same time. Refresh the property.', 'correction-already-exists');
      }

      return json(draft, 201);
    }

    if (parts.length === 4 && parts[3] === 'photos' && request.method === 'POST') {
      requireRole(user, 'editor');
      const row = await getReportRow(env, reportId);
      if (row.status !== 'draft') throw new HttpError(409, 'Only draft reports can be edited.', 'report-immutable');

      const form = await request.formData();
      const file = form.get('file');
      const photoId = String(form.get('photoId') || '').trim();
      const name = String(form.get('name') || '').trim();
      const areaName = String(form.get('areaName') || 'General').trim();
      const areaId = String(form.get('areaId') || '').trim() || undefined;
      const itemId = String(form.get('itemId') || '').trim() || undefined;
      const itemName = String(form.get('itemName') || '').trim() || undefined;
      const photoIndex = Number(form.get('photoIndex') || '0');
      const isCover = String(form.get('isCover') || 'false') === 'true';
      const expectedRevision = Number(form.get('expectedRevision'));

      if (!(file instanceof File) || !/^[A-Za-z0-9_-]{1,128}$/.test(photoId) || !name) {
        throw new HttpError(400, 'Photo file and metadata are required.', 'photo-data-required');
      }
      if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
        throw new HttpError(400, 'A valid report revision is required for photo uploads.', 'report-revision-required');
      }
      if (expectedRevision !== row.revision) {
        throw new HttpError(409, 'Reload the latest report before uploading photos.', 'report-revision-conflict');
      }
      if (file.type !== 'image/jpeg') throw new HttpError(400, 'Upload a processed JPEG image.', 'invalid-photo-type');
      if (file.size > 5 * 1024 * 1024) throw new HttpError(413, 'Processed image exceeds the 5 MB upload limit.', 'photo-too-large');

      const report = parseReport(row);
      const targetArea = areaId
        ? report.areas.find((area) => area.id === areaId)
        : report.areas.find((area) => normalizeAreaName(area.name) === normalizeAreaName(areaName));

      if (!targetArea) {
        throw new HttpError(400, 'The selected report area no longer exists.', 'photo-area-missing');
      }

      const linkedItem = itemId ? targetArea.items.find((item) => item.id === itemId) : undefined;
      if (itemId && !linkedItem) {
        throw new HttpError(400, 'The selected reporting item does not belong to the selected report category.', 'photo-item-invalid');
      }
      if (isBuildingManagementTemplate(report.details.reportType) && !linkedItem) {
        throw new HttpError(400, 'Building Manager photos must be linked to a reporting item.', 'building-photo-item-required');
      }

      const key = 'reports/' + reportId + '/photos/' + photoId + '/' + crypto.randomUUID() + '.jpg';
      const bytes = await file.arrayBuffer();
      const signature = new Uint8Array(bytes, 0, Math.min(3, bytes.byteLength));
      if (signature.length < 3 || signature[0] !== 255 || signature[1] !== 216 || signature[2] !== 255) {
        throw new HttpError(400, 'The uploaded file is not a JPEG image.', 'invalid-photo-type');
      }
      const metadata = {
        httpMetadata: { contentType: 'image/jpeg' },
        customMetadata: { reportId, photoId, uploadedBy: userEmail },
      };

      await mirrorWrites(env, key, [
        env.REPORT_STORAGE.put(key, bytes, metadata),
        env.REPORT_RECOVERY_STORAGE.put(recoveryKey(key), bytes, metadata),
      ]);

      const photos = (report.photos || []).filter((photo) => photo.id !== photoId);
      const photo: ReportPhoto = {
        id: photoId,
        name,
        areaName: targetArea.name,
        areaId: targetArea.id,
        itemId: linkedItem?.id || itemId,
        itemName: linkedItem?.name || itemName,
        photoIndex: Number.isFinite(photoIndex) ? photoIndex : photos.length + 1,
        isCover,
        storageKey: key,
      };
      const updatedPhotos = isCover
        ? [...photos.map((item) => ({ ...item, isCover: false })), photo]
        : [...photos, photo];

      try {
        const saved = await updateReportData(env, row, { ...report, photos: updatedPhotos }, userEmail, expectedRevision);
        const replaced = report.photos.find((item) => item.id === photoId)?.storageKey;
        if (replaced && replaced !== key) await deleteStoragePair(env, replaced).catch(() => undefined);
        return json(saved);
      } catch (error) {
        await deleteStoragePair(env, key).catch(() => undefined);
        throw error;
      }
    }

    if (parts.length === 5 && parts[3] === 'photos') {
      const photoId = parts[4];
      const row = await getReportRow(env, reportId);
      const report = parseReport(row);
      const photo = report.photos.find((item) => item.id === photoId);

      if (request.method === 'GET') {
        if (!photo?.storageKey) throw new HttpError(404, 'Photo not found.', 'photo-not-found');
        const object = await getStoredObject(env, photo.storageKey);
        if (!object) throw new HttpError(404, 'Photo not found in primary or recovery storage.', 'photo-not-found');
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('ETag', object.httpEtag);
        headers.set('Cache-Control', 'private, no-store');
        return new Response(object.body, { headers: securityHeaders(headers) });
      }

      if (request.method === 'DELETE') {
        requireRole(user, 'editor');
        if (row.status !== 'draft') throw new HttpError(409, 'Only draft reports can be edited.', 'report-immutable');

        const expectedRevision = Number(url.searchParams.get('expectedRevision'));
        const updated = { ...report, photos: report.photos.filter((item) => item.id !== photoId) };
        const saved = await updateReportData(env, row, updated, userEmail, expectedRevision);
        if (photo?.storageKey) {
          await deleteStoragePair(env, photo.storageKey).catch((error) => {
            console.error('Photo removed from report data but R2 cleanup failed:', error);
          });
        }
        return json(saved);
      }
    }

    if (parts.length === 4 && parts[3] === 'complete' && request.method === 'POST') {
      requireRole(user, 'editor');
      const row = await getReportRow(env, reportId);
      if (row.status !== 'draft') {
        if (row.status === 'completed') {
          await ensureCorrectionSourceSuperseded(env, row, userEmail);
          const completedReport = parseReport(await getReportRow(env, reportId));
          if (completedReport.integrationContext && row.completed_pdf_key) {
            await publishCompletedReportToPlatform(
              env,
              completedReport,
              row.completed_pdf_key
            );
          }
          return json(completedReport);
        }
        if (row.status === 'superseded') return json(parseReport(row));
        throw new HttpError(409, 'Only draft reports can be finalised.', 'report-immutable');
      }

      const expectedRevision = Number(url.searchParams.get('expectedRevision'));
      if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
        throw new HttpError(400, 'A valid report revision is required for finalisation.', 'report-revision-required');
      }
      if (row.revision !== expectedRevision) {
        throw new HttpError(
          409,
          'This report changed after the PDF was prepared. Reload the latest version and generate the PDF again.',
          'report-revision-conflict'
        );
      }

      if (request.headers.get('content-type')?.split(';')[0] !== 'application/pdf') {
        throw new HttpError(400, 'A PDF document is required.', 'invalid-pdf');
      }

      const maxPdfBytes = 90 * 1024 * 1024;
      const declaredLength = Number(request.headers.get('content-length') || 0);
      if (Number.isFinite(declaredLength) && declaredLength > maxPdfBytes) {
        throw new HttpError(413, 'PDF exceeds the 90 MB storage limit.', 'pdf-too-large');
      }
      if (!request.body) throw new HttpError(400, 'PDF is empty.', 'invalid-pdf');

      const report = parseReport(row);
      const validationIssues = validateReportForFinalization(report);
      if (validationIssues.length > 0) {
        throw new HttpError(
          409,
          reportValidationMessage(validationIssues, 'Report cannot be finalised'),
          'report-validation-failed'
        );
      }

      if (row.supersedes_report_id) {
        const original = await getReportRow(env, row.supersedes_report_id);
        if (original.status !== 'completed' || original.superseded_by_report_id !== row.id) {
          throw new HttpError(
            409,
            'The original report is no longer available for this correction. Refresh the property before continuing.',
            'correction-source-invalid'
          );
        }
      }

      const key = 'reports/' + reportId + '/completed/' + crypto.randomUUID() + '.pdf';
      const streams = request.body.tee();
      const metadata = {
        httpMetadata: { contentType: 'application/pdf' },
        customMetadata: { reportId, completedBy: userEmail, revision: String(expectedRevision) },
      };

      const results = await mirrorWrites(env, key, [
        env.REPORT_STORAGE.put(key, streams[0], metadata),
        env.REPORT_RECOVERY_STORAGE.put(recoveryKey(key), streams[1], metadata),
      ]);
      const stored = results[0];
      const recoveryStored = results[1];

      if (!stored || stored.size <= 0 || !recoveryStored || recoveryStored.size <= 0) {
        await deleteStoragePair(env, key).catch(() => undefined);
        throw new HttpError(400, 'PDF is empty or could not be mirrored to recovery storage.', 'invalid-pdf');
      }
      if (stored.size > maxPdfBytes || recoveryStored.size > maxPdfBytes) {
        await deleteStoragePair(env, key).catch(() => undefined);
        throw new HttpError(413, 'PDF exceeds the 90 MB storage limit.', 'pdf-too-large');
      }

      let completed: ReportData;
      try {
        // Read only the PDF signature before immutable publication. MIME labels
        // alone do not validate uploaded bytes; keep large uploads streaming.
        const prefix = await env.REPORT_STORAGE.get(key, { range: { offset: 0, length: 5 } });
        if (!prefix || await prefix.text() !== '%PDF-') {
          throw new HttpError(400, 'Uploaded content is not a PDF document.', 'invalid-pdf');
        }

        // Complete the Report Tool's compare-and-set transition first. This
        // guarantees that the PDF published to ProInspect is the exact
        // immutable revision that won finalisation, rather than a stale PDF
        // from a draft that lost a concurrent write race.
        completed = await updateReportData(
          env,
          row,
          report,
          userEmail,
          expectedRevision,
          'completed',
          key
        );
      } catch (error) {
        await deleteStoragePair(env, key).catch(() => undefined);
        throw error;
      }

      const completedRow = await getReportRow(env, reportId);
      await ensureCorrectionSourceSuperseded(env, completedRow, userEmail);

      // Platform publication is server-to-server and idempotent by Report Tool
      // report ID. If it fails, the immutable PDF remains safely stored; a
      // retry of this same finalisation endpoint republishes the completed PDF
      // without creating a second canonical property document.
      if (completed.integrationContext && completedRow.completed_pdf_key) {
        await publishCompletedReportToPlatform(
          env,
          completed,
          completedRow.completed_pdf_key
        );
      }

      return json(completed);
    }

    if (parts.length === 4 && parts[3] === 'pdf' && request.method === 'GET') {
      const row = await getReportRow(env, reportId);
      if (!row.completed_pdf_key) throw new HttpError(404, 'Completed PDF not found.', 'pdf-not-found');
      const object = await getStoredObject(env, row.completed_pdf_key);
      if (!object) throw new HttpError(404, 'Completed PDF not found in primary or recovery storage.', 'pdf-not-found');

      const report = parseReport(row);
      const safeAddress = (report.details.propertyAddress || 'Property')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      const safeType = reportInstanceLabel(report.details)
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'Report';
      const safeDate = (report.details.inspectionDate || '').replace(/[^0-9-]/g, '');
      const filename = 'ProInspect_' + safeType + '_' + safeAddress + (safeDate ? '_' + safeDate : '') + '.pdf';
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('Content-Disposition', 'attachment; filename="' + filename + '"');
      headers.set('Cache-Control', 'private, no-store');
      return new Response(object.body, { headers: securityHeaders(headers) });
    }
  }

  throw new HttpError(404, 'API route not found.', 'route-not-found');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith('/api/')) {
        return new Response('Not found', { status: 404, headers: securityHeaders() });
      }
      return await handleApi(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message, code: error.code, details: error.details }, error.status);
      }
      return unexpectedErrorResponse(error);
    }
  },
} satisfies ExportedHandler<Env>;
