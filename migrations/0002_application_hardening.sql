ALTER TABLE properties ADD COLUMN archived_at TEXT;

CREATE TABLE reports_v2 (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  report_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'superseded')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  report_data TEXT NOT NULL,
  completed_pdf_key TEXT,
  supersedes_report_id TEXT,
  superseded_by_report_id TEXT,
  superseded_at TEXT,
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
  revision,
  report_data,
  completed_pdf_key,
  supersedes_report_id,
  superseded_by_report_id,
  superseded_at,
  created_at,
  updated_at,
  created_by,
  updated_by
)
SELECT
  id,
  property_id,
  CASE
    WHEN json_valid(report_data) THEN COALESCE(json_extract(report_data, '$.details.reportType'), report_type)
    ELSE report_type
  END,
  status,
  1,
  report_data,
  completed_pdf_key,
  NULL,
  NULL,
  NULL,
  created_at,
  updated_at,
  created_by,
  updated_by
FROM reports;

DROP TABLE reports;
ALTER TABLE reports_v2 RENAME TO reports;

CREATE INDEX IF NOT EXISTS idx_properties_updated_at ON properties(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_properties_archived_at ON properties(archived_at);
CREATE INDEX IF NOT EXISTS idx_reports_property_updated ON reports(property_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(report_type);
CREATE INDEX IF NOT EXISTS idx_reports_supersedes ON reports(supersedes_report_id);
