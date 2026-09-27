import React, { useState } from 'react';
import { getReportTemplate, usesConditionMatrix } from '../data/reportCatalogue';
import { InspectionArea, InspectionItem, TenancyDetails } from '../types/report';
import { GenericTemplateEditor } from './GenericTemplateEditor';
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  Building2,
  FileText,
  Calendar,
  User,
  ShieldCheck,
  CheckSquare
} from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'areas' | 'details' | 'compliance' | 'notes'>('areas');
  const [expandedAreaId, setExpandedAreaId] = useState<string | null>(areas[0]?.id || null);
  const template = getReportTemplate(details.reportType);
  const isCoreResidentialReport =
    details.reportType === 'Entry' || details.reportType === 'Routine' || details.reportType === 'Exit';
  const showConditionMatrix = usesConditionMatrix(details.reportType);

  const handleUpdateDetail = (key: keyof TenancyDetails, value: any) => {
    onChangeDetails({
      ...details,
      [key]: value,
    });
  };

  const handleUpdateItem = (
    areaId: string,
    itemId: string,
    field: keyof InspectionItem,
    value: any
  ) => {
    const updated = areas.map((area) => {
      if (area.id !== areaId) return area;
      return {
        ...area,
        items: area.items.map((item) => {
          if (item.id !== itemId) return item;
          return {
            ...item,
            [field]: value,
          };
        }),
      };
    });
    onChangeAreas(updated);
  };

  const handleAddItem = (areaId: string) => {
    const newItemName = prompt('Enter item name (e.g. Blinds, Light Fitting, Air Conditioner):');
    if (!newItemName) return;

    const updated = areas.map((area) => {
      if (area.id !== areaId) return area;
      const newItem: InspectionItem = {
        id: `custom-item-${Date.now()}`,
        name: newItemName.trim(),
        clean: showConditionMatrix ? true : null,
        undamaged: showConditionMatrix ? true : null,
        working: showConditionMatrix ? true : null,
        agentComments: showConditionMatrix ? 'Clean, intact and in working order.' : '',
        isCustom: true,
      };
      return {
        ...area,
        items: [...area.items, newItem],
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
    const newAreaName = prompt(
      showConditionMatrix
        ? 'Enter new Area / Room name (e.g. Master Bedroom, Garage, Ensuite):'
        : 'Enter new Area / Section name (e.g. Exterior, Works Area, Safety / Security):'
    );
    if (!newAreaName) return;

    const defaultItems: InspectionItem[] = showConditionMatrix
      ? [
          {
            id: `item-${Date.now()}-1`,
            name: 'Doors/Doorway Frames',
            clean: true,
            undamaged: true,
            working: true,
            agentComments: 'Painted, clean and intact.',
          },
          {
            id: `item-${Date.now()}-2`,
            name: 'Ceiling/Cornices',
            clean: true,
            undamaged: true,
            working: true,
            agentComments: 'Clean and intact.',
          },
          {
            id: `item-${Date.now()}-3`,
            name: 'Walls',
            clean: true,
            undamaged: true,
            working: true,
            agentComments: 'Clean and intact.',
          },
          {
            id: `item-${Date.now()}-4`,
            name: 'Floor / Surface',
            clean: true,
            undamaged: true,
            working: null,
            agentComments: 'Clean and in good condition.',
          },
        ]
      : [
          {
            id: `item-${Date.now()}-1`,
            name: 'Overall',
            clean: null,
            undamaged: null,
            working: null,
            agentComments: '',
          },
        ];

    const newArea: InspectionArea = {
      id: `area-${Date.now()}`,
      name: newAreaName.trim(),
      items: defaultItems,
    };
    onChangeAreas([...areas, newArea]);
    setExpandedAreaId(newArea.id);
  };

  const handleDeleteArea = (areaId: string) => {
    if (confirm('Are you sure you want to remove this area and all its condition items?')) {
      onChangeAreas(areas.filter((a) => a.id !== areaId));
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-neutral-200 overflow-hidden flex flex-col h-full">
      {/* Sub tabs */}
      <div className="flex border-b border-neutral-200 bg-neutral-50 px-4">
        <button
          onClick={() => setActiveTab('areas')}
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
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
          className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTab === 'details'
              ? 'border-neutral-900 text-neutral-900 bg-white'
              : 'border-transparent text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          {details.reportType === 'Entry' ? 'WA Form 1 Tenancy Details' : 'Report Details'}
        </button>
        {details.reportType === 'Entry' ? (
          <button
            onClick={() => setActiveTab('compliance')}
            className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'compliance'
                ? 'border-neutral-900 text-neutral-900 bg-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            WA Work Dates, Signatures & Disclaimer
          </button>
        ) : (
          <button
            onClick={() => setActiveTab('notes')}
            className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'notes'
                ? 'border-neutral-900 text-neutral-900 bg-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-700" />
            {details.reportType === 'Routine'
              ? 'Summary, Maintenance & Sign-off'
              : details.reportType === 'Exit'
              ? 'Exit Notes, Work Dates & Sign-off'
              : 'Template Details, Outcomes & Sign-off'}
          </button>
        )}
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-neutral-50/50">
        {/* ================= CONDITION COMMENTARY TAB ================= */}
        {activeTab === 'areas' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-neutral-200 shadow-2xs">
              <div>
                <h3 className="font-bold text-neutral-900 text-sm">
                  {details.reportType === 'Entry' ? 'Property Room & Area Commentary (WA Form 1)' : template.findingsTitle}
                </h3>
                <p className="text-xs text-neutral-500">
                  {showConditionMatrix
                    ? 'Mark Clean (Cln), Undamaged (Udg), Working (Wkg) with Y/N where relevant and record detailed observations.'
                    : 'Record concise findings and observations for each area or section. The issued PDF uses deterministic wrapped rows and continuation pages.'}
                </p>
              </div>
              <button
                onClick={handleAddArea}
                className="px-3 py-1.5 bg-[#0a2540] hover:bg-[#07192c] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Area / Section
              </button>
            </div>

            <div className="space-y-3">
              {areas.map((area) => {
                const isExpanded = expandedAreaId === area.id;

                return (
                  <div
                    key={area.id}
                    className="border border-neutral-300 rounded-xl bg-white shadow-2xs overflow-hidden transition-all"
                  >
                    {/* Area Accordion Header */}
                    <div
                      onClick={() => setExpandedAreaId(isExpanded ? null : area.id)}
                      className="p-3 bg-neutral-100 hover:bg-neutral-200/70 cursor-pointer flex items-center justify-between border-b border-neutral-200 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-neutral-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-neutral-500" />
                        )}
                        <span className="font-black text-xs md:text-sm text-neutral-900 tracking-wide">
                          {area.name}
                        </span>
                        <span className="text-[11px] font-semibold text-neutral-600 bg-neutral-200 px-2 py-0.5 rounded-full">
                          {area.items.length} items
                        </span>
                        {area.overallPhotoCount ? (
                          <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                            {area.overallPhotoCount} photos
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleAddItem(area.id)}
                          className="px-2.5 py-1 text-xs font-semibold bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-700 rounded-lg flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Add Item
                        </button>
                        <button
                          onClick={() => handleDeleteArea(area.id)}
                          className="p-1 text-neutral-400 hover:text-red-600 rounded"
                          title="Delete Area"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Area Item List */}
                    {isExpanded && (
                      <div className="divide-y divide-neutral-200">
                        {area.items.map((item) => (
                          <div key={item.id} className="p-3 flex flex-col md:flex-row gap-3 items-start text-xs">
                            {/* Left: Item name and Y/N toggles */}
                            <div className="w-full md:w-56 shrink-0 flex flex-col gap-2">
                              <span className="font-bold text-neutral-800 text-[11px]">{item.name}</span>

                              {showConditionMatrix && (
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-0.5 border border-neutral-300 rounded p-0.5 bg-neutral-50">
                                    <span className="text-[10px] font-bold text-neutral-600 px-1">Cln</span>
                                    <button
                                      onClick={() =>
                                        handleUpdateItem(area.id, item.id, 'clean', item.clean === true ? null : true)
                                      }
                                      className={`px-1.5 py-0.5 text-[10px] font-black rounded ${
                                        item.clean === true ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-200'
                                      }`}
                                    >
                                      Y
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleUpdateItem(area.id, item.id, 'clean', item.clean === false ? null : false)
                                      }
                                      className={`px-1.5 py-0.5 text-[10px] font-black rounded ${
                                        item.clean === false ? 'bg-red-600 text-white' : 'text-neutral-500 hover:bg-neutral-200'
                                      }`}
                                    >
                                      N
                                    </button>
                                  </div>

                                  <div className="flex items-center gap-0.5 border border-neutral-300 rounded p-0.5 bg-neutral-50">
                                    <span className="text-[10px] font-bold text-neutral-600 px-1">Udg</span>
                                    <button
                                      onClick={() =>
                                        handleUpdateItem(area.id, item.id, 'undamaged', item.undamaged === true ? null : true)
                                      }
                                      className={`px-1.5 py-0.5 text-[10px] font-black rounded ${
                                        item.undamaged === true ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-200'
                                      }`}
                                    >
                                      Y
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleUpdateItem(area.id, item.id, 'undamaged', item.undamaged === false ? null : false)
                                      }
                                      className={`px-1.5 py-0.5 text-[10px] font-black rounded ${
                                        item.undamaged === false ? 'bg-red-600 text-white' : 'text-neutral-500 hover:bg-neutral-200'
                                      }`}
                                    >
                                      N
                                    </button>
                                  </div>

                                  <div className="flex items-center gap-0.5 border border-neutral-300 rounded p-0.5 bg-neutral-50">
                                    <span className="text-[10px] font-bold text-neutral-600 px-1">Wkg</span>
                                    <button
                                      onClick={() =>
                                        handleUpdateItem(area.id, item.id, 'working', item.working === true ? null : true)
                                      }
                                      className={`px-1.5 py-0.5 text-[10px] font-black rounded ${
                                        item.working === true ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-200'
                                      }`}
                                    >
                                      Y
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleUpdateItem(area.id, item.id, 'working', item.working === false ? null : false)
                                      }
                                      className={`px-1.5 py-0.5 text-[10px] font-black rounded ${
                                        item.working === false ? 'bg-red-600 text-white' : 'text-neutral-500 hover:bg-neutral-200'
                                      }`}
                                    >
                                      N
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Middle: Agent Detailed Commentary */}
                            <div className="flex-1 w-full">
                              <label className="block text-[10px] font-bold text-neutral-600 uppercase mb-0.5">
                                {showConditionMatrix ? 'Agent Comments:' : 'Inspection Finding:'}
                              </label>
                              <textarea
                                value={item.agentComments}
                                onChange={(e) => handleUpdateItem(area.id, item.id, 'agentComments', e.target.value)}
                                rows={2}
                                className="w-full border border-neutral-300 rounded-lg p-2 font-mono text-[11px] focus:outline-hidden focus:border-neutral-900 bg-white"
                                placeholder="Describe condition, chips, marks, tested status..."
                              />
                            </div>

                            {/* Right: Actions */}
                            <div className="pt-4 shrink-0">
                              <button
                                onClick={() => handleDeleteItem(area.id, item.id)}
                                className="text-neutral-300 hover:text-red-600 p-1"
                                title="Delete condition row"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
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

        {/* ================= WA FORM 1 TENANCY DETAILS TAB ================= */}
        {activeTab === 'details' && (
          <div className="space-y-4 text-xs">
            <div className="border-b border-neutral-200 pb-2">
              <h3 className="font-bold text-neutral-900 text-sm">
                {details.reportType === 'Entry'
                  ? 'Western Australia Form 1 Tenancy Header & Property Details'
                  : `${details.reportType} Inspection Details`}
              </h3>
              {details.reportType === 'Entry' && (
                <p className="text-neutral-500 text-[11px]">
                  Governed under the <span className="font-semibold">Residential Tenancies Act 1987 (WA) Section 27C(6)</span>.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block font-semibold text-neutral-700 mb-1">
                  Property Address (WA Location)
                </label>
                <input
                  type="text"
                  value={details.propertyAddress}
                  onChange={(e) => handleUpdateDetail('propertyAddress', e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2 font-semibold text-neutral-900"
                  placeholder="e.g. 1/4 Pusey St, Bentley, WA 6102"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Inspecting Agent / Team</label>
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
                  placeholder="e.g. Monday 19/05/2025"
                />
              </div>

              {isCoreResidentialReport && (
                <>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">
                      {details.reportType === 'Routine' ? 'Lease Start Date' : 'Tenancy Start Date'}
                    </label>
                <input
                  type="text"
                  value={details.tenancyStartDate}
                  onChange={(e) => handleUpdateDetail('tenancyStartDate', e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2"
                  placeholder="e.g. Monday 19/05/2025 or leave blank for entry handover"
                />
              </div>

              {details.reportType === 'Routine' && (
                <>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Lease Expiry Date</label>
                    <input
                      type="text"
                      value={details.leaseExpiryDate || ''}
                      onChange={(e) => handleUpdateDetail('leaseExpiryDate', e.target.value)}
                      className="w-full border border-neutral-300 rounded-lg p-2"
                      placeholder="DD/MM/YYYY"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Rent Review Date</label>
                    <input
                      type="text"
                      value={details.rentReviewDate || ''}
                      onChange={(e) => handleUpdateDetail('rentReviewDate', e.target.value)}
                      className="w-full border border-neutral-300 rounded-lg p-2"
                      placeholder="DD/MM/YYYY"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Current Rental Amount</label>
                    <input
                      type="text"
                      value={details.currentRentalAmount || ''}
                      onChange={(e) => handleUpdateDetail('currentRentalAmount', e.target.value)}
                      className="w-full border border-neutral-300 rounded-lg p-2"
                      placeholder="e.g. $560 per week"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Tenant Name(s)</label>
                <input
                  type="text"
                  value={details.tenants}
                  onChange={(e) => handleUpdateDetail('tenants', e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2"
                  placeholder="e.g. Tenant 1, Tenant 2"
                />
              </div>
                </>
              )}

              {details.reportType === 'Entry' && (
                <>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Tenant Received Date</label>
                    <input
                      type="text"
                      value={details.tenantReceivedDate || ''}
                      onChange={(e) => handleUpdateDetail('tenantReceivedDate', e.target.value)}
                      className="w-full border border-neutral-300 rounded-lg p-2"
                      placeholder="Date tenant received report"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Report Return Date (Within 7 Days)</label>
                    <input
                      type="text"
                      value={details.reportReturnDate}
                      onChange={(e) => handleUpdateDetail('reportReturnDate', e.target.value)}
                      className="w-full border border-neutral-300 rounded-lg p-2"
                      placeholder="e.g. Monday 26/05/2025"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Company / Agency Name</label>
                <input
                  type="text"
                  value={details.companyName}
                  onChange={(e) => handleUpdateDetail('companyName', e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2"
                  placeholder="e.g. ProInspect Systems"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Agency Phone & Contact</label>
                <input
                  type="text"
                  value={details.companyPhone}
                  onChange={(e) => handleUpdateDetail('companyPhone', e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2"
                  placeholder="e.g. T: 1300 995 690"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-semibold text-neutral-700 mb-1">Agency Office Address</label>
                <input
                  type="text"
                  value={details.companyAddress}
                  onChange={(e) => handleUpdateDetail('companyAddress', e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2"
                  placeholder="e.g. 302/32 Warleigh Grove Brighton VIC 3186"
                />
              </div>
            </div>
          </div>
        )}

        {/* ================= ROUTINE / EXIT / GENERIC NOTES & SIGN-OFF TAB ================= */}
        {activeTab === 'notes' && details.reportType !== 'Entry' && (
          isCoreResidentialReport ? (
          <div className="space-y-4 text-xs">
            <h3 className="font-bold text-neutral-900 text-sm pb-2 border-b border-neutral-200">
              {details.reportType === 'Routine'
                ? 'Routine Inspection Summary, Maintenance & Sign-off'
                : 'Exit Condition Report Notes, Work Dates & Sign-off'}
            </h3>

            {details.reportType === 'Exit' && (
              <div className="p-3 border border-neutral-200 rounded-lg bg-white space-y-3 shadow-2xs">
                <h4 className="font-bold text-neutral-900 text-xs uppercase tracking-wider">
                  Approximate dates when work last done on residential premises
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Painting of premises (external)</label>
                    <input
                      type="text"
                      value={details.paintingPremisesExternalDate || ''}
                      onChange={(e) => handleUpdateDetail('paintingPremisesExternalDate', e.target.value)}
                      className="w-full border border-neutral-300 rounded p-1.5 bg-neutral-50 font-mono"
                      placeholder="DD/MM/YYYY"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Painting of premises (internal)</label>
                    <input
                      type="text"
                      value={details.paintingPremisesInternalDate || ''}
                      onChange={(e) => handleUpdateDetail('paintingPremisesInternalDate', e.target.value)}
                      className="w-full border border-neutral-300 rounded p-1.5 bg-neutral-50 font-mono"
                      placeholder="DD/MM/YYYY"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Floorcoverings laid</label>
                    <input
                      type="text"
                      value={details.floorcoveringsLaidDate || ''}
                      onChange={(e) => handleUpdateDetail('floorcoveringsLaidDate', e.target.value)}
                      className="w-full border border-neutral-300 rounded p-1.5 bg-neutral-50 font-mono"
                      placeholder="DD/MM/YYYY"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Floorcoverings professionally cleaned</label>
                    <input
                      type="text"
                      value={details.floorcoveringsCleanedDate || ''}
                      onChange={(e) => handleUpdateDetail('floorcoveringsCleanedDate', e.target.value)}
                      className="w-full border border-neutral-300 rounded p-1.5 bg-neutral-50 font-mono"
                      placeholder="DD/MM/YYYY"
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">
                {details.reportType === 'Routine' ? 'Agent Comments' : 'Exit Report Additional Comments'}
              </label>
              <textarea
                value={details.additionalComments}
                onChange={(e) => handleUpdateDetail('additionalComments', e.target.value)}
                rows={4}
                className="w-full border border-neutral-300 rounded-lg p-2 bg-white"
                placeholder={details.reportType === 'Routine'
                  ? 'Overall inspection summary, presentation and observations...'
                  : 'Additional end-of-tenancy comments...'}
              />
            </div>

            {details.reportType === 'Routine' && (
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Maintenance Comments</label>
                <textarea
                  value={details.maintenanceComments || ''}
                  onChange={(e) => handleUpdateDetail('maintenanceComments', e.target.value)}
                  rows={5}
                  className="w-full border border-neutral-300 rounded-lg p-2 bg-white"
                  placeholder="List maintenance items identified during the routine inspection..."
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  {details.reportType === 'Exit' ? 'Agent Signatory at END of Tenancy' : 'Prepared / Signed by'}
                </label>
                <input
                  type="text"
                  value={details.agentSignName}
                  onChange={(e) => handleUpdateDetail('agentSignName', e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2 bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Sign-off Date</label>
                <input
                  type="text"
                  value={details.agentSignDate}
                  onChange={(e) => handleUpdateDetail('agentSignDate', e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2 bg-white"
                  placeholder="DD/MM/YYYY"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Inspection Disclaimer</label>
              <textarea
                value={details.disclaimerText}
                onChange={(e) => handleUpdateDetail('disclaimerText', e.target.value)}
                rows={5}
                className="w-full border border-neutral-300 rounded-lg p-2 bg-neutral-50 font-sans text-[11px]"
              />
            </div>
          </div>
          ) : (
            <GenericTemplateEditor details={details} onChangeDetails={onChangeDetails} />
          )
        )}

        {/* ================= COMPLIANCE, WORK DATES & SIGNATURES TAB ================= */}
        {activeTab === 'compliance' && details.reportType === 'Entry' && (
          <div className="space-y-4 text-xs">
            <h3 className="font-bold text-neutral-900 text-sm pb-2 border-b border-neutral-200">
              WA Form 1 Statutory Work Dates, Additional Comments & Signatures
            </h3>

            {/* WA Statutory Work Dates */}
            <div className="p-3 border border-neutral-200 rounded-lg bg-white space-y-3 shadow-2xs">
              <h4 className="font-bold text-neutral-900 text-xs uppercase tracking-wider">
                Approximate dates when work last done on residential premises
              </h4>
              <p className="text-neutral-500 text-[11px]">
                Statutory requirement under the Western Australia Residential Tenancies Form 1.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Painting of premises (external):</label>
                  <input
                    type="text"
                    value={details.paintingPremisesExternalDate || ''}
                    onChange={(e) => handleUpdateDetail('paintingPremisesExternalDate', e.target.value)}
                    className="w-full border border-neutral-300 rounded p-1.5 bg-neutral-50 font-mono"
                    placeholder="DD / MM / YYYY"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Painting of premises (internal):</label>
                  <input
                    type="text"
                    value={details.paintingPremisesInternalDate || ''}
                    onChange={(e) => handleUpdateDetail('paintingPremisesInternalDate', e.target.value)}
                    className="w-full border border-neutral-300 rounded p-1.5 bg-neutral-50 font-mono"
                    placeholder="DD / MM / YYYY"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Floorcoverings laid:</label>
                  <input
                    type="text"
                    value={details.floorcoveringsLaidDate || ''}
                    onChange={(e) => handleUpdateDetail('floorcoveringsLaidDate', e.target.value)}
                    className="w-full border border-neutral-300 rounded p-1.5 bg-neutral-50 font-mono"
                    placeholder="DD / MM / YYYY"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Floorcoverings professionally cleaned:</label>
                  <input
                    type="text"
                    value={details.floorcoveringsCleanedDate || ''}
                    onChange={(e) => handleUpdateDetail('floorcoveringsCleanedDate', e.target.value)}
                    className="w-full border border-neutral-300 rounded p-1.5 bg-neutral-50 font-mono"
                    placeholder="DD / MM / YYYY"
                  />
                </div>
              </div>
            </div>

            {/* Additional comments */}
            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Entry Report Additional Comments
                </label>
                <textarea
                  value={details.additionalComments}
                  onChange={(e) => handleUpdateDetail('additionalComments', e.target.value)}
                  rows={3}
                  className="w-full border border-neutral-300 rounded-lg p-2 bg-white"
                  placeholder="Enter any additional general tenancy notes, conditions, or instructions..."
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Agent Signatory Name at START of Tenancy
                </label>
                <input
                  type="text"
                  value={details.agentSignName}
                  onChange={(e) => handleUpdateDetail('agentSignName', e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2 bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Western Australia Tenancy Inspection Legal Disclaimer
                </label>
                <textarea
                  value={details.disclaimerText}
                  onChange={(e) => handleUpdateDetail('disclaimerText', e.target.value)}
                  rows={4}
                  className="w-full border border-neutral-300 rounded-lg p-2 bg-neutral-50 font-sans text-[11px]"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
