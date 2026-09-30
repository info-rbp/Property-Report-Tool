import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = process.env.API_TEST_BASE_URL || '';
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost):[0-9]+$/);
const propertyId = process.env.API_TEST_PROPERTY_ID;
const report = { schemaVersion: 5, details: { reportType: 'Routine', formName: 'Routine Inspection Report', companyName: 'ProInspect', companyAddress: '', companyPhone: '', propertyAddress: '', inspectingAgent: 'Tester', inspectionDate: '2026-09-28', tenancyStartDate: '', tenants: '', reportReturnDate: '', additionalComments: '', agentSignName: 'Tester', agentSignDate: '2026-09-28', disclaimerText: 'Test', actNotice: '' }, areas: [{ id: 'area-general', name: 'General', items: [{ id: 'item-overall', name: 'Overall', agentComments: 'Test observation' }] }], photos: [] };
const send = (path: string, body: unknown, method = 'POST') => fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
async function create() { const r = await send(`/api/properties/${propertyId}/reports`, { reportType: 'Routine', report }); assert.equal(r.status, 201); return await r.json() as any; }
const jpeg = readFileSync('/tmp/proinspect-test.jpg');
const pdf = readFileSync('/tmp/proinspect-test.pdf');
function upload(id: string, revision: number) { const data = new FormData(); data.set('file', new Blob([jpeg], { type: 'image/jpeg' }), 'photo.jpg'); for (const [key, value] of Object.entries({ photoId: 'race-photo', name: 'Race photo', areaName: 'General', areaId: 'area-general', expectedRevision: String(revision) })) data.set(key, value); return fetch(`${base}/api/reports/${id}/photos`, { method: 'POST', body: data }); }
for (let attempt = 0; attempt < 3; attempt++) {
  const fresh = await create();
  const responses = await Promise.all([upload(fresh.id, 1), upload(fresh.id, 1)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const current = await (await fetch(`${base}/api/reports/${fresh.id}`)).json() as any;
  assert.equal(current.revision, 2);
  assert.equal(current.photos.length, 1);
  const stored = await fetch(`${base}/api/reports/${fresh.id}/photos/race-photo`);
  assert.equal(stored.status, 200);
  assert.deepEqual(Buffer.from(await stored.arrayBuffer()), jpeg);
  assert.equal((await upload(fresh.id, 1)).status, 409);
  assert.equal((await fetch(`${base}/api/reports/${fresh.id}/photos/race-photo`)).status, 200);
  const forged = structuredClone(current);
  forged.photos[0].storageKey = 'reports/another-report/completed/report.pdf';
  assert.equal((await send(`/api/reports/${fresh.id}`, { report: forged, expectedRevision: 2 }, 'PUT')).status, 400);
  assert.equal((await send(`/api/reports/${fresh.id}/clone`, { report: forged })).status, 409);
  assert.equal((await send(`/api/reports/${fresh.id}`, { report: { ...current, photos: [] }, expectedRevision: 2 }, 'PUT')).status, 409);
  assert.equal((await send(`/api/reports/${fresh.id}`, { report: current, expectedRevision: 2 }, 'PUT')).status, 200);
}
for (let attempt = 0; attempt < 3; attempt++) {
  const fresh = await create();
  const complete = () => fetch(`${base}/api/reports/${fresh.id}/complete?expectedRevision=1`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: pdf });
  const responses = await Promise.all([complete(), complete()]);
  assert.ok(responses.every(r => r.status === 200 || r.status === 409));
  assert.ok(responses.some(r => r.status === 200));
  const current = await (await fetch(`${base}/api/reports/${fresh.id}`)).json() as any;
  assert.equal(current.status, 'completed');
  assert.equal(current.revision, 2);
  const stored = await fetch(`${base}/api/reports/${fresh.id}/pdf`);
  assert.equal(stored.status, 200);
  assert.deepEqual(Buffer.from(await stored.arrayBuffer()), pdf);
}
assert.equal((await fetch(`${base}/api/properties`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }, body: JSON.stringify({ address: 'Must not create' }) })).status, 403);
console.log('Storage race, stale-save, forged-photo, immutable-PDF and origin checks passed.');
