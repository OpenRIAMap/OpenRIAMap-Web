import { DATA_TOOL_SCHEMA } from '@/components/Common/buildDataToolSchema';
import type { ProgressCallback } from '@/lib/fetchWithMirror';
import { fetchJsonViaConfiguredSource, fetchCategoryIndex, fetchChunkArray } from './dataRepositoryReader';
import { resolveMergeWorldIndexUrl } from './sourceResolver';
import { isRuleWorldCacheValid, readRuleWorldCache, writeRuleWorldCache } from './worldRuleCache';
import type { RuleWorldDataset } from './sourceTypes';

const SPECIAL_CLASS_SET = new Set(DATA_TOOL_SCHEMA.specialClasses);

export async function fetchWorldMergeVersion(worldId: string, onProgress?: ProgressCallback): Promise<number | string> {
  const url = resolveMergeWorldIndexUrl(worldId);
  const data = await fetchJsonViaConfiguredSource<any>(url, 'world-version', onProgress);
  return data?.version ?? '0';
}

export async function loadWorldRuleDataset(worldId: string, onProgress?: ProgressCallback): Promise<RuleWorldDataset> {
  const mergeVersion = await fetchWorldMergeVersion(worldId, onProgress);
  onProgress?.({ stage: 'world-cache-check', status: 'loading' });
  if (isRuleWorldCacheValid(worldId, mergeVersion)) {
    onProgress?.({ stage: 'world-cache-check', status: 'success' });
    const cached = readRuleWorldCache(worldId);
    if (cached) return cached;
  } else {
    onProgress?.({ stage: 'world-cache-check', status: 'success', message: '缓存失效，重新加载' });
  }

  onProgress?.({ stage: 'world-index-scan', status: 'loading' });
  const targets: Array<{ className: string; kind?: string }> = [];
  for (const className of DATA_TOOL_SCHEMA.featureClasses) {
    if (SPECIAL_CLASS_SET.has(className)) {
      const kinds = DATA_TOOL_SCHEMA.workflowKinds[className] ?? [];
      for (const kind of kinds) targets.push({ className, kind });
    } else {
      targets.push({ className });
    }
  }
  onProgress?.({ stage: 'world-index-scan', status: 'success', message: `分类数 ${targets.length}` });

  onProgress?.({ stage: 'world-chunk-load', status: 'loading' });
  const all: Record<string, unknown>[] = [];
  let loadedChunkCount = 0;
  for (const target of targets) {
    try {
      const idx = await fetchCategoryIndex({ worldId, className: target.className, kind: target.kind, repoType: 'merge' });
      const files = Array.isArray(idx?.chunks) ? idx.chunks.map((c: any) => c?.file).filter(Boolean) : [];
      for (const file of files) {
        const arr = await fetchChunkArray({ worldId, className: target.className, kind: target.kind, file: String(file) });
        for (const item of arr) if (item && typeof item === 'object') all.push(item as Record<string, unknown>);
        loadedChunkCount += 1;
        onProgress?.({ stage: 'world-chunk-load', status: 'loading', message: `已读取 ${loadedChunkCount} 个 chunk` });
      }
    } catch {
      // 某些类/Kind 在当前世界不存在时，静默跳过
    }
  }
  onProgress?.({ stage: 'world-chunk-load', status: 'success', message: `要素数 ${all.length}` });

  onProgress?.({ stage: 'world-cache-write', status: 'loading' });
  const dataset: RuleWorldDataset = {
    worldId,
    mergeVersion,
    loadedAt: Date.now(),
    features: all,
  };
  writeRuleWorldCache(worldId, dataset);
  onProgress?.({ stage: 'world-cache-write', status: 'success' });
  onProgress?.({ stage: 'world-ready', status: 'success' });
  return dataset;
}