import { REPORT_TEMPLATES } from '../src/data/reportCatalogue';
import { createBlankReport } from '../src/data/reportTemplates';
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

function pdfPageCount(blob: Blob): Promise<number> {
  return blob.arrayBuffer().then((buffer) => {
    const binary = new TextDecoder('latin1').decode(buffer);
    return (binary.match(/\/Type\s*\/Page\b/g) || []).length;
  });
}

async function verifyPdf(name: string, data: ReportData, minimumPages: number, minimumBytes = 8_000) {
  const blob = await generateReportPdf(data);
  if (blob.size < minimumBytes) {
    throw new Error(`${name} regression PDF is unexpectedly small: ${blob.size} bytes.`);
  }

  const pageCount = await pdfPageCount(blob);
  if (pageCount < minimumPages) {
    throw new Error(`${name} expected at least ${minimumPages} pages, received ${pageCount}.`);
  }

  const outputDir = process.env.PDF_VERIFY_OUTPUT_DIR;
  if (outputDir) {
    const outputPath = `${outputDir}/${name.toLowerCase()}-regression.pdf`;
    await Bun.write(outputPath, blob);
    console.log(`Wrote ${name} PDF regression artifact to ${outputPath}.`);
  } else if (name === 'Entry' && process.env.PDF_VERIFY_OUTPUT) {
    await Bun.write(process.env.PDF_VERIFY_OUTPUT, blob);
  }

  console.log(`${name} PDF regression check passed: ${pageCount} pages, ${blob.size} bytes.`);
}

const routineReport: ReportData = {
  id: 'routine-pdf-regression-test',
  status: 'draft',
  details: {
    reportType: 'Routine',
    formName: 'Routine Inspection Report',
    actNotice: '',
    companyName: 'ProInspect',
    companyAddress: '19 Bonnard Crescent Ashby WA 6065',
    companyPhone: '(08) 9306 9668',
    companyEmail: 'info@proinspect.systems',
    companyWebsite: 'https://proinspect.systems',
    propertyAddress: '87 Medina Ave, Medina WA 6167',
    inspectingAgent: 'Routine Regression Test',
    inspectionDate: '2026-09-27',
    tenancyStartDate: '2026-05-03',
    leaseExpiryDate: '2027-05-02',
    rentReviewDate: '2027-02-02',
    currentRentalAmount: '$560 per week',
    tenants: 'Routine Tenant',
    tenantReceivedDate: '',
    reportReturnDate: '',
    additionalComments:
      'The property is presented in generally good condition. Minor observations are recorded in the findings and maintenance section.',
    maintenanceComments:
      'Exterior front - vegetation should be cut back from the gutters. Kitchen - rangehood operation requires follow-up.',
    agentSignName: 'Routine Regression Test',
    agentSignDate: '2026-09-27',
    disclaimerText:
      'This routine inspection report records visible conditions observed at the time of inspection and should be read with the photographs and commentary.',
  },
  areas: [
    {
      id: 'routine-exterior',
      name: 'EXTERIOR FRONT',
      items: [
        {
          id: 'routine-exterior-overall',
          name: 'Overall',
          agentComments:
            'The front yard appears tidy. Paved areas are clean. Vegetation near the gutters should be monitored and trimmed as required.',
        },
      ],
    },
    {
      id: 'routine-kitchen',
      name: 'KITCHEN',
      items: [
        {
          id: 'routine-kitchen-overall',
          name: 'Overall',
          agentComments:
            'Flooring, walls and ceiling appear intact. Oven and stove top appear clean. Rangehood operation requires follow-up.',
        },
      ],
    },
  ],
  photos: [],
};

const exitReport: ReportData = {
  id: 'exit-pdf-regression-test',
  status: 'draft',
  details: {
    reportType: 'Exit',
    formName: 'Exit Condition Report',
    actNotice: '',
    companyName: 'ProInspect',
    companyAddress: '19 Bonnard Crescent Ashby WA 6065',
    companyPhone: '(08) 9306 9668',
    companyEmail: 'info@proinspect.systems',
    companyWebsite: 'https://proinspect.systems',
    propertyAddress: '26 Merlin Way, Wattle Grove WA 6107',
    inspectingAgent: 'Exit Regression Test',
    inspectionDate: '2026-09-27',
    tenancyStartDate: '2025-09-01',
    tenants: 'Exit Tenant',
    tenantReceivedDate: '',
    reportReturnDate: '',
    paintingPremisesExternalDate: '2025-01-15',
    paintingPremisesInternalDate: '2025-02-10',
    floorcoveringsLaidDate: '2024-08-12',
    floorcoveringsCleanedDate: '2026-09-26',
    additionalComments:
      'Exit inspection completed. Items requiring cleaning, repair or further assessment are recorded in the condition table and photographs.',
    agentSignName: 'Exit Regression Test',
    agentSignDate: '2026-09-27',
    disclaimerText:
      'This exit condition report records visible conditions observed at the end-of-tenancy inspection and should be read with the photographs and commentary.',
  },
  areas: [
    {
      id: 'exit-exterior',
      name: 'EXTERIOR FRONT',
      items: Array.from({ length: 12 }, (_, index) => ({
        id: `exit-exterior-${index + 1}`,
        name: index === 0 ? 'External Walls' : `Exterior item ${index + 1}`,
        clean: index % 4 !== 0,
        undamaged: index % 5 !== 0,
        working: true,
        agentComments:
          index === 5
            ? longComment
            : `Exit condition observation ${index + 1}. Visible condition recorded at the time of inspection.`,
      })),
    },
    {
      id: 'exit-kitchen',
      name: 'KITCHEN',
      items: Array.from({ length: 16 }, (_, index) => ({
        id: `exit-kitchen-${index + 1}`,
        name: `Kitchen item ${index + 1}`,
        clean: index % 3 !== 0,
        undamaged: index % 6 !== 0,
        working: index % 7 !== 0,
        agentComments:
          `Kitchen exit commentary ${index + 1}. Cleaning and condition observations remain contained within the deterministic table geometry.`,
      })),
    },
  ],
  photos: [],
};

await verifyPdf('Entry', report, 5, 10_000);
await verifyPdf('Routine', routineReport, 3, 4_000);
await verifyPdf('Exit', exitReport, 4);

for (const template of REPORT_TEMPLATES.filter((item) => !['Entry', 'Routine', 'Exit'].includes(item.type))) {
  const extended = createBlankReport(template.type, {
    id: `property-${template.type}`,
    address: '19 Bonnard Crescent Ashby WA 6065',
  });
  extended.details.inspectingAgent = 'Catalogue Regression Test';
  extended.details.clientName = 'ProInspect Test Client';
  extended.details.referenceNumber = `TEST-${template.type}`;
  extended.details.additionalComments = 'Catalogue regression test summary.';
  extended.details.agentSignName = 'Catalogue Regression Test';
  extended.areas = extended.areas.slice(0, 4).map((area, areaIndex) => ({
    ...area,
    items: [
      {
        ...area.items[0],
        clean: template.family === 'condition' ? areaIndex % 3 !== 0 : undefined,
        undamaged: template.family === 'condition' ? true : undefined,
        working: template.family === 'condition' ? true : undefined,
        agentComments:
          `Representative ${template.shortLabel} observation for ${area.name}. The deterministic renderer must preserve wrapping, page geometry and ProInspect branding.`,
      },
      {
        id: `extra-${template.type}-${areaIndex}`,
        name: 'Follow-up observation',
        clean: template.family === 'condition' ? true : undefined,
        undamaged: template.family === 'condition' ? areaIndex % 2 === 0 : undefined,
        working: template.family === 'condition' ? true : undefined,
        agentComments: 'Additional report finding included to exercise the reusable template family.',
      },
    ],
  }));

  await verifyPdf(template.type, extended, template.family === 'condition' ? 4 : 3, 3_500);
}

console.log(`All ${REPORT_TEMPLATES.length} report-template PDF regression checks passed.`);
