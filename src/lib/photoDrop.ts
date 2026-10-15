/**
 * Files from a native drag-and-drop or file-input operation, in the order received.
 * Some browsers do not supply a MIME type for photos dragged from the desktop.
 */
export function imageFilesFromList(files: FileList | ArrayLike<File> | null): File[] {
  if (!files) return [];
  return Array.from(files).filter((file) => {
    if (file.type.toLowerCase().startsWith('image/')) return true;
    return !file.type && /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(file.name);
  });
}
