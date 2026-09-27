import React, { useRef, useState } from 'react';
import { Image, Upload, Trash2, Tag, Filter, Plus, Star } from 'lucide-react';
import { InspectionArea, ReportPhoto } from '../types/report';

interface PhotoManagerProps {
  photos: ReportPhoto[];
  areas?: InspectionArea[];
  isUploading?: boolean;
  onUploadPhotos: (files: File[], areaName: string) => Promise<void>;
  onUpdatePhotos: (photos: ReportPhoto[]) => void;
  onDeletePhoto: (id: string) => Promise<void>;
}

export const PhotoManager: React.FC<PhotoManagerProps> = ({
  photos,
  areas = [],
  isUploading = false,
  onUploadPhotos,
  onUpdatePhotos,
  onDeletePhoto,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const areaFileInputRef = useRef<HTMLInputElement>(null);
  const [selectedUploadArea, setSelectedUploadArea] = useState<string>(areas[0]?.name || 'General');
  const [targetUploadArea, setTargetUploadArea] = useState<string>(areas[0]?.name || 'General');
  const [activeAreaFilter, setActiveAreaFilter] = useState<string>('ALL');

  const availableAreaNames = Array.from(
    new Set([...areas.map((area) => area.name), 'General', 'Entry/Front', 'Exterior/Yard'])
  );

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    areaName: string
  ) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    await onUploadPhotos(files, areaName || 'General');
  };

  const handleUploadForSpecificArea = (areaName: string) => {
    setTargetUploadArea(areaName);
    areaFileInputRef.current?.click();
  };

  const handleSetCoverPhoto = (id: string) => {
    onUpdatePhotos(photos.map((photo) => ({ ...photo, isCover: photo.id === id })));
  };

  const handleRenamePhoto = (id: string, name: string) => {
    onUpdatePhotos(photos.map((photo) => photo.id === id ? { ...photo, name } : photo));
  };

  const handleReassignPhotoArea = (id: string, areaName: string) => {
    onUpdatePhotos(photos.map((photo) => {
      if (photo.id !== id) return photo;
      return {
        ...photo,
        areaName,
        name: photo.name.includes(':')
          ? `${areaName}: ${photo.name.split(':').slice(1).join(':').trim() || 'Photo'}`
          : `${areaName}: ${photo.name}`,
      };
    }));
  };

  const areaCounts: Record<string, number> = {};
  photos.forEach((photo) => {
    const key = photo.areaName || 'General';
    areaCounts[key] = (areaCounts[key] || 0) + 1;
  });

  const filteredPhotos = activeAreaFilter === 'ALL'
    ? photos
    : photos.filter((photo) => (photo.areaName || 'General') === activeAreaFilter);

  return (
    <div className="bg-white rounded-xl shadow-xs border border-neutral-200 overflow-hidden flex flex-col h-full">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => handleFileUpload(event, selectedUploadArea)}
        className="hidden"
      />
      <input
        ref={areaFileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => handleFileUpload(event, targetUploadArea)}
        className="hidden"
      />

      <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-neutral-900 text-sm flex items-center gap-2">
            <Image className="w-4 h-4 text-neutral-700" />
            Property Inspection Photos ({photos.length})
          </h3>
          <p className="text-xs text-neutral-500">
            Upload JPG, PNG or WebP images from this device. Images are resized before cloud storage.
          </p>
        </div>

        <div className="flex items-center rounded-lg border border-neutral-300 bg-white overflow-hidden text-xs shadow-2xs">
          <span className="px-2.5 py-1.5 bg-neutral-100 text-neutral-600 font-semibold border-r border-neutral-300 flex items-center gap-1">
            <Tag className="w-3 h-3" /> Area
          </span>
          <select
            value={selectedUploadArea}
            onChange={(event) => setSelectedUploadArea(event.target.value)}
            className="px-2 py-1.5 bg-transparent font-medium text-neutral-800 focus:outline-hidden"
          >
            {availableAreaNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-3 py-1.5 bg-[#0a2540] text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            {isUploading ? 'Uploading...' : 'Upload Photos'}
          </button>
        </div>
      </div>

      <div className="px-4 py-2.5 bg-white border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full">
          <span className="text-neutral-500 font-medium flex items-center gap-1 mr-1 shrink-0">
            <Filter className="w-3.5 h-3.5" /> Filter
          </span>
          <button
            onClick={() => setActiveAreaFilter('ALL')}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${
              activeAreaFilter === 'ALL' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            All ({photos.length})
          </button>

          {areas.map((area) => {
            const count = areaCounts[area.name] || 0;
            return (
              <button
                key={area.id}
                onClick={() => setActiveAreaFilter(area.name)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 border ${
                  activeAreaFilter === area.name
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : count
                    ? 'bg-blue-50 border-blue-200 text-blue-800'
                    : 'bg-neutral-100 border-neutral-100 text-neutral-500'
                }`}
              >
                {area.name} ({count})
              </button>
            );
          })}
        </div>

        {activeAreaFilter !== 'ALL' && (
          <button
            onClick={() => handleUploadForSpecificArea(activeAreaFilter)}
            disabled={isUploading}
            className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg font-semibold flex items-center gap-1 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> Add to {activeAreaFilter}
          </button>
        )}
      </div>

      <div className="p-4 overflow-y-auto flex-1 bg-neutral-50/50">
        {filteredPhotos.length === 0 ? (
          <div className="h-64 border-2 border-dashed border-neutral-300 rounded-xl flex flex-col items-center justify-center text-center p-6 bg-white">
            <Upload className="w-8 h-8 text-neutral-400 mb-3" />
            <h4 className="font-bold text-neutral-800 text-sm">No photos uploaded</h4>
            <p className="text-xs text-neutral-500 max-w-sm mt-1 mb-4">
              Upload inspection photos from this device. They will be compressed in the browser and stored with this report.
            </p>
            <button
              onClick={() => handleUploadForSpecificArea(activeAreaFilter === 'ALL' ? selectedUploadArea : activeAreaFilter)}
              disabled={isUploading}
              className="px-4 py-2 bg-[#0a2540] text-white rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              Upload Photos
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
            {filteredPhotos.map((photo, index) => (
              <div key={photo.id} className="group border border-neutral-200 rounded-lg overflow-hidden bg-white shadow-xs">
                <div className="relative aspect-4/3 bg-neutral-100 overflow-hidden">
                  {photo.dataUrl || photo.url ? (
                    <img
                      src={photo.dataUrl || photo.url}
                      alt={photo.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-neutral-400">
                      Image unavailable
                    </div>
                  )}
                  <div className="absolute top-1.5 left-1.5 bg-black/75 text-white text-[10px] px-1.5 py-0.5 rounded font-mono font-bold">
                    #{photo.photoIndex || index + 1}
                  </div>
                  <div className="absolute top-1.5 right-1.5 flex gap-1">
                    <button
                      onClick={() => handleSetCoverPhoto(photo.id)}
                      className={`p-1 rounded shadow-xs ${photo.isCover ? 'bg-amber-400 text-neutral-900' : 'bg-white/90 text-neutral-600 opacity-0 group-hover:opacity-100'}`}
                      title="Use as cover photo"
                    >
                      <Star className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDeletePhoto(photo.id)}
                      className="bg-red-600 text-white p-1 rounded shadow-xs opacity-0 group-hover:opacity-100"
                      title="Delete photo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="p-2.5 bg-white flex flex-col gap-1.5">
                  <select
                    value={photo.areaName || 'General'}
                    onChange={(event) => handleReassignPhotoArea(photo.id, event.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded px-1.5 py-1 font-bold text-neutral-800 text-[10px]"
                  >
                    {availableAreaNames.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                  <input
                    value={photo.name}
                    onChange={(event) => handleRenamePhoto(photo.id, event.target.value)}
                    className="text-[11px] text-neutral-800 border border-neutral-200 rounded px-1.5 py-1"
                    placeholder="Photo caption"
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
