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


function normCoord(c: Coordinate): Coordinate {
  return { x: Number(c.x), z: Number(c.z), y: Number.isFinite(c.y as any) ? (c.y as number) : DEFAULT_Y };
}

function dist2D(a: Coordinate, b: Coordinate): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function coordKey2D(c: Coordinate, eps: number): string {
  // 以 eps 网格做近似聚类；【端点连接】不考虑 Level，以支持不同 Level 的端点相连（坡道/匝道/立交连接）。
  const gx = Math.round(c.x / eps);
  const gz = Math.round(c.z / eps);
  return `${gx}|${gz}`;
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

type RoadFeature = {
  id: string;
  name: string;
  level: number;
  oneway: boolean;
  speed?: number;
  coords: Coordinate[];
};

const ROD_CACHE: Record<string, { key: string; roads: RoadFeature[]; loadedAt: number }> = {};

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

  const key = `${ds.baseUrl}::${(ds.files ?? []).join('|')}`;
  const cached = ROD_CACHE[worldId];
  if (cached && cached.key === key && Array.isArray(cached.roads)) return cached.roads;

  const out: RoadFeature[] = [];
  for (const f of ds.files ?? []) {
    const url = `${ds.baseUrl}/${f}`;
    let arr: any[] = [];
    try {
      arr = await fetchJsonArray(url, opt.fetcher);
    } catch {
      continue;
    }
    for (const it of arr) {
      const Class = String(it?.Class ?? '').trim().toUpperCase();
      if (Class !== 'ROD') continue;
      const id = String(it?.ID ?? '').trim();
      const name = String(it?.Name ?? '').trim() || '道路';
      const level = Number.isFinite(Number(it?.Level)) ? Number(it.Level) : 0;
      const oneway = Boolean(it?.Oneway);
      const speed = Number.isFinite(Number(it?.Speed)) ? Number(it.Speed) : undefined;

      const lp = it?.Linepoints;
      if (!Array.isArray(lp) || lp.length < 2) continue;
      const coords = lp
        .map((p: any) => {
          const x = Number(p?.[0]);
          const y = Number(p?.[1]);
          const z = Number(p?.[2]);
          if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
          return { x, z, y: Number.isFinite(y) ? y : -64 } as Coordinate;
        })
        .filter(Boolean) as Coordinate[];
      if (coords.length < 2) continue;

      out.push({ id, name, level, oneway, speed, coords });
    }
  }

  ROD_CACHE[worldId] = { key, roads: out, loadedAt: Date.now() };
  return out;
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
  // 1) flatten segments by level
  const segs: Seg[] = [];
  for (const r of roads) {
    const pts = r.coords;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (!a || !b) continue;
      const d = dist2D(a, b);
      if (d <= 1e-6) continue;
      segs.push({ a, b, roadId: r.id, roadName: r.name, level: r.level, oneway: r.oneway, speed: r.speed });
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
      const pk = i < j ? `${i}|${j}` : `${j}|${i}`;
      if (seenPair.has(pk)) continue;
      seenPair.add(pk);

      const ip = segmentIntersection2D(s, t);
      if (!ip) continue;

      // 忽略“几乎等于端点”的交点，避免产生极短边
      const closeTo = (p: Coordinate, q: Coordinate) => dist2D(p, q) <= eps;
      if (!closeTo(ip, s.a) && !closeTo(ip, s.b)) splitPts[i].push(ip);
      if (!closeTo(ip, t.a) && !closeTo(ip, t.b)) splitPts[j].push(ip);
    }
  }

  // 4) node clustering by eps (ignore Level for endpoint connectivity)
  const nodeRep = new Map<string, { sumX: number; sumZ: number; n: number; level: number }>();
  const nodeOfPoint = (p: Coordinate, level: number) => {
    const k = coordKey2D(p, eps);
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
      const n1 = coordKey2D(a, eps);
      const n2 = coordKey2D(b, eps);
      const e: Edge = {
        to: n2,
        distance: d,
        roadId: s.roadId,
        roadName: s.roadName,
        level: s.level,
        speed: s.speed,
        geom: [nodes.get(n1) ?? normCoord(a), nodes.get(n2) ?? normCoord(b)],
        oneway: s.oneway,
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

function findNearestEdge(graph: RoadGraphCache, p: Coordinate): { seg: RoadGraphCache['segIndex'][number]; proj: Coordinate } | null {
  // 简化：线性扫描（后续如规模变大再加空间索引）
  // 说明：道路数据现阶段通常远小于铁路平台/线路节点规模，且 road 构图已做大量预处理。
  let best: { seg: any; proj: Coordinate; d: number } | null = null;
  for (const s of graph.segIndex) {
    const r = projectPointToSegment2D(p, s.a, s.b);
    if (!best || r.dist < best.d) best = { seg: s, proj: r.proj, d: r.dist };
  }
  return best ? { seg: best.seg, proj: best.proj } : null;
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
  const cacheKey = `road::${worldId}::${ds.baseUrl}::${(ds.files ?? []).join('|')}::eps=${eps}`;
  let g = ROAD_GRAPH_CACHE[cacheKey];
  if (!g) {
    const built = buildRoadGraph(roads, eps);
    built.key = cacheKey;
    ROAD_GRAPH_CACHE[cacheKey] = built;
    g = built;
  }

  // 3) map matching: connect start/end to nearest edge
  const nStart = findNearestEdge(g, start);
  const nEnd = findNearestEdge(g, end);
  if (!nStart || !nEnd) {
    return {
      ok: false,
      reason: '道路图为空或无法匹配到最近道路边',
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

  const qg = cloneGraphForQuery(g);

  const startProj = nStart.proj;
  const endProj = nEnd.proj;

  const startNode: NodeId = `__start__`;
  const endNode: NodeId = `__end__`;
  // 临时节点坐标
  qg.nodes.set(startNode, startProj);
  qg.nodes.set(endNode, endProj);

  // 临时连接：startNode -> nearest edge endpoints
  const connectTempNode = (temp: NodeId, proj: Coordinate, seg: any) => {
    const a = seg.a as Coordinate;
    const b = seg.b as Coordinate;
    const n1 = seg.n1 as NodeId;
    const n2 = seg.n2 as NodeId;
    const eRef = seg.edgeRef as Edge;

    const d1 = dist2D(proj, a);
    const d2 = dist2D(proj, b);
    const mk = (to: NodeId, dist: number, geom: [Coordinate, Coordinate]): Edge => ({
      to,
      distance: dist,
      roadId: eRef.roadId,
      roadName: eRef.roadName,
      level: eRef.level,
      speed: eRef.speed,
      geom,
      oneway: false,
    });

    addEdge(qg.edgesFrom, temp, mk(n1, d1, [proj, a]));
    addEdge(qg.edgesFrom, temp, mk(n2, d2, [proj, b]));
    addEdge(qg.edgesFrom, n1, mk(temp, d1, [a, proj]));
    addEdge(qg.edgesFrom, n2, mk(temp, d2, [b, proj]));
  };
  connectTempNode(startNode, startProj, nStart.seg);
  connectTempNode(endNode, endProj, nEnd.seg);

  // 4) dijkstra
  const dj = dijkstra({ graph: qg, start: startNode, goal: endNode, defaultSpeed });
  if (!dj.ok) {
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

  // 5) reconstruct edge path
  const edgePath: Edge[] = [];
  let cur: NodeId = endNode;
  while (cur !== startNode) {
    const p = dj.prev.get(cur);
    if (!p) break;
    edgePath.push(p.edge);
    cur = p.from;
  }
  edgePath.reverse();
  if (!edgePath.length) {
    return {
      ok: false,
      reason: '路径为空',
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

  // 6) build segments + highlight
  const segments: RoadSegment[] = [];
  let totalDist = 0;
  let totalTime = 0;

  // access: startCoord -> startProj / endProj -> endCoord
  const accessStartDist = dist2D(start, startProj);
  if (accessStartDist > 1e-6) {
    const t = accessStartDist / defaultSpeed;
    segments.push({ kind: 'access', from: start, to: startProj, coords: [start, startProj], distance: accessStartDist, timeSeconds: t });
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
    const t = accessEndDist / defaultSpeed;
    segments.push({ kind: 'access', from: endProj, to: end, coords: [endProj, end], distance: accessEndDist, timeSeconds: t });
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
  if (accessStartDist > 1e-6) styledSegments.push({ kind: 'access', coords: [start, startProj], color: '#9E9E9E', dashed: true, tooltip: '接驳至道路' });
  if (accessEndDist > 1e-6) styledSegments.push({ kind: 'access', coords: [endProj, end], color: '#9E9E9E', dashed: true, tooltip: '从道路接驳' });

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
