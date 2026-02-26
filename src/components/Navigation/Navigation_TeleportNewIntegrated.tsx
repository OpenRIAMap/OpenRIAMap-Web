/**
 * Navigation_TeleportNewIntegrated.tsx
 *
 * 传送（新）：基于规则层 TPP 点要素的导航计算模块（纯 TS，不依赖 React）
 *
 * 你给出的语义约束：
 * - 每个 TPP 记录两个坐标：
 *   - coordinate：触发方块坐标（src）
 *   - TGTcoordinate：传送目标坐标（tgt）
 * - 传送行为严格单向：src -> tgt
 * - 其它移动用“飞行/步行”时间估算，可双向
 * - 增强版：
 *   - 使用 kNN 飞行邻接 + Dijkstra，在 1000-1500 TPP（节点去重后~2000-3000）规模内可运行
 *   - 支持 hub：若起点位于某个 hub（通过“回城点表”识别），则起点可直接连接 hub 内全部 TPP.src
 *   - 支持“返回主城”：先追加一次个人传送到回城点，再从该点开始寻路
 */

import type { Coordinate } from '@/types';
import { RULE_DATA_SOURCES, type WorldRuleDataSource } from '@/components/Rules/ruleDataSources';
import type { RouteHighlightData, RouteStyledSegment, RouteStationMarker } from '@/components/Map/RouteHighlightLayer';
import { detectHubByProximity, getHubReturnPoint } from './teleportHubReturnPoints';

// ------------------------------
// types
// ------------------------------

type TeleportPoint = {
  id: string;
  name: string;
  hub?: string;
  src: Coordinate;
  tgt: Coordinate;
};

// 传送导航内部图缓存：避免每次点击都 O(n^2) 构建 kNN，导致“长期加载”观感
type TeleportInternalGraphCache = {
  key: string;
  internalNodes: Coordinate[];
  nodeIndex: Map<string, number>;
  teleportEdges: Array<{ sId: number; tId: number; tpId: string; tpName: string }>;
  hubSrcByHub: Map<string, number[]>;
  neighborIdx: number[][];
  builtAt: number;
};

const TELEPORT_GRAPH_CACHE: Record<string, TeleportInternalGraphCache | undefined> = {};

export type TeleportNewSegment =
  | {
      kind: 'fly';
      from: Coordinate;
      to: Coordinate;
      distance: number;
      timeSeconds: number;
    }
  | {
      kind: 'teleport';
      tpId: string;
      tpName: string;
      from: Coordinate;
      to: Coordinate;
      timeSeconds: number;
    }
  | {
      kind: 'personal_return';
      returnPointId: string;
      returnPointName: string;
      from: Coordinate;
      to: Coordinate;
      timeSeconds: number;
    };

export type NavTeleportNewIntegratedPlan = {
  ok: boolean;
  reason?: string;

  worldId: string;
  usedHub?: string;
  usedReturnPointId?: string;

  totalTimeSeconds: number;
  totalDistance: number;
  teleportCount: number;

  segments: TeleportNewSegment[];
  routeHighlight: RouteHighlightData;
};

export type NavigationTeleportComputeOptions = {
  worldId: string;
  startCoord: Coordinate;
  endCoord: Coordinate;
  useElytra?: boolean;

  /** 开启时：先执行一次“个人传送”到回城点，然后再寻路 */
  returnToHub?: {
    enabled: boolean;
    returnPointId?: string;
    /** 个人传送成本（秒） */
    personalTeleportCostSeconds?: number;
  };

  /** 飞行速度（blocks/s），useElytra=true 时使用 */
  elytraSpeed?: number;
  /** 步行速度（blocks/s），useElytra=false 时使用 */
  walkSpeed?: number;
  /** 触发传送成本（秒） */
  teleportCostSeconds?: number;

  /** kNN 参数 */
  knn?: number;
  startNearestK?: number;
  endNearestK?: number;

  dataSourceOverride?: Partial<WorldRuleDataSource>;
  filesOverride?: string[];
  fetcher?: (url: string) => Promise<any[]>;
};

// ------------------------------
// small utils
// ------------------------------

const DEFAULT_Y = 64;
const isFiniteNum = (v: any) => Number.isFinite(Number(v));

function normCoord(c: Coordinate): Coordinate {
  return { x: Number(c.x), z: Number(c.z), y: Number.isFinite(c.y as any) ? (c.y as number) : DEFAULT_Y };
}

function dist2D(a: Coordinate, b: Coordinate): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function coordKey(c: Coordinate): string {
  // 兼容 .5 / 整数坐标；用 toFixed(3) 避免浮点拼接误差
  const x = Number(c.x).toFixed(3);
  const z = Number(c.z).toFixed(3);
  return `${x},${z}`;
}

// ------------------------------
// binary heap (min)
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

// ------------------------------
// load & parse TPP
// ------------------------------

const TPP_CACHE: Record<string, { points: TeleportPoint[]; loadedAt: number; key: string }> = {};

async function fetchJsonArray(url: string, fetcher?: (url: string) => Promise<any[]>) {
  if (fetcher) return fetcher(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${url}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data;
}

async function loadTeleportPoints(worldId: string, opt: {
  dataSourceOverride?: Partial<WorldRuleDataSource>;
  filesOverride?: string[];
  fetcher?: (url: string) => Promise<any[]>;
}): Promise<TeleportPoint[]> {
  const base = RULE_DATA_SOURCES[worldId];
  if (!base) return [];

  const ds: WorldRuleDataSource = {
    baseUrl: opt.dataSourceOverride?.baseUrl ?? base.baseUrl,
    files: opt.filesOverride ?? opt.dataSourceOverride?.files ?? base.files,
  };

  const cacheKey = `${ds.baseUrl}::${(ds.files ?? []).join('|')}`;
  const cached = TPP_CACHE[worldId];
  if (cached && cached.key === cacheKey) return cached.points;

  const files = ds.files ?? [];
  if (!files.length) {
    TPP_CACHE[worldId] = { points: [], loadedAt: Date.now(), key: cacheKey };
    return [];
  }

  // 先收集所有 WRP（用于 TGTWarp 解析），再解析 TPP
  const wrpMap = new Map<string, { coord: Coordinate; elevation?: number }>();
  const tppRaw: any[] = [];

  for (const f of files) {
    const url = `${ds.baseUrl}/${f}`;
    let arr: any[] = [];
    try {
      arr = await fetchJsonArray(url, opt.fetcher);
    } catch {
      // 规则层允许部分文件不存在（比如你在 sources 列表里预填了未来文件）
      continue;
    }

    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const cls = String((item as any).Class ?? (item as any).class ?? '').trim();

      if (cls === 'WRP') {
        const i2d = String((item as any).WRPointI2D ?? (item as any).wrPointI2D ?? '').trim();
        const c = (item as any).coordinate;
        if (!i2d || !c) continue;
        if (!isFiniteNum(c.x) || !isFiniteNum(c.z)) continue;

        // 新规范：优先读取 coordinate.y；否则回退 elevation；再不行用 DEFAULT_Y
        const cy = Number((c as any).y);
        const elev = (item as any).elevation;
        const y = Number.isFinite(cy) ? cy : (isFiniteNum(elev) ? Number(elev) : DEFAULT_Y);
        // Coordinate 类型要求 y 为 number；当未提供时用 DEFAULT_Y
        wrpMap.set(i2d, { coord: normCoord({ x: c.x, z: c.z, y }), elevation: y });
        continue;
      }

      if (cls === 'TPP') {
        tppRaw.push(item);
      }
    }
  }

  const out: TeleportPoint[] = [];

  for (const item of tppRaw) {
    const id = String((item as any).ID ?? '').trim();
    const name = String((item as any).Name ?? id).trim();
    const hub = String((item as any).hub ?? (item as any).tags?.hub ?? '').trim() || undefined;

    const c = (item as any).coordinate;
    if (!c || !isFiniteNum(c.x) || !isFiniteNum(c.z)) continue;

    // 目标解析优先级：
    // 1) TGTWarp -> WRP.WRPointI2D
    // 2) TGTcoordinate (+ TGTelevation)
    const warp = String((item as any).TGTWarp ?? (item as any).tgtWarp ?? '').trim();
    let tgt: Coordinate | null = null;

    if (warp && wrpMap.has(warp)) {
      tgt = wrpMap.get(warp)!.coord;
    } else {
      const t = (item as any).TGTcoordinate ?? (item as any).tgtCoordinate ?? (item as any).targetCoordinate;
      if (t && isFiniteNum(t.x) && isFiniteNum(t.z)) {
        const cy = Number((t as any).y);
        const te = (item as any).TGTelevation;
        const ty = Number.isFinite(cy) ? cy : (isFiniteNum(te) ? Number(te) : DEFAULT_Y);
        tgt = normCoord({ x: t.x, z: t.z, y: ty });
      }
    }

    if (!tgt) continue;

    const cy = Number((c as any).y);
    const srcElev = (item as any).elevation;
    const srcY = Number.isFinite(cy) ? cy : (isFiniteNum(srcElev) ? Number(srcElev) : DEFAULT_Y);

    out.push({
      id,
      name,
      hub,
      src: normCoord({ x: c.x, z: c.z, y: srcY }),
      tgt,
    });
  }

  TPP_CACHE[worldId] = { points: out, loadedAt: Date.now(), key: cacheKey };
  return out;
}

// ------------------------------
// graph helpers
// ------------------------------

type EdgeKind = 'fly' | 'teleport';

type Edge = {
  to: number;
  time: number;
  distance: number;
  kind: EdgeKind;
  // teleport meta
  tpId?: string;
  tpName?: string;
};

function insertBest(list: Array<{ d2: number; i: number }>, cand: { d2: number; i: number }, k: number) {
  // list: 升序
  if (list.length === 0) {
    list.push(cand);
    return;
  }
  // 快路径：大多数都比尾部大
  if (list.length >= k && cand.d2 >= list[list.length - 1].d2) return;

  let pos = list.length;
  while (pos > 0 && cand.d2 < list[pos - 1].d2) pos--;
  list.splice(pos, 0, cand);
  if (list.length > k) list.length = k;
}

function pickNearestK(nodes: Coordinate[], from: Coordinate, k: number): number[] {
  const best: Array<{ d2: number; i: number }> = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const dx = from.x - n.x;
    const dz = from.z - n.z;
    const d2 = dx * dx + dz * dz;
    insertBest(best, { d2, i }, k);
  }
  return best.map((b) => b.i);
}

// ------------------------------
// main compute
// ------------------------------

export async function computeTeleportNewPlanFromCoords(opt: NavigationTeleportComputeOptions): Promise<NavTeleportNewIntegratedPlan> {
  const worldId = opt.worldId;
  const useElytra = opt.useElytra ?? true;

  const elytraSpeed = Number.isFinite(opt.elytraSpeed as any) ? (opt.elytraSpeed as number) : 32.0;
  const walkSpeed = Number.isFinite(opt.walkSpeed as any) ? (opt.walkSpeed as number) : 4.0;
  const flySpeed = useElytra ? elytraSpeed : walkSpeed;

  const teleportCostSeconds = Number.isFinite(opt.teleportCostSeconds as any) ? (opt.teleportCostSeconds as number) : 3.0;
  const personalTpCostSeconds = Number.isFinite(opt.returnToHub?.personalTeleportCostSeconds as any)
    ? (opt.returnToHub!.personalTeleportCostSeconds as number)
    : 3.0;

  const knn = Number.isFinite(opt.knn as any) ? (opt.knn as number) : 24;
  const startK = Number.isFinite(opt.startNearestK as any) ? (opt.startNearestK as number) : 10;
  const endK = Number.isFinite(opt.endNearestK as any) ? (opt.endNearestK as number) : 10;

  const rawStart = normCoord(opt.startCoord);
  const endCoord = normCoord(opt.endCoord);

  // 计算 dataSource key（用于内部图缓存）
  const base = RULE_DATA_SOURCES[worldId];
  const dsBaseUrl = opt.dataSourceOverride?.baseUrl ?? base?.baseUrl ?? '';
  const dsFiles = (opt.filesOverride ?? opt.dataSourceOverride?.files ?? base?.files ?? []) as string[];
  const dsKey = `${dsBaseUrl}::${(dsFiles ?? []).join('|')}`;

  const tps = await loadTeleportPoints(worldId, {
    dataSourceOverride: opt.dataSourceOverride,
    filesOverride: opt.filesOverride,
    fetcher: opt.fetcher,
  });

  if (!tps.length) {
    return {
      ok: false,
      reason: '未加载到任何 TPP 传送点（请确认 RULE_DATA_SOURCES 中已包含对应 json 文件）',
      worldId,
      totalTimeSeconds: 0,
      totalDistance: 0,
      teleportCount: 0,
      segments: [],
      routeHighlight: { styledSegments: [], stationMarkers: [] },
    };
  }

  // --- personal return pre-step
  let startCoord = rawStart;
  let usedReturnPointId: string | undefined;
  let usedHub: string | undefined;
  const segments: TeleportNewSegment[] = [];

  if (opt.returnToHub?.enabled && opt.returnToHub.returnPointId) {
    const rp = getHubReturnPoint(worldId, opt.returnToHub.returnPointId);
    if (rp) {
      usedReturnPointId = rp.id;
      usedHub = rp.hub;
      segments.push({
        kind: 'personal_return',
        returnPointId: rp.id,
        returnPointName: rp.name,
        from: rawStart,
        to: normCoord(rp.coord),
        timeSeconds: personalTpCostSeconds,
      });
      startCoord = normCoord(rp.coord);
    }
  }

  // --- hub detect (only if no explicit return hub yet)
  if (!usedHub) {
    const hubHit = detectHubByProximity(worldId, startCoord);
    if (hubHit) usedHub = hubHit.hub;
  }

  // ------------------------------
  // build/reuse internal graph cache (unique nodes + kNN)
  // ------------------------------

  const graphKey = `${dsKey}::knn=${knn}`;
  let g = TELEPORT_GRAPH_CACHE[worldId];

  const rebuildGraph = () => {
    const nodeIndex = new Map<string, number>();
    const internalNodes: Coordinate[] = [];
    const nodeAdd = (c: Coordinate) => {
      const cc = normCoord(c);
      const k = coordKey(cc);
      const hit = nodeIndex.get(k);
      if (hit !== undefined) return hit;
      const id = internalNodes.length;
      internalNodes.push(cc);
      nodeIndex.set(k, id);
      return id;
    };

    const teleportEdges: Array<{ sId: number; tId: number; tpId: string; tpName: string }> = [];
    const hubSrcByHub = new Map<string, number[]>();

    for (const tp of tps) {
      const sId = nodeAdd(tp.src);
      const tId = nodeAdd(tp.tgt);
      teleportEdges.push({ sId, tId, tpId: tp.id, tpName: tp.name });
      if (tp.hub) {
        const arr = hubSrcByHub.get(tp.hub) ?? [];
        arr.push(sId);
        hubSrcByHub.set(tp.hub, arr);
      }
    }

    // kNN neighbor indices (O(n^2) once, cached)
    const internalCount = internalNodes.length;
    const neighborIdx: number[][] = Array.from({ length: internalCount }, () => []);
    for (let i = 0; i < internalCount; i++) {
      const a = internalNodes[i];
      const best: Array<{ d2: number; i: number }> = [];
      for (let j = 0; j < internalCount; j++) {
        if (i === j) continue;
        const b = internalNodes[j];
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        const d2 = dx * dx + dz * dz;
        insertBest(best, { d2, i: j }, knn);
      }
      neighborIdx[i] = best.map((x) => x.i);
    }

    const built: TeleportInternalGraphCache = {
      key: graphKey,
      internalNodes,
      nodeIndex,
      teleportEdges,
      hubSrcByHub,
      neighborIdx,
      builtAt: Date.now(),
    };
    TELEPORT_GRAPH_CACHE[worldId] = built;
    return built;
  };

  if (!g || g.key !== graphKey) {
    g = rebuildGraph();
  }

  const internalNodes = g.internalNodes;
  const internalCount = internalNodes.length;

  const S = internalCount;
  const E = internalCount + 1;
  const nodes: Coordinate[] = [...internalNodes, startCoord, endCoord];
  const adj: Edge[][] = Array.from({ length: nodes.length }, () => []);

  // --- teleport edges
  for (const te of g.teleportEdges) {
    adj[te.sId].push({
      to: te.tId,
      time: teleportCostSeconds,
      distance: 0,
      kind: 'teleport',
      tpId: te.tpId,
      tpName: te.tpName,
    });
  }

  // --- fly edges among internal nodes (kNN)
  for (let i = 0; i < internalCount; i++) {
    const a = internalNodes[i];
    for (const j of g.neighborIdx[i]) {
      const b = internalNodes[j];
      const d = dist2D(a, b);
      const t = d / flySpeed;
      adj[i].push({ to: j, time: t, distance: d, kind: 'fly' });
      // ensure bidirectional (even if j didn't include i)
      adj[j].push({ to: i, time: t, distance: d, kind: 'fly' });
    }
  }

  // --- start / end connections
  const startCandidates = new Set<number>();
  if (usedHub) {
    const hubIds = g.hubSrcByHub.get(usedHub);
    if (hubIds?.length) {
      for (const id of hubIds) startCandidates.add(id);
    }
  }
  // also add nearest K for robustness
  for (const id of pickNearestK(internalNodes, startCoord, startK)) startCandidates.add(id);

  for (const id of startCandidates) {
    const d = dist2D(startCoord, internalNodes[id]);
    adj[S].push({ to: id, time: d / flySpeed, distance: d, kind: 'fly' });
  }

  const endCandidates = pickNearestK(internalNodes, endCoord, endK);
  for (const id of endCandidates) {
    const d = dist2D(internalNodes[id], endCoord);
    adj[id].push({ to: E, time: d / flySpeed, distance: d, kind: 'fly' });
  }

  // ------------------------------
  // dijkstra
  // ------------------------------
  const n = nodes.length;
  const dist = new Array<number>(n).fill(Number.POSITIVE_INFINITY);
  const prev = new Array<number>(n).fill(-1);
  const prevEdge = new Array<Edge | null>(n).fill(null);
  const heap = new MinHeap<number>();

  dist[S] = 0;
  heap.push(0, S);

  while (heap.size) {
    const cur = heap.pop()!;
    const u = cur.v;
    const du = cur.k;
    if (du !== dist[u]) continue;
    if (u === E) break;

    for (const e of adj[u]) {
      const v = e.to;
      const nd = du + e.time;
      if (nd < dist[v]) {
        dist[v] = nd;
        prev[v] = u;
        prevEdge[v] = e;
        heap.push(nd, v);
      }
    }
  }

  if (!Number.isFinite(dist[E])) {
    const rh: RouteHighlightData = {
      styledSegments: [],
      stationMarkers: [
        { kind: 'start', coord: rawStart, label: '起点', color: '#2563eb', radius: 6 },
        { kind: 'end', coord: endCoord, label: '终点', color: '#ef4444', radius: 6 },
      ],
      startCoord: rawStart,
      endCoord,
      startLabel: '起点',
      endLabel: '终点',
    };
    return {
      ok: false,
      reason: '未找到可用传送路径（可能是 TPP 数据缺失/过少，或 kNN 参数过小导致图断连）',
      worldId,
      usedHub,
      usedReturnPointId,
      totalTimeSeconds: 0,
      totalDistance: 0,
      teleportCount: 0,
      segments,
      routeHighlight: rh,
    };
  }

  // ------------------------------
  // reconstruct edges (S -> E)
  // ------------------------------
  const edgeSeq: Array<{ u: number; v: number; e: Edge }> = [];
  let cur = E;
  while (cur !== S && cur !== -1) {
    const p = prev[cur];
    const pe = prevEdge[cur];
    if (p < 0 || !pe) break;
    edgeSeq.push({ u: p, v: cur, e: pe });
    cur = p;
  }
  edgeSeq.reverse();

  // compress fly-runs
  const finalSegs: TeleportNewSegment[] = [...segments];
  let teleportCount = finalSegs.filter(s => s.kind === 'personal_return').length;
  let totalDistance = 0;

  let flyRunStart: Coordinate | null = null;
  let flyRunEnd: Coordinate | null = null;

  const flushFly = () => {
    if (!flyRunStart || !flyRunEnd) return;
    const d = dist2D(flyRunStart, flyRunEnd);
    const t = d / flySpeed;
    totalDistance += d;
    finalSegs.push({ kind: 'fly', from: flyRunStart, to: flyRunEnd, distance: d, timeSeconds: t });
    flyRunStart = null;
    flyRunEnd = null;
  };

  for (const step of edgeSeq) {
    const e = step.e;
    const uC = nodes[step.u];
    const vC = nodes[step.v];

    if (e.kind === 'fly') {
      if (!flyRunStart) {
        flyRunStart = uC;
        flyRunEnd = vC;
      } else {
        // extend run
        flyRunEnd = vC;
      }
    } else {
      flushFly();
      teleportCount += 1;
      finalSegs.push({
        kind: 'teleport',
        tpId: e.tpId ?? '',
        tpName: e.tpName ?? '传送',
        from: uC,
        to: vC,
        timeSeconds: e.time,
      });
    }
  }
  flushFly();

  const totalTimeSeconds = (finalSegs.reduce((s, seg) => s + (seg.timeSeconds ?? 0), 0));

  // ------------------------------
  // build RouteHighlightData
  // ------------------------------
  const styledSegments: RouteStyledSegment[] = [];
  const stationMarkers: RouteStationMarker[] = [];

  // 起终点 marker
  stationMarkers.push({ kind: 'start', coord: rawStart, label: '起点', color: '#2563eb', radius: 6 });
  stationMarkers.push({ kind: 'end', coord: endCoord, label: '终点', color: '#ef4444', radius: 6 });

  for (const seg of finalSegs) {
    if (seg.kind === 'personal_return') {
      styledSegments.push({
        kind: 'transfer',
        coords: [seg.from, seg.to],
        dashed: true,
        color: '#f97316',
        tooltip: `返回主城：${seg.returnPointName}`,
      });
      continue;
    }
    if (seg.kind === 'teleport') {
      styledSegments.push({
        kind: 'transfer',
        coords: [seg.from, seg.to],
        dashed: true,
        color: '#a855f7',
        tooltip: `传送：${seg.tpName}`,
      });
      continue;
    }
    // fly
    styledSegments.push({
      kind: 'access',
      coords: [seg.from, seg.to],
      dashed: true,
      color: '#22c55e',
      tooltip: useElytra ? '鞘翅飞行' : '步行',
    });
  }

  const routeHighlight: RouteHighlightData = {
    styledSegments,
    stationMarkers,
    startCoord: rawStart,
    endCoord,
    startLabel: '起点',
    endLabel: '终点',
  };

  return {
    ok: true,
    worldId,
    usedHub,
    usedReturnPointId,
    totalTimeSeconds,
    totalDistance,
    teleportCount,
    segments: finalSegs,
    routeHighlight,
  };
}
