import React from 'react';
import { PROINSPECT_COMPANY } from '../config/company';
import { getReportTemplate } from '../data/reportCatalogue';
import { formatAustralianDate, normalizeAreaName } from '../lib/reportFormatting';
import { InspectionArea, ReportData } from '../types/report';
import { ProInspectLogo } from './ProInspectLogo';

interface Props {
  report: ReportData;
}

function Header({ report, title }: { report: ReportData; title: string }) {
  return (
    <div className="flex justify-between border-b border-neutral-300 pb-2 mb-4 text-[10px] font-bold text-neutral-700">
      <span>{report.details.propertyAddress || 'Property address not recorded'}</span>
      <span>{title}</span>
    </div>
  );
}

function Footer() {
  return (
    <div className="mt-auto border-t border-neutral-200 pt-2 text-[9px] text-neutral-500 flex justify-between">
      <span className="font-bold text-[#0a2540]">ProInspect</span>
      <span>INSPECT. REPORT. PROTECT.</span>
    </div>
  );
}

function photoCount(report: ReportData, area: InspectionArea): number {
  const key = normalizeAreaName(area.name);
  return report.photos.filter((photo) => normalizeAreaName(photo.areaName) === key).length;
}

export const GenericReportDocument: React.FC<Props> = ({ report }) => {
  const template = getReportTemplate(report.details.reportType);
  const fields = template.fields || [];
  const templateFields = report.details.templateFields || {};
  const cover = report.photos.find((photo) => photo.isCover) || report.photos[0];

  const orderedPhotos = [...report.photos].sort((a, b) => {
    const areaOrder = new Map(report.areas.map((area, index) => [normalizeAreaName(area.name), index]));
    const aArea = normalizeAreaName(a.areaName || 'General');
    const bArea = normalizeAreaName(b.areaName || 'General');
    const order = (areaOrder.get(aArea) ?? Number.MAX_SAFE_INTEGER) - (areaOrder.get(bArea) ?? Number.MAX_SAFE_INTEGER);
    if (order) return order;
    return (a.photoIndex || 0) - (b.photoIndex || 0);
  });

  const photoPages = Array.from({ length: Math.ceil(orderedPhotos.length / 12) }, (_, index) =>
    orderedPhotos.slice(index * 12, (index + 1) * 12)
  );

  return (
    <div id="report-print-container" className="flex flex-col items-center gap-8 bg-neutral-200/80 p-4 md:p-8">
      <div className="pdf-page w-[210mm] min-h-[297mm] bg-white text-neutral-900 p-[18mm] flex flex-col shadow-2xl box-border">
        <div className="flex justify-between items-start">
          <ProInspectLogo size="md" showTagline={true} />
          <div className="text-right text-xs text-neutral-600 leading-relaxed">
            <p className="font-bold text-[#0a2540]">{report.details.companyName || PROINSPECT_COMPANY.name}</p>
            <p>{report.details.companyAddress || PROINSPECT_COMPANY.address}</p>
            <p>{report.details.companyPhone || PROINSPECT_COMPANY.phone}</p>
            <p>{report.details.companyEmail || PROINSPECT_COMPANY.email}</p>
          </div>
        </div>

        <div className="mt-24 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">{template.label}</h1>
          <p className="mt-4 text-xl font-bold text-[#0a2540]">{report.details.propertyAddress || 'Property address'}</p>
        </div>

        <div className="mt-12 w-[140mm] h-[85mm] mx-auto overflow-hidden rounded border border-neutral-300 bg-neutral-50 flex items-center justify-center">
          {cover?.dataUrl || cover?.url ? (
            <img src={cover.dataUrl || cover.url} alt={cover.name} className="w-full h-full object-contain" />
          ) : (
            <div className="text-center text-neutral-400 text-xs">
              <div className="font-bold text-[#0a2540]">ProInspect</div>
              <div>No cover photo selected</div>
            </div>
          )}
        </div>

        <div className="mt-auto text-center space-y-1.5 mb-8">
          <p className="font-semibold text-sm">
            Report completed on {formatAustralianDate(report.details.inspectionDate) || 'Not recorded'}
          </p>
          <p className="text-sm text-neutral-600">
            Prepared by {report.details.inspectingAgent || 'Not recorded'}
          </p>
        </div>
        <Footer />
      </div>

      <div className="pdf-page w-[210mm] min-h-[297mm] bg-white text-neutral-900 p-[12mm] shadow-2xl box-border flex flex-col">
        <Header report={report} title={template.shortLabel} />
        <div className="bg-slate-100 border border-neutral-300 px-3 py-2 text-sm font-extrabold text-[#0a2540]">
          {template.summaryTitle}
        </div>
        <div className="mt-2 border border-neutral-300 text-[10px]">
          {[
            ['Property Address', report.details.propertyAddress],
            ['Inspection / Report Date', formatAustralianDate(report.details.inspectionDate)],
            ['Inspector / Prepared By', report.details.inspectingAgent],
            ...fields
              .filter((field) => field.section === 'details')
              .map((field) => [
                field.label,
                field.kind === 'date'
                  ? formatAustralianDate(templateFields[field.key])
                  : templateFields[field.key],
              ]),
          ].map(([label, value]) => (
            <div key={label} className="grid grid-cols-[52mm_1fr] border-b last:border-b-0 border-neutral-200">
              <div className="bg-slate-50 p-2 font-bold">{label}</div>
              <div className="p-2 whitespace-pre-wrap">{value || 'Not recorded'}</div>
            </div>
          ))}
        </div>
        <Footer />
      </div>

      {report.areas.map((area) => (
        <div key={area.id} className="pdf-page w-[210mm] min-h-[297mm] bg-white text-neutral-900 p-[12mm] shadow-2xl box-border flex flex-col">
          <Header report={report} title={template.shortLabel} />
          <div className="bg-slate-100 border border-neutral-300 px-3 py-2 flex justify-between text-[10px]">
            <span className="font-extrabold text-[#0a2540]">{area.name.toUpperCase()}</span>
            <span className="font-bold text-cyan-700">
              {photoCount(report, area)} {photoCount(report, area) === 1 ? 'photo' : 'photos'}
            </span>
          </div>

          {template.conditionMatrix ? (
            <div className="border-x border-b border-neutral-300">
              <div className="grid grid-cols-[42mm_8mm_8mm_8mm_1fr] bg-neutral-50 border-b border-neutral-300 text-[9px] font-bold">
                <div className="p-2 border-r border-neutral-300">Item</div>
                <div className="p-2 text-center border-r border-neutral-300">Cln</div>
                <div className="p-2 text-center border-r border-neutral-300">Udg</div>
                <div className="p-2 text-center border-r border-neutral-300">Wkg</div>
                <div className="p-2">Agent comments</div>
              </div>
              {area.items.map((item) => (
                <div key={item.id} className="grid grid-cols-[42mm_8mm_8mm_8mm_1fr] border-b last:border-b-0 border-neutral-200 text-[9px]">
                  <div className="p-2 font-bold border-r border-neutral-200">{item.name}</div>
                  {[item.clean, item.undamaged, item.working].map((state, index) => (
                    <div key={index} className={`p-2 text-center font-extrabold border-r border-neutral-200 ${state === false ? 'text-red-700' : ''}`}>
                      {state === null || state === undefined ? '' : state ? 'Y' : 'N'}
                    </div>
                  ))}
                  <div className="p-2 whitespace-pre-wrap">{item.agentComments}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border-x border-b border-neutral-300">
              <div className="grid grid-cols-[42mm_1fr] bg-neutral-50 border-b border-neutral-300 text-[9px] font-bold">
                <div className="p-2 border-r border-neutral-300">Item</div>
                <div className="p-2">Findings / observations</div>
              </div>
              {area.items.map((item) => (
                <div key={item.id} className="grid grid-cols-[42mm_1fr] border-b last:border-b-0 border-neutral-200 text-[9px]">
                  <div className="p-2 font-bold border-r border-neutral-200">{item.name}</div>
                  <div className="p-2 whitespace-pre-wrap">{item.agentComments}</div>
                </div>
              ))}
            </div>
          )}
          <Footer />
        </div>
      ))}

      {photoPages.map((page, pageIndex) => (
        <div key={pageIndex} className="pdf-page w-[210mm] min-h-[297mm] bg-white text-neutral-900 p-[12mm] shadow-2xl box-border flex flex-col">
          <Header report={report} title="Photographic Evidence" />
          {pageIndex === 0 && (
            <div className="bg-slate-100 border border-neutral-300 px-3 py-2 text-sm font-extrabold text-[#0a2540] mb-3">
              Photographic Evidence ({orderedPhotos.length} photos)
            </div>
          )}
          <div className="grid grid-cols-3 grid-rows-4 gap-2 flex-1 min-h-0">
            {page.map((photo) => (
              <div key={photo.id} className="border border-neutral-200 min-w-0 flex flex-col">
                <div className="px-1.5 py-1 text-[8px] font-bold">{photo.name}</div>
                <div className="bg-neutral-50 flex-1 min-h-0 flex items-center justify-center overflow-hidden">
                  {photo.dataUrl || photo.url ? (
                    <img src={photo.dataUrl || photo.url} alt={photo.name} className="max-w-full max-h-full object-contain" />
                  ) : (
                    <span className="text-[8px] text-neutral-400">Image unavailable</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Footer />
        </div>
      ))}

      <div className="pdf-page w-[210mm] min-h-[297mm] bg-white text-neutral-900 p-[12mm] shadow-2xl box-border flex flex-col">
        <Header report={report} title={template.shortLabel} />
        <div className="bg-slate-100 border border-neutral-300 px-3 py-2 text-sm font-extrabold text-[#0a2540]">
          Report Summary & Outcomes
        </div>

        <section className="mt-4 border border-neutral-300">
          <div className="bg-slate-50 border-b border-neutral-300 px-3 py-2 text-xs font-extrabold text-[#0a2540]">
            {template.additionalCommentsLabel}
          </div>
          <div className="min-h-[32mm] p-3 text-[10px] whitespace-pre-wrap">
            {report.details.additionalComments || 'No comments recorded.'}
          </div>
        </section>

        {template.maintenanceCommentsLabel && (
          <section className="mt-4 border border-neutral-300">
            <div className="bg-slate-50 border-b border-neutral-300 px-3 py-2 text-xs font-extrabold text-red-700">
              {template.maintenanceCommentsLabel}
            </div>
            <div className="min-h-[32mm] p-3 text-[10px] whitespace-pre-wrap">
              {report.details.maintenanceComments || 'No comments recorded.'}
            </div>
          </section>
        )}

        <div className="mt-4 border border-neutral-300 text-[10px]">
          {fields.filter((field) => field.section === 'outcome').map((field) => (
            <div key={field.key} className="grid grid-cols-[52mm_1fr] border-b last:border-b-0 border-neutral-200">
              <div className="bg-slate-50 p-2 font-bold">{field.label}</div>
              <div className="p-2 whitespace-pre-wrap">
                {field.kind === 'date'
                  ? formatAustralianDate(templateFields[field.key])
                  : templateFields[field.key] || 'Not recorded'}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 border border-neutral-300">
          <div className="bg-slate-100 border-b border-neutral-300 px-3 py-2 text-xs font-extrabold text-[#0a2540]">
            {template.signoffTitle}
          </div>
          <div className="grid grid-cols-3 min-h-[18mm] text-[10px]">
            <div className="p-3 border-r border-neutral-300"><strong>Print Name</strong><br />{report.details.agentSignName || report.details.inspectingAgent || 'Not recorded'}</div>
            <div className="p-3 border-r border-neutral-300"><strong>Signature</strong><br /><span className="italic">{report.details.agentSignName || report.details.inspectingAgent}</span></div>
            <div className="p-3"><strong>Date</strong><br />{formatAustralianDate(report.details.agentSignDate || report.details.inspectionDate)}</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-[10px] font-extrabold">DISCLAIMER:</div>
          <p className="mt-1 text-[9px] italic text-neutral-500">{report.details.disclaimerText}</p>
        </div>
        <Footer />
      </div>
    </div>
  );
};
