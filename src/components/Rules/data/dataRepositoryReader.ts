import { fetchLocal, fetchWithMirror, type ProgressCallback } from '@/lib/fetchWithMirror';
import { parseRawCompatibleUrl } from './sourceLinkModes';
import { resolveCategoryIndexUrl, resolveChunkUrl } from './sourceResolver';

function isRawCompatibleUrl(url: string): boolean {
  return !!parseRawCompatibleUrl(url);
}

export async function fetchJsonViaConfiguredSource<T>(url: string, stageName: string, onProgress?: ProgressCallback): Promise<T> {
  if (isRawCompatibleUrl(url)) return fetchWithMirror<T>(url, stageName, onProgress);
  return fetchLocal<T>(url, stageName, onProgress);
}

export async function fetchCategoryIndex(args: { worldId: string; className: string; kind?: string; repoType: 'merge' | 'picture'; stageName?: string; onProgress?: ProgressCallback }) {
  const url = resolveCategoryIndexUrl(args);
  return fetchJsonViaConfiguredSource<any>(url, args.stageName ?? `${args.repoType}-${args.className}-index`, args.onProgress);
}

export async function fetchChunkArray(args: { worldId: string; className: string; kind?: string; file: string; stageName?: string; onProgress?: ProgressCallback }): Promise<any[]> {
  const url = resolveChunkUrl(args);
  const data = await fetchJsonViaConfiguredSource<any>(url, args.stageName ?? `chunk-${args.file}`, args.onProgress);
  return Array.isArray(data) ? data : [];
}
