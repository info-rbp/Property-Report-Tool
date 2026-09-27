PRAGMA foreign_keys = OFF;

CREATE TABLE reports_v2 (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (
    report_type IN (
      'Entry',
      'Routine',
      'Exit',
      'Property Onboarding',
      'Vacant Property',
      'Maintenance Assessment',
      'Maintenance Completion',
      'Cleaning Rectification',
      'Commercial Ingoing',
      'Commercial Periodic',
      'Commercial Exit',
      'Common Property',
      'Building Management',
      'Incident',
      'Contractor Works',
      'Property Handover',
      'Preventative Maintenance',
      'Cleaning Quality',
      'Annual Property Summary',
      'Key Safe Installation'
    )
  ),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  report_data TEXT NOT NULL,
  completed_pdf_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
);

INSERT INTO reports_v2 (
  id,
  property_id,
  report_type,
  status,
  report_data,
  completed_pdf_key,
  created_at,
  updated_at,
  created_by,
  updated_by
)
SELECT
  id,
  property_id,
  report_type,
  status,
  report_data,
  completed_pdf_key,
  created_at,
  updated_at,
  created_by,
  updated_by
FROM reports;

DROP TABLE reports;
ALTER TABLE reports_v2 RENAME TO reports;

CREATE INDEX idx_reports_property_updated ON reports(property_id, updated_at DESC);
CREATE INDEX idx_reports_status ON reports(status);

PRAGMA foreign_keys = ON;
