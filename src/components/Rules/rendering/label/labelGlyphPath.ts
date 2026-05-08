import * as L from "leaflet";
import type {
  CjkGlyphRotationPolicy,
  DisplayAnchorConfig,
  TextPathStatus,
} from "@/components/Rules/rendering/display/displayTypes";
import { isMostlyCjkText } from "@/components/Rules/rendering/label/labelTextPath";

export type CjkGlyphPathGlyph = {
  char: string;
  x: number;
  y: number;
  rotateDeg: number;
  localAngleDeg: number;
  chainagePx: number;
  isCjk: boolean;
};

export type CjkGlyphPathPlan = {
  mode: "cjkGlyphPath";
  text: string;
  glyphs: CjkGlyphPathGlyph[];
  width: number;
  height: number;
  viewBox: string;
  markerContainerPoint: L.Point;
  pathLengthPx: number;
  estimatedTextWidthPx: number;
  status?: TextPathStatus;
  compactUsed?: boolean;
  advanceScale?: number;
};

export type CjkGlyphPathLayoutMetrics = {
  collisionRect: { x: number; y: number; w: number; h: number };
  pathLengthPx: number;
  estimatedTextWidthPx: number;
  glyphCount: number;
  status?: TextPathStatus;
  compactUsed?: boolean;
  advanceScale?: number;
};

export type CjkGlyphPathBuildOptions = {
  map: L.Map;
  text: string;
  pathLatLngs: L.LatLng[];
  anchor?: Partial<DisplayAnchorConfig> | null;
  fontSizePx?: number;
  cacheKeyHint?: string;
  metricsOnly?: boolean;
};

export type CjkGlyphPathFailureReason =
  | "disabled"
  | "notCjk"
  | "emptyText"
  | "tooManyGlyphs"
  | "missingPath"
  | "pathTooShort"
  | "pathTooShortAfterCompact"
  | "angleTooSharp"
  | "totalBendTooLarge"
  | "planFailed";

export type CjkGlyphPathBuildResult = {
  plan?: CjkGlyphPathPlan;
  metrics?: CjkGlyphPathLayoutMetrics;
  status: TextPathStatus;
  failureReason?: CjkGlyphPathFailureReason;
  compactUsed?: boolean;
  advanceScale?: number;
  cacheKey?: string;
};

const DEFAULT_FONT_SIZE_PX = 14;
const DEFAULT_GLYPH_SPACING_PX = 2;
const DEFAULT_COLLISION_PADDING_PX = 8;
const DEFAULT_UPRIGHT_THRESHOLD_DEG = 45;
const DEFAULT_MIN_PATH_LENGTH_PX = 28;
const DEFAULT_MAX_GLYPHS = 16;
const DEFAULT_MAX_LOCAL_ANGLE_DELTA_DEG = 70;
const DEFAULT_MAX_TOTAL_BEND_DEG = 160;
const DEFAULT_MIN_ADVANCE_SCALE = 0.62;
const SVG_PAD_PX = 24;
const CACHE_MAX = 2500;
const approxMetricsCache = new Map<string, CjkGlyphPathBuildResult>();

type BaseGlyphPath = {
  anchor: Partial<DisplayAnchorConfig>;
  chars: string[];
  points: L.Point[];
  lengthPx: number;
  fontSizePx: number;
  spacingPx: number;
  normalAdvancePx: number;
  advancePx: number;
  estimatedTextWidthPx: number;
  compactUsed: boolean;
  advanceScale: number;
};

function finiteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isCjkChar(ch: string): boolean {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/.test(
    ch,
  );
}

function glyphChars(text: string): string[] {
  return Array.from(String(text ?? "")).filter((ch) => /\S/.test(ch));
}

function dist(a: L.Point, b: L.Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function angleDeg(a: L.Point, b: L.Point): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function normAngle(a: number): number {
  let x = a;
  while (x > 180) x -= 360;
  while (x <= -180) x += 360;
  return x;
}

function angleDiff(a: number, b: number): number {
  return Math.abs(normAngle(a - b));
}

function normalizeReadableAngle(angle: number): number {
  let a = normAngle(angle);
  if (a > 90) a -= 180;
  if (a < -90) a += 180;
  return a;
}

function resolveGlyphRotation(
  localAngleDeg: number,
  policy: CjkGlyphRotationPolicy,
  thresholdDeg: number,
): number {
  const readable = normalizeReadableAngle(localAngleDeg);
  if (policy === "followLine") return readable;
  if (policy === "alwaysUpright") return 0;
  return Math.abs(readable) > thresholdDeg ? 0 : readable;
}

function simplifyDuplicatePoints(points: L.Point[]): L.Point[] {
  const out: L.Point[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev || dist(prev, p) > 1) out.push(p);
  }
  return out;
}

function pointsFromLatLngs(map: L.Map, pathLatLngs: L.LatLng[]): L.Point[] {
  return simplifyDuplicatePoints(
    (pathLatLngs ?? [])
      .map((ll) => {
        try {
          return map.latLngToContainerPoint(ll);
        } catch {
          return null;
        }
      })
      .filter(
        (p): p is L.Point =>
          !!p && Number.isFinite(p.x) && Number.isFinite(p.y),
      ),
  );
}

function preferReadableDirection(points: L.Point[]): L.Point[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? [...points].reverse() : points;
  return dy < 0 ? [...points].reverse() : points;
}

function cumulativeLengths(points: L.Point[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) {
    out.push(out[out.length - 1] + dist(points[i - 1], points[i]));
  }
  return out;
}

function pathLength(points: L.Point[]): number {
  const cum = cumulativeLengths(points);
  return cum[cum.length - 1] ?? 0;
}

function maxLocalAngleDelta(points: L.Point[]): number {
  let max = 0;
  for (let i = 2; i < points.length; i++) {
    const a0 = angleDeg(points[i - 2], points[i - 1]);
    const a1 = angleDeg(points[i - 1], points[i]);
    max = Math.max(max, angleDiff(a0, a1));
  }
  return max;
}

function totalBend(points: L.Point[]): number {
  let total = 0;
  for (let i = 2; i < points.length; i++) {
    total += angleDiff(
      angleDeg(points[i - 2], points[i - 1]),
      angleDeg(points[i - 1], points[i]),
    );
  }
  return total;
}

function pointAtChainage(
  points: L.Point[],
  cum: number[],
  chainagePx: number,
): { point: L.Point; angleDeg: number } | null {
  if (points.length < 2 || cum.length !== points.length) return null;
  const total = cum[cum.length - 1] ?? 0;
  const target = Math.max(0, Math.min(total, chainagePx));
  for (let i = 1; i < points.length; i++) {
    const start = cum[i - 1];
    const end = cum[i];
    if (target <= end || i === points.length - 1) {
      const segLen = Math.max(0.0001, end - start);
      const t = Math.max(0, Math.min(1, (target - start) / segLen));
      const a = points[i - 1];
      const b = points[i];
      return {
        point: L.point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t),
        angleDeg: angleDeg(a, b),
      };
    }
  }
  return null;
}

function boundsForPoints(points: L.Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  if (!points.length || !Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }
  return { minX, minY, maxX, maxY };
}

function rotateBoxCorners(cx: number, cy: number, half: number, angle: number): L.Point[] {
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const base = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];
  return base.map(([x, y]) => L.point(cx + x * cos - y * sin, cy + x * sin + y * cos));
}

function buildGlyphCollisionRect(
  glyphs: CjkGlyphPathGlyph[],
  fontSizePx: number,
  paddingPx: number,
) {
  const corners: L.Point[] = [];
  const half = Math.max(8, fontSizePx * 0.62);
  for (const g of glyphs) corners.push(...rotateBoxCorners(g.x, g.y, half, g.rotateDeg));
  const b = boundsForPoints(corners.length ? corners : glyphs.map((g) => L.point(g.x, g.y)));
  return {
    x: b.minX - paddingPx,
    y: b.minY - paddingPx,
    w: Math.max(1, b.maxX - b.minX + paddingPx * 2),
    h: Math.max(1, b.maxY - b.minY + paddingPx * 2),
  };
}

function approxTextBoxCollisionRect(
  base: BaseGlyphPath,
  paddingPx: number,
) {
  const b = boundsForPoints(base.points);
  const center = L.point((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
  const length = Math.max(base.estimatedTextWidthPx, base.fontSizePx);
  const height = Math.max(base.fontSizePx * 1.5, 22);
  const mode = base.anchor.lineTextCollisionRectMode ?? "compactTextBox";
  if (mode === "pathBox") {
    return {
      x: b.minX - paddingPx,
      y: b.minY - paddingPx,
      w: Math.max(b.maxX - b.minX, length) + paddingPx * 2,
      h: Math.max(b.maxY - b.minY, height) + paddingPx * 2,
    };
  }
  return {
    x: center.x - length / 2 - paddingPx,
    y: center.y - height / 2 - paddingPx,
    w: length + paddingPx * 2,
    h: height + paddingPx * 2,
  };
}

function cacheKey(options: CjkGlyphPathBuildOptions, mode: "approx" | "plan"): string {
  if (options.cacheKeyHint) return `${mode}|${options.cacheKeyHint}`;
  const zoom = Math.round((options.map.getZoom?.() ?? 0) * 2) / 2;
  const pathKey = (options.pathLatLngs ?? [])
    .slice(0, 10)
    .map((ll) => `${Math.round(ll.lat * 1e5)},${Math.round(ll.lng * 1e5)}`)
    .join("|");
  const a = options.anchor ?? {};
  return [
    mode,
    zoom,
    options.text,
    pathKey,
    a.cjkGlyphPathMode ?? "auto",
    a.cjkGlyphRotationPolicy ?? "uprightWhenSteep",
    a.cjkGlyphUprightAngleThresholdDeg ?? DEFAULT_UPRIGHT_THRESHOLD_DEG,
    a.cjkGlyphCompactMode ?? "auto",
    a.cjkGlyphMinAdvanceScale ?? DEFAULT_MIN_ADVANCE_SCALE,
    options.fontSizePx ?? DEFAULT_FONT_SIZE_PX,
  ].join("|");
}

function remember<T>(cache: Map<string, T>, key: string, value: T) {
  cache.set(key, value);
  if (cache.size > CACHE_MAX) {
    const first = cache.keys().next();
    if (!first.done) cache.delete(first.value);
  }
}

function failure(
  status: TextPathStatus,
  reason: CjkGlyphPathFailureReason,
  cacheKey?: string,
): CjkGlyphPathBuildResult {
  return { status, failureReason: reason, cacheKey };
}

function buildGlyphPathBase(options: CjkGlyphPathBuildOptions, key: string): CjkGlyphPathBuildResult | BaseGlyphPath {
  const anchor = options.anchor ?? {};
  if ((anchor.cjkGlyphPathMode ?? "auto") === "off") {
    return failure("fallbackCjkGlyphPathDisabled", "disabled", key);
  }
  if (!isMostlyCjkText(options.text)) {
    return failure("fallbackCjkGlyphPathDisabled", "notCjk", key);
  }
  const chars = glyphChars(options.text);
  if (!chars.length) return failure("fallbackCjkGlyphPathDisabled", "emptyText", key);
  const maxGlyphs = Math.max(1, finiteNumber(anchor.cjkGlyphMaxCount, DEFAULT_MAX_GLYPHS));
  if (chars.length > maxGlyphs) {
    return failure("fallbackCjkGlyphPathTextTooLong", "tooManyGlyphs", key);
  }

  const rawPoints = pointsFromLatLngs(options.map, options.pathLatLngs);
  if (rawPoints.length < 2) return failure("fallbackMissingPath", "missingPath", key);
  const points = anchor.cjkGlyphPreferReadableDirection === false
    ? rawPoints
    : preferReadableDirection(rawPoints);
  const len = pathLength(points);
  const minLen = Math.max(0, finiteNumber(anchor.cjkGlyphMinPathLengthPx, DEFAULT_MIN_PATH_LENGTH_PX));
  if (len < minLen) return failure("fallbackCjkGlyphPathTooShort", "pathTooShort", key);

  const maxLocal = Math.max(1, finiteNumber(anchor.cjkGlyphMaxAngleDeltaDeg, DEFAULT_MAX_LOCAL_ANGLE_DELTA_DEG));
  if (maxLocalAngleDelta(points) > maxLocal) {
    return failure("fallbackCjkGlyphPathAngleTooSharp", "angleTooSharp", key);
  }

  const maxTotal = Math.max(1, finiteNumber(anchor.cjkGlyphMaxTotalBendDeg, DEFAULT_MAX_TOTAL_BEND_DEG));
  if (totalBend(points) > maxTotal) {
    return failure("fallbackCjkGlyphPathAngleTooSharp", "totalBendTooLarge", key);
  }

  const fontSizePx = Math.max(8, finiteNumber(options.fontSizePx, DEFAULT_FONT_SIZE_PX));
  const spacingPx = Math.max(0, finiteNumber(anchor.cjkGlyphSpacingPx, DEFAULT_GLYPH_SPACING_PX));
  const normalAdvancePx = fontSizePx * 1.05 + spacingPx;
  const normalSpan = Math.max(fontSizePx, (chars.length - 1) * normalAdvancePx + fontSizePx);
  let advancePx = normalAdvancePx;
  let compactUsed = false;
  let estimatedTextWidthPx = normalSpan;

  if (len < normalSpan) {
    const compactMode = anchor.cjkGlyphCompactMode ?? "auto";
    if (compactMode !== "auto") {
      return failure("fallbackCjkGlyphPathTooShort", "pathTooShort", key);
    }
    const availableSpan = Math.max(0, len - fontSizePx);
    const compactAdvance = chars.length > 1 ? availableSpan / Math.max(1, chars.length - 1) : fontSizePx;
    const minScale = Math.max(0.35, Math.min(1, finiteNumber(anchor.cjkGlyphMinAdvanceScale, DEFAULT_MIN_ADVANCE_SCALE)));
    const minAdvance = normalAdvancePx * minScale;
    if (compactAdvance < minAdvance) {
      return failure("fallbackCjkGlyphPathTooShortAfterCompact", "pathTooShortAfterCompact", key);
    }
    advancePx = compactAdvance;
    estimatedTextWidthPx = Math.max(fontSizePx, (chars.length - 1) * advancePx + fontSizePx);
    compactUsed = true;
  }

  return {
    anchor,
    chars,
    points,
    lengthPx: len,
    fontSizePx,
    spacingPx,
    normalAdvancePx,
    advancePx,
    estimatedTextWidthPx,
    compactUsed,
    advanceScale: normalAdvancePx > 0 ? advancePx / normalAdvancePx : 1,
  };
}

function buildCjkGlyphPathApproxOnly(options: CjkGlyphPathBuildOptions): CjkGlyphPathBuildResult {
  const key = cacheKey(options, "approx");
  const cached = approxMetricsCache.get(key);
  if (cached) return cached;
  const baseOrFailure = buildGlyphPathBase(options, key);
  if ("status" in baseOrFailure) {
    remember(approxMetricsCache, key, baseOrFailure);
    return baseOrFailure;
  }
  const base = baseOrFailure;
  const collisionPaddingPx = Math.max(0, finiteNumber(base.anchor.cjkGlyphCollisionPaddingPx, DEFAULT_COLLISION_PADDING_PX));
  const metrics: CjkGlyphPathLayoutMetrics = {
    collisionRect: approxTextBoxCollisionRect(base, collisionPaddingPx),
    pathLengthPx: base.lengthPx,
    estimatedTextWidthPx: base.estimatedTextWidthPx,
    glyphCount: base.chars.length,
    status: base.compactUsed ? "usedCjkGlyphPathCompact" : "usedCjkGlyphPath",
    compactUsed: base.compactUsed,
    advanceScale: base.advanceScale,
  };
  const result: CjkGlyphPathBuildResult = {
    metrics,
    status: metrics.status ?? "usedCjkGlyphPath",
    compactUsed: base.compactUsed,
    advanceScale: base.advanceScale,
    cacheKey: key,
  };
  remember(approxMetricsCache, key, result);
  return result;
}

function buildCjkGlyphPathFullPlan(options: CjkGlyphPathBuildOptions): CjkGlyphPathBuildResult {
  const key = cacheKey(options, "plan");
  // RB_SLU_24: do not cache full glyph plans. They contain
  // viewport-container coordinates (markerContainerPoint and glyph x/y), which
  // become invalid after pan/zoom and caused stale line-label offsets.
  const baseOrFailure = buildGlyphPathBase(options, key);
  if ("status" in baseOrFailure) {
    return baseOrFailure;
  }
  const base = baseOrFailure;
  const cum = cumulativeLengths(base.points);
  const start = (base.lengthPx - (base.chars.length - 1) * base.advancePx) / 2;
  const policy = base.anchor.cjkGlyphRotationPolicy ?? "uprightWhenSteep";
  const threshold = Math.max(0, finiteNumber(base.anchor.cjkGlyphUprightAngleThresholdDeg, DEFAULT_UPRIGHT_THRESHOLD_DEG));
  const glyphs: CjkGlyphPathGlyph[] = [];

  for (let i = 0; i < base.chars.length; i++) {
    const chainagePx = start + i * base.advancePx;
    const sampled = pointAtChainage(base.points, cum, chainagePx);
    if (!sampled) {
      return failure("fallbackCjkGlyphPlanFailed", "planFailed", key);
    }
    const readableLocal = normalizeReadableAngle(sampled.angleDeg);
    glyphs.push({
      char: base.chars[i],
      x: sampled.point.x,
      y: sampled.point.y,
      rotateDeg: resolveGlyphRotation(readableLocal, policy, threshold),
      localAngleDeg: readableLocal,
      chainagePx,
      isCjk: isCjkChar(base.chars[i]),
    });
  }

  const collisionPaddingPx = Math.max(0, finiteNumber(base.anchor.cjkGlyphCollisionPaddingPx, DEFAULT_COLLISION_PADDING_PX));
  const collisionRect = buildGlyphCollisionRect(glyphs, base.fontSizePx, collisionPaddingPx);
  const center = L.point(collisionRect.x + collisionRect.w / 2, collisionRect.y + collisionRect.h / 2);
  const width = Math.max(1, Math.ceil(collisionRect.w + SVG_PAD_PX * 2));
  const height = Math.max(1, Math.ceil(collisionRect.h + SVG_PAD_PX * 2));
  const minX = collisionRect.x - SVG_PAD_PX;
  const minY = collisionRect.y - SVG_PAD_PX;
  const localGlyphs = glyphs.map((g) => ({ ...g, x: g.x - minX, y: g.y - minY }));
  const status: TextPathStatus = base.compactUsed ? "usedCjkGlyphPathCompact" : "usedCjkGlyphPath";
  const plan: CjkGlyphPathPlan = {
    mode: "cjkGlyphPath",
    text: options.text,
    glyphs: localGlyphs,
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    markerContainerPoint: center,
    pathLengthPx: base.lengthPx,
    estimatedTextWidthPx: base.estimatedTextWidthPx,
    status,
    compactUsed: base.compactUsed,
    advanceScale: base.advanceScale,
  };
  const metrics: CjkGlyphPathLayoutMetrics = {
    collisionRect,
    pathLengthPx: base.lengthPx,
    estimatedTextWidthPx: base.estimatedTextWidthPx,
    glyphCount: glyphs.length,
    status,
    compactUsed: base.compactUsed,
    advanceScale: base.advanceScale,
  };
  const result: CjkGlyphPathBuildResult = {
    plan,
    metrics,
    status,
    compactUsed: base.compactUsed,
    advanceScale: base.advanceScale,
    cacheKey: key,
  };
  return result;
}

export function buildCjkGlyphPathApproxMetricsResult(
  options: CjkGlyphPathBuildOptions,
): CjkGlyphPathBuildResult {
  return buildCjkGlyphPathApproxOnly({ ...options, metricsOnly: true });
}

export function buildCjkGlyphPathPlanResult(
  options: CjkGlyphPathBuildOptions,
): CjkGlyphPathBuildResult {
  return buildCjkGlyphPathFullPlan(options);
}

export function buildCjkGlyphPathPlanAndMetrics(
  options: CjkGlyphPathBuildOptions,
): { plan: CjkGlyphPathPlan; metrics: CjkGlyphPathLayoutMetrics } | null {
  const result = buildCjkGlyphPathPlanResult(options);
  return result.plan && result.metrics ? { plan: result.plan, metrics: result.metrics } : null;
}

export function buildCjkGlyphPathPlan(
  options: CjkGlyphPathBuildOptions,
): CjkGlyphPathPlan | null {
  return buildCjkGlyphPathPlanResult(options).plan ?? null;
}

export function buildCjkGlyphPathApproxMetrics(
  options: CjkGlyphPathBuildOptions,
): CjkGlyphPathLayoutMetrics | null {
  return buildCjkGlyphPathApproxMetricsResult(options).metrics ?? null;
}


export function evaluateCjkGlyphPathEligibility(options: {
  map: L.Map;
  text: string;
  pathLatLngs: L.LatLng[];
  anchor?: Partial<DisplayAnchorConfig> | null;
  fontSizePx?: number;
}): { ok: boolean; estimatedTextWidthPx: number; failureReason?: string; status?: TextPathStatus } {
  const result = buildCjkGlyphPathApproxMetricsResult({
    map: options.map,
    text: options.text,
    pathLatLngs: options.pathLatLngs,
    anchor: options.anchor ?? null,
    fontSizePx: options.fontSizePx,
    metricsOnly: true,
  });
  return {
    ok: !!result.metrics,
    estimatedTextWidthPx: result.metrics?.estimatedTextWidthPx ?? 0,
    failureReason: result.failureReason,
    status: result.status,
  };
}
