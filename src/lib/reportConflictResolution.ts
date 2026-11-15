import type { ReportData, ReportPhoto } from '../types/report';

/**
 * Three-way reconciliation of a draft against its last acknowledged cloud copy.
 * A stale write must never be retried by dropping its expected revision.
 *
 * Independent item-level commentary, details, area and photo metadata edits
 * are combined. If both devices edited the same value differently, the local
 * value is retained in memory but the caller MUST obtain a user's decision
 * before saving that conflicting value.
 */
export interface ReconciledReport {
  report: ReportData;
  conflicts: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function meaningfulKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((key) => value[key] !== undefined);
}

function equal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length && left.every((item, index) => equal(item, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = meaningfulKeys(left);
  const rightKeys = meaningfulKeys(right);
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]));
}

function keyed(values: unknown[]): boolean {
  return values.every((value) => isRecord(value) && typeof value.id === 'string' && value.id.length > 0);
}

function merge(
  base: unknown, local: unknown, remote: unknown,
  path: string, conflicts: string[],
): unknown {
  if (equal(local, base)) return remote;
  if (equal(remote, base) || equal(local, remote)) return local;

  if (Array.isArray(local) && Array.isArray(remote) &&
      (base === undefined || Array.isArray(base)) &&
      keyed(local) && keyed(remote) && (base === undefined || keyed(base))) {
    const original = new Map(((base || []) as Array<{ id: string }>).map((item) => [item.id, item]));
    const edited = new Map((local as Array<{ id: string }>).map((item) => [item.id, item]));
    const current = new Map((remote as Array<{ id: string }>).map((item) => [item.id, item]));
    // Keep cloud ordering, then append local-only entries (e.g. queued offline photos).
    const ids = Array.from(new Set([...current.keys(), ...edited.keys(), ...original.keys()]));
    return ids.map((id) => merge(
      original.get(id), edited.get(id), current.get(id), path + '[' + id + ']', conflicts,
    )).filter((item) => item !== undefined);
  }

  if (isRecord(local) && isRecord(remote) &&
      (base === undefined || isRecord(base))) {
    const original = isRecord(base) ? base : {};
    const result: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(original), ...Object.keys(local), ...Object.keys(remote)]);
    for (const key of keys) {
      const value = merge(original[key], local[key], remote[key],
        path ? path + '.' + key : key, conflicts);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }

  conflicts.push(path || 'report');
  // Never discard locally typed text while waiting for the user's decision.
  return local;
}

export function reconcileReport(
  acknowledged: ReportData,
  local: ReportData,
  cloud: ReportData,
): ReconciledReport {
  if (!acknowledged.id || acknowledged.id !== local.id || local.id !== cloud.id) {
    throw new Error('Cannot reconcile different reports.');
  }
  const conflicts: string[] = [];
  const report = merge(acknowledged, local, cloud, '', conflicts) as ReportData;

  // These fields are exclusively controlled by the server and its photo API.
  for (const key of ['schemaVersion', 'id', 'propertyId', 'status', 'completedPdfKey',
    'createdAt', 'updatedAt', 'execution', 'integrationContext'] as const) {
    (report as unknown as Record<string, unknown>)[key] = cloud[key];
  }
  report.details = {
    ...report.details,
    coverPhotoStorageKey: cloud.details.coverPhotoStorageKey,
    coverPhotoUrl: cloud.details.coverPhotoUrl,
  };
  const cloudPhotos = new Map(cloud.photos.map((photo) => [photo.id, photo]));
  report.photos = report.photos.map((photo): ReportPhoto => {
    const stored = cloudPhotos.get(photo.id);
    if (!stored) return photo;
    return {
      ...photo,
      storageKey: stored.storageKey,
      url: stored.url,
      dataUrl: undefined,
      offlinePending: false,
    };
  });
  return { report, conflicts: Array.from(new Set(conflicts)) };
}

export function isRevisionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: number; message?: string };
  return candidate.status === 409 &&
    /changed in another browser or device|before the update completed/i.test(candidate.message || '');
}
