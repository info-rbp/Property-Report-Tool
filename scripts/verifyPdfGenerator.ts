import { formatAustralianDate, renumberPhotosByArea, splitTenantNames } from '../src/lib/reportFormatting';
import { generateReportPdf } from '../src/lib/reportPdf';
import { ReportData } from '../src/types/report';

if (formatAustralianDate('2026-09-27') !== '27/09/2026') {
  throw new Error('Australian date formatting regression detected.');
}

const tenantNames = splitTenantNames('John Smith & Jane Smith');
if (tenantNames[0] !== 'John Smith' || tenantNames[1] !== 'Jane Smith') {
  throw new Error('Tenant name splitting regression detected.');
}

const renumberedPhotos = renumberPhotosByArea([
  { id: '1', name: 'Entry: Overall (photo 4)', areaName: 'Entry', photoIndex: 4 },
  { id: '2', name: 'Entry: Overall (photo 9)', areaName: 'Entry', photoIndex: 9 },
  { id: '3', name: 'Kitchen: Overall (photo 2)', areaName: 'Kitchen', photoIndex: 2 },
]);
if (
  renumberedPhotos[0].photoIndex !== 1 ||
  renumberedPhotos[1].photoIndex !== 2 ||
  renumberedPhotos[2].photoIndex !== 1
) {
  throw new Error('Photo area renumbering regression detected.');
}

const longComment = [
  'Painted white with general age-related marks and minor scuffing.',
  'Observed condition remains serviceable; note surface variation, wear and minor deterioration.',
  'This deliberately long regression-test commentary verifies that row height is measured from wrapped text and continues onto another page without relying on browser DOM geometry.',
].join(' ').repeat(18);

const report: ReportData = {
  id: 'pdf-regression-test',
  status: 'draft',
  details: {
    reportType: 'Entry',
    formName: 'Property Condition Report',
    actNotice: 'RESIDENTIAL TENANCIES ACT 1987 (WA) Section 27C(6)',
    formNumber: 'FORM 1',
    governingBody: 'Consumer Protection, Western Australia',
    companyName: 'ProInspect',
    companyAddress: '19 Bonnard Crescent Ashby WA 6065',
    companyPhone: '(08) 9306 9668',
    companyEmail: 'info@proinspect.systems',
    companyWebsite: 'https://proinspect.systems',
    propertyAddress: '2 Reserve Drive, Mandurah WA 6210',
    inspectingAgent: 'PDF Regression Test',
    inspectionDate: '2026-09-27',
    tenancyStartDate: '',
    tenants: 'Tenant One & Tenant Two',
    tenantReceivedDate: '',
    reportReturnDate: '',
    additionalComments: 'Regression test only.',
    agentSignName: 'PDF Regression Test',
    agentSignDate: '2026-09-27',
    disclaimerText: 'Regression test disclaimer.',
  },
  areas: [
    {
      id: 'entry',
      name: 'Entry',
      items: Array.from({ length: 18 }, (_, index) => ({
        id: `entry-${index + 1}`,
        name: `Entry item ${index + 1}`,
        clean: index % 4 !== 0,
        undamaged: index % 5 !== 0,
        working: true,
        agentComments: index === 4 ? longComment : `Normal commentary for entry item ${index + 1}.`,
        tenantAgrees: null,
        tenantComments: '',
      })),
    },
    {
      id: 'kitchen',
      name: 'Kitchen',
      items: Array.from({ length: 26 }, (_, index) => ({
        id: `kitchen-${index + 1}`,
        name: `Kitchen item ${index + 1}`,
        clean: true,
        undamaged: index % 6 !== 0,
        working: index % 7 !== 0,
        agentComments: `Kitchen commentary line ${index + 1}. Additional descriptive text is included to exercise wrapping across the fixed agent-comment column.`,
        tenantAgrees: null,
        tenantComments: '',
      })),
    },
  ],
  photos: [],
};

const blob = await generateReportPdf(report);
if (blob.size < 10_000) {
  throw new Error(`Generated regression PDF is unexpectedly small: ${blob.size} bytes.`);
}

const binary = new TextDecoder('latin1').decode(await blob.arrayBuffer());
const pageCount = (binary.match(/\/Type\s*\/Page\b/g) || []).length;
if (pageCount < 5) {
  throw new Error(`Expected a multi-page regression PDF, received ${pageCount} pages.`);
}

const outputPath = process.env.PDF_VERIFY_OUTPUT;
if (outputPath) {
  await Bun.write(outputPath, blob);
  console.log(`Wrote PDF regression artifact to ${outputPath}.`);
}

console.log(`PDF regression generator check passed: ${pageCount} pages, ${blob.size} bytes.`);
