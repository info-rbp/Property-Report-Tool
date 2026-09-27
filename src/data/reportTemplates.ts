import { PROINSPECT_COMPANY } from '../config/company';
import { ReportData, ReportType } from '../types/report';

const COMPANY = {
  companyName: PROINSPECT_COMPANY.name,
  companyAddress: PROINSPECT_COMPANY.address,
  companyPhone: PROINSPECT_COMPANY.phone,
  companyEmail: PROINSPECT_COMPANY.email,
  companyWebsite: PROINSPECT_COMPANY.website,
};

function defaultDisclaimer(reportType: ReportType): string {
  if (reportType === 'Routine') {
    return 'This routine inspection report records visible conditions observed at the property at the time of inspection. It is a visual inspection only and is not a building, structural, electrical, plumbing, gas, pest, pool barrier, asbestos or statutory compliance inspection. Furniture, floor coverings and stored goods are not moved unless expressly noted. The report should be read together with the photographs and commentary, and specialist assessment should be obtained where required.';
  }
  if (reportType === 'Exit') {
    return 'This exit condition report records visible conditions observed at the property at the end-of-tenancy inspection. It is a visual inspection only and is not a building, structural, electrical, plumbing, gas, pest, pool barrier, asbestos or statutory compliance inspection. Furniture, floor coverings and stored goods are not moved unless expressly noted. The report should be read together with the photographs and commentary, and specialist assessment should be obtained where required.';
  }
  return 'This report records the condition observed at the time of inspection. It should be read together with the photographs and commentary contained in the report.';
}

export function createBlankReport(
  reportType: ReportType,
  property?: { id: string; address: string }
): ReportData {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);

  return {
    id: crypto.randomUUID(),
    propertyId: property?.id,
    status: 'draft',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    details: {
      reportType,
      formName:
        reportType === 'Entry'
          ? 'Property Condition Report'
          : reportType === 'Exit'
          ? 'Exit Condition Report'
          : 'Routine Inspection Report',
      actNotice: reportType === 'Entry' ? 'RESIDENTIAL TENANCIES ACT 1987 (WA) Section 27C(6)' : '',
      formNumber: reportType === 'Entry' ? 'FORM 1' : undefined,
      governingBody: reportType === 'Entry' ? 'Consumer Protection, Western Australia' : undefined,
      ...COMPANY,
      propertyAddress: property?.address || '',
      inspectingAgent: '',
      inspectionDate: date,
      tenancyStartDate: '',
      leaseExpiryDate: '',
      rentReviewDate: '',
      currentRentalAmount: '',
      tenants: '',
      tenantReceivedDate: '',
      reportReturnDate: '',
      additionalComments: '',
      maintenanceComments: '',
      agentSignName: '',
      agentSignDate: date,
      disclaimerText: defaultDisclaimer(reportType),
    },
    areas: [],
    photos: [],
  };
}

export function normalizeReport(report: ReportData): ReportData {
  const now = new Date().toISOString();
  return {
    ...report,
    id: report.id || crypto.randomUUID(),
    status: report.status || 'draft',
    createdAt: report.createdAt || now,
    updatedAt: report.updatedAt || now,
    photos: report.photos || [],
    areas: report.areas || [],
  };
}
