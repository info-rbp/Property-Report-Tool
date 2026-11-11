-- Report Tool: prevent multiple reports from claiming the same ProInspect Work Order handoff.
-- The signed context is verified by the Worker before this value may enter report_data.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_handoff_unique
ON reports(json_extract(report_data,'$.integrationContext.handoffId'))
WHERE json_extract(report_data,'$.integrationContext.handoffId') IS NOT NULL;
