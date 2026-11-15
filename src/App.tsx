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
import { createReportFromTemplate, createTemplateSnapshot } from './lib/templateUtils';
import { api } from './lib/api';
import { cacheReport, getCachedReport, removeCachedReport } from './lib/cache';
import { downloadStarterCsv, parseCsvFile } from './lib/csvParser';
import { mergeCsvCommentary } from './lib/csvCommentaryMerge';
import { processInspectionImage } from './lib/imageProcessor';
import { normalizeAreaName } from './lib/reportFormatting';
import {
  countOfflineOperations,
  hydrateOfflinePhotoPreviews,
  listOfflineOperations,
  optimisticOfflinePhoto,
  queueOfflinePhoto,
  queueOfflineCover,
  queueOfflineSave,
  removeOfflineOperation,
  removeOfflineSaveForReport,
  syncOfflineOperations,
} from './lib/offlineQueue';
import { downloadPdfBlob, generateReportPdf } from './lib/reportPdf';
import { reportValidationMessage, validateReportForFinalization } from './lib/reportValidation';
import { ReportWriteCoordinator, mergeCloudPhotoMutation, reportForCloudSave } from './lib/reportWriteCoordinator';
import { isRevisionConflict, reconcileReport } from './lib/reportConflictResolution';
import { PropertyRecord, ReportData, ReportSummary, ReportType } from './types/report';
import type { ReportTemplateRecord } from './types/workflow';

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
  const [pendingPhotoUploads, setPendingPhotoUploads] = useState(0);
  const isUploadingPhotos = pendingPhotoUploads > 0;
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isSyncingPlatform, setIsSyncingPlatform] = useState(false);
  const [exportProgressText, setExportProgressText] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  const [pendingOfflineOperations, setPendingOfflineOperations] = useState(0);
  const [isSyncingOffline, setIsSyncingOffline] = useState(false);
  const [photoFailures, setPhotoFailures] = useState<Array<{ name: string; message: string; queued: boolean }>>([]);
  const [unresolvedConflict, setUnresolvedConflict] = useState<{ reportId: string; fields: string[] } | null>(null);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  const serverVersionsRef = useRef<Record<string, string | undefined>>({});
  const acknowledgedReportsRef = useRef<Record<string, ReportData>>({});
  const unresolvedConflictRef = useRef<string | null>(null);
  const reportWriteQueueRef = useRef(new ReportWriteCoordinator());
  const queuedSaveCountRef = useRef(0);
  const photoUploadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const queuedPhotoCountRef = useRef(0);
  const lastPhotoUploadFailureRef = useRef<string | null>(null);
  const isOfflineSyncingRef = useRef(false);
  const retryOfflineSyncRef = useRef<() => Promise<void>>(async () => undefined);
  const reportRef = useRef<ReportData | null>(null);

  useEffect(() => {
    reportRef.current = report;
  }, [report]);

  // Every D1 report mutation shares this queue; photo uploads must not race
  // autosaves and cause this same tab to report a cross-device conflict.
  const queueReportWrite = <T,>(work: () => Promise<T>): Promise<T> =>
    reportWriteQueueRef.current.enqueue(work);

  useEffect(() => {
    const refreshCount = () => countOfflineOperations().then(setPendingOfflineOperations).catch(() => undefined);
    const sync = async () => {
      if (isOfflineSyncingRef.current || !navigator.onLine) return;
      isOfflineSyncingRef.current = true;
      setIsSyncingOffline(true);
      setIsOffline(false);
      try {
        const initiallyPending = await countOfflineOperations();
        if (initiallyPending === 0) {
          setPendingOfflineOperations(0);
          return;
        }
        const result = await queueReportWrite(() =>
          syncOfflineOperations((remaining) => setPendingOfflineOperations(remaining))
        );
        let combinedNeedsReview = false;
        const currentId = reportRef.current?.id;
        const updated = currentId ? result.reports.find((candidate) => candidate.id === currentId) : undefined;
        if (updated) {
          const cloud = normalizeReport(updated);
          acknowledgeReport(cloud);
          const hydrated = await hydrateOfflinePhotoPreviews(cloud);
          const current = reportRef.current;
          if (current?.id === cloud.id) {
            const source = result.sourceReports[cloud.id];
            const merged = source
              ? reconcileReport(source, current, hydrated)
              : { report: mergeCloudPhotoMutation(current, hydrated), conflicts: [] };
            reportRef.current = merged.report;
            setReport((previous) => previous?.id === cloud.id ? merged.report : previous);
            await cacheReport(merged.report).catch(() => undefined);
            if (merged.conflicts.length && !result.conflict) {
              combinedNeedsReview = true;
              unresolvedConflictRef.current = cloud.id;
              setUnresolvedConflict({ reportId: cloud.id, fields: merged.conflicts });
            }
          } else {
            await cacheReport(hydrated).catch(() => undefined);
          }
        }
        if (result.conflict) {
          const conflict = result.conflict;
          const current = reportRef.current;
          const hydrated = await hydrateOfflinePhotoPreviews(normalizeReport(conflict.local));
          const merged = current?.id === conflict.reportId
            ? reconcileReport(conflict.queuedReport, current, hydrated)
            : { report: hydrated, conflicts: [] };
          acknowledgeReport(normalizeReport(conflict.cloud));
          if (current?.id === conflict.reportId) {
            reportRef.current = merged.report;
            setReport(merged.report);
            await cacheReport(merged.report).catch(() => undefined);
            unresolvedConflictRef.current = conflict.reportId;
            setUnresolvedConflict({
              reportId: conflict.reportId,
              fields: [...new Set([...conflict.fields, ...merged.conflicts])],
            });
          }
          setStatusMessage({
            text: `Offline edits need review for report ${conflict.reportId}. The queued work remains safely on this device.`,
            type: 'error',
          });
        } else if (result.failure) {
          setStatusMessage({ text: `Offline sync stopped: ${result.failure}. Retained ${result.remaining} queued operation(s).`, type: 'error' });
        } else if (combinedNeedsReview) {
          setStatusMessage({ text: 'Local edits and cloud changes need review before further saving.', type: 'error' });
        } else if (result.remaining === 0) {
          lastPhotoUploadFailureRef.current = null;
          setPhotoFailures((previous) => previous.filter((item) => !item.queued));
          setStatusMessage({ text: 'All queued offline edits and photos synced to the cloud.', type: 'success' });
        } else {
          setStatusMessage({ text: `${result.remaining} offline operation(s) still need attention.`, type: 'error' });
        }
        setPendingOfflineOperations(result.remaining);
      } catch (error: any) {
        setStatusMessage({ text: error.message || 'Unable to sync offline changes.', type: 'error' });
      } finally {
        isOfflineSyncingRef.current = false;
        setIsSyncingOffline(false);
      }
    };
    retryOfflineSyncRef.current = sync;
    const offline = () => {
      setIsOffline(true);
      void refreshCount();
      setStatusMessage({ text: 'Offline field mode. Changes and photos are stored on this device until reception returns.', type: 'info' });
    };
    window.addEventListener('online', sync);
    window.addEventListener('offline', offline);
    void refreshCount();
    if (navigator.onLine) void sync();
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', offline);
    };
  }, []);

  const loadProperties = async () => {
    const list = await api.listProperties();
    setProperties(list);
    return list;
  };

  const acknowledgeReport = (confirmed: ReportData) => {
    if (!confirmed.id) return;
    serverVersionsRef.current[confirmed.id] = confirmed.updatedAt;
    acknowledgedReportsRef.current[confirmed.id] = confirmed;
  };

  const persistDraft = (draft: ReportData): Promise<ReportData> => {
    if (!draft.id || draft.status === 'completed') return Promise.resolve(draft);
    const reportId = draft.id;
    queuedSaveCountRef.current += 1;
    setIsSaving(true);

    return queueReportWrite(async () => {
      try {
        // The autosave may have been queued before one or more uploads, edits or
        // category changes. Never send that old snapshot with a fresh revision.
        const latest = reportRef.current?.id === reportId ? reportRef.current : draft;
        const expectedUpdatedAt = serverVersionsRef.current[reportId] || latest.updatedAt;
        if (!navigator.onLine) {
          await cacheReport(latest).catch(() => undefined);
          await queueOfflineSave(latest, expectedUpdatedAt, acknowledgedReportsRef.current[reportId]);
          setPendingOfflineOperations(await countOfflineOperations().catch(() => 1));
          setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
          return latest;
        }

        if (unresolvedConflictRef.current === reportId) {
          throw new Error('Overlapping cloud edits require resolution before saving.');
        }
        let saved: ReportData | undefined;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const currentDraft = reportRef.current?.id === reportId ? reportRef.current : latest;
          const version = serverVersionsRef.current[reportId] || currentDraft.updatedAt;
          try {
            saved = normalizeReport(await api.saveReport(reportForCloudSave(currentDraft), version));
            acknowledgeReport(saved);
            break;
          } catch (error) {
            if (!isRevisionConflict(error) || attempt === 2) throw error;
            const cloud = normalizeReport(await api.getReport(reportId));
            const baseline = acknowledgedReportsRef.current[reportId];
            if (!baseline) {
              unresolvedConflictRef.current = reportId;
              setUnresolvedConflict({ reportId, fields: ['Cached report without confirmed baseline'] });
              throw new Error('The cloud version has changed. Local edits are cached but need manual review.');
            }
            const localNow = reportRef.current?.id === reportId ? reportRef.current : currentDraft;
            const merged = reconcileReport(baseline, localNow, cloud);
            acknowledgeReport(cloud);
            reportRef.current = merged.report;
            setReport((previous) => previous?.id === reportId ? merged.report : previous);
            await cacheReport(merged.report).catch(() => undefined);
            if (merged.conflicts.length) {
              unresolvedConflictRef.current = reportId;
              setUnresolvedConflict({ reportId, fields: merged.conflicts });
              throw new Error('Another session edited the same fields. Your changes remain cached for review.');
            }
            setStatusMessage({ text: 'Independent cloud updates merged with this draft; saving again.', type: 'info' });
          }
        }
        if (!saved) throw new Error('Unable to save report.');


        // Do not replace the active form with the server response: the user may
        // have continued typing while this save was in flight. Only advance its
        // revision reference and cache the latest local content.
        const current = reportRef.current;
        const cacheDraft = current?.id === reportId
          ? { ...current, updatedAt: saved.updatedAt }
          : saved;
        if (current?.id === reportId) reportRef.current = cacheDraft;
        await cacheReport(cacheDraft).catch(() => undefined);
        setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        return saved;
      } finally {
        queuedSaveCountRef.current = Math.max(0, queuedSaveCountRef.current - 1);
        setIsSaving(queuedSaveCountRef.current > 0);
      }
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

        const currentUrl=new URL(window.location.href);
        const handoffToken=currentUrl.searchParams.get('proinspect_handoff');
        if(handoffToken){
          const context=await api.resolveProInspectHandoff(handoffToken);
          let property=list.find((candidate)=>candidate.reference===`PI:${context.propertyId}`);
          if(!property){
            property=await api.createProperty({
              address:context.propertyAddress,
              reference:`PI:${context.propertyId}`,
              notes:context.propertyReference ? `ProInspect platform property reference: ${context.propertyReference}` : 'Created from ProInspect platform handoff.',
            });
            setProperties((current)=>[property!,...current.filter((candidate)=>candidate.id!==property!.id)]);
          }
          const propertyResult=await api.getProperty(property.id);
          const blank=createBlankReport(context.reportType,propertyResult.property);
          const linkedDraft:ReportData={
            ...blank,
            integrationContext:context,
            details:{
              ...blank.details,
              propertyAddress:context.propertyAddress,
              referenceNumber:context.bookingId||context.workOrderId||blank.details.referenceNumber,
              workOrderReference:context.workOrderId||blank.details.workOrderReference,
            },
          };
          const created=normalizeReport(await api.createReport(propertyResult.property.id,context.reportType,linkedDraft));
          acknowledgeReport(created);
          setSelectedProperty(propertyResult.property);
          localStorage.setItem('proinspect:lastProperty',JSON.stringify(propertyResult.property));
          setReportSummaries(propertyResult.reports);
          setReport(created);
          reportRef.current=created;
          setViewMode('commentary');
          await cacheReport(created).catch(()=>undefined);
          currentUrl.searchParams.delete('proinspect_handoff');
          window.history.replaceState({},'',currentUrl.pathname+(currentUrl.search||'')+currentUrl.hash);
          setStatusMessage({text:'Report created from ProInspect platform context. Finalisation will publish the issued PDF back to the canonical property record.',type:'success'});
        }
      } catch (error: any) {
        if (!active) return;
        if (!navigator.onLine) {
          const lastReportId = localStorage.getItem('proinspect:lastReportId');
          const propertyJson = localStorage.getItem('proinspect:lastProperty');
          const cached = lastReportId ? await getCachedReport(lastReportId).catch(() => null) : null;
          const property = propertyJson ? JSON.parse(propertyJson) as PropertyRecord : null;
          if (cached && property) {
            const normalized = await hydrateOfflinePhotoPreviews(normalizeReport(cached));
            setSelectedProperty(property);
            setReport(normalized);
            reportRef.current = normalized;
            setViewMode('commentary');
            setUserEmail('Offline field mode');
            setStatusMessage({
              text: 'Offline field mode restored the last locally cached report. Finalising, sending and Google Drive import require connectivity.',
              type: 'info',
            });
          } else {
            setStatusMessage({
              text: 'No reception and no previously cached field report is available on this device.',
              type: 'error',
            });
          }
        } else {
          setStatusMessage({
            text: error.message || 'Unable to connect to ProInspect cloud storage.',
            type: 'error',
          });
        }
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
    if (unresolvedConflictRef.current === report.id) return;

    if (isUploadingPhotos || isCompleting) {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      return;
    }
    cacheReport({
      ...report,
      updatedAt: serverVersionsRef.current[report.id] || report.updatedAt,
    }).catch(() => undefined);
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
      localStorage.setItem('proinspect:lastProperty', JSON.stringify(result.property));
      setReportSummaries(result.reports);
      setReport(null);
      reportRef.current = null;
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
    const latest = reportRef.current?.id === draft.id ? reportRef.current : draft;
    await cacheReport({
      ...latest,
      updatedAt: serverVersionsRef.current[draft.id] || latest.updatedAt,
    }).catch(() => undefined);
    return persistDraft(latest);
  };

  const handleCreateReport = async (type: ReportType) => {
    if (!selectedProperty) return;
    try {
      const blank = createBlankReport(type, selectedProperty);
      const created = normalizeReport(await api.createReport(selectedProperty.id, type, blank));
      acknowledgeReport(created);
      reportRef.current = created;
      setReport(created);
      setViewMode('commentary');
      await cacheReport(created);
      await refreshSelectedProperty();
      setStatusMessage({ text: 'Report created and saved to the cloud.', type: 'success' });
    } catch (error: any) {
      setStatusMessage({ text: error.message || 'Unable to create report.', type: 'error' });
    }
  };

  const handleCreateReportFromTemplate = async (template: ReportTemplateRecord) => {
    if (!selectedProperty) return;
    try {
      const prepared = createReportFromTemplate(template.templateData, selectedProperty);
      const created = normalizeReport(await api.createReport(selectedProperty.id, template.reportType, prepared));
      acknowledgeReport(created);
      reportRef.current = created;
      setReport(created);
      setViewMode('commentary');
      await cacheReport(created);
      await refreshSelectedProperty();
      setStatusMessage({ text: `Report created from template "${template.name}".`, type: 'success' });
    } catch (error: any) {
      setStatusMessage({ text: error.message || 'Unable to create report from template.', type: 'error' });
    }
  };

  const handleSaveTemplate = async () => {
    if (!report || !selectedProperty) return;
    const name = window.prompt('Template name:', `${reportInstanceLabel(report.details)} - ${selectedProperty.address}`)?.trim();
    if (!name) return;
    const propertySpecific = window.confirm(
      'Save this template only for this property? Select Cancel to make it available globally.'
    );
    try {
      await api.createTemplate({
        name,
        scopeType: propertySpecific ? 'property' : 'global',
        propertyId: propertySpecific ? selectedProperty.id : undefined,
        templateData: createTemplateSnapshot(report),
      });
      setStatusMessage({ text: `Template "${name}" saved.`, type: 'success' });
    } catch (error: any) {
      setStatusMessage({ text: error.message || 'Unable to save report template.', type: 'error' });
    }
  };

  const handleOpenReport = async (id: string) => {
    try {
      setIsLoading(true);
      const cloudReport = normalizeReport(await api.getReport(id));
      acknowledgeReport(cloudReport);
      unresolvedConflictRef.current = null;
      setUnresolvedConflict(null);
      const queued = (await listOfflineOperations()).find(
        (operation) => operation.kind === 'save-report' && operation.reportId === id
      );
      const pending = queued?.kind === 'save-report' ? queued : undefined;
      let active = await hydrateOfflinePhotoPreviews(cloudReport);
      if (pending) {
        if (pending.baseReport) {
          const merged = reconcileReport(pending.baseReport, pending.report, active);
          active = merged.report;
          if (merged.conflicts.length || cloudReport.status === 'completed') {
            unresolvedConflictRef.current = id;
            setUnresolvedConflict({ reportId: id, fields: merged.conflicts.length ? merged.conflicts : ['Report completed since offline editing'] });
          }
        } else {
          active = await hydrateOfflinePhotoPreviews(pending.report);
          unresolvedConflictRef.current = id;
          setUnresolvedConflict({ reportId: id, fields: ['Legacy offline draft requires review'] });
        }
        setStatusMessage({ text: 'Locally queued edits were restored for this report. Review or retry synchronisation before finalising.', type: 'info' });
      }
      reportRef.current = active;
      setReport(active);
      localStorage.setItem('proinspect:lastReportId', id);
      await cacheReport(active);
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

  const resolveConflict = async (keepLocal: boolean) => {
    const conflict = unresolvedConflict;
    if (!conflict || reportRef.current?.id !== conflict.reportId) return;
    try {
      const cloud = normalizeReport(await api.getReport(conflict.reportId));
      if (keepLocal && cloud.status === 'completed') {
        throw new Error('This report is already completed and cannot be modified. Preserve the local backup for review.');
      }
      if (!keepLocal) {
        // A deliberate cloud reload must never irreversibly discard edits.
        // Export the current local draft before the cloud snapshot replaces it.
        const backup = new Blob([JSON.stringify(reportRef.current, null, 2)], { type: 'application/json' });
        const backupUrl = URL.createObjectURL(backup);
        const link = document.createElement('a');
        link.href = backupUrl;
        link.download = `ProInspect_unsaved_${conflict.reportId}_${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(backupUrl), 60_000);
        await removeOfflineSaveForReport(conflict.reportId);
        acknowledgeReport(cloud);
        reportRef.current = cloud;
        setReport(cloud);
        unresolvedConflictRef.current = null;
        setUnresolvedConflict(null);
        setStatusMessage({ text: 'Latest cloud report loaded. The unsaved local draft was exported as a JSON backup before reloading.', type: 'info' });
        return;
      }
      const baseline = acknowledgedReportsRef.current[conflict.reportId];
      const candidate = baseline
        ? reconcileReport(baseline, reportRef.current, cloud).report
        : { ...reportRef.current, updatedAt: cloud.updatedAt };
      acknowledgeReport(cloud);
      reportRef.current = candidate;
      setReport(candidate);
      unresolvedConflictRef.current = null;
      setUnresolvedConflict(null);
      await cacheReport(candidate).catch(() => undefined);
      await persistDraft(candidate);
      await removeOfflineSaveForReport(conflict.reportId);
      setPendingOfflineOperations(await countOfflineOperations());
      setStatusMessage({ text: 'Selected local edits saved against the latest cloud version.', type: 'success' });
    } catch (error: any) {
      setStatusMessage({ text: error.message || 'Unable to resolve conflict; changes remain cached.', type: 'error' });
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
        if (queuedPhotoCountRef.current > 0) {
          setStatusMessage({ text: 'Finishing queued photo uploads before leaving this draft...', type: 'info' });
        }
        await photoUploadQueueRef.current;
        if (lastPhotoUploadFailureRef.current) {
          throw new Error(`Some photos did not upload: ${lastPhotoUploadFailureRef.current} Retry those photos before leaving this draft.`);
        }
        const latest = reportRef.current?.id === report.id ? reportRef.current : report;
        await saveDraftImmediately(latest);
      } catch (error: any) {
        setStatusMessage({
          text: `${error.message || 'Cloud save failed.'} Stay on this report until the draft has saved successfully.`,
          type: 'error',
        });
        return;
      }
    }
    setReport(null);
    reportRef.current = null;
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
      const current = reportRef.current?.id === report.id ? reportRef.current : report;
      const merged = mergeCsvCommentary(current.areas, parsed.areas);
      const summary = `${merged.updatedItems} existing items updated, ${merged.addedItems} items and ${merged.addedAreas} areas added`;
      if (!window.confirm(`Apply CSV commentary? ${summary}. Existing area/item IDs, photographs and unrelated fields will be preserved. Blank CSV values do not erase existing fields.`)) return;
      const next = { ...current, areas: merged.areas };
      reportRef.current = next;
      setReport(next);
      await cacheReport(next).catch(() => undefined);
      setViewMode('commentary');
      setStatusMessage({ text: `CSV applied safely: ${summary}.`, type: 'success' });
    } catch (error: any) {
      setStatusMessage({ text: error.message || 'Unable to import CSV.', type: 'error' });
    }
  };

  const enqueuePhotoWork = (count: number, work: () => Promise<void>): Promise<void> => {
    queuedPhotoCountRef.current += count;
    setPendingPhotoUploads(queuedPhotoCountRef.current);

    return new Promise<void>((resolve) => {
      photoUploadQueueRef.current = photoUploadQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          try {
            await work();
          } finally {
            queuedPhotoCountRef.current = Math.max(0, queuedPhotoCountRef.current - count);
            setPendingPhotoUploads(queuedPhotoCountRef.current);
            if (queuedPhotoCountRef.current === 0) {
              const latest = reportRef.current;
              if (latest?.id) {
                await cacheReport({
                  ...latest,
                  updatedAt: serverVersionsRef.current[latest.id] || latest.updatedAt,
                }).catch(() => undefined);
              }
            }
            resolve();
          }
        });
    });
  };

  const mergePhotoMutationResult = (updated: ReportData) => {
    acknowledgeReport(updated);
    // Update the imperative snapshot immediately; React may batch the state
    // update until after the next queued write begins.
    const active = reportRef.current;
    if (active && active.id === updated.id) {
      reportRef.current = mergeCloudPhotoMutation(active, updated);
    }
    setReport((current) => {
      if (!current || current.id !== updated.id) return current;
      const merged = mergeCloudPhotoMutation(current, updated);
      reportRef.current = merged;
      return merged;
    });
  };

  const handleUploadCoverPhoto = async (file: File) => {
    const activeReport = reportRef.current;
    if (!activeReport?.id || activeReport.status === 'completed') return;
    return enqueuePhotoWork(1, async () => {
      try {
        await saveDraftImmediately(activeReport);
        const processed = await processInspectionImage(file);
        await queueOfflineCover(activeReport.id!, processed.blob);
        setPendingOfflineOperations(await countOfflineOperations());
        if (!navigator.onLine) {
          setStatusMessage({ text: 'Cover photo safely queued on this device until connectivity returns.', type: 'info' });
          return;
        }
        const updated = normalizeReport(await queueReportWrite(() =>
          api.uploadCoverPhoto(activeReport.id!, processed.blob)
        ));
        mergePhotoMutationResult(updated);
        await removeOfflineOperation(`cover-${activeReport.id}`);
        setPendingOfflineOperations(await countOfflineOperations());
        setPhotoFailures((previous) => previous.filter((item) => item.name !== file.name));
        setStatusMessage({ text: 'Cover photo uploaded and verified.', type: 'success' });
      } catch (error: any) {
        const failure = error.message || 'Unable to upload cover photo.';
        lastPhotoUploadFailureRef.current = failure;
        setPhotoFailures((previous) => [...previous.filter((item) => item.name !== file.name),
          { name: file.name, message: failure, queued: true }]);
        setStatusMessage({ text: `Cover photo: ${failure}. Retry queued uploads when online.`, type: 'error' });
        setPendingOfflineOperations(await countOfflineOperations().catch(() => 0));
      }
    });
  };

  const handleUploadPhotos = async (
    files: File[],
    areaName: string,
    itemId?: string,
    areaId?: string
  ) => {
    const activeReport = reportRef.current;
    if (!activeReport?.id || activeReport.status === 'completed' || files.length === 0) return;
    setStatusMessage({
      text: `Processing ${files.length} photograph(s). Each processed file is queued safely before upload.`,
      type: 'info',
    });

    return enqueuePhotoWork(files.length, async () => {
      try {
        const latestBeforeSave = reportRef.current;
        if (!latestBeforeSave?.id || latestBeforeSave.status === 'completed') return;
        const savedDraft = await saveDraftImmediately(latestBeforeSave);
        const latestTargetReport = reportRef.current || savedDraft;
        const targetArea = areaId
          ? latestTargetReport.areas.find((area) => area.id === areaId)
          : latestTargetReport.areas.find((area) => normalizeAreaName(area.name) === normalizeAreaName(areaName));
        if (!targetArea) throw new Error('The selected photo category no longer exists. Reassign the files and retry.');
        const item = itemId ? targetArea.items.find((candidate) => candidate.id === itemId) : undefined;
        if (itemId && !item) throw new Error('The selected reporting item no longer exists. Reassign the files and retry.');

        let nextAreaPhotoIndex = latestTargetReport.photos
          .filter((photo) => normalizeAreaName(photo.areaName) === normalizeAreaName(targetArea.name))
          .reduce((max, photo) => Math.max(max, photo.photoIndex || 0), 0);
        let uploaded = 0;
        let queued = 0;
        const failures: Array<{ name: string; message: string; queued: boolean }> = [];

        for (const file of files) {
          let processed: Awaited<ReturnType<typeof processInspectionImage>>;
          try {
            processed = await processInspectionImage(file);
          } catch (error) {
            failures.push({
              name: file.name,
              message: error instanceof Error ? error.message : 'Unable to process image.',
              queued: false,
            });
            continue;
          }
          const photoIndex = ++nextAreaPhotoIndex;
          const photoId = crypto.randomUUID();
          const metadata = {
            id: photoId,
            name: item
              ? `${targetArea.name}: ${item.name || 'Reporting item'} (photo ${photoIndex})`
              : `${targetArea.name}: Category photo ${photoIndex}`,
            areaName: targetArea.name,
            itemId: item?.id,
            itemName: item?.name,
            photoIndex,
            isCover: false,
          };

          try {
            // Durable write-ahead outbox: if the upload succeeds but the
            // response is lost, offline replay uses the same idempotent ID.
            await queueOfflinePhoto(latestTargetReport.id!, processed.blob, metadata);
          } catch (error) {
            failures.push({
              name: file.name,
              message: error instanceof Error ? error.message : 'Unable to store the upload for recovery.',
              queued: false,
            });
            continue;
          }

          if (!navigator.onLine) {
            queued += 1;
            const pendingPhoto = optimisticOfflinePhoto(metadata, processed.blob);
            setReport((current) => {
              if (!current || current.id !== latestTargetReport.id) return current;
              if (current.photos.some((photo) => photo.id === pendingPhoto.id)) return current;
              const next = { ...current, photos: [...current.photos, pendingPhoto] };
              reportRef.current = next;
              return next;
            });
            continue;
          }

          try {
            const updated = normalizeReport(await queueReportWrite(() =>
              api.uploadPhoto(latestTargetReport.id!, processed.blob, metadata)
            ));
            mergePhotoMutationResult(updated);
            await removeOfflineOperation(`photo-${photoId}`);
            uploaded += 1;
            setPhotoFailures((previous) => previous.filter((failed) => failed.name !== file.name));
          } catch (error) {
            queued += 1;
            failures.push({
              name: file.name,
              message: error instanceof Error ? error.message : 'Upload failed.',
              queued: true,
            });
            const pendingPhoto = optimisticOfflinePhoto(metadata, processed.blob);
            setReport((current) => {
              if (!current || current.id !== latestTargetReport.id) return current;
              if (current.photos.some((photo) => photo.id === pendingPhoto.id)) return current;
              const next = { ...current, photos: [...current.photos, pendingPhoto] };
              reportRef.current = next;
              return next;
            });
          }
        }

        setPendingOfflineOperations(await countOfflineOperations());
        if (failures.length) {
          lastPhotoUploadFailureRef.current = failures[0].message;
          setPhotoFailures((previous) => {
            const retryNames = new Set(files.map((file) => file.name));
            return [...previous.filter((item) => !retryNames.has(item.name)), ...failures];
          });
          setStatusMessage({
            text: `${uploaded} photo(s) uploaded, ${queued} queued for retry, ${failures.length} file(s) need attention. See the failed file list.`,
            type: 'error',
          });
        } else {
          setStatusMessage({
            text: navigator.onLine
              ? `${uploaded} photograph(s) uploaded to ${item?.name || targetArea.name}.`
              : `${queued} photograph(s) safely queued on this device for upload when online.`,
            type: navigator.onLine ? 'success' : 'info',
          });
        }
      } catch (error: any) {
        const failure = error.message || 'Unable to process photographs.';
        lastPhotoUploadFailureRef.current = failure;
        setStatusMessage({ text: failure, type: 'error' });
      }
    });
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!report?.id || report.status === 'completed') return;
    try {
      const savedDraft = await saveDraftImmediately(report);
      const updated = normalizeReport(await queueReportWrite(() =>
        api.deletePhoto(savedDraft.id!, photoId)
      ));
      mergePhotoMutationResult(updated);
      setStatusMessage({ text: 'Photo deleted.', type: 'info' });
    } catch (error: any) {
      setStatusMessage({ text: error.message || 'Unable to delete photo.', type: 'error' });
    }
  };

  const renderPdf = async (): Promise<Blob> => {
    if (!report) throw new Error('No report is open.');
    await photoUploadQueueRef.current;
    if (await countOfflineOperations() > 0) {
      throw new Error('Offline edits or photographs are still queued. Synchronise pending work before exporting the report.');
    }
    if (lastPhotoUploadFailureRef.current) {
      throw new Error('Some photos have not uploaded. Retry the failed photos before exporting the report.');
    }
    const current = reportRef.current;
    const latest = current && current.id === report.id ? current : report;
    return generateReportPdf(latest, (message) => setExportProgressText(message));
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
    if (!navigator.onLine) {
      setStatusMessage({ text: 'Reconnect before finalising. Offline work is preserved locally until it can be synced.', type: 'error' });
      return;
    }
    setIsCompleting(true);
    setExportProgressText('Finishing photo uploads...');
    try {
      await photoUploadQueueRef.current;
      if (await countOfflineOperations() > 0) {
        throw new Error('Offline edits or photographs remain queued. Synchronise them before finalising the report.');
      }
      if (lastPhotoUploadFailureRef.current) {
        throw new Error('Some photos have not uploaded. Retry failed photos before finalising the report.');
      }
      const latest = reportRef.current?.id === report.id ? reportRef.current : report;
      setExportProgressText('Saving final report data...');
      const validationIssues = validateReportForFinalization(latest);
      if (validationIssues.length > 0) {
        if (validationIssues.some((issue) => issue.code.startsWith('photo-') || issue.code.includes('photo'))) {
          setViewMode('photos');
        } else {
          setViewMode('commentary');
        }
        throw new Error(reportValidationMessage(validationIssues, 'Report cannot be finalised'));
      }

      const savedDraft = await saveDraftImmediately(latest);
      const blob = await generateReportPdf(savedDraft, (message) => setExportProgressText(message));
      const maxCompletedPdfBytes = 90 * 1024 * 1024;
      if (blob.size > maxCompletedPdfBytes) {
        throw new Error(
          `Generated PDF is ${(blob.size / (1024 * 1024)).toFixed(1)} MB and exceeds the 90 MB completed-report limit.`
        );
      }
      setExportProgressText('Storing completed PDF...');
      const completed = normalizeReport(await queueReportWrite(() => api.completeReport(savedDraft.id!, blob)));
      acknowledgeReport(completed);
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
      if(error?.code==='proinspect-ingest-failed' && report.id){
        try{
          const completedCloud=normalizeReport(await api.getReport(report.id));
          if(completedCloud.id)serverVersionsRef.current[completedCloud.id]=completedCloud.updatedAt;
          setReport(completedCloud);
          reportRef.current=completedCloud;
          setViewMode('actions');
          await cacheReport(completedCloud).catch(()=>undefined);
          await refreshSelectedProperty();
          setStatusMessage({text:'Report finalised and the immutable PDF is stored, but ProInspect platform sync is pending. Use “Sync to ProInspect” to retry.',type:'info'});
        }catch{
          setStatusMessage({text:'Report reached the platform-sync stage but current cloud status could not be reloaded. Refresh before retrying.',type:'error'});
        }
      }else{
        setStatusMessage({ text: error.message || 'Unable to finalise report.', type: 'error' });
      }
    } finally {
      setIsCompleting(false);
      setExportProgressText(null);
    }
  };


  const handleSyncPlatform = async () => {
    if(!report?.id || report.status!=='completed' || !report.integrationContext)return;
    setIsSyncingPlatform(true);
    try{
      await api.publishCompletedReport(report.id);
      setStatusMessage({text:'Completed report is synced to the canonical ProInspect property record.',type:'success'});
    }catch(error:any){
      setStatusMessage({text:(error.message||'Unable to sync this report to ProInspect.')+' The immutable Report Tool PDF remains stored and can be retried.',type:'error'});
    }finally{
      setIsSyncingPlatform(false);
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
          onCreateFromTemplate={handleCreateReportFromTemplate}
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
              {isOffline
                ? `Offline • ${pendingOfflineOperations} pending`
                : isSaving
                ? 'Saving to cloud...'
                : pendingOfflineOperations > 0
                ? `Syncing • ${pendingOfflineOperations} pending`
                : lastSavedTime
                ? `Saved ${lastSavedTime}`
                : 'Cloud draft'}
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

      {unresolvedConflict && unresolvedConflict.reportId === report.id && (
        <div role="alert" className="px-4 lg:px-8 py-3 border-b border-amber-300 bg-amber-50 text-amber-950 text-sm">
          <p className="font-bold">Cloud save paused: overlapping edits detected</p>
          <p className="mt-1">Both copies changed: {unresolvedConflict.fields.slice(0, 6).join(', ')}. Your local edits remain cached. Choose the version to retain.</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <button type="button" onClick={() => void resolveConflict(true)} className="rounded bg-amber-900 text-white px-3 py-1.5 font-semibold">Keep my edits</button>
            <button type="button" onClick={() => void resolveConflict(false)} className="rounded border border-amber-800 px-3 py-1.5 font-semibold">Load cloud version</button>
          </div>
        </div>
      )}

      {pendingOfflineOperations > 0 && (
        <div className="px-4 lg:px-8 py-3 border-b border-blue-200 bg-blue-50 text-blue-950 text-sm flex flex-wrap items-center gap-3">
          <span className="font-semibold">{pendingOfflineOperations} unsynchronised edit/photo operation(s) saved on this device.</span>
          <button type="button"
            disabled={isSyncingOffline || isUploadingPhotos || isOffline || Boolean(unresolvedConflict)}
            onClick={() => void retryOfflineSyncRef.current()}
            className="rounded bg-blue-800 px-3 py-1.5 font-semibold text-white disabled:opacity-50">
            {isSyncingOffline ? 'Synchronising…' : 'Retry cloud synchronisation'}
          </button>
        </div>
      )}
      {photoFailures.length > 0 && (
        <div role="alert" className="px-4 lg:px-8 py-3 border-b border-red-200 bg-red-50 text-red-900 text-xs">
          <p className="font-bold">Photographs needing attention ({photoFailures.length})</p>
          <ul className="mt-1 list-disc pl-5">
            {photoFailures.slice(0, 12).map((item, index) => (
              <li key={item.name + index}>
                {item.name}: {item.message}. {item.queued ? 'Stored for retry using the button above.' : 'Re-select this source image after correcting the issue.'}
              </li>
            ))}
          </ul>
        </div>
      )}

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
          <div className={`max-w-6xl mx-auto p-4 md:p-6 ${
            ['Entry', 'Routine', 'Exit'].includes(report.details.reportType)
              ? 'min-h-[calc(100vh-125px)]'
              : 'h-[calc(100vh-125px)]'
          }`}>
            {['Entry', 'Routine', 'Exit'].includes(report.details.reportType) ? (
              <CommentaryEditor
                details={report.details}
                areas={report.areas}
                photos={report.photos}
                onChangeDetails={(details) => setReport((current) => current ? { ...current, details } : current)}
                onChangeAreas={(areas) => setReport((current) => current ? { ...current, areas } : current)}
                onChangePhotos={(photos) => setReport((current) => current ? { ...current, photos } : current)}
                onUploadPhotos={handleUploadPhotos}
              />
            ) : isKeyReceiptTemplate(report.details.reportType) ? (
              <KeyReceiptEditor
                details={report.details}
                areas={report.areas}
                photos={report.photos}
                onChangeDetails={(details) => setReport((current) => current ? { ...current, details } : current)}
                onChangeAreas={(areas) => setReport((current) => current ? { ...current, areas } : current)}
                onChangePhotos={(photos) => setReport((current) => current ? { ...current, photos } : current)}
                onUploadPhotos={handleUploadPhotos}
              />
            ) : isBuildingManagementTemplate(report.details.reportType) ? (
              <BuildingManagementReportEditor
                details={report.details}
                areas={report.areas}
                photos={report.photos}
                pendingPhotoUploads={pendingPhotoUploads}
                onUploadPhotos={handleUploadPhotos}
                onChangeDetails={(details) => setReport((current) => current ? { ...current, details } : current)}
                onChangeAreas={(areas) => setReport((current) => current ? { ...current, areas } : current)}
                onChangePhotos={(photos) => setReport((current) => current ? { ...current, photos } : current)}
              />
            ) : (
              <ExtendedReportEditor
                details={report.details}
                areas={report.areas}
                photos={report.photos}
                onChangeDetails={(details) => setReport((current) => current ? { ...current, details } : current)}
                onChangeAreas={(areas) => setReport((current) => current ? { ...current, areas } : current)}
                onChangePhotos={(photos) => setReport((current) => current ? { ...current, photos } : current)}
                onUploadPhotos={handleUploadPhotos}
              />
            )}
          </div>
        )}

        {viewMode === 'photos' && !completed && (
          <div className="max-w-6xl mx-auto p-4 md:p-6 min-h-[calc(100vh-125px)]">
            <PhotoManager
              photos={report.photos}
              areas={report.areas}
              coverPhotoUrl={report.details.coverPhotoUrl}
              isUploading={isUploadingPhotos}
              pendingUploadCount={pendingPhotoUploads}
              onUploadPhotos={handleUploadPhotos}
              onUploadCoverPhoto={handleUploadCoverPhoto}
              onUpdatePhotos={(photos) => setReport((current) => current ? { ...current, photos } : current)}
              onDeletePhoto={handleDeletePhoto}
              linkToItems={true}
              requireItemLink={isKeyReceiptTemplate(report.details.reportType)}
              showCoverPhoto={!isKeyReceiptTemplate(report.details.reportType)}
              itemSelectorPlaceholder={isKeyReceiptTemplate(report.details.reportType) ? 'Select key / access device' : 'Select reporting item'}
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
              onSyncPlatform={handleSyncPlatform}
              isSyncingPlatform={isSyncingPlatform}
              isExporting={isExportingPdf}
              isCompleting={isCompleting}
              onSaveTemplate={handleSaveTemplate}
            />
          </div>
        )}
      </main>
    </div>
  );
}
