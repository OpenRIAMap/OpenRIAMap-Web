import { loadRuleItemsForWorld } from '@/components/Rules/data/ruleDataSources';
import { pickIdFieldValue } from '@/components/Rules/rendering/renderRules';

export type GlobalDbIdHit = {
  file: string;
  id: string;
  name: string;
};

export type TempLayerIdCandidate = {
  /** 图层在图层管理中的展示名（用于报错提示里的“xx图层”） */
  title: string;
  /** 该图层主 ID 值（用于对比） */
  id: string;
};

type CacheEntry = {
  builtAt: number;
  index: Map<string, GlobalDbIdHit>;
};

// 轻量缓存：避免用户反复点“临时挂载”时重复拉全库文件
const CACHE_TTL_MS = 60_000;
const cache: Record<string, CacheEntry | undefined> = {};

function pickAnyName(obj: any): string {
  if (!obj || typeof obj !== 'object') return '';
  const direct =
    obj.Name ??
    obj.name ??
    obj.StaName ??
    obj.StationName ??
    obj.Name ??
    obj.PlatformName ??
    obj.BuildingName;
  if (direct != null && String(direct).trim()) return String(direct).trim();

  // fallback: first key that ends with Name/name
  for (const k of Object.keys(obj)) {
    if (typeof k !== 'string') continue;
    if (k.endsWith('Name') || k.endsWith('name')) {
      const v = (obj as any)[k];
      if (v != null && String(v).trim()) return String(v).trim();
    }
  }
  return '';
}


async function buildGlobalDbIdIndex(worldId: string): Promise<Map<string, GlobalDbIdHit>> {
  const now = Date.now();
  const c = cache[worldId];
  if (c && now - c.builtAt < CACHE_TTL_MS) return c.index;

  const index = new Map<string, GlobalDbIdHit>();
  const items = await loadRuleItemsForWorld(worldId);
  for (const obj of items) {
    if (!obj || typeof obj !== 'object') continue;
    const cls = String((obj as any).Class ?? (obj as any).subType ?? (obj as any).Type ?? '');
    const { idValue } = pickIdFieldValue(obj, cls);
    const id = String(idValue ?? '').trim();
    if (!id || index.has(id)) continue;
    index.set(id, { file: '[world-dataset]', id, name: pickAnyName(obj) });
  }
  cache[worldId] = { builtAt: now, index };
  return index;
}

/**
 * 将“临时挂载候选图层”的 ID 与“全局数据库（RULE_DATA_SOURCES 全文件）”的 ID 做对比。
 * - 不依赖当前是否加载/显示
 * - 不改变任何现有载入/渲染模式（只做校验）
 */
export async function checkTempMountIdConflicts(params: {
  worldId: string;
  candidates: TempLayerIdCandidate[];
}): Promise<string[]> {
  const { worldId, candidates } = params;
  const messages: string[] = [];

  // 0) 先检查“当前测绘图层管理内部”的 ID 冲突（不需要读取全局库，反馈更及时）
  const seen = new Map<string, string>();
  for (const c of candidates) {
    const id = String(c.id ?? '').trim();
    if (!id) continue;
    const prevTitle = seen.get(id);
    if (prevTitle) {
      messages.push(`当前临时图层中的${c.title}，与 当前临时图层中的${prevTitle} 的ID ${id} 重合`);
      continue;
    }
    seen.set(id, c.title);
  }
  if (messages.length > 0) return messages;

  const index = await buildGlobalDbIdIndex(worldId);
  for (const c of candidates) {
    const id = String(c.id ?? '').trim();
    if (!id) continue;
    const hit = index.get(id);
    if (!hit) continue;
    messages.push(`当前临时图层中的${c.title}，与 ${hit.file} ${hit.id} ${hit.name} 重合`);
  }
  return messages;
}

export async function checkTempMountIdConflictsDetailed(params: {
  worldId: string;
  candidates: TempLayerIdCandidate[];
}): Promise<{ messages: string[]; conflictIds: string[]; internalConflict: boolean }> {
  const { worldId, candidates } = params;
  const messages: string[] = [];
  const conflictIds: string[] = [];

  // 0) 先检查“当前测绘图层管理内部”的 ID 冲突（此类冲突无法通过“更新挂载”解决）
  const seen = new Map<string, string>();
  let internalConflict = false;
  for (const c of candidates) {
    const id = String(c.id ?? '').trim();
    if (!id) continue;
    const prevTitle = seen.get(id);
    if (prevTitle) {
      internalConflict = true;
      messages.push(`当前临时图层中的${c.title}，与 当前临时图层中的${prevTitle} 的ID ${id} 重合`);
      conflictIds.push(id);
      continue;
    }
    seen.set(id, c.title);
  }
  if (messages.length > 0) {
    return { messages, conflictIds: Array.from(new Set(conflictIds)), internalConflict };
  }

  const index = await buildGlobalDbIdIndex(worldId);
  for (const c of candidates) {
    const id = String(c.id ?? '').trim();
    if (!id) continue;
    const hit = index.get(id);
    if (!hit) continue;
    messages.push(`当前临时图层中的${c.title}，与 ${hit.file} ${hit.id} ${hit.name} 重合`);
    conflictIds.push(id);
  }
  return { messages, conflictIds: Array.from(new Set(conflictIds)), internalConflict: false };
}
