# ProInspect Property Reports - Cloudflare Deployment

V1 is deployed as a single Cloudflare Workers application containing:

- React/Vite static assets.
- A Worker API under `/api/*`.
- Cloudflare D1 for Properties and report JSON.
- Cloudflare R2 for inspection photos and completed PDFs.
- Cloudflare Access for staff authentication.

PDF rendering remains browser-side. Cloudflare stores the final PDF after the browser generates it.

## Production resources

The repository is configured for the following live Cloudflare resources:

- Worker: `proinspect-property-report-creation-tool`
- D1 database: `proinspect-property-reports`
- D1 database ID: `777186a0-e6ca-43f5-8f50-448bd4454046`
- R2 bucket: `proinspect-property-reports-data`
- D1 binding: `DB`
- R2 binding: `REPORT_STORAGE`

The R2 S3 API endpoint is not required by the application. The Worker accesses R2 through the native `REPORT_STORAGE` binding, so no S3 credentials should be added to the repository.

## 1. Install dependencies

```bash
bun install --frozen-lockfile
```

The repository pins Bun through:

```json
"packageManager": "bun@1.4.2"
```

Cloudflare Builds should also have:

```text
BUN_VERSION=1.4.2
```

## 2. Apply the D1 schema

The D1 database exists, but the application requires the repository migration to be applied before first use.

For local development:

```bash
bun run db:migrate:local
```

For production:

```bash
bun run db:migrate:remote
```

The production migration creates the `properties` and `reports` tables and their indexes.

## 3. Configure Cloudflare Access

Protect the production Worker/custom hostname with Cloudflare Access and restrict it to approved ProInspect staff email addresses or an approved email domain.

After creating the Access application, obtain:

- Team domain, for example `https://your-team.cloudflareaccess.com`
- Application Audience (AUD) tag

Configure these Worker variables in Cloudflare:

```text
TEAM_DOMAIN=https://your-team.cloudflareaccess.com
POLICY_AUD=<application-audience-tag>
```

The Worker validates `Cf-Access-Jwt-Assertion` before allowing any `/api/*` request.

## 4. Local development

Copy the local authentication example:

```bash
cp .dev.vars.example .dev.vars
bun run dev
```

The `DEV_USER_EMAIL` bypass is accepted only on localhost/127.0.0.1 and is never used for production requests.

## 5. Build verification

```bash
bun run lint
bun run build
bunx wrangler deploy --dry-run
```

## 6. Deploy

```bash
bun run deploy
```

The application uses Workers Static Assets with `/api/*` routed to the Worker first.

For Cloudflare connected builds, the repository Worker name now matches the connected Worker name:
`proinspect-property-report-creation-tool`.

## 7. Production data model

D1:
- `properties` - address/reference/notes and audit fields.
- `reports` - report type/status, report JSON, completed PDF key and audit fields.

R2:
- `reports/<report-id>/photos/<photo-id>.jpg`
- `reports/<report-id>/completed/report.pdf`

Completed reports cannot be edited or deleted through the V1 API.

## 8. GitHub / Google AI Studio workflow

The repository remains the source of truth:

```text
Google AI Studio <-> GitHub main -> Cloudflare Workers deployment
```

Cloudflare-specific files are ordinary repository files and do not change the Google AI Studio editing model.

## 9. V1 scope

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
