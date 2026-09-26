import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';

/**
 * Modern browsers and Tailwind CSS v4 compute colors using CSS `oklab(...)` and `oklch(...)` formats
 * (e.g., in color, backgroundColor, borderColor, outlineColor, textDecorationColor).
 *
 * Using `html2canvas-pro` provides native support for modern CSS color spaces including `oklab`,
 * `oklch`, `color(display-p3 ...)`, etc.
 *
 * Additionally, we sanitize the cloned DOM to ensure 100% consistent rendering across all
 * browser environments and headless PDF engines.
 */
function sanitizeClonedDocumentColors(clonedDoc: Document, clonedTarget: HTMLElement) {
  // 1. Sanitize text in all style elements to standard hex/rgb fallbacks if present
  clonedDoc.querySelectorAll('style').forEach((styleTag) => {
    if (styleTag.textContent) {
      if (styleTag.textContent.includes('oklch') || styleTag.textContent.includes('oklab')) {
        styleTag.textContent = styleTag.textContent
          .replace(/oklch\([^)]+\)/g, '#334155')
          .replace(/oklab\([^)]+\)/g, '#334155');
      }
    }
  });

  // 2. Inject explicit PDF-specific safe CSS rules into the cloned document
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

  // 3. Walk all elements in the cloned target and replace any inline or computed oklab/oklch strings
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
    if (inline && (inline.includes('oklch') || inline.includes('oklab'))) {
      el.setAttribute(
        'style',
        inline
          .replace(/oklch\([^)]+\)/g, '#1e293b')
          .replace(/oklab\([^)]+\)/g, '#1e293b')
      );
    }

    try {
      const computed = win.getComputedStyle(el);
      for (const prop of colorProperties) {
        const val = computed[prop] as string;
        if (val && typeof val === 'string' && (val.includes('oklch') || val.includes('oklab'))) {
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

    // Capture using html2canvas-pro with onclone hook
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
