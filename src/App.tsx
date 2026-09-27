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
import { CommentaryEditor } from './components/CommentaryEditor';
import { ExtendedReportEditor } from './components/ExtendedReportEditor';
import { PhotoManager } from './components/PhotoManager';
import { ProInspectLogo } from './components/ProInspectLogo';
import { PropertiesDashboard } from './components/PropertiesDashboard';
import { ReportActions } from './components/ReportActions';
import { ReportDashboard } from './components/ReportDashboard';
import { ReportDocument } from './components/ReportDocument';
import { reportLabel } from './data/reportCatalogue';
import { createBlankReport, normalizeReport } from './data/reportTemplates';
import { api } from './lib/api';
import { cacheReport, getCachedReport, removeCachedReport } from './lib/cache';
import { downloadStarterCsv, parseCsvFile } from './lib/csvParser';
import { processInspectionImage } from './lib/imageProcessor';
import { normalizeAreaName } from './lib/reportFormatting';
import { downloadPdfBlob, generateReportPdf } from './lib/reportPdf';
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
  const safeType = reportLabel(report.details.reportType).replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
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

  const loadProperties = async () => {
    const list = await api.listProperties();
    setProperties(list);
    return list;
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

    cacheReport(report).catch(() => undefined);
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

    saveTimerRef.current = window.setTimeout(async () => {
      setIsSaving(true);
      try {
        await api.saveReport(report);
        setLastSavedTime(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
      } catch (error: any) {
        setStatusMessage({
          text: `${error.message || 'Cloud save failed.'} The latest draft remains cached on this device.`,
          type: 'error',
        });
      } finally {
        setIsSaving(false);
      }
    }, 700);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [report]);

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

  const handleCreateReport = async (type: ReportType) => {
    if (!selectedProperty) return;
    try {
      const blank = createBlankReport(type, selectedProperty);
      const created = await api.createReport(selectedProperty.id, type, blank);
      setReport(normalizeReport(created));
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
      setReport(cloudReport);
      await cacheReport(cloudReport);
      setViewMode('preview');
    } catch (error: any) {
      const cached = await getCachedReport(id).catch(() => null);
      if (cached) {
        setReport(normalizeReport(cached));
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
    setReport(null);
    setViewMode('preview');
    await refreshSelectedProperty().catch(() => undefined);
  };

  const handleCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !report || report.status === 'completed') return;

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

  const handleUploadPhotos = async (files: File[], areaName: string) => {
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
      let current = report;
      let nextAreaPhotoIndex = current.photos
        .filter((photo) => photo.areaName === areaName)
        .reduce((max, photo) => Math.max(max, photo.photoIndex || 0), 0);

      for (const file of files) {
        const processed = await processInspectionImage(file);
        const photoIndex = ++nextAreaPhotoIndex;
        const photoId = crypto.randomUUID();
        const name = `${areaName}: Overall (photo ${photoIndex})`;
        current = await api.uploadPhoto(current.id!, processed.blob, {
          id: photoId,
          name,
          areaName,
          photoIndex,
          isCover: current.photos.length === 0,
        });
        setReport(normalizeReport(current));
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
      const updated = await api.deletePhoto(report.id, photoId);
      setReport(normalizeReport(updated));
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
      if (report.areas.length > 0 && report.photos.length > 0) {
        const validAreaKeys = new Set(report.areas.map((area) => normalizeAreaName(area.name)));
        const unmappedPhotos = report.photos.filter(
          (photo) => !validAreaKeys.has(normalizeAreaName(photo.areaName || 'General'))
        );
        if (unmappedPhotos.length > 0) {
          setViewMode('photos');
          throw new Error(
            `${unmappedPhotos.length} photo${unmappedPhotos.length === 1 ? ' is' : 's are'} not assigned to a current report area. Review the red photo-area filter and reassign before finalising.`
          );
        }
      }

      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      await api.saveReport(report);
      const blob = await renderPdf();
      const maxCompletedPdfBytes = 90 * 1024 * 1024;
      if (blob.size > maxCompletedPdfBytes) {
        throw new Error(
          `Generated PDF is ${(blob.size / (1024 * 1024)).toFixed(1)} MB and exceeds the 90 MB completed-report limit.`
        );
      }
      setExportProgressText('Storing completed PDF...');
      const completed = normalizeReport(await api.completeReport(report.id, blob));
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
              {reportLabel(report.details.reportType)} • {completed ? 'Completed' : 'Draft'}
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
                <Edit3 className="w-3.5 h-3.5" /> Commentary ({report.areas.length})
              </button>
              <button
                onClick={() => setViewMode('photos')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 ${
                  viewMode === 'photos' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" /> Photos ({report.photos.length})
              </button>
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

        {!completed && (
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
                  : `Layout: ProInspect ${reportLabel(report.details.reportType)}`}
              </span>
              <span>A4 Portrait • Production PDF renderer</span>
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

        {viewMode === 'photos' && !completed && (
          <div className="max-w-6xl mx-auto p-4 md:p-6 h-[calc(100vh-125px)]">
            <PhotoManager
              photos={report.photos}
              areas={report.areas}
              isUploading={isUploadingPhotos}
              onUploadPhotos={handleUploadPhotos}
              onUpdatePhotos={(photos) => setReport((current) => current ? { ...current, photos } : current)}
              onDeletePhoto={handleDeletePhoto}
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
