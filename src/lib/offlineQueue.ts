import { api } from './api';
import type { ReportData, ReportPhoto } from '../types/report';

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

export type OfflineOperation = OfflineSaveOperation | OfflinePhotoOperation;

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

export async function queueOfflineSave(report: ReportData, expectedUpdatedAt?: string): Promise<void> {
  if (!report.id) return;
  const reportId = report.id;
  // Keep only the most recent pending save for a report.
  const existing = await listOfflineOperations();
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    existing
      .filter((operation) => operation.kind === 'save-report' && operation.reportId === reportId)
      .forEach((operation) => store.delete(operation.id));
    store.put({
      id: `save-${reportId}-${crypto.randomUUID()}`,
      kind: 'save-report',
      reportId,
      createdAt: new Date().toISOString(),
      report,
      expectedUpdatedAt,
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

export async function syncOfflineOperations(
  onProgress?: (remaining: number) => void,
): Promise<{ reports: ReportData[]; remaining: number }> {
  const operations = await listOfflineOperations();
  const reports = new Map<string, ReportData>();
  let remaining = operations.length;

  for (const operation of operations) {
    try {
      let updated: ReportData;
      if (operation.kind === 'save-report') {
        // Offline photo blobs are replayed as separate upload operations. Do not persist
        // placeholder photo metadata to D1 before the R2 upload succeeds.
        const reportForCloud: ReportData = {
          ...operation.report,
          photos: operation.report.photos.filter((photo) => !photo.offlinePending),
        };
        updated = await api.saveReport(reportForCloud, operation.expectedUpdatedAt);
      } else {
        updated = await api.uploadPhoto(operation.reportId, operation.blob, operation.metadata);
      }
      reports.set(operation.reportId, updated);
      await removeOfflineOperation(operation.id);
      remaining -= 1;
      onProgress?.(remaining);
    } catch {
      // Preserve this and all later operations so the user can retry without losing work.
      break;
    }
  }

  return { reports: Array.from(reports.values()), remaining };
}

export function optimisticOfflinePhoto(metadata: OfflinePhotoOperation['metadata']): ReportPhoto {
  return {
    id: metadata.id,
    name: metadata.name,
    areaName: metadata.areaName,
    itemId: metadata.itemId,
    itemName: metadata.itemName,
    photoIndex: metadata.photoIndex,
    isCover: metadata.isCover,
    offlinePending: true,
  };
}
