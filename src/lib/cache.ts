import { ReportData } from '../types/report';

const DB_NAME = 'proinspect-report-cache-v1';
const DB_VERSION = 1;
const REPORT_STORE = 'reports';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type CachedReport = ReportData & { _cachedAt?: number };

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
  if (report.status === 'completed' || report.status === 'superseded') {
    await removeCachedReport(report.id);
    return;
  }
  const db = await openDatabase();
  const cached: CachedReport = { ...report, _cachedAt: Date.now() };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(REPORT_STORE, 'readwrite');
    tx.objectStore(REPORT_STORE).put(cached);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getCachedReport(id: string): Promise<ReportData | null> {
  const db = await openDatabase();
  const value = await new Promise<CachedReport | undefined>((resolve, reject) => {
    const request = db.transaction(REPORT_STORE, 'readonly').objectStore(REPORT_STORE).get(id);
    request.onsuccess = () => resolve(request.result as CachedReport | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  if (!value) return null;

  const expired = !value._cachedAt || Date.now() - value._cachedAt > CACHE_TTL_MS;
  if (expired || value.status === 'completed' || value.status === 'superseded') {
    await removeCachedReport(id).catch(() => undefined);
    return null;
  }

  const { _cachedAt, ...report } = value;
  return report;
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


export async function pruneCachedReports(): Promise<void> {
  const db = await openDatabase();
  const now = Date.now();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(REPORT_STORE, 'readwrite');
    const store = tx.objectStore(REPORT_STORE);
    const request = store.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const value = cursor.value as CachedReport;
      const expired = !value._cachedAt || now - value._cachedAt > CACHE_TTL_MS;
      if (expired || value.status === 'completed' || value.status === 'superseded') {
        cursor.delete();
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
