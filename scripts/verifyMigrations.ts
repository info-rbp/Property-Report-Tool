import { Database } from 'bun:sqlite';

const db = new Database(':memory:');
const initial = await Bun.file('migrations/0001_initial.sql').text();
const expanded = await Bun.file('migrations/0002_expand_report_types.sql').text();

db.exec(initial);

db.query(
  `INSERT INTO properties
   (id, address, reference, notes, created_at, updated_at, created_by, updated_by)
   VALUES (?, ?, NULL, NULL, ?, ?, ?, ?)`
).run(
  'property-test',
  '19 Bonnard Crescent Ashby WA 6065',
  '2026-09-27T00:00:00.000Z',
  '2026-09-27T00:00:00.000Z',
  'test@remotebusinesspartner.com.au',
  'test@remotebusinesspartner.com.au'
);

db.query(
  `INSERT INTO reports
   (id, property_id, report_type, status, report_data, completed_pdf_key, created_at, updated_at, created_by, updated_by)
   VALUES (?, ?, ?, 'draft', ?, NULL, ?, ?, ?, ?)`
).run(
  'entry-report-test',
  'property-test',
  'Entry',
  '{}',
  '2026-09-27T00:00:00.000Z',
  '2026-09-27T00:00:00.000Z',
  'test@remotebusinesspartner.com.au',
  'test@remotebusinesspartner.com.au'
);

db.exec(expanded);

const preserved = db.query('SELECT COUNT(*) AS count FROM reports WHERE id = ?').get('entry-report-test') as { count: number };
if (preserved.count !== 1) {
  throw new Error('Report migration did not preserve existing Entry reports.');
}

db.query(
  `INSERT INTO reports
   (id, property_id, report_type, status, report_data, completed_pdf_key, created_at, updated_at, created_by, updated_by)
   VALUES (?, ?, ?, 'draft', ?, NULL, ?, ?, ?, ?)`
).run(
  'key-safe-report-test',
  'property-test',
  'Key Safe Installation',
  '{}',
  '2026-09-27T00:00:00.000Z',
  '2026-09-27T00:00:00.000Z',
  'test@remotebusinesspartner.com.au',
  'test@remotebusinesspartner.com.au'
);

let invalidRejected = false;
try {
  db.query(
    `INSERT INTO reports
     (id, property_id, report_type, status, report_data, completed_pdf_key, created_at, updated_at, created_by, updated_by)
     VALUES (?, ?, ?, 'draft', ?, NULL, ?, ?, ?, ?)`
  ).run(
    'invalid-report-test',
    'property-test',
    'Not A Report Type',
    '{}',
    '2026-09-27T00:00:00.000Z',
    '2026-09-27T00:00:00.000Z',
    'test@remotebusinesspartner.com.au',
    'test@remotebusinesspartner.com.au'
  );
} catch {
  invalidRejected = true;
}

if (!invalidRejected) {
  throw new Error('Expanded report type constraint accepted an unsupported report type.');
}

console.log('D1 migration regression check passed.');
