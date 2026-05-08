import * as L from "leaflet";
import type { DisplayAnchorConfig } from "@/components/Rules/rendering/display/displayTypes";
import type { Rect } from "./labelLineViewportGate";
import { pickViewportLocalPathTargets } from "./labelLineViewportGate";

/**
 * RB_SLU_25/26: along-line chainage reposition candidates for strict line
 * labels. This module builds screen-space along-line candidates only; it never
 * creates SVG/DOM and never caches full plans across viewport refreshes.
 */

export type LineTextPathCandidateLike = {
  candidateId?: string;
  sourceIndex?: number;
  displayOrder?: number;
  pathLatLngs?: L.LatLng[];
  fullPathLatLngs?: L.LatLng[];
};

export type LineTextRepositionCandidate = {
  candidateId: string;
  baseCandidateId?: string;
  shiftIndex: number;
  latlng: L.LatLng;
  rotateDeg: number;
  pathLatLngs: L.LatLng[];
  estimatedLabelSpanPx: number;
  effectiveStepPx?: number;
  sourcePathKind?: "fullPathLatLngs" | "localPathLatLngs" | "unknown";
  sourcePathPointCount?: number;
  sourcePathLengthPx?: number;
  baseChainagePx?: number;
  targetChainagePx?: number;
  pathSliceLengthPx?: number;
  viewportTempBase?: boolean;
  viewportLocalIntervalIndex?: number;
  viewportLocalIntervalLengthPx?: number;
  rectSource?: "rawMetrics" | "anchorNormalized" | "anchorNormalizedFallback";
  rawRect?: Rect;
  normalizedRect?: Rect;
  rawRectCenterDistancePx?: number;
  rawRectImplausible?: boolean;
  svgEligible: boolean;
  svgFailureReason?: string;
};

type ScreenPathPoint = { latlng: L.LatLng; point: L.Point };

function finiteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function dist(a: L.Point, b: L.Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function normalizeReadableAngleDeg(angle: number): number {
  let a = angle;
  while (a > 180) a -= 360;
  while (a <= -180) a += 360;
  if (a > 90) a -= 180;
  if (a < -90) a += 180;
  return a;
}

function pathPoints(map: L.Map, latlngs: L.LatLng[]): ScreenPathPoint[] {
  const out: ScreenPathPoint[] = [];
  for (const latlng of latlngs) {
    try {
      const point = map.latLngToContainerPoint(latlng);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      const prev = out[out.length - 1];
      if (prev && dist(prev.point, point) <= 0.5) continue;
      out.push({ latlng, point });
    } catch {
      // ignore invalid point
    }
  }
  return out;
}

function cumulativeLengths(points: ScreenPathPoint[]): number[] {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[cum.length - 1] + dist(points[i - 1].point, points[i].point));
  }
  return cum;
}

function interpolateLatLng(a: L.LatLng, b: L.LatLng, t: number): L.LatLng {
  const u = clamp(t, 0, 1);
  return L.latLng(a.lat + (b.lat - a.lat) * u, a.lng + (b.lng - a.lng) * u);
}

function sampleAtChainage(
  pts: ScreenPathPoint[],
  cum: number[],
  chainagePx: number,
): { latlng: L.LatLng; point: L.Point; rotateDeg: number } | null {
  if (pts.length < 2 || cum.length !== pts.length) return null;
  const total = cum[cum.length - 1] ?? 0;
  const target = clamp(chainagePx, 0, total);
  for (let i = 1; i < pts.length; i++) {
    const start = cum[i - 1];
    const end = cum[i];
    if (target <= end || i === pts.length - 1) {
      const segLen = Math.max(0.0001, end - start);
      const t = clamp((target - start) / segLen, 0, 1);
      const a = pts[i - 1];
      const b = pts[i];
      const x = a.point.x + (b.point.x - a.point.x) * t;
      const y = a.point.y + (b.point.y - a.point.y) * t;
      const angle =
        (Math.atan2(b.point.y - a.point.y, b.point.x - a.point.x) * 180) /
        Math.PI;
      return {
        latlng: interpolateLatLng(a.latlng, b.latlng, t),
        point: L.point(x, y),
        rotateDeg: normalizeReadableAngleDeg(angle),
      };
    }
  }
  return null;
}

function projectPointToSegment(
  p: L.Point,
  a: L.Point,
  b: L.Point,
): { t: number; d2: number } {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 <= 1e-9) return { t: 0, d2: (p.x - a.x) ** 2 + (p.y - a.y) ** 2 };
  const t = clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / len2, 0, 1);
  const x = a.x + vx * t;
  const y = a.y + vy * t;
  return { t, d2: (p.x - x) ** 2 + (p.y - y) ** 2 };
}

function nearestChainagePx(
  pts: ScreenPathPoint[],
  cum: number[],
  anchorPx: L.Point,
): number {
  let best = 0;
  let bestD2 = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const proj = projectPointToSegment(
      anchorPx,
      pts[i - 1].point,
      pts[i].point,
    );
    if (proj.d2 < bestD2) {
      bestD2 = proj.d2;
      best = cum[i - 1] + (cum[i] - cum[i - 1]) * proj.t;
    }
  }
  return best;
}

function slicePathAtChainage(
  pts: ScreenPathPoint[],
  cum: number[],
  startPx: number,
  endPx: number,
): L.LatLng[] {
  if (pts.length < 2) return [];
  const total = cum[cum.length - 1] ?? 0;
  const start = clamp(Math.min(startPx, endPx), 0, total);
  const end = clamp(Math.max(startPx, endPx), 0, total);
  if (end - start <= 1) return [];
  const startSample = sampleAtChainage(pts, cum, start);
  const endSample = sampleAtChainage(pts, cum, end);
  if (!startSample || !endSample) return [];
  const out: L.LatLng[] = [startSample.latlng];
  for (let i = 1; i < pts.length - 1; i++) {
    const c = cum[i];
    if (c > start && c < end) out.push(pts[i].latlng);
  }
  out.push(endSample.latlng);
  const cleaned: L.LatLng[] = [];
  for (const ll of out) {
    const prev = cleaned[cleaned.length - 1];
    if (
      !prev ||
      Math.abs(prev.lat - ll.lat) > 1e-10 ||
      Math.abs(prev.lng - ll.lng) > 1e-10
    )
      cleaned.push(ll);
  }
  return cleaned.length >= 2 ? cleaned : [];
}

export function buildChainageShiftSequence(
  attemptsPerDirection: number,
): number[] {
  const n = Math.max(
    0,
    Math.min(8, Math.floor(finiteNumber(attemptsPerDirection, 3))),
  );
  const out = [0];
  for (let i = 1; i <= n; i++) out.push(i, -i);
  return out;
}

export function buildLineTextRepositionCandidates(options: {
  baseCandidate: LineTextPathCandidateLike;
  anchorPx: L.Point;
  anchor?: Partial<DisplayAnchorConfig> | null;
  labelText: string;
  map: L.Map;
  estimatedLabelSpanPx: number;
  attemptsPerDirection?: number;
  enableViewportTempFallback?: boolean;
  viewportRectPx?: Rect;
  viewportTempMaxTargets?: number;
  viewportTempMinIntervalPx?: number;
}): LineTextRepositionCandidate[] {
  const anchor = options.anchor ?? {};
  const hasFullPath =
    Array.isArray(options.baseCandidate.fullPathLatLngs) &&
    options.baseCandidate.fullPathLatLngs.length >= 2;
  const hasLocalPath =
    Array.isArray(options.baseCandidate.pathLatLngs) &&
    options.baseCandidate.pathLatLngs.length >= 2;
  const sourcePath = hasFullPath
    ? options.baseCandidate.fullPathLatLngs!
    : hasLocalPath
      ? options.baseCandidate.pathLatLngs!
      : [];
  const sourcePathKind = hasFullPath
    ? "fullPathLatLngs"
    : hasLocalPath
      ? "localPathLatLngs"
      : "unknown";
  const pts = pathPoints(options.map, sourcePath);
  if (pts.length < 2) return [];
  const cum = cumulativeLengths(pts);
  const total = cum[cum.length - 1] ?? 0;
  if (total <= 1) return [];
  const labelSpan = Math.max(
    18,
    finiteNumber(options.estimatedLabelSpanPx, 48),
  );
  const effectiveStepPx = labelSpan;
  const attempts = Math.max(
    0,
    Math.min(
      8,
      Math.floor(
        finiteNumber(
          options.attemptsPerDirection,
          anchor.lineTextRepositionAttemptsPerDirection ?? 3,
        ),
      ),
    ),
  );
  const pathHalf = Math.max(labelSpan * 0.72, 36);
  const out: LineTextRepositionCandidate[] = [];
  const seen = new Set<string>();

  const addCandidateSequence = (args: {
    baseId: string;
    baseCandidateId?: string;
    baseChainagePx: number;
    viewportTempBase?: boolean;
    viewportLocalIntervalIndex?: number;
    viewportLocalIntervalLengthPx?: number;
  }) => {
    for (const shift of buildChainageShiftSequence(attempts)) {
      const target = clamp(args.baseChainagePx + shift * effectiveStepPx, 0, total);
      const key = `${args.baseId}:${Math.round(target * 10) / 10}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const sampled = sampleAtChainage(pts, cum, target);
      if (!sampled) continue;
      const pathStartPx = clamp(target - pathHalf, 0, total);
      const pathEndPx = clamp(target + pathHalf, 0, total);
      const pathLatLngs = slicePathAtChainage(pts, cum, pathStartPx, pathEndPx);
      if (pathLatLngs.length < 2) continue;
      const sign = shift > 0 ? `+${shift}` : String(shift);
      out.push({
        candidateId: `${args.baseId}:chainageShift:${sign}`,
        baseCandidateId: args.baseCandidateId,
        shiftIndex: shift,
        latlng: sampled.latlng,
        rotateDeg: sampled.rotateDeg,
        pathLatLngs,
        estimatedLabelSpanPx: labelSpan,
        effectiveStepPx,
        sourcePathKind,
        sourcePathPointCount: sourcePath.length,
        sourcePathLengthPx: total,
        baseChainagePx: args.baseChainagePx,
        targetChainagePx: target,
        pathSliceLengthPx: Math.max(0, pathEndPx - pathStartPx),
        viewportTempBase: args.viewportTempBase,
        viewportLocalIntervalIndex: args.viewportLocalIntervalIndex,
        viewportLocalIntervalLengthPx: args.viewportLocalIntervalLengthPx,
        svgEligible: true,
      });
    }
  };

  if (
    options.enableViewportTempFallback &&
    options.viewportRectPx &&
    hasFullPath
  ) {
    const targets = pickViewportLocalPathTargets({
      pointsPx: pts.map((p) => p.point),
      viewportRectPx: options.viewportRectPx,
      maxTargets: options.viewportTempMaxTargets ?? 1,
      minIntervalLengthPx: options.viewportTempMinIntervalPx ?? 48,
    });
    for (const target of targets) {
      addCandidateSequence({
        baseId: `viewport-temp:visibleMid:${target.intervalIndex}`,
        baseCandidateId: options.baseCandidate.candidateId,
        baseChainagePx: target.targetChainagePx,
        viewportTempBase: true,
        viewportLocalIntervalIndex: target.intervalIndex,
        viewportLocalIntervalLengthPx: target.intervalLengthPx,
      });
    }
  }

  const baseChainagePx = nearestChainagePx(pts, cum, options.anchorPx);
  addCandidateSequence({
    baseId: options.baseCandidate.candidateId ?? "line",
    baseCandidateId: options.baseCandidate.candidateId,
    baseChainagePx,
  });
  return out;
}
