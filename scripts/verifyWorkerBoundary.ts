import assert from 'node:assert/strict';
import worker from '../worker/index';

type Env = Parameters<typeof worker.fetch>[1];
let touches = 0;
const guardedStorage = new Proxy({}, { get() { touches++; throw new Error('Unauthorised request reached storage.'); } });
const env = { DB: guardedStorage, REPORT_STORAGE: guardedStorage, REPORT_RECOVERY_STORAGE: guardedStorage, DEV_USER_EMAIL: 'must-not-bypass@stage1.test' } as unknown as Env;
async function check(url: string, status: number, extra: Partial<Env> = {}, init: RequestInit = {}) {
  const response = await worker.fetch(new Request(url, init), { ...env, ...extra });
  assert.equal(response.status, status, await response.clone().text());
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  if (url.includes('/api/')) assert.match(response.headers.get('Cache-Control') || '', /no-store/);
}
await check('https://reports.stage1.test/api/me', 503);
const configured = { TEAM_DOMAIN: 'https://access.stage1.invalid', POLICY_AUD: 'stage1-audience' };
await check('https://reports.stage1.test/api/me', 401, configured);
await check('https://reports.stage1.test/api/me', 403, configured, { headers: { 'cf-access-jwt-assertion': 'malformed' } });
await check('https://reports.stage1.test/api/properties', 403, configured, { method: 'POST', headers: { Origin: 'https://attacker.invalid' }, body: '{}' });
await check('https://reports.stage1.test/api/properties', 403, configured, { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' }, body: '{}' });
await check('https://reports.stage1.test/', 404);
assert.equal(touches, 0);
console.log('PASS: missing configuration, anonymous requests, invalid Access JWT, cross-site writes and production DEV_USER_EMAIL bypass are denied before database/storage access.');
