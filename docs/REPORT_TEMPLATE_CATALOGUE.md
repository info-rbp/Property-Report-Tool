# ProInspect Report Template Catalogue

The application uses one central catalogue to keep report naming, categories, starter areas, report-specific fields, disclaimers and PDF families consistent.

All issued PDFs use the deterministic jsPDF renderer. React/Tailwind preview pages are not rasterised into the issued PDF.

## Residential

| Template | Rendering family | Primary use |
| --- | --- | --- |
| Entry Condition Report | Specialist WA Form 1 | Statutory residential tenancy entry condition report |
| Routine Inspection Report | Specialist findings | Periodic residential inspection findings and maintenance observations |
| Exit Condition Report | Specialist condition | End-of-tenancy condition report |
| Property Onboarding Condition Report | Condition matrix | Baseline condition when ProInspect first takes over a property |
| Vacant Property Inspection Report | Findings | Periodic inspection of an unoccupied property |
| Annual Property Condition Summary | Summary/findings | Annual high-level property condition, inspection and maintenance summary |

## Commercial

| Template | Rendering family | Primary use |
| --- | --- | --- |
| Commercial Ingoing Condition Report | Condition matrix | Commercial premises condition at lease commencement |
| Commercial Periodic Inspection Report | Findings | Periodic premises inspection and landlord/tenant observations |
| Commercial Exit / Make-Good Report | Condition matrix | Lease-end condition and make-good evidence |

## Maintenance

| Template | Rendering family | Primary use |
| --- | --- | --- |
| Maintenance Assessment Report | Assessment/findings | Document an issue, urgency, likely trade and proposed scope |
| Maintenance Completion / Verification Report | Verification | Confirm authorised maintenance has been completed |
| Cleaning / Rectification Reinspection Report | Verification | Verify cleaning or rectification items after reinspection |
| Preventative Maintenance Inspection Report | Findings | Scheduled preventative-maintenance inspection |
| Cleaning Quality Inspection Report | Verification | Cleaning QA and rectification outcome |

## Building / Strata

| Template | Rendering family | Primary use |
| --- | --- | --- |
| Common Property Inspection Report | Findings | Common-area defects, cleaning, safety and maintenance observations |
| Building Management Site Report | Operations/findings | Recurring site operations, contractor, resident and action reporting |

## Property Operations

| Template | Rendering family | Primary use |
| --- | --- | --- |
| Incident Report | Incident/findings | Damage, water, safety, security or other significant property events |
| Contractor Works Inspection Report | Verification | Pre-work, progress or post-work inspection evidence |
| Property Handover Report | Handover/findings | Keys, access devices, meters, condition and outstanding matters |
| Key Safe Installation Report | Installation/verification | Installation location, mounting, contents, testing and photo evidence |

## Key Safe security rule

The Key Safe Installation Report intentionally does **not** provide a field for the key-safe access code.

The report may record only a secure access-record reference. Any access code or credential must be stored separately in the approved secure access-management system.

## Rendering rules

Every non-statutory template shares the same ProInspect visual system:

- ProInspect branded cover and contact block.
- A4 portrait output.
- Fixed page header and footer.
- Deliberate summary/detail tables with wrapped content.
- Either a fixed condition matrix or a two-column findings table depending on the template family.
- Automatic continuation pages for long findings.
- Individually embedded inspection photos rather than browser screenshots.
- 3-column x 4-row photo appendix with aspect ratio preserved.
- Report summary/outcome sections.
- Prepared/verified by sign-off.
- Template-specific disclaimer.
- PDF regression coverage in GitHub Actions.

The Entry, Routine and Exit reports remain specialist templates because their structures differ materially from the generic report families.

## Data model

Template-specific form values are stored inside `report.details.templateFields` in the existing report JSON.

The expanded catalogue does not require additional D1 tables. Migration `0002_expand_report_types.sql` only expands the allowed values in the existing `reports.report_type` constraint.
