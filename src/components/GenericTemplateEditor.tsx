import React from 'react';
import { getReportTemplate } from '../data/reportCatalogue';
import { TenancyDetails } from '../types/report';

interface Props {
  details: TenancyDetails;
  onChangeDetails: (details: TenancyDetails) => void;
}

export const GenericTemplateEditor: React.FC<Props> = ({ details, onChangeDetails }) => {
  const template = getReportTemplate(details.reportType);
  const fields = template.fields || [];
  const templateFields = details.templateFields || {};

  const updateTemplateField = (key: string, value: string) => {
    onChangeDetails({
      ...details,
      templateFields: {
        ...templateFields,
        [key]: value,
      },
    });
  };

  const update = (key: keyof TenancyDetails, value: string) => {
    onChangeDetails({ ...details, [key]: value });
  };

  const renderField = (field: (typeof fields)[number]) => {
    const value = templateFields[field.key] || '';
    const baseClass = 'w-full border border-neutral-300 rounded-lg p-2 bg-white';

    if (field.kind === 'textarea') {
      return (
        <textarea
          value={value}
          onChange={(event) => updateTemplateField(field.key, event.target.value)}
          rows={4}
          className={baseClass}
          placeholder={field.placeholder}
        />
      );
    }

    if (field.kind === 'select') {
      return (
        <select
          value={value}
          onChange={(event) => updateTemplateField(field.key, event.target.value)}
          className={baseClass}
        >
          <option value="">Select...</option>
          {(field.options || []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      );
    }

    return (
      <input
        type="text"
        value={value}
        onChange={(event) => updateTemplateField(field.key, event.target.value)}
        className={baseClass}
        placeholder={field.placeholder || (field.kind === 'date' ? 'DD/MM/YYYY' : '')}
      />
    );
  };

  const detailFields = fields.filter((field) => field.section === 'details');
  const outcomeFields = fields.filter((field) => field.section === 'outcome');

  return (
    <div className="space-y-5 text-xs">
      <div className="border-b border-neutral-200 pb-3">
        <h3 className="font-bold text-neutral-900 text-sm">{template.label}</h3>
        <p className="text-[11px] text-neutral-500 mt-1">{template.description}</p>
      </div>

      {detailFields.length > 0 && (
        <section className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
          <h4 className="font-bold text-neutral-900 uppercase tracking-wide text-[11px]">
            {template.summaryTitle}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {detailFields.map((field) => (
              <div key={field.key} className={field.kind === 'textarea' ? 'md:col-span-2' : ''}>
                <label className="block font-semibold text-neutral-700 mb-1">{field.label}</label>
                {renderField(field)}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
        <h4 className="font-bold text-neutral-900 uppercase tracking-wide text-[11px]">
          Summary & Outcomes
        </h4>

        <div>
          <label className="block font-semibold text-neutral-700 mb-1">
            {template.additionalCommentsLabel}
          </label>
          <textarea
            value={details.additionalComments || ''}
            onChange={(event) => update('additionalComments', event.target.value)}
            rows={5}
            className="w-full border border-neutral-300 rounded-lg p-2 bg-white"
          />
        </div>

        {template.maintenanceCommentsLabel && (
          <div>
            <label className="block font-semibold text-neutral-700 mb-1">
              {template.maintenanceCommentsLabel}
            </label>
            <textarea
              value={details.maintenanceComments || ''}
              onChange={(event) => update('maintenanceComments', event.target.value)}
              rows={5}
              className="w-full border border-neutral-300 rounded-lg p-2 bg-white"
            />
          </div>
        )}

        {outcomeFields.map((field) => (
          <div key={field.key}>
            <label className="block font-semibold text-neutral-700 mb-1">{field.label}</label>
            {renderField(field)}
          </div>
        ))}
      </section>

      <section className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
        <h4 className="font-bold text-neutral-900 uppercase tracking-wide text-[11px]">
          {template.signoffTitle}
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-neutral-700 mb-1">Prepared / Verified By</label>
            <input
              type="text"
              value={details.agentSignName || ''}
              onChange={(event) => update('agentSignName', event.target.value)}
              className="w-full border border-neutral-300 rounded-lg p-2 bg-white"
            />
          </div>
          <div>
            <label className="block font-semibold text-neutral-700 mb-1">Sign-off Date</label>
            <input
              type="text"
              value={details.agentSignDate || ''}
              onChange={(event) => update('agentSignDate', event.target.value)}
              className="w-full border border-neutral-300 rounded-lg p-2 bg-white"
              placeholder="DD/MM/YYYY"
            />
          </div>
        </div>
        <div>
          <label className="block font-semibold text-neutral-700 mb-1">Report Disclaimer</label>
          <textarea
            value={details.disclaimerText || ''}
            onChange={(event) => update('disclaimerText', event.target.value)}
            rows={5}
            className="w-full border border-neutral-300 rounded-lg p-2 bg-neutral-50 text-[11px]"
          />
        </div>
      </section>
    </div>
  );
};
