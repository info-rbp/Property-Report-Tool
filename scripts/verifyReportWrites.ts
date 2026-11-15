import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommentaryEditor } from '../src/components/CommentaryEditor';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ReportWriteCoordinator, mergeCloudPhotoMutation, reportForCloudSave } from '../src/lib/reportWriteCoordinator';
import { nextReportRevision } from '../src/lib/reportRevision';
import { isRevisionConflict, reconcileReport } from '../src/lib/reportConflictResolution';
import { mergeCsvCommentary } from '../src/lib/csvCommentaryMerge';
import { replayOfflineSave } from '../src/lib/offlineQueue';
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

// Reconcile a cloud photo and unrelated commentary edit without discarding either.
const acknowledged: ReportData = {
  ...base,
  updatedAt: '2026-11-08T07:00:00.000Z',
  areas: [{
    id: 'kitchen',
    name: 'Kitchen',
    items: [
      { id: 'tap', name: 'Tap', agentComments: 'Original note', clean: true },
      { id: 'sink', name: 'Sink', agentComments: 'Original sink', clean: true },
    ],
  }],
  photos: [photo('existing', 'Original caption')],
};
const localEdits: ReportData = {
  ...acknowledged,
  areas: [{
    ...acknowledged.areas[0],
    items: [{ ...acknowledged.areas[0].items[0], agentComments: 'Edited locally' },
      acknowledged.areas[0].items[1]],
  }],
};
const remoteEdits: ReportData = {
  ...acknowledged,
  updatedAt: '2026-11-08T07:00:02.000Z',
  areas: [{
    ...acknowledged.areas[0],
    items: [acknowledged.areas[0].items[0],
      { ...acknowledged.areas[0].items[1], agentComments: 'Changed on second tab' }],
  }],
  photos: [...acknowledged.photos, photo('new-photo', 'New cloud photo')],
};
const independent = reconcileReport(acknowledged, localEdits, remoteEdits);
assert.deepEqual(independent.conflicts, []);
assert.equal(independent.report.areas[0].items[0].agentComments, 'Edited locally');
assert.equal(independent.report.areas[0].items[1].agentComments, 'Changed on second tab');
assert.equal(independent.report.photos.length, 2);
assert.equal(independent.report.updatedAt, remoteEdits.updatedAt);

const overlapping = reconcileReport(acknowledged, localEdits, {
  ...remoteEdits,
  areas: [{
    ...remoteEdits.areas[0],
    items: [{ ...remoteEdits.areas[0].items[0], agentComments: 'Other device wrote this' },
      remoteEdits.areas[0].items[1]],
  }],
});
assert.ok(overlapping.conflicts.includes('areas[kitchen].items[tap].agentComments'));
assert.equal(overlapping.report.areas[0].items[0].agentComments, 'Edited locally',
  'overlapping draft must keep unsaved local text, not silently discard it');
assert.equal(overlapping.report.areas[0].items[1].agentComments, 'Changed on second tab');

const deletion = reconcileReport(acknowledged,
  { ...localEdits, photos: [] }, remoteEdits);
assert.deepEqual(deletion.report.photos.map((p) => p.id), ['new-photo'],
  'local photo deletion must not erase a new cloud photo');
assert.ok(isRevisionConflict({ status: 409, message: 'This draft changed in another browser or device' }));
assert.ok(!isRevisionConflict({ status: 409, message: 'Completed reports cannot be edited.' }));
assert.ok(!isRevisionConflict({ status: 500, message: 'This draft changed in another browser or device' }));

// Phase 1: CSV import must patch existing components without changing IDs,
// deleting unrelated areas, or invalidating photo item references.
const incomingCsv = [{
  id: 'random-imported-area', name: ' KITCHEN ',
  items: [{ id: 'new-random-id', name: ' tap ', agentComments: 'Detailed imported condition.',
    clean: null, undamaged: false, working: null }],
}];
const csvBefore = JSON.stringify(acknowledged.areas);
const patchedCsv = mergeCsvCommentary(acknowledged.areas, incomingCsv);
assert.equal(patchedCsv.updatedItems, 1);
assert.equal(patchedCsv.addedItems, 0);
assert.equal(patchedCsv.addedAreas, 0);
assert.equal(patchedCsv.areas[0].id, 'kitchen');
assert.equal(patchedCsv.areas[0].items[0].id, 'tap');
assert.equal(patchedCsv.areas[0].items[0].agentComments, 'Detailed imported condition.');
assert.equal(patchedCsv.areas[0].items[0].clean, true, 'blank status does not erase existing state');
assert.equal(patchedCsv.areas[0].items[0].undamaged, false);
assert.equal(patchedCsv.areas[0].items[1].agentComments, 'Original sink');
assert.equal(JSON.stringify(acknowledged.areas), csvBefore, 'CSV merger must be immutable');
const csvAdded = mergeCsvCommentary(acknowledged.areas, [
  { id: 'csv-new-area', name: 'Bedroom', items: [{ id: 'csv-new-item', name: 'Walls', agentComments: 'Clean' }] },
]);
assert.equal(csvAdded.addedAreas, 1);
assert.equal(csvAdded.areas[0].id, 'kitchen');
assert.throws(() => mergeCsvCommentary(acknowledged.areas, [
  { id: 'wrong', name: 'Kitchen', items: [
    { id: 'a', name: 'Tap', agentComments: 'A' },
    { id: 'b', name: 'tap', agentComments: 'B' },
  ] },
]), /duplicate/i);

let replaySaveAttempts = 0;
let latestExpected = '';
const recoveredOffline = await replayOfflineSave({
  id: 'offline-save', kind: 'save-report', reportId: acknowledged.id!, createdAt: acknowledged.updatedAt!,
  report: localEdits, baseReport: acknowledged, expectedUpdatedAt: acknowledged.updatedAt,
}, {
  getReport: async () => remoteEdits,
  saveReport: async (draft, expected) => {
    replaySaveAttempts += 1;
    latestExpected = expected;
    if (replaySaveAttempts === 1) {
      throw Object.assign(new Error('This draft changed in another browser or device.'), { status: 409 });
    }
    return { ...draft, updatedAt: '2026-11-08T07:00:03.000Z' };
  },
});
assert.equal(replaySaveAttempts, 2);
assert.equal(latestExpected, remoteEdits.updatedAt);
assert.equal(recoveredOffline.conflict, undefined);
assert.equal(recoveredOffline.saved?.areas[0].items[0].agentComments, 'Edited locally');
assert.equal(recoveredOffline.saved?.areas[0].items[1].agentComments, 'Changed on second tab');
assert.equal(recoveredOffline.saved?.photos.length, 2);
const competingOffline = await replayOfflineSave({
  id: 'offline-conflict', kind: 'save-report', reportId: acknowledged.id!, createdAt: acknowledged.updatedAt!,
  report: localEdits, baseReport: acknowledged, expectedUpdatedAt: acknowledged.updatedAt,
}, {
  getReport: async () => ({
    ...remoteEdits,
    areas: [{ ...remoteEdits.areas[0], items: [
      { ...remoteEdits.areas[0].items[0], agentComments: 'Changed by another editor' },
      remoteEdits.areas[0].items[1],
    ] }],
  }),
  saveReport: async () => { throw Object.assign(new Error('This draft changed in another browser or device.'), { status: 409 }); },
});
assert.ok(competingOffline.conflict?.fields.some((field) => field.endsWith('agentComments')));
assert.equal(competingOffline.saved, undefined);
const legacyOffline = await replayOfflineSave({
  id: 'legacy-offline', kind: 'save-report', reportId: acknowledged.id!, createdAt: acknowledged.updatedAt!,
  report: localEdits,
}, {
  getReport: async () => remoteEdits,
  saveReport: async () => { throw new Error('An unguarded legacy save must never be attempted'); },
});
assert.deepEqual(legacyOffline.conflict?.fields, ['Offline draft with no confirmed cloud revision']);

const current = '2026-11-08T07:00:00.123Z';
assert.equal(nextReportRevision(current, Date.parse(current)), '2026-11-08T07:00:00.124Z');
assert.equal(nextReportRevision(current, Date.parse(current) - 10), '2026-11-08T07:00:00.124Z');
assert.equal(nextReportRevision(current, Date.parse(current) + 10), '2026-11-08T07:00:00.133Z');

const commentarySource = readFileSync('src/components/CommentaryEditor.tsx', 'utf8');
const htmlShell = readFileSync('index.html', 'utf8');
assert.ok(!htmlShell.includes('\\n'),
  'literal HTML newline escapes must not appear as text above the application');
assert.ok(!commentarySource.includes('flex-1 overflow-y-auto p-4 md:p-6'),
  'condition commentary must scroll with the main page rather than inside a nested panel');
assert.ok(!commentarySource.includes('md:pl-56 md:-mt-2'),
  'photo controls must no longer squeeze the commentary into a narrow flex column');
assert.ok(commentarySource.includes('textarea.scrollHeight'),
  'long commentary should expand to show existing text while editing');

const existingComment = 'Original inspection commentary: several paint marks, light scuffs, and minor wear are present on the doorway.';
const commentaryMarkup = renderToStaticMarkup(createElement(CommentaryEditor, {
  details: { ...base.details, reportType: 'Entry' } as ReportData['details'],
  areas: [{
    id: 'lounge-area',
    name: 'Front Lounge',
    items: [{ id: 'doorway', name: 'Doorway', clean: true, undamaged: false, working: true, agentComments: existingComment }],
  }],
  photos: [],
  onChangeDetails: () => undefined,
  onChangeAreas: () => undefined,
  onChangePhotos: () => undefined,
  onUploadPhotos: async () => undefined,
}));
assert.ok(commentaryMarkup.includes('id="agent-comments-lounge-area-doorway"'),
  'full-width commentary should have an associated accessible label');
assert.ok(commentaryMarkup.includes(existingComment),
  'the editor must render existing inspection commentary without losing or truncating its value');
assert.ok(commentaryMarkup.includes('resize-none') && commentaryMarkup.includes('w-full'),
  'the commentary textarea should expand vertically and use available width');

const app = readFileSync('src/App.tsx', 'utf8');
const photoManager = readFileSync('src/components/PhotoManager.tsx', 'utf8');
const worker = readFileSync('worker/index.ts', 'utf8');
const serviceWorker = readFileSync('public/sw.js', 'utf8');
const authGate = readFileSync('src/components/AuthGate.tsx', 'utf8');
assert.ok(!app.includes('requestAnimationFrame('),
  'photo uploads must not depend on animation frames, which pause in background Chrome tabs');
assert.ok(app.includes('min-h-[calc(100vh-125px)]'),
  'photo view must grow with the page instead of forcing a fixed-height gallery');
assert.ok(!photoManager.includes('p-4 overflow-y-auto flex-1 bg-neutral-50/50'),
  'photo evidence must not trap scrolling inside an inner gallery');
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
assert.ok(app.includes('reconcileReport(baseline, localNow, cloud)'), 'conflict recovery must merge against acknowledged baseline');
assert.ok(app.includes('setUnresolvedConflict({ reportId, fields: merged.conflicts })'), 'same-field conflicts must pause for user choice');
assert.ok(app.includes('unresolvedConflictRef.current === report.id'), 'autosave must stop while conflicting edits remain');
assert.ok(worker.includes('WHERE id = ? AND updated_at = ?'), 'D1 atomic compare-and-set must remain in place');
assert.ok(worker.includes('new HttpError(428,'), 'full-report saves require a confirmed revision');
assert.ok(worker.includes('REPORT_STORAGE.head(existingPhoto.storageKey)'), 'duplicate photo IDs must be idempotent');
assert.ok(worker.includes('photos/${photoId}/${crypto.randomUUID()}.jpg'), 'new photo object keys must be immutable');
assert.ok(!serviceWorker.includes('cacheableReportMedia'), 'never cache authenticated photos in Cache Storage');
assert.ok(serviceWorker.includes("url.pathname.startsWith('/api/')"), 'all private API requests bypass the service worker cache');
assert.ok(serviceWorker.includes('proinspect-shell-v4'), 'upgraded SW must clear older private media caches');
assert.ok(authGate.includes('await clearLocalReportingData()'), 'sign-out must await private cache removal');
assert.ok(app.includes('mergeCsvCommentary(current.areas, parsed.areas)'), 'CSV import must merge existing items');
assert.ok(app.includes('await queueOfflinePhoto(latestTargetReport.id!, processed.blob, metadata)'), 'photo uploads must enter a durable outbox first');
assert.ok(app.includes('await queueOfflineCover(activeReport.id!, processed.blob)'), 'cover images must have retryable storage');
assert.ok(app.includes('Retry cloud synchronisation'), 'offline and failed photos need an explicit retry control');
assert.ok(app.includes('await countOfflineOperations() > 0'), 'finalisation and export must block while pending work remains');

console.log('Report save/upload race regression passed: serial writes, latest-draft snapshot,');
console.log('live edit/photo metadata preservation, failed-write recovery, and unique CAS revisions.');
