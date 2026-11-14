import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertSameOrigin, hashPassword, verifyPassword, validatePassword } from '../worker/auth';

async function run() {
  validatePassword('a-safe-password-with-length');
  validatePassword('10characters', 10);
  assert.throws(() => validatePassword('short'));
  assert.throws(() => validatePassword('short', 10));
  const hash = await hashPassword('a-safe-password-with-length');

  assert.equal(hash.startsWith('scrypt$32768$8$1$'), true);
  assert.equal(await verifyPassword('a-safe-password-with-length', hash), true);
  assert.equal(await verifyPassword('incorrect-password', hash), false);
  const bootstrapHash = await hashPassword('10characters', 10);
  assert.equal(await verifyPassword('10characters', bootstrapHash), true);
  assert.equal(await verifyPassword('a-safe-password-with-length', 'not-a-password-hash'), false);
  assert.equal(await verifyPassword('a-safe-password-with-length', 'pbkdf2-sha256$600000$invalid$invalid'), false);
  assert.doesNotThrow(() => assertSameOrigin(new Request('https://report.creation.proinspect.systems/api/me')));
  assert.doesNotThrow(() => assertSameOrigin(new Request('https://report.creation.proinspect.systems/api/auth/login', {
    method: 'POST', headers: { Origin: 'https://report.creation.proinspect.systems' },
  })));
  assert.throws(() => assertSameOrigin(new Request('https://report.creation.proinspect.systems/api/auth/login', {
    method: 'POST', headers: { Origin: 'https://malicious.example' },
  })));
  const worker = fs.readFileSync('worker/index.ts', 'utf8');
  const auth = fs.readFileSync('worker/auth.ts', 'utf8');
  const app = fs.readFileSync('src/main.tsx', 'utf8');
  const schema = fs.readFileSync('migrations/0003_email_password_auth.sql', 'utf8');
  assert.ok(worker.indexOf('handlePublicWorkflowApi(request, env)') < worker.indexOf('handleAuthApi(request, env)'));
  assert.ok(worker.indexOf('handleAuthApi(request, env)') < worker.indexOf('return await handleApi(request, env)'));
  assert.ok(worker.includes('assertSameOrigin(request)'));
  assert.ok(auth.includes('isReportEditorHost(request)'));
  assert.ok(auth.includes('cloudflareAccessIdentity(request, env)'));
  assert.ok(auth.includes('INSERT INTO auth_users'));
  assert.ok(auth.includes('DELETE FROM auth_sessions WHERE user_id = ?'));
  assert.ok(app.includes('PublicSigningApp') && app.includes('<AuthGate><App /></AuthGate>'));
  assert.ok(schema.includes('CREATE TABLE IF NOT EXISTS auth_sessions'));
  console.log('PASS: scrypt password hashing, cookie auth boundaries and public signing route invariants');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
