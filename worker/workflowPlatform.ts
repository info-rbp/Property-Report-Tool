import { reportInstanceLabel } from '../src/data/reportCatalogue';
import { migrateReportData } from '../src/lib/reportMigration';
import type { ReportData, ReportType } from '../src/types/report';
import type {
  PublicSigningPacket,
  ReportDeliveryRecord,
  ReportTemplateRecord,
  SendForSignatureInput,
  SendReportInput,
  SignatureFieldRecord,
  SignaturePartyRecord,
  SignatureRequestRecord,
} from '../src/types/workflow';
import { emailBody, escapeHtml, sendResendEmail, type ResendEnv } from './email';

export interface WorkflowEnv extends ResendEnv {
  DB: D1Database;
  REPORT_STORAGE: R2Bucket;
  SIGNING_BASE_URL?: string;
}

interface ReportRow {
  id: string;
  property_id: string;
  report_type: ReportType;
  status: 'draft' | 'completed';
  report_data: string;
  completed_pdf_key: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

interface TemplateRow {
  id: string;
  name: string;
  report_type: ReportType;
  scope_type: 'global' | 'property';
  property_id: string | null;
  template_data: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

interface DeliveryRow {
  id: string;
  report_id: string;
  delivery_mode: 'send' | 'signature';
  subject: string;
  message: string;
  recipient_json: string | null;
  cc_json: string | null;
  status: ReportDeliveryRecord['status'];
  resend_email_id: string | null;
  created_at: string;
  sent_at: string | null;
  completed_at: string | null;
  created_by: string | null;
}

interface SignatureRequestRow {
  id: string;
  delivery_id: string;
  report_id: string;
  signing_order: 'sequential' | 'parallel';
  status: SignatureRequestRecord['status'];
  expires_at: string | null;
  executed_pdf_key: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  created_by: string | null;
}

interface SignaturePartyRow {
  id: string;
  request_id: string;
  name: string;
  email: string;
  role_label: string;
  sequence_number: number;
  is_countersigner: number;
  status: SignaturePartyRecord['status'];
  token_hash: string;
  token_expires_at: string | null;
  signed_name: string | null;
  signature_text: string | null;
  commentary: string | null;
  signed_at: string | null;
  viewed_at: string | null;
  user_agent: string | null;
  created_at: string;
}

interface SignatureFieldRow {
  id: string;
  request_id: string;
  party_id: string | null;
  field_type: 'signature' | 'text';
  label: string;
  placement_label: string | null;
  prompt_text: string | null;
  page_number: number | null;
  x_percent: number | null;
  y_percent: number | null;
  width_percent: number | null;
  required: number;
  display_order: number;
  value_text: string | null;
  completed_at: string | null;
}

const MAX_EMAIL_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const WORKFLOW_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS report_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  report_type TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'global' CHECK (scope_type IN ('global', 'property')),
  property_id TEXT,
  template_data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_report_templates_type ON report_templates(report_type, scope_type);
CREATE INDEX IF NOT EXISTS idx_report_templates_property ON report_templates(property_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS report_deliveries (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  delivery_mode TEXT NOT NULL CHECK (delivery_mode IN ('send', 'signature')),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  recipient_json TEXT,
  cc_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'sent', 'partially_signed', 'completed', 'failed', 'void')),
  resend_email_id TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  completed_at TEXT,
  created_by TEXT,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_report_deliveries_report ON report_deliveries(report_id, created_at DESC);

CREATE TABLE IF NOT EXISTS signature_requests (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  report_id TEXT NOT NULL,
  signing_order TEXT NOT NULL DEFAULT 'sequential' CHECK (signing_order IN ('sequential', 'parallel')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partially_signed', 'awaiting_countersignature', 'completed', 'void', 'expired')),
  expires_at TEXT,
  executed_pdf_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  created_by TEXT,
  FOREIGN KEY (delivery_id) REFERENCES report_deliveries(id) ON DELETE CASCADE,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_signature_requests_report ON signature_requests(report_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signature_requests_delivery ON signature_requests(delivery_id);

CREATE TABLE IF NOT EXISTS signature_parties (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role_label TEXT NOT NULL,
  sequence_number INTEGER NOT NULL DEFAULT 1,
  is_countersigner INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'viewed', 'signed')),
  token_hash TEXT NOT NULL UNIQUE,
  token_expires_at TEXT,
  signed_name TEXT,
  signature_text TEXT,
  commentary TEXT,
  signed_at TEXT,
  viewed_at TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (request_id) REFERENCES signature_requests(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_signature_parties_request ON signature_parties(request_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_signature_parties_token ON signature_parties(token_hash);

CREATE TABLE IF NOT EXISTS signature_fields (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  party_id TEXT,
  field_type TEXT NOT NULL CHECK (field_type IN ('signature', 'text')),
  label TEXT NOT NULL,
  placement_label TEXT,
  prompt_text TEXT,
  page_number INTEGER,
  x_percent REAL,
  y_percent REAL,
  width_percent REAL,
  required INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 1,
  value_text TEXT,
  completed_at TEXT,
  FOREIGN KEY (request_id) REFERENCES signature_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (party_id) REFERENCES signature_parties(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_signature_fields_request ON signature_fields(request_id, display_order);
CREATE INDEX IF NOT EXISTS idx_signature_fields_party ON signature_fields(party_id, display_order);
`;

let workflowSchemaReady: Promise<void> | null = null;

async function ensureWorkflowSchema(env: WorkflowEnv): Promise<void> {
  if (!workflowSchemaReady) {
    workflowSchemaReady = env.DB.exec(WORKFLOW_SCHEMA_SQL)
      .then(() => undefined)
      .catch((error) => {
        workflowSchemaReady = null;
        throw error;
      });
  }
  await workflowSchemaReady;
}

function workflowHeaders(initial?: HeadersInit): Headers {
  const headers = new Headers(initial);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return headers;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: workflowHeaders({ 'Cache-Control': 'no-store' }) });
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function assertEmail(value: string): string {
  const email = normalizeEmail(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Invalid email address: ${value}`);
  return email;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest).map((part) => part.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
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
  };
}

async function getReport(env: WorkflowEnv, reportId: string): Promise<ReportRow> {
  const row = await env.DB.prepare('SELECT * FROM reports WHERE id = ?').bind(reportId).first<ReportRow>();
  if (!row) throw new Error('Report not found.');
  return row;
}

function mapTemplate(row: TemplateRow): ReportTemplateRecord {
  return {
    id: row.id,
    name: row.name,
    reportType: row.report_type,
    scopeType: row.scope_type,
    propertyId: row.property_id || undefined,
    templateData: migrateReportData(JSON.parse(row.template_data) as ReportData),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by || undefined,
    updatedBy: row.updated_by || undefined,
  };
}

function mapParty(row: SignaturePartyRow): SignaturePartyRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    name: row.name,
    email: row.email,
    roleLabel: row.role_label,
    sequenceNumber: row.sequence_number,
    isCountersigner: Boolean(row.is_countersigner),
    status: row.status,
    signedName: row.signed_name || undefined,
    signatureText: row.signature_text || undefined,
    commentary: row.commentary || undefined,
    signedAt: row.signed_at || undefined,
    viewedAt: row.viewed_at || undefined,
  };
}

function mapField(row: SignatureFieldRow): SignatureFieldRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    partyId: row.party_id || undefined,
    fieldType: row.field_type,
    label: row.label,
    placementLabel: row.placement_label || undefined,
    promptText: row.prompt_text || undefined,
    pageNumber: row.page_number || undefined,
    xPercent: row.x_percent ?? undefined,
    yPercent: row.y_percent ?? undefined,
    widthPercent: row.width_percent ?? undefined,
    required: Boolean(row.required),
    displayOrder: row.display_order,
    valueText: row.value_text || undefined,
    completedAt: row.completed_at || undefined,
  };
}

async function getSignatureRequestRecord(env: WorkflowEnv, requestId: string): Promise<SignatureRequestRecord> {
  const request = await env.DB.prepare('SELECT * FROM signature_requests WHERE id = ?').bind(requestId).first<SignatureRequestRow>();
  if (!request) throw new Error('Signature request not found.');
  const parties = await env.DB.prepare('SELECT * FROM signature_parties WHERE request_id = ? ORDER BY sequence_number, created_at').bind(requestId).all<SignaturePartyRow>();
  const fields = await env.DB.prepare('SELECT * FROM signature_fields WHERE request_id = ? ORDER BY display_order, id').bind(requestId).all<SignatureFieldRow>();
  return {
    id: request.id,
    deliveryId: request.delivery_id,
    reportId: request.report_id,
    signingOrder: request.signing_order,
    status: request.status,
    expiresAt: request.expires_at || undefined,
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    completedAt: request.completed_at || undefined,
    parties: (parties.results || []).map(mapParty),
    fields: (fields.results || []).map(mapField),
  };
}

async function mapDelivery(env: WorkflowEnv, row: DeliveryRow): Promise<ReportDeliveryRecord> {
  const base: ReportDeliveryRecord = {
    id: row.id,
    reportId: row.report_id,
    deliveryMode: row.delivery_mode,
    subject: row.subject,
    message: row.message,
    to: row.recipient_json ? JSON.parse(row.recipient_json) as ReportDeliveryRecord['to'] : undefined,
    cc: row.cc_json ? JSON.parse(row.cc_json) as string[] : undefined,
    status: row.status,
    resendEmailId: row.resend_email_id || undefined,
    createdAt: row.created_at,
    sentAt: row.sent_at || undefined,
    completedAt: row.completed_at || undefined,
  };
  if (row.delivery_mode === 'signature') {
    const request = await env.DB.prepare('SELECT id FROM signature_requests WHERE delivery_id = ?').bind(row.id).first<{ id: string }>();
    if (request) base.signatureRequest = await getSignatureRequestRecord(env, request.id);
  }
  return base;
}

function signingBaseUrl(env: WorkflowEnv, request: Request): string {
  const requestOrigin = new URL(request.url).origin;
  const fallbackOrigin =
    requestOrigin.includes('report.creation.proinspect.systems')
      ? 'https://proinspect-property-report-creation-tool.delicate-dream-e4c9.workers.dev'
      : requestOrigin;
  return (env.SIGNING_BASE_URL || fallbackOrigin).replace(/\/$/, '');
}

async function sendSigningInvite(
  request: Request,
  env: WorkflowEnv,
  report: ReportData,
  requestId: string,
  partyRow: SignaturePartyRow,
  rawToken: string,
  subject: string,
  message: string,
): Promise<string> {
  const url = `${signingBaseUrl(env, request)}/sign/${encodeURIComponent(rawToken)}`;
  const result = await sendResendEmail(env, {
    to: [partyRow.email],
    subject,
    html: emailBody(
      `${message}\n\n${partyRow.name}, please review and complete the ${partyRow.role_label} fields for ${reportInstanceLabel(report.details)} at ${report.details.propertyAddress || 'the property'}.`,
      { label: 'Review and sign', url },
    ),
    idempotencyKey: `signature-invite/${requestId}/${partyRow.id}`,
  });
  return result.id;
}

async function loadPartyByToken(env: WorkflowEnv, rawToken: string): Promise<{ party: SignaturePartyRow; request: SignatureRequestRow; report: ReportData; delivery: DeliveryRow }> {
  const tokenHash = await sha256(rawToken);
  const party = await env.DB.prepare('SELECT * FROM signature_parties WHERE token_hash = ?').bind(tokenHash).first<SignaturePartyRow>();
  if (!party) throw new Error('This signing link is invalid.');
  if (party.token_expires_at && Date.parse(party.token_expires_at) < Date.now()) throw new Error('This signing link has expired.');
  const signatureRequest = await env.DB.prepare('SELECT * FROM signature_requests WHERE id = ?').bind(party.request_id).first<SignatureRequestRow>();
  if (!signatureRequest) throw new Error('Signature request not found.');
  if (signatureRequest.status === 'void' || signatureRequest.status === 'expired') throw new Error('This signature request is no longer active.');
  const reportRow = await getReport(env, signatureRequest.report_id);
  const delivery = await env.DB.prepare('SELECT * FROM report_deliveries WHERE id = ?').bind(signatureRequest.delivery_id).first<DeliveryRow>();
  if (!delivery) throw new Error('Delivery record not found.');
  return { party, request: signatureRequest, report: parseReport(reportRow), delivery };
}

async function partyCanSign(env: WorkflowEnv, party: SignaturePartyRow, signatureRequest: SignatureRequestRow): Promise<boolean> {
  if (party.status === 'signed') return false;
  const parties = await env.DB.prepare('SELECT * FROM signature_parties WHERE request_id = ? ORDER BY sequence_number').bind(signatureRequest.id).all<SignaturePartyRow>();
  const rows = parties.results || [];
  const nonCounterPending = rows.filter((candidate) => !candidate.is_countersigner && candidate.status !== 'signed');
  const counterPending = rows.filter((candidate) => candidate.is_countersigner && candidate.status !== 'signed');

  if (nonCounterPending.length) {
    if (party.is_countersigner) return false;
    if (signatureRequest.signing_order === 'parallel') return true;
    const nextSequence = Math.min(...nonCounterPending.map((candidate) => candidate.sequence_number));
    return party.sequence_number === nextSequence;
  }

  if (counterPending.length) {
    if (!party.is_countersigner) return false;
    if (signatureRequest.signing_order === 'parallel') return true;
    const nextSequence = Math.min(...counterPending.map((candidate) => candidate.sequence_number));
    return party.sequence_number === nextSequence;
  }
  return false;
}

async function buildPublicPacket(env: WorkflowEnv, rawToken: string): Promise<PublicSigningPacket> {
  const loaded = await loadPartyByToken(env, rawToken);
  const allParties = await env.DB.prepare('SELECT * FROM signature_parties WHERE request_id = ? ORDER BY sequence_number').bind(loaded.request.id).all<SignaturePartyRow>();
  const fields = await env.DB.prepare('SELECT * FROM signature_fields WHERE request_id = ? AND (party_id = ? OR party_id IS NULL) ORDER BY display_order').bind(loaded.request.id, loaded.party.id).all<SignatureFieldRow>();
  return {
    requestId: loaded.request.id,
    reportId: loaded.report.id!,
    reportTitle: reportInstanceLabel(loaded.report.details),
    propertyAddress: loaded.report.details.propertyAddress || '',
    party: {
      id: loaded.party.id,
      name: loaded.party.name,
      email: loaded.party.email,
      roleLabel: loaded.party.role_label,
      isCountersigner: Boolean(loaded.party.is_countersigner),
      status: loaded.party.status,
    },
    fields: (fields.results || []).map(mapField),
    completedParties: (allParties.results || [])
      .filter((party) => party.status === 'signed')
      .map((party) => ({ name: party.name, roleLabel: party.role_label, signedAt: party.signed_at || undefined })),
    canSign: await partyCanSign(env, loaded.party, loaded.request),
    signingOrder: loaded.request.signing_order,
    status: loaded.request.status,
    expiresAt: loaded.request.expires_at || undefined,
  };
}

async function inviteEligibleParties(request: Request, env: WorkflowEnv, requestId: string, report: ReportData, delivery: DeliveryRow): Promise<void> {
  const signatureRequest = await env.DB.prepare('SELECT * FROM signature_requests WHERE id = ?').bind(requestId).first<SignatureRequestRow>();
  if (!signatureRequest) return;
  const all = await env.DB.prepare('SELECT * FROM signature_parties WHERE request_id = ? ORDER BY sequence_number').bind(requestId).all<SignaturePartyRow>();
  const parties = all.results || [];
  const nonCounterPending = parties.filter((party) => !party.is_countersigner && party.status === 'pending');
  const anyNonCounterUnsigned = parties.some((party) => !party.is_countersigner && party.status !== 'signed');
  let candidates: SignaturePartyRow[] = [];

  if (anyNonCounterUnsigned) {
    if (signatureRequest.signing_order === 'parallel') {
      candidates = nonCounterPending;
    } else if (nonCounterPending.length) {
      const min = Math.min(...nonCounterPending.map((party) => party.sequence_number));
      candidates = nonCounterPending.filter((party) => party.sequence_number === min);
    }
  } else {
    const counterPending = parties.filter((party) => party.is_countersigner && party.status === 'pending');
    if (signatureRequest.signing_order === 'parallel') {
      candidates = counterPending;
    } else if (counterPending.length) {
      const min = Math.min(...counterPending.map((party) => party.sequence_number));
      candidates = counterPending.filter((party) => party.sequence_number === min);
    }
  }

  for (const party of candidates) {
    // Raw tokens are intentionally not stored. Generate a replacement invitation token when a party becomes eligible.
    const rawToken = randomToken();
    const tokenHash = await sha256(rawToken);
    const expiresAt = signatureRequest.expires_at;
    await env.DB.prepare('UPDATE signature_parties SET token_hash = ?, token_expires_at = ?, status = ? WHERE id = ?')
      .bind(tokenHash, expiresAt, 'sent', party.id).run();
    await sendSigningInvite(request, env, report, requestId, { ...party, token_hash: tokenHash, status: 'sent' }, rawToken, delivery.subject, delivery.message);
  }
}

async function buildExecutedReportForToken(env: WorkflowEnv, rawToken: string): Promise<ReportData> {
  const loaded = await loadPartyByToken(env, rawToken);
  const signedRows = await env.DB.prepare('SELECT * FROM signature_parties WHERE request_id = ? ORDER BY sequence_number').bind(loaded.request.id).all<SignaturePartyRow>();
  const parties = signedRows.results || [];
  if (!parties.length || parties.some((party) => party.status !== 'signed')) {
    throw new Error('All parties must sign before the executed report can be generated.');
  }
  const fieldRows = await env.DB.prepare('SELECT * FROM signature_fields WHERE request_id = ? ORDER BY display_order').bind(loaded.request.id).all<SignatureFieldRow>();
  const tokenBase = `/api/public/signing/${encodeURIComponent(rawToken)}`;
  return {
    ...loaded.report,
    details: {
      ...loaded.report.details,
      coverPhotoUrl: loaded.report.details.coverPhotoStorageKey ? `${tokenBase}/cover` : loaded.report.details.coverPhotoUrl,
    },
    photos: loaded.report.photos.map((photo) => ({
      ...photo,
      dataUrl: undefined,
      url: `${tokenBase}/photos/${encodeURIComponent(photo.id)}`,
    })),
    execution: {
      requestId: loaded.request.id,
      completedAt: new Date().toISOString(),
      parties: parties.map((party) => ({
        id: party.id,
        name: party.name,
        email: party.email,
        roleLabel: party.role_label,
        signedName: party.signed_name || party.name,
        signatureDataUrl: party.signature_text || undefined,
        commentary: party.commentary || undefined,
        signedAt: party.signed_at || new Date().toISOString(),
      })),
      fields: (fieldRows.results || []).map((field) => ({
        fieldType: field.field_type,
        label: field.label,
        placementLabel: field.placement_label || undefined,
        promptText: field.prompt_text || undefined,
        pageNumber: field.page_number || undefined,
        xPercent: field.x_percent ?? undefined,
        yPercent: field.y_percent ?? undefined,
        widthPercent: field.width_percent ?? undefined,
        valueText: field.value_text || undefined,
        partyId: field.party_id || undefined,
      })),
    },
  };
}

export async function handleWorkflowApi(request: Request, env: WorkflowEnv, userEmail: string): Promise<Response | null> {
  const url = new URL(request.url);
  const workflowPath =
    url.pathname.startsWith('/api/templates') ||
    url.pathname.includes('/deliveries') ||
    url.pathname.endsWith('/send') ||
    url.pathname.endsWith('/signature-request');
  if (!workflowPath) return null;
  await ensureWorkflowSchema(env);
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

  if (parts[1] === 'templates') {
    if (parts.length === 2 && request.method === 'GET') {
      const propertyId = url.searchParams.get('propertyId');
      const result = propertyId
        ? await env.DB.prepare("SELECT * FROM report_templates WHERE scope_type = 'global' OR property_id = ? ORDER BY updated_at DESC").bind(propertyId).all<TemplateRow>()
        : await env.DB.prepare("SELECT * FROM report_templates WHERE scope_type = 'global' ORDER BY updated_at DESC").all<TemplateRow>();
      return json((result.results || []).map(mapTemplate));
    }

    if (parts.length === 2 && request.method === 'POST') {
      const body = await request.json() as { name?: string; scopeType?: 'global' | 'property'; propertyId?: string; templateData?: ReportData };
      const name = body.name?.trim();
      if (!name || !body.templateData) return json({ error: 'Template name and data are required.' }, 400);
      const scopeType = body.scopeType === 'property' ? 'property' : 'global';
      if (scopeType === 'property' && !body.propertyId) return json({ error: 'Property-specific templates require a property.' }, 400);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare(
        'INSERT INTO report_templates (id, name, report_type, scope_type, property_id, template_data, created_at, updated_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        id,
        name,
        body.templateData.details.reportType,
        scopeType,
        scopeType === 'property' ? body.propertyId : null,
        JSON.stringify(body.templateData),
        now,
        now,
        userEmail,
        userEmail,
      ).run();
      const row = await env.DB.prepare('SELECT * FROM report_templates WHERE id = ?').bind(id).first<TemplateRow>();
      return json(mapTemplate(row!), 201);
    }

    if (parts.length === 3 && request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM report_templates WHERE id = ?').bind(parts[2]).run();
      return json({ success: true });
    }
  }

  if (parts[1] === 'reports' && parts[2] && parts[3] === 'deliveries' && request.method === 'GET') {
    const result = await env.DB.prepare('SELECT * FROM report_deliveries WHERE report_id = ? ORDER BY created_at DESC').bind(parts[2]).all<DeliveryRow>();
    const deliveries: ReportDeliveryRecord[] = [];
    for (const row of result.results || []) deliveries.push(await mapDelivery(env, row));
    return json(deliveries);
  }

  if (parts[1] === 'reports' && parts[2] && parts[3] === 'send' && request.method === 'POST') {
    const reportRow = await getReport(env, parts[2]);
    if (reportRow.status !== 'completed' || !reportRow.completed_pdf_key) return json({ error: 'Finalise the report before sending it.' }, 409);
    const body = await request.json() as SendReportInput;
    if (!body.to?.length) return json({ error: 'At least one recipient is required.' }, 400);
    const to = body.to.map((recipient) => assertEmail(recipient.email));
    const cc = (body.cc || []).map(assertEmail);
    const pdf = await env.REPORT_STORAGE.get(reportRow.completed_pdf_key);
    if (!pdf) return json({ error: 'Completed PDF not found.' }, 404);
    if (pdf.size > MAX_EMAIL_ATTACHMENT_BYTES) return json({ error: 'The completed PDF is too large for email attachment delivery. Reduce the report PDF size before sending.' }, 413);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO report_deliveries (id, report_id, delivery_mode, subject, message, recipient_json, cc_json, status, created_at, created_by) VALUES (?, ?, 'send', ?, ?, ?, ?, 'queued', ?, ?)"
    ).bind(id, reportRow.id, body.subject, body.message, JSON.stringify(body.to), JSON.stringify(body.cc || []), now, userEmail).run();

    try {
      const sent = await sendResendEmail(env, {
        to,
        cc,
        subject: body.subject,
        html: emailBody(body.message),
        attachments: [{ filename: `ProInspect_${reportInstanceLabel(parseReport(reportRow).details).replace(/[^a-zA-Z0-9]+/g, '_')}.pdf`, contentType: 'application/pdf', bytes: await pdf.arrayBuffer() }],
        idempotencyKey: `report-delivery/${id}`,
      });
      await env.DB.prepare("UPDATE report_deliveries SET status = 'sent', resend_email_id = ?, sent_at = ? WHERE id = ?").bind(sent.id, new Date().toISOString(), id).run();
    } catch (error) {
      await env.DB.prepare("UPDATE report_deliveries SET status = 'failed' WHERE id = ?").bind(id).run();
      throw error;
    }
    const row = await env.DB.prepare('SELECT * FROM report_deliveries WHERE id = ?').bind(id).first<DeliveryRow>();
    return json(await mapDelivery(env, row!), 201);
  }

  if (parts[1] === 'reports' && parts[2] && parts[3] === 'signature-request' && request.method === 'POST') {
    const reportRow = await getReport(env, parts[2]);
    if (reportRow.status !== 'completed' || !reportRow.completed_pdf_key) return json({ error: 'Finalise the report before requesting signatures.' }, 409);
    const body = await request.json() as SendForSignatureInput;
    if (!body.parties?.length) return json({ error: 'At least one signing party is required.' }, 400);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + Math.max(1, Math.min(body.expiresInDays || 14, 90)) * 86400000).toISOString();
    const deliveryId = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    const report = parseReport(reportRow);

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO report_deliveries (id, report_id, delivery_mode, subject, message, recipient_json, cc_json, status, created_at, created_by) VALUES (?, ?, 'signature', ?, ?, ?, ?, 'queued', ?, ?)"
      ).bind(deliveryId, reportRow.id, body.subject, body.message, JSON.stringify(body.parties), JSON.stringify([]), now.toISOString(), userEmail),
      env.DB.prepare(
        "INSERT INTO signature_requests (id, delivery_id, report_id, signing_order, status, expires_at, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)"
      ).bind(requestId, deliveryId, reportRow.id, body.signingOrder || 'sequential', expiresAt, now.toISOString(), now.toISOString(), userEmail),
    ]);

    const partyRows: SignaturePartyRow[] = [];
    for (let index = 0; index < body.parties.length; index++) {
      const input = body.parties[index];
      const rawToken = randomToken();
      const tokenHash = await sha256(rawToken);
      const row: SignaturePartyRow = {
        id: crypto.randomUUID(),
        request_id: requestId,
        name: input.name.trim() || input.email,
        email: assertEmail(input.email),
        role_label: input.roleLabel?.trim() || (input.isCountersigner ? 'Countersignature' : 'Signature'),
        sequence_number: index + 1,
        is_countersigner: input.isCountersigner ? 1 : 0,
        status: 'pending',
        token_hash: tokenHash,
        token_expires_at: expiresAt,
        signed_name: null,
        signature_text: null,
        commentary: null,
        signed_at: null,
        viewed_at: null,
        user_agent: null,
        created_at: now.toISOString(),
      };
      partyRows.push(row);
      await env.DB.prepare(
        'INSERT INTO signature_parties (id, request_id, name, email, role_label, sequence_number, is_countersigner, status, token_hash, token_expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(row.id, requestId, row.name, row.email, row.role_label, row.sequence_number, row.is_countersigner, row.status, row.token_hash, row.token_expires_at, row.created_at).run();
    }

    for (let index = 0; index < (body.fields || []).length; index++) {
      const field = body.fields[index];
      const partyId = field.partyIndex === undefined ? null : partyRows[field.partyIndex]?.id || null;
      await env.DB.prepare(
        'INSERT INTO signature_fields (id, request_id, party_id, field_type, label, placement_label, prompt_text, page_number, x_percent, y_percent, width_percent, required, display_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        crypto.randomUUID(),
        requestId,
        partyId,
        field.fieldType,
        field.label.trim() || (field.fieldType === 'signature' ? 'Signature' : 'Comment'),
        field.placementLabel?.trim() || null,
        field.promptText?.trim() || null,
        field.pageNumber && field.pageNumber > 0 ? Math.floor(field.pageNumber) : null,
        field.xPercent === undefined ? null : Math.max(0, Math.min(100, field.xPercent)),
        field.yPercent === undefined ? null : Math.max(0, Math.min(100, field.yPercent)),
        field.widthPercent === undefined ? null : Math.max(5, Math.min(100, field.widthPercent)),
        field.required === false ? 0 : 1,
        field.displayOrder || index + 1,
      ).run();
    }

    const delivery = await env.DB.prepare('SELECT * FROM report_deliveries WHERE id = ?').bind(deliveryId).first<DeliveryRow>();
    await inviteEligibleParties(request, env, requestId, report, delivery!);
    await env.DB.prepare("UPDATE signature_requests SET status = 'sent', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), requestId).run();
    await env.DB.prepare("UPDATE report_deliveries SET status = 'sent', sent_at = ? WHERE id = ?").bind(new Date().toISOString(), deliveryId).run();
    const row = await env.DB.prepare('SELECT * FROM report_deliveries WHERE id = ?').bind(deliveryId).first<DeliveryRow>();
    return json(await mapDelivery(env, row!), 201);
  }

  return null;
}

export async function handlePublicWorkflowApi(request: Request, env: WorkflowEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/public/signing/')) return null;
  await ensureWorkflowSchema(env);
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== 'api' || parts[1] !== 'public' || parts[2] !== 'signing' || !parts[3]) return null;
  const rawToken = parts[3];

  if (parts.length === 4 && request.method === 'GET') {
    const loaded = await loadPartyByToken(env, rawToken);
    if (loaded.party.status === 'sent' && !loaded.party.viewed_at) {
      const now = new Date().toISOString();
      await env.DB.prepare("UPDATE signature_parties SET status = 'viewed', viewed_at = ? WHERE id = ?").bind(now, loaded.party.id).run();
    }
    return json(await buildPublicPacket(env, rawToken));
  }

  if (parts.length === 5 && parts[4] === 'pdf' && request.method === 'GET') {
    const loaded = await loadPartyByToken(env, rawToken);
    const row = await getReport(env, loaded.request.report_id);
    if (!row.completed_pdf_key) return json({ error: 'Completed PDF not found.' }, 404);
    const object = await env.REPORT_STORAGE.get(row.completed_pdf_key);
    if (!object) return json({ error: 'Completed PDF not found.' }, 404);
    const headers = workflowHeaders({ 'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store' });
    headers.set('Content-Disposition', 'inline; filename="ProInspect_Report.pdf"');
    return new Response(object.body, { headers });
  }

  if (parts.length === 6 && parts[4] === 'photos' && request.method === 'GET') {
    const loaded = await loadPartyByToken(env, rawToken);
    const photo = loaded.report.photos.find((candidate) => candidate.id === parts[5]);
    if (!photo?.storageKey) return json({ error: 'Photo not found.' }, 404);
    const object = await env.REPORT_STORAGE.get(photo.storageKey);
    if (!object) return json({ error: 'Photo not found.' }, 404);
    const headers = workflowHeaders({ 'Cache-Control': 'private, no-store' });
    object.writeHttpMetadata(headers);
    return new Response(object.body, { headers });
  }

  if (parts.length === 5 && parts[4] === 'cover' && request.method === 'GET') {
    const loaded = await loadPartyByToken(env, rawToken);
    const key = loaded.report.details.coverPhotoStorageKey;
    if (!key) return json({ error: 'Cover photo not found.' }, 404);
    const object = await env.REPORT_STORAGE.get(key);
    if (!object) return json({ error: 'Cover photo not found.' }, 404);
    const headers = workflowHeaders({ 'Cache-Control': 'private, no-store' });
    object.writeHttpMetadata(headers);
    return new Response(object.body, { headers });
  }

  if (parts.length === 5 && parts[4] === 'sign' && request.method === 'POST') {
    const loaded = await loadPartyByToken(env, rawToken);
    if (!(await partyCanSign(env, loaded.party, loaded.request))) return json({ error: 'It is not currently this party’s turn to sign.' }, 409);
    const body = await request.json() as { signedName?: string; signatureText?: string; commentary?: string; fieldValues?: Record<string, string> };
    if (!body.signedName?.trim() || !body.signatureText?.trim()) return json({ error: 'Signed name and signature are required.' }, 400);
    const now = new Date().toISOString();
    const fields = await env.DB.prepare('SELECT * FROM signature_fields WHERE request_id = ? AND (party_id = ? OR party_id IS NULL)').bind(loaded.request.id, loaded.party.id).all<SignatureFieldRow>();
    for (const field of fields.results || []) {
      const value = (body.fieldValues || {})[field.id]?.trim() || '';
      if (field.field_type === 'text' && field.required && !value) return json({ error: `${field.label} is required.` }, 400);
      if (field.field_type === 'text') {
        await env.DB.prepare('UPDATE signature_fields SET value_text = ?, completed_at = ? WHERE id = ?').bind(value || null, now, field.id).run();
      }
    }
    await env.DB.prepare(
      "UPDATE signature_parties SET status = 'signed', signed_name = ?, signature_text = ?, commentary = ?, signed_at = ?, user_agent = ? WHERE id = ?"
    ).bind(body.signedName.trim(), body.signatureText, body.commentary?.trim() || null, now, request.headers.get('user-agent') || null, loaded.party.id).run();

    const all = await env.DB.prepare('SELECT * FROM signature_parties WHERE request_id = ? ORDER BY sequence_number').bind(loaded.request.id).all<SignaturePartyRow>();
    const parties = all.results || [];
    const allSigned = parties.every((party) => party.id === loaded.party.id || party.status === 'signed');
    const nonCounterSigned = parties.filter((party) => !party.is_countersigner).every((party) => party.id === loaded.party.id || party.status === 'signed');
    const nextStatus = allSigned ? 'partially_signed' : nonCounterSigned && parties.some((party) => party.is_countersigner) ? 'awaiting_countersignature' : 'partially_signed';
    await env.DB.prepare('UPDATE signature_requests SET status = ?, updated_at = ? WHERE id = ?').bind(nextStatus, now, loaded.request.id).run();
    await env.DB.prepare("UPDATE report_deliveries SET status = 'partially_signed' WHERE id = ?").bind(loaded.delivery.id).run();

    if (!allSigned) {
      const freshRequest = await env.DB.prepare('SELECT * FROM signature_requests WHERE id = ?').bind(loaded.request.id).first<SignatureRequestRow>();
      const freshDelivery = await env.DB.prepare('SELECT * FROM report_deliveries WHERE id = ?').bind(loaded.delivery.id).first<DeliveryRow>();
      await inviteEligibleParties(request, env, loaded.request.id, loaded.report, freshDelivery!);
      return json({ completed: false, packet: await buildPublicPacket(env, rawToken) });
    }

    const executedReport = await buildExecutedReportForToken(env, rawToken);
    return json({ completed: true, readyForExecution: true, report: executedReport });
  }

  if (parts.length === 5 && parts[4] === 'execution-payload' && request.method === 'GET') {
    const loaded = await loadPartyByToken(env, rawToken);
    const requestRow = await env.DB.prepare('SELECT * FROM signature_requests WHERE id = ?').bind(loaded.request.id).first<SignatureRequestRow>();
    if (requestRow?.status === 'completed') {
      return json({ completed: true, alreadyStored: true });
    }
    try {
      const report = await buildExecutedReportForToken(env, rawToken);
      return json({ completed: true, readyForExecution: true, report });
    } catch {
      return json({ completed: false, readyForExecution: false });
    }
  }

  if (parts.length === 5 && parts[4] === 'executed' && request.method === 'POST') {
    const loaded = await loadPartyByToken(env, rawToken);
    const all = await env.DB.prepare('SELECT * FROM signature_parties WHERE request_id = ? ORDER BY sequence_number').bind(loaded.request.id).all<SignaturePartyRow>();
    const parties = all.results || [];
    if (!parties.length || parties.some((party) => party.status !== 'signed')) return json({ error: 'All parties must sign before the executed copy is stored.' }, 409);
    if (request.headers.get('content-type')?.split(';')[0] !== 'application/pdf' || !request.body) return json({ error: 'Executed PDF is required.' }, 400);

    const key = `reports/${loaded.report.id}/executed/${loaded.request.id}.pdf`;
    const stored = await env.REPORT_STORAGE.put(key, request.body, {
      httpMetadata: { contentType: 'application/pdf' },
      customMetadata: { reportId: loaded.report.id!, signatureRequestId: loaded.request.id },
    });
    if (!stored || stored.size <= 0) return json({ error: 'Executed PDF is empty.' }, 400);

    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE signature_requests SET status = 'completed', executed_pdf_key = ?, completed_at = ?, updated_at = ? WHERE id = ?").bind(key, now, now, loaded.request.id),
      env.DB.prepare("UPDATE report_deliveries SET status = 'completed', completed_at = ? WHERE id = ?").bind(now, loaded.delivery.id),
    ]);

    const object = await env.REPORT_STORAGE.get(key);
    const bytes = object ? await object.arrayBuffer() : null;
    for (const party of parties) {
      const token = randomToken();
      const tokenHash = await sha256(token);
      const executedLinkExpiry = new Date(Date.now() + 30 * 86400000).toISOString();
      await env.DB.prepare('UPDATE signature_parties SET token_hash = ?, token_expires_at = ? WHERE id = ?').bind(tokenHash, executedLinkExpiry, party.id).run();
      const downloadUrl = `${signingBaseUrl(env, request)}/api/public/signing/${encodeURIComponent(token)}/executed-pdf`;
      await sendResendEmail(env, {
        to: [party.email],
        subject: `Fully executed: ${reportInstanceLabel(loaded.report.details)} - ${loaded.report.details.propertyAddress || 'Property'}`,
        html: emailBody(
          `The signing process is complete. Please retain the fully executed copy of ${reportInstanceLabel(loaded.report.details)} for ${loaded.report.details.propertyAddress || 'the property'}.`,
          { label: 'Download fully executed copy', url: downloadUrl },
        ),
        attachments: bytes && bytes.byteLength <= MAX_EMAIL_ATTACHMENT_BYTES
          ? [{ filename: 'ProInspect_Fully_Executed_Report.pdf', contentType: 'application/pdf', bytes }]
          : undefined,
        idempotencyKey: `executed-report/${loaded.request.id}/${party.id}`,
      });
    }
    return json({ success: true });
  }

  if (parts.length === 5 && parts[4] === 'executed-pdf' && request.method === 'GET') {
    const loaded = await loadPartyByToken(env, rawToken);
    const requestRow = await env.DB.prepare('SELECT * FROM signature_requests WHERE id = ?').bind(loaded.request.id).first<SignatureRequestRow>();
    if (!requestRow?.executed_pdf_key) return json({ error: 'Executed PDF not found.' }, 404);
    const object = await env.REPORT_STORAGE.get(requestRow.executed_pdf_key);
    if (!object) return json({ error: 'Executed PDF not found.' }, 404);
    const headers = workflowHeaders({ 'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store' });
    headers.set('Content-Disposition', 'attachment; filename="ProInspect_Fully_Executed_Report.pdf"');
    return new Response(object.body, { headers });
  }

  return null;
}
