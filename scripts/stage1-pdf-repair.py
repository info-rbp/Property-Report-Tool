from pathlib import Path

def replace_once(path, before, after):
    p = Path(path)
    s = p.read_text()
    assert s.count(before) == 1, 'Source changed: ' + path
    p.write_text(s.replace(before, after))

replace_once('worker/index.ts',
'''      let completed: ReportData;
      try {
        completed = await updateReportData(env, row, report, userEmail, expectedRevision, 'completed', key);''',
'''      let completed: ReportData;
      try {
        // Verify the stored bytes, not the caller-supplied MIME label. This bounded
        // read preserves streaming uploads and runs before immutable finalisation.
        const prefix = await env.REPORT_STORAGE.get(key, { range: { offset: 0, length: 5 } });
        if (!prefix || await prefix.text() !== '%PDF-') {
          throw new HttpError(400, 'Uploaded content is not a PDF document.', 'invalid-pdf');
        }
        completed = await updateReportData(env, row, report, userEmail, expectedRevision, 'completed', key);''')
replace_once('scripts/verifyApiIntegration.sh',
'API_TEST_BASE_URL="${BASE_URL}" API_TEST_PROPERTY_ID="${property_id}" bun scripts/verifyStorageRaces.ts',
'API_TEST_BASE_URL="${BASE_URL}" API_TEST_PROPERTY_ID="${property_id}" bun scripts/verifyStorageRaces.ts\nAPI_TEST_BASE_URL="${BASE_URL}" API_TEST_PROPERTY_ID="${property_id}" bun scripts/verifyPdfUpload.ts')
p = Path('.github/workflows/verify.yml')
s = p.read_text()
needle = '      - name: Worker API and storage integration\n'
assert s.count(needle) == 1
p.write_text(s.replace(needle, '      - name: Production authentication boundary\n        run: bun scripts/verifyWorkerBoundary.ts\n' + needle))
