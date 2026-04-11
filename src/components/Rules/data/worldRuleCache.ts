import type { RuleWorldDataset } from './sourceTypes';

const RULE_CACHE_PREFIX = 'ria-rule-cache-';
const RULE_META_PREFIX = 'ria-rule-meta-';
const SCHEMA_VERSION = '1.0.1';

export type RuleCacheMeta = {
  worldId: string;
  mergeVersion: number | string;
  cachedAt: number;
  schemaVersion: string;
};

export function readRuleWorldCache(worldId: string): RuleWorldDataset | null {
  try {
    const raw = localStorage.getItem(`${RULE_CACHE_PREFIX}${worldId}`);
    if (!raw) return null;
    return JSON.parse(raw) as RuleWorldDataset;
  } catch {
    return null;
  }
}

export function readRuleWorldMeta(worldId: string): RuleCacheMeta | null {
  try {
    const raw = localStorage.getItem(`${RULE_META_PREFIX}${worldId}`);
    if (!raw) return null;
    return JSON.parse(raw) as RuleCacheMeta;
  } catch {
    return null;
  }
}

export function writeRuleWorldCache(worldId: string, dataset: RuleWorldDataset): void {
  localStorage.setItem(`${RULE_CACHE_PREFIX}${worldId}`, JSON.stringify(dataset));
  localStorage.setItem(`${RULE_META_PREFIX}${worldId}`, JSON.stringify({
    worldId,
    mergeVersion: dataset.mergeVersion,
    cachedAt: Date.now(),
    schemaVersion: SCHEMA_VERSION,
  } satisfies RuleCacheMeta));
}

export function isRuleWorldCacheValid(worldId: string, remoteVersion: number | string): boolean {
  const cache = readRuleWorldCache(worldId);
  const meta = readRuleWorldMeta(worldId);
  if (!cache || !meta) return false;
  if (meta.worldId !== worldId) return false;
  if (String(meta.mergeVersion) !== String(remoteVersion)) return false;
  if (meta.schemaVersion !== SCHEMA_VERSION) return false;
  return true;
}

export function removeRuleWorldCache(worldId: string): void {
  try {
    localStorage.removeItem(`${RULE_CACHE_PREFIX}${worldId}`);
    localStorage.removeItem(`${RULE_META_PREFIX}${worldId}`);
  } catch {
    // ignore
  }
}

export function clearAllRuleWorldCaches(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(RULE_CACHE_PREFIX) || key.startsWith(RULE_META_PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function getRuleWorldFeatureCount(worldId: string): number | null {
  const cache = readRuleWorldCache(worldId);
  const features = cache?.features;
  return Array.isArray(features) ? features.length : null;
}

export function calculateRuleCacheSize(): number {
  let size = 0;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (!key.startsWith(RULE_CACHE_PREFIX) && !key.startsWith(RULE_META_PREFIX)) continue;
      const value = localStorage.getItem(key);
      if (!value) continue;
      size += key.length + value.length;
    }
  } catch {
    return 0;
  }
  return size * 2;
}

