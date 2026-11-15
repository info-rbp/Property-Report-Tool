import { api } from './api';
import type { ReportData, ReportPhoto } from '../types/report';
import { isRevisionConflict, reconcileReport } from './reportConflictResolution';
import { reportForCloudSave } from './reportWriteCoordinator';

const DB_NAME = 'proinspect-offline-work-v1';
const DB_VERSION = 1;
const STORE = 'operations';

export interface OfflineSaveOperation {
  id: string;
  kind: 'save-report';
  reportId: string;
  createdAt: string;
  report: ReportData;
  expectedUpdatedAt?: string;
  /** Cloud snapshot acknowledged before offline edits began. */
  baseReport?: ReportData;
}

export interface OfflinePhotoOperation {
  id: string;
  kind: 'upload-photo';
  reportId: string;
  createdAt: string;
  blob: Blob;
  metadata: {
    id: string;
    name: string;
    areaName: string;
    itemId?: string;
    itemName?: string;
    photoIndex: number;
    isCover?: boolean;
  };
}

export interface OfflineCoverOperation {
  id: string;
  kind: 'upload-cover';
  reportId: string;
  createdAt: string;
  blob: Blob;
}

export type OfflineOperation = OfflineSaveOperation | OfflinePhotoOperation | OfflineCoverOperation;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putOperation(operation: OfflineOperation): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(operation);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function queueOfflineSave(report: ReportData, expectedUpdatedAt?: string, baseReport?: ReportData): Promise<void> {
  if (!report.id) return;
  const reportId = report.id;
  // Keep one save operation per report, but retain its original queue position.
  // This ensures newly created categories/items reach D1 before any photos queued
  // against them, even if later autosaves update the local draft.
  const existing = await listOfflineOperations();
  const matching = existing.filter(
    (operation): operation is OfflineSaveOperation =>
      operation.kind === 'save-report' && operation.reportId === reportId
  );
  const first = matching[0];
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    matching.slice(1).forEach((operation) => store.delete(operation.id));
    store.put({
      id: first?.id || `save-${reportId}-${crypto.randomUUID()}`,
      kind: 'save-report',
      reportId,
      createdAt: first?.createdAt || new Date().toISOString(),
      report,
      expectedUpdatedAt: first?.expectedUpdatedAt || expectedUpdatedAt,
      baseReport: first?.baseReport || baseReport,
    } satisfies OfflineSaveOperation);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function queueOfflinePhoto(
  reportId: string,
  blob: Blob,
  metadata: OfflinePhotoOperation['metadata'],
): Promise<void> {
  await putOperation({
    id: `photo-${metadata.id}`,
    kind: 'upload-photo',
    reportId,
    createdAt: new Date().toISOString(),
    blob,
    metadata,
  });
}

export async function queueOfflineCover(reportId: string, blob: Blob): Promise<void> {
  await putOperation({ id: `cover-${reportId}`, kind: 'upload-cover', reportId, createdAt: new Date().toISOString(), blob });
}

export async function listOfflineOperations(): Promise<OfflineOperation[]> {
  const db = await openDatabase();
  const operations = await new Promise<OfflineOperation[]>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result || []) as OfflineOperation[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return operations.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeOfflineOperation(id: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function countOfflineOperations(): Promise<number> {
  return (await listOfflineOperations()).length;
}

export interface OfflineReplayConflict {
  reportId: string;
  fields: string[];
  local: ReportData;
  cloud: ReportData;
  queuedReport: ReportData;
}

export interface OfflineReplayResult {
  reports: ReportData[];
  remaining: number;
  sourceReports: Record<string, ReportData>;
  conflict?: OfflineReplayConflict;
  failure?: string;
}

/**
 * A stale queued draft is reconciled against its captured cloud baseline.
 * Legacy queued drafts without a baseline are stopped for explicit review;
 * they are never sent as unguarded full-document PUTs.
 */
export async function replayOfflineSave(
  operation: OfflineSaveOperation,
  client: Pick<typeof api, 'saveReport' | 'getReport'> = api,
): Promise<{ saved?: ReportData; conflict?: OfflineReplayConflict }> {
  let expected = operation.expectedUpdatedAt || operation.baseReport?.updatedAt;
  let candidate = reportForCloudSave(operation.report);
  let baseline = operation.baseReport;

  if (!expected) {
    const cloud = await client.getReport(operation.reportId);
    return {
      conflict: {
        reportId: operation.reportId,
        fields: ['Offline draft with no confirmed cloud revision'],
        local: operation.report,
        cloud,
        queuedReport: operation.report,
      },
    };
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return { saved: await client.saveReport(candidate, expected) };
    } catch (error) {
      if (!isRevisionConflict(error)) throw error;
      const cloud = await client.getReport(operation.reportId);
      if (!baseline) {
        return {
          conflict: {
            reportId: operation.reportId,
            fields: ['Legacy offline draft without a cloud baseline'],
            local: operation.report,
            cloud,
            queuedReport: operation.report,
          },
        };
      }
      const merged = reconcileReport(baseline, candidate, cloud);
      if (merged.conflicts.length) {
        return {
          conflict: {
            reportId: operation.reportId,
            fields: merged.conflicts,
            local: merged.report,
            cloud,
            queuedReport: operation.report,
          },
        };
      }
      candidate = reportForCloudSave(merged.report);
      baseline = cloud;
      expected = cloud.updatedAt;
    }
  }
  throw new Error('Offline draft could not be synchronised after repeated cloud revisions.');
}

export async function syncOfflineOperations(
  onProgress?: (remaining: number) => void,
): Promise<OfflineReplayResult> {
  const operations = await listOfflineOperations();
  const reports = new Map<string, ReportData>();
  const sourceReports: Record<string, ReportData> = {};
  let remaining = operations.length;

  for (const operation of operations) {
    try {
      let updated: ReportData;
      if (operation.kind === 'save-report') {
        const outcome = await replayOfflineSave(operation);
        if (outcome.conflict) {
          return {
            reports: Array.from(reports.values()), remaining,
            sourceReports, conflict: outcome.conflict,
          };
        }
        if (!outcome.saved) throw new Error('Offline save did not return a report.');
        updated = outcome.saved;
        sourceReports[operation.reportId] = operation.report;
      } else if (operation.kind === 'upload-cover') {
        let completed: ReportData | undefined;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            completed = await api.uploadCoverPhoto(operation.reportId, operation.blob);
            break;
          } catch (error) {
            if (!isRevisionConflict(error) || attempt === 2) throw error;
          }
        }
        if (!completed) throw new Error('Offline cover photo upload did not finish.');
        updated = completed;
      } else {
        // A previous upload may have committed but its response was lost.
        // The server treats an existing photo ID as a successful replay.
        let completed: ReportData | undefined;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            completed = await api.uploadPhoto(operation.reportId, operation.blob, operation.metadata);
            break;
          } catch (error) {
            if (!isRevisionConflict(error) || attempt === 2) throw error;
          }
        }
        if (!completed) throw new Error('Offline photo upload did not finish.');
        updated = completed;
      }
      reports.set(operation.reportId, updated);
      await removeOfflineOperation(operation.id);
      remaining -= 1;
      onProgress?.(remaining);
    } catch (error) {
      // Keep failed and later operations in IndexedDB; show a reason and allow retry.
      return {
        reports: Array.from(reports.values()), remaining, sourceReports,
        failure: error instanceof Error ? error.message : 'Offline replay failed.',
      };
    }
  }
  return { reports: Array.from(reports.values()), remaining, sourceReports };
}

export async function removeOfflineSaveForReport(reportId: string): Promise<void> {
  const operations = await listOfflineOperations();
  for (const operation of operations) {
    if (operation.kind === 'save-report' && operation.reportId === reportId) {
      await removeOfflineOperation(operation.id);
    }
  }
}

export function optimisticOfflinePhoto(
  metadata: OfflinePhotoOperation['metadata'],
  blob?: Blob,
): ReportPhoto {
  return {
    id: metadata.id,
    name: metadata.name,
    areaName: metadata.areaName,
    itemId: metadata.itemId,
    itemName: metadata.itemName,
    photoIndex: metadata.photoIndex,
    isCover: metadata.isCover,
    url: blob ? URL.createObjectURL(blob) : undefined,
    offlinePending: true,
  };
}

export async function hydrateOfflinePhotoPreviews(report: ReportData): Promise<ReportData> {
  if (!report.id) return report;
  const operations = await listOfflineOperations();
  const pending = operations.filter(
    (operation): operation is OfflinePhotoOperation =>
      operation.kind === 'upload-photo' && operation.reportId === report.id
  );
  if (!pending.length) return report;

  const pendingById = new Map(pending.map((operation) => [operation.metadata.id, operation]));
  const cloudPhotos = report.photos.filter((photo) => !pendingById.has(photo.id));
  const localPhotos = pending.map((operation) => optimisticOfflinePhoto(operation.metadata, operation.blob));
  return { ...report, photos: [...cloudPhotos, ...localPhotos] };
}
