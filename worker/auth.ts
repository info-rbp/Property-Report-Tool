import { createRemoteJWKSet, jwtVerify } from 'jose';
import { emailBody, sendResendEmail, type ResendEnv } from './email';

export interface AuthEnv extends ResendEnv {
  DB: D1Database;
  TEAM_DOMAIN?: string;
  POLICY_AUD?: string;
  DEV_USER_EMAIL?: string;
  AUTH_ALLOW_ACCESS_FALLBACK?: string;
  AUTH_BOOTSTRAP_EMAIL?: string;
}

export type AuthRole = 'admin' | 'staff';
export type AuthMethod = 'password' | 'access' | 'development';

export interface AuthIdentity {
  id?: string;
  email: string;
  role: AuthRole;
  authMethod: AuthMethod;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: AuthRole;
  is_active: number;
}

interface SessionRow {
  id: string;
  email: string;
  role: AuthRole;
  is_active: number;
}

interface RateRow {
  attempts: number;
  expires_at: string;
}

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const COOKIE_PROD = '__Host-proinspect_session';
const COOKIE_DEV = 'proinspect_session_dev';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const ITERATIONS = 600_000;
const encoder = new TextEncoder();
let jwksDomain = '';
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export function isReportEditorHost(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  return hostname === 'report.creation.proinspect.systems' || hostname === 'localhost' || hostname === '127.0.0.1';
}

function isDevelopment(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function assertSameOrigin(request: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const target = new URL(request.url).origin;
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  let source: string | undefined;
  try {
    source = origin ? new URL(origin).origin : referer ? new URL(referer).origin : undefined;
  } catch {
    throw new AuthError(403, 'Cross-origin request denied.');
  }
  if (source !== target) throw new AuthError(403, 'Cross-origin request denied.');
}

function response(data: unknown, status = 200, cookie?: string): Response {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  if (cookie) headers.set('Set-Cookie', cookie);
  return Response.json(data, { status, headers });
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function parseBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function sha256(value: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

function randomToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export function validatePassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new AuthError(400, 'Password must contain 12 to 128 characters.');
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const digest = await derivePassword(password, salt, ITERATIONS);
  return 'pbkdf2-sha256$' + ITERATIONS + '$' + base64Url(salt) + '$' + base64Url(digest);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256' || parts[1] !== String(ITERATIONS)) return false;
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = parseBase64Url(parts[2]);
    expected = parseBase64Url(parts[3]);
  } catch {
    return false;
  }
  if (salt.byteLength !== 16 || expected.byteLength !== 32) return false;
  const actual = await derivePassword(password, salt, ITERATIONS);
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ expected[i];
  return difference === 0;
}

function emailAddress(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError(400, 'Enter a valid email address.');
  }
  return email;
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
    throw new AuthError(415, 'JSON content type is required.');
  }
  const value = await request.text();
  if (value.length > 4096) throw new AuthError(413, 'Request is too large.');
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch { /* Invalid JSON is handled below. */ }
  throw new AuthError(400, 'Invalid request body.');
}

function cookieName(request: Request): string {
  return isDevelopment(request) ? COOKIE_DEV : COOKIE_PROD;
}

function getCookie(request: Request): string | null {
  const cookie = request.headers.get('Cookie') || '';
  const prefix = cookieName(request) + '=';
  const part = cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(prefix));
  const token = part ? part.slice(prefix.length) : null;
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

function sessionCookie(request: Request, token: string | null): string {
  const secure = isDevelopment(request) ? '' : '; Secure';
  const maxAge = token ? SESSION_SECONDS : 0;
  return cookieName(request) + '=' + (token || '') +
    '; Path=/; HttpOnly; SameSite=Lax' + secure + '; Max-Age=' + maxAge;
}

async function newSession(request: Request, env: AuthEnv, userId: string): Promise<string> {
  const token = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString();
  await env.DB.prepare(
    'INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).bind(await sha256(token), userId, now.toISOString(), expiresAt).run();
  return sessionCookie(request, token);
}

export async function sessionIdentity(request: Request, env: AuthEnv): Promise<AuthIdentity | null> {
  if (!isReportEditorHost(request)) return null;
  const token = getCookie(request);
  if (!token) return null;
  const user = await env.DB.prepare(
    'SELECT u.id, u.email, u.role, u.is_active FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id ' +
    'WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1',
  ).bind(await sha256(token), new Date().toISOString()).first<SessionRow>();
  if (!user || !user.is_active) return null;
  return { id: user.id, email: user.email, role: user.role, authMethod: 'password' };
}

export async function cloudflareAccessIdentity(request: Request, env: AuthEnv): Promise<AuthIdentity> {
  if (isDevelopment(request) && env.DEV_USER_EMAIL) {
    return { email: emailAddress(env.DEV_USER_EMAIL), role: 'admin', authMethod: 'development' };
  }
  if (!env.TEAM_DOMAIN || !env.POLICY_AUD) throw new AuthError(503, 'Cloudflare Access configuration is missing.');
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) throw new AuthError(401, 'Sign in is required.');
  const issuer = env.TEAM_DOMAIN.replace(/\/$/, '');
  if (!jwks || issuer !== jwksDomain) {
    jwksDomain = issuer;
    jwks = createRemoteJWKSet(new URL(issuer + '/cdn-cgi/access/certs'));
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: env.POLICY_AUD });
    if (typeof payload.email !== 'string') throw new Error('Cloudflare Access email is missing.');
    return { email: emailAddress(payload.email), role: 'staff', authMethod: 'access' };
  } catch {
    throw new AuthError(403, 'Cloudflare Access token validation failed.');
  }
}

export async function requestIdentity(request: Request, env: AuthEnv): Promise<AuthIdentity> {
  const user = await sessionIdentity(request, env);
  if (user) return user;
  if (env.AUTH_ALLOW_ACCESS_FALLBACK === 'true' || (isDevelopment(request) && env.DEV_USER_EMAIL)) {
    return cloudflareAccessIdentity(request, env);
  }
  throw new AuthError(401, 'Sign in is required.');
}

export async function bootstrapAvailable(env: AuthEnv): Promise<boolean> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM auth_users').first<{ count: number }>();
  return !row || row.count === 0;
}

async function limitKey(kind: string, value: string): Promise<string> {
  return kind + ':' + await sha256(value);
}

async function limited(env: AuthEnv, key: string, maximum: number): Promise<boolean> {
  const row = await env.DB.prepare('SELECT attempts, expires_at FROM auth_rate_limits WHERE id = ?')
    .bind(key).first<RateRow>();
  return Boolean(row && row.expires_at > new Date().toISOString() && row.attempts >= maximum);
}

async function countAttempt(env: AuthEnv, key: string, minutes: number): Promise<void> {
  const now = new Date().toISOString();
  const expiry = new Date(Date.now() + minutes * 60_000).toISOString();
  await env.DB.prepare(
    'INSERT INTO auth_rate_limits (id, attempts, expires_at) VALUES (?, 1, ?) ' +
    'ON CONFLICT(id) DO UPDATE SET attempts = CASE WHEN auth_rate_limits.expires_at <= ? THEN 1 ELSE auth_rate_limits.attempts + 1 END, ' +
    'expires_at = CASE WHEN auth_rate_limits.expires_at <= ? THEN excluded.expires_at ELSE auth_rate_limits.expires_at END',
  ).bind(key, expiry, now, now).run();
}

async function clearAttempt(env: AuthEnv, keys: string[]): Promise<void> {
  await env.DB.batch(keys.map((key) => env.DB.prepare('DELETE FROM auth_rate_limits WHERE id = ?').bind(key)));
}

function remoteIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

async function login(request: Request, env: AuthEnv): Promise<Response> {
  const body = await jsonBody(request);
  const email = emailAddress(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length > 128) throw new AuthError(401, 'Invalid email or password.');
  const ipKey = await limitKey('login-ip', remoteIp(request));
  const emailKey = await limitKey('login-email', email);
  if (await limited(env, ipKey, 20) || await limited(env, emailKey, 10)) {
    throw new AuthError(429, 'Too many sign-in attempts. Try again in 15 minutes.');
  }
  const user = await env.DB.prepare(
    'SELECT id, email, password_hash, role, is_active FROM auth_users WHERE email = ? LIMIT 1',
  ).bind(email).first<UserRow>();
  // Always perform a costly hash for a non-existent account to reduce enumeration timing differences.
  const valid = user && user.is_active
    ? await verifyPassword(password, user.password_hash)
    : (await derivePassword(password, new Uint8Array(16), ITERATIONS), false);
  if (!valid || !user || !user.is_active) {
    await Promise.all([countAttempt(env, ipKey, 15), countAttempt(env, emailKey, 15)]);
    throw new AuthError(401, 'Invalid email or password.');
  }
  await clearAttempt(env, [ipKey, emailKey]);
  await env.DB.prepare('UPDATE auth_users SET last_login_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), user.id).run();
  const cookie = await newSession(request, env, user.id);
  return response({ email: user.email, role: user.role, authMethod: 'password' }, 200, cookie);
}

async function bootstrap(request: Request, env: AuthEnv): Promise<Response> {
  // Only a JWT authenticated through the existing Cloudflare Access application
  // may create the very first administrator; there is no public registration.
  const accessUser = await cloudflareAccessIdentity(request, env);
  if (!isDevelopment(request) && accessUser.authMethod !== 'access') {
    throw new AuthError(403, 'Cloudflare Access is required for initial account setup.');
  }
  const bootstrapEmail = env.AUTH_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  if (!bootstrapEmail || accessUser.email !== bootstrapEmail) {
    throw new AuthError(403, 'This Cloudflare Access user is not authorised to create the first administrator.');
  }
  const body = await jsonBody(request);
  validatePassword(body.password);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const result = await env.DB.prepare(
    'INSERT INTO auth_users (id, email, password_hash, role, is_active, created_at, updated_at) ' +
    "SELECT ?, ?, ?, 'admin', 1, ?, ? WHERE NOT EXISTS (SELECT 1 FROM auth_users)",
  ).bind(id, accessUser.email, await hashPassword(body.password), now, now).run();
  if (!result.meta.changes) throw new AuthError(409, 'An administrator is already configured.');
  const cookie = await newSession(request, env, id);
  return response({ email: accessUser.email, role: 'admin', authMethod: 'password' }, 201, cookie);
}

async function logout(request: Request, env: AuthEnv): Promise<Response> {
  const token = getCookie(request);
  if (token) {
    await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  }
  return response({ success: true }, 200, sessionCookie(request, null));
}

async function requestPasswordReset(request: Request, env: AuthEnv): Promise<Response> {
  const body = await jsonBody(request);
  const email = emailAddress(body.email);
  const generic = { message: 'If the account exists, a password reset email will be sent.' };
  const ipKey = await limitKey('reset-ip', remoteIp(request));
  const emailKey = await limitKey('reset-email', email);
  if (await limited(env, ipKey, 10) || await limited(env, emailKey, 3)) return response(generic);
  await Promise.all([countAttempt(env, ipKey, 60), countAttempt(env, emailKey, 60)]);
  const user = await env.DB.prepare(
    'SELECT id, email, password_hash, role, is_active FROM auth_users WHERE email = ? LIMIT 1',
  ).bind(email).first<UserRow>();
  if (user?.is_active && env.RESEND_API_KEY) {
    const token = randomToken();
    const now = new Date();
    await env.DB.prepare(
      'INSERT INTO auth_password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    ).bind(await sha256(token), user.id, now.toISOString(), new Date(now.getTime() + 60 * 60_000).toISOString()).run();
    const url = new URL('https://report.creation.proinspect.systems/');
    url.searchParams.set('reset_password', token);
    try {
      await sendResendEmail(env, {
        to: [user.email],
        subject: 'Reset your ProInspect password',
        html: emailBody('A password reset was requested for your ProInspect account. This link expires in one hour. If you did not request it, no action is required.', {
          label: 'Reset password',
          url: url.toString(),
        }),
        idempotencyKey: 'auth-reset-' + await sha256(token),
      });
    } catch {
      console.error('Password reset email delivery failed.');
    }
  }
  return response(generic);
}

async function confirmPasswordReset(request: Request, env: AuthEnv): Promise<Response> {
  const body = await jsonBody(request);
  const token = typeof body.token === 'string' ? body.token : '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AuthError(400, 'Invalid or expired reset link.');
  validatePassword(body.password);
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    'SELECT user_id FROM auth_password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
  ).bind(tokenHash, new Date().toISOString()).first<{ user_id: string }>();
  if (!row) throw new AuthError(400, 'Invalid or expired reset link.');
  const now = new Date().toISOString();
  const update = await env.DB.prepare(
    'UPDATE auth_password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
  ).bind(now, tokenHash, now).run();
  if (!update.meta.changes) throw new AuthError(400, 'Invalid or expired reset link.');
  await env.DB.batch([
    env.DB.prepare('UPDATE auth_users SET password_hash = ?, updated_at = ? WHERE id = ? AND is_active = 1')
      .bind(await hashPassword(body.password), now, row.user_id),
    env.DB.prepare('DELETE FROM auth_sessions WHERE user_id = ?').bind(row.user_id),
    env.DB.prepare('DELETE FROM auth_password_resets WHERE user_id = ?').bind(row.user_id),
  ]);
  return response({ success: true, message: 'Password updated. Sign in with your new password.' }, 200,
    sessionCookie(request, null));
}

export async function handleAuthApi(request: Request, env: AuthEnv): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith('/api/auth/')) return null;
  if (!isReportEditorHost(request)) throw new AuthError(404, 'API route not found.');
  assertSameOrigin(request);
  if (pathname === '/api/auth/status' && request.method === 'GET') {
    const identity = await requestIdentity(request, env);
    return response({ authMethod: identity.authMethod, bootstrapAvailable: (identity.authMethod === 'access' || identity.authMethod === 'development') &&
      Boolean(env.AUTH_BOOTSTRAP_EMAIL && identity.email === env.AUTH_BOOTSTRAP_EMAIL.trim().toLowerCase())
      ? await bootstrapAvailable(env) : false });
  }
  if (request.method !== 'POST') throw new AuthError(405, 'Method not allowed.');
  if (pathname === '/api/auth/login') return login(request, env);
  if (pathname === '/api/auth/bootstrap') return bootstrap(request, env);
  if (pathname === '/api/auth/logout') return logout(request, env);
  if (pathname === '/api/auth/password-reset/request') return requestPasswordReset(request, env);
  if (pathname === '/api/auth/password-reset/confirm') return confirmPasswordReset(request, env);
  throw new AuthError(404, 'API route not found.');
}
