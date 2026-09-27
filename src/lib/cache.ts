import { ReportData } from '../types/report';

const DB_NAME = 'proinspect-report-cache-v1';
const DB_VERSION = 1;
const REPORT_STORE = 'reports';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REPORT_STORE)) {
        db.createObjectStore(REPORT_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheReport(report: ReportData): Promise<void> {
  if (!report.id) return;
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(REPORT_STORE, 'readwrite');
    tx.objectStore(REPORT_STORE).put(report);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getCachedReport(id: string): Promise<ReportData | null> {
  const db = await openDatabase();
  const value = await new Promise<ReportData | undefined>((resolve, reject) => {
    const request = db.transaction(REPORT_STORE, 'readonly').objectStore(REPORT_STORE).get(id);
    request.onsuccess = () => resolve(request.result as ReportData | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value || null;
}

export async function removeCachedReport(id: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(REPORT_STORE, 'readwrite');
    tx.objectStore(REPORT_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
