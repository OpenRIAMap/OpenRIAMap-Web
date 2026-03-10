import { useEffect, useMemo, useRef, useState } from 'react';



import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import type { DynmapProjection } from '@/lib/DynmapProjection';

import { RULE_DATA_SOURCES } from '@/components/Rules/data/ruleDataSources';
import { FeatureStore } from '@/components/Rules/data/featureStore';
import { DEFAULT_FLOOR_VIEW, buildFeatureMeta, findFirstRule, toZoomLevel, type FeatureRecord, type GeoType, type RenderContext } from '@/components/Rules/rendering/renderRules';
import { layoutLabelsOnMap, type LabelRequest, type AvoidRectPx } from '@/components/Rules/rendering/labelLayout';
import AppButton from '@/components/ui/AppButton';
import AppCard from '@/components/ui/AppCard';

import { resolveFeatureCardComponent } from '@/components/Rules/cardrules/featureCardRegistry';
import { makeLabelDivIcon } from '@/components/Rules/rendering/labelStyles';
import { createHighlightLayerForFeature, makeClickableLabelMarker, type LabelClickPlan } from '@/components/Rules/rendering/labelClickInteraction';

import { filterRecordsByRuleButtons } from '@/components/Rules/ButtonRule/buttonRuleFilter';
import { setRuleSearchPool } from '@/components/Rules/search/ruleSearchRegistry';


const FLOOR_VIEW_MIN_LEVEL = Math.max(0, DEFAULT_FLOOR_VIEW.minLevel);



type Props = {
  mapReady: boolean;
  map: L.Map;
  projection: DynmapProjection;
  worldId: string;
  visible: boolean;
  /**
   * 规则图层“分组开关”激活列表：
   * - 由外部 UI（Rules/ButtonRule）控制
   * - 用于从预加载池中挑选需要进入渲染/索引的要素子集
   */
  activeButtonIds?: string[];
};

const Y_FOR_DISPLAY = 64;

type LayerBundle = {
  main: L.Layer;
  label?: L.Layer;

  /** 新增：用于 declutter label 复用，避免 refresh 每次重建 marker */
  labelKey?: string;

  kind: 'marker' | 'circleMarker' | 'path';
  iconUrl?: string;
  pane?: string;
};


function toP3(v: any): { x: number; y: number; z: number } | null {
  if (!v) return null;
  if (Array.isArray(v)) {
    const x = Number(v[0]);
    const y = Number(v[1]);
    const z = Number(v[2]);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) return { x, y, z };
    if (Number.isFinite(x) && Number.isFinite(z)) return { x, y: Y_FOR_DISPLAY, z };
    return null;
  }
  if (typeof v === 'object') {
    const x = Number((v as any).x);
    const y = Number((v as any).y ?? Y_FOR_DISPLAY);
    const z = Number((v as any).z);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) return { x, y, z };
  }
  return null;
}

function toP3Array(v: any): Array<{ x: number; y: number; z: number }> {
  if (!Array.isArray(v)) return [];
  const out: Array<{ x: number; y: number; z: number }> = [];
  for (const item of v) {
    const p = toP3(item);
    if (p) out.push(p);
  }
  return out;
}

function pointInPolygonXZ(p: { x: number; z: number }, poly: Array<{ x: number; z: number }>) {
  // ray-casting
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const zi = poly[i].z;
    const xj = poly[j].x;
    const zj = poly[j].z;

    const intersect = (zi > p.z) !== (zj > p.z) && p.x < ((xj - xi) * (p.z - zi)) / (zj - zi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}


// ===============================
// Label Anchor: Visible-Center (B1)
// 字段解析接口：此处为“标签锚点推导”接口，专门处理 Polyline / Polygon 在“视野未包含全局中心”时的可见性问题。
// 核心思路：优先使用【当前视野与要素 bbox 的交集区域中心】作为锚点候选；若候选点不在多边形内（或不在折线附近），则投影到边界/线段的最近点。
// ===============================

type WorldRectXZ = { minX: number; maxX: number; minZ: number; maxZ: number };

function rectCenterXZ(r: WorldRectXZ): { x: number; z: number } {
  return { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
}

function intersectWorldRectXZ(a: WorldRectXZ, b: WorldRectXZ): WorldRectXZ | null {
  const minX = Math.max(a.minX, b.minX);
  const maxX = Math.min(a.maxX, b.maxX);
  const minZ = Math.max(a.minZ, b.minZ);
  const maxZ = Math.min(a.maxZ, b.maxZ);
  if (minX > maxX || minZ > maxZ) return null;
  return { minX, maxX, minZ, maxZ };
}

function bboxFromCoordsXZ(coords3: Array<{ x: number; z: number }>): WorldRectXZ {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of coords3) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return { minX, maxX, minZ, maxZ };
}

function viewportWorldRectXZFromBounds(bounds: L.LatLngBounds, projection: DynmapProjection): WorldRectXZ | null {
  try {
    const nw = bounds.getNorthWest();
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const se = bounds.getSouthEast();

    const pts = [nw, ne, sw, se].map(ll => projection.latLngToLocation(ll, Y_FOR_DISPLAY));
    const xs = pts.map(p => p.x);
    const zs = pts.map(p => p.z);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);

    if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return null;
    return { minX, maxX, minZ, maxZ };
  } catch {
    return null;
  }
}

function closestPointOnSegmentXZ(
  a: { x: number; z: number },
  b: { x: number; z: number },
  p: { x: number; z: number },
): { x: number; z: number } {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const apx = p.x - a.x;
  const apz = p.z - a.z;
  const denom = abx * abx + abz * abz;
  if (denom <= 1e-9) return { x: a.x, z: a.z };
  let t = (apx * abx + apz * abz) / denom;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + abx * t, z: a.z + abz * t };
}

function closestPointOnPolylineXZ(
  coords3: Array<{ x: number; z: number }>,
  p: { x: number; z: number },
): { x: number; z: number } | null {
  if (coords3.length < 2) return null;
  let best: { x: number; z: number } | null = null;
  let bestD2 = Infinity;
  for (let i = 1; i < coords3.length; i++) {
    const a = coords3[i - 1];
    const b = coords3[i];
    const q = closestPointOnSegmentXZ(a, b, p);
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = q;
    }
  }
  return best;
}

function closestPointOnPolygonEdgesXZ(
  poly: Array<{ x: number; z: number }>,
  p: { x: number; z: number },
): { x: number; z: number } | null {
  if (poly.length < 2) return null;
  let best: { x: number; z: number } | null = null;
  let bestD2 = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const q = closestPointOnSegmentXZ(a, b, p);
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = q;
    }
  }
  return best;
}

function computeVisibleAnchorXZForPolyline(
  coords3: Array<{ x: number; z: number }>,
  viewportRect: WorldRectXZ | null | undefined,
): { x: number; z: number } | null {
  if (!coords3 || coords3.length < 2) return null;
  const bbox = bboxFromCoordsXZ(coords3);
  const inter = viewportRect ? intersectWorldRectXZ(bbox, viewportRect) : null;
  const target = inter ? rectCenterXZ(inter) : rectCenterXZ(bbox);
  return closestPointOnPolylineXZ(coords3, target) ?? null;
}

function computeVisibleAnchorXZForPolygon(
  poly: Array<{ x: number; z: number }>,
  viewportRect: WorldRectXZ | null | undefined,
): { x: number; z: number } | null {
  if (!poly || poly.length < 3) return null;
  const bbox = bboxFromCoordsXZ(poly);
  const inter = viewportRect ? intersectWorldRectXZ(bbox, viewportRect) : null;
  const target = inter ? rectCenterXZ(inter) : rectCenterXZ(bbox);

  if (pointInPolygonXZ(target, poly)) return target;
  return closestPointOnPolygonEdgesXZ(poly, target) ?? null;
}


function polygonCentroidXZ(poly: Array<{ x: number; z: number }>): { x: number; z: number } | null {
  if (poly.length < 3) return null;
  let area = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const x0 = poly[j].x;
    const z0 = poly[j].z;
    const x1 = poly[i].x;
    const z1 = poly[i].z;
    const a = x0 * z1 - x1 * z0;
    area += a;
    cx += (x0 + x1) * a;
    cz += (z0 + z1) * a;
  }
  if (Math.abs(area) < 1e-9) return null;
  area *= 0.5;
  cx /= 6 * area;
  cz /= 6 * area;
  if (!Number.isFinite(cx) || !Number.isFinite(cz)) return null;
  return { x: cx, z: cz };
}




// ======================= 楼层激活/保持：中心范围阈值（可调） =======================
const FLOOR_PICK_ACTIVATE_PX = 70; // “接近中心即可激活”的半径（像素）
const FLOOR_PICK_KEEP_PX = 120;    // “保持楼层菜单”的半径（像素，建议 > ACTIVATE）
const FLOOR_PICK_VIEW_PAD = 0.25;  // 预筛选：视野 bounds 的 padding，减少遍历成本


// ======================= 楼层关联：向上索引 + 向下补全（可拆卸） =======================
const FLOOR_BUILDING_CLASSES = ['STB', 'SBP', 'BUD'] as const;
const FLOOR_FLOOR_CLASSES = ['STF', 'FLR'] as const;

type FloorBuildingClass = (typeof FLOOR_BUILDING_CLASSES)[number];
type FloorClass = (typeof FLOOR_FLOOR_CLASSES)[number];

function getBuildingIdCandidatesForFloorView(b: FeatureRecord): Set<string> {
  const fi: any = b.featureInfo;
  const cls = String(b.meta?.Class ?? '').trim() as FloorBuildingClass;
  const vals: string[] = [];

  if (cls === 'STB') {
    vals.push(fi?.ID, fi?.ID);
  } else if (cls === 'SBP') {
    vals.push(fi?.ID, fi?.staBuildingPointId, fi?.ID, fi?.ID);
  } else if (cls === 'BUD') {
    vals.push(fi?.BuildingID, fi?.ID);
  } else {
    vals.push(fi?.ID);
  }

  const out = new Set<string>();
  for (const v of vals) {
    const s = String(v ?? '').trim();
    if (s) out.add(s);
  }
  return out;
}

function getFloorIdForFloorView(f: FeatureRecord): string {
  const fi: any = f.featureInfo;
  const cls = String(f.meta?.Class ?? '').trim() as FloorClass;
  if (cls === 'STF') return String(fi?.ID ?? fi?.ID ?? '').trim();
  if (cls === 'FLR') return String(fi?.ID ?? fi?.ID ?? '').trim();
  return String(fi?.ID ?? '').trim();
}

function getFloorParentIdForFloorView(f: FeatureRecord): string {
  const fi: any = f.featureInfo;
  const cls = String(f.meta?.Class ?? '').trim() as FloorClass;
  if (cls === 'STF') return String(fi?.ID ?? '').trim();
  if (cls === 'FLR') return String(fi?.BuildingID ?? '').trim();
  return '';
}

function extractDownwardFloorRefsFromBuilding(b: FeatureRecord): string[] {
  const fi: any = b.featureInfo;
  const arr = Array.isArray(fi?.Floors) ? fi.Floors : [];
  const out: string[] = [];
  for (const it of arr) {
    const ref = String((it as any)?.[DEFAULT_FLOOR_VIEW.buildingFloorRefField] ?? '').trim();
    if (ref) out.push(ref);
  }
  return out;
}

function supplementFloorIdsByDownwardRefs(
  b: FeatureRecord,
  floorsById: Map<string, FeatureRecord>,
  floorIdSet: Set<string>
) {
  // 模块化：后续若要性能优化，可直接跳过该补全步骤
  const refs = extractDownwardFloorRefsFromBuilding(b);
  for (const ref of refs) {
    if (floorIdSet.has(ref)) continue;
    if (floorsById.has(ref)) floorIdSet.add(ref);
  }
}

function distanceFromViewportCenterToBoundsPx(map: L.Map, bounds: L.LatLngBounds): number {
  const size = map.getSize();
  const c = L.point(size.x / 2, size.y / 2);

  const nw = map.latLngToContainerPoint(bounds.getNorthWest());
  const se = map.latLngToContainerPoint(bounds.getSouthEast());

  const minX = Math.min(nw.x, se.x);
  const maxX = Math.max(nw.x, se.x);
  const minY = Math.min(nw.y, se.y);
  const maxY = Math.max(nw.y, se.y);

  const dx = c.x < minX ? (minX - c.x) : c.x > maxX ? (c.x - maxX) : 0;
  const dy = c.y < minY ? (minY - c.y) : c.y > maxY ? (c.y - maxY) : 0;

  return Math.hypot(dx, dy);
}

function getFeatureBoundsLatLng(
  projection: any,
  coords3: Array<{ x: number; z: number }>,
  y: number
): L.LatLngBounds | null {
  if (!coords3?.length) return null;

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const pt of coords3) {
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minZ = Math.min(minZ, pt.z);
    maxZ = Math.max(maxZ, pt.z);
  }

  const ll1 = projection.locationToLatLng(minX, y, minZ);
  const ll2 = projection.locationToLatLng(minX, y, maxZ);
  const ll3 = projection.locationToLatLng(maxX, y, minZ);
  const ll4 = projection.locationToLatLng(maxX, y, maxZ);

  const minLat = Math.min(ll1.lat, ll2.lat, ll3.lat, ll4.lat);
  const maxLat = Math.max(ll1.lat, ll2.lat, ll3.lat, ll4.lat);
  const minLng = Math.min(ll1.lng, ll2.lng, ll3.lng, ll4.lng);
  const maxLng = Math.max(ll1.lng, ll2.lng, ll3.lng, ll4.lng);

  return L.latLngBounds(L.latLng(minLat, minLng), L.latLng(maxLat, maxLng));
}



function makeLabelMarker(
  latlng: L.LatLng,
  text: string,
  placement: 'center' | 'near',
  withDot?: boolean,
  offsetY?: number,
  styleKey?: any, // string key; 类型由 labelStyles 维护
) {
  const icon = makeLabelDivIcon((styleKey ?? 'bubble-dark') as any, String(text ?? ''), {
    placement,
    withDot: !!withDot,
    offsetY,
    interactive: false,
  });

  return L.marker(latlng, {
    interactive: false,
    pane: 'ria-label',
    icon,
  });
}



async function fetchJsonArray(url: string): Promise<any[]> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
  const data = await resp.json();
  if (!Array.isArray(data)) return [];
  return data;
}

function detectGeoType(featureInfo: any): GeoType | null {
  const t = String((featureInfo as any)?.Type ?? '').trim();
  if (t === 'Points' || t === 'Polyline' || t === 'Polygon') return t as GeoType;
  // 兜底：按字段猜
  if ((featureInfo as any)?.coordinate) return 'Points';
  if (Array.isArray((featureInfo as any)?.PLpoints) || Array.isArray((featureInfo as any)?.Linepoints)) return 'Polyline';
  if (Array.isArray((featureInfo as any)?.Conpoints) || Array.isArray((featureInfo as any)?.Flrpoints)) return 'Polygon';
  return null;
}

function buildRecordsFromJson(
  items: any[],
  sourceFile: string,
  opts?: { excludeIds?: Set<string> },
): FeatureRecord[] {
  const out: FeatureRecord[] = [];
  let uidSeq = 1;

  for (const item of items) {
    const cls = String((item as any)?.Class ?? '').trim();
    if (!cls) continue;
    const type = detectGeoType(item);
    if (!type) continue;

    const uid = `${sourceFile}#${uidSeq++}`;
    const meta = buildFeatureMeta(item, cls, type, sourceFile);

    // 若指定了 “excludeIds”，则屏蔽固定数据源中被覆盖的同 ID 要素
    if (opts?.excludeIds && opts.excludeIds.has(String(meta.idValue ?? '').trim())) {
      continue;
    }

    const r: FeatureRecord = {
      uid,
      meta,
      featureInfo: item,
      type,
    };

    if (type === 'Points') {
      const p = toP3((item as any).coordinate ?? (item as any).Conpoints?.[0] ?? null);
      if (!p) continue;
      r.p3 = p;
    } else if (type === 'Polyline') {
      const arr = toP3Array((item as any).PLpoints ?? (item as any).Linepoints);
      if (arr.length < 2) continue;
      r.coords3 = arr;
    } else if (type === 'Polygon') {
      const pts = (item as any).Conpoints ?? (item as any).Flrpoints ?? null;
      const arr = toP3Array(pts);
      if (arr.length < 3) continue;
      r.coords3 = arr;
    }

    out.push(r);
  }
  return out;
}

export default function RuleDrivenLayer(props: Props) {
  const { mapReady, map, projection, worldId, visible, activeButtonIds = [] } = props;

  const rootRef = useRef<L.LayerGroup | null>(null);
  const highlightGroupRef = useRef<L.LayerGroup | null>(null);

  const [selectedFeature, setSelectedFeature] = useState<FeatureRecord | null>(null);
  const [featureCardOpen, setFeatureCardOpen] = useState(false);

  const cacheRef = useRef<Map<string, LayerBundle>>(new Map());
  const allRecordsRef = useRef<FeatureRecord[]>([]);
  const recordsRef = useRef<FeatureRecord[]>([]);
  const storeRef = useRef<FeatureStore | null>(null);

  // floor UI
  const [floorOptions, setFloorOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [activeFloorIndex, setActiveFloorIndex] = useState<number>(0);
  const [activeBuildingUid, setActiveBuildingUid] = useState<string | null>(null);
  const [activeBuildingFloorRefSet, setActiveBuildingFloorRefSet] = useState<Set<string> | null>(null);
  const [activeBuildingName, setActiveBuildingName] = useState<string>('');

  // 让 React 能感知 Leaflet 的 zoom/move（否则 ctx/showFloorUI 可能停留在旧值）
const [leafletZoomState, setLeafletZoomState] = useState<number>(() => map.getZoom());

// rawDataVersion：仅代表“预加载池(allRecordsRef)更新完成”，不直接驱动渲染。
const [rawDataVersion, setRawDataVersion] = useState(0);
// dataVersion：代表“进入渲染/索引的数据集(recordsRef/storeRef)更新完成”，驱动后续渲染/楼层逻辑。
const [dataVersion, setDataVersion] = useState(0);

// ======== 临时挂载数据源（来自 MeasuringModule，本地存储） ========
const [tempSourceVersion, setTempSourceVersion] = useState(0);

const TEMP_RULE_SOURCES_KEY = 'ria_temp_rule_sources_v1';
const TEMP_RULE_OVERRIDE_IDS_KEY = 'ria_temp_rule_override_ids_v1';

type TempRuleSource = {
  uid: string;
  worldId: string;
  label?: string;
  enabled: boolean;
  items: any[];
};

function readTempSources(worldId: string): TempRuleSource[] {
  try {
    const raw = localStorage.getItem(TEMP_RULE_SOURCES_KEY);
    if (!raw) return [];
    const obj = JSON.parse(raw);
    const list = (obj?.[worldId] ?? []) as any[];
    if (!Array.isArray(list)) return [];
    return list
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({
        uid: String((x as any).uid ?? ''),
        worldId: String((x as any).worldId ?? worldId),
        label: (x as any).label ? String((x as any).label) : undefined,
        enabled: Boolean((x as any).enabled),
        items: Array.isArray((x as any).items) ? (x as any).items : [],
      }))
      .filter((x) => x.uid && x.worldId === worldId);
  } catch {
    return [];
  }
}

function readTempOverrideIds(worldId: string): Set<string> {
  try {
    const raw = localStorage.getItem(TEMP_RULE_OVERRIDE_IDS_KEY);
    if (!raw) return new Set();
    const obj = JSON.parse(raw);
    const list = (obj?.[worldId] ?? []) as any[];
    if (!Array.isArray(list)) return new Set();
    return new Set(list.map((x) => String(x ?? '').trim()).filter((s) => s));
  } catch {
    return new Set();
  }
}


useEffect(() => {
  if (!mapReady) return;

  const sync = () => setLeafletZoomState(map.getZoom());
  sync();

  map.on('zoomend', sync);
  map.on('moveend', sync);
  return () => {
    map.off('zoomend', sync);
    map.off('moveend', sync);
  };
}, [mapReady, map]);

// 监听 MeasuringModule 写入的“临时挂载源/覆盖屏蔽列表”变化
useEffect(() => {
  if (!mapReady) return;
  const handler = (e: any) => {
    try {
      const wid = e?.detail?.worldId;
      if (!wid || String(wid) === String(worldId)) {
        setTempSourceVersion((v) => v + 1);
      }
    } catch {
      setTempSourceVersion((v) => v + 1);
    }
  };
  window.addEventListener('ria-temp-rule-sources-changed', handler);
  window.addEventListener('ria-temp-rule-overrides-changed', handler as any);
  return () => {
    window.removeEventListener('ria-temp-rule-sources-changed', handler);
    window.removeEventListener('ria-temp-rule-overrides-changed', handler as any);
  };
}, [mapReady, worldId]);


// (1) 加载数据（worldId + dataSources）
useEffect(() => {
  let cancelled = false;

  async function load() {
    if (!mapReady) return;
    const ds = RULE_DATA_SOURCES[worldId];
    const all: FeatureRecord[] = [];

    // 覆盖屏蔽列表：仅当“临时挂载源”处于启用状态时才生效。
    // 说明：之前的实现会在 localStorage 残留 overrideIds 时永久屏蔽固定数据源，导致用户以为要素“消失”。
    // 这里做最小修复：没有任何 enabled 的临时挂载源时，不应用 override 屏蔽。
    const enabledTemps = readTempSources(worldId).filter((t) => t.enabled);
    const overrideIds = enabledTemps.length > 0 ? readTempOverrideIds(worldId) : new Set<string>();

    // (A) 固定数据源（public 下文件）
    // 注意：即使该 world 没有配置 files，也不应直接 return。
    // “临时挂载”应当仍然可以在该 world 中生效（用于测试显示/去重/关联）。
    if (ds && Array.isArray(ds.files) && ds.files.length > 0) {
      for (const file of ds.files) {
        const url = `${ds.baseUrl.replace(/\/$/, '')}/${file}`;
        try {
          const items = await fetchJsonArray(url);
          all.push(...buildRecordsFromJson(items, file, { excludeIds: overrideIds }));
        } catch (e) {
          // 单文件失败不阻塞其余文件
          console.warn(`[RuleDrivenLayer] failed to load ${url}`, e);
        }
      }
    }

    // (B) 临时挂载数据源（来自 MeasuringModule，本地存储）
    try {
      const temps = enabledTemps;
      for (const t of temps) {
        try {
          const label = t.label ?? t.uid;
          all.push(...buildRecordsFromJson(t.items, label));
        } catch (e) {
          console.warn('[RuleDrivenLayer] failed to load temp source', t.uid, e);
        }
      }
    } catch (e) {
      console.warn('[RuleDrivenLayer] readTempSources failed', e);
    }

    if (cancelled) return;

    // 预加载池：固定源 + 临时源（用于后续按“分组开关”筛选）
    allRecordsRef.current = all;

    // ✅ 供 SearchBar 使用的“规则搜索池”：包含当前世界 Rules 源预加载 + 临时挂载启用的数据。
    // - 仅写入模块变量，不触发 React 状态更新，避免造成循环渲染/白屏。
    setRuleSearchPool(worldId, all);

    // ✅ 关键：通知“预加载池已更新”（实际进入渲染/索引的数据会在后续 effect 中由开关筛选决定）
    setRawDataVersion((v) => v + 1);
  }

  load();
  return () => {
    cancelled = true;
  };
}, [mapReady, worldId, tempSourceVersion]);


// =========================
// SearchBar -> RuleDrivenLayer：按 uid 打开信息卡
// - SearchBar/MapContainer 负责：聚焦/缩放/（必要时）打开对应分组开关
// - RuleDrivenLayer 负责：在渲染池内找到目标 record 并打开/高亮
// =========================
const pendingOpenUidRef = useRef<string | null>(null);
const ctxRef = useRef<RenderContext | null>(null);

const tryOpenByUid = (uid: string) => {
  const key = String(uid ?? '').trim();
  if (!key) return false;
  const store = storeRef.current;
  if (!store) return false;
  const rr = store.all.find((r) => r.uid === key);
  if (!rr) return false;

  // 尽量复用“label click”规则（如果有），保证交互一致；否则仅打开信息卡。
  const curCtx = ctxRef.current;
  const rule = findFirstRule(rr);
  const rawClick = (rule as any)?.symbol?.labelClick;
  if (rawClick) {
    // 若尚未拿到 RenderContext（例如按钮刚被打开、effect 还未同步），则跳过 labelClick 复用逻辑。
    if (curCtx) {
      const clickPlan: any = typeof rawClick === 'function' ? rawClick(rr, curCtx, store) : rawClick;
      if (clickPlan && clickPlan.enabled) {
        handleLabelClick(rr, clickPlan as any);
        return true;
      }
    }
  }

  // fallback：仅打开信息卡（高亮逻辑保持为空）
  setSelectedFeature(rr);
  setFeatureCardOpen(true);
  return true;
};

useEffect(() => {
  const handler = (ev: Event) => {
    const detail = (ev as CustomEvent<any>)?.detail;
    const uid = String(detail?.uid ?? '').trim();
    if (!uid) return;

    // 先尝试立即打开；若当前未在渲染池（可能因为分组开关尚未打开），记录为 pending。
    if (!tryOpenByUid(uid)) {
      pendingOpenUidRef.current = uid;
    }
  };

  window.addEventListener('ria:ruleFeatureSelect', handler as any);
  return () => window.removeEventListener('ria:ruleFeatureSelect', handler as any);
  // worldId 切换时会卸载/重挂载 listener，避免跨世界误开。
}, [worldId]);

useEffect(() => {
  const handler = () => {
    highlightGroupRef.current?.clearLayers();
    setFeatureCardOpen(false);
    setSelectedFeature(null);
  };

  window.addEventListener('ria:ruleFeatureCardClose', handler as any);
  return () => window.removeEventListener('ria:ruleFeatureCardClose', handler as any);
}, []);

// (2) “分组开关”筛选：将预加载池(allRecordsRef) → 渲染池(recordsRef/storeRef)
// - 支持多个开关并集
// - 交叉命中不会重复加载（最终只是一次 filter 得到的唯一 record 列表）
// - 关闭某一开关时，仅移除其独占贡献，交叉区域若仍被其它开关覆盖则保留
useEffect(() => {
  if (!mapReady) return;

  const all = allRecordsRef.current;
  const filtered = filterRecordsByRuleButtons(all, activeButtonIds);

  recordsRef.current = filtered;
  const store = new FeatureStore(filtered);
  storeRef.current = store;

  // 重复 key 排查：Class|idField=idValue（仅对“进入渲染池”的集合做报告）
  const dups = store.buildDuplicateKeyReport();
  if (dups.length) {
    console.warn('[RuleDrivenLayer] duplicate Class+ID keys detected:', dups.map(d => d.dupKey));
    for (const d of dups) console.warn('[RuleDrivenLayer] dupKey detail:', d);
  }

  // 新的筛选结果 → 清空缓存，让渲染逻辑重新建 layer（避免旧 layer 残留）
  cacheRef.current.clear();
  rootRef.current?.clearLayers();

  // ✅ 保持高亮图层组始终挂载（clearLayers 会移除它）
  if (rootRef.current) {
    if (!highlightGroupRef.current) highlightGroupRef.current = L.layerGroup();
    rootRef.current.addLayer(highlightGroupRef.current);
  }

  // 选中项若被筛掉，主动清空（避免信息卡指向不存在的要素）
  if (selectedFeature && !filtered.some((r) => r.uid === selectedFeature.uid)) {
    highlightGroupRef.current?.clearLayers();
    setFeatureCardOpen(false);
    setSelectedFeature(null);
  }

  // 重置楼层态（筛选变化可能影响可用楼层/建筑）
  setFloorOptions([]);
  setActiveBuildingUid(null);
  setActiveBuildingFloorRefSet(null);
  setActiveBuildingName('');
  setActiveFloorIndex(0);

  // 若 SearchBar 触发“打开某个 uid”的事件，但当时未在渲染池（分组开关尚未开启），
  // 则在筛选结果更新后再尝试一次。
  if (pendingOpenUidRef.current) {
    const uid = pendingOpenUidRef.current;
    if (tryOpenByUid(uid)) pendingOpenUidRef.current = null;
  }

  // ✅ 关键：告诉 React “进入渲染池的数据已更新”
  setDataVersion((v) => v + 1);
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [mapReady, worldId, rawDataVersion, JSON.stringify(activeButtonIds)]);


  // (3) 总开关：挂载/卸载 root layerGroup
  useEffect(() => {
    if (!mapReady) return;
    if (!rootRef.current) {
      rootRef.current = L.layerGroup();
      if (!highlightGroupRef.current) highlightGroupRef.current = L.layerGroup();
      rootRef.current.addLayer(highlightGroupRef.current);
    }

    if (!visible) {
      if (map.hasLayer(rootRef.current)) map.removeLayer(rootRef.current);
      return;
    }
    if (!map.hasLayer(rootRef.current)) rootRef.current.addTo(map);

    return () => {
      if (rootRef.current && map.hasLayer(rootRef.current)) map.removeLayer(rootRef.current);
    };
  }, [mapReady, map, visible]);

  const ctx: RenderContext = useMemo(() => {
  const leafletZoom = leafletZoomState;
  const zoomLevel = toZoomLevel(leafletZoom);
  return {
    worldId,
    leafletZoom,
    zoomLevel,
    //inFloorView: zoomLevel >= DEFAULT_FLOOR_VIEW.minLevel,
    inFloorView: zoomLevel >= FLOOR_VIEW_MIN_LEVEL,
    activeBuildingUid,
    activeFloorSelector: floorOptions[activeFloorIndex]?.value ?? null,
    activeBuildingFloorRefSet,
  };
}, [worldId, leafletZoomState, activeBuildingUid, activeBuildingFloorRefSet, floorOptions, activeFloorIndex]);

	// 供 SearchBar/MapContainer 的“外部打开信息卡”事件复用 labelClick 逻辑使用。
	// 注意：必须放在 ctx 声明之后，避免出现 “ctx used before declaration”。
	useEffect(() => {
	  ctxRef.current = ctx;
	}, [ctx]);

  const handleLabelClick = (r: FeatureRecord, plan: LabelClickPlan) => {
    if (!highlightGroupRef.current) highlightGroupRef.current = L.layerGroup();
    highlightGroupRef.current.clearLayers();

    const hl = createHighlightLayerForFeature({
      r,
      projection,
      highlightStyleKey: (plan as any)?.highlightStyleKey,
      pointPinStyleKey: (plan as any)?.pointPinStyleKey,
    });
    if (hl) highlightGroupRef.current.addLayer(hl);

    if ((plan as any)?.openCard) {
      setSelectedFeature(r);
      setFeatureCardOpen(true);
    }
  };

  /**
   * ✅ 选中/高亮 与 通用信息框绑定：
   * 当用户关闭信息框时，同时清空当前选中要素的点击高亮效果。
   * 这更符合主流网络地图的交互逻辑：关闭详情 = 取消选中。
   */
  const clearSelection = () => {
    highlightGroupRef.current?.clearLayers();
    setFeatureCardOpen(false);
    setSelectedFeature(null);
  };

  // =========================
  // 信息卡“要素跳转”支持：
  // - resolveFeatureById：用于在信息卡中将 id 映射为目标要素（显示 Name）
  // - onTryTriggerLabelClickById：点击时尝试触发目标要素的 labelClick（若无则静默无反应）
  // =========================
  // NOTE: FeatureInteractionCard expects `undefined` for “not found”.
  const resolveFeatureById = (id: string): FeatureRecord | undefined => {
    const key = String(id ?? '').trim();
    if (!key) return undefined;
    const store = storeRef.current;
    if (!store) return undefined;

    // 优先走 byClassId 索引（跨 Class 扫一次 key）
    for (const cls of Object.keys(store.byClassId)) {
      const hit = store.byClassId[cls]?.[key];
      if (hit && hit.length > 0) return hit[0];
    }

    // 兜底：线性扫描（可读性优先）
    return store.all.find((r) => String(r?.meta?.idValue ?? '').trim() === key);
  };

  const onTryTriggerLabelClickById = (id: string) => {
    const rr = resolveFeatureById(id);
    if (!rr) return;

    const store = storeRef.current;
    if (!store) return;

    const rule = findFirstRule(rr);
    const rawClick = (rule as any)?.symbol?.labelClick;
    if (!rawClick) return;

    const clickPlan: any = typeof rawClick === 'function' ? rawClick(rr, ctx, store) : rawClick;
    if (!clickPlan || !clickPlan.enabled) return;

    handleLabelClick(rr, clickPlan as any);
  };

    // ✅ 跨世界切换时，清理选中态与高亮，避免“跨世界残留高亮/信息框”。
  // 触发时机：worldId 变化（WorldSwitcher / 外部世界切换）。
  useEffect(() => {
    highlightGroupRef.current?.clearLayers();
    setFeatureCardOpen(false);
    setSelectedFeature(null);
  }, [worldId]);



  const mobileFloorVisible = ctx.inFloorView && !!activeBuildingUid && floorOptions.length > 0 && visible;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('ria:ruleFeatureCardState', {
      detail: {
        open: featureCardOpen,
        feature: selectedFeature,
        classCode: selectedFeature?.meta?.Class ?? selectedFeature?.featureInfo?.Class ?? null,
        resolveFeatureById,
        onTryTriggerLabelClickById,
      },
    }));
  }, [featureCardOpen, selectedFeature, resolveFeatureById, onTryTriggerLabelClickById]);


  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ index?: number }>).detail ?? {};
      const idx = Number(detail.index);
      if (!Number.isInteger(idx)) return;
      if (idx < 0 || idx >= floorOptions.length) return;
      setActiveFloorIndex(idx);
    };

    window.addEventListener('ria:mobileFloorSelect', handler as EventListener);
    return () => window.removeEventListener('ria:mobileFloorSelect', handler as EventListener);
  }, [floorOptions.length]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('ria:mobileFloorPanelState', {
        detail: {
          visible: mobileFloorVisible,
          buildingName: activeBuildingName,
          floorOptions,
          activeFloorIndex,
        },
      }),
    );
  }, [mobileFloorVisible, activeBuildingName, floorOptions, activeFloorIndex]);

  // (3.5) 初始化自定义 panes：用于稳定控制遮挡顺序（避免“读入顺序导致覆盖”）
  useEffect(() => {
    if (!mapReady) return;

    const ensurePane = (name: string, z: number) => {
      let p = map.getPane(name);
      if (!p) p = map.createPane(name);
      p.style.zIndex = String(z);
    };

    // 线/面默认层（接近 Leaflet overlayPane 的 400）
    ensurePane('ria-overlay', 410);

    // 高亮线/面（在 overlay 之上、点之下）
    ensurePane('ria-overlay-top', 640);

    // 点层：永远在面/线之上
    ensurePane('ria-point', 650);

    // 更“顶”的点层（你可以在规则里指定把某些点强制压到最上）
    ensurePane('ria-point-top', 660);

    // label 层：比点再高一点
    ensurePane('ria-label', 670);
  }, [mapReady, map]);


  // (4) 选择“当前激活建筑” + 生成楼层 options
  useEffect(() => {
    if (!mapReady) return;
    const store = storeRef.current;
    if (!store) return;

    const updateActiveBuilding = () => {
      const leafletZoom = map.getZoom();
      const zoomLevel = toZoomLevel(leafletZoom);
      //const inFloorView = zoomLevel >= DEFAULT_FLOOR_VIEW.minLevel;
      const inFloorView = zoomLevel >= FLOOR_VIEW_MIN_LEVEL;


      if (!inFloorView) {
        setActiveBuildingUid(null);
        setActiveBuildingFloorRefSet(null);
        setActiveBuildingName('');
        setFloorOptions([]);
        setActiveFloorIndex(0);
        return;
      }

      const center = map.getCenter();
      const loc = (projection as any).latLngToLocation?.(center, Y_FOR_DISPLAY);
      if (!loc) return;
      const p = { x: Number(loc.x), z: Number(loc.z) };



      // 以“中心点命中/接近建筑”为激活建筑（支持 STB/SBP/BUD）
      const buildings: FeatureRecord[] = (FLOOR_BUILDING_CLASSES as readonly string[]).flatMap((c) => store.byClass[c] ?? []);
      let picked: FeatureRecord | null = null;

      // (1) 严格命中：中心点落入建筑面（Polygon）
      for (const b of buildings) {
        if (b.type !== 'Polygon' || !b.coords3 || b.coords3.length < 3) continue;
        const poly = b.coords3.map((pt) => ({ x: pt.x, z: pt.z }));
        if (pointInPolygonXZ(p, poly)) {
          picked = b;
          break;
        }
      }

      // (2) 非严格命中：中心点在一定像素范围内“接近”建筑（Polygon 用 bounds；Point 用点距）
      if (!picked) {
        const paddedView = map.getBounds().pad(FLOOR_PICK_VIEW_PAD);
        let best: { b: FeatureRecord; dist: number } | null = null;

        const size = map.getSize();
        const centerPx = L.point(size.x / 2, size.y / 2);

        for (const b of buildings) {
          // Point building（SBP 等）
          if (b.type === 'Points' && b.p3) {
            const ll = projection.locationToLatLng(b.p3.x, b.p3.y, b.p3.z);
            if (!paddedView.contains(ll)) continue;
            const pt = map.latLngToContainerPoint(ll);
            const d = Math.hypot(pt.x - centerPx.x, pt.y - centerPx.y);
            if (d <= FLOOR_PICK_ACTIVATE_PX && (!best || d < best.dist)) {
              best = { b, dist: d };
            }
            continue;
          }

          // Polygon building（STB/BUD 等）
          if (!b.coords3?.length) continue;
          const bBounds = getFeatureBoundsLatLng(projection, b.coords3 as any, Y_FOR_DISPLAY);
          if (!bBounds) continue;
          if (!paddedView.intersects(bBounds)) continue;

          const d = distanceFromViewportCenterToBoundsPx(map, bBounds);
          if (d <= FLOOR_PICK_ACTIVATE_PX && (!best || d < best.dist)) {
            best = { b, dist: d };
          }
        }

        picked = best?.b ?? null;
      }

      const newUid = picked?.uid ?? null;

      // picked == null：只有当“上一次激活建筑”离开中心一定范围时才清空（避免闪烁）
      if (!picked) {
        if (activeBuildingUid) {
          const prev = buildings.find((b) => b.uid === activeBuildingUid);
          if (prev) {
            // Polygon：用 bounds
            if (prev.type === 'Polygon' && prev.coords3?.length) {
              const prevBounds = getFeatureBoundsLatLng(projection, prev.coords3 as any, Y_FOR_DISPLAY);
              if (prevBounds) {
                const d = distanceFromViewportCenterToBoundsPx(map, prevBounds);
                if (d <= FLOOR_PICK_KEEP_PX) return;
              }
            }
            // Point：用点距
            if (prev.type === 'Points' && prev.p3) {
              const size = map.getSize();
              const centerPx = L.point(size.x / 2, size.y / 2);
              const ll = projection.locationToLatLng(prev.p3.x, prev.p3.y, prev.p3.z);
              const pt = map.latLngToContainerPoint(ll);
              const d = Math.hypot(pt.x - centerPx.x, pt.y - centerPx.y);
              if (d <= FLOOR_PICK_KEEP_PX) return;
            }
          }
        }

        setActiveBuildingUid(null);
        setActiveBuildingFloorRefSet(null);
        setActiveBuildingName('');
        setFloorOptions([]);
        setActiveFloorIndex(0);
        return;
      }

      // picked 有值：如果还是同一栋建筑，可提前 return（减少重复算）
      if (newUid === activeBuildingUid) return;

      // 切换到新的建筑
      setActiveBuildingUid(newUid);

      // 建筑名兼容：STB/SBP/BUD
      const bfi: any = picked.featureInfo;
      const bName = String(
        bfi?.Name ?? bfi?.Name ?? bfi?.BuildingName ?? bfi?.name ?? ''
      ).trim();
      setActiveBuildingName(bName);

      // 楼层关联：优先 STF/FLR 向上索引建筑；再用建筑 Floors[] 向下补全
      const floors: FeatureRecord[] = (FLOOR_FLOOR_CLASSES as readonly string[]).flatMap((c) => store.byClass[c] ?? []);

      const floorsById = new Map<string, FeatureRecord>();
      for (const f of floors) {
        const fid = getFloorIdForFloorView(f);
        if (fid) floorsById.set(fid, f);
      }

      const buildingIds = getBuildingIdCandidatesForFloorView(picked);
      const floorIdSet = new Set<string>();

      // (A) STF/FLR 向上索引（parentId → buildingId）
      if (buildingIds.size) {
        for (const f of floors) {
          const parent = getFloorParentIdForFloorView(f);
          if (!parent || !buildingIds.has(parent)) continue;
          const fid = getFloorIdForFloorView(f);
          if (fid) floorIdSet.add(fid);
        }
      }

      // (B) 兼容：STB/SBP/BUD.Floors[] 向下补全（可拆卸）
      supplementFloorIdsByDownwardRefs(picked, floorsById, floorIdSet);

      // 若仍无任何楼层，则不进入楼层视角（避免“任何建筑都出楼层条”）
      if (floorIdSet.size === 0) {
        setActiveBuildingUid(null);
        setActiveBuildingFloorRefSet(null);
        setActiveBuildingName('');
        setFloorOptions([]);
        setActiveFloorIndex(0);
        return;
      }

      setActiveBuildingFloorRefSet(floorIdSet);

      // 生成 floorOptions：从 STF/FLR 中筛选属于该建筑的楼层，按 NofFloor 去重排序
      const selectorSet = new Set<string>();
      for (const fid of floorIdSet) {
        const f = floorsById.get(fid);
        if (!f) continue;
        const selector = String((f.featureInfo as any)?.[DEFAULT_FLOOR_VIEW.floorSelectorField] ?? '').trim();
        if (selector) selectorSet.add(selector);
      }

      const values = Array.from(selectorSet);
      // 排序：数值优先；默认“上到下”显示（大到小）
      values.sort((a, b) => {
        const na = Number(a);
        const nb = Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na;
        return String(b).localeCompare(String(a));
      });

      const opts = values.map((v) => {
        const n = Number(v);
        const label = Number.isFinite(n) ? (n >= 0 ? `L${n}` : `B${Math.abs(n)}`) : v;
        return { value: v, label };
      });

      setFloorOptions(opts);
      setActiveFloorIndex(0);

    };

    updateActiveBuilding();
    map.on('moveend', updateActiveBuilding);
    map.on('zoomend', updateActiveBuilding);
    return () => {
      map.off('moveend', updateActiveBuilding);
      map.off('zoomend', updateActiveBuilding);
    };
}, [mapReady, map, projection, activeBuildingUid, dataVersion]);


  // (5) 渲染：根据规则 + zoom + bounds + floor context 进行增量 add/remove
  useEffect(() => {
    if (!mapReady) return;
    if (!visible) return;
    const root = rootRef.current;
    if (!root) return;
    const store = storeRef.current;
    if (!store) return;

const refresh = () => {
  const leafletZoom = map.getZoom();
  const zoomLevel = toZoomLevel(leafletZoom);
  const inFloorView = zoomLevel >= DEFAULT_FLOOR_VIEW.minLevel;

  const context: RenderContext = {
    worldId,
    leafletZoom,
    zoomLevel,
    inFloorView,
    activeBuildingUid,
    activeFloorSelector: floorOptions[activeFloorIndex]?.value ?? null,
    activeBuildingFloorRefSet,
  };

  const bounds = map.getBounds();
  const viewportWorldRectXZ = viewportWorldRectXZFromBounds(bounds, projection);
  const records = recordsRef.current;

  // declutter labels：先收集 request，后统一跑布局，再回写到各个 bundle.label
  const declutterLabelRequests: LabelRequest[] = [];
  const declutterLabelMeta = new Map<string, { styleKey: any; plan: LabelClickPlan | null; }>();

  // ✅ 新增：点图标避让矩形（屏幕像素）
const avoidRectsPx: AvoidRectPx[] = [];

  const shouldShow = new Set<string>();

  for (const r of records) {
    const rule = findFirstRule(r);
    if (!rule) continue;

    if (rule.zoom) {
      const [min, max] = rule.zoom;
      if (zoomLevel < min || zoomLevel > max) continue;
    }

    // 可见性条件（楼层选择/存在性等）
    // 声明式：若同 idValue 的目标 Class 存在，则隐藏当前要素（用于“若存在则不渲染”）
    if (rule.hideIfSameIdExistsInClasses && r.meta.idValue) {
      let blocked = false;
      for (const c of rule.hideIfSameIdExistsInClasses) {
        if (store.hasSameIdInClass(c, r.meta.idValue)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
    }
    if (rule.visible && !rule.visible(r, context, store)) continue;

    const rawClick = (rule.symbol as any)?.labelClick;
    const clickPlan: LabelClickPlan | null = rawClick ? (typeof rawClick === 'function' ? rawClick(r, context, store) : rawClick) : null;
    const labelOnly = !!(clickPlan && (clickPlan as any).enabled && (clickPlan as any).mode === 'labelOnly');

    // 屏幕范围裁剪（点/线/面统一做 bounds.contains）
    let pointLatLng: L.LatLng | undefined;
    if (r.type === 'Points' && r.p3) {
      pointLatLng = projection.locationToLatLng(r.p3.x, r.p3.y, r.p3.z);
      if (!bounds.contains(pointLatLng)) continue;
    } else if (r.coords3 && r.coords3.length) {
      // 用 bbox 做快速裁剪（可读性优先）
      let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
      for (const p of r.coords3) {
        const ll = projection.locationToLatLng(p.x, p.y, p.z);
        minLat = Math.min(minLat, ll.lat);
        minLng = Math.min(minLng, ll.lng);
        maxLat = Math.max(maxLat, ll.lat);
        maxLng = Math.max(maxLng, ll.lng);
      }
      const b = L.latLngBounds(L.latLng(minLat, minLng), L.latLng(maxLat, maxLng));
      if (!bounds.intersects(b)) continue;
    }

// ✅ 新增：把点符号当作“硬占用区”，用于 label 避让
if (r.type === 'Points' && pointLatLng && !labelOnly) {
  const pt = map.latLngToContainerPoint(pointLatLng);

  const sym = rule.symbol;
  const pointPlan = typeof sym?.point === 'function' ? sym.point(r, context, store) : sym?.point;

  // 默认占用尺寸（可按视觉调）
  let w = 28;
  let h = 28;

  // circleMarker：radius 是 CircleMarkerOptions 才有，类型上用 any 取值即可（不改类型定义）
  if (pointPlan?.kind === 'circle') {
    const radius = Number((pointPlan as any)?.radius ?? (pointPlan as any)?.style?.radius ?? 6);
    const weight = Number((pointPlan as any)?.style?.weight ?? 0);
    const half = Math.max(4, radius + weight + 2);
    w = half * 2;
    h = half * 2;
  }

  // icon marker：avoidSizePx 不是你现有类型字段，用 any 读取；没有就退回 iconSize
  if (pointPlan?.kind === 'icon') {
    const sz = (pointPlan as any)?.avoidSizePx ?? (pointPlan as any)?.iconSize;
    if (Array.isArray(sz) && sz.length >= 2) {
      w = Math.max(4, Number(sz[0]));
      h = Math.max(4, Number(sz[1]));
    } else {
      w = 32;
      h = 32;
    }
  }

  avoidRectsPx.push({ x: pt.x - w / 2, y: pt.y - h / 2, w, h, ownerUid: r.uid });

}



    shouldShow.add(r.uid);

    // labelOnly：主几何不显示且不可交互（交互只发生在 label 上）
    const hiddenSymbol = labelOnly
      ? ({
          ...(rule.symbol as any),
          pathStyle: () => ({ opacity: 0, weight: 0, fillOpacity: 0, interactive: false, pane: (rule.symbol as any)?.pane ?? 'ria-overlay' }),
          point: () => ({ kind: 'circle', radius: 1, style: { opacity: 0, fillOpacity: 0, weight: 0, interactive: false }, pane: (rule.symbol as any)?.pane ?? 'ria-point' }),
        } as any)
      : (rule.symbol as any);

    // 确保 layer 存在
    const existing = cacheRef.current.get(r.uid);
    if (!existing) {
      const bundle = createLayerBundle(r, hiddenSymbol, context, store, projection, handleLabelClick, viewportWorldRectXZ);
      if (!bundle) continue;
      cacheRef.current.set(r.uid, bundle);
      root.addLayer(bundle.main);
      if (bundle.label) root.addLayer(bundle.label);
    } else {
      // 更新样式（动态色/透明度/楼层淡化）
      updateLayerBundle(existing, r, hiddenSymbol, context, store, projection, root, handleLabelClick, viewportWorldRectXZ);
      if (!root.hasLayer(existing.main)) root.addLayer(existing.main);
      if (existing.label && !root.hasLayer(existing.label)) root.addLayer(existing.label);
    }

    // LabelLayout：仅对声明了 labelPlan.declutter 的规则生效；其余 label 走旧逻辑
    const rawLabelPlan = rule.symbol?.label;
    const labelPlan = typeof rawLabelPlan === 'function' ? rawLabelPlan(r, context, store) : rawLabelPlan;
    if (labelPlan?.enabled && labelPlan.declutter) {
      const req = buildLabelRequest(r, labelPlan, context, store, projection, pointLatLng, clickPlan, viewportWorldRectXZ);
      if (req) {
        declutterLabelRequests.push(req);
        let styleKey: any = (labelPlan as any)?.styleKey ?? (clickPlan as any)?.labelStyleKey ?? 'bubble-dark';

        // Polyline：若 request 给了 rotateDeg，则对“沿线文字类样式”注入旋转角。
// - rle-line-xx：铁路沿线字（需要旋转）
// - gm-bw-xx / gm-wtb-xx / gm-outline*：道路沿线字（需要旋转）
// 同时：以 45° 为界，>45° 时改为竖排（中文逐字竖排，英文连续>=4字符横置）。
        const reqRotateDeg = Number((req as any).rotateDeg ?? 0) || 0;
        const absRotateDeg = Math.abs(reqRotateDeg);

        const styleKeyStr = styleKey && typeof styleKey === 'object' ? String((styleKey as any).key ?? '') : String(styleKey ?? '');
        const canRotate =
          styleKeyStr.startsWith('rle-line-') ||
          /^gm-bw-\d+$/.test(styleKeyStr) ||
          /^gm-wtb-\d+$/.test(styleKeyStr) ||
          styleKeyStr.startsWith('gm-outline');

        if (canRotate) {
          const baseObj = styleKey && typeof styleKey === 'object' ? { ...(styleKey as any) } : { key: styleKeyStr };
          if (absRotateDeg > 45) {
            styleKey = { ...baseObj, rotateDeg: 0, writingMode: 'vertical' };
          } else {
            styleKey = { ...baseObj, rotateDeg: reqRotateDeg, writingMode: 'horizontal' };
          }
        } else if (styleKey && typeof styleKey === 'object') {
          // pill 等保持屏幕朝向
          styleKey = { ...(styleKey as any), rotateDeg: 0 };
        }
declutterLabelMeta.set(req.id, { styleKey, plan: (clickPlan && (clickPlan as any).enabled) ? clickPlan : null });
      } else {
        // 该要素当前不应显示 label（minLevel/text 空等）→ 移除旧 label
        const b = cacheRef.current.get(r.uid);
        if (b?.label) {
          if (root.hasLayer(b.label)) root.removeLayer(b.label);
          b.label = undefined;
          b.labelKey = undefined;
        }
      }
    }
  }

  // 统一计算 declutter label 的摆放（避免重叠）
  if (declutterLabelRequests.length) {
    const placed = layoutLabelsOnMap(map, declutterLabelRequests, {
      preferNearCenter: true,
      avoidRectsPx,
      // 可选：给点图标再留一圈缓冲（像素）
      avoidSpacingPx: 1,
    });

    const placedById = new Map<string, typeof placed[number]>();
    for (const p of placed) placedById.set(p.id, p);

    for (const req of declutterLabelRequests) {
      const p = placedById.get(req.id);
      const b = cacheRef.current.get(req.featureUid ?? '');
      if (!b) continue;

      // 不可放置/被隐藏 → 移除
      if (!p || p.hidden) {
        if (b.label) {
          if (root.hasLayer(b.label)) root.removeLayer(b.label);
          b.label = undefined;
          b.labelKey = undefined;
        }
        continue;
      }

      // 计算“偏移后的 latlng”，保持 makeLabelMarker 的样式不变
      const anchorPx = map.latLngToContainerPoint(req.anchorLatLng);
      const shifted = L.point(anchorPx.x + p.dx, anchorPx.y + p.dy);
      const ll = map.containerPointToLatLng(shifted);

      const meta = declutterLabelMeta.get(req.id);
        const plan = meta?.plan ?? null;
        let styleKey = meta?.styleKey ?? 'bubble-dark';

        // Polyline：沿线文字的旋转角以“最终放置点对应的 anchor”优先
        if (styleKey && typeof styleKey === 'object') {
          const k = String((styleKey as any).key ?? '');
          if (k.startsWith('rle-line-')) {
            const rot = (p as any)?.rotateDeg;
            styleKey = { ...(styleKey as any), rotateDeg: typeof rot === 'number' ? rot : Number((req as any).rotateDeg ?? 0) || 0 };
          }
        }

        const styleKeyCache =
          typeof styleKey === 'string'
            ? styleKey
            : styleKey && typeof styleKey === 'object'
              ? `${String((styleKey as any).key ?? '')}@${String((styleKey as any).color ?? '')}@${String((styleKey as any).rotateDeg ?? '')}`
              : String(styleKey);

        const labelKey = `${p.text}|${req.placement}|${req.withDot ? 1 : 0}|${Number(req.offsetY ?? 0)}|${styleKeyCache}|${plan ? 1 : 0}`;

      // 尽量复用 marker，避免每次 refresh 都重建
      if (b.label && b.label instanceof L.Marker && b.labelKey === labelKey) {
        b.label.setLatLng(ll);
      } else {
        if (b.label && root.hasLayer(b.label)) root.removeLayer(b.label);
        if (plan) {
          b.label = makeClickableLabelMarker({
            latlng: ll,
            text: p.text,
            placement: req.placement,
            withDot: !!req.withDot,
            offsetY: req.offsetY,
            styleKey: (styleKey as any),
            onClick: () => {
              const uid = req.featureUid ?? '';
              const rr = recordsRef.current.find((x) => x.uid === uid);
              if (rr) handleLabelClick(rr, plan);
            },
          });
        } else {
          b.label = makeLabelMarker(ll, p.text, req.placement, !!req.withDot, req.offsetY, styleKey);
        }
        b.labelKey = labelKey;
      }

      if (b.label && !root.hasLayer(b.label)) root.addLayer(b.label);
    }
  }

  // 移除不应显示的
  for (const [uid, bundle] of cacheRef.current.entries()) {
    if (shouldShow.has(uid)) continue;
    if (root.hasLayer(bundle.main)) root.removeLayer(bundle.main);
    if (bundle.label && root.hasLayer(bundle.label)) root.removeLayer(bundle.label);
  }
};


    refresh();
    map.on('moveend', refresh);
    map.on('zoomend', refresh);
    return () => {
      map.off('moveend', refresh);
      map.off('zoomend', refresh);
    };
  }, [mapReady, visible, map, projection, worldId, activeBuildingUid, activeBuildingFloorRefSet, floorOptions, activeFloorIndex, dataVersion]);


  const showFloorUI = mobileFloorVisible;


  return (
    <>
      {showFloorUI && (
        <div className="hidden sm:block">
          <AppCard
            style={{ position: 'fixed', top: 80, right: 16, zIndex: 2147483647, pointerEvents: 'auto' }}
            className="bg-white/90 border border-gray-200 p-2 w-28"
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="text-xs font-semibold text-gray-800 mb-1">楼层视角</div>
            <div className="text-[11px] text-gray-600 mb-2 truncate" title={activeBuildingName}>
              {activeBuildingName || '（未命名建筑）'}
            </div>

            <div className="flex flex-col gap-1 max-h-[60vh] overflow-auto">
              {floorOptions.map((opt, idx) => {
                const on = idx === activeFloorIndex;
                return (
                  <AppButton
                    key={opt.value}
                    type="button"
                    onClick={() => setActiveFloorIndex(idx)}
                    className={`w-full text-left px-2 py-1 rounded text-xs border transition-colors ${
                      on ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </AppButton>
                );
              })}
            </div>
          </AppCard>
        </div>
      )}
      <div className="hidden sm:block">
        {(() => {
          const cls = selectedFeature?.meta?.Class ?? selectedFeature?.featureInfo?.Class;
          const Card = resolveFeatureCardComponent(cls);
          return (
            <Card
              open={featureCardOpen}
              feature={selectedFeature}
              onClose={clearSelection}
              resolveFeatureById={resolveFeatureById}
              onTryTriggerLabelClickById={onTryTriggerLabelClickById}
            />
          );
        })()}
      </div>
    </>
  );
}

function createLayerBundle(
  r: FeatureRecord,
  symbol: any,
  ctx: RenderContext,
  store: FeatureStore,
  projection: DynmapProjection,
  onLabelClick?: (r: FeatureRecord, plan: LabelClickPlan) => void,
  viewportWorldRectXZ?: WorldRectXZ | null,
): LayerBundle | null {

  const resolvedLabelPlan = (typeof (symbol as any)?.label === 'function') ? (symbol as any).label(r, ctx, store) : (symbol as any)?.label;

  const rawClick = (symbol as any)?.labelClick;
  const clickPlan: LabelClickPlan | null = rawClick ? (typeof rawClick === 'function' ? rawClick(r, ctx, store) : rawClick) : null;
  const clickEnabled = !!(clickPlan && (clickPlan as any).enabled);

  // 【新增】几何点击扩展（最小入侵）：在规则的 labelClick.geom 开启后，点击主几何也触发与 label 点击一致的效果。
  // - 仅在 mode === 'normal' 时生效；labelOnly 下主几何被隐藏且不可交互。
  const geomAllowed = !!(clickEnabled && (clickPlan as any)?.mode === 'normal');
  const geomPointEnabled = !!(geomAllowed && (clickPlan as any)?.geom?.point);
  const geomPathEnabled = !!(geomAllowed && (clickPlan as any)?.geom?.path);

  const labelStyleKey = ((resolvedLabelPlan as any)?.styleKey ?? (clickPlan as any)?.labelStyleKey ?? 'bubble-dark') as any;
  const onClick = clickEnabled && onLabelClick ? () => onLabelClick(r, clickPlan as any) : undefined;

  // 点
  if (r.type === 'Points' && r.p3) {
    const latlng = projection.locationToLatLng(r.p3.x, r.p3.y, r.p3.z);

    const plan = typeof symbol.point === 'function' ? symbol.point(r, ctx, store) : symbol.point;

    // ✅ pane 解析优先级：pointPlan.pane > symbol.pane > 默认 ria-point
    const mainPane = (plan as any)?.pane ?? symbol?.pane ?? 'ria-point';

    let main: L.Layer;
    let kind: LayerBundle['kind'] = 'marker';
    let iconUrl: string | undefined;

    if (plan && plan.kind === 'icon') {
      iconUrl = plan.iconUrl ?? (plan.iconUrlFrom ? String((r.featureInfo as any)?.[plan.iconUrlFrom] ?? '').trim() : undefined);
      if (!iconUrl) {
        // fallback circle
        const cm = L.circleMarker(latlng, {
          pane: mainPane,
          radius: 5,
          weight: 2,
          opacity: 0.9,
          fillOpacity: 0.6,
        });
        main = cm;
        kind = 'circleMarker';
      } else {
        const icon = L.icon({
          iconUrl,
          iconSize: plan.iconSize ?? [24, 24],
          iconAnchor: plan.iconAnchor ?? [12, 12],
        });
        main = L.marker(latlng, {
          pane: mainPane,
          icon,
          // 仅在开启 geom.point 时让 marker 可点击；默认保持不可交互，避免影响其他逻辑。
          interactive: geomPointEnabled,
          zIndexOffset: (plan as any)?.zIndexOffset ?? 0,
        });
        kind = 'marker';
      }
    } else {
      const cm = L.circleMarker(latlng, {
        pane: mainPane,
        radius: plan?.radius ?? 5,
        ...(plan?.style ?? { color: '#111827', weight: 2, opacity: 0.9, fillOpacity: 0.6, fillColor: '#f97316' }),
      });
      main = cm;
      kind = 'circleMarker';
    }

    // 【新增】几何点击：点要素本体点击（marker / circleMarker）
    if (geomPointEnabled && clickEnabled && onLabelClick) {
      (main as any).off?.('click');
      (main as any).on?.('click', (e: L.LeafletMouseEvent) => {
        (e as any)?.originalEvent?.stopPropagation?.();
        onLabelClick(r, clickPlan as any);
      });
    }

    // label
    const labelLayer = buildLabelLayer(r, resolvedLabelPlan, ctx, store, projection, latlng, labelStyleKey, clickEnabled ? (clickPlan as any) : null, onClick, viewportWorldRectXZ);
    return { main, label: labelLayer ?? undefined, kind, iconUrl, pane: mainPane };
  }


  // 线/面
  if (r.coords3 && r.coords3.length) {
    const latlngs = r.coords3.map(p => projection.locationToLatLng(p.x, p.y, p.z));

    const style: L.PathOptions = typeof symbol.pathStyle === 'function' ? symbol.pathStyle(r, ctx, store) : symbol.pathStyle;

    // pane：symbol.pane > 默认 ria-overlay
    const mainPane = symbol?.pane ?? 'ria-overlay';

    const main =
      r.type === 'Polyline'
        ? L.polyline(latlngs, { ...(style ?? {}), pane: mainPane, interactive: geomPathEnabled ? true : (style as any)?.interactive })
        : L.polygon(latlngs, { ...(style ?? {}), pane: mainPane, interactive: geomPathEnabled ? true : (style as any)?.interactive });

    // 【新增】几何点击：线/面要素本体点击
    if (geomPathEnabled && clickEnabled && onLabelClick) {
      (main as any).off?.('click');
      (main as any).on?.('click', (e: L.LeafletMouseEvent) => {
        (e as any)?.originalEvent?.stopPropagation?.();
        onLabelClick(r, clickPlan as any);
      });
    }

    const labelLayer = buildLabelLayer(r, resolvedLabelPlan, ctx, store, projection, undefined, labelStyleKey, clickEnabled ? (clickPlan as any) : null, onClick, viewportWorldRectXZ);
    return { main, label: labelLayer ?? undefined, kind: 'path', pane: mainPane };
  }


  return null;
}

function updateLayerBundle(
  bundle: LayerBundle,
  r: FeatureRecord,
  symbol: any,
  ctx: RenderContext,
  store: FeatureStore,
  projection: DynmapProjection,
  root: L.LayerGroup,
  onLabelClick?: (r: FeatureRecord, plan: LabelClickPlan) => void,
  viewportWorldRectXZ?: WorldRectXZ | null,
) {
  const resolvedLabelPlan = (typeof (symbol as any)?.label === 'function') ? (symbol as any).label(r, ctx, store) : (symbol as any)?.label;

  const rawClick = (symbol as any)?.labelClick;
  const clickPlan: LabelClickPlan | null = rawClick ? (typeof rawClick === 'function' ? rawClick(r, ctx, store) : rawClick) : null;
  const clickEnabled = !!(clickPlan && (clickPlan as any).enabled);

  const geomAllowed = !!(clickEnabled && (clickPlan as any)?.mode === 'normal');
  const geomPointEnabled = !!(geomAllowed && (clickPlan as any)?.geom?.point);
  const geomPathEnabled = !!(geomAllowed && (clickPlan as any)?.geom?.path);

  const labelStyleKey = ((resolvedLabelPlan as any)?.styleKey ?? (clickPlan as any)?.labelStyleKey ?? 'bubble-dark') as any;
  const onClick = clickEnabled && onLabelClick ? () => onLabelClick(r, clickPlan as any) : undefined;
  // 点：若 iconUrl 变化，重建
  if (r.type === 'Points' && r.p3) {
    const latlng = projection.locationToLatLng(r.p3.x, r.p3.y, r.p3.z);
    const plan = typeof symbol.point === 'function' ? symbol.point(r, ctx, store) : symbol.point;
    let nextKind: LayerBundle['kind'] = bundle.kind;
    let nextIconUrl = bundle.iconUrl;

    if (plan && plan.kind === 'icon') {
      const url = plan.iconUrl ?? (plan.iconUrlFrom ? String((r.featureInfo as any)?.[plan.iconUrlFrom] ?? '').trim() : undefined);
      nextIconUrl = url || undefined;
      nextKind = url ? 'marker' : 'circleMarker';
    } else {
      nextKind = 'circleMarker';
      nextIconUrl = undefined;
    }

    // marker 的 interactive 不能可靠地原地切换；若 geom.point 开关变化，直接重建最稳。
    const nextMarkerInteractive = geomPointEnabled;
    const curMarkerInteractive = bundle.kind === 'marker' ? !!((bundle.main as any)?.options?.interactive) : undefined;

    if (nextKind !== bundle.kind || nextIconUrl !== bundle.iconUrl || (bundle.kind === 'marker' && curMarkerInteractive !== nextMarkerInteractive)) {
      // remove old
      if (root.hasLayer(bundle.main)) root.removeLayer(bundle.main);
      if (bundle.label && root.hasLayer(bundle.label)) root.removeLayer(bundle.label);

      const newBundle = createLayerBundle(r, symbol, ctx, store, projection, onLabelClick, viewportWorldRectXZ);
      if (!newBundle) return;
      bundle.main = newBundle.main;
      bundle.label = newBundle.label;
      bundle.kind = newBundle.kind;
      bundle.iconUrl = newBundle.iconUrl;
      return;
    }

    // circleMarker style refresh
    if (bundle.kind === 'circleMarker' && bundle.main instanceof L.CircleMarker) {
      const style = plan?.kind === 'circle' ? (plan.style ?? {}) : {};
      if (style) bundle.main.setStyle(style);
      bundle.main.setLatLng(latlng);
    }

    if (bundle.kind === 'marker' && bundle.main instanceof L.Marker) {
      bundle.main.setLatLng(latlng);
    }

    // 【新增】几何点击：点要素（更新时重绑）
    (bundle.main as any).off?.('click');
    if (geomPointEnabled && clickEnabled && onLabelClick) {
      (bundle.main as any).on?.('click', (e: L.LeafletMouseEvent) => {
        (e as any)?.originalEvent?.stopPropagation?.();
        onLabelClick(r, clickPlan as any);
      });
    }

    // label refresh
    // - 若使用 declutter：不在这里动 label，交由 refresh() 的统一布局阶段处理（避免闪烁/卡顿）
    if ((resolvedLabelPlan as any)?.declutter) return;
    if (bundle.label) {
      if (root.hasLayer(bundle.label)) root.removeLayer(bundle.label);
      bundle.label = undefined;
      bundle.labelKey = undefined;
    }
    const labelLayer = buildLabelLayer(r, resolvedLabelPlan, ctx, store, projection, latlng, labelStyleKey, clickEnabled ? (clickPlan as any) : null, onClick, viewportWorldRectXZ);
    if (labelLayer) bundle.label = labelLayer;
    return;
  }

  // 线/面：更新 style
  if (bundle.main instanceof L.Path) {
    const style: L.PathOptions = typeof symbol.pathStyle === 'function' ? symbol.pathStyle(r, ctx, store) : symbol.pathStyle;
    if (style) bundle.main.setStyle(style);
  }

  // 【新增】几何点击：线/面（更新时重绑）
  (bundle.main as any).off?.('click');
  if (geomPathEnabled && clickEnabled && onLabelClick) {
    (bundle.main as any).on?.('click', (e: L.LeafletMouseEvent) => {
      (e as any)?.originalEvent?.stopPropagation?.();
      onLabelClick(r, clickPlan as any);
    });
  }

  // label refresh
  // - 若使用 declutter：不在这里动 label，交由 refresh() 的统一布局阶段处理
  if (!(resolvedLabelPlan as any)?.declutter) {
    if (bundle.label) {
      if (root.hasLayer(bundle.label)) root.removeLayer(bundle.label);
      bundle.label = undefined;
      bundle.labelKey = undefined;
    }
    const labelLayer = buildLabelLayer(r, resolvedLabelPlan, ctx, store, projection, undefined, labelStyleKey, clickEnabled ? (clickPlan as any) : null, onClick, viewportWorldRectXZ);
    if (labelLayer) bundle.label = labelLayer;
  }
}

// ======================= LabelLayout：从单要素提取 LabelRequest =======================
function buildLabelRequest(
  r: FeatureRecord,
  labelPlan: any,
  ctx: RenderContext,
  store: FeatureStore,
  projection: DynmapProjection,
  pointLatLng?: L.LatLng,
  clickPlan?: LabelClickPlan | null,
  viewportWorldRectXZ?: WorldRectXZ | null,
): LabelRequest | null {
  if (!labelPlan || !labelPlan.enabled) return null;
  if (!labelPlan.declutter) return null;
  if (labelPlan.minLevel !== undefined && ctx.zoomLevel < labelPlan.minLevel) return null;

  let text = '';
  if (typeof labelPlan.textFrom === 'function') {
    text = String(labelPlan.textFrom(r, ctx, store) ?? '').trim();
  } else if (typeof labelPlan.textFrom === 'string') {
    text = String((r.featureInfo as any)?.[labelPlan.textFrom] ?? '').trim();
  }
  if (!text) return null;

  // anchor 计算与 buildLabelLayer 保持一致
  if (r.type === 'Points') {
    const ll = pointLatLng ?? (r.p3 ? projection.locationToLatLng(r.p3.x, r.p3.y, r.p3.z) : null);
    if (!ll) return null;
    const effectivePlacement = labelPlan.placement === 'center' ? ((clickPlan as any)?.mode === 'labelOnly' ? 'center' : 'near') : (labelPlan.placement ?? 'near');
    return {
      id: `${r.uid}#label`,
      featureUid: r.uid,
      anchorLatLng: ll,
      text,
      placement: effectivePlacement,
      withDot: !!labelPlan.withDot,
      offsetY: Number(labelPlan.offsetY ?? 0),
      declutter: labelPlan.declutter,
    };
  }

  if (!r.coords3 || r.coords3.length < 2) return null;

  // Polyline：优先使用“可见中心锚点”（B1），兜底再用累计长度中点
  if (r.type === 'Polyline') {
    const coords = r.coords3;

    const pointAtFraction = (t01: number): { x: number; z: number } => {
      const t = Math.min(1, Math.max(0, Number(t01) || 0));
      let total = 0;
      for (let i = 1; i < coords.length; i++) {
        const a = coords[i - 1];
        const b = coords[i];
        total += Math.hypot(b.x - a.x, b.z - a.z);
      }
      if (total <= 1e-9) {
        const mid = coords[Math.floor(coords.length / 2)];
        return { x: mid.x, z: mid.z };
      }
      const target = total * t;
      let acc = 0;
      for (let i = 1; i < coords.length; i++) {
        const a = coords[i - 1];
        const b = coords[i];
        const seg = Math.hypot(b.x - a.x, b.z - a.z);
        if (acc + seg >= target) {
          const u = (target - acc) / (seg || 1);
          return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
        }
        acc += seg;
      }
      const last = coords[coords.length - 1];
      return { x: last.x, z: last.z };
    };

    const computeTangentAngleDeg = (p: { x: number; z: number }): number => {
      // 找到“距离点最近”的线段方向
      let bestD2 = Infinity;
      let bestDx = 1;
      let bestDz = 0;
      for (let i = 1; i < coords.length; i++) {
        const a = coords[i - 1];
        const b = coords[i];
        const vx = b.x - a.x;
        const vz = b.z - a.z;
        const len2 = vx * vx + vz * vz;
        if (len2 <= 1e-9) continue;
        const t = ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2;
        const u = Math.min(1, Math.max(0, t));
        const px = a.x + vx * u;
        const pz = a.z + vz * u;
        const d2 = (p.x - px) * (p.x - px) + (p.z - pz) * (p.z - pz);
        if (d2 < bestD2) {
          bestD2 = d2;
          bestDx = vx;
          bestDz = vz;
        }
      }
      let ang = (Math.atan2(bestDz, bestDx) * 180) / Math.PI;
      // 让文字尽量不倒置
      if (ang > 90) ang -= 180;
      if (ang < -90) ang += 180;
      return ang;
    };

    const vis = computeVisibleAnchorXZForPolyline((coords as any), viewportWorldRectXZ);
    const anchorXZ = vis ?? pointAtFraction(0.5);
    const ll = projection.locationToLatLng(anchorXZ.x, Y_FOR_DISPLAY, anchorXZ.z);

    // declutter 扩展：沿线多 anchor
    const decl: any = labelPlan.declutter;
    let anchorCandidatesLatLng: L.LatLng[] | undefined;
    let rotateDegCandidates: number[] | undefined;
    if (decl && decl.anchorMode === 'polyline-multi') {
      const samples = Math.max(3, Math.min(15, Number(decl.anchorSamples ?? 7) || 7));
      const half = Math.floor((samples - 1) / 2);
      const step = 0.1;
      const fracs: number[] = [];
      for (let i = 1; i <= half; i++) {
        fracs.push(0.5 - i * step);
        fracs.push(0.5 + i * step);
      }
      const pts = fracs.map((f) => pointAtFraction(f));
      anchorCandidatesLatLng = pts.map((p) => projection.locationToLatLng(p.x, Y_FOR_DISPLAY, p.z));
      rotateDegCandidates = pts.map((p) => computeTangentAngleDeg(p));
    }

    return {
      id: `${r.uid}#label`,
      featureUid: r.uid,
      anchorLatLng: ll,
      anchorCandidatesLatLng,
      rotateDeg: computeTangentAngleDeg(anchorXZ),
      rotateDegCandidates,
      text,
      placement: 'center',
      withDot: !!labelPlan.withDot,
      offsetY: Number(labelPlan.offsetY ?? 0),
      declutter: labelPlan.declutter,
    };
  }

  // Polygon：优先使用“可见中心锚点”（B1），兜底再用几何中心 / bbox 中心
  if (r.coords3.length < 3) return null;
  const polyXZ = r.coords3.map(p => ({ x: p.x, z: p.z }));
  const vis = computeVisibleAnchorXZForPolygon(polyXZ, viewportWorldRectXZ);
  const c =
    vis ?? polygonCentroidXZ(polyXZ) ?? {
      x: (Math.min(...polyXZ.map(p => p.x)) + Math.max(...polyXZ.map(p => p.x))) / 2,
      z: (Math.min(...polyXZ.map(p => p.z)) + Math.max(...polyXZ.map(p => p.z))) / 2,
    };
  const ll = projection.locationToLatLng(c.x, Y_FOR_DISPLAY, c.z);
  return {
    id: `${r.uid}#label`,
    featureUid: r.uid,
    anchorLatLng: ll,
    text,
    placement: (labelPlan.placement ?? 'center'),
    withDot: !!labelPlan.withDot,
    offsetY: Number(labelPlan.offsetY ?? 0),
    declutter: labelPlan.declutter,
  };
}


function buildLabelLayer(
  r: FeatureRecord,
  labelPlan: any,
  ctx: RenderContext,
  store: FeatureStore,
  projection: DynmapProjection,
  pointLatLng?: L.LatLng,
  styleKey?: any,
  clickPlan?: LabelClickPlan | null,
  onClick?: (() => void) | null,
  viewportWorldRectXZ?: WorldRectXZ | null,
): L.Layer | null {
  if (!labelPlan || !labelPlan.enabled) return null;

  if (labelPlan.declutter) return null;
  if (labelPlan.minLevel !== undefined && ctx.zoomLevel < labelPlan.minLevel) return null;

  let text = '';
  if (typeof labelPlan.textFrom === 'function') {
    text = String(labelPlan.textFrom(r, ctx, store) ?? '').trim();
  } else if (typeof labelPlan.textFrom === 'string') {
    text = String((r.featureInfo as any)?.[labelPlan.textFrom] ?? '').trim();
  }
  if (!text) return null;

  const placement = labelPlan.placement ?? 'center';
  const withDot = !!labelPlan.withDot;

  // Points
  if (r.type === 'Points') {
    const ll = pointLatLng ?? (r.p3 ? projection.locationToLatLng(r.p3.x, r.p3.y, r.p3.z) : null);
    if (!ll) return null;
    const effPlacement = placement === 'center' ? (((clickPlan as any)?.mode === 'labelOnly') ? 'center' : 'near') : placement;
    if (clickPlan && (clickPlan as any).enabled && onClick) {
      return makeClickableLabelMarker({
        latlng: ll,
        text,
        placement: effPlacement,
        withDot,
        offsetY: labelPlan.offsetY,
        styleKey: ((styleKey ?? (clickPlan as any).labelStyleKey ?? 'bubble-dark') as any),
        onClick,
      });
    }
    return makeLabelMarker(ll, text, effPlacement, withDot, labelPlan.offsetY, styleKey);

  }

  if (!r.coords3 || r.coords3.length < 2) return null;

  // Polyline：优先使用“可见中心锚点”（B1），兜底再用累计长度中点
  if (r.type === 'Polyline') {
    const vis = computeVisibleAnchorXZForPolyline((r.coords3 as any), viewportWorldRectXZ);
    if (vis) {
      const ll = projection.locationToLatLng(vis.x, Y_FOR_DISPLAY, vis.z);
      if (clickPlan && (clickPlan as any).enabled && onClick) {
        return makeClickableLabelMarker({ latlng: ll, text, placement: 'center', withDot, styleKey: ((styleKey ?? (clickPlan as any).labelStyleKey ?? 'bubble-dark') as any), onClick });
      }
      return makeLabelMarker(ll, text, 'center', withDot, undefined, styleKey);
    }
    let total = 0;
    for (let i = 1; i < r.coords3.length; i++) {
      const a = r.coords3[i - 1];
      const b = r.coords3[i];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      total += Math.hypot(dx, dz);
    }
    if (total <= 1e-9) {
      const mid = r.coords3[Math.floor(r.coords3.length / 2)];
      const ll = projection.locationToLatLng(mid.x, Y_FOR_DISPLAY, mid.z);
      if (clickPlan && (clickPlan as any).enabled && onClick) {
          return makeClickableLabelMarker({ latlng: ll, text, placement: 'center', withDot, styleKey: ((styleKey ?? (clickPlan as any).labelStyleKey ?? 'bubble-dark') as any), onClick });
        }
        return makeLabelMarker(ll, text, 'center', withDot, undefined, styleKey);
    }
    const half = total / 2;
    let acc = 0;
    for (let i = 1; i < r.coords3.length; i++) {
      const a = r.coords3[i - 1];
      const b = r.coords3[i];
      const seg = Math.hypot(b.x - a.x, b.z - a.z);
      if (acc + seg >= half) {
        const t = (half - acc) / (seg || 1);
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const ll = projection.locationToLatLng(x, Y_FOR_DISPLAY, z);
        if (clickPlan && (clickPlan as any).enabled && onClick) {
          return makeClickableLabelMarker({ latlng: ll, text, placement: 'center', withDot, styleKey: ((styleKey ?? (clickPlan as any).labelStyleKey ?? 'bubble-dark') as any), onClick });
        }
        return makeLabelMarker(ll, text, 'center', withDot, undefined, styleKey);
      }
      acc += seg;
    }
    const last = r.coords3[r.coords3.length - 1];
    const ll = projection.locationToLatLng(last.x, Y_FOR_DISPLAY, last.z);
    if (clickPlan && (clickPlan as any).enabled && onClick) {
      return makeClickableLabelMarker({ latlng: ll, text, placement: 'center', withDot, styleKey: ((styleKey ?? (clickPlan as any).labelStyleKey ?? 'bubble-dark') as any), onClick });
    }
    return makeLabelMarker(ll, text, 'center', withDot, undefined, styleKey);
  }

  // Polygon：优先使用“可见中心锚点”（B1），兜底再用几何中心 / bbox 中心
  if (r.coords3.length < 3) return null;
  const polyXZ = r.coords3.map(p => ({ x: p.x, z: p.z }));
  const vis = computeVisibleAnchorXZForPolygon(polyXZ, viewportWorldRectXZ);
  const c = vis ?? polygonCentroidXZ(polyXZ) ?? {
    x: (Math.min(...polyXZ.map(p => p.x)) + Math.max(...polyXZ.map(p => p.x))) / 2,
    z: (Math.min(...polyXZ.map(p => p.z)) + Math.max(...polyXZ.map(p => p.z))) / 2,
  };
  const ll = projection.locationToLatLng(c.x, Y_FOR_DISPLAY, c.z);
  if (clickPlan && (clickPlan as any).enabled && onClick) {
    return makeClickableLabelMarker({ latlng: ll, text, placement, withDot, styleKey: ((styleKey ?? (clickPlan as any).labelStyleKey ?? 'bubble-dark') as any), onClick });
  }
  return makeLabelMarker(ll, text, placement, withDot, undefined, styleKey);
}