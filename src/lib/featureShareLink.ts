import type { FeatureRecord } from '@/components/Rules/rendering/renderRules';

const KNOWN_WORLDS = new Set(['zth', 'eden', 'naraku', 'houtu', 'laputa']);

export type FeatureShareTarget = {
  worldId: string;
  featureId: string;
};

export type FeatureSharePayload = FeatureShareTarget & {
  title: string;
  url: string;
  featureName: string;
};

export type FeatureShareParseResult =
  | { kind: 'none' }
  | { kind: 'valid'; target: FeatureShareTarget }
  | { kind: 'invalid'; message: string };

function cleanWorldId(value: unknown): string {
  const worldId = String(value ?? '').trim().toLowerCase();
  return KNOWN_WORLDS.has(worldId) ? worldId : '';
}

function cleanFeatureId(value: unknown): string {
  return String(value ?? '').trim();
}

export function pickFeatureShareId(feature?: FeatureRecord | null): string {
  return cleanFeatureId(feature?.meta?.idValue ?? feature?.featureInfo?.ID);
}

export function pickFeatureShareWorld(feature?: FeatureRecord | null, fallbackWorldId = 'zth'): string {
  return (
    cleanWorldId(feature?.featureInfo?.World) ||
    cleanWorldId((feature?.meta as any)?.World) ||
    cleanWorldId(fallbackWorldId) ||
    'zth'
  );
}

export function pickFeatureNameField(feature?: FeatureRecord | null): string {
  return String(feature?.featureInfo?.Name ?? '').trim();
}

function makeUrlFromLocation(worldId: string, featureId: string, loc?: Location): string {
  const encodedWorld = encodeURIComponent(worldId);
  const encodedId = encodeURIComponent(featureId);

  if (loc) {
    return `${loc.origin}/#/${encodedWorld}/${encodedId}`;
  }

  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.origin}/#/${encodedWorld}/${encodedId}`;
  }

  return `/#/${encodedWorld}/${encodedId}`;
}

export function buildFeatureShareUrl(args: {
  worldId: string;
  featureId: string;
  location?: Location;
}): string {
  const worldId = cleanWorldId(args.worldId) || 'zth';
  const featureId = cleanFeatureId(args.featureId);
  return makeUrlFromLocation(worldId, featureId, args.location);
}

export function buildFeatureSharePayload(args: {
  feature?: FeatureRecord | null;
  title?: string;
  fallbackWorldId?: string;
  location?: Location;
}): FeatureSharePayload | null {
  const featureId = pickFeatureShareId(args.feature);
  if (!featureId) return null;
  const worldId = pickFeatureShareWorld(args.feature, args.fallbackWorldId ?? 'zth');
  const featureName = pickFeatureNameField(args.feature);
  return {
    worldId,
    featureId,
    title: String(args.title || featureName || featureId || '分享要素').trim(),
    featureName,
    url: buildFeatureShareUrl({ worldId, featureId, location: args.location }),
  };
}


const PENDING_SHARE_RESULT_KEY = '__riaFeatureSharePendingResult';
const SHARE_PENDING_DEV_TTL_MS = 1500;

type SharePendingWindow = Window & {
  [PENDING_SHARE_RESULT_KEY]?: FeatureShareParseResult;
};

function getPendingShareWindow(): SharePendingWindow | null {
  if (typeof window === 'undefined') return null;
  return window as SharePendingWindow;
}

function isValidPendingShareResult(value: unknown): value is FeatureShareParseResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as FeatureShareParseResult;
  if (result.kind === 'none') return true;
  if (result.kind === 'invalid') return typeof result.message === 'string';
  if (result.kind === 'valid') {
    return Boolean(cleanWorldId(result.target?.worldId) && cleanFeatureId(result.target?.featureId));
  }
  return false;
}

function keepShareResultForDevStrictMode(result: FeatureShareParseResult) {
  const pendingWindow = getPendingShareWindow();
  if (!pendingWindow || result.kind === 'none') return;

  // React StrictMode 会在本地 dev 下执行“挂载 → 卸载 → 再挂载”。
  // 第一次挂载会清理 URL；第二次挂载需要从内存兜底中取回本次分享目标。
  pendingWindow[PENDING_SHARE_RESULT_KEY] = result;
  window.setTimeout(() => {
    if (pendingWindow[PENDING_SHARE_RESULT_KEY] === result) {
      delete pendingWindow[PENDING_SHARE_RESULT_KEY];
    }
  }, SHARE_PENDING_DEV_TTL_MS);
}

function takePendingShareResultForDevStrictMode(): FeatureShareParseResult | null {
  const pendingWindow = getPendingShareWindow();
  if (!pendingWindow) return null;

  const pending = pendingWindow[PENDING_SHARE_RESULT_KEY];
  if (!pending) return null;
  delete pendingWindow[PENDING_SHARE_RESULT_KEY];

  return isValidPendingShareResult(pending) ? pending : null;
}

function parseSegmentsToShareTarget(segments: string[], treatAsShareUrl: boolean): FeatureShareParseResult {
  if (segments.length === 0) return { kind: 'none' };

  const first = decodeURIComponent(segments[0] ?? '');
  const worldId = cleanWorldId(first);

  // 对普通路径仅在首段就是已知 world 时才解析，避免把 SPA 内部路径误判为无效分享链接。
  if (!worldId && !treatAsShareUrl) return { kind: 'none' };

  if (!worldId || segments.length < 2) {
    return { kind: 'invalid', message: '无效世界或要素ID' };
  }

  const featureId = cleanFeatureId(decodeURIComponent(segments.slice(1).join('/')));
  if (!featureId) return { kind: 'invalid', message: '无效世界或要素ID' };

  return { kind: 'valid', target: { worldId, featureId } };
}

function parseSharePathLike(value: string, treatAsShareUrl: boolean): FeatureShareParseResult {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return { kind: 'none' };

  const withoutHash = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  const withoutQuery = withoutHash.split('?')[0] ?? '';
  const segments = withoutQuery.split('/').filter(Boolean);

  if (segments[0] === 'share') {
    return parseSegmentsToShareTarget(segments.slice(1), true);
  }

  return parseSegmentsToShareTarget(segments, treatAsShareUrl);
}

function parseShareTargetFromLocation(loc?: Location): FeatureShareParseResult {
  const source = loc ?? (typeof window !== 'undefined' ? window.location : undefined);
  if (!source) return { kind: 'none' };

  const fromHash = parseSharePathLike(source.hash, true);
  if (fromHash.kind !== 'none') return fromHash;

  const params = new URLSearchParams(source.search ?? '');
  if (params.has('share')) {
    return parseSharePathLike(params.get('share') ?? '', true);
  }

  const fromPath = parseSharePathLike(source.pathname, false);
  if (fromPath.kind !== 'none') return fromPath;

  return { kind: 'none' };
}

export function parseFeatureShareTargetFromLocation(loc?: Location): FeatureShareTarget | null {
  const result = parseShareTargetFromLocation(loc);
  return result.kind === 'valid' ? result.target : null;
}

export function consumeFeatureShareTargetFromLocation(loc?: Location): FeatureShareParseResult {
  const source = loc ?? (typeof window !== 'undefined' ? window.location : undefined);
  const result = parseShareTargetFromLocation(source);

  if (result.kind !== 'none' && typeof window !== 'undefined' && window.history && window.location) {
    keepShareResultForDevStrictMode(result);
    try {
      window.history.replaceState(null, '', `${window.location.origin}/`);
    } catch (error) {
      console.warn('[share-link] 清理分享链接 URL 失败：', error);
    }
    return result;
  }

  return takePendingShareResultForDevStrictMode() ?? result;
}
