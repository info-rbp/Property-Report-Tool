export const REPORT_TYPES = [
  'Entry',
  'Routine',
  'Exit',
  'Property Onboarding',
  'Vacant Property',
  'Maintenance Assessment',
  'Maintenance Completion',
  'Cleaning Rectification',
  'Commercial Ingoing',
  'Commercial Periodic',
  'Commercial Exit',
  'Common Property',
  'Building Management',
  'Incident',
  'Contractor Works',
  'Property Handover',
  'Preventative Maintenance',
  'Cleaning Quality',
  'Annual Property Summary',
  'Key Safe Installation',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];
export type ReportStatus = 'draft' | 'completed';

export interface InspectionItem {
  id: string;
  name: string;
  clean?: boolean | null;
  undamaged?: boolean | null;
  working?: boolean | null;
  agentComments: string;
  tenantAgrees?: boolean | null;
  tenantComments?: string;
  isCustom?: boolean;
}

export interface InspectionArea {
  id: string;
  name: string;
  overallPhotoCount?: number;
  items: InspectionItem[];
}

export interface ReportPhoto {
  id: string;
  name: string;
  url?: string;
  storageKey?: string;
  dataUrl?: string;
  areaName?: string;
  photoIndex?: number;
  isCover?: boolean;
}

export interface TenancyDetails {
  reportType: ReportType;
  formName: string;
  actNotice: string;
  formNumber?: string;
  governingBody?: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail?: string;
  companyWebsite?: string;
  companyLogoUrl?: string;
  propertyAddress: string;
  inspectingAgent: string;
  inspectionDate: string;
  tenancyStartDate: string;
  leaseExpiryDate?: string;
  rentReviewDate?: string;
  currentRentalAmount?: string;
  tenants: string;
  tenantReceivedDate?: string;
  reportReturnDate: string;
  coverPhotoUrl?: string;
  paintingPremisesExternalDate?: string;
  paintingPremisesInternalDate?: string;
  floorcoveringsLaidDate?: string;
  floorcoveringsCleanedDate?: string;
  additionalComments: string;
  maintenanceComments?: string;
  templateFields?: Record<string, string>;
  agentSignName: string;
  agentSignDate: string;
  tenant1SignName?: string;
  tenant2SignName?: string;
  tenant3SignName?: string;
  disclaimerText: string;
}

export interface ReportData {
  id?: string;
  propertyId?: string;
  status?: ReportStatus;
  completedPdfKey?: string;
  createdAt?: string;
  updatedAt?: string;
  details: TenancyDetails;
  areas: InspectionArea[];
  photos: ReportPhoto[];
}

export interface PropertyRecord {
  id: string;
  address: string;
  reference?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface ReportSummary {
  id: string;
  propertyId: string;
  reportType: ReportType;
  status: ReportStatus;
  inspectionDate?: string;
  completedPdfKey?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}
