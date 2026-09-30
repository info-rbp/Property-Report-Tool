import React, { useEffect, useState } from 'react';
import { Archive, ArrowLeft, Download, FileText, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { isKeyReceiptTemplate, REPORT_CATEGORIES, REPORT_TEMPLATES, reportLabel } from '../data/reportCatalogue';
import { PropertyRecord, ReportSummary, ReportType, UserRole } from '../types/report';

interface Props {
  property: PropertyRecord;
  reports: ReportSummary[];
  userRole: UserRole;
  onBack: () => void;
  onCreate: (type: ReportType) => Promise<void>;
  onOpen: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onDownloadCompleted: (id: string) => void;
  onCreateCorrection: (id: string) => Promise<void>;
  onUpdateProperty: (input: { address: string; reference?: string; notes?: string }) => Promise<void>;
  onArchiveProperty: () => Promise<void>;
}

export const ReportDashboard: React.FC<Props> = ({
  property,
  reports,
  userRole,
  onBack,
  onCreate,
  onOpen,
  onDelete,
  onDownloadCompleted,
  onCreateCorrection,
  onUpdateProperty,
  onArchiveProperty,
}) => {
  const [type, setType] = useState<ReportType>('Entry');
  const [isCreating, setIsCreating] = useState(false);
  const [isEditingProperty, setIsEditingProperty] = useState(false);
  const [address, setAddress] = useState(property.address);
  const [reference, setReference] = useState(property.reference || '');
  const [notes, setNotes] = useState(property.notes || '');
  const [isSavingProperty, setIsSavingProperty] = useState(false);
  const canEdit = userRole !== 'viewer';
  const isAdmin = userRole === 'admin';

  useEffect(() => {
    setAddress(property.address);
    setReference(property.reference || '');
    setNotes(property.notes || '');
  }, [property]);

  const create = async () => {
    if (!canEdit) return;
    setIsCreating(true);
    try {
      await onCreate(type);
    } finally {
      setIsCreating(false);
    }
  };

  const saveProperty = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!address.trim() || !canEdit) return;
    setIsSavingProperty(true);
    try {
      await onUpdateProperty({
        address: address.trim(),
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setIsEditingProperty(false);
    } finally {
      setIsSavingProperty(false);
    }
  };

  return (
    <main className="flex-1 bg-neutral-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <button onClick={onBack} className="text-xs font-bold text-neutral-600 flex items-center gap-1.5">
          <ArrowLeft className="w-3.5 h-3.5" /> Properties
        </button>

        <section className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs">
          {!isEditingProperty ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-neutral-900">{property.address}</h1>
                  <p className="text-xs text-neutral-500 mt-1">
                    {property.reference || 'No property reference'}
                  </p>
                  {property.notes && <p className="text-sm text-neutral-600 mt-3">{property.notes}</p>}
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsEditingProperty(true)}
                      className="px-3 py-1.5 text-xs font-bold border border-neutral-300 rounded-lg bg-white flex items-center gap-1.5"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit Property
                    </button>
                    {isAdmin && (
                      <button
                        onClick={onArchiveProperty}
                        className="px-3 py-1.5 text-xs font-bold border border-amber-300 text-amber-800 rounded-lg bg-amber-50 flex items-center gap-1.5"
                      >
                        <Archive className="w-3.5 h-3.5" /> Archive
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <form onSubmit={saveProperty} className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <div className="md:col-span-4">
                <label className="block text-xs font-bold text-neutral-700 mb-1">Property address</label>
                <input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-neutral-700 mb-1">Reference</label>
                <input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-6">
                <label className="block text-xs font-bold text-neutral-700 mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-6 flex gap-2">
                <button
                  type="submit"
                  disabled={isSavingProperty || !address.trim()}
                  className="px-4 py-2 bg-[#0a2540] text-white rounded-lg text-sm font-bold disabled:opacity-50"
                >
                  {isSavingProperty ? 'Saving...' : 'Save Property'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddress(property.address);
                    setReference(property.reference || '');
                    setNotes(property.notes || '');
                    setIsEditingProperty(false);
                  }}
                  className="px-4 py-2 border border-neutral-300 rounded-lg text-sm font-bold"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {canEdit && !property.archivedAt && (
            <div className="mt-5 pt-5 border-t border-neutral-200 flex flex-wrap gap-2 items-center">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ReportType)}
                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                {REPORT_CATEGORIES.map((category) => (
                  <optgroup key={category} label={category}>
                    {REPORT_TEMPLATES.filter((template) => template.category === category && template.selectable !== false).map((template) => (
                      <option key={template.type} value={template.type}>{template.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                onClick={create}
                disabled={isCreating}
                className="px-4 py-2 rounded-lg bg-[#0a2540] text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" /> {isCreating ? 'Creating...' : 'Create Report'}
              </button>
            </div>
          )}
        </section>

        <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-neutral-200">
            <h2 className="font-bold text-neutral-900">Reports</h2>
          </div>
          {reports.length === 0 ? (
            <div className="p-10 text-center text-sm text-neutral-500">No reports for this property yet.</div>
          ) : (
            <div className="divide-y divide-neutral-200">
              {reports.map((report) => {
                const draft = report.status === 'draft';
                const superseded = report.status === 'superseded';
                const correctionPending = report.status === 'completed' && Boolean(report.supersededByReportId);
                return (
                  <div key={report.id} className="p-4 flex items-center justify-between gap-4">
                    <button
                      onClick={() => draft && onOpen(report.id)}
                      className="text-left flex-1 min-w-0 disabled:cursor-default"
                      disabled={!draft}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <FileText className="w-4 h-4 text-neutral-500 shrink-0" />
                        <span className="font-bold text-neutral-900">{report.title || reportLabel(report.reportType)}</span>
                        <span className={
                          'text-[10px] uppercase font-bold rounded-full px-2 py-0.5 ' +
                          (superseded
                            ? 'bg-neutral-200 text-neutral-700'
                            : draft
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800')
                        }>
                          {report.status}
                        </span>
                        {correctionPending && (
                          <span className="text-[10px] uppercase font-bold rounded-full px-2 py-0.5 bg-blue-100 text-blue-800">
                            correction pending
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-500 mt-1 ml-6">
                        {isKeyReceiptTemplate(report.reportType) ? 'Receipt' : report.reportType === 'Custom' ? 'Report' : 'Inspection'} {report.inspectionDate || 'date not set'} • Updated {new Date(report.updatedAt).toLocaleString()}
                      </div>
                      {superseded && report.supersededByReportId && (
                        <div className="text-[11px] text-neutral-500 mt-1 ml-6">
                          Retained as the original issued record; replaced by a later correction.
                        </div>
                      )}
                    </button>

                    <div className="flex flex-wrap justify-end gap-2">
                      {draft ? (
                        canEdit && (
                          <>
                            <button
                              onClick={() => onOpen(report.id)}
                              className="px-3 py-1.5 text-xs font-bold border border-neutral-300 rounded-lg bg-white"
                            >
                              Continue
                            </button>
                            <button
                              onClick={() => onDelete(report.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                              title="Delete draft"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )
                      ) : (
                        <>
                          <button
                            onClick={() => onDownloadCompleted(report.id)}
                            className="px-3 py-1.5 text-xs font-bold border border-neutral-300 rounded-lg bg-white flex items-center gap-1.5"
                          >
                            <Download className="w-3.5 h-3.5" /> PDF
                          </button>
                          {canEdit && report.status === 'completed' && !report.supersededByReportId && (
                            <button
                              onClick={() => onCreateCorrection(report.id)}
                              className="px-3 py-1.5 text-xs font-bold border border-blue-300 text-blue-800 rounded-lg bg-blue-50 flex items-center gap-1.5"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Create Correction
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
};
