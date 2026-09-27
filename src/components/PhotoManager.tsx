import React, { useRef, useState } from 'react';
import { DrivePhoto, InspectionArea } from '../types/report';
import {
  Image,
  Upload,
  Trash2,
  Folder,
  Tag,
  Filter,
  Layers,
  CheckCircle2,
  Plus,
  Star
} from 'lucide-react';

interface PhotoManagerProps {
  photos: DrivePhoto[];
  areas?: InspectionArea[];
  onUpdatePhotos: (photos: DrivePhoto[]) => void;
  onOpenDriveModal: () => void;
}

export const PhotoManager: React.FC<PhotoManagerProps> = ({
  photos,
  areas = [],
  onUpdatePhotos,
  onOpenDriveModal,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const areaFileInputRef = useRef<HTMLInputElement>(null);

  // Selected area for dedicated area upload / assignment
  const [selectedUploadArea, setSelectedUploadArea] = useState<string>(
    areas[0]?.name || 'General'
  );
  const [activeAreaFilter, setActiveAreaFilter] = useState<string>('ALL');

  // Trigger file dialog specifically for a given area
  const [targetUploadArea, setTargetUploadArea] = useState<string>(
    areas[0]?.name || 'General'
  );

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    assignAreaName?: string
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const areaToAssign = assignAreaName || selectedUploadArea || 'General';
    const areaPhotosCount = photos.filter((p) => p.areaName === areaToAssign).length;

    const newPhotosToAdd: DrivePhoto[] = [];
    const filesArray = Array.from(files);
    let loadedCount = 0;

    filesArray.forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = () => {
        const photoIndex = areaPhotosCount + idx + 1;
        const autoCaption = `${areaToAssign}: Overall (photo ${photoIndex})`;
        const newPhoto: DrivePhoto = {
          id: `local-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          name: autoCaption,
          dataUrl: reader.result as string,
          photoIndex,
          areaName: areaToAssign,
        };
        newPhotosToAdd.push(newPhoto);
        loadedCount++;

        if (loadedCount === filesArray.length) {
          onUpdatePhotos([...photos, ...newPhotosToAdd]);
        }
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    e.target.value = '';
  };

  const handleUploadForSpecificArea = (areaName: string) => {
    setTargetUploadArea(areaName);
    areaFileInputRef.current?.click();
  };

  const handleDeletePhoto = (id: string) => {
    onUpdatePhotos(photos.filter((p) => p.id !== id));
  };

  const handleSetCoverPhoto = (id: string) => {
    onUpdatePhotos(photos.map((p) => ({ ...p, isCover: p.id === id })));
  };

  const handleRenamePhoto = (id: string, name: string) => {
    onUpdatePhotos(
      photos.map((p) => {
        if (p.id !== id) return p;
        return { ...p, name };
      })
    );
  };

  const handleReassignPhotoArea = (id: string, newAreaName: string) => {
    onUpdatePhotos(
      photos.map((p) => {
        if (p.id !== id) return p;
        return {
          ...p,
          areaName: newAreaName,
          name: p.name.includes(':')
            ? `${newAreaName}: ${p.name.split(':')[1]?.trim() || 'Photo'}`
            : `${newAreaName}: ${p.name}`,
        };
      })
    );
  };

  // Group photos by area for statistics
  const areaCounts: Record<string, number> = {};
  photos.forEach((p) => {
    const areaKey = p.areaName || 'General';
    areaCounts[areaKey] = (areaCounts[areaKey] || 0) + 1;
  });

  const filteredPhotos =
    activeAreaFilter === 'ALL'
      ? photos
      : photos.filter((p) => (p.areaName || 'General') === activeAreaFilter);

  // Available unique areas list from report
  const availableAreaNames = Array.from(
    new Set([...areas.map((a) => a.name), 'General', 'Entry/Front', 'Exterior/Yard'])
  );

  return (
    <div className="bg-white rounded-xl shadow-xs border border-neutral-200 overflow-hidden flex flex-col h-full">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={(e) => handleFileUpload(e, selectedUploadArea)}
        className="hidden"
      />
      <input
        ref={areaFileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={(e) => handleFileUpload(e, targetUploadArea)}
        className="hidden"
      />

      {/* Main Header */}
      <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-neutral-900 text-sm flex items-center gap-2">
            <Image className="w-4 h-4 text-neutral-700" />
            Property Inspection Photos ({photos.length} photos)
          </h3>
          <p className="text-xs text-neutral-500">
            Upload and organize photos tagged to specific rooms & areas of the property (3x3 A4 grid)
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Area-Targeted Upload selector */}
          <div className="flex items-center rounded-lg border border-neutral-300 bg-white overflow-hidden text-xs shadow-2xs">
            <span className="px-2.5 py-1.5 bg-neutral-100 text-neutral-600 font-semibold border-r border-neutral-300 flex items-center gap-1">
              <Tag className="w-3 h-3 text-neutral-500" /> Area:
            </span>
            <select
              value={selectedUploadArea}
              onChange={(e) => setSelectedUploadArea(e.target.value)}
              className="px-2 py-1.5 bg-transparent font-medium text-neutral-800 focus:outline-hidden cursor-pointer"
            >
              {availableAreaNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-[#0a2540] hover:bg-[#07192c] text-white font-bold flex items-center gap-1.5 transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-cyan-400" />
              <span>Upload to {selectedUploadArea}</span>
            </button>
          </div>

          <button
            onClick={onOpenDriveModal}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 flex items-center gap-1.5 transition-all shadow-xs"
          >
            <Folder className="w-3.5 h-3.5" />
            Google Drive
          </button>
        </div>
      </div>

      {/* Area Quick Upload Strip & Filter Bar */}
      <div className="px-4 py-2.5 bg-white border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full">
          <span className="text-neutral-500 font-medium flex items-center gap-1 mr-1 shrink-0">
            <Filter className="w-3.5 h-3.5" /> Filter by Area:
          </span>
          <button
            onClick={() => setActiveAreaFilter('ALL')}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 transition-colors ${
              activeAreaFilter === 'ALL'
                ? 'bg-neutral-900 text-white shadow-2xs'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            All Areas ({photos.length})
          </button>

          {areas.map((area) => {
            const count = areaCounts[area.name] || 0;
            return (
              <button
                key={area.id}
                onClick={() => setActiveAreaFilter(area.name)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 transition-colors flex items-center gap-1.5 ${
                  activeAreaFilter === area.name
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : count > 0
                    ? 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200'
                    : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                }`}
              >
                <span>{area.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    activeAreaFilter === area.name
                      ? 'bg-blue-800 text-white'
                      : count > 0
                      ? 'bg-blue-200 text-blue-900'
                      : 'bg-neutral-200 text-neutral-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Quick button to upload specifically to the currently filtered area */}
        {activeAreaFilter !== 'ALL' && (
          <button
            onClick={() => handleUploadForSpecificArea(activeAreaFilter)}
            className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-600" />
            Add photos to "{activeAreaFilter}"
          </button>
        )}
      </div>

      {/* Grid of photos */}
      <div className="p-4 overflow-y-auto flex-1 bg-neutral-50/50">
        {filteredPhotos.length === 0 ? (
          <div className="h-64 border-2 border-dashed border-neutral-300 rounded-xl flex flex-col items-center justify-center text-center p-6 bg-white">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
              <Folder className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-neutral-800 text-sm">
              {activeAreaFilter === 'ALL'
                ? 'No photos added yet'
                : `No photos uploaded for "${activeAreaFilter}" yet`}
            </h4>
            <p className="text-xs text-neutral-500 max-w-sm mt-1 mb-4">
              {activeAreaFilter === 'ALL'
                ? 'Select an area above to upload photos directly to specific rooms, or import from Google Drive.'
                : `Upload photos specifically for ${activeAreaFilter} so they are automatically captioned and linked.`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  handleUploadForSpecificArea(
                    activeAreaFilter === 'ALL' ? selectedUploadArea : activeAreaFilter
                  )
                }
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 shadow-xs flex items-center gap-1.5"
              >
                <Upload className="w-4 h-4" />
                Upload Images for{' '}
                {activeAreaFilter === 'ALL' ? selectedUploadArea : activeAreaFilter}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
            {filteredPhotos.map((photo, index) => (
              <div
                key={photo.id}
                className="group relative border border-neutral-200 rounded-lg overflow-hidden bg-white flex flex-col shadow-xs hover:shadow-md transition-shadow"
              >
                <div className="relative aspect-4/3 bg-neutral-100 overflow-hidden">
                  <img
                    src={photo.dataUrl || photo.thumbnailLink || 'https://via.placeholder.com/300x200'}
                    alt={photo.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                  />
                  <div className="absolute top-1.5 left-1.5 bg-black/75 text-white text-[10px] px-1.5 py-0.5 rounded font-mono font-bold">
                    #{photo.photoIndex || index + 1}
                  </div>
                  <div className="absolute top-1.5 right-1.5 flex gap-1">
                    <button
                      onClick={() => handleSetCoverPhoto(photo.id)}
                      className={`p-1 rounded shadow-xs transition-opacity ${photo.isCover ? 'bg-amber-400 text-neutral-900' : 'bg-white/90 text-neutral-600 opacity-0 group-hover:opacity-100'}`}
                      title="Use as cover photo"
                    >
                      <Star className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeletePhoto(photo.id)}
                      className="bg-red-600 text-white p-1 rounded hover:bg-red-700 shadow-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete photo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="p-2.5 bg-white flex flex-col gap-1.5 border-t border-neutral-100">
                  {/* Area assignment dropdown */}
                  <div className="flex items-center gap-1 text-[10px]">
                    <span className="text-neutral-400 font-medium shrink-0">Area:</span>
                    <select
                      value={photo.areaName || 'General'}
                      onChange={(e) => handleReassignPhotoArea(photo.id, e.target.value)}
                      className="w-full bg-neutral-50 border border-neutral-200 rounded px-1.5 py-0.5 font-bold text-neutral-800 text-[10px] truncate focus:outline-hidden focus:border-blue-500"
                    >
                      {availableAreaNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Caption editor */}
                  <input
                    type="text"
                    value={photo.name}
                    onChange={(e) => handleRenamePhoto(photo.id, e.target.value)}
                    className="text-[11px] font-medium text-neutral-800 border border-neutral-200 hover:border-neutral-300 focus:border-neutral-400 focus:bg-neutral-50 rounded px-1.5 py-0.5"
                    placeholder="Photo caption (e.g. Master Bedroom: Overall)"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
