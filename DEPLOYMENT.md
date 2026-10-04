# ProInspect Property Reports - Cloudflare Deployment

V1 is deployed as a single Cloudflare Workers application containing:

- React/Vite static assets.
- A Worker API under `/api/*`.
- Cloudflare D1 for Properties and report JSON.
- Cloudflare R2 for inspection photos and completed PDFs.
- Cloudflare Access for staff authentication.

PDF generation remains browser-side, but the production renderer now builds the PDF directly from report data using jsPDF. It does not rasterise the React/Tailwind preview with html2canvas. Cloudflare stores the final issued PDF after generation.

## Production resources

- Worker: `proinspect-property-report-creation-tool`
- Current Worker URL: `https://proinspect-property-report-creation-tool.delicate-dream-e4c9.workers.dev/`
- Active production hostname: `https://report.creation.proinspect.systems/`
- Public signing origin: `https://proinspect-property-report-creation-tool.delicate-dream-e4c9.workers.dev/`
- Legacy signing hostname `https://sign.proinspect.systems/` remains routed but is not used for new signing invitations while its Cloudflare Access policy is present.
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
- The production custom hostname is active at `https://report.creation.proinspect.systems/`.
- ProInspect report business address is set to `19 Bonnard Crescent Ashby WA 6065`.
- Initial D1 backup/retention setup is marked actioned.
- Repository production documentation has been updated.
- The authenticated end-to-end application workflow has been completed successfully.

Production renderer status:
- The deterministic renderer has passed the large Entry-report production test and the Entry/Routine/Exit template regressions.
- All 24 report definitions, including the hidden legacy Building Management compatibility template, are generated in CI on every verification run. There are 23 selectable report templates in the application, including the manually configurable Custom Report.
- CI includes deliberately oversized Routine and generic findings, a long-content Custom Report, long metadata, filled Building Manager Daily/Monthly reports, schema-migration checks and structural validation checks.
- Representative hardened PDFs have been rendered and visually reviewed after the full rendering audit, including Entry, Exit, Routine continuation pages, generic inspection/maintenance reports, filled Building Manager reports and the dedicated Key Receipt (including multi-page key-list stress output).
- Screen previews are non-authoritative summaries. The downloaded deterministic PDF is the acceptance output for pagination and issued-report layout.
- Real-world operational acceptance remains appropriate as each materially changed template is first used with live data, particularly for device-supplied photographs.

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

The active production hostname is:

```text
https://report.creation.proinspect.systems/
```

The custom hostname is attached to `proinspect-property-report-creation-tool` and is protected by the existing Cloudflare Access policy for approved `@remotebusinesspartner.com.au` users.

Keep the `workers.dev` address available as a deployment fallback unless ProInspect later decides to disable it.

## Production data model

D1:
- `properties` - address/reference/notes and audit fields.
- `reports` - status, versioned report JSON, completed PDF key and audit fields.
- Report JSON is schema-versioned and passes through `src/lib/reportMigration.ts` when read/written so future structural changes have an explicit migration path.
- Draft saves carry the last known `updated_at` version; stale cross-device saves receive HTTP 409 instead of silently overwriting a newer draft.
- The initial D1 schema restricts the indexed `report_type` column to Entry/Routine/Exit. Extended templates keep their canonical report type inside `report_data` and use a backward-compatible value in the legacy indexed column. Report summaries read the canonical JSON type. No database migration is required for the expanded catalogue.

R2:
- `reports/<report-id>/photos/<photo-id>.jpg`
- `reports/<report-id>/completed/report.pdf`

Completed reports cannot be edited or deleted through the V1 API.

Completed PDFs are streamed from the Worker request directly into R2 instead of first being loaded into Worker memory. The application enforces a 90 MB completed-PDF ceiling, leaving headroom under Cloudflare's 100 MB request-body limit on the Free plan.

## Backups and retention

See `DATA_RETENTION.md`. The report-template and deterministic-renderer freeze baseline is recorded in `docs/REPORT_FUNCTIONALITY_FREEZE.md`.

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
- 22 selectable report templates across Residential, Commercial, Maintenance and Building / Strata.
- Entry, Routine and Exit remain dedicated production templates.
- Extended reports use catalogue-driven condition, inspection, maintenance/verification, operations and event/handover template families.
- Building Manager Daily and Monthly reports use a dedicated Category / Reporting Item / Activity Summary / Actions / Photos layout and require photos to be linked to a current reporting item before finalisation.
- Key Receipt uses a dedicated compact tenancy handover form with tenant details, a quantity-based key/access-device register and tenant acknowledgement/signature lines. It intentionally does not use CSV commentary import or report photos.
- CSV commentary import.
- Device photo upload with browser resize/compression.
- Cross-device cloud drafts.
- Deterministic browser PDF generation from report data.
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


## Access boundary

The staff/editor hostname remains protected by Cloudflare Access. Public recipient signing uses the Worker’s `workers.dev` origin so token-scoped signing links do not depend on staff Access policy. Protected report APIs still require a valid Access JWT even when reached through the public Worker origin; only `/api/public/workflow-health` and `/api/public/signing/<token>/...` are deliberately public.

Do not point `SIGNING_BASE_URL` back to `sign.proinspect.systems` until that hostname has a reviewed public-signing Access policy and the production smoke is updated and passing.
