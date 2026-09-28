import { CURRENT_REPORT_SCHEMA_VERSION, ReportData } from '../types/report';

/**
 * Upgrade persisted report JSON to the schema understood by this application.
 *
 * Version 1 is the original unversioned report JSON. Version 2 adds explicit
 * schema versioning plus optional Building Manager activity/photo-link fields.
 * Version 3 adds the Key Receipt report type and optional key quantity /
 * identifier fields used by receipt line items.
 *
 * Future schema changes must add an explicit migration step here before
 * CURRENT_REPORT_SCHEMA_VERSION is increased.
 */
export function migrateReportData(input: ReportData): ReportData {
  const sourceVersion = input.schemaVersion || 1;
  if (sourceVersion > CURRENT_REPORT_SCHEMA_VERSION) {
    throw new Error(
      `This report uses schema version ${sourceVersion}, but this application supports up to version ${CURRENT_REPORT_SCHEMA_VERSION}. Refresh or deploy the newer application before editing the report.`
    );
  }

  let migrated: ReportData = {
    ...input,
    areas: input.areas || [],
    photos: input.photos || [],
  };

  if (sourceVersion < 2) {
    migrated = {
      ...migrated,
      schemaVersion: 2,
      areas: migrated.areas.map((area) => ({
        ...area,
        items: area.items || [],
      })),
      photos: migrated.photos.map((photo) => ({ ...photo })),
    };
  }

  if ((migrated.schemaVersion || 1) < 3) {
    migrated = {
      ...migrated,
      schemaVersion: 3,
      areas: migrated.areas.map((area) => ({
        ...area,
        items: (area.items || []).map((item) => ({ ...item })),
      })),
    };
  }

  return {
    ...migrated,
    schemaVersion: CURRENT_REPORT_SCHEMA_VERSION,
  };
}
