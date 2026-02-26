import type { FeatureRecord } from '../renderRules';
import { RULE_BUTTON_DEFS, type RuleButtonCriteria } from './buttonRuleConfig';

function normalize(v: any): string {
  return String(v ?? '').trim();
}

function getTags(fi: any): any {
  return fi?.tags ?? fi?.Tags ?? {};
}

type KindTriplet = { kind: string; skind: string; skind2: string };

/**
 * 统一：所有要素均使用 Kind / SKind / SKind2。
 */
function extractKindTriplet(r: FeatureRecord): KindTriplet {
  const fi: any = r?.featureInfo ?? {};
  const tags: any = getTags(fi);
  return {
    kind: normalize(fi.Kind ?? tags.Kind),
    skind: normalize(fi.SKind ?? tags.SKind),
    skind2: normalize(fi.SKind2 ?? tags.SKind2),
  };
}

function matchCriteria(r: FeatureRecord, criteria: RuleButtonCriteria): boolean {
  // AND semantics across provided keys
  const fi: any = r?.featureInfo ?? {};
  const cls = normalize(r?.meta?.Class ?? fi?.Class);

  if (criteria.Class && criteria.Class.length > 0) {
    if (!criteria.Class.includes(cls)) return false;
  }

  const kk = extractKindTriplet(r);

  if (criteria.Kind && criteria.Kind.length > 0) {
    if (!criteria.Kind.includes(kk.kind)) return false;
  }
  if (criteria.SKind && criteria.SKind.length > 0) {
    if (!criteria.SKind.includes(kk.skind)) return false;
  }
  if (criteria.SKind2 && criteria.SKind2.length > 0) {
    if (!criteria.SKind2.includes(kk.skind2)) return false;
  }
  return true;
}

/**
 * 根据“分组开关”对预加载池进行筛选。
 * - activeButtonIds 为空 => 返回空数组（即不加载任何规则要素）
 * - 支持多个按钮并集（OR）
 * - 交叉命中不会重复（因为最终是一次 filter，而非 concat）
 */
export function filterRecordsByRuleButtons(all: FeatureRecord[], activeButtonIds: string[]): FeatureRecord[] {
  const active = new Set((activeButtonIds ?? []).map((x) => String(x).trim()).filter(Boolean));
  if (active.size === 0) return [];

  const defs = RULE_BUTTON_DEFS.filter((d) => active.has(d.id));
  if (defs.length === 0) return [];

  return all.filter((r) => {
    for (const d of defs) {
      if (matchCriteria(r, d.criteria)) return true;
    }
    return false;
  });
}

/**
 * 反查：给定一个 record，返回它会命中的按钮 id（用于 SearchBar 选择后自动打开对应图层按钮）。
 */
export function getMatchingRuleButtonIds(r: FeatureRecord): string[] {
  const out: string[] = [];
  for (const d of RULE_BUTTON_DEFS) {
    if (matchCriteria(r, d.criteria)) out.push(d.id);
  }
  return out;
}
