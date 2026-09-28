import React from 'react';
import { PROINSPECT_COMPANY } from '../config/company';
import { formatAustralianDate, splitTenantNames } from '../lib/reportFormatting';
import { ReportData } from '../types/report';
import { ProInspectLogo } from './ProInspectLogo';

interface Props {
  report: ReportData;
}

const PAGE_ITEM_LIMIT = 8;

function signatureNames(report: ReportData): string[] {
  const parsed = splitTenantNames(report.details.tenants, 3);
  const names = [
    report.details.tenant1SignName || parsed[0] || '',
    report.details.tenant2SignName || parsed[1] || '',
    report.details.tenant3SignName || parsed[2] || '',
  ].filter((name) => name.trim());
  return names.length ? names : [''];
}

export const KeyReceiptDocument: React.FC<Props> = ({ report }) => {
  const details = report.details;
  const items = report.areas.flatMap((area) => area.items);
  const pages: typeof items[] = [];
  const source = items.length ? items : [{ id: 'blank', name: 'No keys / access devices recorded', quantity: '', identifier: '', agentComments: '' }];

  for (let index = 0; index < source.length; index += PAGE_ITEM_LIMIT) {
    pages.push(source.slice(index, index + PAGE_ITEM_LIMIT));
  }

  return (
    <div id="report-print-container" className="flex flex-col items-center gap-8 bg-neutral-200/80 p-4 md:p-8">
      {pages.map((pageItems, pageIndex) => {
        const finalPage = pageIndex === pages.length - 1;
        return (
          <div
            key={pageIndex}
            className="pdf-page w-[210mm] min-h-[297mm] bg-white px-[14mm] py-[12mm] flex flex-col shadow-2xl box-border text-neutral-800"
          >
            <div className="flex justify-between items-start border-b-2 border-cyan-600 pb-4">
              <ProInspectLogo size="md" showTagline />
              <div className="text-right">
                <h1 className="text-2xl font-black tracking-tight text-[#0a2540]">KEY RECEIPT</h1>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500 mt-1">
                  Tenancy Key / Access Device Handover
                </p>
              </div>
            </div>

            {pageIndex === 0 ? (
              <div className="mt-5">
                <div className="bg-slate-100 border border-slate-300 px-3 py-2 text-xs font-black uppercase tracking-wide text-[#0a2540]">
                  Key Handover Details
                </div>
                <div className="border-x border-b border-slate-300 text-[10px]">
                  {[
                    ['Property Address', details.propertyAddress || 'Not recorded'],
                    ['Tenant / Recipient', details.tenants || 'Not recorded'],
                    ['Tenancy Commencement Date', formatAustralianDate(details.tenancyStartDate) || 'Not recorded'],
                    ['Date Keys / Access Devices Received', formatAustralianDate(details.inspectionDate) || 'Not recorded'],
                    ['Time Received', details.keyReceiptTime || 'Not recorded'],
                    ['Issued By', details.inspectingAgent || 'Not recorded'],
                    ['Reference', details.referenceNumber || 'Not recorded'],
                  ].map(([label, value]) => (
                    <div key={label} className="grid grid-cols-[48mm_1fr] border-t first:border-t-0 border-slate-200">
                      <div className="bg-slate-50 p-2 font-bold border-r border-slate-200">{label}</div>
                      <div className="p-2">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4 text-xs font-bold text-neutral-500">
                Key Receipt — continuation
              </div>
            )}

            <div className="mt-5">
              <div className="bg-slate-100 border border-slate-300 px-3 py-2 text-xs font-black uppercase tracking-wide text-[#0a2540]">
                {pageIndex === 0 ? 'Keys & Access Devices Received' : 'Keys & Access Devices Received — Continued'}
              </div>
              <div className="grid grid-cols-[20mm_62mm_1fr] bg-neutral-50 border-x border-b border-slate-300 text-[9px] font-bold uppercase text-neutral-600">
                <div className="p-2 border-r border-slate-300 text-center">Quantity</div>
                <div className="p-2 border-r border-slate-300">Key / Access Device</div>
                <div className="p-2">Identifier / Notes</div>
              </div>
              <div className="border-x border-b border-slate-300">
                {pageItems.map((item) => (
                  <div key={item.id} className="grid grid-cols-[20mm_62mm_1fr] min-h-[12mm] text-[10px] border-t first:border-t-0 border-slate-200">
                    <div className="p-2 border-r border-slate-200 text-center font-bold">{item.quantity || ''}</div>
                    <div className="p-2 border-r border-slate-200 font-semibold">{item.name}</div>
                    <div className="p-2">{item.identifier || ''}</div>
                  </div>
                ))}
              </div>
            </div>

            {finalPage && (
              <>
                {details.additionalComments?.trim() && (
                  <div className="mt-5">
                    <div className="text-[10px] font-black uppercase text-[#0a2540] mb-1">Handover Notes / Comments</div>
                    <div className="border border-slate-300 rounded p-3 text-[10px] whitespace-pre-wrap min-h-[18mm]">
                      {details.additionalComments}
                    </div>
                  </div>
                )}

                <div className="mt-5 bg-cyan-50 border border-cyan-200 rounded p-3 text-[10px] leading-relaxed">
                  <strong>Tenant acknowledgement:</strong> I/We acknowledge that I/we have received the keys and access devices listed above for the premises stated on this receipt on the date recorded above.
                </div>

                <div className="mt-4">
                  <div className="text-[10px] font-black uppercase text-[#0a2540] mb-2">Tenant Signature</div>
                  <div className="space-y-2">
                    {signatureNames(report).map((name, index) => (
                      <div key={index} className="grid grid-cols-[55mm_1fr_42mm] border border-slate-300 text-[9px] min-h-[18mm]">
                        <div className="p-2 border-r border-slate-300">
                          <div className="font-bold">Tenant {index + 1} — Print Name</div>
                          <div className="text-[11px] font-semibold mt-2">{name}</div>
                        </div>
                        <div className="p-2 border-r border-slate-300">
                          <div className="font-bold">Signature</div>
                        </div>
                        <div className="p-2">
                          <div className="font-bold">Date</div>
                          <div className="mt-4">____ / ____ / ________</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 text-[8.5px] italic text-neutral-500 leading-relaxed">
                  {details.disclaimerText}
                </div>
              </>
            )}

            <div className="mt-auto pt-3 border-t border-neutral-300 flex justify-between text-[8px] text-neutral-500">
              <div>
                <strong className="text-[#0a2540]">{details.companyName || PROINSPECT_COMPANY.name}</strong>
                {' · '}
                {details.companyPhone || PROINSPECT_COMPANY.phone}
                {' · '}
                {details.companyEmail || PROINSPECT_COMPANY.email}
              </div>
              <div>{pageIndex + 1} / {pages.length}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
