import React, { useRef } from 'react';
import { DrivePhoto } from '../types/report';
import { Image, Upload, Trash2, Folder, ExternalLink } from 'lucide-react';

interface PhotoManagerProps {
  photos: DrivePhoto[];
  onUpdatePhotos: (photos: DrivePhoto[]) => void;
  onOpenDriveModal: () => void;
}

export const PhotoManager: React.FC<PhotoManagerProps> = ({
  photos,
  onUpdatePhotos,
  onOpenDriveModal,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = () => {
        const newPhoto: DrivePhoto = {
          id: `local-${Date.now()}-${idx}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          dataUrl: reader.result as string,
          photoIndex: photos.length + idx + 1,
          areaName: 'Inspection',
        };
        onUpdatePhotos([...photos, newPhoto]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDeletePhoto = (id: string) => {
    onUpdatePhotos(photos.filter((p) => p.id !== id));
  };

  const handleRenamePhoto = (id: string, name: string) => {
    onUpdatePhotos(
      photos.map((p) => {
        if (p.id !== id) return p;
        return { ...p, name };
      })
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-neutral-200 overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-neutral-200 bg-neutral-50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-neutral-900 text-sm flex items-center gap-2">
            <Image className="w-4 h-4 text-neutral-700" />
            Inspection Photo Gallery ({photos.length} photos)
          </h3>
          <p className="text-xs text-neutral-500">
            Layout formats 9 photos per page (3x3 grid) with matching caption numbering
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenDriveModal}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 flex items-center gap-1.5 transition-all shadow-xs"
          >
            <Folder className="w-3.5 h-3.5" />
            Choose Google Drive Folder
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-white border border-neutral-300 text-neutral-700 rounded-lg text-xs font-semibold hover:bg-neutral-50 flex items-center gap-1.5 transition-all"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload Local Images
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Grid of photos */}
      <div className="p-4 overflow-y-auto flex-1">
        {photos.length === 0 ? (
          <div className="h-64 border-2 border-dashed border-neutral-200 rounded-xl flex flex-col items-center justify-center text-center p-6 bg-neutral-50">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
              <Folder className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-neutral-800 text-sm">No photos added yet</h4>
            <p className="text-xs text-neutral-500 max-w-sm mt-1 mb-4">
              Select an inspection photo folder from your Google Drive, or upload pictures from your computer.
            </p>
            <button
              onClick={onOpenDriveModal}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 shadow-xs flex items-center gap-2"
            >
              <Folder className="w-4 h-4" /> Connect Drive Folder
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {photos.map((photo, index) => (
              <div
                key={photo.id}
                className="group relative border border-neutral-200 rounded-lg overflow-hidden bg-neutral-50 flex flex-col shadow-xs"
              >
                <div className="relative aspect-4/3 bg-neutral-100 overflow-hidden">
                  <img
                    src={photo.dataUrl || photo.thumbnailLink || 'https://via.placeholder.com/300x200'}
                    alt={photo.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                  />
                  <div className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                    #{index + 1}
                  </div>
                  <button
                    onClick={() => handleDeletePhoto(photo.id)}
                    className="absolute top-1.5 right-1.5 bg-red-600 text-white p-1 rounded hover:bg-red-700 shadow-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete photo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="p-2 bg-white flex flex-col gap-1 border-t border-neutral-100">
                  <input
                    type="text"
                    value={photo.name}
                    onChange={(e) => handleRenamePhoto(photo.id, e.target.value)}
                    className="text-[11px] font-medium text-neutral-800 border border-transparent hover:border-neutral-300 focus:border-neutral-400 focus:bg-neutral-50 rounded px-1 py-0.5"
                    placeholder="Photo caption..."
                  />
                  <span className="text-[9.5px] text-neutral-400 truncate">
                    {photo.areaName || 'General'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
