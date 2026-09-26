import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Modern browsers and Tailwind CSS v4 compute colors using the CSS `oklch(...)` format
 * (e.g., in color, backgroundColor, borderColor, outlineColor, textDecorationColor).
 *
 * html2canvas (v1.4.x) throws an exception:
 * "Attempting to parse an unsupported color function 'oklch'"
 * whenever it encounters any computed style containing `oklch`.
 *
 * To guarantee 100% reliability:
 * 1. We sanitize style tags inside the cloned document.
 * 2. In `onclone`, we iterate over all rendered elements in the cloned document and
 *    explicitly override computed colors with standard hex / rgb values on their inline style.
 *    Because inline styles take highest priority and contain standard hex/rgb, html2canvas
 *    never attempts to parse an oklch color string.
 */
function sanitizeClonedDocumentColors(clonedDoc: Document, clonedTarget: HTMLElement) {
  // 1. Sanitize text in all style elements
  clonedDoc.querySelectorAll('style').forEach((styleTag) => {
    if (styleTag.textContent && styleTag.textContent.includes('oklch')) {
      styleTag.textContent = styleTag.textContent.replace(
        /oklch\([^)]+\)/g,
        '#334155'
      );
    }
  });

  // 2. Also remove any external style link tags from the cloned document if they might have oklch
  // and inject a rock-solid PDF-specific style sheet
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
    }
    .pdf-page table {
      border-color: #94a3b8 !important;
    }
    .pdf-page th, .pdf-page td {
      border-color: #cbd5e1 !important;
    }
  `;
  clonedDoc.head.appendChild(safeStyles);

  // 3. Walk all elements in the cloned target and override any computed style that outputs oklch
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

    // Check inline style first
    const inline = el.getAttribute('style');
    if (inline && inline.includes('oklch')) {
      el.setAttribute('style', inline.replace(/oklch\([^)]+\)/g, '#1e293b'));
    }

    try {
      const computed = win.getComputedStyle(el);
      for (const prop of colorProperties) {
        const val = computed[prop] as string;
        if (val && typeof val === 'string' && val.includes('oklch')) {
          if (prop === 'backgroundColor') {
            el.style.backgroundColor = '#ffffff';
          } else if (prop.toString().includes('border') || prop.toString().includes('Border')) {
            el.style.borderColor = '#cbd5e1';
          } else if (prop === 'outlineColor') {
            el.style.outlineColor = 'transparent';
          } else {
            el.style.color = '#0f172a';
          }
        }
      }
    } catch {
      // Ignore if inaccessible
    }
  }
}

export async function exportElementToPdf(
  containerElement: HTMLElement,
  filename = 'Inspection_Condition_Report.pdf',
  onProgress?: (msg: string) => void
): Promise<void> {
  const pageElements = Array.from(
    containerElement.querySelectorAll<HTMLElement>('.pdf-page')
  );

  if (pageElements.length === 0) {
    throw new Error('No report pages found to export. Please switch to the Preview tab first.');
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pdfWidth = 210;
  const pdfHeight = 297;

  for (let i = 0; i < pageElements.length; i++) {
    const pageEl = pageElements[i];
    if (onProgress) {
      onProgress(`Rendering page ${i + 1} of ${pageElements.length}...`);
    }

    // Capture using html2canvas with onclone hook
    const canvas = await html2canvas(pageEl, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: pageEl.scrollWidth || 794,
      onclone: (clonedDoc, clonedElement) => {
        sanitizeClonedDocumentColors(clonedDoc, clonedElement);
      },
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    if (i > 0) {
      pdf.addPage('a4', 'portrait');
    }

    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
  }

  if (onProgress) onProgress('Finalizing PDF download...');
  pdf.save(filename);
}
