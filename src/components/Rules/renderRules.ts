import type * as L from 'leaflet';
import type { FeatureStore } from './featureStore';
import type { LabelDeclutterConfig } from './labelLayout';


import type { LabelStyleKey } from './labelStyles';
import type { LabelClickPlan } from './labelClickInteraction';
import { FEATURE_RENDER_RULES } from './featureRenderRules';

// Re-export shared helpers for backward compatibility.
export {
  DEFAULT_FLOOR_VIEW,
  fmtFloorLabel,
  getRleExclusiveChoice,
  getStaPlfPointIndex,
  getStationPointColorFromPlatforms,
} from './ruleHelpers';
// ------------------------------
// 基础类型
// ------------------------------

export type GeoType = 'Points' | 'Polyline' | 'Polygon';

export type ZoomLevel = number;

export type FloorViewConfig = {
  minLevel: ZoomLevel;
  buildingClass: string;
  floorClass: string;
  buildingFloorRefField: string;
  /** STF 上的唯一引用字段，用于与 STB.Floors[] 的引用值匹配（通常是 staBFloorID） */
  floorRefTargetField: string;
  /** UI / 规则选择用的楼层字段（你需要 NofFloor 就填 NofFloor） */
  floorSelectorField: string;
};

export type RenderContext = {
  worldId: string;
  leafletZoom: number;
  zoomLevel: ZoomLevel;
  inFloorView: boolean;

  /** 当前激活建筑 uid（楼层视角使用） */
  activeBuildingUid: string | null;

  /** 当前选中楼层（使用 floorSelectorField，例如 NofFloor 值） */
  activeFloorSelector: string | null;

  /** 当前激活建筑的楼层引用集合（以 floorRefTargetField 的值匹配） */
  activeBuildingFloorRefSet: Set<string> | null;
};

export type LabelPlan = {
  enabled: boolean;
  textFrom?: string | ((r: FeatureRecord, ctx: RenderContext, store: FeatureStore) => string);
  placement: 'center' | 'near';
  minLevel?: ZoomLevel;

  /** 可选：label 垂直上移（px），用于点位 label 更靠上 */
  offsetY?: number;

  /** 如果你已实现“中心点+label”，这里可保留 */
  withDot?: boolean;

  /** 【新增】label 样式 key（例如 gm-outline） */
  styleKey?: LabelStyleKey;

  /**
   * 【新增】label 布局策略（避让/去重）。
   * - 若不提供：沿用旧逻辑（每个要素各自生成 label，不做避让）。
   * - 若提供：由 LabelLayout 引擎统一选择位置/隐藏。
   */
  declutter?: LabelDeclutterConfig;
};


/**
3 个可用 pane（按从下到上）：

ria-overlay：线/面默认

ria-point：点默认（永远压在 overlay 上）

ria-point-top：更顶的点（你想“强制置顶”的就用它）
 */

export type PointSymbolPlan =
  | {
      kind: 'circle';
      radius?: number;
      style?: L.CircleMarkerOptions;

      /** 可选：指定点所在 pane（用于“点永远在最上层”） */
      pane?: string;
    }
  | {
      kind: 'icon';
      iconUrl?: string;
      iconUrlFrom?: string;
      iconSize?: [number, number];
      iconAnchor?: [number, number];

      /** 可选：指定点所在 pane */
      pane?: string;

      /** 可选：Marker 内部排序（只影响 marker 之间，不影响线/面） */
      zIndexOffset?: number;
    };

export type SymbolPlan = {
  /** 可选：主几何（点/线/面）所在 pane */
  pane?: string;

  /** Path（线/面）样式 */
  pathStyle?: L.PathOptions | ((r: FeatureRecord, ctx: RenderContext, store: FeatureStore) => L.PathOptions);

  /** 点样式 */
  point?: PointSymbolPlan | ((r: FeatureRecord, ctx: RenderContext, store: FeatureStore) => PointSymbolPlan);

  /**
   * label
   * - 允许使用函数以便按要素/缩放级别动态返回 styleKey / minLevel / enabled 等。
   * - 这是“字段解析接口”的扩展点：后续新增细分类型时，尽量只在规则层增加分支，不改渲染层。
   */
  label?: LabelPlan | ((r: FeatureRecord, ctx: RenderContext, store: FeatureStore) => LabelPlan | null);

  /** 【新增】label 点击交互计划（可用于 labelOnly 模式） */
  labelClick?:
    | LabelClickPlan
    | ((r: FeatureRecord, ctx: RenderContext, store: FeatureStore) => LabelClickPlan | null);
};


export type RuleMatch = {
  Class?: string;
  Type?: GeoType;
};

export type RenderRule = {
  /** 规则名（仅用于你维护阅读） */
  name: string;
  match: RuleMatch;
  /** zoomLevel 范围（包含） */
  zoom?: [ZoomLevel, ZoomLevel];

  /**
   * 可读性优先：声明式存在性条件
   * - 若同 idValue 的目标类存在，则隐藏当前要素（用于“若存在则不渲染”）
   */
  hideIfSameIdExistsInClasses?: string[];

  /** 自定义可见性（满足你复杂逻辑时使用） */
  visible?: (r: FeatureRecord, ctx: RenderContext, store: FeatureStore) => boolean;

  /** 输出符号方案 */
  symbol: SymbolPlan;
};

// ------------------------------
// signature/meta
// ------------------------------

export type SignatureEntry = {
  uid: string;
  signatureKey: string;
  sig: Record<string, any>;
  groups: Record<string, any>;
  source?: string;
};

export type FeatureMeta = {
  Class: string;
  Type: GeoType;
  World?: number | string;

  /** 用于“Class+xxxID 重复排查”的 id 字段 */
  idField: string;
  idValue: string;

  /** signature：除坐标以外的属性（可读性优先） */
  sig: Record<string, any>;
  signatureKey: string;

  /** groupinformation：把数组/对象类字段放这里（例如 Lines/Stations/Floors） */
  groups: Record<string, any>;

  /** 调试：来自哪个文件 */
  source?: string;
};

export type FeatureRecord = {
  /** 稳定唯一 uid：用于渲染缓存 key（避免因为 Class+ID 重复导致覆盖） */
  uid: string;

  meta: FeatureMeta;
  featureInfo: any;

  /** 几何类型 */
  type: GeoType;

  /** world 坐标（用于点） */
  p3?: { x: number; y: number; z: number };

  /** world 坐标数组（用于线/面） */
  coords3?: Array<{ x: number; y: number; z: number }>;
};

function isPlainObject(x: any): x is Record<string, any> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function stableStringify(obj: any): string {
  const seen = new WeakSet();
  const rec = (o: any): any => {
    if (o === null || o === undefined) return o;
    if (typeof o !== 'object') return o;
    if (seen.has(o)) return '[Circular]';
    seen.add(o);
    if (Array.isArray(o)) return o.map(rec);
    const keys = Object.keys(o).sort();
    const out: Record<string, any> = {};
    for (const k of keys) out[k] = rec(o[k]);
    return out;
  };
  return JSON.stringify(rec(obj));
}


/**
 * 规则显式路径读取（方案2B）：支持形如 'tags.xxx' 的访问。
 * - 仅用于读取，不做写入。
 * - path 为空/读取失败时返回 undefined。
 */
export function getValueByPath(obj: any, path: string): any {
  if (!path) return undefined;
  const parts = String(path).split('.').filter(Boolean);
  let cur: any = obj;
  for (const k of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as any)[k];
  }
  return cur;
}

export function pickIdFieldValue(featureInfo: any, cls: string): { idField: string; idValue: string } {
  const tryField = (field: string): string | null => {
    const v = (featureInfo as any)?.[field];

    // 重要：ID 字段不应从 Group/对象/数组中“误命中”。
    // 例如 Group 中可能包含 xxxID 子字段，但外部主键只可能是顶层 primitive。
    if (v === null || v === undefined) return null;
    const t = typeof v;
    if (t !== 'string' && t !== 'number' && t !== 'bigint') return null;
    const s = String(v).trim();
    return s ? s : null;
  };

  // 兜底：扫描任意“以 ID/Id/id 结尾”的字段，兼容 TRPointID / TPPointID / WRPointID / PGonID 等。
  // - 排除 WorldID/worldId 等明显不是主键的字段
  // - 不依赖 cls（因为部分源 JSON 不含 Class）
  const scanIdLikeFields = (): { idField: string; idValue: string } | null => {
    if (!featureInfo || typeof featureInfo !== 'object') return null;
    const keys = Object.keys(featureInfo);
    const idKeys = keys.filter((k) => {
      if (!k) return false;
      const low = k.toLowerCase();
      if (low === 'worldid' || low === 'world_id' || low === 'world') return false;
      if (!/id$/i.test(k)) return false;

      // 排除 group/数组/对象：它们不可能是主 ID。
      const v = (featureInfo as any)?.[k];
      if (v === null || v === undefined) return false;
      const t = typeof v;
      if (t !== 'string' && t !== 'number' && t !== 'bigint') return false;
      return true;
    });
    if (idKeys.length === 0) return null;

    // 优先级：ID -> (包含 cls) -> 常见命名 PointID/PGonID/PLineID/LineID/StationID/BuildingID/FloorID/PlatformID -> 其余按字典序
    const clsNorm = String(cls ?? '').trim();
    const scored = idKeys
      .map((k) => {
        let score = 0;
        const low = k.toLowerCase();
        if (low === 'id') score += 100;
        if (clsNorm) {
          const clsLow = clsNorm.toLowerCase();
          if (low === `${clsLow}id`) score += 90;
          if (low.includes(clsLow) && low.endsWith('id')) score += 60;
        }
        if (/(pointid|pgonid|plineid|lineid|stationid|buildingid|floorid|platformid)$/i.test(k)) score += 50;
        return { k, score };
      })
      .sort((a, b) => (b.score - a.score) || a.k.localeCompare(b.k));

    for (const it of scored) {
      const v = tryField(it.k);
      if (v) return { idField: it.k, idValue: v };
    }
    return null;
  };

  const candidates: string[] = [];

  // 常见约定优先
  if (cls === 'STB') candidates.push('staBuildingID');
  if (cls === 'SBP') candidates.push('staBuildingPointID', 'staBuildingPointId', 'stationID', 'stationId', 'staBuildingID');
  if (cls === 'STF') candidates.push('staBFloorID');
  if (cls === 'BUD') candidates.push('BuildingID');
  if (cls === 'FLR') candidates.push('FloorID');
  if (cls === 'ISP') candidates.push('PointID');
  if (cls === 'ISL') candidates.push('PLineID');
  if (cls === 'ISG') candidates.push('PGonID');
  if (cls === 'PLF') candidates.push('platformID');
  if (cls === 'PFB') candidates.push('plfRoundID', 'platformID');
  if (cls === 'STA') candidates.push('stationID');
  if (cls === 'RLE') candidates.push('LineID', 'lineID');
  if (cls === 'TRP') candidates.push('TRPointID');
  if (cls === 'TPP') candidates.push('TPPointID');
  if (cls === 'WRP') candidates.push('WRPointID');

  // 再兜底（仅 ID 类字段；不要用 name 充当 ID）
  candidates.push('ID', `${cls}ID`, `${cls.toLowerCase()}ID`);

  for (const f of candidates) {
    const v = tryField(f);
    if (v) return { idField: f, idValue: v };
  }

  const scanned = scanIdLikeFields();
  if (scanned) return scanned;
  return { idField: 'UNKNOWN', idValue: '' };
}

export function buildFeatureMeta(featureInfo: any, cls: string, type: GeoType, source?: string): FeatureMeta {
  const { idField, idValue } = pickIdFieldValue(featureInfo, cls);

  const sig: Record<string, any> = {};
  const groups: Record<string, any> = {};

  // 你所说的“除了坐标以外的所有属性信息” → sig；数组/对象 → groups
  for (const [k, v] of Object.entries(featureInfo ?? {})) {
    // 坐标字段排除
    if (k === 'Conpoints' || k === 'Flrpoints' || k === 'PLpoints' || k === 'Linepoints' || k === 'coordinate') continue;

    // tags：需要参与 signature（用于去重/差分），同时支持规则显式路径 tags.xxx
    if (k === 'tags') {
      sig[k] = v;
      continue;
    }

    // extensions：仅记录信息，不参与 signature（避免 signature 过大/不稳定）
    if (k === 'extensions') {
      groups[k] = v;
      continue;
    }

    if (Array.isArray(v) || isPlainObject(v)) {
      groups[k] = v;
    } else {
      sig[k] = v;
    }
  }

  // 保证关键字段存在于 sig（便于你调试）
  sig.Class = cls;
  sig.Type = type;
  if ((featureInfo as any)?.World !== undefined) sig.World = (featureInfo as any)?.World;

  const signatureKey = stableStringify(sig);

  return {
    Class: cls,
    Type: type,
    World: (featureInfo as any)?.World,
    idField,
    idValue,
    sig,
    signatureKey,
    groups,
    source,
  };
}

// ------------------------------
// zoom 映射（与你现有“leafletZoom(-3..5) ↔ level(0..8)”接口兼容）
// ------------------------------

/**
 * 将 Leaflet zoom（允许负数）映射到整数 ZoomLevel。
 *
 * 说明：
 * - 这里按你的“9 级整数缩放：level(0..8) ↔ leafletZoom(-3..5)”约定。
 * - 若你后续改映射，只需要改这里一处。
 */
export function toZoomLevel(leafletZoom: number): ZoomLevel {
  // level = leafletZoom + 3, clamp to 0..8
  const lvl = Math.round(leafletZoom + 3);
  return Math.max(0, Math.min(8, lvl));
}
export const RENDER_RULES: RenderRule[] = FEATURE_RENDER_RULES;


export function findFirstRule(r: FeatureRecord): RenderRule | null {
  for (const rule of RENDER_RULES) {
    const mc = rule.match.Class;
    const mt = rule.match.Type;
    if (mc && mc !== r.meta.Class) continue;
    if (mt && mt !== r.type) continue;
    return rule;
  }
  return null;
}
