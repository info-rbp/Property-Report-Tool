import React, { useState, useEffect } from 'react';
import {
  listDriveFolders,
  listDriveImagesInFolder,
  listUserGoogleSheets,
  fetchSheetValues,
  fetchDriveImageDataUrl,
  DriveFolderItem,
  DriveImageFile
} from '../lib/driveSheetsApi';
import { parseSpreadsheetRowsToReportData } from '../lib/spreadsheetParser';
import { InspectionArea, DrivePhoto } from '../types/report';
import { Folder, FileSpreadsheet, Loader2, Image as ImageIcon, CheckCircle, RefreshCw, AlertCircle } from 'lucide-react';

interface GoogleWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportAreas: (areas: InspectionArea[]) => void;
  onImportPhotos: (photos: DrivePhoto[]) => void;
}

export const GoogleWorkspaceModal: React.FC<GoogleWorkspaceModalProps> = ({
  isOpen,
  onClose,
  onImportAreas,
  onImportPhotos
}) => {
  const [activeTab, setActiveTab] = useState<'drive' | 'sheets'>('drive');

  // Drive state
  const [folders, setFolders] = useState<DriveFolderItem[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<DriveFolderItem | null>(null);
  const [folderImages, setFolderImages] = useState<DriveImageFile[]>([]);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [loadingImages, setLoadingImages] = useState(false);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [importingImages, setImportingImages] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);

  // Sheets state
  const [sheets, setSheets] = useState<DriveFolderItem[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<DriveFolderItem | null>(null);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [importingSheet, setImportingSheet] = useState(false);
  const [sheetsError, setSheetsError] = useState<string | null>(null);

  // Load Initial lists
  useEffect(() => {
    if (!isOpen) return;
    loadFolders();
    loadSheets();
  }, [isOpen]);

  const loadFolders = async () => {
    setLoadingDrive(true);
    setDriveError(null);
    try {
      const items = await listDriveFolders();
      setFolders(items);
    } catch (err: any) {
      setDriveError(err.message || 'Failed to list Google Drive folders');
    } finally {
      setLoadingDrive(false);
    }
  };

  const loadSheets = async () => {
    setLoadingSheets(true);
    setSheetsError(null);
    try {
      const items = await listUserGoogleSheets();
      setSheets(items);
    } catch (err: any) {
      setSheetsError(err.message || 'Failed to list Google Sheets');
    } finally {
      setLoadingSheets(false);
    }
  };

  const handleSelectFolder = async (folder: DriveFolderItem) => {
    setSelectedFolder(folder);
    setLoadingImages(true);
    setDriveError(null);
    try {
      const images = await listDriveImagesInFolder(folder.id);
      setFolderImages(images);
      // Select all by default
      setSelectedImageIds(new Set(images.map((img) => img.id)));
    } catch (err: any) {
      setDriveError(err.message || 'Failed to load folder images');
    } finally {
      setLoadingImages(false);
    }
  };

  const toggleImageSelect = (id: string) => {
    const next = new Set(selectedImageIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedImageIds(next);
  };

  const handleImportSelectedPhotos = async () => {
    if (!folderImages.length) return;
    setImportingImages(true);
    try {
      const chosen = folderImages.filter((img) => selectedImageIds.has(img.id));
      // Convert first 15 images to full dataUrls for flawless offline & PDF rendering
      const newDrivePhotos: DrivePhoto[] = [];

      for (let i = 0; i < chosen.length; i++) {
        const item = chosen[i];
        let dataUrl: string | undefined = undefined;
        try {
          if (i < 20) {
            dataUrl = await fetchDriveImageDataUrl(item.id);
          }
        } catch (e) {
          console.warn('Could not fetch dataUrl for image', item.name, e);
        }

        newDrivePhotos.push({
          id: item.id,
          name: item.name,
          thumbnailLink: item.thumbnailLink,
          dataUrl: dataUrl,
          photoIndex: i + 1,
          areaName: selectedFolder?.name || 'Inspection',
        });
      }

      onImportPhotos(newDrivePhotos);
      onClose();
    } catch (err: any) {
      setDriveError(err.message || 'Failed to import photos');
    } finally {
      setImportingImages(false);
    }
  };

  const handleImportSheet = async (sheet: DriveFolderItem) => {
    setSelectedSheet(sheet);
    setImportingSheet(true);
    setSheetsError(null);
    try {
      const rows = await fetchSheetValues(sheet.id);
      const parsed = parseSpreadsheetRowsToReportData(rows);
      onImportAreas(parsed.areas);
      onClose();
    } catch (err: any) {
      setSheetsError(err.message || 'Failed to parse sheet data');
    } finally {
      setImportingSheet(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden border border-neutral-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-neutral-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
              G
            </div>
            <div>
              <h3 className="font-bold text-neutral-900 text-base">Google Workspace Importer</h3>
              <p className="text-xs text-neutral-500">Pick inspection photos from Drive or commentary from Google Sheets</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 text-xl font-bold p-1 rounded hover:bg-neutral-200/50"
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-neutral-200 px-6 bg-white gap-6">
          <button
            onClick={() => setActiveTab('drive')}
            className={`py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'drive'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <Folder className="w-4 h-4" />
            Google Drive Photo Folders
          </button>
          <button
            onClick={() => setActiveTab('sheets')}
            className={`py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'sheets'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Google Sheets Commentary
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'drive' ? (
            <div className="space-y-4">
              {driveError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{driveError}</span>
                </div>
              )}

              {!selectedFolder ? (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                      Select Inspection Photo Folder
                    </span>
                    <button
                      onClick={loadFolders}
                      disabled={loadingDrive}
                      className="text-xs text-neutral-600 hover:text-neutral-900 flex items-center gap-1 font-medium"
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingDrive ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>

                  {loadingDrive ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-2 text-neutral-500 text-sm">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                      Loading Drive folders...
                    </div>
                  ) : folders.length === 0 ? (
                    <div className="py-12 text-center text-sm text-neutral-500 border border-dashed rounded-lg bg-neutral-50">
                      No folders found in your Google Drive root. You can also upload local photo files anytime.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {folders.map((folder) => (
                        <button
                          key={folder.id}
                          onClick={() => handleSelectFolder(folder)}
                          className="flex items-center gap-3 p-3 text-left border border-neutral-200 rounded-lg hover:border-blue-500 hover:bg-blue-50/50 transition-all group"
                        >
                          <Folder className="w-5 h-5 text-amber-500 group-hover:text-blue-600 shrink-0" />
                          <div className="truncate font-medium text-sm text-neutral-800 group-hover:text-blue-900">
                            {folder.name}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {/* Folder Breadcrumb & Back */}
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-neutral-100">
                    <div className="flex items-center gap-2 text-sm">
                      <button
                        onClick={() => setSelectedFolder(null)}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        Folders
                      </button>
                      <span className="text-neutral-400">/</span>
                      <span className="font-bold text-neutral-800">{selectedFolder.name}</span>
                    </div>

                    <div className="text-xs text-neutral-500">
                      {folderImages.length} images found ({selectedImageIds.size} selected)
                    </div>
                  </div>

                  {loadingImages ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-2 text-neutral-500 text-sm">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                      Loading images from folder...
                    </div>
                  ) : folderImages.length === 0 ? (
                    <div className="py-8 text-center text-sm text-neutral-500 border border-dashed rounded-lg bg-neutral-50">
                      No image files found in this folder.
                    </div>
                  ) : (
                    <div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-[40vh] overflow-y-auto p-1">
                        {folderImages.map((img) => {
                          const isSelected = selectedImageIds.has(img.id);
                          return (
                            <div
                              key={img.id}
                              onClick={() => toggleImageSelect(img.id)}
                              className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all aspect-square ${
                                isSelected ? 'border-blue-600 shadow-md ring-2 ring-blue-300' : 'border-neutral-200 hover:border-neutral-400'
                              }`}
                            >
                              <img
                                src={img.thumbnailLink || 'https://via.placeholder.com/150'}
                                alt={img.name}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                                <span className="text-[10px] text-white truncate font-medium">{img.name}</span>
                              </div>
                              {isSelected && (
                                <div className="absolute top-1.5 right-1.5 bg-blue-600 text-white rounded-full p-0.5 shadow">
                                  <CheckCircle className="w-3.5 h-3.5" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-4 flex items-center justify-between pt-3 border-t border-neutral-200">
                        <button
                          onClick={() => {
                            if (selectedImageIds.size === folderImages.length) {
                              setSelectedImageIds(new Set());
                            } else {
                              setSelectedImageIds(new Set(folderImages.map((i) => i.id)));
                            }
                          }}
                          className="text-xs text-neutral-600 hover:text-neutral-900 font-medium"
                        >
                          {selectedImageIds.size === folderImages.length ? 'Deselect All' : 'Select All'}
                        </button>

                        <button
                          onClick={handleImportSelectedPhotos}
                          disabled={selectedImageIds.size === 0 || importingImages}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 shadow-xs"
                        >
                          {importingImages ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                          Import {selectedImageIds.size} Photos into Report
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {sheetsError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{sheetsError}</span>
                </div>
              )}

              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Select Google Sheet to Import Commentary
                </span>
                <button
                  onClick={loadSheets}
                  disabled={loadingSheets}
                  className="text-xs text-neutral-600 hover:text-neutral-900 flex items-center gap-1 font-medium"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingSheets ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {loadingSheets ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-neutral-500 text-sm">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                  Loading spreadsheets...
                </div>
              ) : sheets.length === 0 ? (
                <div className="py-12 text-center text-sm text-neutral-500 border border-dashed rounded-lg bg-neutral-50">
                  No spreadsheets found. You can also import CSV or Excel (.xlsx) files directly!
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 max-h-[50vh] overflow-y-auto">
                  {sheets.map((sheet) => (
                    <div
                      key={sheet.id}
                      className="flex items-center justify-between p-3.5 border border-neutral-200 rounded-lg hover:border-emerald-500 hover:bg-emerald-50/40 transition-all"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div className="truncate font-medium text-sm text-neutral-800">
                          {sheet.name}
                        </div>
                      </div>

                      <button
                        onClick={() => handleImportSheet(sheet)}
                        disabled={importingSheet}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1 shrink-0 shadow-xs"
                      >
                        {importingSheet && selectedSheet?.id === sheet.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : null}
                        Load Commentary
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-xs text-neutral-600 space-y-1">
                <span className="font-semibold text-neutral-800">Expected Spreadsheet Structure:</span>
                <p>Columns: <code className="bg-neutral-200 px-1 py-0.5 rounded text-[11px]">Area</code> | <code className="bg-neutral-200 px-1 py-0.5 rounded text-[11px]">Item</code> | <code className="bg-neutral-200 px-1 py-0.5 rounded text-[11px]">Clean (Y/N)</code> | <code className="bg-neutral-200 px-1 py-0.5 rounded text-[11px]">Undamaged (Y/N)</code> | <code className="bg-neutral-200 px-1 py-0.5 rounded text-[11px]">Working (Y/N)</code> | <code className="bg-neutral-200 px-1 py-0.5 rounded text-[11px]">Agent Comments</code></p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
