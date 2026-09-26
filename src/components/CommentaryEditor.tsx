import React, { useState } from 'react';
import { TenancyDetails, InspectionArea, ReportType } from '../types/report';
import { Building2, Calendar, FileText, Plus, Trash2, CheckSquare, Edit3, ChevronDown, ChevronUp } from 'lucide-react';

interface CommentaryEditorProps {
  details: TenancyDetails;
  areas: InspectionArea[];
  onChangeDetails: (details: TenancyDetails) => void;
  onChangeAreas: (areas: InspectionArea[]) => void;
}

export const CommentaryEditor: React.FC<CommentaryEditorProps> = ({
  details,
  areas,
  onChangeDetails,
  onChangeAreas,
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'areas' | 'compliance'>('areas');
  const [expandedAreaId, setExpandedAreaId] = useState<string | null>(areas[0]?.id || null);

  const handleUpdateDetail = (key: keyof TenancyDetails, value: any) => {
    onChangeDetails({
      ...details,
      [key]: value,
    });
  };

  const handleUpdateItem = (
    areaId: string,
    itemId: string,
    field: 'clean' | 'undamaged' | 'working' | 'agentComments' | 'name',
    val: any
  ) => {
    const updated = areas.map((area) => {
      if (area.id !== areaId) return area;
      return {
        ...area,
        items: area.items.map((it) => {
          if (it.id !== itemId) return it;
          return {
            ...it,
            [field]: val,
          };
        }),
      };
    });
    onChangeAreas(updated);
  };

  const handleAddItem = (areaId: string) => {
    const updated = areas.map((area) => {
      if (area.id !== areaId) return area;
      const newItemId = `item-${Date.now()}`;
      return {
        ...area,
        items: [
          ...area.items,
          {
            id: newItemId,
            name: 'New Item / Fixture',
            clean: true,
            undamaged: true,
            working: true,
            agentComments: 'Good condition, intact.',
            isCustom: true,
          },
        ],
      };
    });
    onChangeAreas(updated);
  };

  const handleDeleteItem = (areaId: string, itemId: string) => {
    const updated = areas.map((area) => {
      if (area.id !== areaId) return area;
      return {
        ...area,
        items: area.items.filter((it) => it.id !== itemId),
      };
    });
    onChangeAreas(updated);
  };

  const handleAddArea = () => {
    const newAreaName = prompt('Enter new Area / Room name (e.g. Master Ensuite, Garage, Study):');
    if (!newAreaName) return;
    const newArea: InspectionArea = {
      id: `area-${Date.now()}`,
      name: newAreaName.trim(),
      items: [
        {
          id: `item-${Date.now()}-1`,
          name: 'Doors/walls/ceiling',
          clean: true,
          undamaged: true,
          working: true,
          agentComments: 'Clean and good condition.',
        },
        {
          id: `item-${Date.now()}-2`,
          name: 'Fans/light fittings',
          clean: true,
          undamaged: true,
          working: true,
          agentComments: 'Intact and working.',
        },
        {
          id: `item-${Date.now()}-3`,
          name: 'Floor/floor coverings',
          clean: true,
          undamaged: true,
          working: true,
          agentComments: 'Good condition.',
        },
      ],
    };
    onChangeAreas([...areas, newArea]);
    setExpandedAreaId(newArea.id);
  };

  const handleDeleteArea = (areaId: string) => {
    if (confirm('Are you sure you want to remove this area and all its items?')) {
      onChangeAreas(areas.filter((a) => a.id !== areaId));
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-neutral-200 overflow-hidden flex flex-col h-full">
      {/* Sub tabs */}
      <div className="flex border-b border-neutral-200 bg-neutral-50 px-4">
        <button
          onClick={() => setActiveTab('areas')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'areas'
              ? 'border-neutral-900 text-neutral-900 bg-white'
              : 'border-transparent text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Condition Commentary ({areas.length} Areas)
        </button>
        <button
          onClick={() => setActiveTab('details')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'details'
              ? 'border-neutral-900 text-neutral-900 bg-white'
              : 'border-transparent text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          Property & Tenancy Header
        </button>
        <button
          onClick={() => setActiveTab('compliance')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
            activeTab === 'compliance'
              ? 'border-neutral-900 text-neutral-900 bg-white'
              : 'border-transparent text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <CheckSquare className="w-3.5 h-3.5" />
          Water, Keys & Signatures
        </button>
      </div>

      <div className="p-4 md:p-6 overflow-y-auto flex-1 space-y-6">
        {/* ================= CONDITION COMMENTARY TAB ================= */}
        {activeTab === 'areas' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-neutral-100">
              <div>
                <h3 className="font-bold text-neutral-900 text-sm">Room / Area Checklist & Comments</h3>
                <p className="text-xs text-neutral-500">Edit commentary directly or load via Google Sheet / CSV above</p>
              </div>
              <button
                onClick={handleAddArea}
                className="px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 flex items-center gap-1.5 transition-all shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" /> Add Room / Area
              </button>
            </div>

            <div className="space-y-3">
              {areas.map((area) => {
                const isExpanded = expandedAreaId === area.id;
                return (
                  <div
                    key={area.id}
                    className="border border-neutral-200 rounded-lg overflow-hidden bg-neutral-50/50 transition-shadow hover:shadow-xs"
                  >
                    {/* Header */}
                    <div
                      onClick={() => setExpandedAreaId(isExpanded ? null : area.id)}
                      className="flex items-center justify-between p-3 bg-white cursor-pointer select-none hover:bg-neutral-50 border-b border-neutral-200"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-sm text-neutral-900">{area.name}</span>
                        <span className="text-[11px] px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded-full font-medium">
                          {area.items.length} items
                        </span>
                        {area.overallPhotoCount ? (
                          <span className="text-[11px] text-blue-600 font-medium">
                            • {area.overallPhotoCount} photos referenced
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteArea(area.id);
                          }}
                          className="text-neutral-400 hover:text-red-600 p-1 rounded"
                          title="Delete Area"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-neutral-500" /> : <ChevronDown className="w-4 h-4 text-neutral-500" />}
                      </div>
                    </div>

                    {/* Area Items Table */}
                    {isExpanded && (
                      <div className="p-3 bg-white space-y-3">
                        <div className="space-y-2">
                          {area.items.map((item) => (
                            <div
                              key={item.id}
                              className="border border-neutral-200 rounded-md p-2.5 bg-white text-xs space-y-2"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <input
                                  type="text"
                                  value={item.name}
                                  onChange={(e) => handleUpdateItem(area.id, item.id, 'name', e.target.value)}
                                  className="font-semibold text-neutral-900 bg-neutral-50 px-2 py-1 rounded border border-neutral-200 text-xs w-full sm:w-1/3"
                                />

                                {/* Cln, Udg, Wkg Toggles */}
                                <div className="flex items-center gap-4">
                                  <label className="flex items-center gap-1.5 cursor-pointer font-medium text-neutral-700">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(item.clean)}
                                      onChange={(e) => handleUpdateItem(area.id, item.id, 'clean', e.target.checked)}
                                      className="rounded text-neutral-900 h-3.5 w-3.5 focus:ring-0"
                                    />
                                    <span>Clean</span>
                                  </label>
                                  <label className="flex items-center gap-1.5 cursor-pointer font-medium text-neutral-700">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(item.undamaged)}
                                      onChange={(e) => handleUpdateItem(area.id, item.id, 'undamaged', e.target.checked)}
                                      className="rounded text-neutral-900 h-3.5 w-3.5 focus:ring-0"
                                    />
                                    <span>Undamaged</span>
                                  </label>
                                  <label className="flex items-center gap-1.5 cursor-pointer font-medium text-neutral-700">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(item.working)}
                                      onChange={(e) => handleUpdateItem(area.id, item.id, 'working', e.target.checked)}
                                      className="rounded text-neutral-900 h-3.5 w-3.5 focus:ring-0"
                                    />
                                    <span>Working</span>
                                  </label>

                                  <button
                                    onClick={() => handleDeleteItem(area.id, item.id)}
                                    className="text-neutral-400 hover:text-red-500 p-1"
                                    title="Remove Item"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              <div>
                                <textarea
                                  value={item.agentComments}
                                  onChange={(e) => handleUpdateItem(area.id, item.id, 'agentComments', e.target.value)}
                                  placeholder="Agent condition notes and commentary..."
                                  rows={2}
                                  className="w-full text-xs p-2 border border-neutral-200 rounded bg-neutral-50/50 focus:bg-white focus:border-neutral-400 focus:outline-hidden"
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                        <button
                          onClick={() => handleAddItem(area.id)}
                          className="w-full py-2 border border-dashed border-neutral-300 rounded-md text-xs font-semibold text-neutral-600 hover:border-neutral-400 hover:text-neutral-900 flex items-center justify-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Item to {area.name}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= PROPERTY & TENANCY DETAILS TAB ================= */}
        {activeTab === 'details' && (
          <div className="space-y-4">
            <h3 className="font-bold text-neutral-900 text-sm pb-2 border-b border-neutral-100">
              Tenancy Details & Header Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Report Type</label>
                <select
                  value={details.reportType}
                  onChange={(e) => handleUpdateDetail('reportType', e.target.value as ReportType)}
                  className="w-full border border-neutral-300 rounded-lg p-2 bg-white font-medium"
                >
                  <option value="Entry">Entry Condition Report (Form 1a)</option>
                  <option value="Routine">Routine Inspection Report</option>
                  <option value="Exit">Exit Condition Report (Form 14a)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Property Address</label>
                <input
                  type="text"
                  value={details.propertyAddress}
                  onChange={(e) => handleUpdateDetail('propertyAddress', e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2"
                  placeholder="e.g. Unit 302, 32 Warleigh Grove, Brighton VIC"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Inspecting Agent / Agency Name</label>
                <input
                  type="text"
                  value={details.inspectingAgent}
                  onChange={(e) => handleUpdateDetail('inspectingAgent', e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2"
                  placeholder="e.g. Admin Team"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Inspection Date</label>
                <input
                  type="text"
                  value={details.inspectionDate}
                  onChange={(e) => handleUpdateDetail('inspectionDate', e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2"
                  placeholder="e.g. Wednesday 10/04/2024"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Tenancy Start Date</label>
                <input
                  type="text"
                  value={details.tenancyStartDate}
                  onChange={(e) => handleUpdateDetail('tenancyStartDate', e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2"
                  placeholder="e.g. Friday 12/04/2024"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Tenant Name(s)</label>
                <input
                  type="text"
                  value={details.tenants}
                  onChange={(e) => handleUpdateDetail('tenants', e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2"
                  placeholder="e.g. John Doe & Jane Smith"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Company / Agency Name</label>
                <input
                  type="text"
                  value={details.companyName}
                  onChange={(e) => handleUpdateDetail('companyName', e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2"
                  placeholder="e.g. ProInspect"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Company Email</label>
                <input
                  type="email"
                  value={details.companyEmail || ''}
                  onChange={(e) => handleUpdateDetail('companyEmail', e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2"
                  placeholder="e.g. info@proinspect.systems"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Company Website</label>
                <input
                  type="text"
                  value={details.companyWebsite || ''}
                  onChange={(e) => handleUpdateDetail('companyWebsite', e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2"
                  placeholder="e.g. https://proinspect.systems"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Agency Phone & Contact (Optional)</label>
                <input
                  type="text"
                  value={details.companyPhone}
                  onChange={(e) => handleUpdateDetail('companyPhone', e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2"
                  placeholder="e.g. T: 1300 000 000"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-semibold text-neutral-700 mb-1">Agency Office Address</label>
                <input
                  type="text"
                  value={details.companyAddress}
                  onChange={(e) => handleUpdateDetail('companyAddress', e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2"
                  placeholder="e.g. 19 Bonnard Crescent Ashby WA 6065"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-semibold text-neutral-700 mb-1">Cover Hero Image URL (Optional)</label>
                <input
                  type="text"
                  value={details.coverPhotoUrl || ''}
                  onChange={(e) => handleUpdateDetail('coverPhotoUrl', e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2"
                  placeholder="Paste direct URL or will use first Google Drive photo"
                />
              </div>
            </div>
          </div>
        )}

        {/* ================= COMPLIANCE & WATER TAB ================= */}
        {activeTab === 'compliance' && (
          <div className="space-y-4 text-xs">
            <h3 className="font-bold text-neutral-900 text-sm pb-2 border-b border-neutral-100">
              Statutory Compliance, Water Metering & Keys
            </h3>

            {/* Water charging */}
            <div className="p-3 border border-neutral-200 rounded-lg bg-neutral-50/50 space-y-3">
              <h4 className="font-bold text-neutral-900 text-xs">Water Charging Regulations</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={details.waterIndividuallyMetered}
                    onChange={(e) => handleUpdateDetail('waterIndividuallyMetered', e.target.checked)}
                    className="rounded text-neutral-900 h-4 w-4"
                  />
                  <span>Are premises individually metered?</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={details.waterEfficient}
                    onChange={(e) => handleUpdateDetail('waterEfficient', e.target.checked)}
                    className="rounded text-neutral-900 h-4 w-4"
                  />
                  <span>Are premises water efficient (3-star WELS)?</span>
                </label>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Water Meter Reading at Start:</label>
                <input
                  type="text"
                  value={details.waterMeterReading}
                  onChange={(e) => handleUpdateDetail('waterMeterReading', e.target.value)}
                  className="w-full border border-neutral-300 rounded p-1.5 bg-white"
                  placeholder="e.g. 0428.5 kL"
                />
              </div>
            </div>

            {/* Keys Handover */}
            <div className="p-3 border border-neutral-200 rounded-lg bg-neutral-50/50 space-y-2">
              <h4 className="font-bold text-neutral-900 text-xs">Keys Supplied to Tenants Inventory</h4>
              <textarea
                value={details.keysSuppliedSummary}
                onChange={(e) => handleUpdateDetail('keysSuppliedSummary', e.target.value)}
                rows={3}
                className="w-full border border-neutral-300 rounded p-2 bg-white"
                placeholder="e.g. Front door keys x2, key/elevator fobs x2, post office box key x1"
              />
            </div>

            {/* Additional comments & Disclaimers */}
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Additional Agent Comments</label>
                <textarea
                  value={details.additionalComments}
                  onChange={(e) => handleUpdateDetail('additionalComments', e.target.value)}
                  rows={3}
                  className="w-full border border-neutral-300 rounded p-2 bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Legal Inspection Disclaimer</label>
                <textarea
                  value={details.disclaimerText}
                  onChange={(e) => handleUpdateDetail('disclaimerText', e.target.value)}
                  rows={4}
                  className="w-full border border-neutral-300 rounded p-2 bg-neutral-50 font-sans text-[11px]"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
