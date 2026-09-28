import { PropertyRecord, ProInspectIntegrationContext, ReportData, ReportSummary, ReportType, UserSession } from '../types/report';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers || {}),
    },
    credentials: 'same-origin',
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let code: string | undefined;
    let details: Record<string, unknown> | undefined;
    try {
      const data = await response.json() as {
        error?: string;
        code?: string;
        details?: Record<string, unknown>;
      };
      if (data.error) message = data.error;
      code = data.code;
      details = data.details;
    } catch {
      // keep default message
    }
    throw new ApiError(message, response.status, code, details);
  }

  return response.json() as Promise<T>;
}

export const api = {
  me: () => apiRequest<UserSession>('/api/me'),

  resolveProInspectHandoff: (token: string) =>
    apiRequest<ProInspectIntegrationContext>(
      `/api/integrations/proinspect/handoff?token=${encodeURIComponent(token)}`
    ),



  listProperties: (includeArchived = false) =>
    apiRequest<PropertyRecord[]>(`/api/properties${includeArchived ? '?includeArchived=true' : ''}`),

  createProperty: (input: { address: string; reference?: string; notes?: string; allowDuplicate?: boolean }) =>
    apiRequest<PropertyRecord>('/api/properties', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateProperty: (id: string, input: { address: string; reference?: string; notes?: string; allowDuplicate?: boolean }) =>
    apiRequest<PropertyRecord>(`/api/properties/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  getProperty: (id: string) =>
    apiRequest<{ property: PropertyRecord; reports: ReportSummary[] }>(
      `/api/properties/${encodeURIComponent(id)}`
    ),

  createReport: (propertyId: string, reportType: ReportType, report: ReportData) =>
    apiRequest<ReportData>(`/api/properties/${encodeURIComponent(propertyId)}/reports`, {
      method: 'POST',
      body: JSON.stringify({ reportType, report }),
    }),

  getReport: (id: string) =>
    apiRequest<ReportData>(`/api/reports/${encodeURIComponent(id)}`),

  saveReport: (report: ReportData, expectedRevision: number) =>
    apiRequest<ReportData>(`/api/reports/${encodeURIComponent(report.id || '')}`, {
      method: 'PUT',
      body: JSON.stringify({ report, expectedRevision }),
    }),

  deleteReport: (id: string, expectedRevision: number) =>
    apiRequest<{ success: true }>(
      `/api/reports/${encodeURIComponent(id)}?expectedRevision=${encodeURIComponent(String(expectedRevision))}`,
      { method: 'DELETE' }
    ),

  cloneConflictDraft: (id: string, report: ReportData) =>
    apiRequest<ReportData>(`/api/reports/${encodeURIComponent(id)}/clone`, {
      method: 'POST',
      body: JSON.stringify({ report }),
    }),

  createCorrection: (id: string) =>
    apiRequest<ReportData>(`/api/reports/${encodeURIComponent(id)}/correction`, {
      method: 'POST',
    }),

  archiveProperty: (id: string) =>
    apiRequest<PropertyRecord>(`/api/properties/${encodeURIComponent(id)}/archive`, { method: 'POST' }),

  restoreProperty: (id: string) =>
    apiRequest<PropertyRecord>(`/api/properties/${encodeURIComponent(id)}/restore`, { method: 'POST' }),

  uploadPhoto: async (
    reportId: string,
    file: Blob,
    metadata: {
      id: string;
      name: string;
      areaName: string;
      areaId?: string;
      itemId?: string;
      itemName?: string;
      photoIndex: number;
      isCover?: boolean;
    },
    expectedRevision: number
  ) => {
    const form = new FormData();
    form.append('file', file, `${metadata.id}.jpg`);
    form.append('photoId', metadata.id);
    form.append('name', metadata.name);
    form.append('areaName', metadata.areaName);
    if (metadata.areaId) form.append('areaId', metadata.areaId);
    if (metadata.itemId) form.append('itemId', metadata.itemId);
    if (metadata.itemName) form.append('itemName', metadata.itemName);
    form.append('photoIndex', String(metadata.photoIndex));
    form.append('isCover', metadata.isCover ? 'true' : 'false');
    form.append('expectedRevision', String(expectedRevision));

    return apiRequest<ReportData>(`/api/reports/${encodeURIComponent(reportId)}/photos`, {
      method: 'POST',
      body: form,
    });
  },

  deletePhoto: (reportId: string, photoId: string, expectedRevision: number) =>
    apiRequest<ReportData>(
      `/api/reports/${encodeURIComponent(reportId)}/photos/${encodeURIComponent(photoId)}?expectedRevision=${encodeURIComponent(String(expectedRevision))}`,
      { method: 'DELETE' }
    ),

  completeReport: async (reportId: string, pdf: Blob, expectedRevision: number) => {
    const response = await fetch(
      `/api/reports/${encodeURIComponent(reportId)}/complete?expectedRevision=${encodeURIComponent(String(expectedRevision))}`,
      {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: pdf,
        credentials: 'same-origin',
      }
    );
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as {
        error?: string;
        code?: string;
        details?: Record<string, unknown>;
      };
      throw new ApiError(
        data.error || `Unable to complete report (${response.status})`,
        response.status,
        data.code,
        data.details
      );
    }
    return response.json() as Promise<ReportData>;
  },

  completedPdfUrl: (reportId: string) =>
    `/api/reports/${encodeURIComponent(reportId)}/pdf`,
};
