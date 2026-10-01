export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
}

export async function processInspectionImage(
  file: File,
  maxDimension = 2000,
  quality = 0.85
): Promise<ProcessedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`${file.name} is not an image file.`);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name} could not be read by this browser. Use a JPG, PNG or WebP image.`);
  }

  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    bitmap.close();
    throw new Error('Unable to prepare image for upload.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error('Unable to compress image.')),
      'image/jpeg',
      quality
    );
  });

  // Release the backing bitmap/canvas memory promptly before processing the next
  // queued image. This matters when users add large batches from modern phones.
  canvas.width = 1;
  canvas.height = 1;

  return { blob, width, height };
}
