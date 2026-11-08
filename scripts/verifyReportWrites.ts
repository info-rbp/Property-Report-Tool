import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ReportWriteCoordinator, mergeCloudPhotoMutation, reportForCloudSave } from '../src/lib/reportWriteCoordinator';
import { nextReportRevision } from '../src/lib/reportRevision';
import type { ReportData, ReportPhoto } from '../src/types/report';

const queue = new ReportWriteCoordinator();
let active = 0;
let simultaneousWrites = 0;
let revision = 0;
const executionOrder: string[] = [];

function simulateWrite(label: string): Promise<number> {
  return queue.enqueue(async () => {
    active += 1;
    simultaneousWrites = Math.max(simultaneousWrites, active);
    // An actual D1 revision changes when a queued save or photo write finishes.
    const expected = revision;
    await Promise.resolve();
    assert.equal(revision, expected, `A cloud write overlapped with ${label}`);
    revision += 1;
    executionOrder.push(label);
    active -= 1;
    return revision;
  });
}

const pending = [
  simulateWrite('autosave'),
  simulateWrite('upload-photo-1'),
  simulateWrite('autosave-during-photos'),
  simulateWrite('upload-photo-2'),
  simulateWrite('delete-photo'),
  simulateWrite('cover-photo'),
];
const revisions = await Promise.all(pending);
assert.deepEqual(revisions, [1, 2, 3, 4, 5, 6]);
assert.equal(simultaneousWrites, 1);
assert.deepEqual(executionOrder, [
  'autosave', 'upload-photo-1', 'autosave-during-photos',
  'upload-photo-2', 'delete-photo', 'cover-photo',
]);

await assert.rejects(queue.enqueue(async () => {
  throw new Error('Real cross-device conflict');
}), /Real cross-device conflict/);
assert.equal(await simulateWrite('save-after-error'), 7);
await queue.waitForIdle();

const photo = (id: string, name: string, extra: Partial<ReportPhoto> = {}): ReportPhoto => ({
  id, name, areaName: 'Kitchen', photoIndex: 1, ...extra,
});
const base: ReportData = {
  id: '46-property-report-test',
  updatedAt: '2026-11-08T07:00:00.000Z',
  details: {
    reportType: 'Entry',
    propertyAddress: 'Example property',
    additionalComments: 'Commentary edited during upload',
    coverPhotoStorageKey: 'original-cover',
  } as ReportData['details'],
  areas: [],
  photos: [
    photo('existing', 'Unsaved revised caption', { itemId: 'tap', itemName: 'Taps' }),
    photo('pending', 'Offline evidence', { offlinePending: true }),
  ],
};
const cloud: ReportData = {
  ...base,
  updatedAt: '2026-11-08T07:00:01.000Z',
  details: { ...base.details, additionalComments: 'Old remote commentary', coverPhotoStorageKey: 'new-cover' },
  photos: [
    photo('existing', 'Old cloud caption', { itemId: 'tap', itemName: 'Taps' }),
    photo('uploaded', 'New photo', { itemId: 'sink', itemName: 'Sink' }),
  ],
};
const merged = mergeCloudPhotoMutation(base, cloud);
assert.equal(merged.details.additionalComments, 'Commentary edited during upload');
assert.equal(merged.details.coverPhotoStorageKey, 'new-cover');
assert.equal(merged.updatedAt, cloud.updatedAt);
assert.deepEqual(merged.photos.map((p) => p.id), ['existing', 'uploaded', 'pending']);
assert.equal(merged.photos[0].name, 'Unsaved revised caption');
assert.equal(merged.photos[1].itemId, 'sink');
assert.equal(reportForCloudSave(merged).photos.some((p) => p.id === 'pending'), false);
assert.equal(reportForCloudSave(merged).photos.length, 2);

const afterDeletion = mergeCloudPhotoMutation(merged, { ...cloud, photos: [cloud.photos[1]] });
assert.deepEqual(afterDeletion.photos.map((p) => p.id), ['uploaded', 'pending']);
assert.equal(afterDeletion.details.additionalComments, 'Commentary edited during upload');

const current = '2026-11-08T07:00:00.123Z';
assert.equal(nextReportRevision(current, Date.parse(current)), '2026-11-08T07:00:00.124Z');
assert.equal(nextReportRevision(current, Date.parse(current) - 10), '2026-11-08T07:00:00.124Z');
assert.equal(nextReportRevision(current, Date.parse(current) + 10), '2026-11-08T07:00:00.133Z');

const app = readFileSync('src/App.tsx', 'utf8');
const worker = readFileSync('worker/index.ts', 'utf8');
for (const method of ['uploadPhoto', 'uploadCoverPhoto', 'deletePhoto', 'completeReport']) {
  assert.match(app, new RegExp(`queueReportWrite\\(\\(\\) =>\\s*api\\.${method}\\(`), `${method} must use the shared write queue`);
}
assert.ok(app.includes('return queueReportWrite(async () =>'), 'draft PUT must use the shared write queue');
assert.ok(app.includes('reportRef.current?.id === reportId ? reportRef.current : draft'),
  'queued saves must read the freshest local draft');
assert.ok(app.includes('queueReportWrite(() =>\n          syncOfflineOperations'),
  'offline replay must not overlap active uploads');
assert.ok(app.includes('await photoUploadQueueRef.current'),
  'navigation and finalisation should await pending photo uploads');
assert.ok(worker.includes('nextReportRevision(row.updated_at)'));
assert.ok(worker.includes('WHERE id = ? AND updated_at = ?'), 'D1 atomic compare-and-set must remain in place');

console.log('Report save/upload race regression passed: serial writes, latest-draft snapshot,');
console.log('live edit/photo metadata preservation, failed-write recovery, and unique CAS revisions.');
