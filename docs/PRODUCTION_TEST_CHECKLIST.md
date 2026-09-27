# Production end-to-end test checklist

Run this checklist on the authenticated production hostname before V1 is considered fully accepted.

## Authentication

- Open the application in a private/incognito browser session.
- Confirm Cloudflare Access prompts for authentication.
- Sign in using an approved `@remotebusinesspartner.com.au` address.
- Confirm the Properties screen loads without an Access or server error.

## Property persistence

- Create a temporary test property.
- Refresh the browser and confirm the property remains.
- Sign in from a second browser/device and confirm the property appears.

## Report persistence

- Create an Entry report.
- Add basic report details.
- Import the CSV template with test commentary.
- Refresh and reopen the report.
- Confirm all report details and commentary remain.
- Open the same draft on a second browser/device and confirm the same data appears.

## Photo storage

- Upload at least five JPG/PNG/WebP photos.
- Confirm photos are resized/uploaded and display after refresh.
- Assign photos to different areas.
- Set a cover photo.
- Open the report on a second browser/device and confirm all photos load from R2.

## Draft PDF

- Preview the report.
- Download a draft PDF.
- Confirm every generated page opens correctly.
- Confirm commentary and photos appear.
- Confirm no sample addresses, sample dates, stock images or placeholder URLs appear.

## Finalisation

- Finalise the report.
- Confirm the issued PDF downloads.
- Confirm the report changes to Completed.
- Confirm the completed report can no longer be edited or deleted through the UI.
- Download the stored completed PDF again and compare it with the originally issued PDF.

## Storage checks

- Confirm the report record exists in D1.
- Confirm report photos exist under the expected R2 report prefix.
- Confirm `completed/report.pdf` exists for the completed report.

## Failure behaviour

- Temporarily interrupt connectivity while editing a draft.
- Confirm the application reports a cloud-save failure and retains the local cache.
- Restore connectivity and confirm normal cloud saving resumes.

## Cleanup

Delete test drafts that are no longer required. Completed reports are intentionally immutable in V1, so use clearly labelled test data for any finalisation tests.
