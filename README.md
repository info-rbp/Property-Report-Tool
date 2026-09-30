# ProInspect Property Reports

Cloud-backed internal property reporting application for ProInspect.

Production: `https://report.creation.proinspect.systems/`

## V1 workflow

```text
Properties
  -> Select a report template from the Residential / Commercial / Maintenance / Building / Custom catalogue
  -> Import commentary from CSV or use the seeded report areas
  -> Upload inspection photos from the device
  -> Review report
  -> Generate deterministic PDF from report data
  -> Finalise and store the issued PDF
```

## Production architecture

- React + Vite frontend served as Cloudflare Workers Static Assets.
- Cloudflare Worker API under `/api/*`.
- Cloudflare D1 for Properties, report metadata and report JSON.
- Cloudflare R2 primary storage for compressed inspection photos and completed PDFs, with an independently bound recovery R2 bucket for mirrored evidence and issued PDFs.
- Cloudflare Access for staff authentication.
- IndexedDB as a local draft cache only.
- Browser-side deterministic PDF generation using `jsPDF` directly from report data; final PDFs do not depend on DOM screenshots or Tailwind rendering.
- Versioned report JSON with an explicit migration pipeline for future report-schema changes.
- Shared structural/finalisation validation across the browser and Worker, including photo-area and Building Manager photo-item integrity.
- Monotonic report revisions and atomic compare-and-set mutations reject stale cross-device edits, photo changes and finalisation instead of silently overwriting newer cloud data.
- Conflict recovery can reload the cloud copy, preserve the local copy as a separate draft, or export the local draft as JSON.
- Completed reports are immutable; corrections create a new linked report and retain the original as a superseded audit record.
- Cloudflare Access authentication is supplemented by viewer/editor/admin application roles.
- Local IndexedDB is limited to draft resilience, expires after seven days and purges completed/superseded reports.

## Report catalogue

The application currently includes 23 selectable deterministic PDF templates:

- Residential: Entry Condition, Routine Inspection, Exit Condition, Property Onboarding Condition, Vacant Property Inspection, Property Handover, Annual Property Condition Summary, Key Receipt.
- Commercial: Commercial Ingoing Condition, Commercial Periodic Inspection, Commercial Exit / Make-Good.
- Maintenance: Maintenance Assessment, Maintenance Completion / Verification, Cleaning / Rectification Reinspection, Contractor Works Inspection, Preventative Maintenance Inspection, Cleaning Quality Inspection, Key Safe Installation.
- Building / Strata: Common Property Inspection, Building Management Daily Report, Building Management Monthly Report, Incident Report.
- Custom: Custom Report with a user-defined title, manually entered sections/items, narrative, photographs, summary, recommendations and sign-off.

The extended catalogue, including the Custom Report, is implemented through reusable deterministic template families rather than separate DOM/screenshot renderers. This keeps cover pages, page geometry, text wrapping, pagination, photo galleries, sign-off sections and disclaimers consistent. Building Manager Daily and Monthly reports additionally link each uploaded photo to a specific reporting item so the activity table and photo evidence remain traceable. The Key Receipt uses a dedicated compact handover form with a structured key/access-device list and tenant acknowledgement/signature section.

Google Drive, Google Sheets, Firebase, AI commentary generation and direct email sending are deliberately outside V1.

See `DEPLOYMENT.md`, `DATA_RETENTION.md`, `docs/WA_FORM_1_COMPLIANCE.md` and `docs/REPORT_FUNCTIONALITY_FREEZE.md` for production guidance and the report-rendering acceptance baseline.
