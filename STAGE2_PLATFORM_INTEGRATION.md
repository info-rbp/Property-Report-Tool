# Stage 2 - ProInspect Platform Integration

Status: **FROZEN AS A STAGE 2 COMPANION INPUT**

Date: 28 September 2026

This branch starts from the frozen Stage 1 Property Report Tool baseline and adds only the integration compatibility required by the ProInspect platform-unification release. It does not merge the Report Tool into the booking/portal repository, migrate D1/R2 to Google Cloud, or deploy production.

## Integration contract

The Report Tool remains the specialist report-authoring runtime.

The platform integration is two-way:

1. An authorised ProInspect staff user selects canonical Property and optional Booking, Work Order and Tenancy context in the Admin Portal.
2. The ProInspect platform issues a five-minute HMAC-signed handoff token.
3. The Report Tool accepts the handoff only after its normal Cloudflare Access authentication and editor/admin role check.
4. The Worker verifies the token signature, expiry, issuer and report type. Browser code never trusts the raw token payload.
5. The Report Tool finds or creates its local property container using the canonical ProInspect Property ID as the stable reference and creates the requested report.
6. Canonical integration context is retained in the report JSON.
7. On finalisation, the Report Tool first completes its revision-aware compare-and-set transition so only the immutable winning PDF can be published.
8. The completed PDF is then published server-to-server to the ProInspect report-ingestion endpoint.
9. The ProInspect platform validates Property/Tenancy/Booking/Work Order relationships and creates the canonical `propertyDocuments` record.
10. Publication uses the Report Tool report ID as an idempotency key. If platform publication fails after local completion, the immutable PDF remains safely stored and the Report Tool exposes an explicit **Sync to ProInspect** retry action. Retrying publication cannot create duplicate canonical documents or files.

## Security boundary

The following values are Worker/server secrets and must never be exposed to browser code:

- `PROINSPECT_HANDOFF_SIGNING_KEY`
- `PROINSPECT_INGEST_URL`
- `PROINSPECT_INGEST_TOKEN`

The handoff signing key matches `REPORT_HANDOFF_SIGNING_KEY` in the main ProInspect application. The ingest token matches `REPORT_INGEST_TOKEN`.

The existing Cloudflare Access boundary, Report Tool role model, revision conflict controls, PDF validation, immutable completion, recovery storage and correction/superseding behaviour remain authoritative.

## Acceptance gate

This integration companion is accepted only at an exact commit where the normal **Verify V1** workflow succeeds. That workflow includes:

- frozen dependency installation;
- dependency security audit;
- TypeScript validation;
- production build;
- platform handoff regression contract;
- production authentication-boundary verification;
- Worker API/concurrency/authorisation/storage integration;
- deterministic PDF regression;
- exact source-SHA artifact;
- Wrangler deployment dry-run.

Any later branch change invalidates the accepted Stage 2 companion SHA until the full gate passes again.

No production deployment or merge is authorised by this document.
