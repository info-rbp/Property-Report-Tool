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
  required INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 1,
  value_text TEXT,
  completed_at TEXT,
  FOREIGN KEY (request_id) REFERENCES signature_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (party_id) REFERENCES signature_parties(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_signature_fields_request ON signature_fields(request_id, display_order);
CREATE INDEX IF NOT EXISTS idx_signature_fields_party ON signature_fields(party_id, display_order);
