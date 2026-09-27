export type ReportType = 'Entry' | 'Routine' | 'Exit';
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

export interface DrivePhoto {
  id: string;
  name: string;
  thumbnailLink?: string;
  webContentLink?: string;
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
  tenants: string;
  tenantReceivedDate?: string;
  reportReturnDate: string;
  coverPhotoUrl?: string;
  paintingPremisesExternalDate?: string;
  paintingPremisesInternalDate?: string;
  floorcoveringsLaidDate?: string;
  floorcoveringsCleanedDate?: string;
  additionalComments: string;
  agentSignName: string;
  agentSignDate: string;
  tenant1SignName?: string;
  tenant2SignName?: string;
  tenant3SignName?: string;
  disclaimerText: string;
}

export interface ReportData {
  id?: string;
  status?: ReportStatus;
  createdAt?: string;
  updatedAt?: string;
  details: TenancyDetails;
  areas: InspectionArea[];
  photos: DrivePhoto[];
}
