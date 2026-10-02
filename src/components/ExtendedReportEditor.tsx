import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Building2, ChevronDown, ChevronRight, FileText, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { getReportTemplate, ReportFieldDefinition, supportsItemActionTracking, supportsMaintenanceRegister } from '../data/reportCatalogue';
import { InspectionArea, InspectionItem, ReportPhoto, TenancyDetails } from '../types/report';
import { ItemWorkflowControls } from './ItemWorkflowControls';
import { normalizeAreaName } from '../lib/reportFormatting';

interface Props {
  details: TenancyDetails;
  areas: InspectionArea[];
  photos: ReportPhoto[];
  onChangeDetails: (details: TenancyDetails) => void;
  onChangeAreas: (areas: InspectionArea[]) => void;
  onChangePhotos: (photos: ReportPhoto[]) => void;
  onUploadPhotos: (files: File[], areaName: string, itemId?: string, areaId?: string) => Promise<void>;
}

function FieldInput({
  field,
  details,
  onChange,
}: {
  field: ReportFieldDefinition;
  details: TenancyDetails;
  onChange: (key: keyof TenancyDetails, value: string) => void;
}) {
  const current = details[field.key];
  const value = typeof current === 'string' ? current : '';

  return (
    <div className={field.multiline ? 'md:col-span-2' : ''}>
      <label className="block font-semibold text-neutral-700 mb-1">{field.label}</label>
      {field.multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(field.key, event.target.value)}
          rows={field.rows || 4}
          className="w-full border border-neutral-300 rounded-lg p-2 bg-white text-xs"
          placeholder={field.placeholder}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(field.key, event.target.value)}
          className="w-full border border-neutral-300 rounded-lg p-2 bg-white text-xs"
          placeholder={field.placeholder}
        />
      )}
    </div>
  );
}

export const ExtendedReportEditor: React.FC<Props> = ({
  details,
  areas,
  photos,
  onChangeDetails,
  onChangeAreas,
  onChangePhotos,
  onUploadPhotos,
}) => {
  const template = getReportTemplate(details.reportType);
  const showRatings = template.family === 'condition';
  const isCustomReport = details.reportType === 'Custom';
  const maintenanceEnabled = supportsMaintenanceRegister(details.reportType);
  const actionTracking = supportsItemActionTracking(details.reportType);
  const [tab, setTab] = useState<'findings' | 'details' | 'summary'>('findings');
  const [expandedAreaId, setExpandedAreaId] = useState<string | null>(areas[0]?.id || null);

  const findingLabel = useMemo(() => {
    if (template.family === 'maintenance') return 'Observation / Verification';
    if (template.family === 'event') return 'Observation / Evidence';
    if (template.family === 'operations') return 'Operational Observation';
    if (template.family === 'condition') return 'Condition Commentary';
    return 'Inspection Finding';
  }, [template.family]);

  const updateDetail = (key: keyof TenancyDetails, value: string) => {
    onChangeDetails({ ...details, [key]: value });
  };

  const updateAreaName = (areaId: string, name: string) => {
    const currentArea = areas.find((area) => area.id === areaId);
    if (!currentArea) return;
    const previousName = currentArea.name;
    const itemIds = new Set(currentArea.items.map((item) => item.id));
    onChangeAreas(areas.map((area) => area.id === areaId ? { ...area, name } : area));
    onChangePhotos(
      photos.map((photo) =>
        (photo.itemId && itemIds.has(photo.itemId)) ||
        normalizeAreaName(photo.areaName) === normalizeAreaName(previousName)
          ? { ...photo, areaName: name }
          : photo
      )
    );
  };

  const updateItem = (areaId: string, itemId: string, field: keyof InspectionItem, value: any) => {
    onChangeAreas(
      areas.map((area) =>
        area.id !== areaId
          ? area
          : {
              ...area,
              items: area.items.map((item) => item.id === itemId ? { ...item, [field]: value } : item),
            }
      )
    );
  };

  const moveArea = (areaId: string, direction: 'up' | 'down') => {
    const index = areas.findIndex((area) => area.id === areaId);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= areas.length) return;
    const next = [...areas];
    [next[index], next[target]] = [next[target], next[index]];
    onChangeAreas(next);
  };

  const moveItem = (areaId: string, itemId: string, direction: 'up' | 'down') => {
    onChangeAreas(
      areas.map((area) => {
        if (area.id !== areaId) return area;
        const index = area.items.findIndex((item) => item.id === itemId);
        const target = direction === 'up' ? index - 1 : index + 1;
        if (index < 0 || target < 0 || target >= area.items.length) return area;
        const items = [...area.items];
        [items[index], items[target]] = [items[target], items[index]];
        return { ...area, items };
      })
    );
  };

  const addArea = () => {
    const name = prompt('Enter the new report area / section name:')?.trim();
    if (!name) return;
    const area: InspectionArea = {
      id: `area-${crypto.randomUUID()}`,
      name,
      items: [{
        id: `item-${crypto.randomUUID()}`,
        name: 'Overall',
        clean: showRatings ? null : undefined,
        undamaged: showRatings ? null : undefined,
        working: showRatings ? null : undefined,
        agentComments: '',
      }],
    };
    onChangeAreas([...areas, area]);
    setExpandedAreaId(area.id);
  };

  const addItem = (areaId: string) => {
    const name = prompt('Enter the item / observation name:')?.trim();
    if (!name) return;
    onChangeAreas(
      areas.map((area) =>
        area.id !== areaId
          ? area
          : {
              ...area,
              items: [
                ...area.items,
                {
                  id: `item-${crypto.randomUUID()}`,
                  name,
                  clean: showRatings ? null : undefined,
                  undamaged: showRatings ? null : undefined,
                  working: showRatings ? null : undefined,
                  agentComments: '',
                  isCustom: true,
                },
              ],
            }
      )
    );
  };

  const deleteArea = (areaId: string) => {
    const area = areas.find((candidate) => candidate.id === areaId);
    if (!area) return;
    const itemIds = new Set(area.items.map((item) => item.id));
    const linked = photos.some(
      (photo) =>
        (photo.itemId && itemIds.has(photo.itemId)) ||
        normalizeAreaName(photo.areaName) === normalizeAreaName(area.name)
    );
    if (linked) {
      alert('This section still has linked photos. Reassign or delete those photos before removing the section.');
      return;
    }
    if (!confirm('Remove this report area and all of its findings?')) return;
    onChangeAreas(areas.filter((candidate) => candidate.id !== areaId));
  };

  const deleteItem = (areaId: string, itemId: string) => {
    if (photos.some((photo) => photo.itemId === itemId)) {
      alert('This item still has linked photos. Reassign or delete those photos before removing the item.');
      return;
    }
    onChangeAreas(
      areas.map((area) =>
        area.id !== areaId ? area : { ...area, items: area.items.filter((item) => item.id !== itemId) }
      )
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-neutral-200 overflow-hidden flex flex-col h-full">
      <div className="flex border-b border-neutral-200 bg-neutral-50 px-4 overflow-x-auto">
        <button
          onClick={() => setTab('findings')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            tab === 'findings' ? 'border-neutral-900 text-neutral-900 bg-white' : 'border-transparent text-neutral-500'
          }`}
        >
          <FileText className="w-3.5 h-3.5" /> {template.findingsTitle} ({areas.length})
        </button>
        <button
          onClick={() => setTab('details')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            tab === 'details' ? 'border-neutral-900 text-neutral-900 bg-white' : 'border-transparent text-neutral-500'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" /> {template.summaryTitle}
        </button>
        <button
          onClick={() => setTab('summary')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            tab === 'summary' ? 'border-neutral-900 text-neutral-900 bg-white' : 'border-transparent text-neutral-500'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-700" /> {template.finalSectionTitle}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-neutral-50/50">
        {tab === 'findings' && (
          <div className="space-y-4">
            <div className="flex justify-between items-start gap-4 bg-white p-3 rounded-lg border border-neutral-200">
              <div>
                <h3 className="font-bold text-neutral-900 text-sm">{template.findingsTitle}</h3>
                <p className="text-xs text-neutral-500 mt-1">{template.purpose}</p>
              </div>
              <button
                onClick={addArea}
                className="px-3 py-1.5 bg-[#0a2540] text-white rounded-lg text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> {isCustomReport ? 'Add Section' : 'Add Area / Section'}
              </button>
            </div>

            <div className="space-y-3">
              {areas.map((area) => {
                const expanded = expandedAreaId === area.id;
                return (
                  <div key={area.id} className="border border-neutral-300 rounded-xl bg-white overflow-hidden">
                    <div
                      className="p-3 bg-neutral-100 flex justify-between items-center cursor-pointer"
                      onClick={() => setExpandedAreaId(expanded ? null : area.id)}
                    >
                      <div className="flex items-center gap-2">
                        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <input
                          value={area.name}
                          onChange={(event) => updateAreaName(area.id, event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          className="min-w-[180px] max-w-[360px] border border-neutral-300 rounded-lg px-2 py-1 font-black text-xs md:text-sm bg-white"
                          aria-label="Report section name"
                        />
                        <span className="text-[11px] bg-neutral-200 px-2 py-0.5 rounded-full">{area.items.length} items</span>
                      </div>
                      <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={() => moveArea(area.id, 'up')} disabled={areas.findIndex((candidate) => candidate.id === area.id) === 0} className="p-1.5 text-neutral-500 disabled:opacity-25" title="Move section up">
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => moveArea(area.id, 'down')} disabled={areas.findIndex((candidate) => candidate.id === area.id) === areas.length - 1} className="p-1.5 text-neutral-500 disabled:opacity-25" title="Move section down">
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button onClick={() => addItem(area.id)} className="px-2 py-1 text-xs border rounded bg-white">
                          + Item
                        </button>
                        <button onClick={() => deleteArea(area.id)} className="p-1 text-neutral-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="divide-y divide-neutral-200">
                        {area.items.map((item, itemIndex) => (
                          <div key={item.id} className="p-3 flex flex-col md:flex-row gap-3 text-xs">
                            <div className="w-full md:w-56 shrink-0 space-y-2">
                              <input
                                value={item.name}
                                onChange={(event) => updateItem(area.id, item.id, 'name', event.target.value)}
                                className="w-full border border-neutral-300 rounded-lg p-2 font-bold"
                              />
                              {showRatings && (
                                <div className="flex gap-1.5">
                                  {([
                                    ['clean', 'Cln'],
                                    ['undamaged', 'Udg'],
                                    ['working', 'Wkg'],
                                  ] as const).map(([key, label]) => (
                                    <div key={key} className="flex items-center border border-neutral-300 rounded bg-neutral-50 p-0.5">
                                      <span className="text-[9px] font-bold px-1">{label}</span>
                                      <button
                                        onClick={() => updateItem(area.id, item.id, key, item[key] === true ? null : true)}
                                        className={`px-1.5 py-0.5 rounded text-[9px] font-black ${item[key] === true ? 'bg-neutral-900 text-white' : ''}`}
                                      >Y</button>
                                      <button
                                        onClick={() => updateItem(area.id, item.id, key, item[key] === false ? null : false)}
                                        className={`px-1.5 py-0.5 rounded text-[9px] font-black ${item[key] === false ? 'bg-red-600 text-white' : ''}`}
                                      >N</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="flex-1">
                              <label className="block text-[10px] font-bold uppercase text-neutral-600 mb-1">{findingLabel}</label>
                              <textarea
                                value={item.agentComments}
                                onChange={(event) => updateItem(area.id, item.id, 'agentComments', event.target.value)}
                                rows={3}
                                className="w-full border border-neutral-300 rounded-lg p-2 text-[11px]"
                                placeholder="Record the observed condition, finding, evidence or outcome..."
                              />
                            </div>

                            <div className="self-start mt-5 flex items-center gap-1">
                              <button type="button" onClick={() => moveItem(area.id, item.id, 'up')} disabled={itemIndex === 0} className="p-1 text-neutral-500 disabled:opacity-25" title="Move item up">
                                <ArrowUp className="w-4 h-4" />
                              </button>
                              <button type="button" onClick={() => moveItem(area.id, item.id, 'down')} disabled={itemIndex === area.items.length - 1} className="p-1 text-neutral-500 disabled:opacity-25" title="Move item down">
                                <ArrowDown className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => deleteItem(area.id, item.id)}
                                className="p-1 text-neutral-300 hover:text-red-600"
                                title="Delete item"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <ItemWorkflowControls
                              area={area}
                              item={item}
                              photos={photos}
                              maintenanceEnabled={maintenanceEnabled}
                              showActionTracking={actionTracking}
                              onChangeItem={(patch) => {
                                onChangeAreas(
                                  areas.map((candidate) =>
                                    candidate.id !== area.id
                                      ? candidate
                                      : {
                                          ...candidate,
                                          items: candidate.items.map((candidateItem) =>
                                            candidateItem.id === item.id ? { ...candidateItem, ...patch } : candidateItem
                                          ),
                                        }
                                  )
                                );
                              }}
                              onUploadPhotos={onUploadPhotos}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'details' && (
          <div className="space-y-4 text-xs">
            <div className="border-b border-neutral-200 pb-2">
              <h3 className="font-bold text-neutral-900 text-sm">{template.summaryTitle}</h3>
              <p className="text-[11px] text-neutral-500 mt-1">{template.purpose}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block font-semibold text-neutral-700 mb-1">Property / Site Address</label>
                <input
                  value={details.propertyAddress}
                  onChange={(event) => updateDetail('propertyAddress', event.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2 font-semibold"
                />
              </div>
              {template.detailFields.map((field) => (
                <FieldInput
                  key={String(field.key)}
                  field={field}
                  details={details}
                  onChange={updateDetail}
                />
              ))}
            </div>
          </div>
        )}

        {tab === 'summary' && (
          <div className="space-y-4 text-xs">
            <div className="border-b border-neutral-200 pb-2">
              <h3 className="font-bold text-neutral-900 text-sm">{template.finalSectionTitle}</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {template.summaryFields.map((field) => (
                <FieldInput
                  key={String(field.key)}
                  field={field}
                  details={details}
                  onChange={updateDetail}
                />
              ))}

              <div className="md:col-span-2">
                <label className="block font-semibold text-neutral-700 mb-1">Report Disclaimer</label>
                <textarea
                  value={details.disclaimerText}
                  onChange={(event) => updateDetail('disclaimerText', event.target.value)}
                  rows={5}
                  className="w-full border border-neutral-300 rounded-lg p-2 bg-neutral-50 text-[11px]"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
