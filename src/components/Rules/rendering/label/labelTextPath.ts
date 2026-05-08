import * as L from "leaflet";
import type {
  DisplayAnchorConfig,
  DisplayTextPathFallback,
  TextPathStatus,
} from "@/components/Rules/rendering/display/displayTypes";

/**
 * RB_SLU_17/18/19: SVG textPath planning for pure line-text labels.
 *
 * This module is intentionally text-only. It does not convert RLE pill/badge
 * structures, point markers, station markers, POI labels, or polygon labels.
 */

export type TextPathPlanMode =
  | "curvedTextPath"
  | "svgStraightLabel"
  | "svgVerticalCjk";

export type TextPathPlan = {
  pathD: string;
  viewBox: string;
  width: number;
  height: number;
  text: string;
  pathLengthPx: number;
  estimatedTextWidthPx: number;
  className: string;
  letterSpacingPx?: number;
  rotateDeg?: number;
  mode: TextPathPlanMode;
  status?: TextPathStatus;
  /** RB_SLU_19: true visual/click anchor for the SVG marker. */
  markerContainerPoint: L.Point;
};

export type TextPathBuildOptions = {
  map: L.Map;
  text: string;
  pathLatLngs: L.LatLng[];
  anchor?: Partial<DisplayAnchorConfig> | null;
  className?: string;
  rotateDeg?: number;
  fallback?: DisplayTextPathFallback | null;
  cacheKeyHint?: string;
};

export type TextPathLayoutMetrics = {
  collisionRect: { x: number; y: number; w: number; h: number };
  pathLengthPx: number;
  estimatedTextWidthPx: number;
  letterSpacingPx: number;
  mode: TextPathPlanMode;
  status?: TextPathStatus;
};

export type TextPathPlanAndMetrics = {
  plan: TextPathPlan;
  metrics: TextPathLayoutMetrics;
};

const DEFAULT_MIN_LENGTH_PX = 120;
const DEFAULT_PADDING_PX = 30;
const DEFAULT_COLLISION_PADDING_PX = 10;
const DEFAULT_MAX_LOCAL_ANGLE_DELTA_DEG = 45;
const DEFAULT_MAX_TOTAL_BEND_DEG = 100;
const DEFAULT_LETTER_SPACING_PX = 0.5;
const DEFAULT_CURVED_LETTER_SPACING_PX = 1.8;
const DEFAULT_CURVED_SPACING_MIN_BEND_DEG = 30;
const DEFAULT_VERTICAL_ANGLE_THRESHOLD_DEG = 45;
const DEFAULT_VERTICAL_LENGTH_RATIO = 0.6;
const SVG_PAD_PX = 22;
const DEFAULT_FONT_HEIGHT_PX = 30;
const DEFAULT_SVG_VERTICAL_MIN_LENGTH_PX = 24;
const DEFAULT_SVG_VERTICAL_LETTER_SPACING_PX = 1;
const APPROX_METRICS_CACHE_MAX = 2500;
const approxMetricsCache = new Map<string, TextPathLayoutMetrics>();

function finiteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function isMostlyCjkText(text: string): boolean {
  const chars = Array.from(String(text ?? "")).filter((ch) => /\S/.test(ch));
  if (!chars.length) return false;
  let cjk = 0;
  for (const ch of chars) {
    if (
      /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/.test(
        ch,
      )
    )
      cjk += 1;
  }
  return cjk / chars.length >= 0.5;
}

function estimateTextWidth(text: string, letterSpacingPx = 0): number {
  let w = 0;
  for (const ch of text) {
    if (/^[\x00-\x7F]$/.test(ch)) w += /[A-Z0-9]/.test(ch) ? 7.2 : 6.2;
    else w += 12.5;
  }
  const gaps = Math.max(0, Array.from(String(text ?? "")).length - 1);
  return Math.max(18, w + gaps * Math.max(0, letterSpacingPx));
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

function pathLength(points: L.Point[]): number {
  let n = 0;
  for (let i = 1; i < points.length; i++) n += dist(points[i - 1], points[i]);
  return n;
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

function preferReadableDirection(points: L.Point[]): L.Point[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  // Keep left-to-right screen reading by default. If the path runs mostly right-to-left, reverse it.
  if (last.x < first.x) return [...points].reverse();
  return points;
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
  return { minX, minY, maxX, maxY };
}

function resolveAnchor(
  anchor?: Partial<DisplayAnchorConfig> | null,
): Partial<DisplayAnchorConfig> {
  return anchor ?? {};
}

function resolveLetterSpacing(
  anchor: Partial<DisplayAnchorConfig>,
  bendDeg: number,
): number {
  const normal = Math.max(
    0,
    finiteNumber(anchor.textPathLetterSpacingPx, DEFAULT_LETTER_SPACING_PX),
  );
  const curved = Math.max(
    normal,
    finiteNumber(
      anchor.textPathCurvedLetterSpacingPx,
      DEFAULT_CURVED_LETTER_SPACING_PX,
    ),
  );
  const threshold = Math.max(
    0,
    finiteNumber(
      anchor.textPathCurvedSpacingMinBendDeg,
      DEFAULT_CURVED_SPACING_MIN_BEND_DEG,
    ),
  );
  return bendDeg >= threshold ? curved : normal;
}

function mainPathAngleDeg(points: L.Point[]): number {
  if (points.length < 2) return 0;
  const first = points[0];
  const last = points[points.length - 1];
  return normalizeReadableAngle(angleDeg(first, last));
}

function verticalLengthRatio(points: L.Point[], thresholdDeg: number): number {
  let total = 0;
  let vertical = 0;
  for (let i = 1; i < points.length; i++) {
    const seg = dist(points[i - 1], points[i]);
    if (seg <= 0) continue;
    total += seg;
    const a = Math.abs(
      normalizeReadableAngle(angleDeg(points[i - 1], points[i])),
    );
    if (a > thresholdDeg) vertical += seg;
  }
  return total > 0 ? vertical / total : 0;
}

export function shouldUseCjkUprightTextPath(
  options: Pick<
    TextPathBuildOptions,
    "map" | "text" | "pathLatLngs" | "anchor"
  >,
): boolean {
  const anchor = resolveAnchor(options.anchor);
  const policy = anchor.lineTextOrientationPolicy ?? "autoCjkUpright";
  if (policy === "alwaysTextPath") return false;
  if (policy === "alwaysRotated") return true;
  if (!isMostlyCjkText(options.text)) return false;
  const points = pointsFromLatLngs(options.map, options.pathLatLngs);
  if (points.length < 2) return false;
  const threshold = Math.max(
    1,
    finiteNumber(
      anchor.textPathVerticalAngleThresholdDeg,
      DEFAULT_VERTICAL_ANGLE_THRESHOLD_DEG,
    ),
  );
  const minRatio = Math.max(
    0,
    Math.min(
      1,
      finiteNumber(
        anchor.textPathVerticalLengthRatio,
        DEFAULT_VERTICAL_LENGTH_RATIO,
      ),
    ),
  );
  return (
    verticalLengthRatio(points, threshold) >= minRatio ||
    Math.abs(mainPathAngleDeg(points)) > threshold
  );
}

function shouldRenderSvgVerticalCjk(
  anchor: Partial<DisplayAnchorConfig>,
): boolean {
  // RB_SLU_21: the old whole-block vertical CJK SVG mode is disabled by
  // default because it breaks the core "label stays on line" requirement.
  // A future glyph-on-path patch should implement per-character placement.
  const mode = anchor.lineCjkVerticalRenderMode ?? "legacyVertical";
  return mode === "svgVertical" && (anchor as any).enableLegacySvgVerticalCjk === true;
}

function isCurvedPathEligible(
  points: L.Point[],
  text: string,
  anchor: Partial<DisplayAnchorConfig>,
): {
  ok: boolean;
  len: number;
  textWidth: number;
  bend: number;
  spacing: number;
} {
  const padding = Math.max(
    0,
    finiteNumber(anchor.textPathPaddingPx, DEFAULT_PADDING_PX),
  );
  const minLen = Math.max(
    20,
    finiteNumber(anchor.textPathMinLengthPx, DEFAULT_MIN_LENGTH_PX),
  );
  const maxLocal = Math.max(
    1,
    finiteNumber(
      anchor.textPathMaxAngleDeltaDeg,
      DEFAULT_MAX_LOCAL_ANGLE_DELTA_DEG,
    ),
  );
  const maxTotal = Math.max(
    1,
    finiteNumber(anchor.textPathMaxTotalBendDeg, DEFAULT_MAX_TOTAL_BEND_DEG),
  );
  const len = pathLength(points);
  const bend = totalBend(points);
  const spacing = resolveLetterSpacing(anchor, bend);
  const textWidth = estimateTextWidth(text, spacing);
  const ok =
    len >= minLen &&
    len >= textWidth + padding * 2 &&
    maxLocalAngleDelta(points) <= maxLocal &&
    bend <= maxTotal;
  return { ok, len, textWidth, bend, spacing };
}

function collisionRectFromPlan(
  plan: TextPathPlan,
  points: L.Point[],
  anchor: Partial<DisplayAnchorConfig>,
): TextPathLayoutMetrics {
  const collisionPadding = Math.max(
    0,
    finiteNumber(
      anchor.textPathCollisionPaddingPx,
      DEFAULT_COLLISION_PADDING_PX,
    ),
  );
  const b =
    points.length >= 2
      ? boundsForPoints(points)
      : {
          minX: plan.markerContainerPoint.x - plan.width / 2,
          minY: plan.markerContainerPoint.y - plan.height / 2,
          maxX: plan.markerContainerPoint.x + plan.width / 2,
          maxY: plan.markerContainerPoint.y + plan.height / 2,
        };
  const fontPad = Math.max(DEFAULT_FONT_HEIGHT_PX * 0.5, 18);
  const pad = collisionPadding + fontPad;
  return {
    collisionRect: {
      x: Math.min(b.minX, plan.markerContainerPoint.x - plan.width / 2) - pad,
      y: Math.min(b.minY, plan.markerContainerPoint.y - plan.height / 2) - pad,
      w: Math.max(b.maxX - b.minX, plan.width) + pad * 2,
      h: Math.max(b.maxY - b.minY, plan.height) + pad * 2,
    },
    pathLengthPx: plan.pathLengthPx,
    estimatedTextWidthPx: plan.estimatedTextWidthPx,
    letterSpacingPx: plan.letterSpacingPx ?? 0,
    mode: plan.mode,
    status: plan.status,
  };
}

function buildCurvedPlan(
  options: TextPathBuildOptions,
  points: L.Point[],
  anchor: Partial<DisplayAnchorConfig>,
): TextPathPlanAndMetrics | null {
  if (points.length < 2) return null;
  const preferReadable = anchor.textPathPreferReadableDirection !== false;
  const oriented = preferReadable ? preferReadableDirection(points) : points;
  const eligibility = isCurvedPathEligible(oriented, options.text, anchor);
  if (!eligibility.ok) return null;

  const { minX, minY, maxX, maxY } = boundsForPoints(oriented);
  const width = Math.max(1, Math.ceil(maxX - minX + SVG_PAD_PX * 2));
  const height = Math.max(1, Math.ceil(maxY - minY + SVG_PAD_PX * 2));
  const local = oriented.map((p) =>
    L.point(p.x - minX + SVG_PAD_PX, p.y - minY + SVG_PAD_PX),
  );
  const pathD = local
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${Math.round(p.x * 100) / 100} ${Math.round(p.y * 100) / 100}`,
    )
    .join(" ");
  const markerContainerPoint = L.point((minX + maxX) / 2, (minY + maxY) / 2);
  const plan: TextPathPlan = {
    pathD,
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    text: options.text,
    pathLengthPx: eligibility.len,
    estimatedTextWidthPx: eligibility.textWidth,
    className: options.className ?? "ria-line-textpath",
    letterSpacingPx: eligibility.spacing,
    markerContainerPoint,
    mode: "curvedTextPath",
    status: "usedTextPath",
  };
  return { plan, metrics: collisionRectFromPlan(plan, oriented, anchor) };
}

function buildSvgVerticalCjkPlan(
  options: TextPathBuildOptions,
  points: L.Point[],
  anchor: Partial<DisplayAnchorConfig>,
): TextPathPlanAndMetrics | null {
  if (!isMostlyCjkText(options.text) || points.length < 1) return null;
  const b = boundsForPoints(points);
  const markerContainerPoint = L.point(
    (b.minX + b.maxX) / 2,
    (b.minY + b.maxY) / 2,
  );
  const spacing = Math.max(
    0,
    finiteNumber(
      anchor.svgVerticalCjkLetterSpacingPx,
      DEFAULT_SVG_VERTICAL_LETTER_SPACING_PX,
    ),
  );
  const textWidth = estimateTextWidth(options.text, spacing);
  const minLen = Math.max(
    0,
    finiteNumber(
      anchor.svgVerticalCjkMinLengthPx,
      DEFAULT_SVG_VERTICAL_MIN_LENGTH_PX,
    ),
  );
  if (textWidth < minLen) return null;

  const chars = Array.from(String(options.text ?? "")).length;
  const width = Math.max(32, DEFAULT_FONT_HEIGHT_PX + SVG_PAD_PX * 2);
  const height = Math.max(
    40,
    Math.ceil(chars * 18 + Math.max(0, chars - 1) * spacing + SVG_PAD_PX * 2),
  );
  const pathD = "";
  const plan: TextPathPlan = {
    pathD,
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    text: options.text,
    pathLengthPx: height,
    estimatedTextWidthPx: textWidth,
    className: options.className ?? "ria-line-textpath",
    letterSpacingPx: spacing,
    markerContainerPoint,
    mode: "svgVerticalCjk",
    status: "usedSvgVerticalCjk",
  };
  return { plan, metrics: collisionRectFromPlan(plan, [], anchor) };
}

function buildStraightPlan(
  options: TextPathBuildOptions,
  points: L.Point[],
  anchor: Partial<DisplayAnchorConfig>,
): TextPathPlanAndMetrics | null {
  if (points.length < 1) return null;
  const spacing = Math.max(
    0,
    finiteNumber(anchor.textPathLetterSpacingPx, DEFAULT_LETTER_SPACING_PX),
  );
  const padding = Math.max(
    0,
    finiteNumber(anchor.textPathPaddingPx, DEFAULT_PADDING_PX),
  );
  const textWidth = estimateTextWidth(options.text, spacing);
  const width = Math.max(40, Math.ceil(textWidth + padding * 2));
  const height = 44;
  const y = Math.round(height / 2);
  const pathD = `M ${Math.round(padding)} ${y} L ${Math.round(width - padding)} ${y}`;
  const b = boundsForPoints(points);
  const markerContainerPoint = L.point(
    (b.minX + b.maxX) / 2,
    (b.minY + b.maxY) / 2,
  );
  const plan: TextPathPlan = {
    pathD,
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    text: options.text,
    pathLengthPx: width - padding * 2,
    estimatedTextWidthPx: textWidth,
    className: options.className ?? "ria-line-textpath",
    letterSpacingPx: spacing,
    rotateDeg:
      typeof options.rotateDeg === "number"
        ? options.rotateDeg
        : mainPathAngleDeg(points),
    markerContainerPoint,
    mode: "svgStraightLabel",
    status: "fallbackByConfig",
  };
  return { plan, metrics: collisionRectFromPlan(plan, [], anchor) };
}


function approxMetricsCacheKey(options: TextPathBuildOptions): string {
  if (options.cacheKeyHint) return `approx|${options.cacheKeyHint}`;
  const zoom = Math.round((options.map.getZoom?.() ?? 0) * 2) / 2;
  const pathKey = (options.pathLatLngs ?? [])
    .slice(0, 8)
    .map((ll) => `${Math.round(ll.lat * 1e5)},${Math.round(ll.lng * 1e5)}`)
    .join("|");
  return `${zoom}|${options.text}|${pathKey}|${options.anchor?.lineTextMode ?? "auto"}`;
}

export function buildTextPathApproxMetrics(
  options: TextPathBuildOptions,
): TextPathPlanAndMetrics | null {
  const anchor = resolveAnchor(options.anchor);
  const points = pointsFromLatLngs(options.map, options.pathLatLngs);
  if (points.length < 2) return null;

  const key = approxMetricsCacheKey(options);
  const cached = approxMetricsCache.get(key);
  if (cached) {
    const b = boundsForPoints(points);
    const markerContainerPoint = L.point(
      (b.minX + b.maxX) / 2,
      (b.minY + b.maxY) / 2,
    );
    return {
      plan: {
        pathD: "",
        viewBox: `0 0 ${Math.max(1, cached.collisionRect.w)} ${Math.max(1, cached.collisionRect.h)}`,
        width: Math.max(1, cached.collisionRect.w),
        height: Math.max(1, cached.collisionRect.h),
        text: options.text,
        pathLengthPx: cached.pathLengthPx,
        estimatedTextWidthPx: cached.estimatedTextWidthPx,
        className: options.className ?? "ria-line-textpath",
        letterSpacingPx: cached.letterSpacingPx,
        mode: cached.mode,
        status: cached.status,
        markerContainerPoint,
      },
      metrics: cached,
    };
  }

  const preferReadable = anchor.textPathPreferReadableDirection !== false;
  const oriented = preferReadable ? preferReadableDirection(points) : points;
  const b = boundsForPoints(oriented);
  const bend = totalBend(oriented);
  const spacing = resolveLetterSpacing(anchor, bend);
  const pathLen = pathLength(oriented);
  const textWidth = estimateTextWidth(options.text, spacing);
  const collisionPadding = Math.max(
    0,
    finiteNumber(
      anchor.textPathCollisionPaddingPx,
      DEFAULT_COLLISION_PADDING_PX,
    ),
  );
  const fontPad = Math.max(DEFAULT_FONT_HEIGHT_PX * 0.5, 18);
  const pad = collisionPadding + fontPad;
  const eligible = isCurvedPathEligible(oriented, options.text, anchor).ok;
  const metrics: TextPathLayoutMetrics = {
    collisionRect: {
      x: b.minX - pad,
      y: b.minY - pad,
      w: Math.max(b.maxX - b.minX, textWidth) + pad * 2,
      h: Math.max(b.maxY - b.minY, DEFAULT_FONT_HEIGHT_PX) + pad * 2,
    },
    pathLengthPx: pathLen,
    estimatedTextWidthPx: textWidth,
    letterSpacingPx: spacing,
    mode: "curvedTextPath",
    status: eligible ? "usedTextPath" : "fallbackRotatedLabel",
  };

  approxMetricsCache.set(key, metrics);
  if (approxMetricsCache.size > APPROX_METRICS_CACHE_MAX) {
    const first = approxMetricsCache.keys().next();
    if (!first.done) approxMetricsCache.delete(first.value);
  }

  const markerContainerPoint = L.point((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
  return {
    plan: {
      pathD: "",
      viewBox: `0 0 ${Math.max(1, metrics.collisionRect.w)} ${Math.max(1, metrics.collisionRect.h)}`,
      width: Math.max(1, metrics.collisionRect.w),
      height: Math.max(1, metrics.collisionRect.h),
      text: options.text,
      pathLengthPx: pathLen,
      estimatedTextWidthPx: textWidth,
      className: options.className ?? "ria-line-textpath",
      letterSpacingPx: spacing,
      markerContainerPoint,
      mode: "curvedTextPath",
      status: metrics.status,
    },
    metrics,
  };
}

export function buildTextPathPlanAndMetrics(
  options: TextPathBuildOptions,
): TextPathPlanAndMetrics | null {
  const anchor = resolveAnchor(options.anchor);
  const points = pointsFromLatLngs(options.map, options.pathLatLngs);
  if (points.length < 2) return null;

  if (
    shouldUseCjkUprightTextPath({
      map: options.map,
      text: options.text,
      pathLatLngs: options.pathLatLngs,
      anchor,
    })
  ) {
    if (shouldRenderSvgVerticalCjk(anchor))
      return buildSvgVerticalCjkPlan(options, points, anchor);
    return null;
  }

  const curved = buildCurvedPlan(options, points, anchor);
  if (curved) return curved;

  const fallback =
    options.fallback ?? anchor.textPathFallback ?? "rotatedLabel";
  if (fallback === "svgStraightLabel")
    return buildStraightPlan(options, points, anchor);
  return null;
}

export function buildTextPathPlanResult(
  options: TextPathBuildOptions,
): { plan: TextPathPlan | null; status?: TextPathStatus; cacheKey?: string } {
  const key = options.cacheKeyHint
    ? `plan|${options.cacheKeyHint}`
    : approxMetricsCacheKey(options).replace(/^approx\|/, "plan|");
  // RB_SLU_24: full textPath plans are intentionally not cached across
  // refreshes. They contain markerContainerPoint in viewport container
  // coordinates, which becomes stale after pan/zoom.
  const plan = buildTextPathPlanAndMetrics(options)?.plan ?? null;
  return { plan, status: plan?.status, cacheKey: key };
}

export function buildTextPathPlan(
  options: TextPathBuildOptions,
): TextPathPlan | null {
  return buildTextPathPlanResult(options).plan;
}

export function buildTextPathLayoutMetrics(
  options: TextPathBuildOptions,
): TextPathLayoutMetrics | null {
  return buildTextPathPlanAndMetrics(options)?.metrics ?? null;
}


export function evaluateTextPathEligibility(options: {
  map: L.Map;
  text: string;
  pathLatLngs: L.LatLng[];
  anchor?: Partial<DisplayAnchorConfig> | null;
  fallback?: DisplayTextPathFallback | null;
}): { ok: boolean; estimatedTextWidthPx: number; failureReason?: string; status?: TextPathStatus } {
  const result = buildTextPathApproxMetrics({
    map: options.map,
    text: options.text,
    pathLatLngs: options.pathLatLngs,
    anchor: options.anchor ?? null,
    fallback: options.fallback ?? null,
  });
  return {
    ok: !!result?.metrics && result.metrics.status === 'usedTextPath',
    estimatedTextWidthPx: result?.metrics?.estimatedTextWidthPx ?? 0,
    failureReason: result?.metrics?.status,
    status: result?.metrics?.status,
  };
}
