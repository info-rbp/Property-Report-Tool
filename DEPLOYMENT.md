# ProInspect Property Reports - Cloudflare Deployment

V1 is deployed as a single Cloudflare Workers application containing:

- React/Vite static assets.
- A Worker API under `/api/*`.
- Cloudflare D1 for Properties and report JSON.
- Cloudflare R2 for inspection photos and completed PDFs.
- Cloudflare Access for staff authentication.

PDF rendering remains browser-side. Cloudflare stores the final issued PDF after the browser generates it.

## Production resources

- Worker: `proinspect-property-report-creation-tool`
- Current Worker URL: `https://proinspect-property-report-creation-tool.delicate-dream-e4c9.workers.dev/`
- Target production hostname: `reports.proinspect.systems`
- D1 database: `proinspect-property-reports`
- D1 database ID: `777186a0-e6ca-43f5-8f50-448bd4454046`
- R2 bucket: `proinspect-property-reports-data`
- D1 binding: `DB`
- R2 binding: `REPORT_STORAGE`
- Cloudflare Access team domain: `https://delicate-dream-e4c9.cloudflareaccess.com`
- Access policy: approved users with `@remotebusinesspartner.com.au`

The R2 S3 API endpoint is not required by the application. The Worker accesses R2 through the native `REPORT_STORAGE` binding, so no S3 credentials belong in the repository.

## Current production status

Completed:
- Worker deployment is live.
- Bun is pinned at 1.4.2.
- D1 and R2 bindings are configured.
- The production D1 schema has been initialized.
- Cloudflare Access is enabled and the Worker validates the Access JWT.
- The application loads and can use cloud-backed Properties and reports.

The Access application audience value (`POLICY_AUD`) is intentionally stored only in Cloudflare runtime configuration and is not committed to GitHub.

## Install dependencies

```bash
bun install --frozen-lockfile
```

The repository pins Bun through:

```json
"packageManager": "bun@1.4.2"
```

Cloudflare Builds should also use:

```text
BUN_VERSION=1.4.2
```

## Database migrations

For local development:

```bash
bun run db:migrate:local
```

For production after any future migration is added:

```bash
bun run db:migrate:remote
```

The initial production migration has already been applied.

## Cloudflare Access

The Worker expects:

```text
TEAM_DOMAIN=https://delicate-dream-e4c9.cloudflareaccess.com
POLICY_AUD=<stored in Cloudflare runtime configuration>
```

The Worker validates `Cf-Access-Jwt-Assertion` before allowing any `/api/*` request.

The current policy intentionally allows authenticated users in the `remotebusinesspartner.com.au` email domain.

## Local development

Copy the local authentication example:

```bash
cp .dev.vars.example .dev.vars
bun run dev
```

The `DEV_USER_EMAIL` bypass is accepted only on localhost/127.0.0.1 and is never used for production requests.

## Verification

Permanent GitHub verification runs on pull requests and pushes to `main`:

- frozen Bun dependency install;
- browser TypeScript validation;
- Worker TypeScript validation;
- production Vite build;
- Wrangler deployment dry-run.

Manual commands:

```bash
bun run lint
bun run build
bunx wrangler deploy --dry-run
```

## Deploy

```bash
bun run deploy
```

The application uses Workers Static Assets with `/api/*` routed to the Worker first.

## Production hostname

The selected production hostname is:

```text
reports.proinspect.systems
```

Do not add the route to `wrangler.jsonc` until the `proinspect.systems` zone is confirmed to be managed in the same Cloudflare account.

When ready, attach it under:

```text
Workers & Pages
  -> proinspect-property-report-creation-tool
  -> Settings
  -> Domains & Routes
  -> Add
  -> Custom Domain
```

Then add `reports.proinspect.systems` to the existing Cloudflare Access application so the same staff authentication policy protects the custom hostname.

Keep the `workers.dev` address available during cutover/testing. It can be disabled later if desired.

## Production data model

D1:
- `properties` - address/reference/notes and audit fields.
- `reports` - report type/status, report JSON, completed PDF key and audit fields.

R2:
- `reports/<report-id>/photos/<photo-id>.jpg`
- `reports/<report-id>/completed/report.pdf`

Completed reports cannot be edited or deleted through the V1 API.

## Backups and retention

See `DATA_RETENTION.md`.

D1 exports can be created with:

```bash
bun run db:backup
```

Database exports are stored under `backups/`, which is gitignored and must never be committed.

## Security

Static assets receive security headers from `public/_headers`.

Worker-generated API/file responses also receive security headers in `worker/index.ts`.

Cloudflare Access remains the primary authentication perimeter.

## GitHub / Google AI Studio workflow

The repository remains the source of truth:

```text
Google AI Studio <-> GitHub main -> Cloudflare Workers deployment
```

Cloudflare-specific files are ordinary repository files and do not change the Google AI Studio editing model.

## V1 scope

Included:
- Properties as report containers.
- Entry, Routine and Exit reports.
- CSV commentary import.
- Device photo upload with browser resize/compression.
- Cross-device cloud drafts.
- Browser PDF generation.
- Stored final PDFs.
- Prepared email workflow.
- Cloudflare Access staff authentication.

Not included:
- Property management, rent, lease or maintenance modules.
- Landlord/tenant portals.
- Google Drive or Google Sheets.
- Firebase.
- AI commentary generation.
- Direct email sending.
