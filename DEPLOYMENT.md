# ProInspect Property Reports - Cloudflare Deployment

V1 is a single Cloudflare Workers application containing:

- React/Vite static assets.
- A Worker API under `/api/*`.
- Cloudflare D1 for Properties and report JSON.
- Cloudflare R2 for inspection photos and completed PDFs.
- Cloudflare Access for staff authentication.

PDF rendering remains browser-side. Cloudflare stores the final PDF after the browser generates it.

## 1. Install dependencies

```bash
bun install
```

## 2. Create Cloudflare storage

Create the D1 database:

```bash
bunx wrangler d1 create proinspect-property-reports
```

Copy the returned database ID into `wrangler.jsonc` in place of:

```text
REPLACE_WITH_D1_DATABASE_ID
```

Create the R2 bucket:

```bash
bunx wrangler r2 bucket create proinspect-property-reports
```

## 3. Apply the D1 schema

For local development:

```bash
bun run db:migrate:local
```

For production:

```bash
bun run db:migrate:remote
```

## 4. Local development

Copy the local authentication example:

```bash
cp .dev.vars.example .dev.vars
bun run dev
```

The `DEV_USER_EMAIL` bypass is accepted only on localhost/127.0.0.1. It is not used for production requests.

## 5. Build verification

```bash
bun run lint
bun run build
bunx wrangler deploy --dry-run
```

## 6. First deployment

```bash
bun run deploy
```

The application uses Cloudflare Workers Static Assets with `/api/*` routed to the Worker first.

## 7. Enable Cloudflare Access

In Cloudflare, protect the production Worker/custom hostname with Access and restrict it to the ProInspect staff email addresses or approved email domain.

After creating the Access application, obtain:

- Team domain, for example `https://your-team.cloudflareaccess.com`
- Application Audience (AUD) tag

Configure the Worker variables `TEAM_DOMAIN` and `POLICY_AUD` in Cloudflare. They may be stored as encrypted secrets if preferred.

The Worker validates the `Cf-Access-Jwt-Assertion` JWT against the Access signing keys before any API request is allowed.

## 8. Production data model

D1:
- `properties` - address/reference/notes and audit fields.
- `reports` - report type/status, report JSON, PDF key and audit fields.

R2:
- `reports/<report-id>/photos/<photo-id>.jpg`
- `reports/<report-id>/completed/report.pdf`

Completed reports cannot be edited or deleted through the V1 API.

## 9. GitHub / Google AI Studio workflow

The repository remains the source of truth:

```text
Google AI Studio <-> GitHub main -> Cloudflare Workers deployment
```

Cloudflare-specific files are ordinary repository files and do not change the application's Google AI Studio editing model.

## 10. V1 scope

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
