import React from 'react';
import { ReportData, InspectionArea } from '../types/report';
import { Check } from 'lucide-react';
import { ProInspectLogo } from './ProInspectLogo';

interface ReportPreviewProps {
  report: ReportData;
}

export const ReportDocument: React.FC<ReportPreviewProps> = ({ report }) => {
  const { details, areas, photos } = report;

  // Let's divide areas across pages nicely
  // Standard format has:
  // Page 1: Cover Page
  // Page 2: Instruction / Terms (Form 1a RTA standard)
  // Page 3: Tenancy Details header
  // Subsequent pages: Table sections (2-3 areas per page)
  // Photo pages: 9 photos per page (3x3 grid) with caption "Area: Overall (photo X of Y)"
  // Final pages: Water meter, signatures & disclaimer, and keys form

  const totalPhotos = photos.length;

  // Chunk areas into inspection pages (e.g. 2 areas per page, or 1 large area)
  // We calculate dynamic page splits so tables don't look cramped
  const areaPages: InspectionArea[][] = [];
  let currentChunk: InspectionArea[] = [];
  let currentItemsCount = 0;

  areas.forEach((area) => {
    const areaWeight = Math.max(area.items.length, 3);
    if (currentChunk.length > 0 && currentItemsCount + areaWeight > 16) {
      areaPages.push(currentChunk);
      currentChunk = [area];
      currentItemsCount = areaWeight;
    } else {
      currentChunk.push(area);
      currentItemsCount += areaWeight;
    }
  });
  if (currentChunk.length > 0) {
    areaPages.push(currentChunk);
  }

  // Photo pages: 9 photos per page
  const photosPerPage = 9;
  const photoPages: typeof photos[] = [];
  for (let i = 0; i < photos.length; i += photosPerPage) {
    photoPages.push(photos.slice(i, i + photosPerPage));
  }

  // Calculate total pages
  // Page 1: Cover
  // Page 2: Instructions (Form 1a RTA page)
  // Page 3: Tenancy Details Form
  // Next N pages: Inspection Area Tables
  // Next M pages: Photos
  // Next 1 page: Signatures, Water meter & Disclaimer
  // Next 1 page: Keys Supplied Form
  const totalPages =
    1 + // Cover
    1 + // Instruction
    1 + // Tenancy Details
    areaPages.length +
    photoPages.length +
    1 + // Signatures
    1;  // Keys form

  let pageCounter = 1;

  return (
    <div id="report-print-container" className="flex flex-col items-center gap-8 bg-neutral-200/80 p-4 md:p-8">
      {/* ================= PAGE 1: COVER PAGE ================= */}
      <div className="pdf-page w-[210mm] min-h-[297mm] h-[297mm] bg-white text-neutral-900 p-[18mm] flex flex-col justify-between shadow-2xl relative box-border overflow-hidden select-text">
        <div>
          {/* Top header with ProInspect Agency Logo & Details */}
          <div className="flex justify-between items-start">
            <ProInspectLogo size="md" showTagline={true} />

            <div className="text-right text-xs text-neutral-700 leading-snug space-y-0.5 font-medium">
              <p className="font-bold text-[#0a2540] text-sm">{details.companyName || 'ProInspect'}</p>
              <p>{details.companyAddress || '19 Bonnard Crescent Ashby WA 6065'}</p>
              {details.companyEmail && (
                <p>
                  <span className="text-neutral-500 font-normal">Email: </span>
                  <a href={`mailto:${details.companyEmail}`} className="text-[#0891b2] hover:underline font-semibold">
                    {details.companyEmail}
                  </a>
                </p>
              )}
              {details.companyWebsite && (
                <p>
                  <span className="text-neutral-500 font-normal">Web: </span>
                  <span className="text-[#0a2540] font-semibold">{details.companyWebsite.replace('https://', '')}</span>
                </p>
              )}
              {details.companyPhone && <p>{details.companyPhone}</p>}
            </div>
          </div>

          {/* Title and Address */}
          <div className="mt-24 text-center">
            <h2 className="text-2xl md:text-3xl font-extrabold text-neutral-900 tracking-tight">
              Residential Tenancy {details.reportType} Condition Report
            </h2>
            <div className="mt-4 inline-block bg-neutral-900 text-white font-bold text-lg md:text-xl px-5 py-2 rounded">
              {details.propertyAddress || 'Townsville, QLD 4810'}
            </div>
          </div>

          {/* Cover Hero Photo */}
          <div className="mt-12 flex justify-center">
            <div className="w-[140mm] h-[95mm] bg-neutral-100 border border-neutral-300 rounded shadow-sm overflow-hidden flex items-center justify-center">
              <img
                src={
                  details.coverPhotoUrl ||
                  photos[0]?.thumbnailLink ||
                  photos[0]?.dataUrl ||
                  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200&auto=format&fit=crop&q=80'
                }
                alt="Property exterior"
                className="w-full h-full object-cover"
                crossOrigin="anonymous"
              />
            </div>
          </div>
        </div>

        {/* Bottom Details */}
        <div className="text-center space-y-2 mb-6">
          <p className="text-sm font-semibold text-neutral-800">
            Report completed on {details.inspectionDate || 'Wednesday 10/04/2024'}
          </p>
          <p className="text-sm text-neutral-600 font-medium">
            Prepared by {details.inspectingAgent || 'Admin Team'}
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center text-[10px] text-neutral-500 border-t border-neutral-200 pt-3">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="font-bold text-[#0a2540]">ProInspect Systems</span>
            <span className="text-neutral-300">•</span>
            <span>INSPECT. REPORT. PROTECT.</span>
          </div>
          <span className="font-semibold text-[#0a2540]">{details.companyWebsite || 'https://proinspect.systems'}</span>
        </div>
      </div>

      {/* ================= PAGE 2: STATUTORY INSTRUCTIONS (FORM 1A RTA) ================= */}
      {(() => {
        pageCounter = 2;
        return (
          <div className="pdf-page w-[210mm] min-h-[297mm] h-[297mm] bg-white text-neutral-900 p-[15mm] flex flex-col justify-between shadow-2xl relative box-border overflow-hidden select-text text-[11px] leading-tight">
            <div>
              {/* Header */}
              <div className="flex justify-between items-start border-b-2 border-neutral-900 pb-2">
                <div>
                  <h3 className="text-base font-bold text-neutral-900">
                    {details.formName || 'Entry condition report – general tenancies (Form 1a)'}
                  </h3>
                  <p className="text-[10px] text-neutral-600 italic">
                    {details.actNotice || 'Residential Tenancies and Rooming Accommodation Act 2008 (Section 65)'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 border border-neutral-800 px-2 py-0.5 rounded text-[10px] font-bold">
                  <span className="bg-neutral-800 text-white px-1 rounded-xs">rta</span>
                  <span>residential tenancies authority</span>
                </div>
              </div>

              {/* Instructions text */}
              <div className="mt-4 space-y-3 text-neutral-800">
                <p>
                  The Entry (and Exit) reports provide evidence of the condition of the premises at the beginning and ending
                  of the tenancy. Take time to fill these forms in carefully. These documents may be referred to as evidence
                  if there is a dispute over the bond refund at the end of the tenancy.
                </p>

                <div>
                  <h4 className="font-bold text-neutral-900 mb-1">Lessor/agent</h4>
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>Inspect the premises</li>
                    <li>Mark each item on the list clean, working, undamaged (where applicable).</li>
                    <li>Make a note of any extra items in the additional comments/information section.</li>
                    <li>Give a signed copy of the report to the tenant. Keep a copy for your own records.</li>
                    <li>Ask the tenant to add their comments to the report, initial each page and return it to you within 7 days.</li>
                    <li>
                      If the tenant disagrees about the condition of the premises, encourage them to discuss it with you.
                      Comments can be recorded in the additional comments/information section or by attaching a separate page.
                      <div className="mt-1 flex items-center gap-4 font-semibold">
                        <span>Supporting documentation has been attached</span>
                        <label className="flex items-center gap-1">
                          <input type="checkbox" checked={details.supportingDocumentationAttached} readOnly className="h-3 w-3" /> Yes
                        </label>
                        <label className="flex items-center gap-1">
                          <input type="checkbox" checked={!details.supportingDocumentationAttached} readOnly className="h-3 w-3" /> No
                        </label>
                      </div>
                    </li>
                    <li>Give a copy of the final report back to the tenant within 14 days of receiving it.</li>
                    <li>You must keep a copy of the report for at least one year after the tenancy agreement ends.</li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-bold text-neutral-900 mb-1">Tenant</h4>
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>Inspect the premises</li>
                    <li>Comment on any item where you disagree with the lessor/agent, or if you believe the report does not reflect the true condition of the premises.</li>
                    <li>Talk to the lessor/agent if you disagree about the condition of the premises.</li>
                    <li>Initial each page of the report and send it to the lessor/agent within 7 days.</li>
                    <li>The lessor/agent must send you a copy of the final report. You may also want to make a copy for your own records.</li>
                  </ol>
                </div>

                <p className="bg-neutral-100 p-2 border-l-2 border-neutral-700 italic">
                  If the condition report is not given to the tenant/s within 7 days of occupation, the tenant/s should obtain,
                  complete and sign their own form and submit to the lessor/agent.
                </p>

                <div className="border border-neutral-300 p-2 rounded">
                  <p className="font-medium">The tenant/s have initially received a copy of this report on:</p>
                  <div className="mt-2 flex gap-4 text-xs font-semibold">
                    <span className="border-b border-neutral-400 pb-1 w-24">Day: Wednesday</span>
                    <span className="border-b border-neutral-400 pb-1 w-36">Date: {details.inspectionDate || '10 / 04 / 2024'}</span>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-neutral-200">
                  <h4 className="font-bold text-neutral-900">Important</h4>
                  <ul className="list-disc pl-5 space-y-1 mt-1 text-[10px]">
                    <li>When renewing a tenancy agreement with the same tenant, there is no requirement to complete a new Entry condition report.</li>
                    <li>The original Entry condition report will remain valid unless the parties agree to prepare a new one when renewed.</li>
                    <li>The rental property must meet minimum housing standards when the tenant moves in and throughout the agreement.</li>
                  </ul>
                  <p className="font-bold mt-2 text-neutral-900 text-[10.5px]">
                    Entry condition reports must be completed in accordance with the Act. Penalties apply.
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom initials bar */}
            <div className="flex justify-between items-center text-[10px] border-t border-neutral-300 pt-2 font-medium">
              <div className="flex items-center gap-2">
                <span>Tenant's Initial(s):</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">1.</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">2.</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">3.</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">Date: &nbsp; / &nbsp; /</span>
              </div>
              <div className="font-bold text-neutral-700">
                {pageCounter} / {totalPages}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ================= PAGE 3: TENANCY DETAILS ================= */}
      {(() => {
        pageCounter = 3;
        return (
          <div className="pdf-page w-[210mm] min-h-[297mm] h-[297mm] bg-white text-neutral-900 p-[15mm] flex flex-col justify-between shadow-2xl relative box-border overflow-hidden select-text text-[11px]">
            <div>
              <div className="flex justify-between items-start border-b-2 border-neutral-900 pb-2">
                <div>
                  <h3 className="text-base font-bold text-neutral-900">
                    {details.formName || 'Entry condition report – general tenancies (Form 1a)'}
                  </h3>
                  <p className="text-[10px] text-neutral-600 italic">
                    {details.actNotice || 'Residential Tenancies and Rooming Accommodation Act 2008 (Section 65)'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 border border-neutral-800 px-2 py-0.5 rounded text-[10px] font-bold">
                  <span className="bg-neutral-800 text-white px-1 rounded-xs">rta</span>
                  <span>residential tenancies authority</span>
                </div>
              </div>

              {/* Tenancy details card */}
              <div className="mt-8">
                <div className="bg-neutral-900 text-white font-bold text-xs uppercase px-3 py-1.5 tracking-wider">
                  Tenancy Details
                </div>

                <div className="border border-neutral-400 border-t-0 divide-y divide-neutral-300">
                  <div className="flex p-3">
                    <div className="w-44 font-bold text-neutral-800 text-xs">Property Address:</div>
                    <div className="flex-1 font-semibold text-neutral-900 bg-neutral-100 px-2 py-1 rounded">
                      {details.propertyAddress}
                    </div>
                  </div>

                  <div className="flex p-3">
                    <div className="w-44 font-bold text-neutral-800 text-xs">Inspecting Agent:</div>
                    <div className="flex-1 font-medium text-neutral-900">
                      {details.inspectingAgent}
                    </div>
                  </div>

                  <div className="flex p-3">
                    <div className="w-44 font-bold text-neutral-800 text-xs">Inspection Date:</div>
                    <div className="flex-1 font-medium text-neutral-900">
                      {details.inspectionDate}
                    </div>
                  </div>

                  <div className="flex p-3">
                    <div className="w-44 font-bold text-neutral-800 text-xs">Tenancy Start Date:</div>
                    <div className="flex-1 font-medium text-neutral-900">
                      {details.tenancyStartDate}
                    </div>
                  </div>

                  <div className="flex p-3">
                    <div className="w-44 font-bold text-neutral-800 text-xs">Tenant/s:</div>
                    <div className="flex-1 font-medium text-neutral-900 bg-neutral-50 px-2 py-1">
                      {details.tenants || 'Standard Tenancy'}
                    </div>
                  </div>

                  <div className="flex p-3">
                    <div className="w-44 font-bold text-neutral-800 text-xs">Report Return Date:</div>
                    <div className="flex-1 font-medium text-neutral-900">
                      {details.reportReturnDate}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom initials bar */}
            <div className="flex justify-between items-center text-[10px] border-t border-neutral-300 pt-2 font-medium">
              <div className="flex items-center gap-2">
                <span>Tenant's Initial(s):</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">1.</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">2.</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">3.</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">Date: &nbsp; / &nbsp; /</span>
              </div>
              <div className="font-bold text-neutral-700">
                {pageCounter} / {totalPages}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ================= INSPECTION AREA PAGES (PAGES 4 TO N) ================= */}
      {areaPages.map((areaGroup, groupIndex) => {
        pageCounter++;
        const thisPageNum = pageCounter;

        return (
          <div
            key={`page-area-group-${groupIndex}`}
            className="pdf-page w-[210mm] min-h-[297mm] h-[297mm] bg-white text-neutral-900 p-[12mm] flex flex-col justify-between shadow-2xl relative box-border overflow-hidden select-text text-[10px]"
          >
            <div>
              {/* Running header matching sample */}
              <div className="flex justify-between items-center border-b-2 border-neutral-800 pb-1 mb-2 font-semibold">
                <span className="bg-neutral-900 text-white px-2 py-0.5 text-[10px]">
                  {details.propertyAddress}
                </span>
                <span className="text-neutral-800 text-[11px] font-bold">
                  {details.reportType} Condition Report
                </span>
              </div>

              {/* Main Table Structure */}
              <table className="w-full border-collapse border border-neutral-400 text-left">
                {/* Column Headers */}
                <thead>
                  <tr className="bg-neutral-100 text-neutral-900 font-bold border-b border-neutral-400">
                    <th colSpan={4} className="border-r border-neutral-400 p-1.5 text-center text-xs">
                      Agent section
                      <div className="text-[8.5px] font-normal text-neutral-600 mt-0.5">
                        Each item has been given a column description of 'clean', 'undamaged', 'working'. Tick each column that applies to the item and make any necessary comments.
                      </div>
                    </th>
                    <th colSpan={2} className="p-1.5 text-center text-xs">
                      Tenant section
                      <div className="text-[8.5px] font-normal text-neutral-600 mt-0.5">
                        If you disagree with the agent's report of an item, make a comment in this section. You should also note anything which seems unsafe or may be an injury risk.
                      </div>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {areaGroup.map((area) => (
                    <React.Fragment key={area.id}>
                      {/* Area Header Row */}
                      <tr className="bg-neutral-200/90 font-bold text-neutral-900 border-t-2 border-b border-neutral-400">
                        <td className="w-28 p-1 text-[11px] font-extrabold">{area.name}</td>
                        <td className="w-7 text-center p-1 text-[9px] font-bold border-l border-neutral-400">Cln</td>
                        <td className="w-7 text-center p-1 text-[9px] font-bold border-l border-neutral-400">Udg</td>
                        <td className="w-7 text-center p-1 text-[9px] font-bold border-l border-neutral-400">Wkg</td>
                        <td className="border-l border-r border-neutral-400 p-1 text-center font-bold text-[9px]">
                          Agent comments
                          <span className="block font-normal text-[7.5px] text-neutral-600 italic">Cln = Clean, Udg = Undamaged, Wkg = Working</span>
                        </td>
                        <td className="w-12 text-center p-1 text-[8.5px] font-bold border-r border-neutral-400">Tenant agrees</td>
                        <td className="w-44 text-center p-1 text-[9px] font-bold">Tenant comments</td>
                      </tr>

                      {/* Overall photos reference row */}
                      {area.overallPhotoCount ? (
                        <tr className="border-b border-neutral-300 text-blue-700 font-medium">
                          <td className="p-1 font-semibold text-neutral-700">Overall</td>
                          <td className="border-l border-neutral-300"></td>
                          <td className="border-l border-neutral-300"></td>
                          <td className="border-l border-neutral-300"></td>
                          <td className="border-l border-r border-neutral-300 p-1 text-[9.5px]">
                            ({area.overallPhotoCount} photos, see photo gallery)
                          </td>
                          <td className="border-r border-neutral-300"></td>
                          <td></td>
                        </tr>
                      ) : null}

                      {/* Items rows */}
                      {area.items.map((item) => (
                        <tr key={item.id} className="border-b border-neutral-300 hover:bg-neutral-50/50">
                          <td className="p-1 font-medium text-neutral-800 align-top">{item.name}</td>
                          <td className="text-center p-0.5 border-l border-neutral-300 align-top">
                            {item.clean ? <Check className="w-3.5 h-3.5 mx-auto text-neutral-900 stroke-[2.5]" /> : null}
                          </td>
                          <td className="text-center p-0.5 border-l border-neutral-300 align-top">
                            {item.undamaged ? <Check className="w-3.5 h-3.5 mx-auto text-neutral-900 stroke-[2.5]" /> : null}
                          </td>
                          <td className="text-center p-0.5 border-l border-neutral-300 align-top">
                            {item.working ? <Check className="w-3.5 h-3.5 mx-auto text-neutral-900 stroke-[2.5]" /> : null}
                          </td>
                          <td className="border-l border-r border-neutral-300 p-1 align-top whitespace-pre-line text-[9px] text-neutral-800 leading-tight">
                            {item.agentComments}
                          </td>
                          <td className="border-r border-neutral-300 text-center p-0.5 align-top">
                            {item.tenantAgrees !== undefined && item.tenantAgrees !== null ? (
                              item.tenantAgrees ? '✔' : 'No'
                            ) : null}
                          </td>
                          <td className="p-1 align-top text-[9px] text-neutral-700">
                            {item.tenantComments || ''}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom initials bar */}
            <div className="flex justify-between items-center text-[10px] border-t border-neutral-300 pt-2 font-medium">
              <div className="flex items-center gap-2">
                <span>Tenant's Initial(s):</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">1.</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">2.</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">3.</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">Date: &nbsp; / &nbsp; /</span>
              </div>
              <div className="font-bold text-neutral-700">
                {thisPageNum} / {totalPages}
              </div>
            </div>
          </div>
        );
      })}

      {/* ================= PHOTO GALLERY PAGES (3x3 Grid Matching Sample) ================= */}
      {photoPages.map((photoGroup, pIdx) => {
        pageCounter++;
        const thisPageNum = pageCounter;

        return (
          <div
            key={`page-photos-${pIdx}`}
            className="pdf-page w-[210mm] min-h-[297mm] h-[297mm] bg-white text-neutral-900 p-[12mm] flex flex-col justify-between shadow-2xl relative box-border overflow-hidden select-text text-[10px]"
          >
            <div>
              {/* Running header matching sample */}
              <div className="flex justify-between items-center border-b-2 border-neutral-800 pb-1 mb-2 font-semibold">
                <span className="bg-neutral-900 text-white px-2 py-0.5 text-[10px]">
                  {details.propertyAddress}
                </span>
                <span className="text-neutral-800 text-[11px] font-bold">
                  {details.reportType} Condition Report
                </span>
              </div>

              {pIdx === 0 && (
                <div className="bg-neutral-100 border border-neutral-300 px-2 py-1 font-bold text-xs text-neutral-800 mb-3">
                  Agent Inspection Photos ({photos.length} photos)
                </div>
              )}

              {/* 3x3 Photo Grid */}
              <div className="grid grid-cols-3 gap-3">
                {photoGroup.map((photo) => (
                  <div key={photo.id} className="flex flex-col">
                    <span className="text-[8.5px] font-medium text-neutral-800 truncate mb-0.5">
                      {photo.name || `${photo.areaName || 'General'}: Overall (photo ${photo.photoIndex || 1})`}
                    </span>
                    <div className="w-full h-[65mm] bg-neutral-100 border border-neutral-300 rounded overflow-hidden flex items-center justify-center">
                      <img
                        src={photo.dataUrl || photo.thumbnailLink || 'https://via.placeholder.com/300x400?text=Inspection+Photo'}
                        alt={photo.name}
                        className="w-full h-full object-cover"
                        crossOrigin="anonymous"
                        loading="lazy"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom initials bar */}
            <div className="flex justify-between items-center text-[10px] border-t border-neutral-300 pt-2 font-medium">
              <div className="flex items-center gap-2">
                <span>Tenant's Initial(s):</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">1.</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">2.</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">3.</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">Date: &nbsp; / &nbsp; /</span>
              </div>
              <div className="font-bold text-neutral-700">
                {thisPageNum} / {totalPages}
              </div>
            </div>
          </div>
        );
      })}

      {/* ================= SIGNATURES & DISCLAIMER PAGE (PAGE 56 in sample) ================= */}
      {(() => {
        pageCounter++;
        const thisPageNum = pageCounter;

        return (
          <div className="pdf-page w-[210mm] min-h-[297mm] h-[297mm] bg-white text-neutral-900 p-[15mm] flex flex-col justify-between shadow-2xl relative box-border overflow-hidden select-text text-[10.5px]">
            <div>
              {/* Header */}
              <div className="flex justify-between items-center border-b-2 border-neutral-800 pb-1 mb-3 font-semibold">
                <span className="bg-neutral-900 text-white px-2 py-0.5 text-[10px]">
                  {details.propertyAddress}
                </span>
                <span className="text-neutral-800 text-[11px] font-bold">
                  {details.reportType} Condition Report
                </span>
              </div>

              {/* Additional comments/information box */}
              <div className="mb-4">
                <h4 className="font-bold text-neutral-900 mb-1">Additional comments/information</h4>
                <div className="w-full min-h-[25mm] border border-neutral-400 p-2 text-[10px] text-neutral-800">
                  {details.additionalComments || 'N/A'}
                </div>
              </div>

              {/* Water charging section */}
              <div className="mb-5 space-y-2">
                <h4 className="font-bold text-neutral-900">Water charging</h4>
                <p className="text-[9.5px] text-neutral-700 leading-tight">
                  Tenants can only be charged for all water consumption if the rental premises are individually metered (or water is delivered by vehicle), the agreement states the tenant must pay for water and the premises are water efficient.
                </p>

                <div className="flex items-center gap-6 mt-1 font-medium">
                  <span>Are the premises individually metered?</span>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={details.waterIndividuallyMetered} readOnly className="h-3 w-3" /> Yes
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={!details.waterIndividuallyMetered} readOnly className="h-3 w-3" /> No
                  </label>
                </div>

                <div className="flex items-center gap-4 mt-1 font-medium">
                  <span>Water meter reading at start of tenancy:</span>
                  <div className="flex-1 border border-neutral-400 h-6 px-2 flex items-center text-xs">
                    {details.waterMeterReading || 'Not applicable'}
                  </div>
                </div>

                <div className="flex items-center gap-6 mt-1 font-medium">
                  <span>Are the premises water efficient?</span>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={details.waterEfficient} readOnly className="h-3 w-3" /> Yes
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={!details.waterEfficient} readOnly className="h-3 w-3" /> No
                  </label>
                </div>
                <p className="text-[8.5px] text-neutral-500 italic">
                  Certain fixtures must have the equivalent of a 3 star WELS rating or higher (evidence available if/as required).
                </p>
              </div>

              {/* Agent Signature at START of Tenancy */}
              <div className="mb-4">
                <div className="bg-neutral-100 border border-neutral-400 px-2 py-1 font-bold text-neutral-900">
                  Agent Signature at the START of the Tenancy
                </div>
                <div className="grid grid-cols-3 border border-neutral-400 border-t-0 text-[10px]">
                  <div className="p-2 border-r border-neutral-300">
                    <span className="font-semibold text-neutral-700">Print Name: </span>
                    <span className="font-bold text-neutral-900">{details.agentSignName || 'ProInspect Team'}</span>
                  </div>
                  <div className="p-2 border-r border-neutral-300">
                    <span className="font-semibold text-neutral-700">Signature: </span>
                    <span className="font-serif italic font-bold text-neutral-800">{details.agentSignName || 'ProInspect Team'}</span>
                  </div>
                  <div className="p-2">
                    <span className="font-semibold text-neutral-700">Date: </span>
                    <span>{details.agentSignDate || details.inspectionDate}</span>
                  </div>
                </div>
              </div>

              {/* Tenant Acknowledgement & Signature */}
              <div className="mb-5">
                <div className="bg-neutral-100 border border-neutral-400 px-2 py-1 font-bold text-neutral-900">
                  Tenant's Acknowledgement & Signature
                </div>
                <p className="text-[9px] text-neutral-600 px-2 py-1 border-x border-neutral-400">
                  I/we have received and read the Condition Report for the above property and understand that it must be returned within 7 days.
                </p>
                <div className="grid grid-cols-3 border border-neutral-400 text-[10px]">
                  <div className="p-2 border-r border-neutral-300">
                    <span className="font-semibold text-neutral-700">Tenant 1 Name: </span>
                    <span className="font-bold text-neutral-900">{details.tenants || '________________'}</span>
                  </div>
                  <div className="p-2 border-r border-neutral-300">
                    <span className="font-semibold text-neutral-700">Signature: </span>
                  </div>
                  <div className="p-2">
                    <span className="font-semibold text-neutral-700">Date: </span>
                    <span>&nbsp; / &nbsp; /</span>
                  </div>
                </div>
              </div>

              {/* Disclaimer */}
              <div>
                <h5 className="font-bold text-[9px] uppercase tracking-wider text-neutral-800 mb-0.5">Disclaimer:</h5>
                <p className="text-[8px] text-neutral-600 leading-tight italic text-justify">
                  {details.disclaimerText}
                </p>
              </div>
            </div>

            {/* Bottom initials bar */}
            <div className="flex justify-between items-center text-[10px] border-t border-neutral-300 pt-2 font-medium">
              <div className="flex items-center gap-2">
                <span>Tenant's Initial(s):</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">1.</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">2.</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">3.</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">Date: &nbsp; / &nbsp; /</span>
              </div>
              <div className="font-bold text-neutral-700">
                {thisPageNum} / {totalPages}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ================= KEYS SUPPLIED TO TENANTS FORM (PAGES 57-58 in sample) ================= */}
      {(() => {
        pageCounter++;
        const thisPageNum = pageCounter;

        return (
          <div className="pdf-page w-[210mm] min-h-[297mm] h-[297mm] bg-white text-neutral-900 p-[15mm] flex flex-col justify-between shadow-2xl relative box-border overflow-hidden select-text text-[10.5px]">
            <div>
              {/* Header */}
              <div className="flex justify-between items-center border-b-2 border-neutral-800 pb-1 mb-4 font-semibold">
                <span className="bg-neutral-900 text-white px-2 py-0.5 text-[10px]">
                  {details.propertyAddress}
                </span>
                <span className="text-neutral-800 text-[11px] font-bold">
                  Key Form & Handover
                </span>
              </div>

              <div className="text-center my-4">
                <h3 className="text-xl font-black text-neutral-900">Keys Supplied to Tenants</h3>
                <p className="text-xs text-neutral-600 mt-1">{details.propertyAddress}</p>
              </div>

              {/* Keys photo or list */}
              <div className="border border-neutral-300 p-4 rounded-lg bg-neutral-50 mb-6">
                <h4 className="font-bold text-xs text-neutral-900 uppercase tracking-wider mb-2">
                  Inventory of Keys, Access Cards & Remotes
                </h4>
                <div className="bg-white border border-neutral-200 p-3 rounded font-mono text-xs text-neutral-800 whitespace-pre-line">
                  {details.keysSuppliedSummary}
                </div>
              </div>

              {/* Acknowledgement Items */}
              <div className="space-y-3">
                <h4 className="font-bold text-xs text-neutral-900 uppercase tracking-wider">
                  Tenant's Acknowledgement
                </h4>
                <ol className="list-decimal pl-5 space-y-1.5 text-[10px] text-neutral-800">
                  <li>I/we hereby agree that I/we have been supplied with the above keys/remote(s).</li>
                  <li>All keys/remote(s) must be returned to office upon vacating the premises and if we do not return any items a locksmith will be engaged at my/our cost.</li>
                  <li>Rent will be charged until all keys/remote(s) are returned to the office at the end of the tenancy.</li>
                  <li>Receipt of email containing link to paperless condition report to be completed electronically.</li>
                  <li>I understand that the email link to the paperless condition report will expire after 5 business days.</li>
                  <li>Receipt of the rental agreement.</li>
                  <li>Receipt of "Renting a Home - A Guide for Renters"</li>
                </ol>
              </div>

              {/* Signature block */}
              <div className="mt-8">
                <div className="grid grid-cols-3 border border-neutral-400 text-[10px]">
                  <div className="p-3 border-r border-neutral-300">
                    <span className="font-semibold text-neutral-700">Tenant 1 Name: </span>
                    <span className="font-bold text-neutral-900 block mt-1">{details.tenants || '________________'}</span>
                  </div>
                  <div className="p-3 border-r border-neutral-300">
                    <span className="font-semibold text-neutral-700">Signature: </span>
                  </div>
                  <div className="p-3">
                    <span className="font-semibold text-neutral-700">Date: </span>
                    <span className="block mt-1">&nbsp; / &nbsp; /</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom initials bar */}
            <div className="flex justify-between items-center text-[10px] border-t border-neutral-300 pt-2 font-medium">
              <div className="flex items-center gap-2">
                <span>Tenant's Initial(s):</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">1.</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">2.</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">3.</span>
                <span className="border border-neutral-400 px-3 py-0.5 rounded">Date: &nbsp; / &nbsp; /</span>
              </div>
              <div className="font-bold text-neutral-700">
                {thisPageNum} / {totalPages}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
