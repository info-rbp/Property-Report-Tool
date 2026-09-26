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
  formName: string; // e.g., "Property Condition Report"
  actNotice: string; // e.g., "RESIDENTIAL TENANCIES ACT 1987 (WA) Section 27C(6)"
  formNumber?: string; // "FORM 1"
  governingBody?: string; // "Department of Energy, Mines, Industry Regulation and Safety - Consumer Protection"
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

  // WA Form 1 specific section: Approximate dates when work last done
  paintingPremisesExternalDate?: string;
  paintingPremisesInternalDate?: string;
  floorcoveringsLaidDate?: string;
  floorcoveringsCleanedDate?: string;

  // Additional comments
  additionalComments: string;
  agentSignName: string;
  agentSignDate: string;
  tenant1SignName?: string;
  tenant2SignName?: string;
  tenant3SignName?: string;
  disclaimerText: string;
}

export interface ReportData {
  details: TenancyDetails;
  areas: InspectionArea[];
  photos: DrivePhoto[];
}
