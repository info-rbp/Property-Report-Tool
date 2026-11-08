/**
 * A report revision is a D1 updated_at ISO timestamp. Rapid photo mutations
 * can occur in the same millisecond; each successful mutation must still
 * receive a strictly newer value so compare-and-set detects concurrent writes.
 */
export function nextReportRevision(previous: string, nowMs: number = Date.now()): string {
  const previousMs = Date.parse(previous);
  const candidateMs = Number.isFinite(previousMs)
    ? Math.max(nowMs, previousMs + 1)
    : nowMs;
  return new Date(candidateMs).toISOString();
}
