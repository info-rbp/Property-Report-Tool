# ProInspect Property Reports

Cloud-backed internal property reporting application for ProInspect.

Production: `https://report.creation.proinspect.systems/`

## V1 workflow

```text
Properties
  -> Choose a report template from the ProInspect catalogue
  -> Import commentary from CSV or use the template starter areas
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

Google Drive, Google Sheets, Firebase, AI commentary generation and direct email sending are deliberately outside V1.

The report library covers residential tenancy, commercial, maintenance, building/strata and property-operations reporting, including key safe installation verification.

See `docs/REPORT_TEMPLATE_CATALOGUE.md`, `DEPLOYMENT.md`, `DATA_RETENTION.md` and `docs/WA_FORM_1_COMPLIANCE.md` for production guidance.
