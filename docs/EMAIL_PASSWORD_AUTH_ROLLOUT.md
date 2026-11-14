# D1 email/password authentication rollout

This release adds application-managed email/password login to the Report Creation Tool. It does not change any existing report, property, R2, delivery or public-signing data. It intentionally does **not** offer public signup.

## Components

- \`migrations/0003_email_password_auth.sql\` adds users, sessions, password-reset tokens and rate-limit counters.
- \`worker/auth.ts\` authenticates passwords using PBKDF2-HMAC-SHA256 (600,000 iterations, per-user random salt), checks hashed session tokens in D1, uses secure HttpOnly SameSite cookies, and provides first-admin setup and email-based recovery.
- \`src/components/AuthGate.tsx\` provides login, first-admin setup, forgot-password, reset-password and logout.
- The existing Cloudflare Access JWT verification remains available only while \`AUTH_ALLOW_ACCESS_FALLBACK=true\` and is needed for secure first-admin setup.
- Existing \`/api/public/*\` signing remains outside staff authentication. Authentication endpoints only accept requests on the report-creation hostname (or local development).

## Safe release sequence

1. Keep Cloudflare Access protecting \`report.creation.proinspect.systems\`. Do not change Access policies or signing hostnames yet.
2. Take a D1 backup: \`bun run db:backup\`. Keep the backup protected outside the public repository.
3. Apply additive D1 migration: \`bun run db:migrate:remote\`.
4. Run \`bun run lint\`, \`bun run auth:verify\`, \`bun run signing-origin:verify\`, \`bun run platform:verify\`, and \`bun run build\`. The pull request CI also performs these checks.
5. Deploy the Worker with \`AUTH_ALLOW_ACCESS_FALLBACK=true\` as currently set in \`wrangler.jsonc\`. Keep existing configured secrets, D1/R2 bindings, and all three route hostnames.
6. Sign in through the existing Cloudflare Access page at https://report.creation.proinspect.systems/ with the intended administrator's approved email account. The first administrator email is explicitly controlled by `AUTH_BOOTSTRAP_EMAIL` (currently `info@proinspect.systems` in `wrangler.jsonc`); confirm this is the intended account before deployment. The initial setup page offers to create the first password; the initial setup supports a 10-character password; 12 or more characters is recommended for future password changes. Passwords must **never** be sent to GitHub, logs, support chat, or other users.
7. Confirm the administrator can sign out, sign in with that email/password, load existing reports and photographs, edit and save a test draft, generate a PDF, and still use public signing links.
8. Cut over the **report-creation hostname only** from the Cloudflare Access edge policy to the built-in login page, ensuring no other routes/hostnames lose their intended protection. The now-unprotected static HTML serves the login UI, while all non-public report APIs require an authenticated session.
9. In \`wrangler.jsonc\`, set \`AUTH_ALLOW_ACCESS_FALLBACK\` to \`false\`, build and deploy. This removes Access JWT acceptance for report APIs after cutover. Verify unauthenticated \`/api/me\` returns 401, invalid passwords fail, successful login sets a secure HttpOnly session cookie, and signing APIs remain functional.
10. Update \`.github/workflows/production-smoke.yml\` if the Access-edge check still expects the editor HTML to redirect: after cutover the editor HTML should respond with 200, but \`/api/me\` must return 401 without a session.

Do not remove Access or disable fallback before the first administrator is created and verified; doing so would lock out staff. Do not place passwords in wrangler variables or D1 SQL. Preserve the JWT issuer/audience settings during the rollback window.

## Recovery and rollback

- If the new login page is broken, keep Cloudflare Access enabled and \`AUTH_ALLOW_ACCESS_FALLBACK=true\` while reverting the affected Worker version.
- The new tables can remain in D1; existing reporting schemas and records are untouched.
- Once \`AUTH_ALLOW_ACCESS_FALLBACK=false\`, old Access JWTs can no longer reach protected report APIs. Re-enable the fallback only if Cloudflare Access protection is restored at the edge first.
- Password reset uses the existing \`RESEND_API_KEY\` / \`RESEND_FROM_EMAIL\` integration and sends one-hour reset links. Confirm the sender/domain is configured and that reset emails deliver before cutover.

## Security boundaries and operational notes

- No public user registration; only the authorised existing Cloudflare Access user matching `AUTH_BOOTSTRAP_EMAIL` can bootstrap an admin account. Provisioning additional users requires a separate admin-controlled workflow.
- Session token validity is checked in D1 on each protected request; sessions last 7 days and are revoked on logout or password reset.
- Login attempts are limited by email and IP using D1 counters; deployment-level Cloudflare WAF rate-limiting can add another layer. Consider scheduled cleanup of expired sessions, reset tokens and counters.
- All state-changing staff and authentication routes reject cross-origin requests.
- The browser's offline report cache has a separate local-device access threat model. Offline work remains available within an already authenticated, running editor, but a fresh page load requires online sign-in. Signing out clears cached report and queued offline storage only after the unsynchronised-operation queue is empty. Test field workflows before rollout.
- Do not disable the existing signing-domain policies or modify the public signing token flow during this change.
