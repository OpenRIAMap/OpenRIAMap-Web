import { loadRuleItemsForWorld, normalizeRuleSourceWorldId } from '@/components/Rules/data/ruleDataSources';

const TEMP_RULE_SOURCES_KEY = 'ria_temp_rule_sources_v1';
const TEMP_RULE_SOURCES_REV_KEY = 'ria_temp_rule_sources_v1_rev';
const TEMP_RULE_OVERRIDE_IDS_KEY = 'ria_temp_rule_override_ids_v1';
const TEMP_RULE_OVERRIDE_IDS_REV_KEY = 'ria_temp_rule_override_ids_v1_rev';
const TEMP_RULE_DELETE_IDS_KEY = 'ria_temp_rule_delete_ids_v1';
const TEMP_RULE_DELETE_IDS_REV_KEY = 'ria_temp_rule_delete_ids_v1_rev';

export type TempRuleSource = {
  uid: string;
  worldId: string;
  label?: string;
  enabled: boolean;
  items: any[];
};

export type EffectiveRuleItemsResult = {
  worldId: string;
  items: any[];
  enabledTempSources: TempRuleSource[];
  overrideIds: Set<string>;
  deleteIds: Set<string>;
  signature: string;
  sourceRevision: string;
  overrideRevision: string;
  deleteRevision: string;
};

function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return String(h >>> 0);
}

function safeParseJson(raw: string | null): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readTempSources(worldId: string): TempRuleSource[] {
  try {
    const raw = localStorage.getItem(TEMP_RULE_SOURCES_KEY);
    const obj = safeParseJson(raw);
    const list = (obj?.[worldId] ?? []) as any[];
    if (!Array.isArray(list)) return [];
    return list
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({
        uid: String((x as any).uid ?? ''),
        worldId: String((x as any).worldId ?? worldId),
        label: typeof (x as any).label === 'string' ? String((x as any).label) : undefined,
        enabled: Boolean((x as any).enabled),
        items: Array.isArray((x as any).items) ? (x as any).items : [],
      }))
      .filter((x) => x.uid && x.worldId === worldId);
  } catch {
    return [];
  }
}

function readOverrideIds(worldId: string): Set<string> {
  try {
    const raw = localStorage.getItem(TEMP_RULE_OVERRIDE_IDS_KEY);
    const obj = safeParseJson(raw);
    const list = (obj?.[worldId] ?? []) as any[];
    if (!Array.isArray(list)) return new Set();
    return new Set(list.map((x) => String(x ?? '').trim()).filter((s) => s));
  } catch {
    return new Set();
  }
}

function readTempDeleteIds(worldId: string): Set<string> {
  try {
    const raw = localStorage.getItem(TEMP_RULE_DELETE_IDS_KEY);
    const obj = safeParseJson(raw);
    const list = (obj?.[worldId] ?? []) as any[];
    if (!Array.isArray(list)) return new Set();
    return new Set(list.map((x) => String(x ?? '').trim()).filter((s) => s));
  } catch {
    return new Set();
  }
}

function readRevision(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function buildSignature(worldId: string, enabledTemps: TempRuleSource[], overrideIds: Set<string>, deleteIds: Set<string>, sourceRevision: string, overrideRevision: string, deleteRevision: string): string {
  const tempMeta = enabledTemps.map((t) => ({ uid: t.uid, enabled: !!t.enabled, count: Array.isArray(t.items) ? t.items.length : 0 }));
  const rawTempMeta = (() => {
    try { return JSON.stringify(tempMeta); } catch { return ''; }
  })();
  const rawOverride = (() => {
    try { return JSON.stringify(Array.from(overrideIds).sort()); } catch { return ''; }
  })();
  const rawDelete = (() => {
    try { return JSON.stringify(Array.from(deleteIds).sort()); } catch { return ''; }
  })();
  return `eff::${worldId}::temp=${hashString(rawTempMeta)}::srcRev=${sourceRevision}::ovr=${hashString(rawOverride)}::ovrRev=${overrideRevision}::del=${hashString(rawDelete)}::delRev=${deleteRevision}`;
}

export async function loadEffectiveRuleItemsForWorld(
  worldId: string,
  opt?: { fetcher?: (url: string) => Promise<any[]> },
): Promise<EffectiveRuleItemsResult> {
  const wid = normalizeRuleSourceWorldId(worldId);
  const baseItems = await loadRuleItemsForWorld(wid, { fetcher: opt?.fetcher });
  const enabledTempSources = readTempSources(wid).filter((t) => t.enabled);
  const overrideIds = enabledTempSources.length > 0 ? readOverrideIds(wid) : new Set<string>();
  const deleteIds = enabledTempSources.length > 0 ? readTempDeleteIds(wid) : new Set<string>();
  const sourceRevision = enabledTempSources.length > 0 ? readRevision(TEMP_RULE_SOURCES_REV_KEY) : '';
  const overrideRevision = enabledTempSources.length > 0 || overrideIds.size > 0 ? readRevision(TEMP_RULE_OVERRIDE_IDS_REV_KEY) : '';
  const deleteRevision = deleteIds.size > 0 ? readRevision(TEMP_RULE_DELETE_IDS_REV_KEY) : '';
  const excludeIds = new Set<string>([...overrideIds, ...deleteIds]);

  const items: any[] = [];
  for (const it of baseItems) {
    const id = String((it as any)?.ID ?? '').trim();
    if (id && excludeIds.has(id)) continue;
    items.push(it);
  }
  for (const src of enabledTempSources) {
    for (const it of src.items ?? []) items.push(it);
  }

  return {
    worldId: wid,
    items,
    enabledTempSources,
    overrideIds,
    deleteIds,
    sourceRevision,
    overrideRevision,
    deleteRevision,
    signature: buildSignature(wid, enabledTempSources, overrideIds, deleteIds, sourceRevision, overrideRevision, deleteRevision),
  };
}

function bumpRevision(key: string): string {
  const next = String(Date.now());
  try {
    localStorage.setItem(key, next);
  } catch {
    // ignore
  }
  return next;
}

export function bumpTempRuleSourcesRevision(): string {
  return bumpRevision(TEMP_RULE_SOURCES_REV_KEY);
}

export function bumpTempRuleOverrideIdsRevision(): string {
  return bumpRevision(TEMP_RULE_OVERRIDE_IDS_REV_KEY);
}

export function bumpTempRuleDeleteIdsRevision(): string {
  return bumpRevision(TEMP_RULE_DELETE_IDS_REV_KEY);
}
