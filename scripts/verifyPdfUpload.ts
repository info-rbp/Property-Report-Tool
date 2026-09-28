import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = process.env.API_TEST_BASE_URL || '';
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
const property = process.env.API_TEST_PROPERTY_ID;
assert.ok(property);
const fixture = readFileSync('scripts/verifyApiIntegration.sh', 'utf8').match(/^report_payload='(.*)'$/m);
assert.ok(fixture, 'Missing API report fixture.');
const report = JSON.parse(fixture[1]);
const created = await fetch(`${base}/api/properties/${property}/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reportType: 'Routine', report }) });
assert.equal(created.status, 201, await created.clone().text());
const initial = await created.json() as { id: string; revision: number };
for (const invalid of ['<html>not a PDF</html>', '12345', '']) {
  const response = await fetch(`${base}/api/reports/${initial.id}/complete?expectedRevision=${initial.revision}`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: invalid });
  assert.equal(response.status, 400, await response.clone().text());
  const stored = await (await fetch(`${base}/api/reports/${initial.id}`)).json() as { status: string; revision: number; completedPdfKey?: string };
  assert.equal(stored.status, 'draft');
  assert.equal(stored.revision, initial.revision);
  assert.ok(!stored.completedPdfKey);
}
console.log('PASS: mislabeled and empty PDF uploads never finalise or advance the saved report revision.');
