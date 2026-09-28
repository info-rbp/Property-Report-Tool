export const CURRENT_REPORT_SCHEMA_VERSION = 2;

export const REPORT_TYPES = [
  'Entry',
  'Routine',
  'Exit',
  'PropertyOnboarding',
  'VacantProperty',
  'MaintenanceAssessment',
  'MaintenanceCompletion',
  'CleaningRectification',
  'CommercialIngoing',
  'CommercialPeriodic',
  'CommercialExit',
  'CommonProperty',
  'BuildingManagement',
  'BuildingManagementDaily',
  'BuildingManagementMonthly',
  'Incident',
  'ContractorWorks',
  'PropertyHandover',
  'PreventativeMaintenance',
  'CleaningQuality',
  'AnnualPropertySummary',
  'KeySafeInstallation',
] as const;

export type ReportType = typeof REPORT_TYPES[number];

export type ReportCategory = 'Residential' | 'Commercial' | 'Maintenance' | 'Building / Strata';
export type ReportTemplateFamily =
  | 'entry'
  | 'routine'
  | 'exit'
  | 'condition'
  | 'inspection'
  | 'maintenance'
  | 'operations'
  | 'event';
export type ReportStatus = 'draft' | 'completed';

export interface InspectionItem {
  id: string;
  name: string;
  clean?: boolean | null;
  undamaged?: boolean | null;
  working?: boolean | null;
  agentComments: string;
  activityDate?: string;
  activityTime?: string;
  activityParty?: string;
  actionComments?: string;
  status?: string;
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
  itemId?: string;
  itemName?: string;
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

  // Shared fields used by operational, maintenance, commercial and strata templates.
  clientName?: string;
  siteContact?: string;
  referenceNumber?: string;
  inspectionPurpose?: string;
  issueSummary?: string;
  observedCondition?: string;
  urgency?: string;
  recommendedAction?: string;
  actionRequired?: string;
  contractorName?: string;
  workOrderReference?: string;
  workDescription?: string;
  completionDate?: string;
  verificationOutcome?: string;
  incidentDate?: string;
  incidentTime?: string;
  incidentCategory?: string;
  incidentDescription?: string;
  immediateActions?: string;
  accessDetails?: string;
  meterReadings?: string;
  keysAccessDevices?: string;
  outstandingItems?: string;
  buildingSummary?: string;
  buildingName?: string;
  strataPlan?: string;
  reportingPeriod?: string;
  contractorAttendance?: string;
  residentMatters?: string;
  worksCompleted?: string;
  mattersForApproval?: string;
  keySafeLocation?: string;
  keySafeModel?: string;
  installationMethod?: string;
  installationOutcome?: string;
  codeHandlingNote?: string;
  nextReviewDate?: string;
  annualSummaryPeriod?: string;

  agentSignName: string;
  agentSignDate: string;
  tenant1SignName?: string;
  tenant2SignName?: string;
  tenant3SignName?: string;
  disclaimerText: string;
}

export interface ReportData {
  schemaVersion?: number;
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
