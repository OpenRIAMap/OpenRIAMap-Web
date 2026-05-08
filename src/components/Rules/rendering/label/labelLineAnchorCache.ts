import type { DisplayAnchorConfig } from "@/components/Rules/rendering/display/displayTypes";
import type {
  WorldPointXZ,
  WorldRectXZ,
} from "@/components/Rules/rendering/label/labelAnchor";

/**
 * RB_SLU_16: stable line anchor candidates.
 *
 * This module is the one-dimensional counterpart of labelGeoAnchorCache.ts:
 * - polygon labels generate stable candidates inside a surface;
 * - line labels generate stable candidates along the line chainage.
 *
 * It caches world-space line candidates, not screen pixels. The rendering/layout
 * layer still decides whether a candidate is visible, collides, or should hide.
 */

export type StableLineAnchorCandidateScoreParts = {
  staticWeight: number;
  distanceToMidpoint: number;
};

export type StableLineAnchorCandidate = {
  /** Legacy numeric identity; kept stable and no longer rewritten by viewport pruning. */
  index: number;
  /** RB_SLU_21: immutable candidate identity used by layout/render lookup. */
  candidateId: string;
  sourceIndex: number;
  displayOrder: number;
  chainage: number;
  worldXZ: WorldPointXZ;
  rotateDeg: number;
  kind: "midpoint" | "spacing" | "evenSplit" | "fallback";
  angleDeltaDeg?: number;
  /** RB_SLU_20: one-dimensional candidate score based on distance to line midpoint. */
  distanceToMidpoint?: number;
  staticWeight?: number;
  finalScore?: number;
  scoreParts?: StableLineAnchorCandidateScoreParts;
  /** RB_SLU_17: local source-line fragment around this chainage, used for SVG textPath. */
  pathWorldXZ?: WorldPointXZ[];
  pathLengthWorld?: number;
};

type CacheEntry = {
  key: string;
  candidates: StableLineAnchorCandidate[];
  createdAt: number;
};

type PointOnLine = {
  point: WorldPointXZ;
  rotateDeg: number;
  segmentIndex: number;
};

const CACHE = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 3000;

const DEFAULT_LINE_CANDIDATE_SPACING = 160;
const DEFAULT_LINE_CANDIDATE_MIN_SPACING = 40;
const DEFAULT_LINE_CANDIDATE_MAX = 32;
const DEFAULT_SHORT_THRESHOLD_MULTIPLIER = 2;
const DEFAULT_ENDPOINT_PADDING_RATIO = 0.12;
const DEFAULT_ENDPOINT_PADDING_MIN = 40;
const DEFAULT_MAX_ANGLE_DELTA_DEG = 45;

function finiteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function dist(a: WorldPointXZ, b: WorldPointXZ): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function geometryHash(coords: WorldPointXZ[]): string {
  // Rounded sampling keeps the key stable under tiny float noise while still
  // invalidating when the line geometry materially changes.
  const len = coords.length;
  const take = (idx: number) => coords[Math.max(0, Math.min(len - 1, idx))];
  const sampleIdx =
    len <= 10
      ? coords.map((_, i) => i)
      : [
          0,
          1,
          2,
          Math.floor(len * 0.25),
          Math.floor(len * 0.5),
          Math.floor(len * 0.75),
          len - 3,
          len - 2,
          len - 1,
        ];
  const parts = sampleIdx.map((i) => {
    const p = take(i);
    return `${Math.round(p.x * 10) / 10},${Math.round(p.z * 10) / 10}`;
  });
  return `${len}|${parts.join("|")}`;
}

function normalizeAngleDeg(angle: number): number {
  let a = angle;
  while (a > 180) a -= 360;
  while (a <= -180) a += 360;
  return a;
}

function normalizeLabelAngleDeg(angle: number): number {
  let a = normalizeAngleDeg(angle);
  if (a > 90) a -= 180;
  if (a < -90) a += 180;
  return a;
}

function angleDiffDeg(a: number, b: number): number {
  return Math.abs(normalizeAngleDeg(a - b));
}

function totalLineLength(coords: WorldPointXZ[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++)
    total += dist(coords[i - 1], coords[i]);
  return total;
}

function pointAtChainage(
  coords: WorldPointXZ[],
  chainage: number,
): PointOnLine | null {
  if (coords.length < 2) return null;
  const target = Math.max(0, chainage);
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const seg = dist(a, b);
    if (seg <= 1e-9) continue;
    if (acc + seg >= target) {
      const u = clamp((target - acc) / seg, 0, 1);
      const x = a.x + (b.x - a.x) * u;
      const z = a.z + (b.z - a.z) * u;
      const rotateDeg = normalizeLabelAngleDeg(
        (Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI,
      );
      return { point: { x, z }, rotateDeg, segmentIndex: i - 1 };
    }
    acc += seg;
  }

  const a = coords[coords.length - 2];
  const b = coords[coords.length - 1];
  const rotateDeg = normalizeLabelAngleDeg(
    (Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI,
  );
  return {
    point: { x: b.x, z: b.z },
    rotateDeg,
    segmentIndex: coords.length - 2,
  };
}

function angleAtChainage(
  coords: WorldPointXZ[],
  chainage: number,
): number | null {
  const p = pointAtChainage(coords, chainage);
  return p ? p.rotateDeg : null;
}


function resolveLineTextPathHalfLength(options: {
  totalLength: number;
  spacing: number;
  anchor?: DisplayAnchorConfig | null;
}): number {
  const total = Math.max(0, finiteNumber(options.totalLength, 0));
  const spacing = Math.max(1, finiteNumber(options.spacing, DEFAULT_LINE_CANDIDATE_SPACING));
  if (total <= 1e-9) return 0;
  const multiplier = Math.max(
    0.1,
    finiteNumber(options.anchor?.lineTextPathHalfLengthMultiplier, 1.6),
  );
  const minWorld = Math.max(
    0,
    finiteNumber(options.anchor?.lineTextPathMinHalfLengthWorld, 160),
  );
  const maxWorld = Math.max(
    1,
    finiteNumber(options.anchor?.lineTextPathMaxHalfLengthWorld, Number.POSITIVE_INFINITY),
  );
  const maxRatio = clamp(
    finiteNumber(options.anchor?.lineTextPathMaxHalfLengthRatio, 0.46),
    0.08,
    0.49,
  );
  const ratioCap = Math.max(1, total * maxRatio);
  return clamp(Math.max(minWorld, spacing * multiplier), 40, Math.min(maxWorld, ratioCap));
}

function pathSliceAroundChainage(
  coords: WorldPointXZ[],
  chainage: number,
  halfLength: number,
): { path: WorldPointXZ[]; length: number } | null {
  const total = totalLineLength(coords);
  if (coords.length < 2 || total <= 1e-9) return null;
  const start = clamp(chainage - halfLength, 0, total);
  const end = clamp(chainage + halfLength, 0, total);
  if (end - start <= 1e-9) return null;

  const startPoint = pointAtChainage(coords, start)?.point;
  const endPoint = pointAtChainage(coords, end)?.point;
  if (!startPoint || !endPoint) return null;

  const out: WorldPointXZ[] = [startPoint];
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const seg = dist(a, b);
    if (seg <= 1e-9) continue;
    const next = acc + seg;
    if (next > start && next < end) out.push({ x: b.x, z: b.z });
    acc = next;
  }
  out.push(endPoint);

  const cleaned: WorldPointXZ[] = [];
  for (const p of out) {
    const prev = cleaned[cleaned.length - 1];
    if (!prev || dist(prev, p) > 1e-6) cleaned.push(p);
  }
  return cleaned.length >= 2 ? { path: cleaned, length: end - start } : null;
}

function angleDeltaAround(
  coords: WorldPointXZ[],
  chainage: number,
  total: number,
  spacing: number,
): number {
  const window = clamp(spacing * 0.3, 20, 120);
  const left = angleAtChainage(coords, clamp(chainage - window, 0, total));
  const mid = angleAtChainage(coords, clamp(chainage, 0, total));
  const right = angleAtChainage(coords, clamp(chainage + window, 0, total));
  if (left == null || mid == null || right == null) return 0;
  return Math.max(
    angleDiffDeg(left, mid),
    angleDiffDeg(mid, right),
    angleDiffDeg(left, right),
  );
}

function inRect(p: WorldPointXZ, r: WorldRectXZ): boolean {
  return p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
}


function roundedChainageKey(chainage: number): string {
  return String(Math.round(chainage * 1000) / 1000);
}

function makeCandidateId(
  kind: StableLineAnchorCandidate["kind"],
  sourceIndex: number,
  chainage: number,
): string {
  if (kind === "midpoint") return "midpoint";
  if (kind === "fallback") return "fallback:midpoint";
  return `${kind}:${sourceIndex}:${roundedChainageKey(chainage)}`;
}

function uniqueSortedChainages(values: number[], total: number): number[] {
  const seen = new Set<string>();
  const out: number[] = [];
  for (const value of values) {
    const v = clamp(value, 0, total);
    const key = String(Math.round(v * 1000) / 1000);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function buildCenterOutChainages(
  start: number,
  end: number,
  total: number,
  spacing: number,
  max: number,
): number[] {
  const mid = total * 0.5;
  const out: number[] = [];
  const add = (value: number) => {
    if (out.length >= max) return;
    if (value < start - 1e-9 || value > end + 1e-9) return;
    out.push(value);
  };
  add(mid);
  for (let step = 1; out.length < max; step++) {
    const delta = spacing * step;
    const before = out.length;
    add(mid + delta);
    add(mid - delta);
    if (before === out.length && mid + delta > end && mid - delta < start)
      break;
  }
  return uniqueSortedChainages(out, total);
}

function buildCandidateChainages(
  total: number,
  anchor: DisplayAnchorConfig | null | undefined,
): {
  chainages: number[];
  kind: StableLineAnchorCandidate["kind"];
  spacing: number;
} {
  const minSpacing = Math.max(
    1,
    finiteNumber(
      anchor?.lineCandidateMinSpacing,
      DEFAULT_LINE_CANDIDATE_MIN_SPACING,
    ),
  );
  const spacing = Math.max(
    minSpacing,
    finiteNumber(anchor?.lineCandidateSpacing, DEFAULT_LINE_CANDIDATE_SPACING),
  );
  const max = Math.max(
    1,
    Math.floor(
      finiteNumber(anchor?.lineCandidateMax, DEFAULT_LINE_CANDIDATE_MAX),
    ),
  );
  const shortMultiplier = Math.max(
    1,
    finiteNumber(
      anchor?.lineShortThresholdMultiplier,
      DEFAULT_SHORT_THRESHOLD_MULTIPLIER,
    ),
  );

  if (total <= 1e-9) return { chainages: [], kind: "fallback", spacing };

  if (total < spacing * shortMultiplier) {
    return { chainages: [total * 0.5], kind: "midpoint", spacing };
  }

  const paddingRatio = clamp(
    finiteNumber(
      anchor?.lineCandidateEndpointPaddingRatio,
      DEFAULT_ENDPOINT_PADDING_RATIO,
    ),
    0,
    0.45,
  );
  const paddingMin = Math.max(
    0,
    finiteNumber(
      anchor?.lineCandidateEndpointPaddingMin,
      DEFAULT_ENDPOINT_PADDING_MIN,
    ),
  );
  let pad = Math.max(total * paddingRatio, paddingMin);
  if (pad * 2 >= total) pad = total * 0.12;
  const start = clamp(pad, 0, total * 0.49);
  const end = clamp(total - pad, total * 0.51, total);
  const usable = Math.max(0, end - start);

  if (usable <= 1e-9)
    return { chainages: [total * 0.5], kind: "midpoint", spacing };

  const ordering = anchor?.lineCandidateOrdering ?? "centerOut";
  const theoretical = Math.max(1, Math.floor(usable / spacing) + 1);
  if (theoretical > max) {
    if (ordering === "centerOut") {
      const evenSpacing =
        max <= 1 ? usable : Math.max(1, usable / Math.max(1, max - 1));
      return {
        chainages: buildCenterOutChainages(start, end, total, evenSpacing, max),
        kind: "evenSplit",
        spacing: evenSpacing,
      };
    }
    if (max === 1)
      return { chainages: [total * 0.5], kind: "evenSplit", spacing };
    const out: number[] = [];
    for (let i = 0; i < max; i++) {
      const t = max === 1 ? 0.5 : i / (max - 1);
      out.push(start + usable * t);
    }
    return { chainages: out, kind: "evenSplit", spacing };
  }

  if (ordering === "centerOut") {
    return {
      chainages: buildCenterOutChainages(start, end, total, spacing, max),
      kind: "spacing",
      spacing,
    };
  }

  const out: number[] = [];
  for (let c = start; c <= end + 1e-9; c += spacing) out.push(c);
  out.push(total * 0.5);
  return {
    chainages: uniqueSortedChainages(out, total),
    kind: "spacing",
    spacing,
  };
}

function orderAndWeightCandidates(
  candidates: StableLineAnchorCandidate[],
  total: number,
  anchor: DisplayAnchorConfig | null | undefined,
): StableLineAnchorCandidate[] {
  const center = total * 0.5;
  const mode = anchor?.lineCenterWeightMode ?? "distanceToCenter";
  const half = Math.max(1, total * 0.5);
  return [...candidates]
    .sort((a, b) => {
      const da = Math.abs(a.chainage - center);
      const db = Math.abs(b.chainage - center);
      if (da !== db) return da - db;
      return a.chainage - b.chainage;
    })
    .map((c, index) => {
      const distanceToMidpoint = Math.abs(c.chainage - center);
      const staticWeight =
        mode === "none"
          ? 0
          : 100 * (1 - clamp(distanceToMidpoint / half, 0, 1));
      return {
        ...c,
        // index/sourceIndex are immutable; displayOrder is the only order field.
        index: c.index,
        sourceIndex: c.sourceIndex,
        displayOrder: index,
        distanceToMidpoint,
        staticWeight,
        finalScore: staticWeight,
        scoreParts: { staticWeight, distanceToMidpoint },
      };
    });
}

function makeCacheKey(
  featureKey: string,
  coords: WorldPointXZ[],
  anchor: DisplayAnchorConfig | null | undefined,
): string {
  const spacing = finiteNumber(
    anchor?.lineCandidateSpacing,
    DEFAULT_LINE_CANDIDATE_SPACING,
  );
  const minSpacing = finiteNumber(
    anchor?.lineCandidateMinSpacing,
    DEFAULT_LINE_CANDIDATE_MIN_SPACING,
  );
  const max = finiteNumber(
    anchor?.lineCandidateMax,
    DEFAULT_LINE_CANDIDATE_MAX,
  );
  const short = finiteNumber(
    anchor?.lineShortThresholdMultiplier,
    DEFAULT_SHORT_THRESHOLD_MULTIPLIER,
  );
  const endpointRatio = finiteNumber(
    anchor?.lineCandidateEndpointPaddingRatio,
    DEFAULT_ENDPOINT_PADDING_RATIO,
  );
  const endpointMin = finiteNumber(
    anchor?.lineCandidateEndpointPaddingMin,
    DEFAULT_ENDPOINT_PADDING_MIN,
  );
  const maxAngle = finiteNumber(
    anchor?.maxAngleDeltaDeg,
    DEFAULT_MAX_ANGLE_DELTA_DEG,
  );
  return [
    featureKey,
    geometryHash(coords),
    Math.round(spacing * 100) / 100,
    Math.round(minSpacing * 100) / 100,
    Math.floor(max),
    Math.round(short * 100) / 100,
    Math.round(endpointRatio * 1000) / 1000,
    Math.round(endpointMin * 100) / 100,
    Math.round(maxAngle * 100) / 100,
    Math.round(finiteNumber(anchor?.lineTextPathHalfLengthMultiplier, 1.6) * 100) / 100,
    Math.round(finiteNumber(anchor?.lineTextPathMinHalfLengthWorld, 160) * 100) / 100,
    Math.round(finiteNumber(anchor?.lineTextPathMaxHalfLengthRatio, 0.46) * 1000) / 1000,
    anchor?.lineCandidateOrdering ?? "centerOut",
    anchor?.lineCenterWeightMode ?? "distanceToCenter",
  ].join("|");
}

function buildCandidates(
  coords: WorldPointXZ[],
  anchor: DisplayAnchorConfig | null | undefined,
): StableLineAnchorCandidate[] {
  const total = totalLineLength(coords);
  const { chainages, kind, spacing } = buildCandidateChainages(total, anchor);
  const maxAngleDelta = finiteNumber(
    anchor?.maxAngleDeltaDeg,
    DEFAULT_MAX_ANGLE_DELTA_DEG,
  );

  const raw: StableLineAnchorCandidate[] = [];
  const textPathHalfLength = resolveLineTextPathHalfLength({
    totalLength: total,
    spacing,
    anchor,
  });
  for (const chainage of chainages) {
    const p = pointAtChainage(coords, chainage);
    if (!p) continue;
    const pathSlice = pathSliceAroundChainage(
      coords,
      chainage,
      textPathHalfLength,
    );
    const sourceIndex = raw.length;
    raw.push({
      index: sourceIndex,
      candidateId: makeCandidateId(kind, sourceIndex, chainage),
      sourceIndex,
      displayOrder: sourceIndex,
      chainage,
      worldXZ: p.point,
      rotateDeg: p.rotateDeg,
      kind,
      angleDeltaDeg: angleDeltaAround(coords, chainage, total, spacing),
      pathWorldXZ: pathSlice?.path,
      pathLengthWorld: pathSlice?.length,
    });
  }

  if (raw.length === 0) {
    const p = pointAtChainage(coords, total * 0.5);
    if (!p) return [];
    const pathSlice = pathSliceAroundChainage(
      coords,
      total * 0.5,
      Math.min(
        total * 0.48,
        resolveLineTextPathHalfLength({ totalLength: total, spacing, anchor }),
      ),
    );
    return [
      {
        index: 0,
        candidateId: "fallback:midpoint",
        sourceIndex: 0,
        displayOrder: 0,
        chainage: total * 0.5,
        worldXZ: p.point,
        rotateDeg: p.rotateDeg,
        kind: "fallback",
        angleDeltaDeg: 0,
        pathWorldXZ: pathSlice?.path,
        pathLengthWorld: pathSlice?.length,
      },
    ];
  }

  const filtered = raw.filter((c) => (c.angleDeltaDeg ?? 0) <= maxAngleDelta);
  return orderAndWeightCandidates(
    filtered.length ? filtered : raw,
    total,
    anchor,
  );
}

function pruneForViewport(
  candidates: StableLineAnchorCandidate[],
  viewportRect: WorldRectXZ | null | undefined,
  anchor: DisplayAnchorConfig | null | undefined,
): StableLineAnchorCandidate[] {
  if (!viewportRect || !anchor?.preferPreviousLineCandidate) return candidates;
  const visible = candidates.filter((c) => inRect(c.worldXZ, viewportRect));
  // Keep the full deterministic list when few candidates are visible. The screen
  // viewport gate in labelLayout will still hide invalid candidates, and keeping
  // order stable protects placement-cache anchor indexes.
  if (visible.length < Math.min(4, candidates.length)) return candidates;
  const visibleSet = new Set(visible.map((c) => c.candidateId));
  return [
    ...visible,
    ...candidates.filter((c) => !visibleSet.has(c.candidateId)),
  ].map((c, displayOrder) => ({ ...c, displayOrder }));
}

function rememberCache(entry: CacheEntry) {
  CACHE.set(entry.key, entry);
  if (CACHE.size > MAX_CACHE_SIZE) {
    const first = CACHE.keys().next();
    if (!first.done) CACHE.delete(first.value);
  }
}

export function getStableLineAnchorCandidates(options: {
  featureKey: string;
  coords: WorldPointXZ[];
  anchor?: DisplayAnchorConfig | null;
  viewportRect?: WorldRectXZ | null;
}): StableLineAnchorCandidate[] {
  const coords = options.coords.filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.z),
  );
  if (coords.length < 2) return [];

  const key = makeCacheKey(options.featureKey, coords, options.anchor);
  let entry = CACHE.get(key);
  if (!entry) {
    entry = {
      key,
      candidates: buildCandidates(coords, options.anchor),
      createdAt: Date.now(),
    };
    rememberCache(entry);
  }

  return pruneForViewport(
    entry.candidates,
    options.viewportRect,
    options.anchor,
  );
}

export function clearStableLineAnchorCache() {
  CACHE.clear();
}
