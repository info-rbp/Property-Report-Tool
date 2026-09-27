import { ReportData, ReportType } from '../types/report';

const COMPANY = {
  companyName: 'ProInspect',
  companyAddress: '',
  companyPhone: '',
  companyEmail: '',
};

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
      formName: reportType === 'Entry' ? 'Property Condition Report' : `${reportType} Inspection Report`,
      actNotice: reportType === 'Entry' ? 'RESIDENTIAL TENANCIES ACT 1987 (WA) Section 27C(6)' : '',
      formNumber: reportType === 'Entry' ? 'FORM 1' : undefined,
      governingBody: reportType === 'Entry' ? 'Consumer Protection, Western Australia' : undefined,
      ...COMPANY,
      propertyAddress: property?.address || '',
      inspectingAgent: '',
      inspectionDate: date,
      tenancyStartDate: '',
      tenants: '',
      tenantReceivedDate: '',
      reportReturnDate: '',
      additionalComments: '',
      agentSignName: '',
      agentSignDate: date,
      disclaimerText:
        'This report records the condition observed at the time of inspection. It should be read together with the photographs and commentary contained in the report.',
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
