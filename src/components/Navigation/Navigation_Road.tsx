/**
 * Navigation_Road.tsx
 *
 * 道路导航（新）：基于 ROD 线要素的最短路计算模块（纯 TS，不依赖 React）
 *
 * 设计目标（与你的要求对齐）：
 * - 数据源：规则 JSON（RULE_DATA_SOURCES）内过滤 Class=ROD
 * - 构图：
 *   StepA 端点吸附 eps=1.5（按 Level 分层；不同 Level 视为立交，不相交、不连通）
 *   StepB 相交检测 + 打断（同 Level 才算真相交）
 *   StepC 权重：默认以“时间”为代价；edge 使用 Speed（若存在）否则用面板选择的默认速度
 * - 算法：Dijkstra
 * - 输出：
 *   1) RouteHighlightData（与铁路(新)一致的高亮结构）
 *   2) turn-by-turn 指令（路口转向判断 + 路名合并）
 */

import type { Coordinate } from '@/types';
import type { RouteHighlightData, RouteStyledSegment, RouteStationMarker } from '@/components/Map/RouteHighlightLayer';
import { RULE_DATA_SOURCES, type WorldRuleDataSource } from '@/components/Rules/ruleDataSources';

// ------------------------------
// types
// ------------------------------

export type RoadTravelProfile = {
  /** 面板显示名 */
  name: string;
  /** 默认速度（blocks/s） */
  speed: number;
};

/**
 * 道路导航 - 出行方式列表（面板下拉使用）
 * 说明：
 * - speed 单位：blocks/s
 * - 若道路要素本身填写了 Speed，则该段使用其 Speed 覆盖
 */
export const ROAD_TRAVEL_PROFILES: RoadTravelProfile[] = [
  { name: '步行', speed: 4.3 },
  // 你可以在此处新增“载具/特殊移动方式”的速度配置：
  // { name: '马', speed: 9.0 },
  // { name: '船', speed: 7.0 },
];

export type RoadTurnAction = 'start' | 'continue' | 'slight_left' | 'left' | 'slight_right' | 'right' | 'uturn' | 'arrive';

export type RoadTurnInstruction = {
  action: RoadTurnAction;
  /** 当前道路名（若缺失则使用“道路”） */
  roadName: string;
  /** 本段距离（blocks） */
  distance: number;
  /** 本段耗时（秒） */
  timeSeconds: number;
  /** 指令触发点坐标（路口） */
  at: Coordinate;
};

export type RoadSegment = {
  kind: 'access' | 'road';
  from: Coordinate;
  to: Coordinate;
  coords: Coordinate[];
  distance: number;
  timeSeconds: number;
  /** 仅用于 kind=access：用于 UI 展示“步行/鞘翅”接驳（若不填则由面板全局开关兜底） */
  accessMode?: 'walk' | 'elytra';
  roadId?: string;
  roadName?: string;
  level?: number;
};

export type NavRoadPlan = {
  ok: boolean;
  reason?: string;
  worldId: string;

  profileName: string;
  profileSpeed: number;

  totalDistance: number;
  totalTimeSeconds: number;

  instructions: RoadTurnInstruction[];
  segments: RoadSegment[];
  routeHighlight: RouteHighlightData;
};

export type NavigationRoadComputeOptions = {
  worldId: string;
  startCoord: Coordinate;
  endCoord: Coordinate;

  /** 默认速度（blocks/s），用于未填写 Speed 的道路边 */
  defaultSpeed: number;

  /** 面板是否开启“鞘翅接驳”（仅影响起终点接驳段） */
  useElytra?: boolean;
  /** 鞘翅接驳速度（blocks/s） */
  elytraSpeed?: number;
  /** 当 useElytra=true 时，距离进入点超过该阈值（blocks）则默认使用鞘翅接驳，否则仍视作步行 */
  elytraThreshold?: number;

  /** 起点层数偏好（-10..10，默认 0，仅用于择优，不影响实际图） */
  startLevelPref?: number;
  /** 终点层数偏好（-10..10，默认 0，仅用于择优，不影响实际图） */
  endLevelPref?: number;

  /** eps 容差（blocks），端点吸附 / 节点去重用 */
  eps?: number;

  /** 使用的 road 数据源覆盖（同 teleport_new） */
  dataSourceOverride?: Partial<WorldRuleDataSource>;
  filesOverride?: string[];
  fetcher?: (url: string) => Promise<any[]>;
};

// ------------------------------
// constants & utils
// ------------------------------

const DEFAULT_Y = 64;
const DEFAULT_EPS = 1.5;


// debug（可开关）
const DEBUG_ROAD_NAV = false;
const dbg = (...args: any[]) => { if (DEBUG_ROAD_NAV) console.log('[RoadNav]', ...args); };

// 候选数量（每端）
const CAND_K = 3;

// score：接驳段换算速度（格/秒）——仅用于择优，不参与展示时间
const ACCESS_SCORE_SPEED = 5;

// 择优时对接驳段的惩罚权重（仅用于 score，不参与展示耗时）
const ACCESS_SCORE_WEIGHT = 200;

// 层差修正（每层 +0.05 惩罚；保持以负号表示“每层 -0.05”的语义）
const LEVEL_BIAS_PER_LEVEL = -0.05;

// 折点/端点吸附抑制（可调）
const ENDPOINT_T = 0.08;            // t<0.08 或 t>0.92 视作端点附近
const ENDPOINT_PENALTY = 8;         // 秒（score里额外加），只影响择优，不影响展示

// 自动接入（端点落在线中）相关阈值
// - 仅用于“端点→垂足造节点”的启发式连接，不影响其它逻辑
const ENDPOINT_TO_MIDDLE_SUPPRESS_R = 3; // 若端点附近已存在与目标道路的交叉节点，则抑制再次自动接入
const ENDPOINT_TO_MIDDLE_PARALLEL_COS = 0.92; // 越接近 1 越严格（越容易判定为平行而跳过）


function normCoord(c: Coordinate): Coordinate {
  return { x: Number(c.x), z: Number(c.z), y: Number.isFinite(c.y as any) ? (c.y as number) : DEFAULT_Y };
}

function dist2D(a: Coordinate, b: Coordinate): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function norm2D(v: { x: number; z: number }): { x: number; z: number } {
  const len = Math.hypot(v.x, v.z);
  if (len <= 1e-9) return { x: 0, z: 0 };
  return { x: v.x / len, z: v.z / len };
}

function dot2D(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return a.x * b.x + a.z * b.z;
}

function coordKey2D(c: Coordinate, eps: number, level: number): string {
  // 以 eps 网格做近似聚类；默认 **按 Level 分层**，避免不同 Level 的线在相同平面位置被错误合并成同一节点。
  // 跨层连接（匝道/立交的端点连接）应由显式 ConnectL 或专门的 connector edge 来表达，而不是靠节点聚类“误合并”。
  const gx = Math.round(c.x / eps);
  const gz = Math.round(c.z / eps);
  return `${level}|${gx}|${gz}`;
}


function fetchJsonArray(url: string, fetcher?: (url: string) => Promise<any[]>) {
  if (fetcher) return fetcher(url);
  return fetch(url).then(async (res) => {
    if (!res.ok) throw new Error(`fetch failed: ${res.status} ${url}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  });
}

// ------------------------------
// load & parse ROD
// ------------------------------

type ConnectLItem = { mode: 'endpoint' | 'middle'; tgt: string };

type RoadFeature = {
  id: string;
  name: string;
  level: number;
  oneway: boolean;
  enter: boolean;
  exit: boolean;
  selfJunction: boolean;
  connectL?: ConnectLItem[];
  blacklist?: string[];
  speed?: number;
  coords: Coordinate[];
};

const ROD_CACHE: Record<string, { key: string; roads: RoadFeature[]; loadedAt: number }> = {};

// 临时挂载（MeasuringModule）
const TEMP_RULE_SOURCES_KEY = 'ria_temp_rule_sources_v1';
// 每次写入临时挂载源时 bump 的 revision（用于让道路图缓存感知内容更新，即使 items 数量不变）
const TEMP_RULE_SOURCES_REV_KEY = 'ria_temp_rule_sources_v1_rev';
const TEMP_RULE_OVERRIDE_IDS_KEY = 'ria_temp_rule_override_ids_v1';

type TempRuleSource = {
  uid: string;
  worldId: string;
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

function readTempSourcesRev(): string {
  try {
    return localStorage.getItem(TEMP_RULE_SOURCES_REV_KEY) ?? '';
  } catch {
    return '';
  }
}

function hashString(s: string): string {
  // djb2
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  // 32-bit
  return String(h >>> 0);
}

function parseRoadFromRaw(it: any): RoadFeature | null {
  const Class = String(it?.Class ?? '').trim().toUpperCase();
  if (Class !== 'ROD') return null;
  const id = String(it?.ID ?? '').trim();
  if (!id) return null;
  const name = String(it?.Name ?? '').trim() || '道路';
  const level = Number.isFinite(Number(it?.Level)) ? Number(it.Level) : 0;
  const oneway = Boolean(it?.Oneway);
  // Enter/Exit 缺省视为 true（可进入/可离开）
  const enter = (typeof it?.Enter === 'boolean') ? Boolean(it.Enter) : true;
  const exit = (typeof it?.Exit === 'boolean') ? Boolean(it.Exit) : true;
  // SelfJunction 缺省视为 false（默认不允许自身自交建点）
  const selfJunction = (typeof it?.SelfJunction === 'boolean') ? Boolean(it.SelfJunction) : false;

  const rawCL = Array.isArray(it?.ConnectL) ? it.ConnectL : (Array.isArray(it?.connectL) ? it.connectL : null);
  const connectL: ConnectLItem[] | undefined = rawCL
    ? rawCL
        .map((x: any) => ({
          mode: String(x?.mode ?? x?.Lot ?? '').trim(),
          tgt: String(x?.tgt ?? x?.Tgt ?? '').trim(),
        }))
        .filter((x: any) => (x.mode === 'endpoint' || x.mode === 'middle') && !!x.tgt)
        .map((x: any) => ({ mode: x.mode, tgt: x.tgt }))
    : undefined;

  // Blacklist：兼容 [[ID]] / [ID] / [{tgt}]
  const rawBL = (it as any)?.Blacklist ?? (it as any)?.blacklist;
  const blacklist: string[] | undefined = Array.isArray(rawBL)
    ? rawBL
        .map((x: any) => {
          if (typeof x === 'string') return x.trim();
          if (Array.isArray(x)) return String(x?.[0] ?? '').trim();
          if (x && typeof x === 'object') return String(x?.tgt ?? x?.ID ?? x?.id ?? '').trim();
          return '';
        })
        .filter((s: string) => !!s)
    : undefined;
  const speed = Number.isFinite(Number(it?.Speed)) ? Number(it.Speed) : undefined;

  const lp = it?.Linepoints;
  if (!Array.isArray(lp) || lp.length < 2) return null;
  const coords = lp
    .map((p: any) => {
      const x = Number(p?.[0]);
      const y = Number(p?.[1]);
      const z = Number(p?.[2]);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
      return { x, z, y: Number.isFinite(y) ? y : -64 } as Coordinate;
    })
    .filter(Boolean) as Coordinate[];
  if (coords.length < 2) return null;

  return { id, name, level, oneway, enter, exit, selfJunction, connectL, blacklist, speed, coords };
}

async function loadRoadFeatures(worldId: string, opt: {
  dataSourceOverride?: Partial<WorldRuleDataSource>;
  filesOverride?: string[];
  fetcher?: (url: string) => Promise<any[]>;
}): Promise<RoadFeature[]> {
  const base = RULE_DATA_SOURCES[worldId];
  if (!base) return [];

  const ds: WorldRuleDataSource = {
    baseUrl: opt.dataSourceOverride?.baseUrl ?? base.baseUrl,
    files: opt.filesOverride ?? opt.dataSourceOverride?.files ?? base.files,
  };

  // 将临时挂载源纳入 cache key，确保挂载/取消挂载后能触发重新读取与重建。
  const enabledTemps = readTempSources(worldId).filter((t) => t.enabled);
  const tempRev = enabledTemps.length > 0 ? readTempSourcesRev() : '';
  const rawTemp = (() => {
    try {
      // 仅纳入“启用的源”的结构信息（避免 key 过长）
      return JSON.stringify(enabledTemps.map((t) => ({ uid: t.uid, n: (t.items?.length ?? 0) })));
    } catch {
      return '';
    }
  })();
  const overrideIds = enabledTemps.length > 0 ? readTempOverrideIds(worldId) : new Set<string>();
  const rawOverride = enabledTemps.length > 0 ? JSON.stringify(Array.from(overrideIds).sort()) : '';

  const key = `${ds.baseUrl}::${(ds.files ?? []).join('|')}::temp=${hashString(rawTemp)}::rev=${tempRev}::ovr=${hashString(rawOverride)}`;
  const cached = ROD_CACHE[worldId];
  if (cached && cached.key === key && Array.isArray(cached.roads)) return cached.roads;

  const out: RoadFeature[] = [];

  // (A) 固定数据源：若存在 overrideIds（且至少有 enabled temp），则屏蔽同 ID 要素
  for (const f of ds.files ?? []) {
    const url = `${ds.baseUrl}/${f}`;
    let arr: any[] = [];
    try {
      arr = await fetchJsonArray(url, opt.fetcher);
    } catch {
      continue;
    }
    for (const it of arr) {
      const parsed = parseRoadFromRaw(it);
      if (!parsed) continue;
      if (overrideIds.size > 0 && overrideIds.has(parsed.id)) continue;
      out.push(parsed);
    }
  }

  // (B) 临时挂载源（MeasuringModule）：直接并入（与铁路要素同预期）
  for (const src of enabledTemps) {
    for (const it of src.items ?? []) {
      const parsed = parseRoadFromRaw(it);
      if (!parsed) continue;
      out.push(parsed);
    }
  }

  ROD_CACHE[worldId] = { key, roads: out, loadedAt: Date.now() };
  return out;
}

/**
 * 主动预热/重建道路图缓存（用于“临时挂载”后立刻生效，避免首次导航卡顿）。
 * - 若数据源未变更，会命中内部 cache，不会重复做重活。
 */
export async function rebuildRoadGraphCacheForWorld(worldId: string, eps: number = DEFAULT_EPS): Promise<void> {
  const roads = await loadRoadFeatures(worldId, {});
  if (!roads.length) return;
  const base = RULE_DATA_SOURCES[worldId];
  const ds: WorldRuleDataSource = {
    baseUrl: base?.baseUrl ?? '',
    files: base?.files ?? [],
  };
  // cache key 需与 computeRoadPlanFromCoords 一致（包含 eps + 临时挂载 hash）
  const enabledTemps = readTempSources(worldId).filter((t) => t.enabled);
  const tempRev = enabledTemps.length > 0 ? readTempSourcesRev() : '';
  const rawTemp = (() => {
    try {
      return JSON.stringify(enabledTemps.map((t) => ({ uid: t.uid, n: (t.items?.length ?? 0) })));
    } catch {
      return '';
    }
  })();
  const overrideIds = enabledTemps.length > 0 ? readTempOverrideIds(worldId) : new Set<string>();
  const rawOverride = enabledTemps.length > 0 ? JSON.stringify(Array.from(overrideIds).sort()) : '';
  const cacheKey = `road::${worldId}::${ds.baseUrl}::${(ds.files ?? []).join('|')}::temp=${hashString(rawTemp)}::rev=${tempRev}::ovr=${hashString(rawOverride)}::eps=${eps}`;
  const built = buildRoadGraph(roads, eps);
  built.key = cacheKey;
  ROAD_GRAPH_CACHE[cacheKey] = built;
}

// ------------------------------
// geometry: segment intersection
// ------------------------------

type Seg = {
  a: Coordinate;
  b: Coordinate;
  roadId: string;
  roadName: string;
  level: number;
  oneway: boolean;
  enter: boolean;
  exit?: boolean;
  selfJunction?: boolean;
  speed?: number;
};

function cross2(ax: number, az: number, bx: number, bz: number): number {
  return ax * bz - az * bx;
}

function segmentIntersection2D(s1: Seg, s2: Seg): Coordinate | null {
  // 只处理非平行相交；共线/重叠暂不打断（避免复杂度暴涨）
  const x1 = s1.a.x;
  const z1 = s1.a.z;
  const x2 = s1.b.x;
  const z2 = s1.b.z;
  const x3 = s2.a.x;
  const z3 = s2.a.z;
  const x4 = s2.b.x;
  const z4 = s2.b.z;

  const rX = x2 - x1;
  const rZ = z2 - z1;
  const sX = x4 - x3;
  const sZ = z4 - z3;

  const denom = cross2(rX, rZ, sX, sZ);
  if (Math.abs(denom) < 1e-9) return null; // 平行/共线

  const qpx = x3 - x1;
  const qpz = z3 - z1;
  const t = cross2(qpx, qpz, sX, sZ) / denom;
  const u = cross2(qpx, qpz, rX, rZ) / denom;

  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  const ix = x1 + t * rX;
  const iz = z1 + t * rZ;
  return { x: ix, z: iz, y: DEFAULT_Y };
}

function paramTOnSeg(s: Seg, p: Coordinate): number {
  const dx = s.b.x - s.a.x;
  const dz = s.b.z - s.a.z;
  const len2 = dx * dx + dz * dz;
  if (len2 <= 1e-9) return 0;
  const t = ((p.x - s.a.x) * dx + (p.z - s.a.z) * dz) / len2;
  return t;
}

// ------------------------------
// internal graph
// ------------------------------

type NodeId = string;

type Edge = {
  to: NodeId;
  distance: number;
  roadId: string;
  roadName: string;
  level: number;
  speed?: number;
  geom: [Coordinate, Coordinate];
  oneway: boolean;
  /** 是否可进入该路段（若 false，则起终点不允许在该段附近进/出） */
  enter: boolean;
  /** 是否可离开该路段（若 false，则终点不允许在该段附近进/出） */
  exit: boolean;
};

type RoadGraphCache = {
  key: string;
  eps: number;
  nodes: Map<NodeId, Coordinate>;
  edgesFrom: Map<NodeId, Edge[]>;
  // 用于 map matching
  segIndex: Array<{ a: Coordinate; b: Coordinate; n1: NodeId; n2: NodeId; edgeRef: Edge; level: number }>;
  builtAt: number;
};

const ROAD_GRAPH_CACHE: Record<string, RoadGraphCache | undefined> = {};

function cloneGraphForQuery(base: RoadGraphCache): RoadGraphCache {
  // 仅用于一次查询：避免把 __start__/__end__ 临时节点写入缓存图，导致距离/高亮累积失真。
  const nodes = new Map<NodeId, Coordinate>(base.nodes);
  const edgesFrom = new Map<NodeId, Edge[]>();
  for (const [k, arr] of base.edgesFrom.entries()) edgesFrom.set(k, arr.slice());
  return {
    ...base,
    nodes,
    edgesFrom,
    // segIndex 作为只读索引用于 map matching，可以复用引用（不修改）
    segIndex: base.segIndex,
  };
}

function addEdge(edgesFrom: Map<NodeId, Edge[]>, from: NodeId, e: Edge) {
  const arr = edgesFrom.get(from);
  if (arr) arr.push(e);
  else edgesFrom.set(from, [e]);
}

function buildRoadGraph(roads: RoadFeature[], eps: number): RoadGraphCache {
  // roadById：用于 Blacklist / ConnectL 指定目标查找（必须在任何使用前构建）
  const roadById = new Map<string, RoadFeature>();
  for (const r of roads) roadById.set(r.id, r);

  // Blacklist：仅在本要素未设置 ConnectL 时生效；双向对称：任一方拉黑则跳过候选
  // roadById 已在函数顶部构建（用于 Blacklist/ConnectL）
  const blacklistByRoad = new Map<string, Set<string>>();
  for (const r of roads) {
    const hasCL = Array.isArray(r.connectL) && r.connectL.length > 0;
    if (hasCL) continue;
    const bl = (r.blacklist ?? []).map((s) => String(s ?? '').trim()).filter((s) => !!s);
    if (bl.length) blacklistByRoad.set(r.id, new Set(bl));
  }
  const isPairBlacklisted = (aId: string, bId: string): boolean => {
    if (!aId || !bId || aId === bId) return false;
    const a = roadById.get(aId);
    const b = roadById.get(bId);
    if (!a || !b) return false;
    // 任一方存在 ConnectL，则该方 Blacklist 视为不存在
    const aHasCL = Array.isArray(a.connectL) && a.connectL.length > 0;
    const bHasCL = Array.isArray(b.connectL) && b.connectL.length > 0;
    const aBlocks = !aHasCL && (blacklistByRoad.get(aId)?.has(bId) ?? false);
    const bBlocks = !bHasCL && (blacklistByRoad.get(bId)?.has(aId) ?? false);
    return aBlocks || bBlocks;
  };
  let blSkipIntersection = 0;
  let blSkipEndpointLine = 0;
  let blSkipEndpointEndpoint = 0;
  const blSamples: string[] = [];
  const sampleSkip = (msg: string) => {
    if (!DEBUG_ROAD_NAV) return;
    if (blSamples.length < 20) blSamples.push(msg);
  };

  // 1) flatten segments by level
  const segs: Seg[] = [];
  // 用于“端点落在线中”抑制：记录 roadId-pair 的交叉节点（同 Level 的相交打断点）
  const interPtsByRoadPair = new Map<string, Coordinate[]>();
  for (const r of roads) {
    const pts = r.coords;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (!a || !b) continue;
      const d = dist2D(a, b);
      if (d <= 1e-6) continue;
      segs.push({ a, b, roadId: r.id, roadName: r.name, level: r.level, oneway: r.oneway, enter: r.enter, exit: r.exit, selfJunction: r.selfJunction, speed: r.speed });
    }
  }

  // 2) spatial hash for intersection (same level only)
  const cell = 64; // 构图用的粗网格（与 eps 无关）
  const buckets = new Map<string, number[]>();
  const keyCell = (lvl: number, cx: number, cz: number) => `${lvl}|${cx}|${cz}`;

  const segCells = (s: Seg) => {
    const minX = Math.min(s.a.x, s.b.x);
    const maxX = Math.max(s.a.x, s.b.x);
    const minZ = Math.min(s.a.z, s.b.z);
    const maxZ = Math.max(s.a.z, s.b.z);
    const x0 = Math.floor(minX / cell);
    const x1 = Math.floor(maxX / cell);
    const z0 = Math.floor(minZ / cell);
    const z1 = Math.floor(maxZ / cell);
    const out: string[] = [];
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        out.push(keyCell(s.level, cx, cz));
      }
    }
    return out;
  };

  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    for (const k of segCells(s)) {
      const arr = buckets.get(k);
      if (arr) arr.push(i);
      else buckets.set(k, [i]);
    }
  }

  // 3) collect split points per segment
  const splitPts: Coordinate[][] = Array.from({ length: segs.length }, () => []);
  for (let i = 0; i < segs.length; i++) {
    splitPts[i].push(segs[i].a, segs[i].b);
  }

  const seenPair = new Set<string>();
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    // same level only
    const cand = new Set<number>();
    for (const k of segCells(s)) {
      for (const j of buckets.get(k) ?? []) {
        if (j <= i) continue;
        cand.add(j);
      }
    }
    for (const j of cand) {
      const t = segs[j];
      if (t.level !== s.level) continue;
      if (isPairBlacklisted(s.roadId, t.roadId)) {
        blSkipIntersection++;
        sampleSkip(`intersection ${s.roadId} <-> ${t.roadId}`);
        continue;
      }
      // SelfJunction: 默认不允许自身自交建点
      if (s.roadId === t.roadId && !Boolean(s.selfJunction)) continue;
      const pk = i < j ? `${i}|${j}` : `${j}|${i}`;
      if (seenPair.has(pk)) continue;
      seenPair.add(pk);

      const ip = segmentIntersection2D(s, t);
      if (!ip) continue;

      // 忽略“几乎等于端点”的交点，避免产生极短边
      const closeTo = (p: Coordinate, q: Coordinate) => dist2D(p, q) <= eps;
      const sAdd = !closeTo(ip, s.a) && !closeTo(ip, s.b);
      const tAdd = !closeTo(ip, t.a) && !closeTo(ip, t.b);
      if (sAdd) splitPts[i].push(ip);
      if (tAdd) splitPts[j].push(ip);

      // 记录交叉点，用于后续“端点落在线中”抑制（避免在已存在交叉节点附近重复接入）
      if (sAdd || tAdd) {
        const aId = s.roadId;
        const bId = t.roadId;
        const k2 = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
        const arr = interPtsByRoadPair.get(k2);
        if (arr) arr.push(ip);
        else interPtsByRoadPair.set(k2, [ip]);
      }
    }
  }

  // 3.4) 显式 connector edge 记录（用于跨 Level 的端点连接 / ConnectL 连接）。
  // 说明：节点聚类按 Level 分层；跨层连通不能再依赖“坐标相同就合并节点”。
  // 因此我们把需要跨层连通的点对先记录下来，等 nodes/edgesFrom 建好后再补充一条连接边。
  const pendingConnectors: Array<{ a: Coordinate; levelA: number; b: Coordinate; levelB: number; ref: Seg; minLen?: number }> = [];
  const addConnectorEdgeLater = (a: Coordinate, levelA: number, b: Coordinate, levelB: number, ref: Seg, minLen?: number) => {
    pendingConnectors.push({ a, levelA, b, levelB, ref, minLen });
  };

  // 3.5) 端点落在线中：端点→垂足造节点（同 Level）
  // 说明：
  // - 该启发式仅在“端点距离其它道路线中 <= eps 且同 Level”时触发
  // - 投影点必须远离目标线段两端（绝对距离约束，避免长线段被 t 百分比误伤）
  // - 若端点附近已经存在与目标道路的交叉节点（<= ENDPOINT_TO_MIDDLE_SUPPRESS_R），则抑制
  // - 若端点方向与目标线段方向近似平行（|cos|>=ENDPOINT_TO_MIDDLE_PARALLEL_COS），则抑制（常见贴边辅路/并行线）
  type Endpoint = {
    p: Coordinate;
    dir: { x: number; z: number };
    roadId: string;
    roadName: string;
    level: number;
    oneway: boolean;
    enter: boolean;
    selfJunction: boolean;
    speed?: number;
  };
  const endpoints: Endpoint[] = [];
  for (const r of roads) {
    const pts = r.coords;
    if (!pts || pts.length < 2) continue;
    const p0 = pts[0];
    const p1 = pts[1];
    const pn = pts[pts.length - 1];
    const pn1 = pts[pts.length - 2];
    endpoints.push({
      p: p0,
      dir: norm2D({ x: p1.x - p0.x, z: p1.z - p0.z }),
      roadId: r.id,
      roadName: r.name,
      level: r.level,
      oneway: r.oneway,
      enter: r.enter,
      selfJunction: r.selfJunction,
      speed: r.speed,
    });
    endpoints.push({
      p: pn,
      dir: norm2D({ x: pn1.x - pn.x, z: pn1.z - pn.z }),
      roadId: r.id,
      roadName: r.name,
      level: r.level,
      oneway: r.oneway,
      enter: r.enter,
      selfJunction: r.selfJunction,
      speed: r.speed,
    });
  }

  // 3.45) 非 ConnectL 环境下的“端点对端点”跨层吸附
  // 目标：恢复历史行为——当两条道路端点在 eps 内，即便 Level 不同也视作连通（坡道/匝道接驳）。
  // 注意：仅限端点-端点；线中相交/线中吸附仍严格按 Level 分层，避免误连。
  const epBuckets = new Map<string, number[]>();
  const epGrid = (p: Coordinate) => ({ gx: Math.round(p.x / eps), gz: Math.round(p.z / eps) });
  const epKey = (gx: number, gz: number) => `${gx}|${gz}`;
  for (let i = 0; i < endpoints.length; i++) {
    const { gx, gz } = epGrid(endpoints[i].p);
    const k = epKey(gx, gz);
    const arr = epBuckets.get(k);
    if (arr) arr.push(i);
    else epBuckets.set(k, [i]);
  }
  const seenEpPair = new Set<string>();
  for (let i = 0; i < endpoints.length; i++) {
    const e1 = endpoints[i];
    // 仅关心跨 Level
    const { gx, gz } = epGrid(e1.p);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cand = epBuckets.get(epKey(gx + dx, gz + dz));
        if (!cand) continue;
        for (const j of cand) {
      if (j <= i) continue;
      const e2 = endpoints[j];
      if (e1.level === e2.level) continue;
      // 默认不允许同一要素自指端点连通（除非 SelfJunction=true）
      if (e1.roadId === e2.roadId && !(e1.selfJunction || e2.selfJunction)) continue;

      const pk = i < j ? `${i}|${j}` : `${j}|${i}`;
      if (seenEpPair.has(pk)) continue;
      seenEpPair.add(pk);

      const d = dist2D(e1.p, e2.p);
      if (d > eps) continue;

      if (isPairBlacklisted(e1.roadId, e2.roadId)) {
        blSkipEndpointEndpoint++;
        sampleSkip(`endpoint-endpoint ${e1.roadId} <-> ${e2.roadId}`);
        continue;
      }

      // 记录一个跨层 connector edge（双向，零距离/极短距离），用于让两层端点在图上连通。
      // ref 取 e1 所属道路即可（仅用于 UI/调试，不参与 Level 判断）。
      const ref: Seg = {
        a: e1.p,
        b: e2.p,
        roadId: e1.roadId,
        roadName: e1.roadName,
        level: e1.level,
        oneway: false,
        enter: true,
        exit: true,
      };
      addConnectorEdgeLater(e1.p, e1.level, e2.p, e2.level, ref, 1e-6);
        }
      }
    }
  }

  const endpointCell = (p: Coordinate) => ({ cx: Math.floor(p.x / cell), cz: Math.floor(p.z / cell) });
  const suppressNearExistingIntersection = (aId: string, bId: string, p: Coordinate) => {
    const k2 = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
    const arr = interPtsByRoadPair.get(k2);
    if (!arr || !arr.length) return false;
    for (const ip of arr) {
      if (dist2D(ip, p) <= ENDPOINT_TO_MIDDLE_SUPPRESS_R) return true;
    }
    return false;
  };

  for (const ep of endpoints) {
    // 在同 Level 的附近线段中找最近的“其它道路线段”
    const { cx, cz } = endpointCell(ep.p);
    let best: { idx: number; proj: Coordinate; dist: number } | null = null;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const k = keyCell(ep.level, cx + dx, cz + dz);
        const cand = buckets.get(k);
        if (!cand) continue;
        for (const j of cand) {
          const s = segs[j];
          if (s.level !== ep.level) continue;
          if (s.roadId === ep.roadId) continue;

          if (isPairBlacklisted(ep.roadId, s.roadId)) {
            blSkipEndpointLine++;
            sampleSkip(`endpoint-line ${ep.roadId} -> ${s.roadId}`);
            continue;
          }

          // 如果端点附近已存在与该目标道路的交叉节点，则抑制
          if (suppressNearExistingIntersection(ep.roadId, s.roadId, ep.p)) continue;

          const r = projectPointToSegment2D(ep.p, s.a, s.b);
          if (r.dist > eps) continue;

          // 投影点必须在线段“中段”（用绝对距离判断，避免超长线段的 t% 误伤）
          if (dist2D(r.proj, s.a) <= eps * 0.5) continue;
          if (dist2D(r.proj, s.b) <= eps * 0.5) continue;

          // 平行过滤：端点方向与目标线段方向若几乎平行，则跳过
          const sd = norm2D({ x: s.b.x - s.a.x, z: s.b.z - s.a.z });
          const cos = Math.abs(dot2D(ep.dir, sd));
          if (cos >= ENDPOINT_TO_MIDDLE_PARALLEL_COS) continue;

          if (!best || r.dist < best.dist) best = { idx: j, proj: r.proj, dist: r.dist };
        }
      }
    }

    if (!best) continue;

    // (1) 在目标线段上插入投影点，使其成为节点
    splitPts[best.idx].push(best.proj);

    // (2) 添加一条“连接段”把端点连到投影点（作为道路网络内部连接，不改变其它拓扑）
    const a = ep.p;
    const b = best.proj;
    const d = dist2D(a, b);
    if (d > 1e-6) {
      segs.push({
        a,
        b,
        roadId: ep.roadId,
        roadName: ep.roadName,
        level: ep.level,
        oneway: ep.oneway,
        enter: ep.enter,
        speed: ep.speed,
      });
      splitPts.push([a, b]);
    }
  }

  
  // 3.6) ConnectL 显式连接：endpoint / middle
  // 规则：
  // - 仅对 ConnectL 指定的目标道路生成候选
  // - 不检查 Level（一律仅看平面关系），以支持跨层立交/匝道明确指定
  // - 默认排除自指（tgt==src），除非 src.SelfJunction=true
  // - middle 同时支持：端点→线中（投影/垂足）与 线中↔线中（线段相交建点）

  const segIdxByRoad = new Map<string, number[]>();
  for (let i = 0; i < segs.length; i++) {
    const arr = segIdxByRoad.get(segs[i].roadId);
    if (arr) arr.push(i);
    else segIdxByRoad.set(segs[i].roadId, [i]);
  }

  // 说明：ConnectL 可能产生跨 Level 的连通，此时通过 pendingConnectors 记录并在构图末尾补充 connector edge。

  // endpoint-to-line projection helper (planar)
  const projectPointToSeg2D = (p: Coordinate, s: Seg) => {
    const ax = s.a.x, az = s.a.z;
    const bx = s.b.x, bz = s.b.z;
    const vx = bx - ax, vz = bz - az;
    const wx = p.x - ax, wz = p.z - az;
    const vv = vx * vx + vz * vz;
    if (vv <= 1e-9) return null;
    const t = (wx * vx + wz * vz) / vv;
    if (t < 0 || t > 1) return null;
    const px = ax + t * vx;
    const pz = az + t * vz;
    return { proj: { x: px, z: pz, y: DEFAULT_Y } as Coordinate, t };
  };

  for (const src of roads) {
    const links = src.connectL ?? [];
    if (!links.length) continue;

    for (const link of links) {
      const tgtId = link.tgt;
      const tgt = roadById.get(tgtId);
      if (!tgt) continue;

      const self = (tgtId === src.id);
      if (self && !src.selfJunction) continue;

      if (link.mode === 'endpoint') {
        // find closest endpoint pair
        const srcA = src.coords[0];
        const srcB = src.coords[src.coords.length - 1];
        const tgtA = tgt.coords[0];
        const tgtB = tgt.coords[tgt.coords.length - 1];
        const pairs: [Coordinate, Coordinate][] = [
          [srcA, tgtA],
          [srcA, tgtB],
          [srcB, tgtA],
          [srcB, tgtB],
        ];
        let best: { a: Coordinate; b: Coordinate; d: number } | null = null;
        for (const [a, b] of pairs) {
          const d = dist2D(a, b);
          if (d <= eps && (!best || d < best.d)) best = { a, b, d };
        }
        if (!best) continue;

        // connect by a short connector edge (跨 Level 时依然可连)
        const refSegIdx = (segIdxByRoad.get(src.id)?.[0] ?? segIdxByRoad.get(tgt.id)?.[0]);
        if (refSegIdx === undefined) continue;
        addConnectorEdgeLater(best.a, src.level, best.b, tgt.level, segs[refSegIdx]);
        continue;
      }

      if (link.mode === 'middle') {
        // (A) endpoint -> target middle (projection)
        const srcEndpoints: Coordinate[] = [src.coords[0], src.coords[src.coords.length - 1]];
        const tgtSegIdx = segIdxByRoad.get(tgt.id) ?? [];
        for (const ep of srcEndpoints) {
          let best: { idx: number; proj: Coordinate; dist: number } | null = null;
          for (const j of tgtSegIdx) {
            const pr = projectPointToSeg2D(ep, segs[j]);
            if (!pr) continue;
            const d = dist2D(ep, pr.proj);
            if (d <= eps && (!best || d < best.dist)) best = { idx: j, proj: pr.proj, dist: d };
          }
          if (best) {
            splitPts[best.idx].push(best.proj);
            // connector edge: from endpoint to proj（跨 Level 时依然可连）
            const refSegIdx = (segIdxByRoad.get(src.id)?.[0] ?? best.idx);
            if (refSegIdx !== undefined) addConnectorEdgeLater(ep, src.level, best.proj, segs[best.idx].level, segs[refSegIdx]);
          }
        }

        // (B) middle <-> middle intersection (segment intersection)
        const srcSegIdx = segIdxByRoad.get(src.id) ?? [];
        for (const i2 of srcSegIdx) {
          for (const j2 of tgtSegIdx) {
            // for self: avoid checking identical segment pair
            if (self && i2 === j2) continue;
            const ip = segmentIntersection2D(segs[i2], segs[j2]);
            if (!ip) continue;

            const closeTo = (p: Coordinate, q: Coordinate) => dist2D(p, q) <= eps;
            const sAdd = !closeTo(ip, segs[i2].a) && !closeTo(ip, segs[i2].b);
            const tAdd = !closeTo(ip, segs[j2].a) && !closeTo(ip, segs[j2].b);
            if (sAdd) splitPts[i2].push(ip);
            if (tAdd) splitPts[j2].push(ip);

            // 若两段 Level 不同，节点不会在聚类阶段合并；middle 模式期望“中段存在关系”，因此需要显式 connector。
            if (segs[i2].level !== segs[j2].level) {
              addConnectorEdgeLater(ip, segs[i2].level, ip, segs[j2].level, segs[i2], 0.01);
            }
          }
        }
      }
    }
  }

  // 4) node clustering by eps (按 Level 分层)
  const nodeRep = new Map<string, { sumX: number; sumZ: number; n: number; level: number }>();
  const nodeOfPoint = (p: Coordinate, level: number) => {
    const k = coordKey2D(p, eps, level);
    const r = nodeRep.get(k);
    if (r) {
      r.sumX += p.x;
      r.sumZ += p.z;
      r.n += 1;
    } else {
      nodeRep.set(k, { sumX: p.x, sumZ: p.z, n: 1, level });
    }
    return k;
  };

  // first pass: register all candidate points
  for (let i = 0; i < segs.length; i++) {
    const lvl = segs[i].level;
    for (const p of splitPts[i]) nodeOfPoint(p, lvl);
  }

  const nodes = new Map<NodeId, Coordinate>();
  for (const [k, r] of nodeRep.entries()) {
    const x = r.sumX / r.n;
    const z = r.sumZ / r.n;
    nodes.set(k, { x, z, y: DEFAULT_Y });
  }

  // 5) build edges (split each segment by sorted split points)
  const edgesFrom = new Map<NodeId, Edge[]>();
  const segIndex: RoadGraphCache['segIndex'] = [];

  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const pts = splitPts[i]
      .map((p) => ({ p, t: paramTOnSeg(s, p) }))
      .filter((it) => Number.isFinite(it.t))
      .sort((a, b) => a.t - b.t);

    // 去重：按 eps
    const uniq: Coordinate[] = [];
    for (const it of pts) {
      const p = it.p;
      if (!uniq.length) {
        uniq.push(p);
        continue;
      }
      if (dist2D(uniq[uniq.length - 1], p) > eps * 0.5) uniq.push(p);
    }
    if (uniq.length < 2) continue;

    for (let k = 1; k < uniq.length; k++) {
      const a = uniq[k - 1];
      const b = uniq[k];
      const d = dist2D(a, b);
      if (d <= 1e-6) continue;
      const n1 = coordKey2D(a, eps, s.level);
      const n2 = coordKey2D(b, eps, s.level);
      const e: Edge = {
        to: n2,
        distance: d,
        roadId: s.roadId,
        roadName: s.roadName,
        level: s.level,
        speed: s.speed,
        geom: [nodes.get(n1) ?? normCoord(a), nodes.get(n2) ?? normCoord(b)],
        oneway: s.oneway,
        enter: s.enter,
        exit: typeof s.exit === 'boolean' ? s.exit : true,
      };
      addEdge(edgesFrom, n1, e);
      // 双向：若 oneway=false
      if (!s.oneway) {
        const er: Edge = { ...e, to: n1, geom: [e.geom[1], e.geom[0]] };
        addEdge(edgesFrom, n2, er);
      }

      // 记录用于 nearest-edge（仅记录一份代表即可）
      segIndex.push({ a: e.geom[0], b: e.geom[1], n1, n2, edgeRef: e, level: s.level });
    }
  }

  // 5.5) apply pending connector edges (for ConnectL cross-level connectivity)
  for (const c of pendingConnectors) {
    const nA = coordKey2D(c.a, eps, c.levelA);
    const nB = coordKey2D(c.b, eps, c.levelB);
    if (!nodes.has(nA) || !nodes.has(nB)) continue;
    const rawD = dist2D(c.a, c.b);
    const d = Math.max(c.minLen ?? 0, rawD);
    const e: Edge = {
      to: nB,
      distance: d,
      roadId: c.ref.roadId,
      roadName: c.ref.roadName,
      level: c.ref.level,
      speed: c.ref.speed,
      geom: [nodes.get(nA)!, nodes.get(nB)!],
      // connector 视为双向连接（不受 oneway 影响）
      oneway: false,
      enter: true,
      exit: true,
    };
    addEdge(edgesFrom, nA, e);
    addEdge(edgesFrom, nB, { ...e, to: nA, geom: [e.geom[1], e.geom[0]] });
  }

  if (DEBUG_ROAD_NAV && (blSkipIntersection || blSkipEndpointLine || blSkipEndpointEndpoint)) {
    dbg('Blacklist skips', {
      intersection: blSkipIntersection,
      endpointLine: blSkipEndpointLine,
      endpointEndpoint: blSkipEndpointEndpoint,
    });
    for (const s of blSamples) dbg('Blacklist sample', s);
  }

  return {
    key: '',
    eps,
    nodes,
    edgesFrom,
    segIndex,
    builtAt: Date.now(),
  };
}

// ------------------------------
// dijkstra
// ------------------------------

class MinHeap<T> {
  private arr: Array<{ k: number; v: T }> = [];
  get size() {
    return this.arr.length;
  }
  push(key: number, value: T) {
    const a = this.arr;
    a.push({ k: key, v: value });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].k <= a[i].k) break;
      const tmp = a[p];
      a[p] = a[i];
      a[i] = tmp;
      i = p;
    }
  }
  pop(): { k: number; v: T } | undefined {
    const a = this.arr;
    if (!a.length) return;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      while (true) {
        const l = i * 2 + 1;
        const r = l + 1;
        let s = i;
        if (l < a.length && a[l].k < a[s].k) s = l;
        if (r < a.length && a[r].k < a[s].k) s = r;
        if (s === i) break;
        const tmp = a[s];
        a[s] = a[i];
        a[i] = tmp;
        i = s;
      }
    }
    return top;
  }
}

function dijkstra(args: {
  graph: RoadGraphCache;
  start: NodeId;
  goal: NodeId;
  defaultSpeed: number;
}): { ok: boolean; dist: number; prev: Map<NodeId, { from: NodeId; edge: Edge }> } {
  const { graph, start, goal, defaultSpeed } = args;
  const dist = new Map<NodeId, number>();
  const prev = new Map<NodeId, { from: NodeId; edge: Edge }>();
  const heap = new MinHeap<NodeId>();
  dist.set(start, 0);
  heap.push(0, start);

  while (heap.size) {
    const cur = heap.pop()!;
    const u = cur.v;
    const du = cur.k;
    if (du !== (dist.get(u) ?? Infinity)) continue;
    if (u === goal) return { ok: true, dist: du, prev };
    const edges = graph.edgesFrom.get(u) ?? [];
    for (const e of edges) {
      const sp = Number.isFinite(Number(e.speed)) ? Number(e.speed) : defaultSpeed;
      const w = e.distance / Math.max(1e-6, sp);
      const nd = du + w;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, { from: u, edge: e });
        heap.push(nd, e.to);
      }
    }
  }
  return { ok: false, dist: Infinity, prev };
}

// ------------------------------
// nearest edge (map matching)
// ------------------------------

function projectPointToSegment2D(p: Coordinate, a: Coordinate, b: Coordinate): { proj: Coordinate; t: number; dist: number } {
  const px = p.x;
  const pz = p.z;
  const ax = a.x;
  const az = a.z;
  const bx = b.x;
  const bz = b.z;
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  if (len2 <= 1e-9) {
    return { proj: { x: ax, z: az, y: DEFAULT_Y }, t: 0, dist: Math.hypot(px - ax, pz - az) };
  }
  let t = ((px - ax) * vx + (pz - az) * vz) / len2;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * vx;
  const z = az + t * vz;
  const d = Math.hypot(px - x, pz - z);
  return { proj: { x, z, y: DEFAULT_Y }, t, dist: d };
}

// raw 投影：不 clamp t，用于判定“线外垂足”
function projectPointToSegment2D_Raw(p: Coordinate, a: Coordinate, b: Coordinate): { proj: Coordinate; t: number; dist: number } {
  const px = p.x;
  const pz = p.z;
  const ax = a.x;
  const az = a.z;
  const bx = b.x;
  const bz = b.z;
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  if (len2 <= 1e-9) {
    return { proj: { x: ax, z: az, y: DEFAULT_Y }, t: 0, dist: Math.hypot(px - ax, pz - az) };
  }
  const t = ((px - ax) * vx + (pz - az) * vz) / len2; // 不 clamp
  const x = ax + t * vx;
  const z = az + t * vz;
  const d = Math.hypot(px - x, pz - z);
  return { proj: { x, z, y: DEFAULT_Y }, t, dist: d };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function findNearestEdge(
  graph: RoadGraphCache,
  p: Coordinate,
  opt: { forEnd: boolean }
): { seg: RoadGraphCache['segIndex'][number]; proj: Coordinate } | null {
  // 简化：线性扫描（后续如规模变大再加空间索引）
  // 说明：道路数据现阶段通常远小于铁路平台/线路节点规模，且 road 构图已做大量预处理。
  let best: { seg: any; proj: Coordinate; d: number } | null = null;
  for (const s of graph.segIndex) {
    // Enter/Exit 仅影响起终点“接驳”选择（乘降/上下车），不阻断道路内部连通。
    const enterOk = (s.edgeRef as any)?.enter !== false;
    const exitOk = (s.edgeRef as any)?.exit !== false;
    if (!opt.forEnd && !enterOk) continue;
    if (opt.forEnd && !exitOk) continue;
    const r = projectPointToSegment2D(p, s.a, s.b);
    if (!best || r.dist < best.d) best = { seg: s, proj: r.proj, d: r.dist };
  }
  return best ? { seg: best.seg, proj: best.proj } : null;
}



type MatchCand = {
  seg: RoadGraphCache['segIndex'][number];
  entry: Coordinate;      // 最终进入/离开点（垂足或端点）
  tRaw: number;           // raw t（用于 debug/端点判定）
  accessDist: number;     // start/end 到 entry 的距离（只算这一段）
  roadId: string;
  level: number;
  endpointLike: boolean;  // entry 是否在端点附近
};

function findNearestCandidates(
  graph: RoadGraphCache,
  p: Coordinate,
  opt: { forEnd: boolean; k: number }
): MatchCand[] {
  // 每条 road 只留一个最优候选（避免 Top-K 都落在同一条 road 的多个小段上）
  const bestByRoad = new Map<string, MatchCand>();

  for (const s of graph.segIndex) {
    const eRef = s.edgeRef as any;

    // Enter/Exit 仅影响起终点接驳选择（乘降/上下车），不阻断道路内部连通
    const enterOk = eRef?.enter !== false;
    const exitOk = eRef?.exit !== false;
    if (!opt.forEnd && !enterOk) continue;
    if (opt.forEnd && !exitOk) continue;

    const a = s.a as Coordinate;
    const b = s.b as Coordinate;

    // raw 投影：判定是否线外
    const r = projectPointToSegment2D_Raw(p, a, b);

    let entry: Coordinate;
    let tUsed = r.t;

    if (r.t < 0) {
      entry = a;
      tUsed = 0;
    } else if (r.t > 1) {
      entry = b;
      tUsed = 1;
    } else {
      entry = { x: r.proj.x, z: r.proj.z, y: DEFAULT_Y };
    }

    const accessDist = dist2D(p, entry);
    const roadId = String(eRef?.roadId ?? '');
    if (!roadId) continue;

    const level = Number.isFinite(Number(eRef?.level)) ? Number(eRef.level) : 0;
    const endpointLike = tUsed < ENDPOINT_T || tUsed > 1 - ENDPOINT_T;

    const cand: MatchCand = {
      seg: s,
      entry,
      tRaw: r.t,
      accessDist,
      roadId,
      level,
      endpointLike,
    };

    const prev = bestByRoad.get(roadId);
    if (!prev || cand.accessDist < prev.accessDist) bestByRoad.set(roadId, cand);
  }

  const arr = Array.from(bestByRoad.values());
  arr.sort((x, y) => x.accessDist - y.accessDist);
  const out = arr.slice(0, opt.k);

  if (DEBUG_ROAD_NAV) {
    dbg(opt.forEnd ? 'END candidates' : 'START candidates');
    out.forEach((c, i) => dbg(i, c.roadId, 'lvl', c.level, 'd', c.accessDist.toFixed(2), 'tRaw', c.tRaw.toFixed(3), 'endpoint', c.endpointLike));
  }

  return out;
}

// ------------------------------
// instructions
// ------------------------------

function angleTurn(v1: { x: number; z: number }, v2: { x: number; z: number }): number {
  const dot = v1.x * v2.x + v1.z * v2.z;
  const det = v1.x * v2.z - v1.z * v2.x;
  return -Math.atan2(det, dot) * (180 / Math.PI);
}

function classifyTurn(thetaDeg: number): RoadTurnAction {
  const a = thetaDeg;
  const abs = Math.abs(a);
  if (abs < 15) return 'continue';
  if (abs < 45) return a > 0 ? 'slight_left' : 'slight_right';
  if (abs < 135) return a > 0 ? 'left' : 'right';
  return 'uturn';
}

function buildInstructions(args: {
  edgePath: Edge[];
  defaultSpeed: number;
}): RoadTurnInstruction[] {
  const { edgePath, defaultSpeed } = args;
  if (!edgePath.length) return [];

  // 说明：面板中每条指令卡片展示的是「执行该动作后，沿某条路前进的距离/时间」。
  // 因此这里采用“段（leg）”模型：
  // - start 指令对应第 1 段
  // - 每次在路口发生显著转向/路名变化时：先结算上一段到当前路口的里程，再开启下一段（该段由该路口的转向动作标注）
  // - arrive 指令不累计距离（到达本身）

  const ins: RoadTurnInstruction[] = [];

  const first = edgePath[0];
  let curInst: RoadTurnInstruction = {
    action: 'start',
    roadName: first.roadName || '道路',
    distance: 0,
    timeSeconds: 0,
    at: first.geom[0],
  };
  ins.push(curInst);

  const vecOf = (e: Edge) => ({ x: e.geom[1].x - e.geom[0].x, z: e.geom[1].z - e.geom[0].z });

  for (let i = 0; i < edgePath.length; i++) {
    const e = edgePath[i];
    const sp = Number.isFinite(Number(e.speed)) ? Number(e.speed) : defaultSpeed;
    const t = e.distance / Math.max(1e-6, sp);

    // 当前段累计（该段由 curInst 标注）
    curInst.distance += e.distance;
    curInst.timeSeconds += t;

    if (i === edgePath.length - 1) break;

    const eNext = edgePath[i + 1];
    const v1 = vecOf(e);
    const v2 = vecOf(eNext);
    const theta = angleTurn(v1, v2);
    let action = classifyTurn(theta);

    // 同一条道路（同 roadId）内部的小角度折线：视为 continue，不生成额外提示
    if (e.roadId === eNext.roadId && Math.abs(theta) < 60) {
      action = 'continue';
    }

    const nextRoad = eNext.roadName || '道路';
    const curRoad = curInst.roadName || '道路';

    // 触发条件：显著转向 或 路名变化
    const need = action !== 'continue' || nextRoad !== curRoad;
    if (!need) continue;

    // 在路口开启下一段；如果仅路名变化且角度不大，动作标记为 continue
    if (action === 'continue' && nextRoad !== curRoad) action = 'continue';

    curInst = {
      action,
      roadName: nextRoad,
      distance: 0,
      timeSeconds: 0,
      at: e.geom[1],
    };
    ins.push(curInst);
  }

  // 到达：不累计距离（上一段已经累计到终点）
  ins.push({
    action: 'arrive',
    roadName: ins[ins.length - 1]?.roadName || '道路',
    distance: 0,
    timeSeconds: 0,
    at: edgePath[edgePath.length - 1].geom[1],
  });

  return ins;
}

// ------------------------------
// main compute
// ------------------------------

export async function computeRoadPlanFromCoords(opt: NavigationRoadComputeOptions): Promise<NavRoadPlan> {
  const worldId = opt.worldId;
  const start = normCoord(opt.startCoord);
  const end = normCoord(opt.endCoord);
  const eps = Number.isFinite(Number(opt.eps)) ? Number(opt.eps) : DEFAULT_EPS;
  const defaultSpeed = Math.max(1e-6, Number(opt.defaultSpeed));
  const useElytra = !!opt.useElytra;
  const elytraSpeed = Math.max(1e-6, Number.isFinite(Number(opt.elytraSpeed)) ? Number(opt.elytraSpeed) : 40);
  const elytraThreshold = Math.max(0, Number.isFinite(Number(opt.elytraThreshold)) ? Number(opt.elytraThreshold) : 50);

  // 1) load roads
  const roads = await loadRoadFeatures(worldId, {
    dataSourceOverride: opt.dataSourceOverride,
    filesOverride: opt.filesOverride,
    fetcher: opt.fetcher,
  });
  if (!roads.length) {
    return {
      ok: false,
      reason: '未加载到道路数据（Class=ROD）',
      worldId,
      profileName: '',
      profileSpeed: defaultSpeed,
      totalDistance: 0,
      totalTimeSeconds: 0,
      instructions: [],
      segments: [],
      routeHighlight: { styledSegments: [] },
    };
  }

  // 2) build/cached graph
  const base = RULE_DATA_SOURCES[worldId];
  const ds: WorldRuleDataSource = {
    baseUrl: opt.dataSourceOverride?.baseUrl ?? base?.baseUrl ?? '',
    files: opt.filesOverride ?? opt.dataSourceOverride?.files ?? base?.files ?? [],
  };
  // 将临时挂载/覆盖屏蔽纳入 road graph cache key
  const enabledTemps = readTempSources(worldId).filter((t) => t.enabled);
  const tempRev = enabledTemps.length > 0 ? readTempSourcesRev() : '';
  const rawTemp = (() => {
    try {
      return JSON.stringify(enabledTemps.map((t) => ({ uid: t.uid, n: (t.items?.length ?? 0) })));
    } catch {
      return '';
    }
  })();
  const overrideIds = enabledTemps.length > 0 ? readTempOverrideIds(worldId) : new Set<string>();
  const rawOverride = enabledTemps.length > 0 ? JSON.stringify(Array.from(overrideIds).sort()) : '';
  const cacheKey = `road::${worldId}::${ds.baseUrl}::${(ds.files ?? []).join('|')}::temp=${hashString(rawTemp)}::rev=${tempRev}::ovr=${hashString(rawOverride)}::eps=${eps}`;
  let g = ROAD_GRAPH_CACHE[cacheKey];
  if (!g) {
    const built = buildRoadGraph(roads, eps);
    built.key = cacheKey;
    ROAD_GRAPH_CACHE[cacheKey] = built;
    g = built;
  }


  // 3) map matching: Top-K candidates (per road) + 3x3 Dijkstra evaluation
  const startCands = findNearestCandidates(g, start, { forEnd: false, k: CAND_K });
  const endCands = findNearestCandidates(g, end, { forEnd: true, k: CAND_K });
  if (!startCands.length || !endCands.length) {
    return {
      ok: false,
      reason: '道路图为空或无法匹配到最近道路边（可能 Enter/Exit 全部阻断）',
      worldId,
      profileName: '',
      profileSpeed: defaultSpeed,
      totalDistance: 0,
      totalTimeSeconds: 0,
      instructions: [],
      segments: [],
      routeHighlight: { styledSegments: [] },
    };
  }

  const sPref = Number.isFinite(Number(opt.startLevelPref)) ? Number(opt.startLevelPref) : 0;
  const ePref = Number.isFinite(Number(opt.endLevelPref)) ? Number(opt.endLevelPref) : 0;
  const applyLevelFactor = (baseScore: number, sLevel: number, eLevel: number) => {
    const diffSum = Math.abs(sPref - sLevel) + Math.abs(ePref - eLevel);
    const factor = Math.max(0.1, 1 - LEVEL_BIAS_PER_LEVEL * diffSum); // LEVEL_BIAS_PER_LEVEL=-0.05 -> 1+0.05*diff
    return baseScore * factor;
  };

  const accessTimeScore = (d: number) => d / Math.max(1e-6, ACCESS_SCORE_SPEED);

  const insertPointAsNodeOnSeg = (qg: RoadGraphCache, nodeId: NodeId, p: Coordinate, seg: any, role: 'start' | 'end') => {
    const n1 = seg.n1 as NodeId;
    const n2 = seg.n2 as NodeId;
    const a = seg.a as Coordinate;
    const b = seg.b as Coordinate;
    const eRef = seg.edgeRef as Edge;

    qg.nodes.set(nodeId, p);

    const d1 = dist2D(a, p);
    const d2 = dist2D(p, b);

    const add = (from: NodeId, to: NodeId, dist: number, geom: [Coordinate, Coordinate]) => {
      addEdge(qg.edgesFrom, from, {
        to,
        distance: dist,
        roadId: eRef.roadId,
        roadName: eRef.roadName,
        level: eRef.level,
        speed: eRef.speed,
        geom,
        oneway: eRef.oneway,
        enter: eRef.enter,
        exit: eRef.exit,
      });
    };

    if (eRef.oneway) {
      // 单行：仅顺向（n1 -> node -> n2）
      add(n1, nodeId, d1, [a, p]);
      add(nodeId, n2, d2, [p, b]);
    } else {
      add(n1, nodeId, d1, [a, p]);
      add(nodeId, n2, d2, [p, b]);
      add(n2, nodeId, d2, [b, p]);
      add(nodeId, n1, d1, [p, a]);
    }

    if (DEBUG_ROAD_NAV) dbg('insert node', role, nodeId, 'road', eRef.roadId, 'oneway', eRef.oneway, 'd1', d1.toFixed(2), 'd2', d2.toFixed(2));
  };

  type EvalRes = {
    ok: boolean;
    score: number;
    edgePath: Edge[];
    totalTime: number;
    totalDist: number;
    sCand: MatchCand;
    eCand: MatchCand;
  };

  const evalOne = (sCand: MatchCand, eCand: MatchCand): EvalRes => {
    const qg = cloneGraphForQuery(g);

    const startNode: NodeId = `__start__`;
    const endNode: NodeId = `__end__`;

    insertPointAsNodeOnSeg(qg, startNode, sCand.entry, sCand.seg, 'start');
    insertPointAsNodeOnSeg(qg, endNode, eCand.entry, eCand.seg, 'end');

    // 同段直连特例：respect oneway
    try {
      const sA: any = sCand.seg as any;
      const sB: any = eCand.seg as any;
      if (sA && sB && sA.n1 === sB.n1 && sA.n2 === sB.n2) {
        const eRef = (sA.edgeRef as Edge) ?? (sB.edgeRef as Edge);
        if (eRef) {
          const d = dist2D(sCand.entry, eCand.entry);
          if (d > 1e-6) {
            const mk = (to: NodeId, geom: [Coordinate, Coordinate], oneway: boolean): Edge => ({
              to,
              distance: d,
              roadId: eRef.roadId,
              roadName: eRef.roadName,
              level: eRef.level,
              speed: eRef.speed,
              geom,
              oneway,
              enter: true,
              exit: true,
            });

            if (!eRef.oneway) {
              addEdge(qg.edgesFrom, startNode, mk(endNode, [sCand.entry, eCand.entry], false));
              addEdge(qg.edgesFrom, endNode, mk(startNode, [eCand.entry, sCand.entry], false));
            } else {
              // 单行：仅顺向（a->b）
              const rrS = projectPointToSegment2D_Raw(sCand.entry, sA.a, sA.b);
              const rrE = projectPointToSegment2D_Raw(eCand.entry, sA.a, sA.b);
              if (rrS.t <= rrE.t) {
                addEdge(qg.edgesFrom, startNode, mk(endNode, [sCand.entry, eCand.entry], true));
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }

    const dj = dijkstra({ graph: qg, start: startNode, goal: endNode, defaultSpeed });
    if (!dj.ok) return { ok: false, score: Infinity, edgePath: [], totalTime: Infinity, totalDist: Infinity, sCand, eCand };

    const edgePath: Edge[] = [];
    let cur: NodeId = endNode;
    while (cur !== startNode) {
      const p = dj.prev.get(cur);
      if (!p) break;
      edgePath.push(p.edge);
      cur = p.from;
    }
    edgePath.reverse();
    if (!edgePath.length) return { ok: false, score: Infinity, edgePath: [], totalTime: Infinity, totalDist: Infinity, sCand, eCand };

    const totalTime = dj.dist;
    const totalDist = edgePath.reduce((acc, e) => acc + e.distance, 0);

    // 择优 score：接驳段按固定速度换算 time（不受步行/鞘翅影响），并乘惩罚权重
    const accScore = accessTimeScore(sCand.accessDist) + accessTimeScore(eCand.accessDist);
    const endpointPenalty = (sCand.endpointLike ? ENDPOINT_PENALTY : 0) + (eCand.endpointLike ? ENDPOINT_PENALTY : 0);
    let score = totalTime + ACCESS_SCORE_WEIGHT * accScore + endpointPenalty;
    score = applyLevelFactor(score, sCand.level, eCand.level);

    if (DEBUG_ROAD_NAV) dbg('eval', sCand.roadId, '->', eCand.roadId, 't', totalTime.toFixed(2), 'acc', accScore.toFixed(2), 'pen', endpointPenalty, 'score', score.toFixed(2));

    return { ok: true, score, edgePath, totalTime, totalDist, sCand, eCand };
  };

  let best: EvalRes | null = null;
  for (const sCand of startCands) {
    for (const eCand of endCands) {
      const r = evalOne(sCand, eCand);
      if (!r.ok) continue;
      if (!best || r.score < best.score) best = r;
    }
  }

  if (!best) {
    return {
      ok: false,
      reason: '道路网络不可达（可能起终点处于不同断网区域/不同层级且无连接）',
      worldId,
      profileName: '',
      profileSpeed: defaultSpeed,
      totalDistance: 0,
      totalTimeSeconds: 0,
      instructions: [],
      segments: [],
      routeHighlight: { styledSegments: [] },
    };
  }

  const startProj = best.sCand.entry;
  const endProj = best.eCand.entry;
  const edgePath = best.edgePath;


  // 6) build segments + highlight
  const segments: RoadSegment[] = [];
  let totalDist = 0;
  let totalTime = 0;

  let startAccessMode: 'walk' | 'elytra' | null = null;
  let endAccessMode: 'walk' | 'elytra' | null = null;

  // access: startCoord -> startProj / endProj -> endCoord
  const accessStartDist = dist2D(start, startProj);
  if (accessStartDist > 1e-6) {
    const mode: 'walk' | 'elytra' = (useElytra && accessStartDist > elytraThreshold) ? 'elytra' : 'walk';
    startAccessMode = mode;
    const sp = mode === 'elytra' ? elytraSpeed : defaultSpeed;
    const t = accessStartDist / sp;
    segments.push({ kind: 'access', accessMode: mode, from: start, to: startProj, coords: [start, startProj], distance: accessStartDist, timeSeconds: t });
    totalDist += accessStartDist;
    totalTime += t;
  }

  // road edges
  for (const e of edgePath) {
    const sp = Number.isFinite(Number(e.speed)) ? Number(e.speed) : defaultSpeed;
    const t = e.distance / Math.max(1e-6, sp);
    segments.push({
      kind: 'road',
      from: e.geom[0],
      to: e.geom[1],
      coords: [e.geom[0], e.geom[1]],
      distance: e.distance,
      timeSeconds: t,
      roadId: e.roadId,
      roadName: e.roadName,
      level: e.level,
    });
    totalDist += e.distance;
    totalTime += t;
  }

  const accessEndDist = dist2D(endProj, end);
  if (accessEndDist > 1e-6) {
    const mode: 'walk' | 'elytra' = (useElytra && accessEndDist > elytraThreshold) ? 'elytra' : 'walk';
    endAccessMode = mode;
    const sp = mode === 'elytra' ? elytraSpeed : defaultSpeed;
    const t = accessEndDist / sp;
    segments.push({ kind: 'access', accessMode: mode, from: endProj, to: end, coords: [endProj, end], distance: accessEndDist, timeSeconds: t });
    totalDist += accessEndDist;
    totalTime += t;
  }

  // highlight segments
  const styledSegments: RouteStyledSegment[] = [];
  const roadCoords: Coordinate[] = [];
  for (const s of segments) {
    if (s.kind === 'road') {
      if (!roadCoords.length) roadCoords.push(...s.coords);
      else roadCoords.push(s.coords[1]);
    }
  }
  if (roadCoords.length >= 2) {
    styledSegments.push({ kind: 'generic', coords: roadCoords, color: '#FF9800', dashed: false, tooltip: '道路路线' });
  }
  if (accessStartDist > 1e-6) styledSegments.push({ kind: 'access', coords: [start, startProj], color: '#9E9E9E', dashed: true, tooltip: startAccessMode === 'elytra' ? '鞘翅接驳至道路' : '步行接驳至道路' });
  if (accessEndDist > 1e-6) styledSegments.push({ kind: 'access', coords: [endProj, end], color: '#9E9E9E', dashed: true, tooltip: endAccessMode === 'elytra' ? '鞘翅从道路接驳' : '步行从道路接驳' });

  const stationMarkers: RouteStationMarker[] = [
    { coord: start, kind: 'start', label: '起点', color: '#4CAF50' },
    { coord: end, kind: 'end', label: '终点', color: '#F44336' },
  ];

  const instructions = buildInstructions({ edgePath, defaultSpeed });

  const routeHighlight: RouteHighlightData = {
    styledSegments,
    stationMarkers,
    startCoord: start,
    endCoord: end,
    startLabel: '起点',
    endLabel: '终点',
  };

  return {
    ok: true,
    worldId,
    profileName: '',
    profileSpeed: defaultSpeed,
    totalDistance: totalDist,
    totalTimeSeconds: totalTime,
    instructions,
    segments,
    routeHighlight,
  };
}
