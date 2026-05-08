import type { DisplayAnchorConfig } from "@/components/Rules/rendering/display/displayTypes";
import type {
  WorldPointXZ,
  WorldRectXZ,
} from "@/components/Rules/rendering/label/labelAnchor";

/**
 * RB_SLU_14: stable geographic anchor candidates for polygon labels.
 *
 * The cache deliberately stores world-space candidates, not screen-space
 * pixels. A label can therefore keep the same geographic anchor while Leaflet
 * pans/zooms the map, reducing viewport-driven anchor churn in dense areas.
 */

export type StableGeoAnchorKind =
  | "center"
  | "centroid"
  | "bboxCenter"
  | "grid"
  | "viewportPreferred"
  | "edgeFallback";

export type StableGeoAnchorCandidateScoreParts = {
  staticWeight: number;
  viewportPreference: number;
  /** RB_SLU_21: preference computed only from the real screen viewport. */
  realViewportPreference?: number;
  featureCenterPreference?: number;
  layoutWindowUsable?: boolean;
  candidateSwitchBlockedByThreshold?: boolean;
  reuseBonus: number;
  edgePenalty: number;
};

export type GeoAnchorCandidateDebugInfo = {
  candidateId?: string;
  kind?: StableGeoAnchorKind;
  worldXZ?: WorldPointXZ;
  insidePolygon?: boolean;
  inRealViewport?: boolean;
  inLayoutViewport?: boolean;
  score?: number;
  scoreParts?: StableGeoAnchorCandidateScoreParts;
  isPrevious?: boolean;
  isSelected?: boolean;
  rejectedReason?: string;
};

export type GeoAnchorSelectionDebugInfo = {
  strategy?: string;
  selectedCandidateId?: string;
  selectedCandidateKind?: StableGeoAnchorKind;
  previousCandidateUsed?: boolean;
  previousCandidateId?: string;
  switchBlockedByThreshold?: boolean;
  switchScoreDelta?: number;
  switchThreshold?: number;
  candidates?: GeoAnchorCandidateDebugInfo[];
};

export type StableGeoAnchorCandidate = {
  index: number;
  worldXZ: WorldPointXZ;
  kind: StableGeoAnchorKind;
  /** Legacy distance score retained for deterministic pruning. Lower means closer to feature center. */
  score: number;
  /** RB_SLU_20: static distance-to-center weight used by weighted switching. */
  staticWeight?: number;
  distanceToCenter?: number;
  finalScore?: number;
  scoreParts?: StableGeoAnchorCandidateScoreParts;
  geoAnchorDebug?: GeoAnchorSelectionDebugInfo;
};

type StableGeoAnchorCacheEntry = {
  featureKey: string;
  geometryHash: string;
  mode: string;
  gridSize: number | null;
  candidateMax: number;
  candidates: StableGeoAnchorCandidate[];
  lastCandidateIndex?: number;
  lastUsedAt: number;
};

type ResolveStableGeoAnchorOptions = {
  featureKey: string;
  poly: WorldPointXZ[];
  anchor?: DisplayAnchorConfig | null;
  /** Deprecated compatibility field. RB_SLU_21 callers should pass real/layout separately. */
  viewportRect?: WorldRectXZ | null;
  realViewportRect?: WorldRectXZ | null;
  layoutViewportRect?: WorldRectXZ | null;
};

type CandidateBuildOptions = {
  mode: string;
  gridSize: number | null;
  candidateCount: number;
  candidateMax: number;
  scanMax: number;
};

const anchorCache = new Map<string, StableGeoAnchorCacheEntry>();

const DEFAULT_CANDIDATE_COUNT = 9;
const DEFAULT_CANDIDATE_MAX = 100;
const DEFAULT_GRID_MIN_SIZE = 100;
const DEFAULT_SCAN_MAX = 900;

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function bboxFromPoly(poly: WorldPointXZ[]): WorldRectXZ {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return { minX, maxX, minZ, maxZ };
}

function rectCenter(rect: WorldRectXZ): WorldPointXZ {
  return { x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2 };
}

function pointInRect(
  p: WorldPointXZ,
  rect: WorldRectXZ | null | undefined,
): boolean {
  if (!rect) return false;
  return (
    p.x >= rect.minX && p.x <= rect.maxX && p.z >= rect.minZ && p.z <= rect.maxZ
  );
}

function pointInPolygon(p: WorldPointXZ, poly: WorldPointXZ[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const zi = poly[i].z;
    const xj = poly[j].x;
    const zj = poly[j].z;
    const crosses = zi > p.z !== zj > p.z;
    if (!crosses) continue;
    const xAtZ = ((xj - xi) * (p.z - zi)) / (zj - zi || 1e-9) + xi;
    if (p.x < xAtZ) inside = !inside;
  }
  return inside;
}

function closestPointOnSegment(
  a: WorldPointXZ,
  b: WorldPointXZ,
  p: WorldPointXZ,
): WorldPointXZ {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const apx = p.x - a.x;
  const apz = p.z - a.z;
  const denom = abx * abx + abz * abz;
  if (denom <= 1e-9) return { x: a.x, z: a.z };
  const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / denom));
  return { x: a.x + abx * t, z: a.z + abz * t };
}

function closestPointOnPolygonEdges(
  poly: WorldPointXZ[],
  p: WorldPointXZ,
): WorldPointXZ | null {
  if (poly.length < 2) return null;
  let best: WorldPointXZ | null = null;
  let bestD2 = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const q = closestPointOnSegment(a, b, p);
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

function polygonCentroid(poly: WorldPointXZ[]): WorldPointXZ | null {
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

function stableInteriorPoint(
  poly: WorldPointXZ[],
  bbox: WorldRectXZ,
): { point: WorldPointXZ; kind: StableGeoAnchorKind } {
  const centroid = polygonCentroid(poly);
  if (centroid && pointInPolygon(centroid, poly))
    return { point: centroid, kind: "centroid" };
  const center = rectCenter(bbox);
  if (pointInPolygon(center, poly))
    return { point: center, kind: "bboxCenter" };
  const edge = closestPointOnPolygonEdges(poly, center);
  return { point: edge ?? centroid ?? center, kind: "edgeFallback" };
}

function distanceSq(a: WorldPointXZ, b: WorldPointXZ): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function candidateKey(p: WorldPointXZ): string {
  return `${Math.round(p.x * 100) / 100},${Math.round(p.z * 100) / 100}`;
}

function addCandidate(
  output: StableGeoAnchorCandidate[],
  seen: Set<string>,
  p: WorldPointXZ,
  kind: StableGeoAnchorKind,
  center: WorldPointXZ,
  poly: WorldPointXZ[],
): void {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
  if (!pointInPolygon(p, poly) && kind !== "edgeFallback") return;
  const key = candidateKey(p);
  if (seen.has(key)) return;
  seen.add(key);
  output.push({
    index: output.length,
    worldXZ: p,
    kind,
    score: distanceSq(p, center),
  });
}

function buildDefaultCandidates(
  poly: WorldPointXZ[],
  bbox: WorldRectXZ,
  count: number,
): StableGeoAnchorCandidate[] {
  const centerInfo = stableInteriorPoint(poly, bbox);
  const center = centerInfo.point;
  const seen = new Set<string>();
  const output: StableGeoAnchorCandidate[] = [];
  addCandidate(output, seen, center, centerInfo.kind, center, poly);

  const xs = [0.25, 0.5, 0.75].map(
    (f) => bbox.minX + (bbox.maxX - bbox.minX) * f,
  );
  const zs = [0.25, 0.5, 0.75].map(
    (f) => bbox.minZ + (bbox.maxZ - bbox.minZ) * f,
  );
  for (const z of zs) {
    for (const x of xs) {
      addCandidate(output, seen, { x, z }, "grid", center, poly);
    }
  }

  return pruneCandidates(output, Math.max(1, count), center, null);
}

function buildGridCandidates(
  poly: WorldPointXZ[],
  bbox: WorldRectXZ,
  gridSize: number,
  candidateMax: number,
  scanMax: number,
): StableGeoAnchorCandidate[] {
  const centerInfo = stableInteriorPoint(poly, bbox);
  const center = centerInfo.point;
  const seen = new Set<string>();
  const output: StableGeoAnchorCandidate[] = [];
  addCandidate(output, seen, center, centerInfo.kind, center, poly);

  const maxDx = Math.max(
    Math.abs(bbox.minX - center.x),
    Math.abs(bbox.maxX - center.x),
  );
  const maxDz = Math.max(
    Math.abs(bbox.minZ - center.z),
    Math.abs(bbox.maxZ - center.z),
  );
  const maxRing = Math.max(1, Math.ceil(Math.max(maxDx, maxDz) / gridSize));
  let scanned = 0;

  for (let ring = 1; ring <= maxRing && scanned < scanMax; ring++) {
    for (let ix = -ring; ix <= ring && scanned < scanMax; ix++) {
      for (let iz = -ring; iz <= ring && scanned < scanMax; iz++) {
        if (Math.max(Math.abs(ix), Math.abs(iz)) !== ring) continue;
        const p = { x: center.x + ix * gridSize, z: center.z + iz * gridSize };
        scanned += 1;
        if (
          p.x < bbox.minX ||
          p.x > bbox.maxX ||
          p.z < bbox.minZ ||
          p.z > bbox.maxZ
        )
          continue;
        addCandidate(output, seen, p, "grid", center, poly);
      }
    }
  }

  return pruneCandidates(output, candidateMax, center, null);
}

function pruneCandidates(
  candidates: StableGeoAnchorCandidate[],
  maxCount: number,
  center: WorldPointXZ,
  viewportRect: WorldRectXZ | null | undefined,
  previousIndex?: number,
): StableGeoAnchorCandidate[] {
  if (candidates.length <= maxCount) {
    return candidates;
  }

  const viewportCenter = viewportRect ? rectCenter(viewportRect) : null;
  const ranked = [...candidates].sort((a, b) => {
    if (previousIndex !== undefined) {
      if (a.index === previousIndex) return -1;
      if (b.index === previousIndex) return 1;
    }
    const av = viewportRect && pointInRect(a.worldXZ, viewportRect) ? 0 : 1;
    const bv = viewportRect && pointInRect(b.worldXZ, viewportRect) ? 0 : 1;
    if (av !== bv) return av - bv;
    if (viewportCenter) {
      const adv = distanceSq(a.worldXZ, viewportCenter);
      const bdv = distanceSq(b.worldXZ, viewportCenter);
      if (Math.abs(adv - bdv) > 1e-6) return adv - bdv;
    }
    const ad = distanceSq(a.worldXZ, center);
    const bd = distanceSq(b.worldXZ, center);
    if (Math.abs(ad - bd) > 1e-6) return ad - bd;
    if (a.worldXZ.z !== b.worldXZ.z) return a.worldXZ.z - b.worldXZ.z;
    return a.worldXZ.x - b.worldXZ.x;
  });

  return ranked.slice(0, maxCount);
}

function geometryHash(poly: WorldPointXZ[]): string {
  const bbox = bboxFromPoly(poly);
  const first = poly[0];
  const mid = poly[Math.floor(poly.length / 2)] ?? first;
  const last = poly[poly.length - 1] ?? first;
  const parts = [
    poly.length,
    bbox.minX,
    bbox.maxX,
    bbox.minZ,
    bbox.maxZ,
    first.x,
    first.z,
    mid.x,
    mid.z,
    last.x,
    last.z,
  ];
  return parts.map((n) => Math.round(Number(n) * 100) / 100).join("|");
}

function normalizeBuildOptions(
  anchor: DisplayAnchorConfig | null | undefined,
): CandidateBuildOptions {
  const mode = String(
    anchor?.geoCandidateMode ??
      (anchor?.strategy === "fixedInterior"
        ? "fixedInterior"
        : "viewportAwareCandidateSet"),
  );
  const minGrid = clampNumber(
    anchor?.geoGridMinSize,
    DEFAULT_GRID_MIN_SIZE,
    1,
    100000,
  );
  const rawGrid =
    anchor?.geoGridSize == null
      ? null
      : clampNumber(anchor.geoGridSize, minGrid, minGrid, 1000000);
  const candidateMax = clampNumber(
    anchor?.geoCandidateMax,
    DEFAULT_CANDIDATE_MAX,
    1,
    500,
  );
  const scanMax = clampNumber(
    anchor?.geoCandidateScanMax,
    DEFAULT_SCAN_MAX,
    candidateMax,
    10000,
  );
  const candidateCount = clampNumber(
    anchor?.geoCandidateCount,
    DEFAULT_CANDIDATE_COUNT,
    1,
    candidateMax,
  );

  return { mode, gridSize: rawGrid, candidateCount, candidateMax, scanMax };
}

function buildCandidates(
  poly: WorldPointXZ[],
  options: CandidateBuildOptions,
): StableGeoAnchorCandidate[] {
  const bbox = bboxFromPoly(poly);
  if (options.mode === "fixedInterior") {
    const centerInfo = stableInteriorPoint(poly, bbox);
    return [
      { index: 0, worldXZ: centerInfo.point, kind: centerInfo.kind, score: 0 },
    ];
  }

  if (options.mode === "gridByWorldUnits" && options.gridSize) {
    return buildGridCandidates(
      poly,
      bbox,
      options.gridSize,
      options.candidateMax,
      options.scanMax,
    );
  }

  return buildDefaultCandidates(poly, bbox, options.candidateCount);
}

function cacheKeyFor(
  featureKey: string,
  hash: string,
  options: CandidateBuildOptions,
): string {
  return [
    featureKey,
    hash,
    options.mode,
    options.gridSize ?? "default",
    options.candidateCount,
    options.candidateMax,
  ].join("::");
}

function getEntry(
  options: ResolveStableGeoAnchorOptions,
): StableGeoAnchorCacheEntry | null {
  const buildOptions = normalizeBuildOptions(options.anchor);
  const hash = geometryHash(options.poly);
  const key = cacheKeyFor(options.featureKey, hash, buildOptions);
  const existing = anchorCache.get(key);
  if (existing) return existing;

  const candidates = buildCandidates(options.poly, buildOptions);
  if (!candidates.length) return null;

  const entry: StableGeoAnchorCacheEntry = {
    featureKey: options.featureKey,
    geometryHash: hash,
    mode: buildOptions.mode,
    gridSize: buildOptions.gridSize,
    candidateMax: buildOptions.candidateMax,
    candidates,
    lastUsedAt: Date.now(),
  };
  anchorCache.set(key, entry);
  return entry;
}

function candidateScreenishScore(
  p: WorldPointXZ,
  viewportRect: WorldRectXZ | null | undefined,
  center: WorldPointXZ,
): number {
  if (!viewportRect) return distanceSq(p, center);
  const vc = rectCenter(viewportRect);
  const inViewportBonus = pointInRect(p, viewportRect) ? -1e12 : 0;
  return distanceSq(p, vc) + inViewportBonus;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function rectDiagonal(rect: WorldRectXZ): number {
  return Math.max(1, Math.hypot(rect.maxX - rect.minX, rect.maxZ - rect.minZ));
}

function distanceToRectEdgeRatio(p: WorldPointXZ, rect: WorldRectXZ): number {
  const w = Math.max(1, rect.maxX - rect.minX);
  const h = Math.max(1, rect.maxZ - rect.minZ);
  const dx = Math.min(Math.abs(p.x - rect.minX), Math.abs(rect.maxX - p.x)) / w;
  const dz = Math.min(Math.abs(p.z - rect.minZ), Math.abs(rect.maxZ - p.z)) / h;
  return clamp01(Math.min(dx, dz) * 2);
}

function scoreWeightedCandidate(args: {
  candidate: StableGeoAnchorCandidate;
  bbox: WorldRectXZ;
  featureCenter: WorldPointXZ;
  realViewportRect: WorldRectXZ | null;
  layoutViewportRect: WorldRectXZ | null;
  isPrevious: boolean;
  anchor?: DisplayAnchorConfig | null;
}): StableGeoAnchorCandidate {
  const {
    candidate,
    bbox,
    featureCenter,
    realViewportRect,
    layoutViewportRect,
    isPrevious,
    anchor,
  } = args;
  const mode = anchor?.candidateWeightMode ?? "distanceToCenter";
  const diagonal = rectDiagonal(bbox);
  const distanceToCenter = Math.sqrt(
    distanceSq(candidate.worldXZ, featureCenter),
  );
  const featureCenterPreference =
    mode === "none" ? 0 : 100 * (1 - clamp01(distanceToCenter / diagonal));
  const staticWeight = featureCenterPreference;

  let realViewportPreference = 0;
  if (realViewportRect && pointInRect(candidate.worldXZ, realViewportRect)) {
    const viewportCenter = rectCenter(realViewportRect);
    const vDiag = rectDiagonal(realViewportRect);
    realViewportPreference =
      44 *
      (1 -
        clamp01(
          Math.sqrt(distanceSq(candidate.worldXZ, viewportCenter)) / vDiag,
        ));
  } else if (realViewportRect) {
    realViewportPreference = -22;
  }

  const layoutWindowUsable = layoutViewportRect
    ? pointInRect(candidate.worldXZ, layoutViewportRect)
    : true;
  const layoutWindowPreference = layoutWindowUsable && realViewportRect ? 4 : 0;
  const viewportPreference = realViewportPreference + layoutWindowPreference;

  const rawReuseBonus = isPrevious
    ? clampNumber(anchor?.candidateReuseBonus, 8, 0, 1000)
    : 0;
  // RB_SLU_21: reuse can stabilise panning but must not overpower a candidate
  // that has entered the real viewport and is closer to the viewport/feature centre.
  const reuseBonus = Math.min(rawReuseBonus, 18);

  let edgePenalty = 0;
  if (realViewportRect && pointInRect(candidate.worldXZ, realViewportRect)) {
    const edgePenaltyBase = clampNumber(
      anchor?.candidateEdgePenalty,
      8,
      0,
      1000,
    );
    edgePenalty =
      edgePenaltyBase *
      (1 - distanceToRectEdgeRatio(candidate.worldXZ, realViewportRect));
  }

  const scoreParts = {
    staticWeight,
    viewportPreference,
    realViewportPreference,
    featureCenterPreference,
    layoutWindowUsable,
    reuseBonus,
    edgePenalty,
  };
  const finalScore =
    staticWeight + viewportPreference + reuseBonus - edgePenalty;
  return {
    ...candidate,
    distanceToCenter,
    staticWeight,
    finalScore,
    scoreParts,
  };
}


function geoAnchorDebugForSelection(args: {
  strategy?: string;
  selected: StableGeoAnchorCandidate;
  ranked: StableGeoAnchorCandidate[];
  poly: WorldPointXZ[];
  realViewportRect: WorldRectXZ | null;
  layoutViewportRect: WorldRectXZ | null;
  previous?: StableGeoAnchorCandidate | null;
  switchBlockedByThreshold?: boolean;
  switchScoreDelta?: number;
  switchThreshold?: number;
}): GeoAnchorSelectionDebugInfo {
  return {
    strategy: args.strategy,
    selectedCandidateId: String(args.selected.index),
    selectedCandidateKind: args.selected.kind,
    previousCandidateUsed: !!args.previous && args.previous.index === args.selected.index,
    previousCandidateId: args.previous ? String(args.previous.index) : undefined,
    switchBlockedByThreshold: !!args.switchBlockedByThreshold,
    switchScoreDelta: args.switchScoreDelta,
    switchThreshold: args.switchThreshold,
    candidates: args.ranked.map((candidate) => ({
      candidateId: String(candidate.index),
      kind: candidate.kind,
      worldXZ: candidate.worldXZ,
      insidePolygon: pointInPolygon(candidate.worldXZ, args.poly),
      inRealViewport: pointInRect(candidate.worldXZ, args.realViewportRect),
      inLayoutViewport: pointInRect(candidate.worldXZ, args.layoutViewportRect),
      score: candidate.finalScore ?? candidate.staticWeight ?? candidate.score,
      scoreParts: candidate.scoreParts,
      isPrevious: !!args.previous && args.previous.index === candidate.index,
      isSelected: candidate.index === args.selected.index,
    })),
  };
}

export function chooseStableGeoAnchorCandidate(
  options: ResolveStableGeoAnchorOptions,
): StableGeoAnchorCandidate | null {
  if (!options.poly || options.poly.length < 3) return null;
  const entry = getEntry(options);
  if (!entry || !entry.candidates.length) return null;

  const preferPrevious = options.anchor?.preferPreviousGeoCandidate !== false;
  const bbox = bboxFromPoly(options.poly);
  const fallbackCenter = stableInteriorPoint(options.poly, bbox).point;
  const realViewportRect =
    options.realViewportRect ?? options.viewportRect ?? null;
  const layoutViewportRect =
    options.layoutViewportRect ?? options.viewportRect ?? null;
  const previousRaw =
    entry.lastCandidateIndex !== undefined
      ? entry.candidates[entry.lastCandidateIndex]
      : null;
  const previous = previousRaw
    ? scoreWeightedCandidate({
        candidate: previousRaw,
        bbox,
        featureCenter: fallbackCenter,
        realViewportRect,
        layoutViewportRect,
        isPrevious: preferPrevious,
        anchor: options.anchor,
      })
    : null;

  const ranked = pruneCandidates(
    entry.candidates,
    entry.candidateMax,
    fallbackCenter,
    realViewportRect,
    entry.lastCandidateIndex,
  )
    .map((candidate) =>
      scoreWeightedCandidate({
        candidate,
        bbox,
        featureCenter: fallbackCenter,
        realViewportRect,
        layoutViewportRect,
        isPrevious: preferPrevious && previousRaw?.index === candidate.index,
        anchor: options.anchor,
      }),
    )
    .sort((a, b) => {
      const diff = (b.finalScore ?? 0) - (a.finalScore ?? 0);
      if (Math.abs(diff) > 1e-6) return diff;
      const legacy =
        candidateScreenishScore(a.worldXZ, realViewportRect, fallbackCenter) -
        candidateScreenishScore(b.worldXZ, realViewportRect, fallbackCenter);
      if (Math.abs(legacy) > 1e-6) return legacy;
      return a.index - b.index;
    });

  if (!ranked.length) return previous ?? entry.candidates[0] ?? null;

  const next = ranked[0];
  const switchThreshold = clampNumber(
    options.anchor?.candidateSwitchThreshold ?? options.anchor?.switchThreshold,
    18,
    0,
    1000,
  );

  if (preferPrevious && previous && layoutViewportRect) {
    const previousUsable =
      !layoutViewportRect || pointInRect(previous.worldXZ, layoutViewportRect);
    const nextIsDifferent = previous.index !== next.index;
    if (
      previousUsable &&
      nextIsDifferent &&
      (next.finalScore ?? 0) <= (previous.finalScore ?? 0) + switchThreshold
    ) {
      entry.lastUsedAt = Date.now();
      const selected: StableGeoAnchorCandidate = {
        ...previous,
        scoreParts: {
          ...(previous.scoreParts ?? {
            staticWeight: previous.staticWeight ?? 0,
            viewportPreference: 0,
            reuseBonus: 0,
            edgePenalty: 0,
          }),
          candidateSwitchBlockedByThreshold: true,
        },
      };
      return {
        ...selected,
        geoAnchorDebug: geoAnchorDebugForSelection({
          strategy: options.anchor?.strategy,
          selected,
          ranked,
          poly: options.poly,
          realViewportRect,
          layoutViewportRect,
          previous,
          switchBlockedByThreshold: true,
          switchScoreDelta: (next.finalScore ?? 0) - (previous.finalScore ?? 0),
          switchThreshold,
        }),
      };
    }
  }

  entry.lastCandidateIndex = next.index;
  entry.lastUsedAt = Date.now();
  return {
    ...next,
    geoAnchorDebug: geoAnchorDebugForSelection({
      strategy: options.anchor?.strategy,
      selected: next,
      ranked,
      poly: options.poly,
      realViewportRect,
      layoutViewportRect,
      previous,
      switchBlockedByThreshold: false,
      switchScoreDelta: previous ? (next.finalScore ?? 0) - (previous.finalScore ?? 0) : undefined,
      switchThreshold,
    }),
  };
}

export function resetStableGeoAnchorCacheForFeature(featureKey: string): void {
  for (const key of Array.from(anchorCache.keys())) {
    if (key.startsWith(`${featureKey}::`)) anchorCache.delete(key);
  }
}

export function clearStableGeoAnchorCache(): void {
  anchorCache.clear();
}
