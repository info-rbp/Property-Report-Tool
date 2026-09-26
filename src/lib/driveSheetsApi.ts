import { getAccessToken } from './auth';

export interface DriveFolderItem {
  id: string;
  name: string;
}

export interface DriveImageFile {
  id: string;
  name: string;
  thumbnailLink?: string;
  webContentLink?: string;
  createdTime?: string;
}

/**
 * List folders in user's Google Drive to select the inspection image folder
 */
export async function listDriveFolders(folderId?: string): Promise<DriveFolderItem[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google');

  const query = folderId
    ? `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    : `mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query
  )}&fields=files(id,name)&pageSize=50&orderBy=name`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Drive API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.files || [];
}

/**
 * List images in a chosen Google Drive folder
 */
export async function listDriveImagesInFolder(folderId: string): Promise<DriveImageFile[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google');

  const query = `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query
  )}&fields=files(id,name,thumbnailLink,webContentLink,createdTime)&pageSize=100&orderBy=name`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Drive API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.files || [];
}

/**
 * Fetch image blob from Google Drive using accessToken and convert to DataURL for direct PDF rendering
 */
export async function fetchDriveImageDataUrl(fileId: string): Promise<string> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google');

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load image from Drive (${response.status})`);
  }

  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * List user's Google Sheets spreadsheets
 */
export async function listUserGoogleSheets(): Promise<DriveFolderItem[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google');

  const query = `mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query
  )}&fields=files(id,name)&pageSize=30&orderBy=modifiedTime desc`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Drive API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.files || [];
}

/**
 * Read values from a Google Sheet
 */
export async function fetchSheetValues(spreadsheetId: string, range = 'Sheet1!A1:Z100'): Promise<string[][]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google');

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    // If specific sheet name failed, try getting sheet metadata first
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
    const metaRes = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (metaRes.ok) {
      const meta = await metaRes.json();
      const firstTitle = meta.sheets?.[0]?.properties?.title || 'Sheet1';
      const fallbackUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(firstTitle)}`;
      const fallbackRes = await fetch(fallbackUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (fallbackRes.ok) {
        const fbData = await fallbackRes.json();
        return fbData.values || [];
      }
    }
    const errorText = await response.text();
    throw new Error(`Sheets API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.values || [];
}
