import * as L from "leaflet";

/**
 * RB_SLU_26: viewport-gate helpers for strict line labels.
 * These utilities operate only in screen/container coordinates. They never
 * create Leaflet markers and never cache full SVG/textPath plans.
 */

export type Rect = { x: number; y: number; w: number; h: number };

export type LineTextViewportRectSource =
  | "rawMetrics"
  | "anchorNormalized"
  | "anchorNormalizedFallback";

export type LineTextViewportRectAudit = {
  rawRect?: Rect;
  normalizedRect: Rect;
  rectSource: LineTextViewportRectSource;
  rawRectCenterDistancePx?: number;
  rawRectImplausible?: boolean;
};

export type LineTextViewportInterval = {
  startPx: number;
  endPx: number;
  lengthPx: number;
  centerPx: number;
  intervalIndex: number;
};

export type LineTextViewportLocalTarget = {
  intervalIndex: number;
  targetChainagePx: number;
  intervalLengthPx: number;
  distanceToViewportCenterPx?: number;
};

function finiteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function rectCenter(rect: Rect): L.Point {
  return L.point(rect.x + rect.w / 2, rect.y + rect.h / 2);
}

function dist(a: L.Point, b: L.Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isFiniteRect(rect: Rect | null | undefined): rect is Rect {
  return !!rect &&
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.w) &&
    Number.isFinite(rect.h) &&
    rect.w >= 0 &&
    rect.h >= 0;
}

export function buildAnchorNormalizedLineTextRect(options: {
  anchorPx: L.Point;
  rotateDeg?: number;
  estimatedLabelSpanPx: number;
  fontSizePx?: number;
  paddingPx?: number;
}): Rect {
  const span = Math.max(18, finiteNumber(options.estimatedLabelSpanPx, 48));
  const fontSize = Math.max(8, finiteNumber(options.fontSizePx, 12));
  const padding = Math.max(0, finiteNumber(options.paddingPx, 6));
  const along = span + padding * 2;
  const cross = fontSize + padding * 2;
  const angle = (finiteNumber(options.rotateDeg, 0) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners = [
    [-along / 2, -cross / 2],
    [along / 2, -cross / 2],
    [along / 2, cross / 2],
    [-along / 2, cross / 2],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of corners) {
    const rx = options.anchorPx.x + x * cos - y * sin;
    const ry = options.anchorPx.y + x * sin + y * cos;
    minX = Math.min(minX, rx);
    minY = Math.min(minY, ry);
    maxX = Math.max(maxX, rx);
    maxY = Math.max(maxY, ry);
  }
  return {
    x: minX,
    y: minY,
    w: Math.max(0, maxX - minX),
    h: Math.max(0, maxY - minY),
  };
}

export function resolveLineTextViewportRect(options: {
  anchorPx: L.Point;
  rotateDeg?: number;
  estimatedLabelSpanPx: number;
  rawMetricsRect?: Rect | null;
  fontSizePx?: number;
  paddingPx?: number;
  mode?: "rawMetrics" | "anchorNormalized" | "auto";
}): LineTextViewportRectAudit {
  const normalizedRect = buildAnchorNormalizedLineTextRect(options);
  const rawRect = isFiniteRect(options.rawMetricsRect)
    ? { ...options.rawMetricsRect }
    : undefined;
  const rawRectCenterDistancePx = rawRect
    ? dist(rectCenter(rawRect), options.anchorPx)
    : undefined;
  const implausibleThreshold = Math.max(
    finiteNumber(options.estimatedLabelSpanPx, 48) * 4,
    320,
  );
  const rawRectImplausible =
    rawRectCenterDistancePx !== undefined &&
    rawRectCenterDistancePx > implausibleThreshold;
  const mode = options.mode ?? "anchorNormalized";
  if (mode === "rawMetrics" && rawRect) {
    return {
      rawRect,
      normalizedRect: rawRect,
      rectSource: "rawMetrics",
      rawRectCenterDistancePx,
      rawRectImplausible,
    };
  }
  if (mode === "auto" && rawRect && !rawRectImplausible) {
    return {
      rawRect,
      normalizedRect: rawRect,
      rectSource: "rawMetrics",
      rawRectCenterDistancePx,
      rawRectImplausible,
    };
  }
  return {
    rawRect,
    normalizedRect,
    rectSource: rawRect ? "anchorNormalized" : "anchorNormalizedFallback",
    rawRectCenterDistancePx,
    rawRectImplausible,
  };
}

function segmentLength(a: L.Point, b: L.Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function clipSegmentToRect(a: L.Point, b: L.Point, rect: Rect): [number, number] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const checks: Array<[number, number]> = [
    [-dx, a.x - rect.x],
    [dx, rect.x + rect.w - a.x],
    [-dy, a.y - rect.y],
    [dy, rect.y + rect.h - a.y],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  if (t1 < t0) return null;
  return [clamp(t0, 0, 1), clamp(t1, 0, 1)];
}

export function buildVisiblePathIntervalsPx(options: {
  pointsPx: L.Point[];
  viewportRectPx: Rect;
}): LineTextViewportInterval[] {
  const points = options.pointsPx.filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
  );
  if (points.length < 2) return [];
  const intervals: Array<Omit<LineTextViewportInterval, "intervalIndex">> = [];
  let cumulative = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = segmentLength(a, b);
    if (len <= 0.5) continue;
    const clipped = clipSegmentToRect(a, b, options.viewportRectPx);
    if (clipped) {
      const [t0, t1] = clipped;
      const startPx = cumulative + t0 * len;
      const endPx = cumulative + t1 * len;
      if (endPx - startPx > 0.5) {
        const last = intervals[intervals.length - 1];
        if (last && startPx - last.endPx <= 1.5) {
          last.endPx = endPx;
          last.lengthPx = Math.max(0, last.endPx - last.startPx);
          last.centerPx = (last.startPx + last.endPx) / 2;
        } else {
          intervals.push({
            startPx,
            endPx,
            lengthPx: Math.max(0, endPx - startPx),
            centerPx: (startPx + endPx) / 2,
          });
        }
      }
    }
    cumulative += len;
  }
  return intervals.map((interval, intervalIndex) => ({
    ...interval,
    intervalIndex,
  }));
}

export function pickViewportLocalPathTargets(options: {
  pointsPx: L.Point[];
  viewportRectPx: Rect;
  maxTargets?: number;
  minIntervalLengthPx?: number;
}): LineTextViewportLocalTarget[] {
  const maxTargets = Math.max(1, Math.min(4, Math.floor(finiteNumber(options.maxTargets, 1))));
  const minIntervalLengthPx = Math.max(0, finiteNumber(options.minIntervalLengthPx, 48));
  const intervals = buildVisiblePathIntervalsPx(options).filter(
    (interval) => interval.lengthPx >= minIntervalLengthPx,
  );
  if (!intervals.length) return [];
  const viewportCenter = L.point(
    options.viewportRectPx.x + options.viewportRectPx.w / 2,
    options.viewportRectPx.y + options.viewportRectPx.h / 2,
  );
  const points = options.pointsPx;
  let cumulative = 0;
  const centers = intervals.map((interval) => {
    let centerPoint = points[0] ?? viewportCenter;
    let running = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const len = segmentLength(a, b);
      if (interval.centerPx <= running + len || i === points.length - 1) {
        const t = len > 0 ? clamp((interval.centerPx - running) / len, 0, 1) : 0;
        centerPoint = L.point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        break;
      }
      running += len;
    }
    cumulative += interval.lengthPx;
    return {
      interval,
      distanceToViewportCenterPx: dist(centerPoint, viewportCenter),
    };
  });
  return centers
    .sort((a, b) => {
      if (b.interval.lengthPx !== a.interval.lengthPx)
        return b.interval.lengthPx - a.interval.lengthPx;
      return a.distanceToViewportCenterPx - b.distanceToViewportCenterPx;
    })
    .slice(0, maxTargets)
    .map(({ interval, distanceToViewportCenterPx }) => ({
      intervalIndex: interval.intervalIndex,
      targetChainagePx: interval.centerPx,
      intervalLengthPx: interval.lengthPx,
      distanceToViewportCenterPx,
    }));
}
