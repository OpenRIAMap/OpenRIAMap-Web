// Shared search rule tables for SearchBar and Navigation search inputs.
// Keep ONLY one copy of blacklist/priority maintenance.

import type { FeatureRecord } from '@/components/Rules/renderRules';
import { pickIdFieldValue } from '@/components/Rules/renderRules';
import { WORKFLOW_FEATURE_CATALOG } from '@/components/Mapping/featureFormats';

// ===== Rule blacklist =====
// One rule per line; supported fields: Class / Kind / SKind / SKind2.
// - Only Class: blacklist all of that Class
// - With Kind/SKind/SKind2: must all match
export const SEARCH_RULE_BLACKLIST_LINES: string[] = [
  '"Class":"PFB"',
];

// ===== Rule priority =====
// Order is priority (smaller index = higher).
export const SEARCH_RULE_PRIORITY_LINES: string[] = [
  '"Class":"STB"',
  '"Class":"BUD"',
  // Add more rules if needed.
];

// ===== Category (type label) overrides =====
// 维护“通用要素解析”建议在这里：
// - 默认优先使用 WORKFLOW_FEATURE_CATALOG 的 name
// - 如果你希望统一成某些固定中文类型名（例如 STB 必须叫“车站”而不是“站体”），在这里覆盖。
export const SEARCH_CATEGORY_OVERRIDE_LINES: string[] = [
  '"Class":"STB","Name":"车站"',
  '"Class":"STA","Name":"站场"',
  '"Class":"PLF","Name":"站台"',
  '"Class":"PFB","Name":"站台轮廓"',
  '"Class":"SBP","Name":"车站建筑点"',
  '"Class":"TRP","Name":"交易点"',
  '"Class":"TPP","Name":"传送点"',
  '"Class":"WRP","Name":"Warp点"',
];

type CategoryOverride = { Class: string; Name: string };

export type RuleTableItem = {
  Class?: string;
  Kind?: string;
  SKind?: string;
  SKind2?: string;
};

const parseRuleLines = (lines: string[]): RuleTableItem[] => {
  const out: RuleTableItem[] = [];
  for (const raw of lines) {
    const s = String(raw ?? '').trim();
    if (!s || s.startsWith('//') || s.startsWith('#')) continue;
    const re = /"(Class|Kind|SKind|SKind2)"\s*:\s*"([^"]*)"/g;
    const item: RuleTableItem = {};
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const k = m[1] as keyof RuleTableItem;
      const v = String(m[2] ?? '').trim();
      if (v) (item as any)[k] = v;
    }
    if (item.Class || item.Kind || item.SKind || item.SKind2) out.push(item);
  }
  return out;
};

const SEARCH_RULE_BLACKLIST = parseRuleLines(SEARCH_RULE_BLACKLIST_LINES);
const SEARCH_RULE_PRIORITY = parseRuleLines(SEARCH_RULE_PRIORITY_LINES);

const parseCategoryOverrideLines = (lines: string[]): CategoryOverride[] => {
  const out: CategoryOverride[] = [];
  for (const raw of lines) {
    const s = String(raw ?? '').trim();
    if (!s || s.startsWith('//') || s.startsWith('#')) continue;
    const cls = /"Class"\s*:\s*"([^"]+)"/.exec(s)?.[1]?.trim() ?? '';
    const name = /"Name"\s*:\s*"([^"]+)"/.exec(s)?.[1]?.trim() ?? '';
    if (cls && name) out.push({ Class: cls, Name: name });
  }
  return out;
};

const SEARCH_CATEGORY_OVERRIDES = (() => {
  const m = new Map<string, string>();
  for (const it of parseCategoryOverrideLines(SEARCH_CATEGORY_OVERRIDE_LINES)) m.set(it.Class, it.Name);
  return m;
})();

export function getRuleCategoryName(r: FeatureRecord): string {
  const fi: any = r?.featureInfo ?? {};
  const cls = String(r?.meta?.Class ?? fi?.Class ?? '').trim();
  if (cls && SEARCH_CATEGORY_OVERRIDES.has(cls)) return SEARCH_CATEGORY_OVERRIDES.get(cls)!;

  const kk = extractKindTriplet(r);
  const hit = WORKFLOW_FEATURE_CATALOG.find(
    (e) => e.classCode === cls && e.kind === kk.kind && e.skind === kk.skind && e.skind2 === kk.skind2,
  );
  if (hit?.name) return hit.name;

  const fallback: Record<string, string> = {
    ISG: '地物面',
    ISP: '地物点',
    ISL: '地物线',
    STA: '站场',
    STB: '车站',
    SBP: '车站建筑点',
    PLF: '站台',
    PFB: '站台轮廓',
    RLE: '铁路',
    TPP: '传送点',
    TRP: '交易点',
    WRP: 'Warp点',
    BUD: '建筑',
    FLR: '楼层',
    STF: '楼层',
  };
  return fallback[cls] ?? cls;
}

/**
 * Build an index from building-like IDs to their display names.
 * - BUD: ID
 * - STB: ID
 *
 * Used to render FLR/STF as: "类型（从属建筑名）" in SearchBar/Navigation.
 */
export function buildBuildingNameIndex(rulePool: FeatureRecord[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rulePool ?? []) {
    const fi: any = r?.featureInfo ?? {};
    const cls = String(r?.meta?.Class ?? fi?.Class ?? '').trim();
    if (cls !== 'BUD' && cls !== 'STB') continue;

    const dn = getRuleDisplayName(r);
    if (!dn.name) continue;

    if (cls === 'BUD') {
      const id = String(fi?.ID ?? dn.idValue ?? '').trim();
      if (id) m.set(id, dn.name);
    } else {
      const id = String(fi?.ID ?? dn.idValue ?? '').trim();
      if (id) m.set(id, dn.name);
    }
  }
  return m;
}

/**
 * For FLR/STF, append parent building name if available:
 *   "楼层（XX建筑）" / "楼层（XX车站）"
 */
export function getRuleCategoryLabelWithParent(
  r: FeatureRecord,
  buildingNameIndex?: Map<string, string> | null,
): string {
  const base = getRuleCategoryName(r);
  if (!buildingNameIndex) return base;
  const fi: any = r?.featureInfo ?? {};
  const cls = String(r?.meta?.Class ?? fi?.Class ?? '').trim();

  if (cls === 'FLR') {
    const bid = String(fi?.BuildingID ?? fi?.buildingID ?? fi?.buildingId ?? '').trim();
    const bname = bid ? (buildingNameIndex.get(bid) || '') : '';
    // Use ASCII parentheses to avoid overly long full-width rendering.
    return bname ? `${base}(${bname})` : base;
  }
  if (cls === 'STF') {
    const bid = String(fi?.staBuildingID ?? fi?.staBuildingId ?? fi?.STBuilding ?? fi?.BuildingID ?? '').trim();
    const bname = bid ? (buildingNameIndex.get(bid) || '') : '';
    return bname ? `${base}(${bname})` : base;
  }
  return base;
}

export function getRuleDisplayName(r: FeatureRecord): { name: string; rawName: string; idValue: string; idField: string } {
  const fi: any = r?.featureInfo ?? {};
  const tags: any = (fi?.tags ?? fi?.Tags ?? {}) as any;
  const cls = String(r?.meta?.Class ?? fi?.Class ?? '').trim();

  const picked = pickIdFieldValue(fi, cls);
  const idField = String((picked as any)?.idField ?? '').trim();
  const idValue = String((picked as any)?.idValue ?? '').trim();

  const keyMap = (() => {
    const m = new Map<string, string>();
    if (!fi || typeof fi !== 'object') return m;
    for (const k of Object.keys(fi)) m.set(String(k).toLowerCase(), k);
    return m;
  })();

  const tryGet = (k: string) => {
    const v = fi?.[k];
    return v === null || v === undefined ? '' : String(v).trim();
  };
  const tryGetTags = (k: string) => {
    const v = tags?.[k];
    return v === null || v === undefined ? '' : String(v).trim();
  };
  const tryGetCI = (k: string) => {
    const direct = tryGet(k) || tryGetTags(k);
    if (direct) return direct;
    const realKey = keyMap.get(String(k).toLowerCase());
    return realKey ? (tryGet(realKey) || tryGetTags(realKey)) : '';
  };

  // 1) 由 xxxID 推导 xxxName
  let rawName = '';
  if (idField) {
    const derivedNameKey = idField.replace(/ID$/i, 'Name');
    rawName = tryGetCI(derivedNameKey);
    if (!rawName && derivedNameKey && derivedNameKey[0]) {
      const cap = derivedNameKey[0].toUpperCase() + derivedNameKey.slice(1);
      rawName = tryGetCI(cap);
    }
  }

  // 2) 常见字段兜底
  if (!rawName) {
    const commonKeys = [
      'lineName',
      'Name',
      'Name',
      'BuildingName',
      'Name',
      'name',
    ];
    for (const k of commonKeys) {
      rawName = tryGetCI(k);
      if (rawName) break;
    }
  }

  // 3) 扫描任意 *Name：优先选择存在同前缀 *ID 配对的 Name
  if (!rawName) {
    const keys = fi && typeof fi === 'object' ? Object.keys(fi) : [];
    const nameKeys = keys.filter((k) => /name$/i.test(k) && !/(kindname|skindname|classkey)$/i.test(k));

    const scored = nameKeys
      .map((k) => {
        const pairIdKey = k.replace(/name$/i, 'ID');
        const hasPairId = tryGet(pairIdKey) ? 1 : 0;
        return { k, hasPairId };
      })
      .sort((a, b) => (b.hasPairId - a.hasPairId) || a.k.localeCompare(b.k));

    for (const it of scored) {
      const v = tryGet(it.k);
      if (v) {
        rawName = v;
        break;
      }
    }
  }

  const name = rawName ? rawName : idValue ? `${cls} ${idValue}` : `${cls}`;
  return { name, rawName, idValue, idField };
}

/**
 * Extract Kind/SKind/SKind2 triplet with the same compatibility logic as SearchBar.
 * - BUD: Kind/SKind
 * - FLR/STF: Kind/SKind
 * - Otherwise: Point/PLine/PGon* fields based on geometry type, falling back to Kind/SKind/SKind2.
 */
export function extractKindTriplet(r: FeatureRecord): { kind: string; skind: string; skind2: string } {
  const fi: any = r?.featureInfo ?? {};
  const tags: any = fi?.tags ?? fi?.Tags ?? {};
  const cls = String(r?.meta?.Class ?? fi?.Class ?? '').trim();

  if (cls === 'BUD') {
    return {
      kind: String(fi.Kind ?? tags.Kind ?? '').trim(),
      skind: String(fi.SKind ?? tags.SKind ?? '').trim(),
      skind2: String(fi.SKind2 ?? tags.SKind2 ?? '').trim(),
    };
  }
  if (cls === 'FLR' || cls === 'STF') {
    return {
      kind: String(fi.Kind ?? tags.Kind ?? '').trim(),
      skind: String(fi.SKind ?? tags.SKind ?? '').trim(),
      skind2: String(fi.SKind2 ?? tags.SKind2 ?? '').trim(),
    };
  }

  const t = (r as any)?.type ?? (r as any)?.meta?.Type;
  const prefix = t === 'Points' ? 'Point' : t === 'Polyline' ? 'PLine' : t === 'Polygon' ? 'PGon' : '';
  if (prefix) {
    const kKey = `${prefix}Kind`;
    const skKey = `${prefix}SKind`;
    const sk2Key = `${prefix}SKind2`;
    return {
      kind: String(fi?.[kKey] ?? tags?.[kKey] ?? fi.Kind ?? tags.Kind ?? '').trim(),
      skind: String(fi?.[skKey] ?? tags?.[skKey] ?? fi.SKind ?? tags.SKind ?? '').trim(),
      skind2: String(fi?.[sk2Key] ?? tags?.[sk2Key] ?? fi.SKind2 ?? tags.SKind2 ?? '').trim(),
    };
  }

  return {
    kind: String(fi.Kind ?? tags.Kind ?? '').trim(),
    skind: String(fi.SKind ?? tags.SKind ?? '').trim(),
    skind2: String(fi.SKind2 ?? tags.SKind2 ?? '').trim(),
  };
}

export function isRuleBlacklisted(r: FeatureRecord): boolean {
  if (!SEARCH_RULE_BLACKLIST.length) return false;
  const fi: any = r?.featureInfo ?? {};
  const cls = String(r?.meta?.Class ?? fi?.Class ?? '').trim();
  const kk = extractKindTriplet(r);
  for (const it of SEARCH_RULE_BLACKLIST) {
    if (it.Class && it.Class !== cls) continue;
    if (it.Kind && it.Kind !== kk.kind) continue;
    if (it.SKind && it.SKind !== kk.skind) continue;
    if (it.SKind2 && it.SKind2 !== kk.skind2) continue;
    return true;
  }
  return false;
}

export function getRulePriorityIndex(r: FeatureRecord): number {
  if (!SEARCH_RULE_PRIORITY.length) return Number.POSITIVE_INFINITY;
  const fi: any = r?.featureInfo ?? {};
  const cls = String(r?.meta?.Class ?? fi?.Class ?? '').trim();
  const kk = extractKindTriplet(r);
  for (let i = 0; i < SEARCH_RULE_PRIORITY.length; i++) {
    const it = SEARCH_RULE_PRIORITY[i];
    if (it.Class && it.Class !== cls) continue;
    if (it.Kind && it.Kind !== kk.kind) continue;
    if (it.SKind && it.SKind !== kk.skind) continue;
    if (it.SKind2 && it.SKind2 !== kk.skind2) continue;
    return i;
  }
  return Number.POSITIVE_INFINITY;
}
