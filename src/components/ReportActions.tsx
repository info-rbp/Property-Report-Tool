import React, { useState } from 'react';
import { CheckCircle2, Download, Mail } from 'lucide-react';
import { isKeyReceiptTemplate, reportInstanceLabel } from '../data/reportCatalogue';
import { validateReportForFinalization } from '../lib/reportValidation';
import { ReportData } from '../types/report';

interface Props {
  report: ReportData;
  onDownload: () => void;
  onComplete: () => void;
  onDownloadCompleted: () => void;
  isExporting: boolean;
  isCompleting: boolean;
  canEdit: boolean;
}

export const ReportActions: React.FC<Props> = ({
  report,
  onDownload,
  onComplete,
  onDownloadCompleted,
  isExporting,
  isCompleting,
  canEdit,
}) => {
  const [recipient, setRecipient] = useState('');
  const [confirmingFinalisation, setConfirmingFinalisation] = useState(false);
  const details = report.details;
  const completed = report.status === 'completed';
  const superseded = report.status === 'superseded';
  const validationIssues = report.status === 'draft' ? validateReportForFinalization(report) : [];
  const validationMessages = Array.from(new Set(validationIssues.map((issue) => issue.message)));
  const keyItemCount = report.areas.reduce((total, area) => total + area.items.length, 0);

  const prepareEmail = () => {
    const label = reportInstanceLabel(details);
    const subject = `${label} - ${details.propertyAddress || 'Property'}`;
    const body = isKeyReceiptTemplate(details.reportType)
      ? `Please find attached the completed ${label.toLowerCase()} for ${details.propertyAddress || 'the property'}, recording the key handover on ${details.inspectionDate || 'the recorded receipt date'}.

Regards,
ProInspect`
      : `Please find attached the completed ${label.toLowerCase()} for ${details.propertyAddress || 'the property'}, inspected on ${details.inspectionDate || 'the recorded inspection date'}.

Regards,
ProInspect`;
    window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="max-w-3xl mx-auto bg-white border border-neutral-200 rounded-xl p-5 shadow-xs space-y-4">
      <div>
        <h3 className="font-bold text-neutral-900">Review & send</h3>
        <p className="text-xs text-neutral-500 mt-1">
          {isKeyReceiptTemplate(report.details.reportType)
            ? `${keyItemCount} key/access item${keyItemCount === 1 ? '' : 's'} • ${completed ? 'Completed' : 'Draft'}`
            : `${report.areas.length} areas • ${report.photos.length} photos • ${completed ? 'Completed' : 'Draft'}`}
        </p>
      </div>

      {!completed && validationMessages.length > 0 && (
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3">
          <div className="font-bold">Resolve before finalising:</div>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            {validationMessages.slice(0, 5).map((message) => <li key={message}>{message}</li>)}
          </ul>
          {validationMessages.length > 5 && (
            <div className="mt-1">+{validationMessages.length - 5} additional validation issue(s).</div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {completed || superseded ? (
          <button
            onClick={onDownloadCompleted}
            className="px-4 py-2 bg-[#0a2540] text-white rounded-lg text-sm font-bold flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Download Saved PDF
          </button>
        ) : (
          <>
            <button
              onClick={onDownload}
              disabled={isExporting || isCompleting}
              className="px-4 py-2 border border-neutral-300 bg-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> {isExporting ? 'Preparing...' : 'Download Draft PDF'}
            </button>
            {canEdit && (
              <button
                onClick={() => setConfirmingFinalisation(true)}
                disabled={isExporting || isCompleting || validationIssues.length > 0}
                className="px-4 py-2 bg-[#0a2540] text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isCompleting ? 'Finalising...' : 'Finalise & Store PDF'}
              </button>
            )}
          </>
        )}
      </div>

      {completed && (
        <div className="border-t border-neutral-200 pt-4">
          <label className="block text-xs font-bold text-neutral-700 mb-1">Recipient email</label>
          <div className="flex gap-2">
            <input
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="name@example.com"
              className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={prepareEmail}
              disabled={!recipient.trim()}
              className="px-4 py-2 border border-neutral-300 bg-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50"
            >
              <Mail className="w-4 h-4" /> Prepare Email
            </button>
          </div>
          <p className="text-[11px] text-neutral-500 mt-2">
            Email is only prepared after finalisation. Attach the stored PDF before sending.
          </p>
        </div>
      )}

      {superseded && (
        <div className="border-t border-neutral-200 pt-4 text-xs bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-neutral-700">
          This is a superseded issued report. Retain it for audit history; use the replacement report for current distribution.
        </div>
      )}

      {confirmingFinalisation && !completed && !superseded && (
        <div className="border border-amber-300 bg-amber-50 rounded-lg p-4 space-y-3">
          <div className="font-bold text-amber-950">Confirm finalisation</div>
          <p className="text-xs text-amber-900">
            Finalising creates the issued PDF and makes this report immutable. If a correction is later required,
            the original will be retained and a separate correction report must be issued.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setConfirmingFinalisation(false);
                onComplete();
              }}
              disabled={isCompleting || validationIssues.length > 0}
              className="px-4 py-2 bg-[#0a2540] text-white rounded-lg text-sm font-bold disabled:opacity-50"
            >
              Confirm Finalisation
            </button>
            <button
              onClick={() => setConfirmingFinalisation(false)}
              disabled={isCompleting}
              className="px-4 py-2 border border-neutral-300 bg-white rounded-lg text-sm font-bold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
