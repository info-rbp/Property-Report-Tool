import jsPDF from 'jspdf';
import { PROINSPECT_COMPANY } from '../config/company';
import { formatAustralianDate, splitTenantNames } from './reportFormatting';
import { InspectionArea, InspectionItem, ReportData, ReportPhoto, ReportType } from '../types/report';

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_X = 8;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN_X * 2);
const HEADER_Y = 7;
const BODY_TOP = 13;
const BODY_BOTTOM = 282;
const FOOTER_LINE_Y = 286.5;

const NAVY: [number, number, number] = [10, 37, 64];
const TEAL: [number, number, number] = [8, 145, 178];
const TEXT: [number, number, number] = [31, 41, 55];
const MUTED: [number, number, number] = [100, 116, 139];
const BORDER: [number, number, number] = [148, 163, 184];
const LIGHT_BORDER: [number, number, number] = [203, 213, 225];
const LIGHT_FILL: [number, number, number] = [248, 250, 252];
const SECTION_FILL: [number, number, number] = [241, 245, 249];
const RED: [number, number, number] = [185, 28, 28];
const BLUE: [number, number, number] = [29, 78, 216];

const ENTRY_COLUMN_WIDTHS = [34, 7, 7, 7, 78, 14, 47] as const;
const EXIT_COLUMN_WIDTHS = [42, 8, 8, 8, 128] as const;
const ROW_FONT_SIZE = 6.4;
const ROW_LINE_HEIGHT = 2.55;
const CELL_PAD = 1.15;

interface PdfImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

interface ItemFragment {
  nameLines: string[];
  agentLines: string[];
  tenantLines: string[];
  first: boolean;
}

function pdfSafeText(input: string): string {
  return input
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2022/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '?');
}

function value(value: string | undefined | null): string {
  return pdfSafeText(value || '').trim();
}

function setFont(pdf: jsPDF, size: number, style: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal') {
  pdf.setFont('helvetica', style);
  pdf.setFontSize(size);
}

function setTextColor(pdf: jsPDF, rgb: [number, number, number] = TEXT) {
  pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function wrapText(pdf: jsPDF, text: string, width: number): string[] {
  const normalized = pdfSafeText(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const paragraphs = normalized.split('\n');
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    const wrapped = pdf.splitTextToSize(paragraph, Math.max(1, width)) as string[];
    lines.push(...wrapped);
  }
  return lines.length ? lines : [''];
}

function drawWrappedLines(
  pdf: jsPDF,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
  options?: { align?: 'left' | 'center' | 'right'; maxLines?: number }
) {
  const max = options?.maxLines ? lines.slice(0, options.maxLines) : lines;
  max.forEach((line, index) => {
    pdf.text(line, x, y + (index * lineHeight), { align: options?.align || 'left' });
  });
}

function drawBrand(pdf: jsPDF, x: number, y: number, scale = 1) {
  pdf.setDrawColor(...NAVY);
  pdf.setLineWidth(0.6 * scale);
  pdf.line(x, y + (5 * scale), x + (5 * scale), y + (1 * scale));
  pdf.line(x + (5 * scale), y + (1 * scale), x + (10 * scale), y + (5 * scale));
  pdf.rect(x + (2.1 * scale), y + (5 * scale), 5.8 * scale, 4.5 * scale);
  pdf.setDrawColor(...TEAL);
  pdf.circle(x + (9.2 * scale), y + (8.2 * scale), 3 * scale);
  pdf.line(x + (11.2 * scale), y + (10.4 * scale), x + (13.3 * scale), y + (12.5 * scale));

  setFont(pdf, 15 * scale, 'bold');
  setTextColor(pdf, NAVY);
  pdf.text('ProInspect', x + (16 * scale), y + (7.4 * scale));
  setFont(pdf, 4.8 * scale, 'bold');
  pdf.text('INSPECT. REPORT. PROTECT.', x + (16 * scale), y + (11.4 * scale));
}

function reportDisplayTitle(reportType: ReportType): string {
  if (reportType === 'Entry') return 'Residential Tenancy Entry Condition Report';
  if (reportType === 'Exit') return 'Residential Tenancy Exit Condition Report';
  return 'Routine Inspection Report';
}

function reportRunningTitle(reportType: ReportType): string {
  if (reportType === 'Entry') return 'Entry Condition Report';
  if (reportType === 'Exit') return 'Exit Condition Report';
  return 'Routine Inspection Report';
}

function drawRunningHeader(pdf: jsPDF, report: ReportData, rightTitle?: string) {
  setFont(pdf, 6.8, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text(value(report.details.propertyAddress) || 'Property address not recorded', MARGIN_X, HEADER_Y);
  pdf.text(rightTitle || reportRunningTitle(report.details.reportType), PAGE_WIDTH - MARGIN_X, HEADER_Y, { align: 'right' });
  pdf.setDrawColor(...LIGHT_BORDER);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN_X, 9.2, PAGE_WIDTH - MARGIN_X, 9.2);
}

function drawFooter(pdf: jsPDF, pageNumber: number, totalPages: number, includeInitials: boolean) {
  pdf.setDrawColor(...LIGHT_BORDER);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN_X, FOOTER_LINE_Y, PAGE_WIDTH - MARGIN_X, FOOTER_LINE_Y);

  setFont(pdf, 5.8, 'bold');
  setTextColor(pdf, TEXT);
  if (includeInitials) {
    pdf.text("Tenant's Initial(s):", MARGIN_X, 291.1);
    setFont(pdf, 5.6, 'normal');
    pdf.text('1. ____   2. ____   3. ____   Date ____ / ____ / ____', MARGIN_X + 24, 291.1);
  }

  setFont(pdf, 6.2, 'bold');
  pdf.text(`${pageNumber} / ${totalPages}`, PAGE_WIDTH - MARGIN_X, 291.1, { align: 'right' });
}

function addContentPage(pdf: jsPDF, report: ReportData, title?: string): number {
  pdf.addPage('a4', 'portrait');
  drawRunningHeader(pdf, report, title);
  return BODY_TOP;
}

function drawBox(
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  fill?: [number, number, number],
  border: [number, number, number] = LIGHT_BORDER
) {
  if (fill) {
    pdf.setFillColor(fill[0], fill[1], fill[2]);
    pdf.setDrawColor(border[0], border[1], border[2]);
    pdf.rect(x, y, width, height, 'FD');
  } else {
    pdf.setDrawColor(border[0], border[1], border[2]);
    pdf.rect(x, y, width, height);
  }
}

async function yieldToBrowser() {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

async function fetchImageSource(source: string, label: string): Promise<Blob> {
  const response = await fetch(source, { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`Unable to load ${label} for the PDF (${response.status}).`);
  }
  return response.blob();
}

async function canvasToJpeg(canvas: HTMLCanvasElement, quality: number, label: string): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error(`Unable to compress ${label} for the PDF.`)),
      'image/jpeg',
      quality
    );
  });
}

async function prepareImageForPdf(
  source: string,
  label: string,
  maxDimension = 720,
  targetBytes = 45_000
): Promise<PdfImage> {
  const sourceBlob = await fetchImageSource(source, label);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(sourceBlob);
  } catch {
    throw new Error(`Unable to decode ${label} for the PDF.`);
  }

  const initialScale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  let width = Math.max(1, Math.round(bitmap.width * initialScale));
  let height = Math.max(1, Math.round(bitmap.height * initialScale));

  const canvas = document.createElement('canvas');
  const renderBitmap = () => {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error(`Unable to prepare ${label} for the PDF.`);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
  };

  try {
    renderBitmap();

    let output = await canvasToJpeg(canvas, 0.72, label);
    for (const quality of [0.64, 0.56, 0.48]) {
      if (output.size <= targetBytes) break;
      output = await canvasToJpeg(canvas, quality, label);
    }

    // Large reports can contain hundreds or thousands of photos. Keep each embedded gallery
    // image within a bounded byte budget so the final PDF remains uploadable on Cloudflare.
    // If JPEG quality alone is not enough, reduce pixel dimensions while preserving aspect ratio.
    let resizePasses = 0;
    while (output.size > targetBytes && Math.max(width, height) > 420 && resizePasses < 3) {
      const scale = Math.max(0.72, Math.min(0.9, Math.sqrt(targetBytes / output.size) * 0.95));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      renderBitmap();
      output = await canvasToJpeg(canvas, 0.56, label);
      resizePasses += 1;
    }

    const bytes = new Uint8Array(await output.arrayBuffer());
    return { bytes, width, height };
  } finally {
    bitmap.close();
    canvas.width = 1;
    canvas.height = 1;
  }
}

function photoSource(photo: ReportPhoto): string {
  return photo.dataUrl || photo.url || '';
}

function containRect(imageWidth: number, imageHeight: number, boxWidth: number, boxHeight: number) {
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    width,
    height,
    xOffset: (boxWidth - width) / 2,
    yOffset: (boxHeight - height) / 2,
  };
}

async function drawCoverPage(pdf: jsPDF, report: ReportData, onProgress?: (message: string) => void) {
  const details = report.details;
  drawBrand(pdf, 14, 15, 1);

  setFont(pdf, 7.2, 'bold');
  setTextColor(pdf, NAVY);
  pdf.text(value(details.companyName) || PROINSPECT_COMPANY.name, PAGE_WIDTH - 14, 17, { align: 'right' });
  setFont(pdf, 6.3, 'normal');
  setTextColor(pdf, TEXT);
  const companyLines = [
    value(details.companyAddress) || PROINSPECT_COMPANY.address,
    value(details.companyPhone) || PROINSPECT_COMPANY.phone,
    value(details.companyEmail) || PROINSPECT_COMPANY.email,
    (value(details.companyWebsite) || PROINSPECT_COMPANY.website).replace(/^https?:\/\//, ''),
  ].filter(Boolean);
  companyLines.forEach((line, index) => pdf.text(line, PAGE_WIDTH - 14, 21 + (index * 3.4), { align: 'right' }));

  setFont(pdf, 18, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text(
    reportDisplayTitle(details.reportType),
    PAGE_WIDTH / 2,
    62,
    { align: 'center' }
  );

  const address = value(details.propertyAddress) || 'Property address not recorded';
  setFont(pdf, 10.5, 'bold');
  const addressLines = wrapText(pdf, address, 150);
  drawWrappedLines(pdf, addressLines, PAGE_WIDTH / 2, 71, 4.6, { align: 'center' });

  const cover = details.coverPhotoUrl
    ? { source: details.coverPhotoUrl, label: 'cover photo' }
    : (() => {
        const selected = report.photos.find((photo) => photo.isCover) || report.photos[0];
        const source = selected ? photoSource(selected) : '';
        return source ? { source, label: selected?.name || 'cover photo' } : null;
      })();

  const imageBox = { x: 25, y: 91, width: 160, height: 105 };
  drawBox(pdf, imageBox.x, imageBox.y, imageBox.width, imageBox.height, LIGHT_FILL, LIGHT_BORDER);

  if (cover) {
    onProgress?.('Preparing cover photo...');
    const image = await prepareImageForPdf(cover.source, cover.label, 1400, 280_000);
    const fit = containRect(image.width, image.height, imageBox.width, imageBox.height);
    pdf.addImage(
      image.bytes,
      'JPEG',
      imageBox.x + fit.xOffset,
      imageBox.y + fit.yOffset,
      fit.width,
      fit.height,
      undefined,
      'FAST'
    );
  } else {
    setFont(pdf, 9, 'bold');
    setTextColor(pdf, MUTED);
    pdf.text('No cover photo selected', PAGE_WIDTH / 2, imageBox.y + (imageBox.height / 2), { align: 'center' });
  }

  setFont(pdf, 8.5, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text(`Report completed on ${formatAustralianDate(details.inspectionDate) || 'Not recorded'}`, PAGE_WIDTH / 2, 226, { align: 'center' });
  setFont(pdf, 8, 'normal');
  pdf.text(`Prepared by ${value(details.inspectingAgent) || 'Not recorded'}`, PAGE_WIDTH / 2, 232, { align: 'center' });

  pdf.setDrawColor(...LIGHT_BORDER);
  pdf.line(14, 275, PAGE_WIDTH - 14, 275);
  setFont(pdf, 5.8, 'bold');
  setTextColor(pdf, NAVY);
  pdf.text(value(details.companyName) || PROINSPECT_COMPANY.name, 14, 280);
  setFont(pdf, 5.2, 'normal');
  pdf.text('INSPECT. REPORT. PROTECT.', 36, 280);
}

function drawNumberedList(
  pdf: jsPDF,
  items: string[],
  x: number,
  y: number,
  width: number,
  fontSize = 6.2,
  lineHeight = 2.65,
  itemGap = 0.85
): number {
  setFont(pdf, fontSize, 'normal');
  setTextColor(pdf, TEXT);
  let cursor = y;
  items.forEach((item, index) => {
    const prefix = `${index + 1}.`;
    setFont(pdf, fontSize, 'bold');
    pdf.text(prefix, x, cursor);
    setFont(pdf, fontSize, 'normal');
    const lines = wrapText(pdf, item, width - 7);
    drawWrappedLines(pdf, lines, x + 7, cursor, lineHeight);
    cursor += Math.max(1, lines.length) * lineHeight + itemGap;
  });
  return cursor;
}

function drawTenancyDetailRow(pdf: jsPDF, y: number, label: string, content: string): number {
  const h = 8;
  drawBox(pdf, MARGIN_X, y, 46, h, SECTION_FILL, LIGHT_BORDER);
  drawBox(pdf, MARGIN_X + 46, y, CONTENT_WIDTH - 46, h, undefined, LIGHT_BORDER);
  setFont(pdf, 6.7, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text(label, MARGIN_X + 1.5, y + 5.1);
  setFont(pdf, 6.7, 'normal');
  pdf.text(content, MARGIN_X + 48, y + 5.1);
  return y + h;
}

function drawStatutoryPage(pdf: jsPDF, report: ReportData) {
  addContentPage(pdf, report, 'Property Condition Report');

  setFont(pdf, 5.8, 'bold');
  setTextColor(pdf, TEXT);
  drawBox(pdf, MARGIN_X, 13, 78, 12, LIGHT_FILL, LIGHT_BORDER);
  pdf.text('Government of Western Australia', MARGIN_X + 2, 17);
  setFont(pdf, 4.8, 'normal');
  pdf.text('Department of Local Government, Industry Regulation and Safety', MARGIN_X + 2, 20.1);
  pdf.text('Consumer Protection', MARGIN_X + 2, 23);

  setFont(pdf, 11, 'bold');
  pdf.text('FORM 1', PAGE_WIDTH - MARGIN_X, 16, { align: 'right' });
  setFont(pdf, 8.5, 'bold');
  pdf.text('Property Condition Report', PAGE_WIDTH - MARGIN_X, 20.5, { align: 'right' });
  setFont(pdf, 5.2, 'bold');
  pdf.text('RESIDENTIAL TENANCIES ACT 1987 (WA) Section 27C(6)', PAGE_WIDTH - MARGIN_X, 24, { align: 'right' });

  let y = 29;
  setFont(pdf, 7.2, 'bold');
  pdf.text('HOW TO COMPLETE THIS FORM', MARGIN_X, y);
  y += 4.2;

  y = drawNumberedList(pdf, [
    'Before the tenancy begins, the lessor or the property manager should inspect the residential premises and record the condition of the premises by indicating whether the particular room item is clean, undamaged and working by placing "Y" (YES) or "N" (NO) in the appropriate column. Where necessary, comments should be included in the report.',
    'Two copies of the report, which has been filled out and signed by the lessor or the property manager, must be given to the tenant within 7 days of the tenant moving into the premises.',
    'As soon as possible after the tenant receives the property condition report, the tenant should inspect the residential premises and complete the tenant section on both copies of the report. The tenant indicates agreement or disagreement with the condition indicated by the lessor or the property manager by placing "Y" (YES) or "N" (NO) in the appropriate column and by making any appropriate comments on the form.',
    'The tenant must return one copy of the completed property condition report to the lessor or the property manager within 7 days after receiving it. The tenant should keep the second copy of the property condition report.',
    'If photographs or video recordings are taken at the time the property inspection is carried out, it is recommended that all photographs or video recordings are signed and dated by all parties. Photographs and/or video recordings are not a substitute for accurate written descriptions of the condition of the property.',
    'As soon as practicable, and in any event within 14 days after the termination of the tenancy agreement, the lessor or the property manager should complete a property condition report indicating the condition of the premises at the end of the tenancy. This should be done in the presence of the tenant unless the tenant has been given a reasonable opportunity to be present and has not attended the inspection.',
  ], MARGIN_X, y, CONTENT_WIDTH, 6.2, 2.65, 0.85);

  y += 1.8;
  setFont(pdf, 7.2, 'bold');
  pdf.text('IMPORTANT NOTES ABOUT THIS PROPERTY CONDITION REPORT', MARGIN_X, y);
  y += 4.2;

  y = drawNumberedList(pdf, [
    'This property condition report is an important record of the condition of the residential premises when the tenancy begins. It may be used as evidence of the state of repair or general condition of the premises at the commencement of the tenancy if there is a dispute, particularly about the return of the security bond money and any damage to the premises. It is important to complete the property condition report accurately.',
    'A property condition report must be filled out whether or not a security bond is paid.',
    'At the end of the tenancy the premises must be inspected and the condition of the premises at that time will be compared to that stated in the original property condition report.',
    'A tenant is not responsible for fair wear and tear to the premises. Fair wear and tear is a general term for anything that occurs through ordinary use such as the carpet becoming worn in frequently used areas. Wilful and intentional damage, or damage caused by negligence, is not fair wear and tear.',
    'If you do not have enough space on the report, attach a separate sheet. All attachments should be signed and dated by all of the parties to the residential tenancy agreement.',
    'Information about the rights and responsibilities of lessors and tenants may be obtained from Consumer Protection on 1300 30 40 54 or at www.consumerprotection.wa.gov.au.',
  ], MARGIN_X, y, CONTENT_WIDTH, 6.2, 2.65, 0.85);

  y += 1.8;
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 11.5, LIGHT_FILL, LIGHT_BORDER);
  setFont(pdf, 6, 'normal');
  setTextColor(pdf, TEXT);
  const info = wrapText(
    pdf,
    'For further information about tenancy rights, refer to the Residential Tenancies Act 1987 or contact Consumer Protection on 1300 304 054 or www.consumerprotection.wa.gov.au. For Translating and Interpreting Services telephone TIS on 13 14 50.',
    CONTENT_WIDTH - 4
  );
  drawWrappedLines(pdf, info, MARGIN_X + 2, y + 3.4, 2.5);
  y += 14;

  setFont(pdf, 7.1, 'bold');
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 7.5, SECTION_FILL, BORDER);
  pdf.text('TENANCY DETAILS', MARGIN_X + 1.5, y + 4.9);
  y += 7.5;

  const details = report.details;
  y = drawTenancyDetailRow(pdf, y, 'Property Address:', value(details.propertyAddress));
  y = drawTenancyDetailRow(pdf, y, 'Inspecting Agent:', value(details.inspectingAgent));
  y = drawTenancyDetailRow(pdf, y, 'Inspection Date:', formatAustralianDate(details.inspectionDate));
  y = drawTenancyDetailRow(pdf, y, 'Tenancy Start Date:', formatAustralianDate(details.tenancyStartDate));
  y = drawTenancyDetailRow(pdf, y, 'Tenant/s:', value(details.tenants));
  y = drawTenancyDetailRow(pdf, y, 'Tenant Received Date:', formatAustralianDate(details.tenantReceivedDate));
  y = drawTenancyDetailRow(pdf, y, 'Report Return Date:', formatAustralianDate(details.reportReturnDate));

  if (y > BODY_BOTTOM) {
    throw new Error('Form 1 statutory page content exceeds the available A4 page height.');
  }
}

function entryColumnPositions() {
  const positions: number[] = [MARGIN_X];
  ENTRY_COLUMN_WIDTHS.forEach((width) => positions.push(positions[positions.length - 1] + width));
  return positions;
}

function drawConditionTopHeader(pdf: jsPDF, y: number): number {
  const x = entryColumnPositions();
  const h = 11.3;
  drawBox(pdf, x[0], y, x[5] - x[0], h, LIGHT_FILL, BORDER);
  drawBox(pdf, x[5], y, x[7] - x[5], h, LIGHT_FILL, BORDER);

  setFont(pdf, 6.5, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text('Agent section', (x[0] + x[5]) / 2, y + 3.2, { align: 'center' });
  pdf.text('Tenant section', (x[5] + x[7]) / 2, y + 3.2, { align: 'center' });

  setFont(pdf, 4.7, 'normal');
  const agent = wrapText(
    pdf,
    "Each item has a 'clean', 'undamaged' and 'working' column. Mark each column that applies and record any necessary comments.",
    (x[5] - x[0]) - 4
  );
  const tenant = wrapText(
    pdf,
    "If you disagree with the agent's report, record your comment here and note anything that seems unsafe or may be an injury risk.",
    (x[7] - x[5]) - 4
  );
  drawWrappedLines(pdf, agent, (x[0] + x[5]) / 2, y + 6, 1.9, { align: 'center', maxLines: 3 });
  drawWrappedLines(pdf, tenant, (x[5] + x[7]) / 2, y + 6, 1.9, { align: 'center', maxLines: 3 });

  return y + h;
}

function drawAreaHeader(pdf: jsPDF, y: number, areaName: string, continuation: boolean): number {
  const x = entryColumnPositions();
  const h = 7.8;
  ENTRY_COLUMN_WIDTHS.forEach((width, index) => drawBox(pdf, x[index], y, width, h, SECTION_FILL, BORDER));

  setFont(pdf, 6.1, 'bold');
  setTextColor(pdf, TEXT);
  const name = continuation ? `${areaName} (CONTINUED)` : areaName;
  const areaLines = wrapText(pdf, name.toUpperCase(), ENTRY_COLUMN_WIDTHS[0] - 2);
  drawWrappedLines(pdf, areaLines, x[0] + 1, y + 2.8, 2.1, { maxLines: 2 });

  const labels = ['Cln', 'Udg', 'Wkg'];
  labels.forEach((label, i) => {
    pdf.text(label, x[i + 1] + (ENTRY_COLUMN_WIDTHS[i + 1] / 2), y + 4.6, { align: 'center' });
  });

  pdf.text('Agent comments', x[4] + (ENTRY_COLUMN_WIDTHS[4] / 2), y + 2.8, { align: 'center' });
  setFont(pdf, 4.6, 'normal');
  pdf.text('Cln = Clean, Udg = Undamaged, Wkg = Working', x[4] + (ENTRY_COLUMN_WIDTHS[4] / 2), y + 5.7, { align: 'center' });

  setFont(pdf, 5.1, 'bold');
  pdf.text('Tenant', x[5] + (ENTRY_COLUMN_WIDTHS[5] / 2), y + 2.7, { align: 'center' });
  pdf.text('agrees', x[5] + (ENTRY_COLUMN_WIDTHS[5] / 2), y + 5.4, { align: 'center' });
  pdf.text('Tenant comments', x[6] + (ENTRY_COLUMN_WIDTHS[6] / 2), y + 4.2, { align: 'center' });

  return y + h;
}

function areaPhotoCount(report: ReportData, area: InspectionArea): number {
  const name = area.name.trim().toLowerCase();
  const photos = report.photos.filter((photo) => (photo.areaName || '').trim().toLowerCase() === name).length;
  return photos || area.overallPhotoCount || 0;
}

function drawOverallRow(pdf: jsPDF, y: number, count: number): number {
  const x = entryColumnPositions();
  const h = 5.6;
  ENTRY_COLUMN_WIDTHS.forEach((width, index) => drawBox(pdf, x[index], y, width, h, undefined, LIGHT_BORDER));
  setFont(pdf, 5.8, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text('Overall', x[0] + 1, y + 3.7);
  if (count > 0) {
    setTextColor(pdf, BLUE);
    setFont(pdf, 5.4, 'normal');
    pdf.text(`(${count} ${count === 1 ? 'photo' : 'photos'}, see photo gallery)`, x[4] + 1, y + 3.7);
  }
  return y + h;
}

function itemLines(pdf: jsPDF, item: InspectionItem) {
  setFont(pdf, ROW_FONT_SIZE, 'normal');
  return {
    name: wrapText(pdf, value(item.name), ENTRY_COLUMN_WIDTHS[0] - (CELL_PAD * 2)),
    agent: wrapText(pdf, value(item.agentComments), ENTRY_COLUMN_WIDTHS[4] - (CELL_PAD * 2)),
    tenant: wrapText(pdf, value(item.tenantComments), ENTRY_COLUMN_WIDTHS[6] - (CELL_PAD * 2)),
  };
}

function splitItemFragments(pdf: jsPDF, item: InspectionItem): ItemFragment[] {
  const lines = itemLines(pdf, item);
  const maxLinesPerFragment = 86;
  const count = Math.max(lines.name.length, lines.agent.length, lines.tenant.length);
  if (count <= maxLinesPerFragment) {
    return [{ nameLines: lines.name, agentLines: lines.agent, tenantLines: lines.tenant, first: true }];
  }

  const fragments: ItemFragment[] = [];
  for (let start = 0; start < count; start += maxLinesPerFragment) {
    const first = start === 0;
    fragments.push({
      nameLines: first
        ? lines.name.slice(start, start + maxLinesPerFragment)
        : [`${value(item.name)} (continued)`],
      agentLines: lines.agent.slice(start, start + maxLinesPerFragment),
      tenantLines: lines.tenant.slice(start, start + maxLinesPerFragment),
      first,
    });
  }
  return fragments;
}

function fragmentHeight(fragment: ItemFragment): number {
  const lineCount = Math.max(fragment.nameLines.length, fragment.agentLines.length, fragment.tenantLines.length, 1);
  return Math.max(5.2, (lineCount * ROW_LINE_HEIGHT) + (CELL_PAD * 2));
}

function drawBoolean(pdf: jsPDF, value: boolean | null | undefined, x: number, y: number) {
  if (value === null || value === undefined) return;
  setFont(pdf, 6.2, 'bold');
  setTextColor(pdf, value ? TEXT : RED);
  pdf.text(value ? 'Y' : 'N', x, y, { align: 'center' });
}

function drawItemRow(pdf: jsPDF, y: number, item: InspectionItem, fragment: ItemFragment): number {
  const x = entryColumnPositions();
  const h = fragmentHeight(fragment);
  ENTRY_COLUMN_WIDTHS.forEach((width, index) => drawBox(pdf, x[index], y, width, h, undefined, LIGHT_BORDER));

  setFont(pdf, ROW_FONT_SIZE, 'normal');
  setTextColor(pdf, TEXT);
  drawWrappedLines(pdf, fragment.nameLines, x[0] + CELL_PAD, y + 2.9, ROW_LINE_HEIGHT);
  drawWrappedLines(pdf, fragment.agentLines, x[4] + CELL_PAD, y + 2.9, ROW_LINE_HEIGHT);
  setFont(pdf, ROW_FONT_SIZE, 'italic');
  drawWrappedLines(pdf, fragment.tenantLines, x[6] + CELL_PAD, y + 2.9, ROW_LINE_HEIGHT);

  if (fragment.first) {
    const middleY = y + (h / 2) + 0.9;
    drawBoolean(pdf, item.clean, x[1] + (ENTRY_COLUMN_WIDTHS[1] / 2), middleY);
    drawBoolean(pdf, item.undamaged, x[2] + (ENTRY_COLUMN_WIDTHS[2] / 2), middleY);
    drawBoolean(pdf, item.working, x[3] + (ENTRY_COLUMN_WIDTHS[3] / 2), middleY);

    if (item.tenantAgrees !== null && item.tenantAgrees !== undefined) {
      setFont(pdf, 6.2, 'bold');
      setTextColor(pdf, item.tenantAgrees ? TEXT : RED);
      pdf.text(item.tenantAgrees ? 'Y' : 'N', x[5] + (ENTRY_COLUMN_WIDTHS[5] / 2), middleY, { align: 'center' });
    }
  }

  return y + h;
}

function startEntryConditionPage(pdf: jsPDF, report: ReportData): number {
  const y = addContentPage(pdf, report);
  return drawConditionTopHeader(pdf, y);
}

function drawEntryConditionPages(pdf: jsPDF, report: ReportData, onProgress?: (message: string) => void) {
  if (!report.areas.length) return;

  let y = startEntryConditionPage(pdf, report);
  let areaNumber = 0;

  report.areas.forEach((area) => {
    areaNumber += 1;
    onProgress?.(`Laying out inspection area ${areaNumber} of ${report.areas.length}...`);

    const count = areaPhotoCount(report, area);
    const fragments = area.items.flatMap((item) => splitItemFragments(pdf, item).map((fragment) => ({ item, fragment })));
    const firstRowHeight = fragments.length ? fragmentHeight(fragments[0].fragment) : 0;
    const initialNeed = 7.8 + (count > 0 ? 5.6 : 0) + firstRowHeight;

    if (y + initialNeed > BODY_BOTTOM) {
      y = startEntryConditionPage(pdf, report);
    }

    y = drawAreaHeader(pdf, y, area.name, false);
    if (count > 0) y = drawOverallRow(pdf, y, count);

    let continuation = false;
    fragments.forEach(({ item, fragment }) => {
      const h = fragmentHeight(fragment);
      if (y + h > BODY_BOTTOM) {
        y = startEntryConditionPage(pdf, report);
        y = drawAreaHeader(pdf, y, area.name, true);
        continuation = true;
      }
      y = drawItemRow(pdf, y, item, fragment);
    });

    if (!fragments.length && y > BODY_BOTTOM - 12) {
      y = startEntryConditionPage(pdf, report);
      y = drawAreaHeader(pdf, y, area.name, continuation);
    }
  });
}

function drawRoutineDetailRow(pdf: jsPDF, y: number, label: string, content: string): number {
  const h = 7.2;
  const labelWidth = 52;
  drawBox(pdf, MARGIN_X, y, labelWidth, h, SECTION_FILL, LIGHT_BORDER);
  drawBox(pdf, MARGIN_X + labelWidth, y, CONTENT_WIDTH - labelWidth, h, undefined, LIGHT_BORDER);
  setFont(pdf, 6.4, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text(label, MARGIN_X + 1.6, y + 4.7);
  setFont(pdf, 6.4, 'normal');
  pdf.text(content || 'Not recorded', MARGIN_X + labelWidth + 1.8, y + 4.7);
  return y + h;
}

function drawRoutinePageHeading(pdf: jsPDF, y: number, title: string): number {
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 8, SECTION_FILL, BORDER);
  setFont(pdf, 7.5, 'bold');
  setTextColor(pdf, NAVY);
  pdf.text(title, MARGIN_X + 1.8, y + 5.1);
  return y + 10;
}

function drawRoutineAreaHeader(pdf: jsPDF, y: number, area: InspectionArea, photoCount: number, continuation: boolean): number {
  const h = 7.2;
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, h, SECTION_FILL, BORDER);
  setFont(pdf, 6.8, 'bold');
  setTextColor(pdf, TEXT);
  const title = continuation ? `${area.name.toUpperCase()} (CONTINUED)` : area.name.toUpperCase();
  pdf.text(title, MARGIN_X + 1.6, y + 4.6);
  if (photoCount > 0) {
    setFont(pdf, 5.9, 'bold');
    setTextColor(pdf, TEAL);
    pdf.text(
      `${photoCount} ${photoCount === 1 ? 'photo' : 'photos'} - see photo gallery`,
      PAGE_WIDTH - MARGIN_X - 1.6,
      y + 4.6,
      { align: 'right' }
    );
  }
  return y + h;
}

function drawRoutineColumnHeader(pdf: jsPDF, y: number): number {
  const itemWidth = 42;
  const h = 6.2;
  drawBox(pdf, MARGIN_X, y, itemWidth, h, LIGHT_FILL, BORDER);
  drawBox(pdf, MARGIN_X + itemWidth, y, CONTENT_WIDTH - itemWidth, h, LIGHT_FILL, BORDER);
  setFont(pdf, 6.2, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text('Item', MARGIN_X + 1.6, y + 4.1);
  pdf.text('Inspection findings', MARGIN_X + itemWidth + 1.6, y + 4.1);
  return y + h;
}

function drawRoutineFindingRow(pdf: jsPDF, y: number, item: InspectionItem): number {
  const itemWidth = 42;
  const commentWidth = CONTENT_WIDTH - itemWidth;
  setFont(pdf, 6.7, 'normal');
  const itemLines = wrapText(pdf, value(item.name) || 'Overall', itemWidth - 3.2);
  const commentLines = wrapText(pdf, value(item.agentComments) || 'No finding recorded.', commentWidth - 3.2);
  const lineHeight = 2.7;
  const h = Math.max(7, Math.max(itemLines.length, commentLines.length) * lineHeight + 3);

  drawBox(pdf, MARGIN_X, y, itemWidth, h, undefined, LIGHT_BORDER);
  drawBox(pdf, MARGIN_X + itemWidth, y, commentWidth, h, undefined, LIGHT_BORDER);
  setFont(pdf, 6.6, 'bold');
  setTextColor(pdf, TEXT);
  drawWrappedLines(pdf, itemLines, MARGIN_X + 1.6, y + 3.8, lineHeight);
  setFont(pdf, 6.7, 'normal');
  drawWrappedLines(pdf, commentLines, MARGIN_X + itemWidth + 1.6, y + 3.8, lineHeight);
  return y + h;
}

function drawRoutineFindingsPages(pdf: jsPDF, report: ReportData, onProgress?: (message: string) => void) {
  let y = addContentPage(pdf, report, 'Routine Inspection Report');
  const details = report.details;

  y = drawRoutinePageHeading(pdf, y, 'Inspection Summary');
  const rows: Array<[string, string]> = [
    ['Inspection Completed On', formatAustralianDate(details.inspectionDate)],
    ['Property Manager / Inspector', value(details.inspectingAgent)],
    ['Lease Start Date', formatAustralianDate(details.tenancyStartDate)],
    ['Lease Expiry Date', formatAustralianDate(details.leaseExpiryDate)],
    ['Rent Review', formatAustralianDate(details.rentReviewDate)],
    ['Current Rental Amount', value(details.currentRentalAmount)],
    ['Tenant/s', value(details.tenants)],
  ];
  rows.forEach(([label, content]) => {
    y = drawRoutineDetailRow(pdf, y, label, content);
  });

  y += 4;
  y = drawRoutinePageHeading(pdf, y, 'Inspection Findings');

  report.areas.forEach((area, areaIndex) => {
    onProgress?.(`Laying out routine inspection area ${areaIndex + 1} of ${report.areas.length}...`);
    const count = areaPhotoCount(report, area);
    const firstItem = area.items[0];
    let firstHeight = 7;
    if (firstItem) {
      setFont(pdf, 6.7, 'normal');
      const itemLines = wrapText(pdf, value(firstItem.name) || 'Overall', 38.8);
      const commentLines = wrapText(pdf, value(firstItem.agentComments) || 'No finding recorded.', 148.8);
      firstHeight = Math.max(7, Math.max(itemLines.length, commentLines.length) * 2.7 + 3);
    }

    if (y + 7.2 + 6.2 + firstHeight > BODY_BOTTOM) {
      y = addContentPage(pdf, report, 'Routine Inspection Report');
      y = drawRoutinePageHeading(pdf, y, 'Inspection Findings (continued)');
    }

    y = drawRoutineAreaHeader(pdf, y, area, count, false);
    y = drawRoutineColumnHeader(pdf, y);

    const items = area.items.length
      ? area.items
      : [{ id: `${area.id}-empty`, name: 'Overall', agentComments: 'No inspection finding recorded.' } as InspectionItem];

    items.forEach((item) => {
      setFont(pdf, 6.7, 'normal');
      const itemLines = wrapText(pdf, value(item.name) || 'Overall', 38.8);
      const commentLines = wrapText(pdf, value(item.agentComments) || 'No finding recorded.', 148.8);
      const h = Math.max(7, Math.max(itemLines.length, commentLines.length) * 2.7 + 3);

      if (y + h > BODY_BOTTOM) {
        y = addContentPage(pdf, report, 'Routine Inspection Report');
        y = drawRoutinePageHeading(pdf, y, 'Inspection Findings (continued)');
        y = drawRoutineAreaHeader(pdf, y, area, count, true);
        y = drawRoutineColumnHeader(pdf, y);
      }

      y = drawRoutineFindingRow(pdf, y, item);
    });

    y += 2.5;
  });
}

function drawNarrativeSection(
  pdf: jsPDF,
  report: ReportData,
  y: number,
  title: string,
  text: string,
  accent: [number, number, number] = NAVY
): number {
  setFont(pdf, 6.8, 'normal');
  const allLines = wrapText(pdf, value(text) || 'No comments recorded.', CONTENT_WIDTH - 4);
  const lineHeight = 2.8;
  let offset = 0;
  let continuation = false;

  while (offset < allLines.length) {
    const minimumBlock = 22;
    if (y + minimumBlock > BODY_BOTTOM) {
      y = addContentPage(pdf, report, reportRunningTitle(report.details.reportType));
    }

    const available = BODY_BOTTOM - y;
    const maxLines = Math.max(1, Math.floor((available - 12) / lineHeight));
    const chunk = allLines.slice(offset, offset + maxLines);
    const boxHeight = Math.max(14, (chunk.length * lineHeight) + 5);

    drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 7.2, SECTION_FILL, BORDER);
    setFont(pdf, 6.8, 'bold');
    setTextColor(pdf, accent);
    pdf.text(continuation ? `${title} (continued)` : title, MARGIN_X + 1.7, y + 4.7);
    y += 7.2;

    drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, boxHeight, undefined, LIGHT_BORDER);
    setFont(pdf, 6.8, 'normal');
    setTextColor(pdf, TEXT);
    drawWrappedLines(pdf, chunk, MARGIN_X + 2, y + 4, lineHeight);
    y += boxHeight + 3;

    offset += chunk.length;
    continuation = true;
    if (offset < allLines.length) {
      y = addContentPage(pdf, report, reportRunningTitle(report.details.reportType));
    }
  }

  return y;
}

function drawAgentSignoff(pdf: jsPDF, y: number, report: ReportData, heading: string): number {
  const details = report.details;
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 8, SECTION_FILL, BORDER);
  setFont(pdf, 7, 'bold');
  setTextColor(pdf, NAVY);
  pdf.text(heading, MARGIN_X + 1.8, y + 5.1);
  y += 8;

  const widths = [65, 75, CONTENT_WIDTH - 140];
  let x = MARGIN_X;
  widths.forEach((width) => {
    drawBox(pdf, x, y, width, 18, undefined, LIGHT_BORDER);
    x += width;
  });
  setFont(pdf, 6, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text('Print Name:', MARGIN_X + 1.8, y + 4);
  setFont(pdf, 7, 'normal');
  pdf.text(value(details.agentSignName) || value(details.inspectingAgent) || 'Not recorded', MARGIN_X + 1.8, y + 11);
  setFont(pdf, 6, 'bold');
  pdf.text('Signature:', MARGIN_X + 66.8, y + 4);
  setFont(pdf, 8, 'italic');
  pdf.text(value(details.agentSignName) || value(details.inspectingAgent) || '', MARGIN_X + 66.8, y + 11.2);
  setFont(pdf, 6, 'bold');
  pdf.text('Date:', MARGIN_X + 141.8, y + 4);
  setFont(pdf, 7, 'normal');
  pdf.text(formatAustralianDate(details.agentSignDate || details.inspectionDate) || 'Not recorded', MARGIN_X + 141.8, y + 11);

  return y + 22;
}

function drawDisclaimerSection(pdf: jsPDF, report: ReportData, y: number): number {
  setFont(pdf, 6, 'italic');
  const lines = wrapText(pdf, value(report.details.disclaimerText) || 'No disclaimer recorded.', CONTENT_WIDTH);
  const lineHeight = 2.5;
  const height = (lines.length * lineHeight) + 8;
  if (y + height > BODY_BOTTOM) {
    y = addContentPage(pdf, report, reportRunningTitle(report.details.reportType));
  }

  setFont(pdf, 6.2, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text('DISCLAIMER:', MARGIN_X, y + 1.5);
  setFont(pdf, 6, 'italic');
  setTextColor(pdf, MUTED);
  drawWrappedLines(pdf, lines, MARGIN_X, y + 5.2, lineHeight);
  return y + height;
}

function drawRoutineClosingPages(pdf: jsPDF, report: ReportData) {
  let y = addContentPage(pdf, report, 'Routine Inspection Report');
  y = drawRoutinePageHeading(pdf, y, 'Inspection Summary & Actions');
  y = drawNarrativeSection(pdf, report, y, 'Agent Comments', report.details.additionalComments);
  y = drawNarrativeSection(pdf, report, y, 'Maintenance Comments', report.details.maintenanceComments || '', RED);

  if (y + 48 > BODY_BOTTOM) {
    y = addContentPage(pdf, report, 'Routine Inspection Report');
  }
  y = drawAgentSignoff(pdf, y, report, 'Prepared by / Report sign-off');
  y += 3;
  drawDisclaimerSection(pdf, report, y);
}

interface ExitItemFragment {
  nameLines: string[];
  agentLines: string[];
  first: boolean;
}

function exitColumnPositions(): number[] {
  const positions: number[] = [MARGIN_X];
  EXIT_COLUMN_WIDTHS.forEach((width) => positions.push(positions[positions.length - 1] + width));
  return positions;
}

function drawExitAgentHeader(pdf: jsPDF, y: number): number {
  const h = 10.5;
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, h, LIGHT_FILL, BORDER);
  setFont(pdf, 6.7, 'bold');
  setTextColor(pdf, NAVY);
  pdf.text('Agent section', PAGE_WIDTH / 2, y + 3.2, { align: 'center' });
  setFont(pdf, 5.1, 'normal');
  setTextColor(pdf, TEXT);
  const lines = wrapText(
    pdf,
    "Each item records whether it was clean, undamaged and working at the exit inspection. Y = yes, N = no. Detailed observations are recorded in Agent comments.",
    CONTENT_WIDTH - 5
  );
  drawWrappedLines(pdf, lines, PAGE_WIDTH / 2, y + 6.1, 1.9, { align: 'center', maxLines: 2 });
  return y + h;
}

function drawExitAreaHeader(pdf: jsPDF, y: number, areaName: string, continuation: boolean): number {
  const x = exitColumnPositions();
  const h = 7.8;
  EXIT_COLUMN_WIDTHS.forEach((width, index) => drawBox(pdf, x[index], y, width, h, SECTION_FILL, BORDER));

  setFont(pdf, 6.2, 'bold');
  setTextColor(pdf, TEXT);
  const label = continuation ? `${areaName.toUpperCase()} (CONTINUED)` : areaName.toUpperCase();
  const areaLines = wrapText(pdf, label, EXIT_COLUMN_WIDTHS[0] - 2.2);
  drawWrappedLines(pdf, areaLines, x[0] + 1.2, y + 2.9, 2.2, { maxLines: 2 });

  ['Cln', 'Udg', 'Wkg'].forEach((heading, index) => {
    pdf.text(heading, x[index + 1] + (EXIT_COLUMN_WIDTHS[index + 1] / 2), y + 4.8, { align: 'center' });
  });
  pdf.text('Agent comments', x[4] + (EXIT_COLUMN_WIDTHS[4] / 2), y + 3.1, { align: 'center' });
  setFont(pdf, 4.6, 'normal');
  pdf.text('Cln = Clean, Udg = Undamaged, Wkg = Working', x[4] + (EXIT_COLUMN_WIDTHS[4] / 2), y + 6, { align: 'center' });

  return y + h;
}

function drawExitOverallRow(pdf: jsPDF, y: number, count: number): number {
  const x = exitColumnPositions();
  const h = 5.8;
  EXIT_COLUMN_WIDTHS.forEach((width, index) => drawBox(pdf, x[index], y, width, h, undefined, LIGHT_BORDER));
  setFont(pdf, 5.9, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text('Overall', x[0] + 1.2, y + 3.8);
  if (count > 0) {
    setFont(pdf, 5.5, 'normal');
    setTextColor(pdf, TEAL);
    pdf.text(`(${count} ${count === 1 ? 'photo' : 'photos'}, see photo gallery)`, x[4] + 1.2, y + 3.8);
  }
  return y + h;
}

function exitItemFragments(pdf: jsPDF, item: InspectionItem): ExitItemFragment[] {
  setFont(pdf, 6.4, 'normal');
  const nameLines = wrapText(pdf, value(item.name), EXIT_COLUMN_WIDTHS[0] - 2.4);
  const agentLines = wrapText(pdf, value(item.agentComments), EXIT_COLUMN_WIDTHS[4] - 2.4);
  const maxLinesPerFragment = 86;
  const count = Math.max(nameLines.length, agentLines.length, 1);
  const fragments: ExitItemFragment[] = [];

  for (let start = 0; start < count; start += maxLinesPerFragment) {
    const first = start === 0;
    fragments.push({
      nameLines: first ? nameLines.slice(start, start + maxLinesPerFragment) : [`${value(item.name)} (continued)`],
      agentLines: agentLines.slice(start, start + maxLinesPerFragment),
      first,
    });
  }

  return fragments;
}

function exitFragmentHeight(fragment: ExitItemFragment): number {
  const lineCount = Math.max(fragment.nameLines.length, fragment.agentLines.length, 1);
  return Math.max(5.6, (lineCount * 2.6) + 2.5);
}

function drawExitItemRow(pdf: jsPDF, y: number, item: InspectionItem, fragment: ExitItemFragment): number {
  const x = exitColumnPositions();
  const h = exitFragmentHeight(fragment);
  EXIT_COLUMN_WIDTHS.forEach((width, index) => drawBox(pdf, x[index], y, width, h, undefined, LIGHT_BORDER));

  setFont(pdf, 6.4, 'bold');
  setTextColor(pdf, TEXT);
  drawWrappedLines(pdf, fragment.nameLines, x[0] + 1.2, y + 3.1, 2.6);
  setFont(pdf, 6.4, 'normal');
  drawWrappedLines(pdf, fragment.agentLines, x[4] + 1.2, y + 3.1, 2.6);

  if (fragment.first) {
    const midY = y + (h / 2) + 0.9;
    drawBoolean(pdf, item.clean, x[1] + (EXIT_COLUMN_WIDTHS[1] / 2), midY);
    drawBoolean(pdf, item.undamaged, x[2] + (EXIT_COLUMN_WIDTHS[2] / 2), midY);
    drawBoolean(pdf, item.working, x[3] + (EXIT_COLUMN_WIDTHS[3] / 2), midY);
  }

  return y + h;
}

function startExitConditionPage(pdf: jsPDF, report: ReportData): number {
  let y = addContentPage(pdf, report, 'Exit Condition Report');
  y = drawExitAgentHeader(pdf, y);
  return y;
}

function drawExitConditionPages(pdf: jsPDF, report: ReportData, onProgress?: (message: string) => void) {
  if (!report.areas.length) return;

  let y = startExitConditionPage(pdf, report);

  report.areas.forEach((area, areaIndex) => {
    onProgress?.(`Laying out exit inspection area ${areaIndex + 1} of ${report.areas.length}...`);
    const count = areaPhotoCount(report, area);
    const fragments = area.items.flatMap((item) =>
      exitItemFragments(pdf, item).map((fragment) => ({ item, fragment }))
    );
    const firstHeight = fragments.length ? exitFragmentHeight(fragments[0].fragment) : 0;
    const initialNeed = 7.8 + (count > 0 ? 5.8 : 0) + firstHeight;

    if (y + initialNeed > BODY_BOTTOM) {
      y = startExitConditionPage(pdf, report);
    }

    y = drawExitAreaHeader(pdf, y, area.name, false);
    if (count > 0) y = drawExitOverallRow(pdf, y, count);

    fragments.forEach(({ item, fragment }) => {
      const h = exitFragmentHeight(fragment);
      if (y + h > BODY_BOTTOM) {
        y = startExitConditionPage(pdf, report);
        y = drawExitAreaHeader(pdf, y, area.name, true);
      }
      y = drawExitItemRow(pdf, y, item, fragment);
    });

    if (!fragments.length) {
      const placeholder: InspectionItem = {
        id: `${area.id}-empty`,
        name: 'Overall',
        agentComments: 'No condition commentary recorded.',
      };
      const fragment = exitItemFragments(pdf, placeholder)[0];
      if (y + exitFragmentHeight(fragment) > BODY_BOTTOM) {
        y = startExitConditionPage(pdf, report);
        y = drawExitAreaHeader(pdf, y, area.name, true);
      }
      y = drawExitItemRow(pdf, y, placeholder, fragment);
    }
  });
}

function photoCaption(photo: ReportPhoto, total: number, ordinal: number): string {
  const area = value(photo.areaName) || 'General';
  return `${area}: Overall (photo ${ordinal} of ${total})`;
}

async function drawPhotoPages(pdf: jsPDF, report: ReportData, onProgress?: (message: string) => void) {
  if (!report.photos.length) return;

  const areaOrder = new Map(
    report.areas.map((area, index) => [area.name.trim().toLowerCase(), index])
  );
  const orderedPhotos = report.photos
    .map((photo, originalIndex) => ({ photo, originalIndex }))
    .sort((a, b) => {
      const areaA = (value(a.photo.areaName) || 'General').toLowerCase();
      const areaB = (value(b.photo.areaName) || 'General').toLowerCase();
      const orderA = areaOrder.get(areaA) ?? Number.MAX_SAFE_INTEGER;
      const orderB = areaOrder.get(areaB) ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      if (areaA !== areaB) return areaA.localeCompare(areaB);
      const indexA = a.photo.photoIndex ?? Number.MAX_SAFE_INTEGER;
      const indexB = b.photo.photoIndex ?? Number.MAX_SAFE_INTEGER;
      if (indexA !== indexB) return indexA - indexB;
      return a.originalIndex - b.originalIndex;
    })
    .map(({ photo }) => photo);

  const counts = new Map<string, number>();
  orderedPhotos.forEach((photo) => {
    const key = (value(photo.areaName) || 'General').toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const ordinals = new Map<string, number>();
  const photoOrdinal = new Map<string, number>();
  orderedPhotos.forEach((photo) => {
    const key = (value(photo.areaName) || 'General').toLowerCase();
    const ordinal = (ordinals.get(key) || 0) + 1;
    ordinals.set(key, ordinal);
    photoOrdinal.set(photo.id, ordinal);
  });

  const photosPerPage = 12;
  const columns = 3;
  const rows = 4;
  const gapX = 3;
  const gapY = 3;
  const firstTitleHeight = 7;
  const cellWidth = (CONTENT_WIDTH - (gapX * (columns - 1))) / columns;
  const captionHeight = 5.2;
  let embedded = 0;

  for (let pageStart = 0; pageStart < orderedPhotos.length; pageStart += photosPerPage) {
    const pagePhotos = orderedPhotos.slice(pageStart, pageStart + photosPerPage);
    const pageNumber = Math.floor(pageStart / photosPerPage) + 1;
    const photoPageCount = Math.ceil(orderedPhotos.length / photosPerPage);

    let y = addContentPage(pdf, report, 'Inspection Photos');
    if (pageStart === 0) {
      drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, firstTitleHeight, SECTION_FILL, BORDER);
      setFont(pdf, 7, 'bold');
      setTextColor(pdf, TEXT);
      pdf.text(`Agent Inspection Photos (${orderedPhotos.length} photos)`, MARGIN_X + 1.5, y + 4.6);
      y += firstTitleHeight + 2;
    }

    const gridTop = y;
    const availableHeight = BODY_BOTTOM - gridTop;
    const cellHeight = (availableHeight - (gapY * (rows - 1))) / rows;
    if (cellHeight <= captionHeight + 4) {
      throw new Error('PDF photo layout validation failed because the gallery cells are too small.');
    }

    onProgress?.(`Rendering photo page ${pageNumber} of ${photoPageCount}...`);

    for (let i = 0; i < pagePhotos.length; i++) {
      const photo = pagePhotos[i];
      const source = photoSource(photo);
      if (!source) {
        throw new Error(`Photo "${photo.name || photo.id}" has no image source. The report was not finalised.`);
      }

      const row = Math.floor(i / columns);
      const col = i % columns;
      const x = MARGIN_X + (col * (cellWidth + gapX));
      const cellY = y + (row * (cellHeight + gapY));

      drawBox(pdf, x, cellY, cellWidth, cellHeight, undefined, LIGHT_BORDER);
      setFont(pdf, 5.2, 'bold');
      setTextColor(pdf, TEXT);
      const areaKey = (value(photo.areaName) || 'General').toLowerCase();
      const caption = wrapText(
        pdf,
        photoCaption(photo, counts.get(areaKey) || 1, photoOrdinal.get(photo.id) || 1),
        cellWidth - 2
      );
      drawWrappedLines(pdf, caption, x + 1, cellY + 2.6, 1.9, { maxLines: 2 });

      const imageY = cellY + captionHeight;
      const imageHeight = cellHeight - captionHeight;
      const image = await prepareImageForPdf(source, photo.name || `photo ${embedded + 1}`, 720, 45_000);
      const fit = containRect(image.width, image.height, cellWidth - 1.2, imageHeight - 1.2);

      pdf.addImage(
        image.bytes,
        'JPEG',
        x + 0.6 + fit.xOffset,
        imageY + 0.6 + fit.yOffset,
        fit.width,
        fit.height,
        undefined,
        'FAST'
      );

      embedded += 1;
      if (embedded % 4 === 0) await yieldToBrowser();
    }
  }

  if (embedded !== orderedPhotos.length) {
    throw new Error(`PDF photo validation failed: expected ${orderedPhotos.length} photos but embedded ${embedded}.`);
  }
}

function drawDateRow(pdf: jsPDF, y: number, label: string, date: string): number {
  const h = 8.2;
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, h, undefined, LIGHT_BORDER);
  setFont(pdf, 6.7, 'normal');
  setTextColor(pdf, TEXT);
  pdf.text(label, MARGIN_X + 1.8, y + 5.2);
  drawBox(pdf, PAGE_WIDTH - MARGIN_X - 53, y + 0.9, 51.5, h - 1.8, LIGHT_FILL, LIGHT_BORDER);
  pdf.text(formatAustralianDate(date) || '/ /', PAGE_WIDTH - MARGIN_X - 27.2, y + 5.2, { align: 'center' });
  return y + h;
}

function drawFinalPage(pdf: jsPDF, report: ReportData) {
  let y = addContentPage(pdf, report);
  const details = report.details;

  if (details.reportType === 'Exit') {
    drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 8, SECTION_FILL, BORDER);
    setFont(pdf, 7.4, 'bold');
    setTextColor(pdf, NAVY);
    pdf.text('Special Reporting at Exit Condition Report', MARGIN_X + 1.8, y + 5.1);
    y += 12;

    setFont(pdf, 7.5, 'bold');
    setTextColor(pdf, TEXT);
    pdf.text('Approximate dates when work last done on residential premises', MARGIN_X, y);
    y += 3.5;
    y = drawDateRow(pdf, y, 'Painting of premises (external):', value(details.paintingPremisesExternalDate));
    y = drawDateRow(pdf, y, 'Painting of premises (internal):', value(details.paintingPremisesInternalDate));
    y = drawDateRow(pdf, y, 'Floorcoverings laid:', value(details.floorcoveringsLaidDate));
    y = drawDateRow(pdf, y, 'Floorcoverings professionally cleaned:', value(details.floorcoveringsCleanedDate));
    y += 4;

    y = drawNarrativeSection(pdf, report, y, 'Exit Report Additional Comments', details.additionalComments);

    if (y + 48 > BODY_BOTTOM) {
      y = addContentPage(pdf, report, 'Exit Condition Report');
    }
    y = drawAgentSignoff(pdf, y, report, 'Agent Signature at the END of the Tenancy');
    y += 3;
    drawDisclaimerSection(pdf, report, y);
    return;
  }

  setFont(pdf, 8, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text('Entry Report Additional comments', MARGIN_X, y + 3.5);
  y += 6;
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 32, LIGHT_FILL, BORDER);
  setFont(pdf, 7, 'normal');
  const comments = wrapText(pdf, value(details.additionalComments) || 'No additional general comments provided.', CONTENT_WIDTH - 4);
  drawWrappedLines(pdf, comments, MARGIN_X + 2, y + 4.6, 2.8, { maxLines: 9 });
  y += 36;

  setFont(pdf, 7.5, 'bold');
  pdf.text('Approximate dates when work last done on residential premises', MARGIN_X, y);
  y += 3.2;
  y = drawDateRow(pdf, y, 'Painting of premises (external):', value(details.paintingPremisesExternalDate));
  y = drawDateRow(pdf, y, 'Painting of premises (internal):', value(details.paintingPremisesInternalDate));
  y = drawDateRow(pdf, y, 'Floorcoverings laid:', value(details.floorcoveringsLaidDate));
  y = drawDateRow(pdf, y, 'Floorcoverings professionally cleaned:', value(details.floorcoveringsCleanedDate));
  setFont(pdf, 5.8, 'italic');
  setTextColor(pdf, MUTED);
  pdf.text('Further items and comments may be recorded on a separate sheet signed by the lessor/property manager and tenant.', MARGIN_X, y + 3.5);
  y += 7.5;

  y = drawAgentSignoff(pdf, y, report, "Lessor/property manager's signature");

  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 8, SECTION_FILL, BORDER);
  setFont(pdf, 7.2, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text("Tenant's Acknowledgement & Signature", MARGIN_X + 1.8, y + 5.1);
  y += 8;
  setFont(pdf, 6.2, 'normal');
  const statement = wrapText(
    pdf,
    'I/we have received and read the Condition Report for the above property and understand that it must be returned within 7 days.',
    CONTENT_WIDTH - 3
  );
  drawBox(pdf, MARGIN_X, y, CONTENT_WIDTH, 11, undefined, LIGHT_BORDER);
  drawWrappedLines(pdf, statement, MARGIN_X + 1.8, y + 3.8, 2.6, { maxLines: 3 });
  y += 11;

  const parsedTenantNames = splitTenantNames(details.tenants, 3);
  const tenantNames = [
    value(details.tenant1SignName) || parsedTenantNames[0] || '',
    value(details.tenant2SignName) || parsedTenantNames[1] || '',
    value(details.tenant3SignName) || parsedTenantNames[2] || '',
  ];

  tenantNames.forEach((name, index) => {
    drawBox(pdf, MARGIN_X, y, 62, 18, undefined, LIGHT_BORDER);
    drawBox(pdf, MARGIN_X + 62, y, 82, 18, undefined, LIGHT_BORDER);
    drawBox(pdf, MARGIN_X + 144, y, CONTENT_WIDTH - 144, 18, undefined, LIGHT_BORDER);
    setFont(pdf, 6.2, 'bold');
    pdf.text(`Tenant ${index + 1}`, MARGIN_X + 1.8, y + 4);
    setFont(pdf, 5.8, 'normal');
    pdf.text('Print Name:', MARGIN_X + 1.8, y + 7.3);
    setFont(pdf, 7.2, 'bold');
    pdf.text(name, MARGIN_X + 1.8, y + 13.2);
    setFont(pdf, 5.8, 'normal');
    pdf.text('Signature:', MARGIN_X + 63.8, y + 4);
    pdf.text('Date:', MARGIN_X + 145.8, y + 4);
    pdf.text('____ / ____ / ________', MARGIN_X + 145.8, y + 13.2);
    y += 18;
  });
  y += 5;

  if (y > BODY_BOTTOM - 16) {
    throw new Error('Final report signature page content exceeds the available A4 page height.');
  }

  setFont(pdf, 6.2, 'bold');
  setTextColor(pdf, TEXT);
  pdf.text('DISCLAIMER:', MARGIN_X, y);
  setFont(pdf, 6, 'italic');
  setTextColor(pdf, MUTED);
  const disclaimer = wrapText(pdf, value(details.disclaimerText), CONTENT_WIDTH);
  drawWrappedLines(pdf, disclaimer, MARGIN_X, y + 3.8, 2.5, { maxLines: Math.max(1, Math.floor((BODY_BOTTOM - y - 5) / 2.5)) });
}

function addFooters(pdf: jsPDF, report: ReportData) {
  const total = pdf.getNumberOfPages();
  for (let page = 2; page <= total; page++) {
    pdf.setPage(page);
    drawFooter(pdf, page, total, report.details.reportType === 'Entry');
  }
}

export async function generateReportPdf(
  report: ReportData,
  onProgress?: (message: string) => void
): Promise<Blob> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
    putOnlyUsedFonts: true,
  });

  pdf.setProperties({
    title: `ProInspect ${report.details.reportType} Report - ${value(report.details.propertyAddress)}`,
    subject: `${report.details.reportType} property inspection report`,
    author: value(report.details.companyName) || PROINSPECT_COMPANY.name,
    creator: 'ProInspect Property Reports',
  });

  onProgress?.('Building report cover...');
  await drawCoverPage(pdf, report, onProgress);

  if (report.details.reportType === 'Entry') {
    onProgress?.('Building statutory Form 1 page...');
    drawStatutoryPage(pdf, report);
    drawEntryConditionPages(pdf, report, onProgress);
  } else {
    drawSimpleConditionPages(pdf, report, onProgress);
  }

  await drawPhotoPages(pdf, report, onProgress);

  onProgress?.('Building signatures and final page...');
  drawFinalPage(pdf, report);
  addFooters(pdf, report);

  const expectedMinimumPages =
    1 +
    (report.details.reportType === 'Entry' ? 1 : 0) +
    (report.areas.length ? 1 : 0) +
    (report.photos.length ? Math.ceil(report.photos.length / 12) : 0) +
    1;

  if (pdf.getNumberOfPages() < expectedMinimumPages) {
    throw new Error('PDF validation failed because the generated page count was lower than expected.');
  }

  onProgress?.(`Finalising ${pdf.getNumberOfPages()}-page PDF...`);
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
