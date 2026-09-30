import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Building2, Camera, ChevronDown, ChevronRight, ClipboardList, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { getReportTemplate } from '../data/reportCatalogue';
import { InspectionArea, InspectionItem, ReportPhoto, TenancyDetails } from '../types/report';

interface Props {
  details: TenancyDetails;
  areas: InspectionArea[];
  photos: ReportPhoto[];
  onChangeDetails: (details: TenancyDetails) => void;
  onChangeAreas: (areas: InspectionArea[]) => void;
}

export const BuildingManagementReportEditor: React.FC<Props> = ({
  details,
  areas,
  photos,
  onChangeDetails,
  onChangeAreas,
}) => {
  const template = getReportTemplate(details.reportType);
  const isDaily = details.reportType === 'BuildingManagementDaily';
  const monthlyPilot = details.reportType === 'BuildingManagementMonthly';
  const [tab, setTab] = useState<'activities' | 'details' | 'summary'>('activities');
  const [expandedAreaId, setExpandedAreaId] = useState<string | null>(areas[0]?.id || null);

  const itemPhotoCounts = useMemo(() => {
    const counts = new Map<string, number>();
    photos.forEach((photo) => {
      if (!photo.itemId) return;
      counts.set(photo.itemId, (counts.get(photo.itemId) || 0) + 1);
    });
    return counts;
  }, [photos]);

  const updateDetail = (key: keyof TenancyDetails, value: string) => {
    onChangeDetails({ ...details, [key]: value });
  };

  const updateItem = (areaId: string, itemId: string, patch: Partial<InspectionItem>) => {
    onChangeAreas(
      areas.map((area) =>
        area.id !== areaId
          ? area
          : {
              ...area,
              items: area.items.map((item) => item.id === itemId ? { ...item, ...patch } : item),
            }
      )
    );
  };

  const moveItem = (areaId: string, itemId: string, direction: 'up' | 'down') => {
    onChangeAreas(
      areas.map((area) => {
        if (area.id !== areaId) return area;
        const currentIndex = area.items.findIndex((item) => item.id === itemId);
        const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (currentIndex < 0 || nextIndex < 0 || nextIndex >= area.items.length) return area;

        const items = [...area.items];
        [items[currentIndex], items[nextIndex]] = [items[nextIndex], items[currentIndex]];
        return { ...area, items };
      })
    );
  };

  const addItem = (areaId: string) => {
    const newItem: InspectionItem = {
      id: `bm-item-${crypto.randomUUID()}`,
      name: '',
      activityDate: isDaily ? details.inspectionDate : '',
      activityTime: '',
      activityParty: '',
      agentComments: '',
      actionComments: '',
    };
    onChangeAreas(
      areas.map((area) => area.id === areaId ? { ...area, items: [...area.items, newItem] } : area)
    );
    setExpandedAreaId(areaId);
  };

  const deleteItem = (areaId: string, itemId: string) => {
    const linked = itemPhotoCounts.get(itemId) || 0;
    if (linked > 0) {
      alert(`This reporting item has ${linked} linked photo${linked === 1 ? '' : 's'}. Reassign or delete those photos before removing the item.`);
      return;
    }
    onChangeAreas(
      areas.map((area) =>
        area.id === areaId ? { ...area, items: area.items.filter((item) => item.id !== itemId) } : area
      )
    );
  };

  const addCategory = () => {
    const name = prompt('Enter the new Building Management report category:')?.trim();
    if (!name) return;
    const area: InspectionArea = {
      id: `bm-area-${crypto.randomUUID()}`,
      name,
      items: [],
    };
    onChangeAreas([...areas, area]);
    setExpandedAreaId(area.id);
  };

  const deleteCategory = (area: InspectionArea) => {
    const linked = photos.filter((photo) => photo.areaName === area.name).length;
    if (linked > 0) {
      alert(`This category has ${linked} linked photo${linked === 1 ? '' : 's'}. Reassign or delete those photos before removing the category.`);
      return;
    }
    if (!confirm(`Remove the "${area.name}" category and all of its reporting items?`)) return;
    onChangeAreas(areas.filter((item) => item.id !== area.id));
  };

  const detailFields: Array<[keyof TenancyDetails, string, string?]> = [
    ['buildingName', 'Building / Scheme Name', 'e.g. Meridian'],
    ['strataPlan', 'Strata Plan / Scheme Reference', 'e.g. Strata Plan 69776'],
    ['propertyAddress', 'Building / Site Address', ''],
    ...(isDaily
      ? [['inspectionDate', 'Report Date', 'DD/MM/YYYY'] as [keyof TenancyDetails, string, string]]
      : [
          ['reportingPeriod', 'Reporting Period', 'e.g. April 2026'] as [keyof TenancyDetails, string, string],
          ['inspectionDate', 'Report Issue Date', 'DD/MM/YYYY'] as [keyof TenancyDetails, string, string],
        ]),
    ['inspectingAgent', 'Building Manager / Prepared By', ''],
    ['clientName', 'Client / Council / Principal', ''],
  ];

  const summaryFields: Array<[keyof TenancyDetails, string, number]> = isDaily
    ? [
        ['buildingSummary', 'Daily Summary', 5],
        ['outstandingItems', 'Outstanding Works / Issues', 5],
        ['mattersForApproval', 'Matters Requiring Approval / Escalation', 4],
        ['additionalComments', 'Additional Comments', 4],
      ]
    : [
        ['buildingSummary', 'Overall Monthly Summary', 5],
        ['outstandingItems', 'Outstanding Works / Issues', 5],
        ['mattersForApproval', 'Matters Requiring Approval', 4],
        ['recommendedAction', 'Planned / Next Period Actions', 4],
        ['additionalComments', 'Additional Comments', 4],
      ];

  return (
    <div className="bg-white rounded-xl shadow-xs border border-neutral-200 overflow-hidden flex flex-col h-full">
      <div className="flex border-b border-neutral-200 bg-neutral-50 px-4 overflow-x-auto">
        <button
          onClick={() => setTab('activities')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap ${tab === 'activities' ? 'border-neutral-900 text-neutral-900 bg-white' : 'border-transparent text-neutral-500'}`}
        >
          <ClipboardList className="w-3.5 h-3.5" /> {isDaily ? 'Daily Activities' : 'Monthly Activities'}
        </button>
        <button
          onClick={() => setTab('details')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap ${tab === 'details' ? 'border-neutral-900 text-neutral-900 bg-white' : 'border-transparent text-neutral-500'}`}
        >
          <Building2 className="w-3.5 h-3.5" /> Report Details
        </button>
        <button
          onClick={() => setTab('summary')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap ${tab === 'summary' ? 'border-neutral-900 text-neutral-900 bg-white' : 'border-transparent text-neutral-500'}`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-700" /> Summary & Sign-off
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-neutral-50/50">
        {tab === 'activities' && (
          <div className="space-y-4">
            <div className="bg-white border border-neutral-200 rounded-lg p-3 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-neutral-900">{template.findingsTitle}</h3>
                <p className="text-xs text-neutral-500 mt-1">
                  {monthlyPilot
                    ? 'Add individual reporting items under the same categories used by the Building Management report. Use the arrow controls to set the order shown in the report. Photos are linked to the specific reporting item from the Photos tab and appear directly beneath that item in the report.'
                    : 'Add individual reporting items under the same categories used by the Building Management report. Photos are linked to the specific reporting item from the Photos tab.'}
                </p>
              </div>
              <button onClick={addCategory} className="px-3 py-1.5 bg-[#0a2540] text-white rounded-lg text-xs font-bold flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Category
              </button>
            </div>

            {areas.map((area) => {
              const expanded = expandedAreaId === area.id;
              return (
                <div key={area.id} className="border border-neutral-300 rounded-xl bg-white overflow-hidden">
                  <div
                    className="p-3 bg-neutral-100 flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedAreaId(expanded ? null : area.id)}
                  >
                    <div className="flex items-center gap-2">
                      {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      <span className="font-black text-xs md:text-sm">{area.name}</span>
                      <span className="text-[11px] bg-neutral-200 px-2 py-0.5 rounded-full">{area.items.length} reporting items</span>
                    </div>
                    <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                      <button onClick={() => addItem(area.id)} className="px-2.5 py-1 text-xs border border-neutral-300 rounded bg-white font-semibold">
                        + Reporting Item
                      </button>
                      <button onClick={() => deleteCategory(area)} className="p-1 text-neutral-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="divide-y divide-neutral-200">
                      {area.items.length === 0 && (
                        <div className="p-5 text-xs text-neutral-500 text-center">
                          No activities recorded in this category. Add a reporting item when there is something to report.
                        </div>
                      )}

                      {area.items.map((item, itemIndex) => {
                        const linkedPhotos = itemPhotoCounts.get(item.id) || 0;
                        return (
                          <div key={item.id} className="p-4 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                              <div className="md:col-span-2">
                                <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">
                                  {isDaily ? 'Time' : 'Date'}
                                </label>
                                <input
                                  value={isDaily ? item.activityTime || '' : item.activityDate || ''}
                                  onChange={(event) => updateItem(area.id, item.id, isDaily ? { activityTime: event.target.value } : { activityDate: event.target.value })}
                                  className="w-full border border-neutral-300 rounded-lg p-2 text-xs"
                                  placeholder={isDaily ? 'e.g. 10:30 am' : 'DD/MM/YYYY'}
                                />
                              </div>
                              <div className="md:col-span-3">
                                <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">Contractor / Resident / Party</label>
                                <input
                                  value={item.activityParty || ''}
                                  onChange={(event) => updateItem(area.id, item.id, { activityParty: event.target.value })}
                                  className="w-full border border-neutral-300 rounded-lg p-2 text-xs"
                                  placeholder="e.g. Rescom Electrical"
                                />
                              </div>
                              <div className="md:col-span-5">
                                <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">Reporting Item</label>
                                <input
                                  value={item.name}
                                  onChange={(event) => updateItem(area.id, item.id, { name: event.target.value })}
                                  className="w-full border border-neutral-300 rounded-lg p-2 text-xs font-semibold"
                                  placeholder="Short description / subject"
                                />
                              </div>
                              <div className="md:col-span-2 flex items-end justify-between gap-2">
                                <div className="text-[10px] font-semibold text-cyan-800 bg-cyan-50 border border-cyan-200 rounded-lg px-2 py-2 flex items-center gap-1">
                                  <Camera className="w-3.5 h-3.5" /> {linkedPhotos} linked
                                </div>
                                <div className="flex items-center gap-1">
                                  {monthlyPilot && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => moveItem(area.id, item.id, 'up')}
                                        disabled={itemIndex === 0}
                                        aria-label="Move reporting item up"
                                        title="Move reporting item up"
                                        className="p-2 text-neutral-500 hover:text-neutral-900 disabled:opacity-25 disabled:cursor-not-allowed"
                                      >
                                        <ArrowUp className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => moveItem(area.id, item.id, 'down')}
                                        disabled={itemIndex === area.items.length - 1}
                                        aria-label="Move reporting item down"
                                        title="Move reporting item down"
                                        className="p-2 text-neutral-500 hover:text-neutral-900 disabled:opacity-25 disabled:cursor-not-allowed"
                                      >
                                        <ArrowDown className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => deleteItem(area.id, item.id)}
                                    aria-label="Delete reporting item"
                                    title="Delete reporting item"
                                    className="p-2 text-neutral-300 hover:text-red-600"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">
                                  {isDaily ? 'Brief Summary of Activities Today' : 'Brief Summary of Activities within this period'}
                                </label>
                                <textarea
                                  value={item.agentComments}
                                  onChange={(event) => updateItem(area.id, item.id, { agentComments: event.target.value })}
                                  rows={4}
                                  className="w-full border border-neutral-300 rounded-lg p-2 text-xs"
                                  placeholder="Describe the attendance, activity, observation or work completed..."
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">Actions</label>
                                <textarea
                                  value={item.actionComments || ''}
                                  onChange={(event) => updateItem(area.id, item.id, { actionComments: event.target.value })}
                                  rows={4}
                                  className="w-full border border-neutral-300 rounded-lg p-2 text-xs"
                                  placeholder="Record action taken, follow-up, status or next step..."
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'details' && (
          <div className="space-y-4 text-xs">
            <div className="border-b border-neutral-200 pb-2">
              <h3 className="font-bold text-neutral-900 text-sm">{template.summaryTitle}</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {detailFields.map(([key, label, placeholder]) => (
                <div key={String(key)} className={key === 'propertyAddress' ? 'md:col-span-2' : ''}>
                  <label className="block font-semibold text-neutral-700 mb-1">{label}</label>
                  <input
                    value={typeof details[key] === 'string' ? String(details[key]) : ''}
                    onChange={(event) => updateDetail(key, event.target.value)}
                    className="w-full border border-neutral-300 rounded-lg p-2"
                    placeholder={placeholder}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'summary' && (
          <div className="space-y-4 text-xs">
            <h3 className="font-bold text-neutral-900 text-sm pb-2 border-b border-neutral-200">{template.finalSectionTitle}</h3>

            {summaryFields.map(([key, label, rows]) => (
              <div key={String(key)}>
                <label className="block font-semibold text-neutral-700 mb-1">{label}</label>
                <textarea
                  value={typeof details[key] === 'string' ? String(details[key]) : ''}
                  onChange={(event) => updateDetail(key, event.target.value)}
                  rows={rows}
                  className="w-full border border-neutral-300 rounded-lg p-2 bg-white"
                />
              </div>
            ))}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Prepared / Signed By</label>
                <input
                  value={details.agentSignName || ''}
                  onChange={(event) => updateDetail('agentSignName', event.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Sign-off Date</label>
                <input
                  value={details.agentSignDate || ''}
                  onChange={(event) => updateDetail('agentSignDate', event.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2"
                  placeholder="DD/MM/YYYY"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Report Disclaimer</label>
              <textarea
                value={details.disclaimerText}
                onChange={(event) => updateDetail('disclaimerText', event.target.value)}
                rows={5}
                className="w-full border border-neutral-300 rounded-lg p-2 bg-neutral-50 text-[11px]"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
