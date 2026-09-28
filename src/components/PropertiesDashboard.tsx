import React, { useState } from 'react';
import { ArchiveRestore, Building2, Plus } from 'lucide-react';
import { PropertyRecord, UserRole } from '../types/report';

interface Props {
  properties: PropertyRecord[];
  userEmail?: string;
  userRole: UserRole;
  isLoading?: boolean;
  onCreate: (input: { address: string; reference?: string; notes?: string }) => Promise<void>;
  onOpen: (property: PropertyRecord) => void;
  onRestore: (property: PropertyRecord) => Promise<void>;
}

export const PropertiesDashboard: React.FC<Props> = ({
  properties,
  userEmail,
  userRole,
  isLoading,
  onCreate,
  onOpen,
  onRestore,
}) => {
  const [address, setAddress] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const activeProperties = properties.filter((property) => !property.archivedAt);
  const archivedProperties = properties.filter((property) => Boolean(property.archivedAt));
  const canEdit = userRole !== 'viewer';

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!address.trim()) return;
    setIsCreating(true);
    try {
      await onCreate({
        address: address.trim(),
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setAddress('');
      setReference('');
      setNotes('');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <main className="flex-1 bg-neutral-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <section className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold text-neutral-900">Properties</h1>
              <p className="text-sm text-neutral-500 mt-1">
                Properties organise reports only. Tenancy and property-management functions are outside V1.
              </p>
            </div>
            {userEmail && (
              <span className="text-[11px] text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-full px-3 py-1">
                {userEmail}
              </span>
            )}
          </div>

          {canEdit && (
                      <form onSubmit={handleCreate} className="mt-5 grid grid-cols-1 md:grid-cols-6 gap-3">
                        <div className="md:col-span-3">
                          <label className="block text-xs font-bold text-neutral-700 mb-1">Property address</label>
                          <input
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                            placeholder="e.g. 12 Smith Street, Perth WA 6000"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-bold text-neutral-700 mb-1">Reference (optional)</label>
                          <input
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                            placeholder="Internal reference"
                          />
                        </div>
                        <div className="md:col-span-1 flex items-end">
                          <button
                            type="submit"
                            disabled={isCreating || !address.trim()}
                            className="w-full px-4 py-2 bg-[#0a2540] text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            <Plus className="w-4 h-4" /> Add
                          </button>
                        </div>
                        <div className="md:col-span-6">
                          <label className="block text-xs font-bold text-neutral-700 mb-1">Notes (optional)</label>
                          <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={2}
                            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                            placeholder="Property-specific note"
                          />
                        </div>
                      </form>
          )}

        </section>

        <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
            <h2 className="font-bold text-neutral-900">Saved properties</h2>
            <span className="text-xs text-neutral-500">{activeProperties.length} active</span>
          </div>

          {isLoading ? (
            <div className="p-10 text-center text-sm text-neutral-500">Loading properties...</div>
          ) : activeProperties.length === 0 ? (
            <div className="p-10 text-center text-sm text-neutral-500">
              No properties yet. Add the first property above.
            </div>
          ) : (
            <div className="divide-y divide-neutral-200">
              {activeProperties.map((property) => (
                <button
                  key={property.id}
                  onClick={() => onOpen(property)}
                  className="w-full p-4 text-left hover:bg-neutral-50 flex items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-neutral-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-neutral-900 truncate">{property.address}</div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        {property.reference || 'No reference'} • Updated {new Date(property.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-[#0a2540]">Open</span>
                </button>
              ))}
            </div>
          )}
        </section>
        {userRole === 'admin' && archivedProperties.length > 0 && (
          <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-neutral-900">Archived properties</h2>
                <p className="text-xs text-neutral-500 mt-0.5">Archived containers retain every report and can be restored without data loss.</p>
              </div>
              <span className="text-xs text-neutral-500">{archivedProperties.length} archived</span>
            </div>
            <div className="divide-y divide-neutral-200">
              {archivedProperties.map((property) => (
                <div key={property.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-bold text-neutral-900 truncate">{property.address}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      {property.reference || 'No reference'} • Archived {property.archivedAt ? new Date(property.archivedAt).toLocaleDateString() : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => onRestore(property)}
                    className="px-3 py-1.5 text-xs font-bold border border-neutral-300 rounded-lg bg-white flex items-center gap-1.5"
                  >
                    <ArchiveRestore className="w-3.5 h-3.5" /> Restore
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}


      </div>
    </main>
  );
};
