import { InspectionArea, ReportType } from '../types/report';

export type ReportCategory =
  | 'Residential'
  | 'Commercial'
  | 'Maintenance'
  | 'Building / Strata'
  | 'Property Operations';

export type ReportFamily =
  | 'entry'
  | 'routine'
  | 'exit'
  | 'condition'
  | 'findings'
  | 'assessment'
  | 'verification'
  | 'operations'
  | 'incident'
  | 'handover'
  | 'summary'
  | 'installation';

export interface ReportTemplateField {
  key: string;
  label: string;
  section: 'details' | 'outcome';
  kind?: 'text' | 'date' | 'textarea' | 'select';
  placeholder?: string;
  options?: string[];
}

export interface ReportTemplateDefinition {
  type: ReportType;
  label: string;
  shortLabel: string;
  category: ReportCategory;
  family: ReportFamily;
  description: string;
  formName: string;
  summaryTitle: string;
  findingsTitle: string;
  additionalCommentsLabel: string;
  maintenanceCommentsLabel?: string;
  signoffTitle: string;
  conditionMatrix?: boolean;
  starterAreas?: string[];
  fields?: ReportTemplateField[];
  defaultDisclaimer: string;
}

const VISUAL_INSPECTION_DISCLAIMER =
  'This report records visible conditions observed at the property at the time of inspection. It is a visual inspection only and is not a building, structural, electrical, plumbing, gas, pest, pool barrier, asbestos or statutory compliance inspection. Furniture, floor coverings and stored goods are not moved unless expressly noted. The report should be read together with the photographs and commentary, and specialist assessment should be obtained where required.';

const CONDITION_DISCLAIMER =
  'This condition report records visible condition at the time of inspection. It should be read together with the photographs and commentary. It is not a building, structural, electrical, plumbing, gas, pest, asbestos or statutory compliance inspection unless expressly stated.';

const WORKS_DISCLAIMER =
  'This report records visible observations of the identified issue or works at the time of inspection. It does not certify building, structural, electrical, plumbing, gas, engineering or other specialist compliance. Where specialist certification is required, it should be obtained from an appropriately qualified contractor or consultant.';

const INCIDENT_DISCLAIMER =
  'This report records information and visible observations available at the time the incident was documented. It is not a determination of liability, causation or legal responsibility and should be read with any supporting photographs, correspondence, contractor reports and specialist advice.';

const KEY_SAFE_DISCLAIMER =
  'This report verifies the visible installation and basic operation of the key safe at the time of inspection. For security, access codes must not be recorded in this report. Any code or credential should be stored only in the approved secure access-management system.';

export const REPORT_TEMPLATE_DEFINITIONS: ReportTemplateDefinition[] = [
  {
    type: 'Entry',
    label: 'Entry Condition Report',
    shortLabel: 'Entry',
    category: 'Residential',
    family: 'entry',
    description: 'WA residential tenancy entry Property Condition Report.',
    formName: 'Property Condition Report',
    summaryTitle: 'Tenancy Details',
    findingsTitle: 'Property Condition',
    additionalCommentsLabel: 'Entry Report Additional Comments',
    signoffTitle: "Lessor/property manager's signature",
    conditionMatrix: true,
    defaultDisclaimer: CONDITION_DISCLAIMER,
  },
  {
    type: 'Routine',
    label: 'Routine Inspection Report',
    shortLabel: 'Routine',
    category: 'Residential',
    family: 'routine',
    description: 'Periodic residential inspection findings, actions and maintenance observations.',
    formName: 'Routine Inspection Report',
    summaryTitle: 'Inspection Summary',
    findingsTitle: 'Inspection Findings',
    additionalCommentsLabel: 'Agent Comments',
    maintenanceCommentsLabel: 'Maintenance Comments',
    signoffTitle: 'Prepared by / Report sign-off',
    defaultDisclaimer: VISUAL_INSPECTION_DISCLAIMER,
  },
  {
    type: 'Exit',
    label: 'Exit Condition Report',
    shortLabel: 'Exit',
    category: 'Residential',
    family: 'exit',
    description: 'Residential end-of-tenancy condition report with condition matrix and photo evidence.',
    formName: 'Exit Condition Report',
    summaryTitle: 'Exit Inspection Details',
    findingsTitle: 'Exit Condition',
    additionalCommentsLabel: 'Exit Report Additional Comments',
    signoffTitle: 'Agent Signature at the END of the Tenancy',
    conditionMatrix: true,
    defaultDisclaimer: CONDITION_DISCLAIMER,
  },
  {
    type: 'Property Onboarding',
    label: 'Property Onboarding Condition Report',
    shortLabel: 'Property Onboarding',
    category: 'Residential',
    family: 'condition',
    description: 'Baseline property condition record when ProInspect first takes over a property.',
    formName: 'Property Onboarding Condition Report',
    summaryTitle: 'Property Onboarding Details',
    findingsTitle: 'Baseline Property Condition',
    additionalCommentsLabel: 'Onboarding Summary & Outstanding Matters',
    signoffTitle: 'Prepared by / Report sign-off',
    conditionMatrix: true,
    starterAreas: ['Entry / Front', 'Exterior', 'Living Areas', 'Kitchen', 'Bedrooms', 'Bathrooms', 'Laundry', 'Garage / Carport', 'Gardens / Grounds'],
    fields: [
      { key: 'onboardingReference', label: 'Onboarding Reference', section: 'details' },
      { key: 'occupancyStatus', label: 'Occupancy Status', section: 'details', kind: 'select', options: ['Vacant', 'Tenanted', 'Owner Occupied', 'Other'] },
      { key: 'existingDocumentation', label: 'Existing Documentation Reviewed', section: 'details', kind: 'textarea' },
      { key: 'priorityActions', label: 'Priority Actions', section: 'outcome', kind: 'textarea' },
    ],
    defaultDisclaimer: CONDITION_DISCLAIMER,
  },
  {
    type: 'Vacant Property',
    label: 'Vacant Property Inspection Report',
    shortLabel: 'Vacant Property',
    category: 'Residential',
    family: 'findings',
    description: 'Periodic inspection of an unoccupied property covering security, leaks, grounds and general condition.',
    formName: 'Vacant Property Inspection Report',
    summaryTitle: 'Vacant Property Inspection Details',
    findingsTitle: 'Vacant Property Findings',
    additionalCommentsLabel: 'Inspection Summary & Actions',
    maintenanceCommentsLabel: 'Maintenance / Security Actions',
    signoffTitle: 'Prepared by / Report sign-off',
    starterAreas: ['External / Security', 'Entry / Doors / Windows', 'Internal Areas', 'Wet Areas / Leaks', 'Utilities', 'Gardens / Grounds', 'Mail / Bins'],
    fields: [
      { key: 'vacancyStartDate', label: 'Vacancy Start Date', section: 'details', kind: 'date' },
      { key: 'accessMethod', label: 'Access Method', section: 'details' },
      { key: 'utilitiesStatus', label: 'Utilities Status', section: 'details' },
      { key: 'securityStatus', label: 'Security / Alarm Status', section: 'details' },
      { key: 'urgentActions', label: 'Urgent Actions', section: 'outcome', kind: 'textarea' },
    ],
    defaultDisclaimer: VISUAL_INSPECTION_DISCLAIMER,
  },
  {
    type: 'Maintenance Assessment',
    label: 'Maintenance Assessment Report',
    shortLabel: 'Maintenance Assessment',
    category: 'Maintenance',
    family: 'assessment',
    description: 'Document a reported issue, observed condition, urgency, trade requirement and proposed scope.',
    formName: 'Maintenance Assessment Report',
    summaryTitle: 'Maintenance Request Details',
    findingsTitle: 'Assessment Findings',
    additionalCommentsLabel: 'Assessment Summary',
    maintenanceCommentsLabel: 'Recommended Scope / Actions',
    signoffTitle: 'Assessed by / Report sign-off',
    starterAreas: ['Affected Area'],
    fields: [
      { key: 'reportedIssue', label: 'Reported Issue', section: 'details', kind: 'textarea' },
      { key: 'reportedBy', label: 'Reported By', section: 'details' },
      { key: 'issueLocation', label: 'Issue Location', section: 'details' },
      { key: 'urgency', label: 'Urgency', section: 'details', kind: 'select', options: ['Routine', 'Priority', 'Urgent', 'Emergency'] },
      { key: 'likelyTrade', label: 'Likely Trade / Contractor', section: 'outcome' },
      { key: 'recommendedAction', label: 'Recommended Action', section: 'outcome', kind: 'textarea' },
      { key: 'proposedScope', label: 'Proposed Scope of Works', section: 'outcome', kind: 'textarea' },
    ],
    defaultDisclaimer: WORKS_DISCLAIMER,
  },
  {
    type: 'Maintenance Completion',
    label: 'Maintenance Completion / Verification Report',
    shortLabel: 'Maintenance Completion',
    category: 'Maintenance',
    family: 'verification',
    description: 'Verify authorised maintenance has been completed and record the finished work.',
    formName: 'Maintenance Completion / Verification Report',
    summaryTitle: 'Maintenance Completion Details',
    findingsTitle: 'Completion Verification',
    additionalCommentsLabel: 'Completion Summary',
    signoffTitle: 'Verified by / Report sign-off',
    starterAreas: ['Completed Works'],
    fields: [
      { key: 'workOrderReference', label: 'Work Order / Job Reference', section: 'details' },
      { key: 'contractorName', label: 'Contractor', section: 'details' },
      { key: 'completionDate', label: 'Completion Date', section: 'details', kind: 'date' },
      { key: 'authorisedScope', label: 'Authorised Scope', section: 'details', kind: 'textarea' },
      { key: 'worksCompleted', label: 'Works Completed', section: 'outcome', kind: 'textarea' },
      { key: 'verificationOutcome', label: 'Verification Outcome', section: 'outcome', kind: 'select', options: ['Verified Complete', 'Partially Complete', 'Not Complete', 'Further Assessment Required'] },
      { key: 'outstandingItems', label: 'Outstanding Items', section: 'outcome', kind: 'textarea' },
    ],
    defaultDisclaimer: WORKS_DISCLAIMER,
  },
  {
    type: 'Cleaning Rectification',
    label: 'Cleaning / Rectification Reinspection Report',
    shortLabel: 'Cleaning / Rectification',
    category: 'Maintenance',
    family: 'verification',
    description: 'Follow-up inspection after cleaning or rectification items have been requested.',
    formName: 'Cleaning / Rectification Reinspection Report',
    summaryTitle: 'Reinspection Details',
    findingsTitle: 'Rectification Verification',
    additionalCommentsLabel: 'Reinspection Summary',
    signoffTitle: 'Verified by / Report sign-off',
    starterAreas: ['Rectification Items'],
    fields: [
      { key: 'originalReportReference', label: 'Original Report / Inspection Reference', section: 'details' },
      { key: 'rectificationParty', label: 'Rectification Party', section: 'details' },
      { key: 'reinspectionDate', label: 'Reinspection Date', section: 'details', kind: 'date' },
      { key: 'verificationOutcome', label: 'Overall Outcome', section: 'outcome', kind: 'select', options: ['Satisfactory', 'Partially Satisfactory', 'Unsatisfactory', 'Further Reinspection Required'] },
      { key: 'outstandingItems', label: 'Outstanding Items', section: 'outcome', kind: 'textarea' },
    ],
    defaultDisclaimer: WORKS_DISCLAIMER,
  },
  {
    type: 'Commercial Ingoing',
    label: 'Commercial Ingoing Condition Report',
    shortLabel: 'Commercial Ingoing',
    category: 'Commercial',
    family: 'condition',
    description: 'Baseline commercial premises condition at lease commencement.',
    formName: 'Commercial Ingoing Condition Report',
    summaryTitle: 'Commercial Lease / Premises Details',
    findingsTitle: 'Ingoing Premises Condition',
    additionalCommentsLabel: 'Ingoing Condition Summary',
    signoffTitle: 'Prepared by / Report sign-off',
    conditionMatrix: true,
    starterAreas: ['Shopfront / Entry', 'Trading / Office Area', 'Amenities', 'Storeroom', 'Services / Fixtures', 'Exterior / Signage', 'Car Park / Loading'],
    fields: [
      { key: 'tenantBusinessName', label: 'Tenant / Business Name', section: 'details' },
      { key: 'leaseCommencementDate', label: 'Lease Commencement Date', section: 'details', kind: 'date' },
      { key: 'permittedUse', label: 'Permitted Use', section: 'details' },
      { key: 'handoverDate', label: 'Handover Date', section: 'details', kind: 'date' },
      { key: 'existingDefects', label: 'Existing Defects / Agreed Exclusions', section: 'outcome', kind: 'textarea' },
    ],
    defaultDisclaimer: CONDITION_DISCLAIMER,
  },
  {
    type: 'Commercial Periodic',
    label: 'Commercial Periodic Inspection Report',
    shortLabel: 'Commercial Periodic',
    category: 'Commercial',
    family: 'findings',
    description: 'Periodic commercial premises inspection covering presentation, condition and landlord/tenant matters.',
    formName: 'Commercial Periodic Inspection Report',
    summaryTitle: 'Commercial Inspection Details',
    findingsTitle: 'Inspection Findings',
    additionalCommentsLabel: 'Inspection Summary',
    maintenanceCommentsLabel: 'Landlord / Maintenance Actions',
    signoffTitle: 'Prepared by / Report sign-off',
    starterAreas: ['Shopfront / Entry', 'Trading / Office Area', 'Amenities', 'Storeroom', 'Services / Fixtures', 'Exterior / Signage', 'Car Park / Loading'],
    fields: [
      { key: 'tenantBusinessName', label: 'Tenant / Business Name', section: 'details' },
      { key: 'leaseExpiryDate', label: 'Lease Expiry Date', section: 'details', kind: 'date' },
      { key: 'permittedUse', label: 'Permitted Use', section: 'details' },
      { key: 'complianceObservations', label: 'Compliance / Lease Observations', section: 'outcome', kind: 'textarea' },
    ],
    defaultDisclaimer: VISUAL_INSPECTION_DISCLAIMER,
  },
  {
    type: 'Commercial Exit',
    label: 'Commercial Exit / Make-Good Report',
    shortLabel: 'Commercial Exit',
    category: 'Commercial',
    family: 'condition',
    description: 'Commercial lease-end condition and make-good evidence.',
    formName: 'Commercial Exit / Make-Good Report',
    summaryTitle: 'Commercial Exit Details',
    findingsTitle: 'Exit / Make-Good Condition',
    additionalCommentsLabel: 'Make-Good Summary & Outstanding Items',
    signoffTitle: 'Prepared by / Report sign-off',
    conditionMatrix: true,
    starterAreas: ['Shopfront / Entry', 'Trading / Office Area', 'Amenities', 'Storeroom', 'Services / Fixtures', 'Exterior / Signage', 'Car Park / Loading'],
    fields: [
      { key: 'tenantBusinessName', label: 'Tenant / Business Name', section: 'details' },
      { key: 'leaseEndDate', label: 'Lease End Date', section: 'details', kind: 'date' },
      { key: 'makeGoodReference', label: 'Make-Good Obligation / Clause Reference', section: 'details' },
      { key: 'keysReturned', label: 'Keys / Access Devices Returned', section: 'outcome' },
      { key: 'outstandingMakeGood', label: 'Outstanding Make-Good Items', section: 'outcome', kind: 'textarea' },
    ],
    defaultDisclaimer: CONDITION_DISCLAIMER,
  },
  {
    type: 'Common Property',
    label: 'Common Property Inspection Report',
    shortLabel: 'Common Property',
    category: 'Building / Strata',
    family: 'findings',
    description: 'Inspect common areas for defects, cleaning, safety observations and maintenance requirements.',
    formName: 'Common Property Inspection Report',
    summaryTitle: 'Common Property Inspection Details',
    findingsTitle: 'Common Property Findings',
    additionalCommentsLabel: 'Inspection Summary',
    maintenanceCommentsLabel: 'Maintenance / Action Items',
    signoffTitle: 'Prepared by / Report sign-off',
    starterAreas: ['Building Exterior', 'Entry / Foyer', 'Corridors', 'Stairs', 'Lifts', 'Car Park', 'Bin Area', 'Gardens', 'Lighting', 'Security', 'Fire / Safety Observations', 'Plant / Services'],
    fields: [
      { key: 'buildingName', label: 'Building / Scheme Name', section: 'details' },
      { key: 'strataPlan', label: 'Strata Plan / Scheme Reference', section: 'details' },
      { key: 'inspectionScope', label: 'Inspection Scope', section: 'details', kind: 'textarea' },
      { key: 'priorityActions', label: 'Priority Actions', section: 'outcome', kind: 'textarea' },
    ],
    defaultDisclaimer: VISUAL_INSPECTION_DISCLAIMER,
  },
  {
    type: 'Building Management',
    label: 'Building Management Site Report',
    shortLabel: 'Building Management',
    category: 'Building / Strata',
    family: 'operations',
    description: 'Weekly or monthly operational site report for caretaking and building-management services.',
    formName: 'Building Management Site Report',
    summaryTitle: 'Site Reporting Period',
    findingsTitle: 'Operational Site Findings',
    additionalCommentsLabel: 'Building Management Summary',
    maintenanceCommentsLabel: 'Outstanding Actions / Works',
    signoffTitle: 'Prepared by / Report sign-off',
    starterAreas: ['Site Operations', 'Cleaning', 'Maintenance', 'Contractors', 'Safety / Security', 'Resident / Occupant Matters', 'Other'],
    fields: [
      { key: 'buildingName', label: 'Building Name', section: 'details' },
      { key: 'reportingPeriod', label: 'Reporting Period', section: 'details' },
      { key: 'siteAttendance', label: 'Site Attendance / Hours', section: 'details' },
      { key: 'contractorAttendances', label: 'Contractor Attendances', section: 'outcome', kind: 'textarea' },
      { key: 'residentMatters', label: 'Resident / Occupant Matters', section: 'outcome', kind: 'textarea' },
      { key: 'approvalsRequired', label: 'Matters Requiring Approval', section: 'outcome', kind: 'textarea' },
    ],
    defaultDisclaimer: VISUAL_INSPECTION_DISCLAIMER,
  },
  {
    type: 'Incident',
    label: 'Incident Report',
    shortLabel: 'Incident',
    category: 'Property Operations',
    family: 'incident',
    description: 'Record property damage, water events, accidents, security incidents or other significant events.',
    formName: 'Incident Report',
    summaryTitle: 'Incident Details',
    findingsTitle: 'Incident Observations / Evidence',
    additionalCommentsLabel: 'Incident Summary',
    signoffTitle: 'Reported / Prepared by',
    starterAreas: ['Incident Scene / Evidence'],
    fields: [
      { key: 'incidentDateTime', label: 'Incident Date / Time', section: 'details' },
      { key: 'incidentType', label: 'Incident Type', section: 'details' },
      { key: 'exactLocation', label: 'Exact Location', section: 'details' },
      { key: 'reportedBy', label: 'Reported By', section: 'details' },
      { key: 'personsInvolved', label: 'Persons Involved / Witnesses', section: 'details', kind: 'textarea' },
      { key: 'immediateAction', label: 'Immediate Action Taken', section: 'outcome', kind: 'textarea' },
      { key: 'notificationsMade', label: 'Notifications Made', section: 'outcome', kind: 'textarea' },
      { key: 'followUpAction', label: 'Follow-up Action Required', section: 'outcome', kind: 'textarea' },
    ],
    defaultDisclaimer: INCIDENT_DISCLAIMER,
  },
  {
    type: 'Contractor Works',
    label: 'Contractor Works Inspection Report',
    shortLabel: 'Contractor Works',
    category: 'Property Operations',
    family: 'verification',
    description: 'Pre-work or post-work inspection evidence, workmanship observations and completion status.',
    formName: 'Contractor Works Inspection Report',
    summaryTitle: 'Contractor Works Details',
    findingsTitle: 'Works Inspection Findings',
    additionalCommentsLabel: 'Works Inspection Summary',
    signoffTitle: 'Inspected by / Report sign-off',
    starterAreas: ['Works Area'],
    fields: [
      { key: 'contractorName', label: 'Contractor', section: 'details' },
      { key: 'workOrderReference', label: 'Work Order / Job Reference', section: 'details' },
      { key: 'inspectionStage', label: 'Inspection Stage', section: 'details', kind: 'select', options: ['Pre-Works', 'Progress', 'Post-Works / Completion'] },
      { key: 'scopeOfWorks', label: 'Scope of Works', section: 'details', kind: 'textarea' },
      { key: 'inspectionOutcome', label: 'Inspection Outcome', section: 'outcome', kind: 'select', options: ['Satisfactory', 'Partially Satisfactory', 'Unsatisfactory', 'Further Review Required'] },
      { key: 'defectsOutstanding', label: 'Defects / Outstanding Works', section: 'outcome', kind: 'textarea' },
      { key: 'followUpRequired', label: 'Follow-up Required', section: 'outcome', kind: 'textarea' },
    ],
    defaultDisclaimer: WORKS_DISCLAIMER,
  },
  {
    type: 'Property Handover',
    label: 'Property Handover Report',
    shortLabel: 'Property Handover',
    category: 'Property Operations',
    family: 'handover',
    description: 'Record keys, access devices, meters, visible condition and outstanding matters at handover.',
    formName: 'Property Handover Report',
    summaryTitle: 'Handover Details',
    findingsTitle: 'Handover Condition / Items',
    additionalCommentsLabel: 'Handover Summary',
    signoffTitle: 'Handover verified by',
    starterAreas: ['Handover Condition'],
    fields: [
      { key: 'handoverFrom', label: 'Handover From', section: 'details' },
      { key: 'handoverTo', label: 'Handover To', section: 'details' },
      { key: 'handoverDate', label: 'Handover Date', section: 'details', kind: 'date' },
      { key: 'keysAccessDevices', label: 'Keys / Access Devices', section: 'details', kind: 'textarea' },
      { key: 'meterReadings', label: 'Meter Readings', section: 'details', kind: 'textarea' },
      { key: 'documentsTransferred', label: 'Documents / Records Transferred', section: 'outcome', kind: 'textarea' },
      { key: 'outstandingWorks', label: 'Outstanding Works / Matters', section: 'outcome', kind: 'textarea' },
    ],
    defaultDisclaimer: VISUAL_INSPECTION_DISCLAIMER,
  },
  {
    type: 'Preventative Maintenance',
    label: 'Preventative Maintenance Inspection Report',
    shortLabel: 'Preventative Maintenance',
    category: 'Maintenance',
    family: 'findings',
    description: 'Scheduled inspection of building/property components before reactive failures occur.',
    formName: 'Preventative Maintenance Inspection Report',
    summaryTitle: 'Preventative Maintenance Details',
    findingsTitle: 'Preventative Maintenance Findings',
    additionalCommentsLabel: 'Inspection Summary',
    maintenanceCommentsLabel: 'Recommended Preventative Works',
    signoffTitle: 'Prepared by / Report sign-off',
    starterAreas: ['Roof / Drainage', 'Plumbing / Water', 'Electrical / Lighting', 'HVAC / Ventilation', 'External Fabric', 'Safety / Security', 'Grounds'],
    fields: [
      { key: 'inspectionProgram', label: 'Inspection Program / Schedule', section: 'details' },
      { key: 'serviceInterval', label: 'Service Interval', section: 'details' },
      { key: 'nextDueDate', label: 'Next Due Date', section: 'outcome', kind: 'date' },
      { key: 'responsibleTrade', label: 'Responsible Trade / Contractor', section: 'outcome' },
      { key: 'priorityWorks', label: 'Priority Works', section: 'outcome', kind: 'textarea' },
    ],
    defaultDisclaimer: VISUAL_INSPECTION_DISCLAIMER,
  },
  {
    type: 'Cleaning Quality',
    label: 'Cleaning Quality Inspection Report',
    shortLabel: 'Cleaning Quality',
    category: 'Maintenance',
    family: 'verification',
    description: 'Quality-assurance inspection for vacate, common-area or contractor cleaning.',
    formName: 'Cleaning Quality Inspection Report',
    summaryTitle: 'Cleaning Quality Inspection Details',
    findingsTitle: 'Cleaning Quality Findings',
    additionalCommentsLabel: 'Quality Assurance Summary',
    signoffTitle: 'Inspected by / Report sign-off',
    starterAreas: ['Entry', 'Living Areas', 'Kitchen', 'Bedrooms', 'Bathrooms', 'Laundry', 'External / Common Areas'],
    fields: [
      { key: 'cleanerContractor', label: 'Cleaner / Contractor', section: 'details' },
      { key: 'serviceDate', label: 'Cleaning Service Date', section: 'details', kind: 'date' },
      { key: 'qaOutcome', label: 'QA Outcome', section: 'outcome', kind: 'select', options: ['Pass', 'Pass with Minor Items', 'Rectification Required', 'Reclean Required'] },
      { key: 'rectificationDueDate', label: 'Rectification Due Date', section: 'outcome', kind: 'date' },
      { key: 'reinspectionRequired', label: 'Reinspection Required', section: 'outcome', kind: 'select', options: ['No', 'Yes'] },
    ],
    defaultDisclaimer: WORKS_DISCLAIMER,
  },
  {
    type: 'Annual Property Summary',
    label: 'Annual Property Condition Summary',
    shortLabel: 'Annual Property Summary',
    category: 'Residential',
    family: 'summary',
    description: 'High-level annual summary of inspections, maintenance, incidents and property condition trends.',
    formName: 'Annual Property Condition Summary',
    summaryTitle: 'Annual Reporting Period',
    findingsTitle: 'Annual Property Summary',
    additionalCommentsLabel: 'Executive Summary',
    maintenanceCommentsLabel: 'Recommended Priorities',
    signoffTitle: 'Prepared by / Report sign-off',
    starterAreas: ['Property Condition', 'Inspections', 'Maintenance', 'Safety / Compliance Observations', 'Capital Planning'],
    fields: [
      { key: 'reportingPeriod', label: 'Reporting Period', section: 'details' },
      { key: 'occupancySummary', label: 'Occupancy Summary', section: 'details', kind: 'textarea' },
      { key: 'inspectionsCompleted', label: 'Inspections Completed', section: 'details', kind: 'textarea' },
      { key: 'significantEvents', label: 'Significant Events', section: 'outcome', kind: 'textarea' },
      { key: 'conditionTrend', label: 'Condition Trend', section: 'outcome', kind: 'select', options: ['Improved', 'Stable', 'Declining', 'Mixed / Area Specific'] },
      { key: 'recommendedPriorities', label: 'Recommended Priorities', section: 'outcome', kind: 'textarea' },
    ],
    defaultDisclaimer: VISUAL_INSPECTION_DISCLAIMER,
  },
  {
    type: 'Key Safe Installation',
    label: 'Key Safe Installation Report',
    shortLabel: 'Key Safe Installation',
    category: 'Property Operations',
    family: 'installation',
    description: 'Verify key safe installation location, mounting, contents, operation and photographic evidence.',
    formName: 'Key Safe Installation Report',
    summaryTitle: 'Key Safe Installation Details',
    findingsTitle: 'Installation Verification',
    additionalCommentsLabel: 'Installation Summary',
    signoffTitle: 'Installed / Verified by',
    starterAreas: ['Key Safe Installation'],
    fields: [
      { key: 'installationDate', label: 'Installation Date', section: 'details', kind: 'date' },
      { key: 'installedBy', label: 'Installed By', section: 'details' },
      { key: 'keySafeMakeModel', label: 'Key Safe Make / Model', section: 'details' },
      { key: 'installationLocation', label: 'Installation Location', section: 'details', kind: 'textarea' },
      { key: 'mountingMethod', label: 'Mounting / Fixing Method', section: 'details' },
      { key: 'keysPlacedDescription', label: 'Keys / Access Items Placed', section: 'details', kind: 'textarea' },
      { key: 'testOutcome', label: 'Installation / Operation Test Outcome', section: 'outcome', kind: 'select', options: ['Installed and Tested', 'Installed - Follow-up Required', 'Not Completed'] },
      { key: 'secureRecordReference', label: 'Secure Access Record Reference (do not enter code)', section: 'outcome' },
      { key: 'followUpRequired', label: 'Follow-up Required', section: 'outcome', kind: 'textarea' },
    ],
    defaultDisclaimer: KEY_SAFE_DISCLAIMER,
  },
];

const BY_TYPE = new Map(REPORT_TEMPLATE_DEFINITIONS.map((definition) => [definition.type, definition]));

export function getReportTemplate(type: ReportType): ReportTemplateDefinition {
  const definition = BY_TYPE.get(type);
  if (!definition) throw new Error(`Unknown report type: ${type}`);
  return definition;
}

export function getReportTypeLabel(type: ReportType): string {
  return getReportTemplate(type).label;
}

export function usesConditionMatrix(type: ReportType): boolean {
  return Boolean(getReportTemplate(type).conditionMatrix);
}

export function starterAreasFor(type: ReportType): InspectionArea[] {
  return (getReportTemplate(type).starterAreas || []).map((name) => ({
    id: crypto.randomUUID(),
    name,
    items: [
      {
        id: crypto.randomUUID(),
        name: 'Overall',
        clean: null,
        undamaged: null,
        working: null,
        agentComments: '',
        tenantAgrees: null,
        tenantComments: '',
      },
    ],
  }));
}

export const REPORT_CATEGORIES: ReportCategory[] = [
  'Residential',
  'Commercial',
  'Maintenance',
  'Building / Strata',
  'Property Operations',
];
