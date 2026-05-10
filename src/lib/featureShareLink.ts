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
    return `${loc.origin}/${encodedWorld}/${encodedId}`;
  }

  if (typeof window !== 'undefined' && window.location) {
    return `${window.location.origin}/${encodedWorld}/${encodedId}`;
  }

  return `/${encodedWorld}/${encodedId}`;
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

function parsePathLike(value: string): FeatureShareTarget | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;

  const withoutHash = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  const withoutQuery = withoutHash.split('?')[0] ?? '';
  const segments = withoutQuery.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  const worldId = cleanWorldId(decodeURIComponent(segments[0] ?? ''));
  const featureId = cleanFeatureId(decodeURIComponent(segments.slice(1).join('/')));
  if (!worldId || !featureId) return null;
  return { worldId, featureId };
}

export function parseFeatureShareTargetFromLocation(loc?: Location): FeatureShareTarget | null {
  const source = loc ?? (typeof window !== 'undefined' ? window.location : undefined);
  if (!source) return null;

  const fromPath = parsePathLike(source.pathname);
  if (fromPath) return fromPath;

  const fromHash = parsePathLike(source.hash);
  if (fromHash) return fromHash;

  const params = new URLSearchParams(source.search ?? '');
  const share = params.get('share');
  if (share) return parsePathLike(share.startsWith('/') ? share : `/${share}`);

  return null;
}
