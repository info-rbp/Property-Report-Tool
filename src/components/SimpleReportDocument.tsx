import React from 'react';
import { ReportData } from '../types/report';
import { ProInspectLogo } from './ProInspectLogo';

interface Props { report: ReportData }

export const SimpleReportDocument: React.FC<Props> = ({ report }) => {
  const { details, areas, photos } = report;
  const cover = photos.find((photo) => photo.isCover) || photos[0];
  const photosPerPage = 12;
  const photoPages = Array.from({ length: Math.ceil(photos.length / photosPerPage) }, (_, i) =>
    photos.slice(i * photosPerPage, (i + 1) * photosPerPage)
  );

  return (
    <div id="report-print-container" className="flex flex-col items-center gap-8 bg-neutral-200/80 p-4 md:p-8">
      <div className="pdf-page w-[210mm] h-[297mm] bg-white text-neutral-900 p-[18mm] flex flex-col justify-between shadow-2xl box-border overflow-hidden">
        <div>
          <div className="flex justify-between items-start">
            <ProInspectLogo size="md" showTagline={true} />
            <div className="text-right text-xs text-neutral-600">
              <p className="font-bold text-[#0a2540]">{details.companyName || 'ProInspect'}</p>
              {details.companyPhone && <p>{details.companyPhone}</p>}
              {details.companyEmail && <p>{details.companyEmail}</p>}
            </div>
          </div>
          <div className="mt-24 text-center">
            <h1 className="text-3xl font-extrabold">{details.reportType} Inspection Report</h1>
            <p className="mt-4 text-xl font-bold">{details.propertyAddress || 'Property address'}</p>
          </div>
          {cover && (
            <div className="mt-12 w-[140mm] h-[85mm] mx-auto overflow-hidden rounded border border-neutral-300">
              <img src={cover.dataUrl || cover.url} alt={cover.name} className="w-full h-full object-cover" crossOrigin="anonymous" />
            </div>
          )}
        </div>
        <div className="border-t border-neutral-200 pt-4 text-sm">
          <p><span className="font-bold">Inspection date:</span> {details.inspectionDate}</p>
          <p><span className="font-bold">Inspector:</span> {details.inspectingAgent}</p>
          {details.tenants && <p><span className="font-bold">Tenant/s:</span> {details.tenants}</p>}
        </div>
      </div>

      {areas.map((area) => (
        <div key={area.id} className="pdf-page w-[210mm] h-[297mm] bg-white text-neutral-900 p-[12mm] shadow-2xl box-border overflow-hidden">
          <div className="flex justify-between border-b-2 border-neutral-900 pb-2 mb-4 text-sm font-bold">
            <span>{details.propertyAddress}</span>
            <span>{details.reportType} Inspection Report</span>
          </div>
          <h2 className="text-lg font-extrabold mb-3">{area.name}</h2>
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-neutral-100">
                <th className="border border-neutral-300 p-2 text-left w-1/4">Item</th>
                <th className="border border-neutral-300 p-2 text-left">Inspection comments</th>
              </tr>
            </thead>
            <tbody>
              {area.items.map((item) => (
                <tr key={item.id}>
                  <td className="border border-neutral-300 p-2 align-top font-semibold">{item.name}</td>
                  <td className="border border-neutral-300 p-2 align-top whitespace-pre-wrap">{item.agentComments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {photoPages.map((page, pageIndex) => (
        <div key={pageIndex} className="pdf-page w-[210mm] h-[297mm] bg-white text-neutral-900 p-[12mm] shadow-2xl box-border overflow-hidden">
          <div className="flex justify-between border-b-2 border-neutral-900 pb-2 mb-4 text-sm font-bold">
            <span>{details.propertyAddress}</span>
            <span>Inspection Photos</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {page.map((photo) => (
              <div key={photo.id} className="border border-neutral-200 rounded overflow-hidden">
                <div className="h-[45mm] bg-neutral-100">
                  <img src={photo.dataUrl || photo.url} alt={photo.name} className="w-full h-full object-cover" crossOrigin="anonymous" />
                </div>
                <div className="p-1.5 text-[9px] font-medium">{photo.name}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="pdf-page w-[210mm] h-[297mm] bg-white text-neutral-900 p-[18mm] shadow-2xl box-border overflow-hidden">
        <ProInspectLogo size="sm" showTagline={false} />
        <h2 className="text-xl font-extrabold mt-10 mb-4">Additional comments</h2>
        <div className="min-h-[80mm] border border-neutral-300 rounded p-4 whitespace-pre-wrap text-sm">
          {details.additionalComments || 'No additional comments recorded.'}
        </div>
        <div className="mt-10 text-sm space-y-2">
          <p><span className="font-bold">Prepared by:</span> {details.agentSignName || details.inspectingAgent}</p>
          <p><span className="font-bold">Date:</span> {details.agentSignDate || details.inspectionDate}</p>
        </div>
        <p className="mt-10 text-[10px] text-neutral-500">{details.disclaimerText}</p>
      </div>
    </div>
  );
};
