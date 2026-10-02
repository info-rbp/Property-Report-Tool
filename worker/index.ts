import { createRemoteJWKSet, jwtVerify } from 'jose';
import { isBuildingManagementTemplate, reportInstanceLabel } from '../src/data/reportCatalogue';
import { normalizeAreaName } from '../src/lib/reportFormatting';
import { migrateReportData } from '../src/lib/reportMigration';
import { reportValidationMessage, validateReportForFinalization } from '../src/lib/reportValidation';
import { CURRENT_REPORT_SCHEMA_VERSION, isReportType } from '../src/types/report';
import type { ReportData, ReportPhoto, ReportStatus, ReportType } from '../src/types/report';
import { handlePublicWorkflowApi, handleWorkflowApi } from './workflowPlatform';

interface Env {
  DB: D1Database;
  REPORT_STORAGE: R2Bucket;
  TEAM_DOMAIN?: string;
  POLICY_AUD?: string;
  DEV_USER_EMAIL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  SIGNING_BASE_URL?: string;
}

interface PropertyRow {
  id: string;
  address: string;
  reference: string | null;
  notes: string | null;
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
  report_data: string;
  completed_pdf_key: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
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

  return json({ error: 'Unexpected server error.' }, 500);
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
    completedPdfKey: row.completed_pdf_key || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    details: {
      ...parsed.details,
      coverPhotoUrl: parsed.details.coverPhotoStorageKey
        ? `/api/reports/${encodeURIComponent(row.id)}/cover`
        : parsed.details.coverPhotoUrl,
    },
    photos: (parsed.photos || []).map((photo) => ({
      ...photo,
      dataUrl: undefined,
      url: `/api/reports/${encodeURIComponent(row.id)}/photos/${encodeURIComponent(photo.id)}`,
    })),
  };
}

function storageReportType(reportType: ReportType): 'Entry' | 'Routine' | 'Exit' {
  if (reportType === 'Entry') return 'Entry';
  if (reportType === 'Exit') return 'Exit';
  // The initial D1 schema constrains report_type to Entry/Routine/Exit. All extended
  // report types retain their canonical type in report_data and use Routine as the
  // compatibility value for this legacy indexed column.
  return 'Routine';
}

function reportSummary(row: ReportRow) {
  const report = JSON.parse(row.report_data) as ReportData;
  return {
    id: row.id,
    propertyId: row.property_id,
    reportType: report.details?.reportType || row.report_type,
    title: report.details ? reportInstanceLabel(report.details) : undefined,
    status: row.status,
    inspectionDate: report.details?.inspectionDate || '',
    completedPdfKey: row.completed_pdf_key || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by || undefined,
    updatedBy: row.updated_by || undefined,
  };
}

async function authenticate(request: Request, env: Env): Promise<string> {
  const hostname = new URL(request.url).hostname;
  if ((hostname === 'localhost' || hostname === '127.0.0.1') && env.DEV_USER_EMAIL) {
    return env.DEV_USER_EMAIL;
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
    return email;
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
  status: ReportStatus = row.status,
  completedPdfKey: string | null = row.completed_pdf_key
): Promise<ReportData> {
  const now = new Date().toISOString();
  const stored: ReportData = {
    ...migrateReportData(report),
    schemaVersion: CURRENT_REPORT_SCHEMA_VERSION,
    id: row.id,
    propertyId: row.property_id,
    status,
    completedPdfKey: completedPdfKey || undefined,
    createdAt: row.created_at,
    updatedAt: now,
    details: {
      ...report.details,
      coverPhotoUrl: report.details.coverPhotoStorageKey ? undefined : report.details.coverPhotoUrl,
    },
    photos: (report.photos || []).map((photo) => ({
      ...photo,
      dataUrl: undefined,
      url: undefined,
    })),
  };

  const result = await env.DB.prepare(
    `UPDATE reports
     SET report_type = ?, status = ?, report_data = ?, completed_pdf_key = ?, updated_at = ?, updated_by = ?
     WHERE id = ? AND updated_at = ?`
  )
    .bind(
      storageReportType(stored.details.reportType),
      status,
      JSON.stringify(stored),
      completedPdfKey,
      now,
      userEmail,
      row.id,
      row.updated_at
    )
    .run();

  if ((result.meta.changes || 0) !== 1) {
    throw new HttpError(
      409,
      'This report changed in another browser or device before the update completed. Reload the latest cloud version before retrying.'
    );
  }

  return parseReport({
    ...row,
    report_type: storageReportType(stored.details.reportType),
    status,
    report_data: JSON.stringify(stored),
    completed_pdf_key: completedPdfKey,
    updated_at: now,
    updated_by: userEmail,
  });
}

async function deleteReportObjects(env: Env, reportId: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const listed = await env.REPORT_STORAGE.list({
      prefix: `reports/${reportId}/`,
      cursor,
      limit: 1000,
    });
    const keys = listed.objects.map((object) => object.key);
    if (keys.length) await env.REPORT_STORAGE.delete(keys);
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const userEmail = await authenticate(request, env);
  const workflowResponse = await handleWorkflowApi(request, env, userEmail);
  if (workflowResponse) return workflowResponse;

  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

  if (request.method === 'GET' && url.pathname === '/api/me') {
    return json({ email: userEmail });
  }

  if (parts[1] === 'properties') {
    if (parts.length === 2 && request.method === 'GET') {
      const result = await env.DB.prepare('SELECT * FROM properties ORDER BY updated_at DESC').all<PropertyRow>();
      return json((result.results || []).map(mapProperty));
    }

    if (parts.length === 2 && request.method === 'POST') {
      const body = await request.json() as { address?: string; reference?: string; notes?: string };
      const address = body.address?.trim();
      if (!address) throw new HttpError(400, 'Property address is required.');
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO properties (id, address, reference, notes, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(id, address, body.reference?.trim() || null, body.notes?.trim() || null, now, now, userEmail, userEmail)
        .run();
      return json(mapProperty({
        id,
        address,
        reference: body.reference?.trim() || null,
        notes: body.notes?.trim() || null,
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
        return json({
          property: mapProperty(property),
          reports: (reports.results || []).map(reportSummary),
        });
      }

      if (request.method === 'PUT') {
        await getPropertyRow(env, propertyId);
        const body = await request.json() as { address?: string; reference?: string; notes?: string };
        const address = body.address?.trim();
        if (!address) throw new HttpError(400, 'Property address is required.');
        const now = new Date().toISOString();
        await env.DB.prepare(
          'UPDATE properties SET address = ?, reference = ?, notes = ?, updated_at = ?, updated_by = ? WHERE id = ?'
        )
          .bind(address, body.reference?.trim() || null, body.notes?.trim() || null, now, userEmail, propertyId)
          .run();
        const updated = await getPropertyRow(env, propertyId);
        return json(mapProperty(updated));
      }
    }

    if (parts.length === 4 && parts[3] === 'reports' && request.method === 'POST') {
      const propertyId = parts[2];
      const property = await getPropertyRow(env, propertyId);
      const body = await request.json() as { reportType?: unknown; report?: ReportData };
      if (!body.report || !isReportType(body.reportType)) {
        throw new HttpError(400, 'A valid report type and report data are required.');
      }

      const id = body.report.id || crypto.randomUUID();
      const now = new Date().toISOString();
      const report: ReportData = {
        ...body.report,
        id,
        propertyId,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        details: {
          ...body.report.details,
          reportType: body.reportType,
          propertyAddress: property.address,
        },
        photos: [],
      };

      await env.DB.prepare(
        `INSERT INTO reports
         (id, property_id, report_type, status, report_data, completed_pdf_key, created_at, updated_at, created_by, updated_by)
         VALUES (?, ?, ?, 'draft', ?, NULL, ?, ?, ?, ?)`
      )
        .bind(id, propertyId, storageReportType(body.reportType), JSON.stringify(report), now, now, userEmail, userEmail)
        .run();

      return json(report, 201);
    }
  }

  if (parts[1] === 'reports' && parts[2]) {
    const reportId = parts[2];

    if (parts.length === 3 && request.method === 'GET') {
      return json(parseReport(await getReportRow(env, reportId)));
    }

    if (parts.length === 3 && request.method === 'PUT') {
      const row = await getReportRow(env, reportId);
      if (row.status === 'completed') throw new HttpError(409, 'Completed reports cannot be edited.');
      const body = await request.json() as { report?: ReportData; expectedUpdatedAt?: string };
      if (!body.report) throw new HttpError(400, 'Report data is required.');
      if (!isReportType(body.report.details?.reportType)) {
        throw new HttpError(400, 'The report contains an unknown report type.');
      }

      const current = parseReport(row);
      if (body.report.details.reportType !== current.details.reportType) {
        throw new HttpError(409, 'The report type cannot be changed after the report has been created.');
      }

      if (body.expectedUpdatedAt && body.expectedUpdatedAt !== row.updated_at) {
        throw new HttpError(
          409,
          'This draft changed in another browser or device. Reopen the report to load the latest cloud version before continuing.'
        );
      }

      return json(await updateReportData(env, row, body.report, userEmail));
    }

    if (parts.length === 3 && request.method === 'DELETE') {
      const row = await getReportRow(env, reportId);
      if (row.status === 'completed') throw new HttpError(409, 'Completed reports cannot be deleted.');
      await env.DB.prepare('DELETE FROM reports WHERE id = ?').bind(reportId).run();
      try {
        await deleteReportObjects(env, reportId);
      } catch (error) {
        console.error('Draft report deleted from D1 but R2 cleanup failed:', error);
      }
      return json({ success: true });
    }

    if (parts.length === 4 && parts[3] === 'cover') {
      const row = await getReportRow(env, reportId);
      const report = parseReport(row);

      if (request.method === 'GET') {
        const key = report.details.coverPhotoStorageKey;
        if (!key) throw new HttpError(404, 'Cover photo not found.');
        const object = await env.REPORT_STORAGE.get(key);
        if (!object) throw new HttpError(404, 'Cover photo not found.');
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('ETag', object.httpEtag);
        headers.set('Cache-Control', 'private, no-store');
        return new Response(object.body, { headers: securityHeaders(headers) });
      }

      if (request.method === 'POST') {
        if (row.status === 'completed') throw new HttpError(409, 'Completed reports cannot be edited.');
        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File)) throw new HttpError(400, 'Cover photo file is required.');
        if (!file.type.startsWith('image/')) throw new HttpError(400, 'Only image uploads are allowed.');
        if (file.size > 5 * 1024 * 1024) throw new HttpError(413, 'Processed image exceeds the 5 MB upload limit.');

        const previousKey = report.details.coverPhotoStorageKey;
        const key = `reports/${reportId}/cover/${crypto.randomUUID()}.jpg`;
        await env.REPORT_STORAGE.put(key, await file.arrayBuffer(), {
          httpMetadata: { contentType: 'image/jpeg' },
          customMetadata: { reportId, uploadedBy: userEmail, purpose: 'cover' },
        });

        try {
          const saved = await updateReportData(env, row, {
            ...report,
            details: {
              ...report.details,
              coverPhotoUrl: undefined,
              coverPhotoStorageKey: key,
            },
          }, userEmail);
          if (previousKey && previousKey !== key) {
            await env.REPORT_STORAGE.delete(previousKey).catch((error) => {
              console.error('Cover photo replaced but old R2 object cleanup failed:', error);
            });
          }
          return json(saved);
        } catch (error) {
          await env.REPORT_STORAGE.delete(key).catch(() => undefined);
          throw error;
        }
      }
    }

    if (parts.length === 4 && parts[3] === 'photos' && request.method === 'POST') {
      const row = await getReportRow(env, reportId);
      if (row.status === 'completed') throw new HttpError(409, 'Completed reports cannot be edited.');

      const form = await request.formData();
      const file = form.get('file');
      const photoId = String(form.get('photoId') || '').trim();
      const name = String(form.get('name') || '').trim();
      const areaName = String(form.get('areaName') || 'General').trim();
      const itemId = String(form.get('itemId') || '').trim() || undefined;
      const itemName = String(form.get('itemName') || '').trim() || undefined;
      const photoIndex = Number(form.get('photoIndex') || '0');
      const isCover = String(form.get('isCover') || 'false') === 'true';

      if (!(file instanceof File) || !photoId || !name) {
        throw new HttpError(400, 'Photo file and metadata are required.');
      }
      if (!file.type.startsWith('image/')) throw new HttpError(400, 'Only image uploads are allowed.');
      if (file.size > 5 * 1024 * 1024) throw new HttpError(413, 'Processed image exceeds the 5 MB upload limit.');

      const report = parseReport(row);
      const targetArea = report.areas.find(
        (area) => normalizeAreaName(area.name) === normalizeAreaName(areaName)
      );
      const linkedItem = itemId
        ? targetArea?.items.find((item) => item.id === itemId)
        : undefined;

      if (itemId && !linkedItem) {
        throw new HttpError(400, 'The selected reporting item does not belong to the selected report category.');
      }
      const key = `reports/${reportId}/photos/${photoId}.jpg`;
      await env.REPORT_STORAGE.put(key, await file.arrayBuffer(), {
        httpMetadata: { contentType: 'image/jpeg' },
        customMetadata: { reportId, photoId, uploadedBy: userEmail },
      });

      const photos = (report.photos || []).filter((photo) => photo.id !== photoId);
      const photo: ReportPhoto = {
        id: photoId,
        name,
        areaName,
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
        return json(await updateReportData(env, row, { ...report, photos: updatedPhotos }, userEmail));
      } catch (error) {
        await env.REPORT_STORAGE.delete(key).catch(() => undefined);
        throw error;
      }
    }

    if (parts.length === 5 && parts[3] === 'photos') {
      const photoId = parts[4];
      const row = await getReportRow(env, reportId);
      const report = parseReport(row);
      const photo = report.photos.find((item) => item.id === photoId);

      if (request.method === 'GET') {
        if (!photo?.storageKey) throw new HttpError(404, 'Photo not found.');
        const object = await env.REPORT_STORAGE.get(photo.storageKey);
        if (!object) throw new HttpError(404, 'Photo not found.');
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('ETag', object.httpEtag);
        headers.set('Cache-Control', 'private, no-store');
        return new Response(object.body, { headers: securityHeaders(headers) });
      }

      if (request.method === 'DELETE') {
        if (row.status === 'completed') throw new HttpError(409, 'Completed reports cannot be edited.');
        const updated = { ...report, photos: report.photos.filter((item) => item.id !== photoId) };
        const saved = await updateReportData(env, row, updated, userEmail);
        if (photo?.storageKey) {
          await env.REPORT_STORAGE.delete(photo.storageKey).catch((error) => {
            console.error('Photo removed from report data but R2 cleanup failed:', error);
          });
        }
        return json(saved);
      }
    }

    if (parts.length === 4 && parts[3] === 'complete' && request.method === 'POST') {
      const row = await getReportRow(env, reportId);
      if (row.status === 'completed') return json(parseReport(row));
      if (request.headers.get('content-type')?.split(';')[0] !== 'application/pdf') {
        throw new HttpError(400, 'A PDF document is required.');
      }
      const maxPdfBytes = 90 * 1024 * 1024;
      const declaredLength = Number(request.headers.get('content-length') || 0);
      if (Number.isFinite(declaredLength) && declaredLength > maxPdfBytes) {
        throw new HttpError(413, 'PDF exceeds the 90 MB storage limit.');
      }
      if (!request.body) throw new HttpError(400, 'PDF is empty.');

      const report = parseReport(row);
      const validationIssues = validateReportForFinalization(report);
      if (validationIssues.length > 0) {
        throw new HttpError(
          409,
          reportValidationMessage(validationIssues, 'Report cannot be finalised')
        );
      }

      const key = `reports/${reportId}/completed/report.pdf`;
      const stored = await env.REPORT_STORAGE.put(key, request.body, {
        httpMetadata: { contentType: 'application/pdf' },
        customMetadata: { reportId, completedBy: userEmail },
      });

      if (!stored || stored.size <= 0) {
        await env.REPORT_STORAGE.delete(key).catch(() => undefined);
        throw new HttpError(400, 'PDF is empty.');
      }
      if (stored.size > maxPdfBytes) {
        await env.REPORT_STORAGE.delete(key).catch(() => undefined);
        throw new HttpError(413, 'PDF exceeds the 90 MB storage limit.');
      }

      try {
        return json(await updateReportData(env, row, report, userEmail, 'completed', key));
      } catch (error) {
        await env.REPORT_STORAGE.delete(key).catch(() => undefined);
        throw error;
      }
    }

    if (parts.length === 4 && parts[3] === 'pdf' && request.method === 'GET') {
      const row = await getReportRow(env, reportId);
      if (!row.completed_pdf_key) throw new HttpError(404, 'Completed PDF not found.');
      const object = await env.REPORT_STORAGE.get(row.completed_pdf_key);
      if (!object) throw new HttpError(404, 'Completed PDF not found.');

      const report = parseReport(row);
      const safeAddress = (report.details.propertyAddress || 'Property')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      const safeType = reportInstanceLabel(report.details)
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'Report';
      const safeDate = (report.details.inspectionDate || '')
        .replace(/[^0-9-]/g, '');
      const filename = `ProInspect_${safeType}_${safeAddress}${safeDate ? `_${safeDate}` : ''}.pdf`;
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('Content-Disposition', `attachment; filename="${filename}"`);
      headers.set('Cache-Control', 'private, no-store');
      return new Response(object.body, { headers: securityHeaders(headers) });
    }
  }

  throw new HttpError(404, 'API route not found.');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith('/api/')) {
        return new Response('Not found', { status: 404, headers: securityHeaders() });
      }

      const publicWorkflowResponse = await handlePublicWorkflowApi(request, env);
      if (publicWorkflowResponse) return publicWorkflowResponse;

      return await handleApi(request, env);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      return unexpectedErrorResponse(error);
    }
  },
} satisfies ExportedHandler<Env>;
