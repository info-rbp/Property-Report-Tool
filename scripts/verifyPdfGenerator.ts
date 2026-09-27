import { generateReportPdf } from '../src/lib/reportPdf';
import { ReportData } from '../src/types/report';

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
    tenants: 'Tenant One, Tenant Two',
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

console.log(`PDF regression generator check passed: ${pageCount} pages, ${blob.size} bytes.`);
