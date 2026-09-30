import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileDown,
  FileSpreadsheet,
  Image as ImageIcon,
  RefreshCw,
} from 'lucide-react';
import { BuildingManagementReportEditor } from './components/BuildingManagementReportEditor';
import { CommentaryEditor } from './components/CommentaryEditor';
import { ExtendedReportEditor } from './components/ExtendedReportEditor';
import { KeyReceiptEditor } from './components/KeyReceiptEditor';
import { PhotoManager } from './components/PhotoManager';
import { ProInspectLogo } from './components/ProInspectLogo';
import { PropertiesDashboard } from './components/PropertiesDashboard';
import { ReportActions } from './components/ReportActions';
import { ReportDashboard } from './components/ReportDashboard';
import { ReportDocument } from './components/ReportDocument';
import { isBuildingManagementTemplate, isKeyReceiptTemplate, reportInstanceLabel, reportLabel } from './data/reportCatalogue';
import { createBlankReport, normalizeReport } from './data/reportTemplates';
import { api } from './lib/api';
import { cacheReport, getCachedReport, removeCachedReport } from './lib/cache';
import { downloadStarterCsv, parseCsvFile } from './lib/csvParser';
import { processInspectionImage } from './lib/imageProcessor';
import { normalizeAreaName } from './lib/reportFormatting';
import { downloadPdfBlob, generateReportPdf } from './lib/reportPdf';
import { reportValidationMessage, validateReportForFinalization } from './lib/reportValidation';
import { PropertyRecord, ReportData, ReportSummary, ReportType } from './types/report';

type ViewMode = 'preview' | 'commentary' | 'photos' | 'actions';
type StatusMessage = { text: string; type: 'success' | 'info' | 'error' };

function pdfFilename(report: ReportData): string {
  const safeAddress = (report.details.propertyAddress || 'Property')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const safeDate = (report.details.inspectionDate || new Date().toISOString().slice(0, 10))
    .replace(/[^0-9-]/g, '');
  const safeType = reportInstanceLabel(report.details).replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `ProInspect_${safeType}_${safeAddress}_${safeDate}.pdf`;
}

export default function App() {
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<PropertyRecord | null>(null);
  const [reportSummaries, setReportSummaries] = useState<ReportSummary[]>([]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [userEmail, setUserEmail] = useState('');
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [exportProgressText, setExportProgressText] = useState<string | null>(null);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  const serverVersionsRef = useRef<Record<string, string | undefined>>({});
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const queuedSaveCountRef = useRef(0);

  const loadProperties = async () => {
    const list = await api.listProperties();
    setProperties(list);
    return list;
  };

  const persistDraft = (draft: ReportData): Promise<ReportData> => {
    if (!draft.id || draft.status === 'completed') return Promise.resolve(draft);
    const reportId = draft.id;
    queuedSaveCountRef.current += 1;
    setIsSaving(true);

    return new Promise<ReportData>((resolve, reject) => {
      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          try {
            const expectedUpdatedAt = serverVersionsRef.current[reportId] || draft.updatedAt;
            const saved = normalizeReport(await api.saveReport(draft, expectedUpdatedAt));
            serverVersionsRef.current[reportId] = saved.updatedAt;
            await cacheReport(saved).catch(() => undefined);
            setLastSavedTime(
              new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            );
            resolve(saved);
          } catch (error) {
            reject(error);
          } finally {
            queuedSaveCountRef.current = Math.max(0, queuedSaveCountRef.current - 1);
            setIsSaving(queuedSaveCountRef.current > 0);
          }
        });
    });
  };


  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [me, list] = await Promise.all([api.me(), api.listProperties()]);
        if (!active) return;
        setUserEmail(me.email);
        setProperties(list);
      } catch (error: any) {
        if (!active) return;
        setStatusMessage({
          text: error.message || 'Unable to connect to ProInspect cloud storage.',
          type: 'error',
        });
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!report?.id || report.status === 'completed') return;

    cacheReport({
      ...report,
      updatedAt: serverVersionsRef.current[report.id] || report.updatedAt,
    }).catch(() => undefined);
    if (isUploadingPhotos || isCompleting) {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      return;
    }
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await persistDraft(report);
      } catch (error: any) {
        setStatusMessage({
          text: `${error.message || 'Cloud save failed.'} The latest draft remains cached on this device.`,
          type: 'error',
        });
      }
    }, 700);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [report, isUploadingPhotos, isCompleting]);

  const handleCreateProperty = async (input: {
    address: string;
    reference?: string;
    notes?: string;
  }) => {
    try {
      const created = await api.createProperty(input);
      await loadProperties();
      await handleOpenProperty(created);
      setStatusMessage({ text: 'Property created.', type: 'success' });
    } catch (error: any) {
      setStatusMessage({ text: error.message || 'Unable to create property.', type: 'error' });
    }
  };

  const handleOpenProperty = async (property: PropertyRecord) => {
    try {
      setIsLoading(true);
      const result = await api.getProperty(property.id);
      setSelectedProperty(result.property);
      setReportSummaries(result.reports);
      setReport(null);
    } catch (error: any) {
      setStatusMessage({ text: error.message || 'Unable to open property.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const refreshSelectedProperty = async () => {
    if (!selectedProperty) return;
    const result = await api.getProperty(selectedProperty.id);
    setSelectedProperty(result.property);
    setReportSummaries(result.reports);
    await loadProperties();
  };

  const saveDraftImmediately = async (draft: ReportData): Promise<ReportData> => {
    if (!draft.id || draft.status === 'completed') return draft;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    await cacheReport({
      ...draft,
      updatedAt: serverVersionsRef.current[draft.id] || draft.updatedAt,
    }).catch(() => undefined);
    return persistDraft(draft);
  };

  const handleCreateReport = async (type: ReportType) => {
    if (!selectedProperty) return;
    try {
      const blank = createBlankReport(type, selectedProperty);
      const created = normalizeReport(await api.createReport(selectedProperty.id, type, blank));
      if (created.id) serverVersionsRef.current[created.id] = created.updatedAt;
      setReport(created);
      setViewMode('commentary');
      await cacheReport(created);
      await refreshSelectedProperty();
      setStatusMessage({ text: 'Report created and saved to the cloud.', type: 'success' });
    } catch (error: any) {
      setStatusMessage({ text: error.message || 'Unable to create report.', type: 'error' });
    }
  };

  const handleOpenReport = async (id: string) => {
    try {
      setIsLoading(true);
      const cloudReport = normalizeReport(await api.getReport(id));
      if (cloudReport.id) serverVersionsRef.current[cloudReport.id] = cloudReport.updatedAt;
      setReport(cloudReport);
      await cacheReport(cloudReport);
      setViewMode('preview');
    } catch (error: any) {
      const cached = await getCachedReport(id).catch(() => null);
      if (cached) {
        const normalizedCached = normalizeReport(cached);
        if (normalizedCached.id) serverVersionsRef.current[normalizedCached.id] = normalizedCached.updatedAt;
        setReport(normalizedCached);
        setViewMode('preview');
        setStatusMessage({
          text: 'Cloud storage was unavailable. This device is showing the last cached draft.',
          type: 'info',
        });
      } else {
        setStatusMessage({ text: error.message || 'Unable to open report.', type: 'error' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteReport = async (id: string) => {
    if (!confirm('Delete this draft report and its stored photos? This cannot be undone.')) return;
    try {
      await api.deleteReport(id);
      await removeCachedReport(id).catch(() => undefined);
      await refreshSelectedProperty();
      setStatusMessage({ text: 'Draft report deleted.', type: 'info' });
    } catch (error: any) {
      setStatusMessage({ text: error.message || 'Unable to delete report.', type: 'error' });
    }
  };

  const handleBackToProperties = async () => {
    setSelectedProperty(null);
    setReportSummaries([]);
    setReport(null);
    setViewMode('preview');
    try {
      await loadProperties();
    } catch {
      // Existing list remains visible.
    }
  };

  const handleBackToReports = async () => {
    if (report?.id && report.status !== 'completed') {
      try {
        await saveDraftImmediately(report);
      } catch (error: any) {
        setStatusMessage({
          text: `${error.message || 'Cloud save failed.'} Stay on this report until the draft has saved successfully.`,
          type: 'error',
        });
        return;
      }
    }
    setReport(null);
    setViewMode('preview');
    await refreshSelectedProperty().catch(() => undefined);
  };

  const handleCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !report || report.status === 'completed') return;

    if (isBuildingManagementTemplate(report.details.reportType)) {
      setStatusMessage({
        text: 'Building Manager reports use item-linked activities. Add activities in the report editor rather than replacing them with the generic CSV importer.',
        type: 'error',
      });
      return;
    }

    try {
      const parsed = await parseCsvFile(file);
      setReport((current) => current ? { ...current, areas: parsed.areas } : current);
      setViewMode('commentary');
      setStatusMessage({
        text: `Imported commentary for ${parsed.areas.length} areas from ${file.name}.`,
        type: 'success',
      });
    } catch (error: any) {
      setStatusMessage({ text: error.message || 'Unable to import CSV.', type: 'error' });
    }
  };

  const handleUploadCoverPhoto = async (file: File) => {
    if (!report?.id || report.status === 'completed') return;
    setIsUploadingPhotos(true);
    setStatusMessage(null);

    try {
      const savedDraft = await saveDraftImmediately(report);
      const processed = await processInspectionImage(file);
      const updated = normalizeReport(await api.uploadCoverPhoto(savedDraft.id!, processed.blob));
      if (updated.id) serverVersionsRef.current[updated.id] = updated.updatedAt;
      setReport(updated);
      await cacheReport(updated).catch(() => undefined);
      setStatusMessage({
        text: savedDraft.details.coverPhotoUrl ? 'Cover photo replaced.' : 'Cover photo uploaded.',
        type: 'success',
      });
    } catch (error: any) {
      setStatusMessage({ text: error.message || 'Unable to upload cover photo.', type: 'error' });
    } finally {
      setIsUploadingPhotos(false);
    }
  };

  const handleUploadPhotos = async (files: File[], areaName: string, itemId?: string) => {
    if (!report?.id || report.status === 'completed') return;
    setIsUploadingPhotos(true);
    setStatusMessage(null);

    try {
      if (report.areas.length > 0) {
        const validAreas = new Set(report.areas.map((area) => normalizeAreaName(area.name)));
        if (!validAreas.has(normalizeAreaName(areaName))) {
          throw new Error('Select one of the current commentary areas before uploading photos.');
        }
      }
      const savedDraft = await saveDraftImmediately(report);
      const item = itemId
        ? savedDraft.areas.flatMap((area) => area.items).find((candidate) => candidate.id === itemId)
        : undefined;
      if (itemId && !item) {
        throw new Error('The selected reporting item no longer exists. Select the item again before uploading.');
      }

      let current = savedDraft;
      let nextAreaPhotoIndex = current.photos
        .filter((photo) => photo.areaName === areaName)
        .reduce((max, photo) => Math.max(max, photo.photoIndex || 0), 0);

      for (const file of files) {
        const processed = await processInspectionImage(file);
        const photoIndex = ++nextAreaPhotoIndex;
        const photoId = crypto.randomUUID();
        const name = item
          ? `${areaName}: ${item.name || 'Reporting item'} (photo ${photoIndex})`
          : `${areaName}: Overall (photo ${photoIndex})`;
        current = normalizeReport(await api.uploadPhoto(current.id!, processed.blob, {
          id: photoId,
          name,
          areaName,
          itemId: item?.id,
          itemName: item?.name,
          photoIndex,
          isCover: current.photos.length === 0,
        }));
        if (current.id) serverVersionsRef.current[current.id] = current.updatedAt;
        setReport(current);
        await cacheReport(current).catch(() => undefined);
      }

      setStatusMessage({
        text: `Uploaded ${files.length} photo${files.length === 1 ? '' : 's'} to cloud storage.`,
        type: 'success',
      });
    } catch (error: any) {
      setStatusMessage({ text: error.message || 'Unable to upload photos.', type: 'error' });
    } finally {
      setIsUploadingPhotos(false);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!report?.id || report.status === 'completed') return;
    try {
      const savedDraft = await saveDraftImmediately(report);
      const updated = normalizeReport(await api.deletePhoto(savedDraft.id!, photoId));
      if (updated.id) serverVersionsRef.current[updated.id] = updated.updatedAt;
      setReport(updated);
      setStatusMessage({ text: 'Photo deleted.', type: 'info' });
    } catch (error: any) {
      setStatusMessage({ text: error.message || 'Unable to delete photo.', type: 'error' });
    }
  };

  const renderPdf = async (): Promise<Blob> => {
    if (!report) throw new Error('No report is open.');
    return generateReportPdf(report, (message) => setExportProgressText(message));
  };

  const handleDownloadPdf = async () => {
    if (!report) return;
    setIsExportingPdf(true);
    setExportProgressText('Preparing report...');
    try {
      const blob = await renderPdf();
      downloadPdfBlob(blob, pdfFilename(report));
      setStatusMessage({ text: 'PDF downloaded.', type: 'success' });
    } catch (error: any) {
      setStatusMessage({ text: error.message || 'Unable to generate PDF.', type: 'error' });
    } finally {
      setIsExportingPdf(false);
      setExportProgressText(null);
    }
  };

  const handleCompleteReport = async () => {
    if (!report?.id || report.status === 'completed') return;
    setIsCompleting(true);
    setExportProgressText('Saving final report data...');
    try {
      const validationIssues = validateReportForFinalization(report);
      if (validationIssues.length > 0) {
        if (validationIssues.some((issue) => issue.code.startsWith('photo-') || issue.code.includes('photo'))) {
          setViewMode('photos');
        } else {
          setViewMode('commentary');
        }
        throw new Error(reportValidationMessage(validationIssues, 'Report cannot be finalised'));
      }

      const savedDraft = await saveDraftImmediately(report);
      const blob = await generateReportPdf(savedDraft, (message) => setExportProgressText(message));
      const maxCompletedPdfBytes = 90 * 1024 * 1024;
      if (blob.size > maxCompletedPdfBytes) {
        throw new Error(
          `Generated PDF is ${(blob.size / (1024 * 1024)).toFixed(1)} MB and exceeds the 90 MB completed-report limit.`
        );
      }
      setExportProgressText('Storing completed PDF...');
      const completed = normalizeReport(await api.completeReport(savedDraft.id!, blob));
      if (completed.id) serverVersionsRef.current[completed.id] = completed.updatedAt;
      setReport(completed);
      await cacheReport(completed);
      downloadPdfBlob(blob, pdfFilename(completed));
      await refreshSelectedProperty();
      setViewMode('actions');
      setStatusMessage({
        text: 'Report finalised. The issued PDF is stored in cloud storage and has also been downloaded.',
        type: 'success',
      });
    } catch (error: any) {
      setStatusMessage({ text: error.message || 'Unable to finalise report.', type: 'error' });
    } finally {
      setIsCompleting(false);
      setExportProgressText(null);
    }
  };

  const handleDownloadCompleted = (id: string) => {
    window.location.assign(api.completedPdfUrl(id));
  };

  if (!selectedProperty) {
    return (
      <div className="min-h-screen bg-neutral-100 flex flex-col text-neutral-900 font-sans">
        <header className="bg-white border-b border-neutral-200 px-4 lg:px-8 py-3 flex items-center justify-between shadow-xs">
          <ProInspectLogo size="sm" showTagline={false} />
          <span className="text-xs font-semibold text-neutral-500">Property Reports V1</span>
        </header>
        {statusMessage && (
          <div className={`px-4 py-2.5 text-xs border-b ${
            statusMessage.type === 'error'
              ? 'bg-red-50 text-red-800 border-red-200'
              : statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-blue-50 text-blue-800 border-blue-200'
          }`}>
            {statusMessage.text}
          </div>
        )}
        <PropertiesDashboard
          properties={properties}
          userEmail={userEmail}
          isLoading={isLoading}
          onCreate={handleCreateProperty}
          onOpen={handleOpenProperty}
        />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-neutral-100 flex flex-col text-neutral-900 font-sans">
        <header className="bg-white border-b border-neutral-200 px-4 lg:px-8 py-3 flex items-center justify-between shadow-xs">
          <ProInspectLogo size="sm" showTagline={false} />
          <span className="text-xs font-semibold text-neutral-500">{userEmail}</span>
        </header>
        {statusMessage && (
          <div className={`px-4 py-2.5 text-xs border-b ${
            statusMessage.type === 'error'
              ? 'bg-red-50 text-red-800 border-red-200'
              : statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-blue-50 text-blue-800 border-blue-200'
          }`}>
            {statusMessage.text}
          </div>
        )}
        <ReportDashboard
          property={selectedProperty}
          reports={reportSummaries}
          onBack={handleBackToProperties}
          onCreate={handleCreateReport}
          onOpen={handleOpenReport}
          onDelete={handleDeleteReport}
          onDownloadCompleted={handleDownloadCompleted}
        />
      </div>
    );
  }

  const completed = report.status === 'completed';

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col text-neutral-900 font-sans">
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-40 px-4 lg:px-8 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-4 min-w-0">
          <ProInspectLogo size="sm" showTagline={false} />
          <div className="hidden sm:block border-l border-neutral-300 pl-4 min-w-0">
            <h1 className="text-sm font-bold text-neutral-800 truncate">{report.details.propertyAddress}</h1>
            <p className="text-[11px] text-neutral-500 font-medium">
              {reportInstanceLabel(report.details)} • {completed ? 'Completed' : 'Draft'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!completed && (
            <span className="hidden lg:inline text-[11px] text-neutral-500">
              {isSaving ? 'Saving to cloud...' : lastSavedTime ? `Saved ${lastSavedTime}` : 'Cloud draft'}
            </span>
          )}
          <button
            onClick={handleBackToReports}
            className="px-3 py-1.5 text-xs font-bold border border-neutral-300 bg-white rounded-lg flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Reports
          </button>
          <button
            onClick={completed ? () => handleDownloadCompleted(report.id!) : handleDownloadPdf}
            disabled={isExportingPdf || isCompleting}
            className="px-4 py-2 bg-[#0a2540] text-white rounded-lg text-xs font-bold disabled:opacity-50 flex items-center gap-2"
          >
            <FileDown className="w-4 h-4" />
            {completed ? 'Download Final PDF' : 'Download PDF'}
          </button>
        </div>
      </header>

      <div className="bg-white border-b border-neutral-200 px-4 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg">
          <button
            onClick={() => setViewMode('preview')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 ${
              viewMode === 'preview' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600'
            }`}
          >
            <Eye className="w-3.5 h-3.5" /> Preview
          </button>

          {!completed && (
            <>
              <button
                onClick={() => setViewMode('commentary')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 ${
                  viewMode === 'commentary' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" /> {isKeyReceiptTemplate(report.details.reportType) ? 'Receipt Details' : `Commentary (${report.areas.length})`}
              </button>
              {!isKeyReceiptTemplate(report.details.reportType) && (
                <button
                  onClick={() => setViewMode('photos')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 ${
                    viewMode === 'photos' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" /> Photos ({report.photos.length})
                </button>
              )}
            </>
          )}

          <button
            onClick={() => setViewMode('actions')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 ${
              viewMode === 'actions' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Review & Send
          </button>
        </div>

        {!completed && !isBuildingManagementTemplate(report.details.reportType) && !isKeyReceiptTemplate(report.details.reportType) && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => csvInputRef.current?.click()}
              className="px-3 py-1.5 bg-white border border-neutral-300 text-neutral-700 rounded-lg text-xs font-semibold flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Import CSV
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvUpload}
              className="hidden"
            />
            <button
              onClick={downloadStarterCsv}
              className="px-2.5 py-1.5 text-neutral-600 text-xs font-medium flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> CSV Template
            </button>
          </div>
        )}
      </div>

      {statusMessage && (
        <div className={`px-4 py-2.5 text-xs flex items-center justify-between border-b ${
          statusMessage.type === 'error'
            ? 'bg-red-50 text-red-800 border-red-200'
            : statusMessage.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-blue-50 text-blue-800 border-blue-200'
        }`}>
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="font-bold opacity-60">×</button>
        </div>
      )}

      {(isExportingPdf || isCompleting) && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-6 text-white">
          <div className="bg-neutral-900 border border-neutral-700 p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center">
            <RefreshCw className="w-8 h-8 animate-spin text-cyan-400 mx-auto mb-4" />
            <h3 className="font-bold text-base">{isCompleting ? 'Finalising Report' : 'Generating PDF'}</h3>
            <p className="text-xs text-neutral-400 mt-2">{exportProgressText || 'Preparing report...'}</p>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        {viewMode === 'preview' && (
          <div className="py-6">
            <div className="max-w-[210mm] mx-auto mb-4 px-4 flex justify-between items-center text-xs text-neutral-500">
              <span>
                {report.details.reportType === 'Entry'
                  ? 'Layout: Western Australia Form 1'
                  : `Layout: ProInspect ${reportInstanceLabel(report.details)}`}
              </span>
              <span>Screen preview • Download PDF uses the deterministic production renderer</span>
            </div>
            <ReportDocument report={report} />
          </div>
        )}

        {viewMode === 'commentary' && !completed && (
          <div className="max-w-6xl mx-auto p-4 md:p-6 h-[calc(100vh-125px)]">
            {['Entry', 'Routine', 'Exit'].includes(report.details.reportType) ? (
              <CommentaryEditor
                details={report.details}
                areas={report.areas}
                onChangeDetails={(details) => setReport((current) => current ? { ...current, details } : current)}
                onChangeAreas={(areas) => setReport((current) => current ? { ...current, areas } : current)}
              />
            ) : isKeyReceiptTemplate(report.details.reportType) ? (
              <KeyReceiptEditor
                details={report.details}
                areas={report.areas}
                onChangeDetails={(details) => setReport((current) => current ? { ...current, details } : current)}
                onChangeAreas={(areas) => setReport((current) => current ? { ...current, areas } : current)}
              />
            ) : isBuildingManagementTemplate(report.details.reportType) ? (
              <BuildingManagementReportEditor
                details={report.details}
                areas={report.areas}
                photos={report.photos}
                onChangeDetails={(details) => setReport((current) => current ? { ...current, details } : current)}
                onChangeAreas={(areas) => setReport((current) => current ? { ...current, areas } : current)}
              />
            ) : (
              <ExtendedReportEditor
                details={report.details}
                areas={report.areas}
                onChangeDetails={(details) => setReport((current) => current ? { ...current, details } : current)}
                onChangeAreas={(areas) => setReport((current) => current ? { ...current, areas } : current)}
              />
            )}
          </div>
        )}

        {viewMode === 'photos' && !completed && !isKeyReceiptTemplate(report.details.reportType) && (
          <div className="max-w-6xl mx-auto p-4 md:p-6 h-[calc(100vh-125px)]">
            <PhotoManager
              photos={report.photos}
              areas={report.areas}
              coverPhotoUrl={report.details.coverPhotoUrl}
              isUploading={isUploadingPhotos}
              onUploadPhotos={handleUploadPhotos}
              onUploadCoverPhoto={handleUploadCoverPhoto}
              onUpdatePhotos={(photos) => setReport((current) => current ? { ...current, photos } : current)}
              onDeletePhoto={handleDeletePhoto}
              linkToItems={isBuildingManagementTemplate(report.details.reportType)}
            />
          </div>
        )}

        {viewMode === 'actions' && (
          <div className="py-8 px-4">
            <ReportActions
              report={report}
              onDownload={handleDownloadPdf}
              onComplete={handleCompleteReport}
              onDownloadCompleted={() => handleDownloadCompleted(report.id!)}
              isExporting={isExportingPdf}
              isCompleting={isCompleting}
            />
          </div>
        )}
      </main>
    </div>
  );
}
