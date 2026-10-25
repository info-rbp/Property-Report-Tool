# ProInspect Platform Bridge (review-required integration)

Source code revision pinned to `ed55b4409d7caf668b4cb62c8a27fc79a8d2ce68` with the changes on the integration branch.

The Staff tool lives at `https://report.creation.proinspect.systems` under Cloudflare Access; the canonical client and document system lives at `https://proinspect.systems`. The two independent D1/R2 datasets remain isolated: *only a staff-reviewed PDF becomes a ProInspect document*.

1. Configure `PROINSPECT_HANDOFF_SIGNING_KEY` (same secret as platform `REPORT_TOOL_V2_HANDOFF_KEY`) and `PROINSPECT_INGEST_TOKEN` (same secret as platform `REPORT_TOOL_V2_INGEST_TOKEN`) using Cloudflare encrypted secrets. Do not store either in GitHub, logs, or customer-visible configuration.
2. Set `PROINSPECT_INGEST_URL=https://proinspect.systems/api/integrations/property-report-tool/ingest` as the Report Tool Worker variable. No customer data is migrated.
3. On the platform, configure `REPORT_TOOL_V2_ORIGIN=https://report.creation.proinspect.systems` and apply its approved additive migration before enabling the new "Create in Property Report Tool" link.
4. ProInspect issues a ten-minute HMAC signed handoff tied to a specific Staff email and Work Order. Publishing is allowed for 90 days unless Staff/Work Order access is revoked.
5. Cloudflare Access authenticates the same Staff user at the Report Tool. The Report Tool checks the signed token, email and report type and creates a report with a canonical handoff ID.
6. When the completed PDF is finalised, the tool sends it to the platform with a bearer secret, source report ID, handoff ID, property ID, Work Order ID, and PDF bytes. The platform enforces one-use correlation and idempotent checksum checks.
7. **Acceptance is not issuance.** The platform stores the PDF privately in the document review queue. Its existing authorised Staff review and explicit document-issue workflows govern client/tenancy/scheme visibility. Direct email/send-for-signature is blocked for these platform-linked reports.
8. A failed publication leaves the completed original PDF in the Report Tool R2. Use "Sync to ProInspect" to retry after investigating the error; do not regenerate a different report under a consumed handoff.

Scope of this integration: property-backed Work Orders with source PDFs at most 10 MiB. Scheme-only, larger report PDFs, bulk historical migration, legal template verification, fully in-process native editing, client signing after authorised issue and representative real-device offline acceptance remain separate upgrades.

Run `bun run lint && bun run pdf:verify && bun run platform:verify && bun run build` and complete a genuine paired Worker staging test with a synthetic property, assigned Staff user, production-equivalent secrets, and a reviewed document that is denied to clients before explicit issue.
