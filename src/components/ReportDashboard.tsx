import React, { useState } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { ReportData, ReportType } from '../types/report';

interface Props {
  reports: ReportData[];
  onCreate: (type: ReportType) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

export const ReportDashboard: React.FC<Props> = ({ reports, onCreate, onOpen, onDelete }) => {
  const [type, setType] = useState<ReportType>('Entry');

  return (
    <main className="flex-1 bg-neutral-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <section className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs">
          <h2 className="text-lg font-bold text-neutral-900">Create report</h2>
          <p className="text-sm text-neutral-500 mt-1">Start a blank V1 property report.</p>
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ReportType)}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="Entry">Entry Condition Report</option>
              <option value="Routine">Routine Inspection Report</option>
              <option value="Exit">Exit Condition Report</option>
            </select>
            <button
              onClick={() => onCreate(type)}
              className="px-4 py-2 rounded-lg bg-[#0a2540] text-white text-sm font-bold flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Create Report
            </button>
          </div>
        </section>

        <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-neutral-200">
            <h2 className="font-bold text-neutral-900">Draft reports</h2>
          </div>
          {reports.length === 0 ? (
            <div className="p-10 text-center text-neutral-500 text-sm">No draft reports yet.</div>
          ) : (
            <div className="divide-y divide-neutral-200">
              {reports
                .slice()
                .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
                .map((report) => (
                  <div key={report.id} className="p-4 flex items-center justify-between gap-4">
                    <button onClick={() => onOpen(report.id!)} className="text-left flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-neutral-500 shrink-0" />
                        <span className="font-bold text-neutral-900 truncate">
                          {report.details.propertyAddress || 'Untitled property'}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-500 mt-1 ml-6">
                        {report.details.reportType} • {report.details.inspectionDate || 'No inspection date'}
                      </div>
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onOpen(report.id!)}
                        className="px-3 py-1.5 text-xs font-bold border border-neutral-300 rounded-lg bg-white"
                      >
                        Continue
                      </button>
                      <button
                        onClick={() => onDelete(report.id!)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                        title="Delete draft"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
};
