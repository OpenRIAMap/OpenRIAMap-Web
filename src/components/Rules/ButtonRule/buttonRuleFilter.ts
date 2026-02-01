import type { FeatureRecord, GeoType } from '../renderRules';
import { RULE_BUTTON_DEFS, type RuleButtonCriteria } from './buttonRuleConfig';

function normalize(v: any): string {
  return String(v ?? '').trim();
}

function getTags(fi: any): any {
  return fi?.tags ?? fi?.Tags ?? {};
}

type KindTriplet = { kind: string; skind: string; skind2: string };

/**
 * 按“要素表”归一化 Kind / SKind / SKind2 字段名：
 * - 点：PointKind / PointSKind / PointSKind2   (GeoType: 'Points')
 * - 线：PLineKind / PLineSKind / PLineSKind2   (GeoType: 'Polyline')
 * - 面：PGonKind / PGonSKind / PGonSKind2      (GeoType: 'Polygon')
 * - 建筑：BuildingKind / BuildingSKind
 * - 楼层：FloorKind / FloorSKind
 * - 兜底：Kind / SKind / SKind2（兼容旧数据）
 */
function extractKindTriplet(r: FeatureRecord): KindTriplet {
  const fi: any = r?.featureInfo ?? {};
  const tags: any = getTags(fi);

  // renderRules.FeatureMeta 里的字段名是 Class（不是 className）
  const cls = normalize(r?.meta?.Class ?? fi?.Class);

  // class 优先的特例映射（不依赖几何 type）
  if (cls === 'BUD') {
    return {
      kind: normalize(fi.BuildingKind ?? tags.BuildingKind ?? fi.Kind ?? tags.Kind),
      skind: normalize(fi.BuildingSKind ?? tags.BuildingSKind ?? fi.SKind ?? tags.SKind),
      skind2: normalize(fi.SKind2 ?? tags.SKind2),
    };
  }
  if (cls === 'FLR' || cls === 'STF') {
    return {
      kind: normalize(fi.FloorKind ?? tags.FloorKind ?? fi.Kind ?? tags.Kind),
      skind: normalize(fi.FloorSKind ?? tags.FloorSKind ?? fi.SKind ?? tags.SKind),
      skind2: normalize(fi.SKind2 ?? tags.SKind2),
    };
  }

  // geometry type 驱动的通用映射（ISP/ISL/ISG 以及其他通用要素）
  const t: GeoType | undefined = r?.type ?? r?.meta?.Type;
  const prefix = t === 'Points' ? 'Point' : t === 'Polyline' ? 'PLine' : t === 'Polygon' ? 'PGon' : '';

  if (prefix) {
    const kKey = `${prefix}Kind`;
    const skKey = `${prefix}SKind`;
    const sk2Key = `${prefix}SKind2`;

    return {
      kind: normalize(fi?.[kKey] ?? tags?.[kKey] ?? fi.Kind ?? tags.Kind),
      skind: normalize(fi?.[skKey] ?? tags?.[skKey] ?? fi.SKind ?? tags.SKind),
      skind2: normalize(fi?.[sk2Key] ?? tags?.[sk2Key] ?? fi.SKind2 ?? tags.SKind2),
    };
  }

  // fallback（极端情况）
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
