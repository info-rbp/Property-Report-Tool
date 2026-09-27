import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';

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
    }
    .pdf-page table {
      border-color: #94a3b8 !important;
    }
    .pdf-page th, .pdf-page td {
      border-color: #cbd5e1 !important;
    }
  `;
  clonedDoc.head.appendChild(safeStyles);

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
    onProgress?.(`Rendering page ${index + 1} of ${pageElements.length}...`);

    const canvas = await html2canvas(page, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: page.scrollWidth || 794,
      onclone: (clonedDoc, clonedElement) => sanitizeClonedDocumentColors(clonedDoc, clonedElement),
    });

    if (index > 0) pdf.addPage('a4', 'portrait');
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
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
