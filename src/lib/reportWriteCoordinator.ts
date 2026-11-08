import type { ReportData, ReportPhoto } from '../types/report';

/**
 * All writes to the same D1 report revision must be serialised.
 *
 * This includes draft PUTs, photo/cover uploads, offline replay and deletions:
 * each operation reads and advances the revision used by the next operation.
 * A rejected write must not poison later queued work.
 */
export class ReportWriteCoordinator {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(mutation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(mutation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  waitForIdle(): Promise<void> {
    return this.tail;
  }
}

/**
 * A photo API response carries a new cloud revision and authoritative R2 keys.
 * Preserve any commentary, area, detail and photo-caption edits made while the
 * upload was in flight; also keep offline photos that are not yet stored in R2.
 * Deletions are represented by their absence from the cloud photo list.
 */
export function mergeCloudPhotoMutation(
  local: ReportData,
  cloud: ReportData,
): ReportData {
  if (local.id !== cloud.id) return local;
  const localPhotos = new Map(local.photos.map((photo) => [photo.id, photo]));
  const cloudIds = new Set(cloud.photos.map((photo) => photo.id));
  const photos: ReportPhoto[] = cloud.photos.map((photo) => {
    const localPhoto = localPhotos.get(photo.id);
    if (!localPhoto) return photo;
    return {
      ...photo,
      name: localPhoto.name,
      areaName: localPhoto.areaName,
      itemId: localPhoto.itemId,
      itemName: localPhoto.itemName,
      photoIndex: localPhoto.photoIndex,
      isCover: localPhoto.isCover,
    };
  });
  for (const photo of local.photos) {
    if (photo.offlinePending && !cloudIds.has(photo.id)) photos.push(photo);
  }
  return {
    ...local,
    photos,
    updatedAt: cloud.updatedAt,
    details: {
      ...local.details,
      coverPhotoUrl: cloud.details.coverPhotoUrl,
      coverPhotoStorageKey: cloud.details.coverPhotoStorageKey,
    },
  };
}

export function reportForCloudSave(report: ReportData): ReportData {
  return {
    ...report,
    // Pending offline photos do not have an R2 object yet. Their metadata
    // must not be written by an unrelated autosave before offline replay.
    photos: report.photos.filter((photo) => !photo.offlinePending),
  };
}
