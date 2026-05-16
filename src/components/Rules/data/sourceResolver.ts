import { WORLD_CODE_BY_WORLD_ID } from '@/components/Common/featureFormats';
import { getRuleDataMergeBaseUrl, getRuleDataPictureBaseUrl } from './sourceConfig';

const SPECIAL_CLASS_SET = new Set(['ISG', 'ISL', 'ISP']);
const REVERSE_WORLD = Object.fromEntries(Object.entries(WORLD_CODE_BY_WORLD_ID).map(([k, v]) => [String(v), k]));

export function resolveWorldDirName(world: string | number): string {
  const s = String(world ?? '').trim();
  if (REVERSE_WORLD[s]) return String(REVERSE_WORLD[s]);
  if (s) return s;
  return 'zth';
}

export function resolveMergeWorldIndexUrl(worldId: string): string {
  const worldDir = resolveWorldDirName(worldId);
  return `${getRuleDataMergeBaseUrl().replace(/\/$/, '')}/${worldDir}/INDEX.json`;
}

export function resolveCategoryIndexUrl(args: { worldId: string; className: string; kind?: string; repoType: 'merge' | 'picture' }): string {
  const baseUrl = args.repoType === 'merge' ? getRuleDataMergeBaseUrl() : getRuleDataPictureBaseUrl();
  const worldDir = resolveWorldDirName(args.worldId);
  const className = String(args.className).trim();
  const kind = String(args.kind ?? '').trim();
  const categoryPath = SPECIAL_CLASS_SET.has(className) && kind
    ? `${worldDir}/${className}/${kind}`
    : `${worldDir}/${className}`;
  return `${baseUrl.replace(/\/$/, '')}/${categoryPath}/INDEX.json`;
}

export function resolveChunkUrl(args: { worldId: string; className: string; kind?: string; file: string }): string {
  const baseUrl = getRuleDataMergeBaseUrl();
  const worldDir = resolveWorldDirName(args.worldId);
  const className = String(args.className).trim();
  const kind = String(args.kind ?? '').trim();
  const categoryPath = SPECIAL_CLASS_SET.has(className) && kind
    ? `${worldDir}/${className}/${kind}`
    : `${worldDir}/${className}`;
  return `${baseUrl.replace(/\/$/, '')}/${categoryPath}/${args.file}`;
}

export function resolvePictureFileUrl(args: { worldId: string | number; className: string; kind?: string; relativePath: string }): string {
  const baseUrl = getRuleDataPictureBaseUrl();
  const worldDir = resolveWorldDirName(args.worldId);
  const className = String(args.className).trim();
  const kind = String(args.kind ?? '').trim();
  const categoryPath = SPECIAL_CLASS_SET.has(className) && kind
    ? `${worldDir}/${className}/${kind}`
    : `${worldDir}/${className}`;
  return `${baseUrl.replace(/\/$/, '')}/${categoryPath}/${String(args.relativePath).replace(/^\/+/, '')}`;
}
