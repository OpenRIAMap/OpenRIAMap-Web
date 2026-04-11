import { buildZipStore } from '@/lib/zipStore';
import { stringifyFeatureJson } from '@/components/Common/featureJsonSerializer';
import { WORLD_CODE_BY_WORLD_ID } from '@/components/Common/featureFormats';
import type { RelayPackageDraft } from './relayPackageDraft';
import { buildRelayPackageToolRefreshFiles } from './relayPackageToolRefresh';

export type RelayExportLayer = {
  id: number;
  mode: 'point' | 'polyline' | 'polygon';
  color: string;
  coords: { x: number; z: number; y?: number }[];
  visible: boolean;
  jsonInfo?: {
    subType: string;
    featureInfo: any;
  };
};

const SPECIAL_CLASS_SET = new Set(['ISG', 'ISL', 'ISP']);
const REVERSE_WORLD = Object.fromEntries(Object.entries(WORLD_CODE_BY_WORLD_ID).map(([k, v]) => [String(v), k]));

function resolveWorldDirName(world: any, fallbackWorldId: string): string {
  const n = String(world ?? '').trim();
  if (n && REVERSE_WORLD[n]) return String(REVERSE_WORLD[n]);
  if (typeof world === 'string' && world.trim()) return world.trim();
  return fallbackWorldId;
}

async function resolvePictureBlob(pic: { file?: File; previewUrl?: string; originalName: string }): Promise<{ blob: Blob; name: string } | null> {
  if (pic.file) return { blob: pic.file, name: pic.originalName };
  const url = String(pic.previewUrl ?? '').trim();
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return { blob, name: pic.originalName || fileNameFromUrl(url) || 'image.png' };
  } catch {
    return null;
  }
}

function fileNameFromUrl(url: string): string | undefined {
  try {
    const clean = String(url || '').split('?')[0];
    const parts = clean.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : undefined;
  } catch {
    return undefined;
  }
}

function safeExt(name: string): string {
  const m = String(name || '').match(/\.[a-zA-Z0-9]+$/);
  return m ? m[0] : '.png';
}

function buildTextOnlyPackage(args: {
  layers: RelayExportLayer[];
  currentWorldId: string;
  draft: RelayPackageDraft;
  operator: string;
  note: string;
}): Blob {
  const files: Array<{ name: string; text: string }> = [];
  const exportLayers = args.layers.filter((l) => Boolean(l.jsonInfo?.featureInfo));
  let featureCount = 0;

  for (const layer of exportLayers) {
    const fi = layer.jsonInfo?.featureInfo;
    if (!fi || typeof fi !== 'object') continue;
    const className = String(fi.Class ?? '').trim();
    const id = String(fi.ID ?? '').trim();
    if (!className || !id) continue;
    const kind = String(fi.Kind ?? '').trim();
    const worldDir = resolveWorldDirName(fi.World, args.currentWorldId);
    const relDir = SPECIAL_CLASS_SET.has(className) && kind
      ? `Data_Spilt/${worldDir}/${className}/${kind}`
      : `Data_Spilt/${worldDir}/${className}`;
    files.push({ name: `${relDir}/${id}.json`, text: stringifyFeatureJson(fi) });
    featureCount += 1;
  }

  const deleteItems = args.draft.deleteMarks
    .map((x) => ({ ID: String(x.ID ?? '').trim(), Name: String(x.Name ?? '').trim() }))
    .filter((x) => x.ID);
  files.push({ name: 'Delete.json', text: JSON.stringify({ deleteTime: new Date().toISOString(), items: deleteItems }, null, 2) });
  files.push({
    name: 'INDEX.json',
    text: JSON.stringify({
      schemaVersion: args.draft.meta.schemaVersion || '1.0.0',
      operator: args.operator,
      note: args.note,
      version: args.draft.meta.packageVersion ?? '1.0.0',
      packageVersion: args.draft.meta.packageVersion ?? '1.0.0',
      exportedAt: new Date().toISOString(),
      featureCount,
      pictureCount: 0,
      deleteCount: deleteItems.length,
    }, null, 2),
  });
  for (const extra of buildRelayPackageToolRefreshFiles()) files.push({ name: extra.path, text: extra.text });
  return buildZipStore(files);
}

/**
 * 构建标准包 zip。
 * - 若存在图片 File，则优先使用 jszip 输出二进制 zip
 * - 若当前没有图片文件，则退回轻量 zipStore 文本打包
 */
export async function buildRelayPackageZip(args: {
  layers: RelayExportLayer[];
  currentWorldId: string;
  draft: RelayPackageDraft;
  operator: string;
  note: string;
}): Promise<Blob> {
  const hasBinaryPictures = Object.values(args.draft.picturesById).some((list) => list.some((x) => !x.deleted && (x.file || x.previewUrl)));
  if (!hasBinaryPictures) return buildTextOnlyPackage(args);

  let JSZip: any = null;
  try {
    // @ts-ignore
    JSZip = (await import('jszip')).default;
  } catch {
    return buildTextOnlyPackage(args);
  }

  const zip = new JSZip();
  const exportLayers = args.layers.filter((l) => Boolean(l.jsonInfo?.featureInfo));
  let featureCount = 0;
  let pictureCount = 0;

  for (const layer of exportLayers) {
    const fi = layer.jsonInfo?.featureInfo;
    if (!fi || typeof fi !== 'object') continue;
    const className = String(fi.Class ?? '').trim();
    const id = String(fi.ID ?? '').trim();
    if (!className || !id) continue;
    const kind = String(fi.Kind ?? '').trim();
    const worldDir = resolveWorldDirName(fi.World, args.currentWorldId);
    const relDir = SPECIAL_CLASS_SET.has(className) && kind
      ? `Data_Spilt/${worldDir}/${className}/${kind}`
      : `Data_Spilt/${worldDir}/${className}`;
    zip.file(`${relDir}/${id}.json`, stringifyFeatureJson(fi));
    featureCount += 1;
  }

  for (const [id, pics] of Object.entries(args.draft.picturesById)) {
    const firstLayer = exportLayers.find((l) => String(l.jsonInfo?.featureInfo?.ID ?? '').trim() === id);
    const fi = firstLayer?.jsonInfo?.featureInfo;
    if (!fi) continue;
    const className = String(fi.Class ?? '').trim();
    const kind = String(fi.Kind ?? '').trim();
    const worldDir = resolveWorldDirName(fi.World, args.currentWorldId);
    const relDir = SPECIAL_CLASS_SET.has(className) && kind
      ? `Picture/${worldDir}/${className}/${kind}/${id}`
      : `Picture/${worldDir}/${className}/${id}`;
    const activePics = [...pics].filter((p) => !p.deleted).sort((a, b) => a.order - b.order);
    for (let idx = 0; idx < activePics.length; idx += 1) {
      const pic = activePics[idx];
      const resolved = await resolvePictureBlob(pic);
      if (!resolved) continue;
      pictureCount += 1;
      zip.file(`${relDir}/${id}_${idx + 1}${safeExt(resolved.name)}`, resolved.blob);
    }
  }

  const deleteItems = args.draft.deleteMarks
    .map((x) => ({ ID: String(x.ID ?? '').trim(), Name: String(x.Name ?? '').trim() }))
    .filter((x) => x.ID);
  zip.file('Delete.json', JSON.stringify({ deleteTime: new Date().toISOString(), items: deleteItems }, null, 2));
  zip.file('INDEX.json', JSON.stringify({
    schemaVersion: args.draft.meta.schemaVersion || '1.0.0',
    operator: args.operator,
    note: args.note,
    version: args.draft.meta.packageVersion ?? '1.0.0',
    packageVersion: args.draft.meta.packageVersion ?? '1.0.0',
    exportedAt: new Date().toISOString(),
    featureCount,
    pictureCount,
    deleteCount: deleteItems.length,
  }, null, 2));
  for (const extra of buildRelayPackageToolRefreshFiles()) zip.file(extra.path, extra.text);
  return zip.generateAsync({ type: 'blob' });
}
