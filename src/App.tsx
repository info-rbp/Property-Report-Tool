import React, { useState, useEffect, useRef } from 'react';
import { createBlankReport, normalizeReport } from './data/reportTemplates';
import { ReportData, ReportType } from './types/report';
import { ReportDocument } from './components/ReportDocument';
import { ProInspectLogo } from './components/ProInspectLogo';
import { CommentaryEditor } from './components/CommentaryEditor';
import { PhotoManager } from './components/PhotoManager';
import { GoogleWorkspaceModal } from './components/GoogleWorkspaceModal';
import { MfaVerificationModal } from './components/MfaVerificationModal';
import { ReportDashboard } from './components/ReportDashboard';
import { ReportActions } from './components/ReportActions';
import { exportElementToPdf } from './lib/pdfExporter';
import { parseLocalSpreadsheetFile, downloadStarterCsv } from './lib/spreadsheetParser';
import { initAuth, googleSignIn, logout } from './lib/auth';
import { User, MultiFactorResolver } from 'firebase/auth';
import {
  FileSpreadsheet,
  Folder,
  Download,
  Eye,
  Edit3,
  Image as ImageIcon,
  CheckCircle2,
  FileDown,
  RefreshCw,
  LogOut,
  RotateCcw,
  FileText,
  AlertCircle
} from 'lucide-react';

const STORAGE_KEY = 'proinspect_reports_v1';
const LEGACY_STORAGE_KEY = 'proinspect_report_draft_wa_v2';

export default function App() {
  const [reports, setReports] = useState<ReportData[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.map(normalizeReport);
      }
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy);
        if (parsedLegacy?.details && Array.isArray(parsedLegacy.areas)) {
          return [normalizeReport(parsedLegacy)];
        }
      }
    } catch (e) {
      console.warn('Failed to load draft reports from localStorage:', e);
    }
    return [];
  });
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [report, setReport] = useState<ReportData>(() => createBlankReport('Entry'));
  const [viewMode, setViewMode] = useState<'preview' | 'commentary' | 'photos' | 'actions'>('preview');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [hasGoogleAuth, setHasGoogleAuth] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportProgressText, setExportProgressText] = useState<string | null>(null);
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [isMfaModalOpen, setIsMfaModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
    } catch (e) {
      try {
        const lightweight = reports.map((item) => ({
          ...item,
          photos: item.photos.map((photo) => ({ ...photo, dataUrl: undefined })),
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweight));
      } catch (inner) {
        console.warn('Failed to save draft report list:', inner);
      }
    }
  }, [reports]);

  useEffect(() => {
    if (!activeReportId) return;
    const updated = { ...report, id: activeReportId, updatedAt: new Date().toISOString() };
    setReports((current) => current.map((item) => item.id === activeReportId ? updated : item));
    setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  }, [report, activeReportId]);

  const handleCreateReport = (type: ReportType) => {
    const created = createBlankReport(type);
    setReports((current) => [created, ...current]);
    setReport(created);
    setActiveReportId(created.id!);
    setViewMode('commentary');
  };

  const handleOpenReport = (id: string) => {
    const selected = reports.find((item) => item.id === id);
    if (!selected) return;
    setReport(normalizeReport(selected));
    setActiveReportId(id);
    setViewMode('preview');
  };

  const handleDeleteReport = (id: string) => {
    if (!confirm('Delete this draft report? This cannot be undone.')) return;
    setReports((current) => current.filter((item) => item.id !== id));
    if (activeReportId === id) setActiveReportId(null);
  };

  const handleBackToDashboard = () => {
    setActiveReportId(null);
    setStatusMessage(null);
  };

  const handleResetToDefault = () => {
    if (!activeReportId) return;
    if (confirm('Reset this report to a blank template? All current edits will be replaced.')) {
      const blank = createBlankReport(report.details.reportType);
      blank.id = activeReportId;
      blank.createdAt = report.createdAt || blank.createdAt;
      setReport(blank);
      setStatusMessage({ text: 'Report reset to a blank template', type: 'info' });
    }
  };

  // Initialize Auth State Listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setCurrentUser(user);
        setHasGoogleAuth(Boolean(token));
      },
      () => {
        setCurrentUser(null);
        setHasGoogleAuth(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setStatusMessage(null);
    try {
      const res = await googleSignIn();
      if (!res) return;

      if ('mfaRequired' in res && res.mfaRequired) {
        setMfaResolver(res.resolver);
        setIsMfaModalOpen(true);
        setStatusMessage({
          text: 'Multi-factor authentication required. Please enter your verification code.',
          type: 'info',
        });
      } else if ('user' in res) {
        setCurrentUser(res.user);
        setHasGoogleAuth(true);
        setStatusMessage({ text: 'Connected to Google Workspace successfully!', type: 'success' });
      }
    } catch (err: any) {
      console.error('Sign in error:', err);
      setStatusMessage({ text: err.message || 'Google Sign-in failed', type: 'error' });
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleMfaSuccess = (user: User) => {
    setCurrentUser(user);
    setHasGoogleAuth(true);
    setIsMfaModalOpen(false);
    setMfaResolver(null);
    setStatusMessage({
      text: 'Multi-factor verification verified! Google Workspace connected.',
      type: 'success',
    });
  };

  const handleGoogleSignOut = async () => {
    await logout();
    setCurrentUser(null);
    setHasGoogleAuth(false);
    setMfaResolver(null);
    setIsMfaModalOpen(false);
    setStatusMessage({ text: 'Signed out from Google', type: 'info' });
  };

  // Import local CSV/XLSX
  const handleLocalSpreadsheetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const parsed = await parseLocalSpreadsheetFile(file);
      setReport((prev) => ({
        ...prev,
        areas: parsed.areas,
      }));
      setStatusMessage({
        text: `Loaded ${parsed.areas.length} inspection areas from "${file.name}"!`,
        type: 'success',
      });
      setViewMode('commentary');
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to read spreadsheet file', type: 'error' });
    }
  };

  // Trigger PDF export
  const handleExportPdf = async () => {
    const container = document.getElementById('report-print-container');
    if (!container) {
      setStatusMessage({ text: 'Please switch to Report Preview tab first', type: 'error' });
      return;
    }

    setIsExportingPdf(true);
    setExportProgressText('Preparing report document...');
    try {
      const safeAddress = (report.details.propertyAddress || 'Property').trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const safeDate = (report.details.inspectionDate || new Date().toISOString().slice(0, 10)).replace(/[^0-9-]/g, '');
      const safeFilename = `ProInspect_${report.details.reportType}_Report_${safeAddress}_${safeDate}.pdf`;
      await exportElementToPdf(container, safeFilename, (msg) => {
        setExportProgressText(msg);
      });
      setStatusMessage({ text: 'PDF exported successfully!', type: 'success' });
    } catch (err: any) {
      console.error('PDF error:', err);
      setStatusMessage({ text: err.message || 'Failed to export PDF', type: 'error' });
    } finally {
      setIsExportingPdf(false);
      setExportProgressText(null);
    }
  };

  if (!activeReportId) {
    return (
      <div className="min-h-screen bg-neutral-100 flex flex-col text-neutral-900 font-sans">
        <header className="bg-white border-b border-neutral-200 px-4 lg:px-8 py-3 flex items-center justify-between shadow-xs">
          <ProInspectLogo size="sm" showTagline={false} />
          <span className="text-xs font-semibold text-neutral-500">Property Reports V1</span>
        </header>
        <ReportDashboard reports={reports} onCreate={handleCreateReport} onOpen={handleOpenReport} onDelete={handleDeleteReport} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col text-neutral-900 font-sans">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-40 px-4 lg:px-8 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-4">
          <ProInspectLogo size="sm" showTagline={false} />
          <div className="hidden sm:block border-l border-neutral-300 pl-4">
            <h1 className="text-sm font-bold tracking-tight text-neutral-800 leading-tight">
              Property Condition Report Generator
            </h1>
            <p className="text-[11px] text-neutral-500 font-medium">
              Entry, Routine & Exit Reports • Spreadsheet Commentary • Drive Photos • PDF Export
            </p>
          </div>
        </div>

        {/* Action Controls & Google Account */}
        <div className="flex items-center gap-2.5">
          {/* Auto-save indicator */}
          {lastSavedTime && (
            <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-neutral-500 font-medium bg-neutral-50 border border-neutral-200 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Saved locally ({lastSavedTime})</span>
            </div>
          )}

          {/* Reset Template Button */}
          <button
            onClick={handleResetToDefault}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 text-xs text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded-lg transition-colors"
            title="Reset report to sample template"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Draft</span>
          </button>
          <button
            onClick={handleBackToDashboard}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
            title="Back to draft reports"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Reports</span>
          </button>

          {/* Google Auth Status / Button */}
          {currentUser && hasGoogleAuth ? (
            <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-full px-3 py-1 text-xs">
              {currentUser.photoURL ? (
                <img src={currentUser.photoURL} alt="User" className="w-5 h-5 rounded-full" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">
                  {currentUser.displayName?.[0] || 'U'}
                </div>
              )}
              <span className="font-medium text-neutral-700 max-w-[120px] truncate hidden md:inline">
                {currentUser.displayName || currentUser.email}
              </span>
              <button
                onClick={handleGoogleSignOut}
                className="text-neutral-400 hover:text-neutral-700 ml-1"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleGoogleSignIn}
              disabled={isSigningIn}
              className="gsi-material-button text-xs font-semibold py-1.5 px-3 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-700 flex items-center gap-2 shadow-xs transition-all cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              <span>{isSigningIn ? 'Connecting...' : 'Connect Google Drive & Sheets'}</span>
            </button>
          )}

          {/* Export PDF Button */}
          <button
            onClick={() => {
              if (viewMode !== 'preview') setViewMode('preview');
              setTimeout(handleExportPdf, 100);
            }}
            disabled={isExportingPdf}
            className="px-4 py-2 bg-[#0a2540] hover:bg-[#07192c] text-white rounded-lg text-xs font-bold disabled:opacity-50 flex items-center gap-2 shadow-xs transition-all"
          >
            {isExportingPdf ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileDown className="w-4 h-4 text-cyan-400" />
            )}
            <span>{isExportingPdf ? 'Exporting PDF...' : 'Export PDF'}</span>
          </button>
        </div>
      </header>

      {/* Sub Bar with Quick Inputs & View Switcher */}
      <div className="bg-white border-b border-neutral-200 px-4 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg">
          <button
            onClick={() => setViewMode('preview')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
              viewMode === 'preview'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Report Document Preview
          </button>

          <button
            onClick={() => setViewMode('commentary')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
              viewMode === 'commentary'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            Commentary & Checklist ({report.areas.length} Areas)
          </button>

          <button
            onClick={() => setViewMode('photos')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
              viewMode === 'photos'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            Photos Gallery ({report.photos.length})
          </button>
          <button
            onClick={() => setViewMode('actions')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
              viewMode === 'actions' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Review & Send
          </button>
        </div>

        {/* Quick Data Connectors */}
        <div className="flex items-center gap-2 text-xs">
          {/* Drive & Sheets Hub Modal Trigger */}
          <button
            onClick={() => {
              if (!hasGoogleAuth) {
                handleGoogleSignIn().then(() => setIsWorkspaceModalOpen(true));
              } else {
                setIsWorkspaceModalOpen(true);
              }
            }}
            className="px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Folder className="w-3.5 h-3.5 text-blue-600" />
            Google Drive & Sheets
          </button>

          {/* Local Spreadsheet Upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-white border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 font-semibold flex items-center gap-1.5 transition-colors"
            title="Upload local .csv or .xlsx file"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Upload CSV / Excel
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
            onChange={handleLocalSpreadsheetUpload}
            className="hidden"
          />

          {/* Download CSV Template */}
          <button
            onClick={downloadStarterCsv}
            className="px-2.5 py-1.5 text-neutral-500 hover:text-neutral-800 text-xs font-medium flex items-center gap-1"
            title="Download blank spreadsheet template"
          >
            <Download className="w-3.5 h-3.5" />
            Template CSV
          </button>
        </div>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div
          className={`px-4 py-2.5 text-xs flex items-center justify-between ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200'
              : statusMessage.type === 'error'
              ? 'bg-red-50 text-red-800 border-b border-red-200'
              : 'bg-blue-50 text-blue-800 border-b border-blue-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="font-bold opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* PDF Export Progress Overlay */}
      {isExportingPdf && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-white text-center">
          <div className="bg-neutral-900 border border-neutral-700 p-6 rounded-2xl shadow-2xl max-w-sm w-full flex flex-col items-center gap-4">
            <RefreshCw className="w-8 h-8 animate-spin text-red-500" />
            <h3 className="font-bold text-base">Exporting High-Resolution PDF</h3>
            <p className="text-xs text-neutral-400">{exportProgressText || 'Rendering pages...'}</p>
            <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
              <div className="bg-red-600 h-full w-2/3 animate-pulse rounded-full" />
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Area */}
      <main className="flex-1 overflow-y-auto">
        {viewMode === 'preview' && (
          <div className="py-6">
            <div className="max-w-[210mm] mx-auto mb-4 px-4 flex justify-between items-center text-xs text-neutral-500">
              <span>Layout standard: Western Australia Form 1 (Residential Tenancies Act 1987 Section 27C(6))</span>
              <span>A4 Portrait • Print & PDF Ready</span>
            </div>
            <ReportDocument report={report} />
          </div>
        )}

        {viewMode === 'commentary' && (
          <div className="max-w-6xl mx-auto p-4 md:p-6 h-[calc(100vh-125px)]">
            <CommentaryEditor
              details={report.details}
              areas={report.areas}
              onChangeDetails={(details) => setReport((prev) => ({ ...prev, details }))}
              onChangeAreas={(areas) => setReport((prev) => ({ ...prev, areas }))}
            />
          </div>
        )}

        {viewMode === 'photos' && (
          <div className="max-w-6xl mx-auto p-4 md:p-6 h-[calc(100vh-125px)]">
            <PhotoManager
              photos={report.photos}
              areas={report.areas}
              onUpdatePhotos={(photos) => setReport((prev) => ({ ...prev, photos }))}
              onOpenDriveModal={() => {
                if (!hasGoogleAuth) {
                  handleGoogleSignIn().then(() => setIsWorkspaceModalOpen(true));
                } else {
                  setIsWorkspaceModalOpen(true);
                }
              }}
            />
          </div>
        )}
        {viewMode === 'actions' && (
          <div className="py-8 px-4">
            <ReportActions
              report={report}
              onDownload={() => {
                setViewMode('preview');
                setTimeout(handleExportPdf, 100);
              }}
              isExporting={isExportingPdf}
            />
          </div>
        )}
      </main>

      {/* Google Drive & Sheets Integration Modal */}
      <GoogleWorkspaceModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        onImportAreas={(importedAreas) => {
          setReport((prev) => ({ ...prev, areas: importedAreas }));
          setStatusMessage({
            text: `Imported commentary for ${importedAreas.length} inspection areas from Google Sheets!`,
            type: 'success',
          });
        }}
        onImportPhotos={(importedPhotos) => {
          setReport((prev) => ({ ...prev, photos: importedPhotos }));
          setStatusMessage({
            text: `Imported ${importedPhotos.length} photos from Google Drive folder!`,
            type: 'success',
          });
        }}
      />

      {/* MFA Verification Modal */}
      <MfaVerificationModal
        isOpen={isMfaModalOpen}
        resolver={mfaResolver}
        onSuccess={handleMfaSuccess}
        onCancel={() => {
          setIsMfaModalOpen(false);
          setMfaResolver(null);
        }}
      />
    </div>
  );
}
