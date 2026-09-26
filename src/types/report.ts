export type ReportType = 'Entry' | 'Routine' | 'Exit';

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

export interface DrivePhoto {
  id: string;
  name: string;
  thumbnailLink?: string;
  webContentLink?: string;
  dataUrl?: string;
  areaName?: string;
  photoIndex?: number;
}

export interface TenancyDetails {
  reportType: ReportType;
  formName: string; // e.g., "Entry condition report – general tenancies (Form 1a)"
  actNotice: string; // "Residential Tenancies and Rooming Accommodation Act 2008 (Section 65)"
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
  tenants: string;
  reportReturnDate: string;
  coverPhotoUrl?: string;
  waterIndividuallyMetered: boolean;
  waterMeterReading: string;
  waterEfficient: boolean;
  supportingDocumentationAttached: boolean;
  additionalComments: string;
  agentSignName: string;
  agentSignDate: string;
  disclaimerText: string;
  keysSuppliedSummary: string;
}

export interface ReportData {
  details: TenancyDetails;
  areas: InspectionArea[];
  photos: DrivePhoto[];
}
