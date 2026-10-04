import fs from 'node:fs';

const config=fs.readFileSync('wrangler.jsonc','utf8');
const smoke=fs.readFileSync('.github/workflows/production-smoke.yml','utf8');
const workflow=fs.readFileSync('worker/workflowPlatform.ts','utf8');
const worker=fs.readFileSync('worker/index.ts','utf8');
const expected='https://proinspect.systems';

function invariant(name:string,condition:boolean){
  if(!condition)throw new Error('PUBLIC SIGNING CHECK FAILED: '+name);
  console.log('PASS: '+name);
}

invariant('workers.dev remains enabled',config.includes('"workers_dev": true'));
invariant('public signing SPA route is narrowly mounted on the marketing apex',config.includes('"pattern": "proinspect.systems/sign/*"'));
invariant('public signing API route is narrowly mounted on the marketing apex',config.includes('"pattern": "proinspect.systems/api/public/signing/*"'));
invariant('public workflow health route is narrowly mounted on the marketing apex',config.includes('"pattern": "proinspect.systems/api/public/workflow-health"'));
invariant('no catch-all marketing apex Worker route exists',!config.includes('"pattern": "proinspect.systems/*"'));
invariant('public signing base is repository controlled',config.includes('"SIGNING_BASE_URL": "'+expected+'"'));
invariant('public workflow routes execute before staff authentication',
  worker.indexOf('handlePublicWorkflowApi(request, env)') < worker.indexOf('return await handleApi(request, env)'));
invariant('public signing API remains token-scoped',workflow.includes("/api/public/signing/") && workflow.includes('loadPartyByToken'));
invariant('production smoke targets the public workers.dev origin',smoke.includes('PUBLIC_ORIGIN="'+expected+'"'));
invariant('production smoke proves ProInspect integration secrets are present',smoke.includes('"proinspectHandoffConfigured":true') && smoke.includes('"proinspectIngestConfigured":true'));
invariant('production smoke proves editor hostname remains behind Access',smoke.includes('https://report.creation.proinspect.systems/') && smoke.includes('302|401|403'));

console.log('Public signing origin contract checks passed.');
