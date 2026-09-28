from pathlib import Path

def edit(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    assert text.count(old) == count, (path, 'unexpected baseline', old[:90], text.count(old))
    p.write_text(text.replace(old, new))

edit('worker/index.ts', "const sourceKey = sourcePhoto.storageKey || sourceStoredPhoto?.storageKey;", """const sourceKey = sourceStoredPhoto?.storageKey;
  if (!sourceStoredPhoto || (sourcePhoto.storageKey && sourcePhoto.storageKey !== sourceKey)) {
    throw new HttpError(409, 'Reload the source report before copying its stored photos.', 'photo-manifest-conflict');
  }""")
edit('worker/index.ts', "const key = 'reports/' + reportId + '/photos/' + photoId + '.jpg';", "const key = 'reports/' + reportId + '/photos/' + photoId + '/' + crypto.randomUUID() + '.jpg';")
edit('worker/index.ts', "const key = 'reports/' + reportId + '/completed/report.pdf';", "const key = 'reports/' + reportId + '/completed/' + crypto.randomUUID() + '.pdf';")
edit('worker/index.ts', "const id = body.report.id || crypto.randomUUID();", """const id = body.report.id || crypto.randomUUID();
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
        throw new HttpError(400, 'Invalid report identifier.', 'invalid-report-id');
      }""")
edit('worker/index.ts', "if (!(file instanceof File) || !photoId || !name) {", "if (!(file instanceof File) || !/^[A-Za-z0-9_-]{1,128}$/.test(photoId) || !name) {")
edit('worker/index.ts', "if (!file.type.startsWith('image/')) throw new HttpError(400, 'Only image uploads are allowed.', 'invalid-photo-type');", """if (expectedRevision !== row.revision) {
        throw new HttpError(409, 'Reload the latest report before uploading photos.', 'report-revision-conflict');
      }
      if (file.type !== 'image/jpeg') throw new HttpError(400, 'Upload a processed JPEG image.', 'invalid-photo-type');""")
edit('worker/index.ts', "const bytes = await file.arrayBuffer();", """const bytes = await file.arrayBuffer();
      const signature = new Uint8Array(bytes, 0, Math.min(3, bytes.byteLength));
      if (signature.length < 3 || signature[0] !== 255 || signature[1] !== 216 || signature[2] !== 255) {
        throw new HttpError(400, 'The uploaded file is not a JPEG image.', 'invalid-photo-type');
      }""")
edit('worker/index.ts', "headers.set('Cache-Control', 'private, max-age=3600');", "headers.set('Cache-Control', 'private, no-store');")
edit('worker/index.ts', "return json(await updateReportData(env, row, body.report, userEmail, Number(body.expectedRevision)));", """if (Number(body.expectedRevision) !== row.revision) {
        throw new HttpError(409, 'Reload the latest report before saving.', 'report-revision-conflict');
      }
      const incoming = body.report.photos;
      const ids = new Set((incoming || []).map((photo) => photo.id));
      if (!Array.isArray(incoming) || incoming.length !== current.photos.length || ids.size !== incoming.length ||
          current.photos.some((photo) => !ids.has(photo.id))) {
        throw new HttpError(409, 'Use the photo upload/delete workflow to change the photo manifest.', 'photo-manifest-conflict');
      }
      const photos = incoming.map((photo) => {
        const stored = current.photos.find((item) => item.id === photo.id)!;
        if (photo.storageKey && photo.storageKey !== stored.storageKey) {
          throw new HttpError(400, 'Stored photo references cannot be changed by the browser.', 'photo-storage-invalid');
        }
        return { ...photo, storageKey: stored.storageKey, url: undefined, dataUrl: undefined };
      });
      return json(await updateReportData(env, row, { ...body.report, photos }, userEmail, Number(body.expectedRevision)));""")
edit('worker/index.ts', "const user = await authenticate(request, env);", """if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
      throw new HttpError(403, 'Cross-origin mutations are not permitted.', 'invalid-origin');
    }
  }
  const user = await authenticate(request, env);""")
edit('worker/index.ts', "async function deleteObjectPrefix", """// Wait for both writes to settle before cleanup so a late write cannot recreate an orphan.
async function mirrorWrites(env: Env, key: string, writes: Promise<R2Object | null>[]): Promise<(R2Object | null)[]> {
  const results = await Promise.allSettled(writes);
  if (results.some((result) => result.status === 'rejected' || !result.value)) {
    await deleteStoragePair(env, key).catch(() => undefined);
    throw new HttpError(503, 'The file could not be saved to both storage copies. Retry the operation.', 'storage-mirror-failed');
  }
  return results.map((result) => result.status === 'fulfilled' ? result.value : null);
}

async function deleteObjectPrefix""")
edit('worker/index.ts', "await Promise.all([\n    env.REPORT_STORAGE.put(newKey, bytes, metadata),", "await mirrorWrites(env, newKey, [\n    env.REPORT_STORAGE.put(newKey, bytes, metadata),")
edit('worker/index.ts', "await Promise.all([\n        env.REPORT_STORAGE.put(key, bytes, metadata),", "await mirrorWrites(env, key, [\n        env.REPORT_STORAGE.put(key, bytes, metadata),")
edit('worker/index.ts', "const results = await Promise.all([\n        env.REPORT_STORAGE.put(key, streams[0], metadata),", "const results = await mirrorWrites(env, key, [\n        env.REPORT_STORAGE.put(key, streams[0], metadata),")
edit('worker/index.ts', "return json(await updateReportData(env, row, { ...report, photos: updatedPhotos }, userEmail, expectedRevision));", """const saved = await updateReportData(env, row, { ...report, photos: updatedPhotos }, userEmail, expectedRevision);
        const replaced = report.photos.find((item) => item.id === photoId)?.storageKey;
        if (replaced && replaced !== key) await deleteStoragePair(env, replaced).catch(() => undefined);
        return json(saved);""")
edit('src/lib/cache.ts', "type CachedReport = ReportData & { _cachedAt?: number };", """let cacheIdentity = '';
export function setCacheIdentity(email: string): void { cacheIdentity = email.trim().toLowerCase(); }
type CachedReport = ReportData & { _cachedAt?: number; _cacheIdentity?: string };""")
edit('src/lib/cache.ts', 'if (!report.id) return;', 'if (!report.id || !cacheIdentity) return;')
edit('src/lib/cache.ts', '{ ...report, _cachedAt: Date.now() }', '{ ...report, _cachedAt: Date.now(), _cacheIdentity: cacheIdentity }')
edit('src/lib/cache.ts', 'const expired = !value._cachedAt', 'const expired = !cacheIdentity || value._cacheIdentity !== cacheIdentity || !value._cachedAt', 2)
edit('src/lib/cache.ts', 'const { _cachedAt, ...report } = value;', 'const { _cachedAt, _cacheIdentity, ...report } = value;')
edit('src/App.tsx', 'cacheReport, getCachedReport, pruneCachedReports, removeCachedReport', 'cacheReport, getCachedReport, pruneCachedReports, removeCachedReport, setCacheIdentity')
edit('src/App.tsx', "await pruneCachedReports().catch(() => undefined);\n        const me = await api.me();", """const me = await api.me();
        setCacheIdentity(me.email);
        await pruneCachedReports().catch(() => undefined);""")
edit('src/App.tsx', 'const cached = await getCachedReport(id).catch(() => null);', """const mayUseCache = error instanceof TypeError || (error instanceof ApiError && error.status >= 500);
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setCacheIdentity('');
        await pruneCachedReports().catch(() => undefined);
        setReport(null);
        setUserRole('viewer');
      }
      const cached = mayUseCache ? await getCachedReport(id).catch(() => null) : null;""")
edit('scripts/verifyApiIntegration.sh', 'for slot in 1 2; do', 'race_pids=()\nfor slot in 1 2; do')
edit('scripts/verifyApiIntegration.sh', ') &\ndone\nwait', ') &\n  race_pids+=("$!")\ndone\nfor race_pid in "${race_pids[@]}"; do wait "${race_pid}"; done')
edit('scripts/verifyApiIntegration.sh', "cat /tmp/proinspect-race-1.status /tmp/proinspect-race-2.status | sort", "printf '%s\\n' \"$(cat /tmp/proinspect-race-1.status)\" \"$(cat /tmp/proinspect-race-2.status)\" | sort")
edit('scripts/verifyApiIntegration.sh', '"proinspect-property-reports-data/reports/${report_id}/photos/photo-1.jpg"', '"proinspect-property-reports-data/$(printf \'%s\' "${photo_response}" | json_field "[\'photos\'][0][\'storageKey\']")"')
edit('scripts/verifyApiIntegration.sh', '--data "{"report":${report_payload},"expectedRevision":5}"', '--data "${save_report_body_rev1}"')
edit('scripts/verifyApiIntegration.sh', '"proinspect-property-reports-data/reports/${report_id}/completed/report.pdf"', '"proinspect-property-reports-data/$(printf \'%s\' "${completed}" | json_field "[\'completedPdfKey\']")"')
edit('scripts/verifyApiIntegration.sh', 'start_worker viewer', '''API_TEST_BASE_URL="${BASE_URL}" API_TEST_PROPERTY_ID="${property_id}" bun scripts/verifyStorageRaces.ts

start_worker viewer''')
edit('scripts/verifyApiIntegration.sh', '[[ "$(json_field "[\'code\']" </tmp/proinspect-api-response.json)" == "insufficient-role" ]]', '''[[ "$(json_field "['code']" </tmp/proinspect-api-response.json)" == "insufficient-role" ]]
assert_status 403 -X POST "${BASE_URL}/api/reports/${report_id}/correction"
assert_status 403 -X DELETE "${BASE_URL}/api/reports/${race_report_id}?expectedRevision=2"
assert_status 403 -X POST "${BASE_URL}/api/properties/${property_id}/archive"''')
Path('scripts/verifyStorageRaces.ts').write_text('''import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = process.env.API_TEST_BASE_URL || '';
assert.match(base, /^http:\\/\\/(127\\.0\\.0\\.1|localhost):[0-9]+$/);
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
''')
print('Applied report hardening and regression tests; no deployment or remote data access.')
