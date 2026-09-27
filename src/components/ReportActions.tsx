import React, { useState } from 'react';
import { Download, Mail } from 'lucide-react';
import { ReportData } from '../types/report';

interface Props {
  report: ReportData;
  onDownload: () => void;
  isExporting: boolean;
}

export const ReportActions: React.FC<Props> = ({ report, onDownload, isExporting }) => {
  const [recipient, setRecipient] = useState('');
  const details = report.details;
  const missing = [
    !details.propertyAddress && 'property address',
    !details.inspectionDate && 'inspection date',
    !details.inspectingAgent && 'inspector',
  ].filter(Boolean) as string[];

  const prepareEmail = () => {
    const subject = `${details.reportType} Report - ${details.propertyAddress || 'Property'}`;
    const body = `Please find attached the completed ${details.reportType.toLowerCase()} report for ${details.propertyAddress || 'the property'}, inspected on ${details.inspectionDate || 'the recorded inspection date'}.

Regards,
ProInspect`;
    window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="max-w-3xl mx-auto bg-white border border-neutral-200 rounded-xl p-5 shadow-xs space-y-4">
      <div>
        <h3 className="font-bold text-neutral-900">Review & send</h3>
        <p className="text-xs text-neutral-500 mt-1">
          {report.areas.length} areas • {report.photos.length} photos
        </p>
      </div>
      {missing.length > 0 && (
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3">
          Before finalising, complete: {missing.join(', ')}.
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onDownload}
          disabled={isExporting}
          className="px-4 py-2 bg-[#0a2540] text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50"
        >
          <Download className="w-4 h-4" /> {isExporting ? 'Preparing PDF...' : 'Download PDF'}
        </button>
      </div>
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
            className="px-4 py-2 border border-neutral-300 bg-white rounded-lg text-sm font-bold flex items-center gap-2"
          >
            <Mail className="w-4 h-4" /> Prepare Email
          </button>
        </div>
        <p className="text-[11px] text-neutral-500 mt-2">
          The PDF is downloaded separately and attached in your email application.
        </p>
      </div>
    </div>
  );
};
