/**
 * Tiny client for the LabLens API (our Lambda Function URL).
 * The URL comes from amplify_outputs.json, which Amplify writes after deploying
 * the backend, so it is never hard-coded.
 */
import outputs from '../amplify_outputs.json';
import type { Account, IdScan, Profile, Report, ReportSummary } from './types';

const API_URL = String((outputs as { custom?: { apiUrl?: string } }).custom?.apiUrl ?? '').replace(/\/+$/, '');

const TOKEN_KEY = 'lablens.token';
const USER_KEY = 'lablens.user';

export interface Session {
  username: string;
  token: string;
}

export function loadSession(): Session | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const username = localStorage.getItem(USER_KEY);
    return token && username ? { token, username } : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session) {
  localStorage.setItem(TOKEN_KEY, s.token);
  localStorage.setItem(USER_KEY, s.username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** App.tsx registers this so any 401 signs the user out. */
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  if (!API_URL) throw new ApiError(0, 'API URL missing: run `npx ampx sandbox` to create amplify_outputs.json');
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth) {
    const s = loadSession();
    if (s) headers.authorization = `Bearer ${s.token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the LabLens API. Check your internet connection.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && auth) {
      clearSession();
      onUnauthorized();
    }
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

// ---------- auth ----------
async function authenticate(kind: 'login' | 'register', username: string, password: string) {
  const s = await request<Session>('POST', `/auth/${kind}`, { username, password }, false);
  saveSession(s);
  return s;
}
export const login = (u: string, p: string) => authenticate('login', u, p);
export const register = (u: string, p: string) => authenticate('register', u, p);
export const me = () => request<{ username: string }>('GET', '/auth/me');

// ---------- profile ----------
export const getAccount = () => request<Account>('GET', '/profile');
export const saveProfile = (p: Omit<Profile, 'completedAt' | 'updatedAt'>) =>
  request<{ username: string; profile: Profile }>('PUT', '/profile', p).then((r) => r.profile);
export const getIdUploadUrl = (fileName: string, size: number) =>
  request<{ uploadUrl: string; fileKey: string; contentType: string }>('POST', '/profile/id-upload-url', { fileName, size });
export const scanId = (fileKey: string) => request<IdScan>('POST', '/profile/scan-id', { fileKey });

// ---------- reports ----------
export const getUploadUrl = (fileName: string, size: number) =>
  request<{ uploadUrl: string; fileKey: string; contentType: string }>('POST', '/reports/upload-url', {
    fileName,
    size,
  });

export const analyze = (fileKey: string, fileName: string) =>
  request<Report>('POST', '/reports/analyze', { fileKey, fileName });

export const listReports = () =>
  request<{ reports: ReportSummary[] }>('GET', '/reports').then((r) => r.reports);

export const getReport = (id: string) => request<Report>('GET', `/reports/${encodeURIComponent(id)}`);

export const getFileUrl = (id: string) =>
  request<{ url: string }>('GET', `/reports/${encodeURIComponent(id)}/file-url`).then((r) => r.url);

export const deleteReport = (id: string) => request<unknown>('DELETE', `/reports/${encodeURIComponent(id)}`);

/**
 * Uploads straight from the browser to S3 with the presigned URL (the file never
 * passes through Lambda). XMLHttpRequest is used because fetch has no upload progress.
 */
export function uploadToS3(url: string, file: File, contentType: string, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`S3 upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error('S3 upload failed (network or CORS)'));
    xhr.send(file);
  });
}
