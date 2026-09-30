# ProInspect Property Reports - Data Retention and Recovery Policy

This is the operational retention policy for V1. It is not a substitute for any legal, contractual or client-specific record-retention obligation that may apply to a particular report.

## Authoritative storage

- D1 is the authoritative store for Properties and report JSON.
- The primary R2 bucket is the authoritative file store for inspection-photo derivatives and completed PDFs.
- A separately bound recovery R2 bucket receives an automatic mirrored copy of every new inspection photo and issued PDF.
- IndexedDB is a local draft-resilience cache only. Completed/superseded reports are removed from it, and stale draft cache entries expire after seven days.

## Draft reports

Draft reports and their R2 photos are retained until a user deletes the draft.

Deleting a draft through the application deletes:
- the D1 report record; and
- all R2 objects under that report's storage prefix.

## Completed reports

Completed reports are immutable through the V1 API.

The completed report record, associated inspection photos and issued PDF are retained without automatic expiry unless ProInspect adopts a later written disposal schedule.

This avoids accidental deletion while the legal/business retention period is being formally determined.

## D1 recovery

Cloudflare D1 Time Travel is automatically available. On the Workers Free plan, the available point-in-time recovery window is currently 7 days.

For recovery beyond the Time Travel window, export the production D1 database periodically and retain the export in an approved secure business backup location.

Repository command:

```bash
bun run db:backup
```

The resulting `backups/` directory is gitignored and must never be committed to GitHub because database exports can contain property and report information.

## R2 recovery

The application uses two separately bound R2 buckets:

- primary: `proinspect-property-reports-data`;
- recovery: `proinspect-property-reports-recovery`.

New inspection photos and completed PDFs are written to both buckets. Normal reads use primary storage and automatically fall back to the recovery bucket if the primary object is missing. Draft/photo deletion removes both copies; issued completed and superseded reports remain immutable through the application.

Neither bucket uses an automatic object-expiry rule. If ProInspect later adopts a formal disposal period, implement it only after the legal/business retention period is confirmed.

The recovery bucket protects against object-level deletion or corruption in the primary bucket. It should still be supplemented by an account-level/off-platform business backup if protection against an entire Cloudflare account or provider-level loss is required.

## Backup review

At least monthly:
1. confirm D1 is queryable;
2. perform a D1 export to secure business backup storage;
3. confirm both the primary and recovery R2 buckets are accessible;
4. confirm at least one completed PDF can be retrieved;
5. where practical, verify recovery fallback by confirming the matching recovery object exists;
6. record the check in the business operations log.

## Incident recovery

For accidental D1 changes within the available Time Travel window, use D1 Time Travel.

For older D1 recovery, use the most recent approved D1 export.

For a missing primary R2 object, the application automatically attempts the recovery bucket. Completed reports must not be manually deleted from either R2 bucket without an approved disposal instruction.
