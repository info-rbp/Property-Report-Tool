import fs from 'node:fs';

const config=fs.readFileSync('wrangler.jsonc','utf8');
const smoke=fs.readFileSync('.github/workflows/production-smoke.yml','utf8');
const workflow=fs.readFileSync('worker/workflowPlatform.ts','utf8');
const worker=fs.readFileSync('worker/index.ts','utf8');
const expected='https://proinspect-property-report-creation-tool.delicate-dream-e4c9.workers.dev';

function invariant(name:string,condition:boolean){
  if(!condition)throw new Error('PUBLIC SIGNING CHECK FAILED: '+name);
  console.log('PASS: '+name);
}

invariant('workers.dev remains enabled',config.includes('"workers_dev": true'));
invariant('public signing base is repository controlled',config.includes('"SIGNING_BASE_URL": "'+expected+'"'));
invariant('public workflow routes execute before staff authentication',
  worker.indexOf('handlePublicWorkflowApi(request, env)') < worker.indexOf('return await handleApi(request, env)'));
invariant('public signing API remains token-scoped',workflow.includes("/api/public/signing/") && workflow.includes('loadPartyByToken'));
invariant('production smoke targets the public workers.dev origin',smoke.includes('PUBLIC_ORIGIN="'+expected+'"'));
invariant('production smoke proves protected API stays closed',smoke.includes('PROTECTED_API="$PUBLIC_ORIGIN/api/me"') && smoke.includes('401|403'));
invariant('production smoke proves editor hostname remains behind Access',smoke.includes('https://report.creation.proinspect.systems/') && smoke.includes('302|401|403'));

console.log('Public signing origin contract checks passed.');
