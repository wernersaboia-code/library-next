const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

export interface DriveFolder {
  id: string;
  name: string;
}

export async function fetchDriveFiles(
  accessToken: string,
  folderId: string,
  pageToken?: string
): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  const query = [
    `'${folderId}' in parents`,
    `and (mimeType='application/epub+zip' or mimeType='application/pdf')`,
    'and trashed=false',
  ].join(' ');

  const params = new URLSearchParams({
    q: query,
    fields: 'files(id,name,mimeType,size,modifiedTime),nextPageToken',
    pageSize: '100',
    orderBy: 'name',
  });

  if (pageToken) params.set('pageToken', pageToken);

  const res = await fetch(`${DRIVE_FILES_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`Drive API error: ${res.status}`);

  return res.json();
}

export async function fetchDriveFolders(
  accessToken: string
): Promise<DriveFolder[]> {
  const query = `mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const params = new URLSearchParams({
    q: query,
    fields: 'files(id,name)',
    pageSize: '100',
    orderBy: 'name',
  });

  const res = await fetch(`${DRIVE_FILES_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`Drive API error: ${res.status}`);

  const data = await res.json();
  return data.files || [];
}

export function getDriveDownloadUrl(fileId: string): string {
  return `${DRIVE_FILES_URL}/${fileId}?alt=media`;
}

export async function fetchFileBuffer(
  accessToken: string,
  fileId: string
): Promise<ArrayBuffer> {
  const url = getDriveDownloadUrl(fileId);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`Drive download error: ${res.status}`);

  return res.arrayBuffer();
}
