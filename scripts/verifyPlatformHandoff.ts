import fs from 'node:fs';

function read(path: string) {
  return fs.readFileSync(path, 'utf8');
}

function invariant(name: string, condition: boolean) {
  if (!condition) throw new Error('PLATFORM HANDOFF CHECK FAILED: ' + name);
  console.log('PASS: ' + name);
}

const worker = read('worker/index.ts');
const app = read('src/App.tsx');
const api = read('src/lib/api.ts');
const types = read('src/types/report.ts');
const env = read('.dev.vars.example');

invariant(
  'Handoff token is HMAC verified inside the authenticated Worker boundary',
  worker.includes('verifyProInspectHandoffToken') &&
    worker.includes('crypto.subtle.verify') &&
    worker.includes('/api/integrations/proinspect/handoff')
);
invariant(
  'Handoff expiry and report type are validated',
  worker.includes('payload.exp * 1000 < Date.now()') &&
    worker.includes('isReportType(payload.reportType)')
);
invariant(
  'Report data retains canonical integration context',
  types.includes('ProInspectIntegrationContext') &&
    types.includes('integrationContext?: ProInspectIntegrationContext')
);
invariant(
  'Frontend resolves the handoff through the Worker, not by trusting query payloads',
  api.includes('resolveProInspectHandoff') &&
    app.includes('await api.resolveProInspectHandoff(handoffToken)')
);
invariant(
  'Canonical property reference is retained in the Report Tool container',
  app.includes('PI:${context.propertyId}') &&
    app.includes('integrationContext: context')
);
invariant(
  'Only the immutable winning report revision publishes back to the platform',
  worker.includes('publishCompletedReportToPlatform') &&
    worker.indexOf("updateReportData(") <
      worker.indexOf('await publishCompletedReportToPlatform(') &&
    worker.includes('completedReport.integrationContext') &&
    worker.includes('row.completed_pdf_key')
);
invariant(
  'Return publication is idempotency keyed by Report Tool report ID',
  worker.includes("'x-report-source-id': report.id || ''")
);
invariant(
  'Completed reports have an explicit platform publication retry path',
  worker.includes("parts[3] === 'publish'") &&
    api.includes('publishCompletedReport') &&
    app.includes('handleSyncPlatform') &&
    app.includes('Sync to ProInspect')
);
invariant(
  'Post-finalisation platform outages retain completed state for recovery',
  app.includes("error.code === 'proinspect-ingest-failed'") &&
    app.includes('Report finalised and the immutable PDF is stored')
);
invariant(
  'Platform integration secrets are server-side Worker configuration',
  env.includes('PROINSPECT_HANDOFF_SIGNING_KEY') &&
    env.includes('PROINSPECT_INGEST_URL') &&
    env.includes('PROINSPECT_INGEST_TOKEN')
);

console.log('Property Report Tool platform handoff checks passed.');
