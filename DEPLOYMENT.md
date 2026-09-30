# ProInspect Property Reports - Cloudflare Deployment

V1 is deployed as a single Cloudflare Workers application containing:

- React/Vite static assets.
- A Worker API under `/api/*`.
- Cloudflare D1 for Properties and report JSON.
- Cloudflare R2 primary storage for inspection photos and completed PDFs.
- A separate Cloudflare R2 recovery bucket containing mirrored inspection photos and issued PDFs.
- Cloudflare Access for staff authentication.

PDF generation remains browser-side, but the production renderer now builds the PDF directly from report data using jsPDF. It does not rasterise the React/Tailwind preview with html2canvas. Cloudflare stores the final issued PDF after generation.

## Production resources

- Worker: `proinspect-property-report-creation-tool`
- Current Worker URL: `https://proinspect-property-report-creation-tool.delicate-dream-e4c9.workers.dev/`
- Active production hostname: `https://report.creation.proinspect.systems/`
- D1 database: `proinspect-property-reports`
- D1 database ID: `777186a0-e6ca-43f5-8f50-448bd4454046`
- Primary R2 bucket: `proinspect-property-reports-data`
- Recovery R2 bucket: `proinspect-property-reports-recovery`
- D1 binding: `DB`
- Primary R2 binding: `REPORT_STORAGE`
- Recovery R2 binding: `REPORT_RECOVERY_STORAGE`
- Cloudflare Access team domain: `https://delicate-dream-e4c9.cloudflareaccess.com`
- Access policy: approved users with `@remotebusinesspartner.com.au`

The R2 S3 API endpoint is not required by the application. The Worker accesses both buckets through native Worker bindings, so no S3 credentials belong in the repository. New inspection photos and issued PDFs are written to both primary and recovery storage. Read operations fall back to the recovery bucket if the primary object is unavailable.

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

The initial production migration has already been applied. Before deploying the application-hardening release, migration `0002_application_hardening.sql` must also be applied. The repository deployment command now ensures the recovery R2 bucket exists, applies pending remote D1 migrations, and only then deploys the Worker:

```bash
bun run deploy
```

Do not deploy the hardened Worker against the pre-hardening D1 schema.

## Cloudflare Access

The Worker expects:

```text
TEAM_DOMAIN=https://delicate-dream-e4c9.cloudflareaccess.com
POLICY_AUD=<stored in Cloudflare runtime configuration>
DEFAULT_ROLE=editor
ADMIN_EMAILS=<comma-separated addresses, optional>
EDITOR_EMAILS=<comma-separated addresses, optional>
VIEWER_EMAILS=<comma-separated addresses, optional>
```

Cloudflare Access remains the authentication perimeter. Application authorization is then applied as follows:

- `viewer`: read properties/reports and download issued PDFs;
- `editor`: viewer permissions plus create/edit/finalise/correct reports and edit properties;
- `admin`: editor permissions plus archive/restore properties.

Explicit email lists override `DEFAULT_ROLE`. If no role variables are supplied, authenticated users default to `editor` to preserve the existing production workflow.

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
- high-severity dependency advisory audit;
- browser TypeScript validation;
- Worker TypeScript validation;
- production Vite build;
- local Worker/D1/R2 integration regression;
- deterministic PDF regression and artifact export;
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
- Every report has a monotonic integer revision. Draft saves, photo mutations, deletion and finalisation use atomic compare-and-set writes against that revision; stale operations receive HTTP 409.
- Migration 0002 removes the legacy Entry/Routine/Exit report-type constraint. `report_type` now stores the canonical report type for every template.
- Completed reports may be corrected only by creating a linked replacement draft. When the replacement is issued, the original is retained as `superseded` rather than altered or deleted.
- Properties support archive/restore rather than destructive deletion.

Primary R2:
- `reports/<report-id>/photos/<photo-id>.jpg`
- `reports/<report-id>/completed/report.pdf`

Recovery R2:
- `recovery/reports/<report-id>/photos/<photo-id>.jpg`
- `recovery/reports/<report-id>/completed/report.pdf`

New evidence and issued PDFs are mirrored during the same application operation. Reads fall back to recovery storage when the primary object is unavailable. Draft cleanup removes both copies.

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
- 23 selectable report templates across Residential, Commercial, Maintenance, Building / Strata and Custom.
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
