import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';

const IMAGE_READY_TIMEOUT_MS = 20000;

function sanitizeClonedDocumentColors(clonedDoc: Document, clonedTarget: HTMLElement) {
  clonedDoc.querySelectorAll('style').forEach((styleTag) => {
    if (styleTag.textContent && (styleTag.textContent.includes('oklch') || styleTag.textContent.includes('oklab'))) {
      styleTag.textContent = styleTag.textContent
        .replace(/oklch\([^)]+\)/g, '#334155')
        .replace(/oklab\([^)]+\)/g, '#334155');
    }
  });

  const safeStyles = clonedDoc.createElement('style');
  safeStyles.textContent = `
    * {
      border-color: #cbd5e1 !important;
      outline-color: transparent !important;
      box-sizing: border-box !important;
    }
    .pdf-page {
      background-color: #ffffff !important;
      color: #0f172a !important;
      box-shadow: none !important;
      overflow: hidden !important;
    }
    .pdf-page table {
      border-color: #94a3b8 !important;
      table-layout: fixed !important;
    }
    .pdf-page th, .pdf-page td {
      border-color: #cbd5e1 !important;
      overflow-wrap: anywhere !important;
      word-break: normal !important;
    }
    .pdf-photo-page img {
      display: block !important;
      width: 100% !important;
      height: 100% !important;
      max-width: 100% !important;
      object-fit: cover !important;
    }
  `;
  clonedDoc.head.appendChild(safeStyles);

  clonedTarget.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    image.loading = 'eager';
    image.decoding = 'sync';
  });

  const elements = [clonedTarget, ...Array.from(clonedTarget.querySelectorAll<HTMLElement>('*'))];
  const win = clonedDoc.defaultView || window;
  const colorProperties: (keyof CSSStyleDeclaration)[] = [
    'color' as any,
    'backgroundColor' as any,
    'borderColor' as any,
    'borderTopColor' as any,
    'borderBottomColor' as any,
    'borderLeftColor' as any,
    'borderRightColor' as any,
    'outlineColor' as any,
    'textDecorationColor' as any,
  ];

  for (const el of elements) {
    if (!el.style) continue;
    const inline = el.getAttribute('style');
    if (inline && (inline.includes('oklch') || inline.includes('oklab'))) {
      el.setAttribute(
        'style',
        inline.replace(/oklch\([^)]+\)/g, '#1e293b').replace(/oklab\([^)]+\)/g, '#1e293b')
      );
    }

    try {
      const computed = win.getComputedStyle(el);
      for (const prop of colorProperties) {
        const value = computed[prop] as string;
        if (!value || (!value.includes('oklch') && !value.includes('oklab'))) continue;
        if (prop === 'backgroundColor') el.style.backgroundColor = '#ffffff';
        else if (prop.toString().toLowerCase().includes('border')) el.style.borderColor = '#cbd5e1';
        else if (prop === 'outlineColor') el.style.outlineColor = 'transparent';
        else el.style.color = '#0f172a';
      }
    } catch {
      // Ignore inaccessible computed styles.
    }
  }
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error('Image loading timed out while preparing the PDF.')), ms);
  });
}

async function ensureImageReady(image: HTMLImageElement): Promise<void> {
  image.loading = 'eager';

  if (!image.complete) {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          image.removeEventListener('load', onLoad);
          image.removeEventListener('error', onError);
        };
        const onLoad = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error(`Unable to load report image: ${image.alt || 'inspection photo'}`));
        };
        image.addEventListener('load', onLoad, { once: true });
        image.addEventListener('error', onError, { once: true });
      }),
      timeout(IMAGE_READY_TIMEOUT_MS),
    ]);
  }

  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error(`Unable to load report image: ${image.alt || 'inspection photo'}`);
  }

  if (typeof image.decode === 'function') {
    await Promise.race([
      image.decode().catch(() => undefined),
      timeout(IMAGE_READY_TIMEOUT_MS),
    ]);
  }
}

async function ensurePageImagesReady(page: HTMLElement): Promise<void> {
  const images = Array.from(page.querySelectorAll<HTMLImageElement>('img'));
  if (!images.length) return;
  await Promise.all(images.map(ensureImageReady));
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export async function generateElementPdf(
  containerElement: HTMLElement,
  onProgress?: (message: string) => void
): Promise<Blob> {
  const pageElements = Array.from(containerElement.querySelectorAll<HTMLElement>('.pdf-page'));
  if (!pageElements.length) {
    throw new Error('No report pages found to export. Please switch to the Preview tab first.');
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  for (let index = 0; index < pageElements.length; index++) {
    const page = pageElements[index];
    const pageNumber = index + 1;
    const isPhotoPage = page.classList.contains('pdf-photo-page');

    onProgress?.(`Preparing page ${pageNumber} of ${pageElements.length}...`);
    await ensurePageImagesReady(page);
    await nextPaint();

    const rect = page.getBoundingClientRect();
    const captureWidth = Math.max(1, Math.ceil(rect.width));
    const captureHeight = Math.max(1, Math.ceil(rect.height));

    onProgress?.(`Rendering page ${pageNumber} of ${pageElements.length}...`);

    const canvas = await html2canvas(page, {
      // Photo-heavy reports can contain hundreds of source images. A lower scale on gallery
      // pages materially reduces browser canvas/GPU memory without reducing visible A4 quality.
      scale: isPhotoPage ? 1.5 : 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: '#ffffff',
      width: captureWidth,
      height: captureHeight,
      windowWidth: captureWidth,
      windowHeight: captureHeight,
      scrollX: 0,
      scrollY: -window.scrollY,
      imageTimeout: IMAGE_READY_TIMEOUT_MS,
      removeContainer: true,
      onclone: (clonedDoc, clonedElement) => sanitizeClonedDocumentColors(clonedDoc, clonedElement),
    });

    const jpegQuality = isPhotoPage ? 0.84 : 0.92;
    const jpeg = canvas.toDataURL('image/jpeg', jpegQuality);

    if (index > 0) pdf.addPage('a4', 'portrait');
    pdf.addImage(jpeg, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');

    // Release the large backing canvas before moving to the next page. This is important for
    // reports with several hundred images where decoded-image and canvas memory can otherwise
    // accumulate and produce corrupted gallery captures.
    canvas.width = 1;
    canvas.height = 1;

    if (isPhotoPage || index % 4 === 3) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }

  onProgress?.('Finalising PDF...');
  return pdf.output('blob');
}

export function downloadPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportElementToPdf(
  containerElement: HTMLElement,
  filename = 'Inspection_Condition_Report.pdf',
  onProgress?: (message: string) => void
): Promise<Blob> {
  const blob = await generateElementPdf(containerElement, onProgress);
  downloadPdfBlob(blob, filename);
  return blob;
}
