import { PROINSPECT_COMPANY } from '../config/company';
import { getReportTemplate, starterAreasFor } from './reportCatalogue';
import { ReportData, ReportType } from '../types/report';

const COMPANY = {
  companyName: PROINSPECT_COMPANY.name,
  companyAddress: PROINSPECT_COMPANY.address,
  companyPhone: PROINSPECT_COMPANY.phone,
  companyEmail: PROINSPECT_COMPANY.email,
  companyWebsite: PROINSPECT_COMPANY.website,
};

export function createBlankReport(
  reportType: ReportType,
  property?: { id: string; address: string }
): ReportData {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);

  const definition = getReportTemplate(reportType);

  return {
    id: crypto.randomUUID(),
    propertyId: property?.id,
    status: 'draft',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    details: {
      reportType,
      formName: definition.formName,
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
      templateFields: Object.fromEntries((definition.fields || []).map((field) => [field.key, ''])),
      agentSignName: '',
      agentSignDate: date,
      disclaimerText: definition.defaultDisclaimer,
    },
    areas: starterAreasFor(reportType),
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
    details: {
      ...report.details,
      templateFields: report.details.templateFields || {},
    },
  };
}
