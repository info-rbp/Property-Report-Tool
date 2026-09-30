# Property Report Tool - Stage 1 application freeze

Status: **FROZEN FOR STAGE 2 INTEGRATION INPUT**

Date: 28 September 2026

This document closes the application-wide Stage 1 hardening review of the `hardening/final-application-freeze` branch. It complements `docs/REPORT_FUNCTIONALITY_FREEZE.md`, which remains the authoritative report-template and deterministic-PDF rendering baseline.

This freeze does not merge the branch, deploy it, migrate its Cloudflare data, or move the Report Tool into the ProInspect portal repository.

## Frozen application scope

The Stage 1 application baseline includes:

- the frozen 23-template deterministic report catalogue;
- D1-backed Property and report metadata;
- R2-backed inspection photographs and issued PDFs;
- Cloudflare Access authentication boundary;
- viewer/editor/admin authorisation hooks;
- report JSON schema versioning and compatibility migrations;
- atomic revision-aware draft saves;
- stale cross-device write rejection and explicit conflict recovery;
- revision-bound photograph mutations and report finalisation;
- immutable completed-report correction/superseding workflow;
- stable photo-to-area and Building Manager photo-to-item relationships;
- property duplicate detection, editing and archiving;
- Perth-local date handling and validation;
- completed-report cache purge and draft-cache expiry;
- isolated/unique storage object writes and recovery copies;
- photo-manifest integrity checks;
- PDF byte/signature validation before finalisation;
- completed-only email preparation;
- deterministic PDF regression coverage and retained acceptance artifacts.

## Acceptance gate

The frozen input is the exact branch commit for which the normal **Verify V1** workflow succeeds after this file is present and the temporary Stage 1 repair workflows have been removed.

The normal gate must pass:

1. frozen dependency installation;
2. dependency security verification;
3. TypeScript validation;
4. production Vite build;
5. production authentication-boundary regression;
6. Worker API, concurrency, authorisation and storage integration tests;
7. deterministic PDF regression generation;
8. retention of PDF/source-SHA evidence;
9. Wrangler production deployment dry-run.

Any later branch change invalidates the freeze until the normal gate succeeds again at the new exact head.

## Security and integrity corrections completed during Stage 1

The final hardening pass specifically closes defects and risks around:

- conflicting/stale report writes;
- concurrent photo mutations and finalisation;
- storage-object collision/race behavior;
- invalid or incomplete photo manifests;
- production authentication boundary behavior;
- finalisation of content that is not structurally a PDF;
- recovery of photographs and issued PDFs;
- correction of already-issued reports without mutating the original issue.

## Stage 2 integration boundary

The Report Tool remains a specialist application during platform convergence. Stage 2 should integrate it through controlled Admin/Work Order/Property context and an issued-document handoff into the canonical ProInspect `propertyDocuments` model.

Stage 2 must not silently replace D1/R2 with Firestore/Google Cloud Storage, copy the PDF engine into the portal repository, or weaken the Report Tool's revision/finalisation controls. Any later runtime migration is a separately tested infrastructure/data migration decision.

No broad feature development should be added after this freeze. Permitted changes are limited to tested defects, security/compliance corrections and Stage 2 integration compatibility.

Production Report Tool `main` and the live deployment remain unchanged by this freeze.
