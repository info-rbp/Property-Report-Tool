# ProInspect Property Reports

Cloud-backed internal property reporting application for ProInspect.

Production: `https://report.creation.proinspect.systems/`

## V1 workflow

```text
Properties
  -> Select a report template from the Residential / Commercial / Maintenance / Building catalogue
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
- Cloudflare R2 for compressed inspection photos and completed PDFs.
- Cloudflare Access for staff authentication.
- IndexedDB as a local draft cache only.
- Browser-side deterministic PDF generation using `jsPDF` directly from report data; final PDFs do not depend on DOM screenshots or Tailwind rendering.
- Versioned report JSON with an explicit migration pipeline for future report-schema changes.
- Shared structural/finalisation validation across the browser and Worker, including photo-area and Building Manager photo-item integrity.
- Version-aware draft saves reject stale cross-device edits instead of silently overwriting newer cloud data.

## Report catalogue

The application currently includes 21 selectable deterministic PDF templates:

- Residential: Entry Condition, Routine Inspection, Exit Condition, Property Onboarding Condition, Vacant Property Inspection, Property Handover, Annual Property Condition Summary.
- Commercial: Commercial Ingoing Condition, Commercial Periodic Inspection, Commercial Exit / Make-Good.
- Maintenance: Maintenance Assessment, Maintenance Completion / Verification, Cleaning / Rectification Reinspection, Contractor Works Inspection, Preventative Maintenance Inspection, Cleaning Quality Inspection, Key Safe Installation.
- Building / Strata: Common Property Inspection, Building Management Daily Report, Building Management Monthly Report, Incident Report.

The extended catalogue is implemented through reusable deterministic template families rather than separate DOM/screenshot renderers. This keeps cover pages, page geometry, text wrapping, pagination, photo galleries, sign-off sections and disclaimers consistent. Building Manager Daily and Monthly reports additionally link each uploaded photo to a specific reporting item so the activity table and photo evidence remain traceable.

Google Drive, Google Sheets, Firebase, AI commentary generation and direct email sending are deliberately outside V1.

See `DEPLOYMENT.md`, `DATA_RETENTION.md` and `docs/WA_FORM_1_COMPLIANCE.md` for production guidance.
