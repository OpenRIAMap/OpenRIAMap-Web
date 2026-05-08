import * as L from "leaflet";
import type { DynmapProjection } from "@/lib/DynmapProjection";
import type { FeatureRecord } from "@/components/Rules/rendering/renderRules";
import type { DisplayAnchorConfig } from "@/components/Rules/rendering/display/displayTypes";
import { chooseStableGeoAnchorCandidate, type GeoAnchorSelectionDebugInfo } from "@/components/Rules/rendering/label/labelGeoAnchorCache";
import { getStableLineAnchorCandidates } from "@/components/Rules/rendering/label/labelLineAnchorCache";

/**
 * RB_SLU label anchor utilities.
 *
 * This module owns world-space anchor calculation for labels. It deliberately
 * returns LatLng candidates rather than Leaflet layers, so RuleDrivenLayer keeps
 * responsibility for rendering while anchor strategy becomes independently
 * maintainable.
 */

export type WorldRectXZ = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};
export type WorldPointXZ = { x: number; z: number };

type WorldPoint3 = { x: number; y?: number; z: number };

export type ResolveLabelAnchorOptions = {
  feature: FeatureRecord;
  projection: DynmapProjection;
  y: number;
  viewportWorldRectXZ?: WorldRectXZ | null;
  /** RB_SLU_21: real screen viewport for scoring/preference. */
  realViewportWorldRectXZ?: WorldRectXZ | null;
  /** RB_SLU_21: padded layout window for candidate reuse/usability. */
  layoutViewportWorldRectXZ?: WorldRectXZ | null;
  displayAnchor?: DisplayAnchorConfig | null;
  legacyDeclutter?: any;
};

export type LineTextPathCandidate = {
  candidateId?: string;
  sourceIndex?: number;
  displayOrder?: number;
  kind?: string;
  chainage?: number;
  totalLengthWorld?: number;
  pathLatLngs: L.LatLng[];
  fullPathLatLngs?: L.LatLng[];
  pathLengthWorld?: number;
  staticWeight?: number;
  finalScore?: number;
  scoreParts?: unknown;
};

export type ResolvedLabelAnchor = {
  anchorLatLng: L.LatLng;
  anchorCandidatesLatLng?: L.LatLng[];
  rotateDeg?: number;
  rotateDegCandidates?: number[];
  /** RB_SLU_21: stable candidate identities aligned to anchor index 0 + anchorCandidates. */
  anchorCandidateIds?: string[];
  anchorCandidateSourceIndexes?: number[];
  anchorCandidateDisplayOrders?: number[];
  /** RB_SLU_17: one entry for anchor index 0 plus optional anchorCandidates. */
  lineTextPathCandidates?: LineTextPathCandidate[];
  geoAnchorDebug?: GeoAnchorSelectionDebugInfo | { [key: string]: unknown };
};

export function rectCenterXZ(r: WorldRectXZ): WorldPointXZ {
  return { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
}

export function intersectWorldRectXZ(
  a: WorldRectXZ,
  b: WorldRectXZ,
): WorldRectXZ | null {
  const minX = Math.max(a.minX, b.minX);
  const maxX = Math.min(a.maxX, b.maxX);
  const minZ = Math.max(a.minZ, b.minZ);
  const maxZ = Math.min(a.maxZ, b.maxZ);
  if (minX > maxX || minZ > maxZ) return null;
  return { minX, maxX, minZ, maxZ };
}

export function bboxFromCoordsXZ(coords3: Array<WorldPointXZ>): WorldRectXZ {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of coords3) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return { minX, maxX, minZ, maxZ };
}

export function viewportWorldRectXZFromBounds(
  bounds: L.LatLngBounds,
  projection: DynmapProjection,
  y: number,
): WorldRectXZ | null {
  try {
    const nw = bounds.getNorthWest();
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const se = bounds.getSouthEast();

    const pts = [nw, ne, sw, se].map((ll) =>
      projection.latLngToLocation(ll, y),
    );
    const xs = pts.map((p) => p.x);
    const zs = pts.map((p) => p.z);

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

function pointInPolygonXZ(p: WorldPointXZ, poly: WorldPointXZ[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const zi = poly[i].z;
    const xj = poly[j].x;
    const zj = poly[j].z;

    const intersect =
      zi > p.z !== zj > p.z &&
      p.x < ((xj - xi) * (p.z - zi)) / (zj - zi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function closestPointOnSegmentXZ(
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
  let t = (apx * abx + apz * abz) / denom;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + abx * t, z: a.z + abz * t };
}

function closestPointOnPolylineXZ(
  coords3: WorldPointXZ[],
  p: WorldPointXZ,
): WorldPointXZ | null {
  if (coords3.length < 2) return null;
  let best: WorldPointXZ | null = null;
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
  poly: WorldPointXZ[],
  p: WorldPointXZ,
): WorldPointXZ | null {
  if (poly.length < 2) return null;
  let best: WorldPointXZ | null = null;
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

export function computeVisibleAnchorXZForPolyline(
  coords3: WorldPointXZ[],
  viewportRect: WorldRectXZ | null | undefined,
): WorldPointXZ | null {
  if (!coords3 || coords3.length < 2) return null;
  const bbox = bboxFromCoordsXZ(coords3);
  const inter = viewportRect ? intersectWorldRectXZ(bbox, viewportRect) : null;
  const target = inter ? rectCenterXZ(inter) : rectCenterXZ(bbox);
  return closestPointOnPolylineXZ(coords3, target) ?? null;
}

export function computeVisibleAnchorXZForPolygon(
  poly: WorldPointXZ[],
  viewportRect: WorldRectXZ | null | undefined,
): WorldPointXZ | null {
  if (!poly || poly.length < 3) return null;
  const bbox = bboxFromCoordsXZ(poly);
  const inter = viewportRect ? intersectWorldRectXZ(bbox, viewportRect) : null;
  const target = inter ? rectCenterXZ(inter) : rectCenterXZ(bbox);

  if (pointInPolygonXZ(target, poly)) return target;
  return closestPointOnPolygonEdgesXZ(poly, target) ?? null;
}

export function polygonCentroidXZ(poly: WorldPointXZ[]): WorldPointXZ | null {
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

export function pointAtPolylineFractionXZ(
  coords: WorldPointXZ[],
  t01: number,
): WorldPointXZ {
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
}

export function computePolylineTangentAngleDeg(
  coords: WorldPointXZ[],
  p: WorldPointXZ,
): number {
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
  if (ang > 90) ang -= 180;
  if (ang < -90) ang += 180;
  return ang;
}

function bboxCenterFallbackXZ(coords: WorldPointXZ[]): WorldPointXZ {
  const bbox = bboxFromCoordsXZ(coords);
  return rectCenterXZ(bbox);
}

function computeFixedInteriorAnchorXZ(
  poly: WorldPointXZ[],
): WorldPointXZ | null {
  if (!poly || poly.length < 3) return null;
  const centroid = polygonCentroidXZ(poly);
  if (centroid && pointInPolygonXZ(centroid, poly)) return centroid;

  const bboxCenter = bboxCenterFallbackXZ(poly);
  if (pointInPolygonXZ(bboxCenter, poly)) return bboxCenter;

  return (
    closestPointOnPolygonEdgesXZ(poly, bboxCenter) ?? centroid ?? bboxCenter
  );
}

function resolvePolylineAnchor(
  options: ResolveLabelAnchorOptions,
): ResolvedLabelAnchor | null {
  const coords = (options.feature.coords3 ?? []).map((p: WorldPoint3) => ({
    x: p.x,
    z: p.z,
  }));
  if (coords.length < 2) return null;

  const strategy = options.displayAnchor?.strategy;
  const legacyAnchorMode = options.legacyDeclutter?.anchorMode;

  if (
    strategy === "polylineStableCandidates" ||
    legacyAnchorMode === "polyline-stable"
  ) {
    const stableCandidates = getStableLineAnchorCandidates({
      featureKey: options.feature.uid,
      coords,
      anchor: options.displayAnchor ?? null,
      viewportRect:
        options.layoutViewportWorldRectXZ ??
        options.viewportWorldRectXZ ??
        options.realViewportWorldRectXZ ??
        null,
    });

    if (stableCandidates.length) {
      const [first, ...rest] = stableCandidates;
      const allCandidates = [first, ...rest];
      const fullPathLatLngs = coords.map((p) =>
        options.projection.locationToLatLng(p.x, options.y, p.z),
      );
      const totalLengthWorld = (() => {
        let total = 0;
        for (let i = 1; i < coords.length; i++)
          total += Math.hypot(coords[i].x - coords[i - 1].x, coords[i].z - coords[i - 1].z);
        return total;
      })();
      return {
        anchorLatLng: options.projection.locationToLatLng(
          first.worldXZ.x,
          options.y,
          first.worldXZ.z,
        ),
        anchorCandidatesLatLng: rest.map((c) =>
          options.projection.locationToLatLng(
            c.worldXZ.x,
            options.y,
            c.worldXZ.z,
          ),
        ),
        rotateDeg: first.rotateDeg,
        rotateDegCandidates: rest.map((c) => c.rotateDeg),
        anchorCandidateIds: allCandidates.map((c) => c.candidateId),
        anchorCandidateSourceIndexes: allCandidates.map((c) => c.sourceIndex),
        anchorCandidateDisplayOrders: allCandidates.map((c) => c.displayOrder),
        lineTextPathCandidates: allCandidates.map((c) => ({
          candidateId: c.candidateId,
          sourceIndex: c.sourceIndex,
          displayOrder: c.displayOrder,
          kind: c.kind,
          chainage: c.chainage,
          totalLengthWorld,
          pathLatLngs: Array.isArray(c.pathWorldXZ)
            ? c.pathWorldXZ.map((p) =>
                options.projection.locationToLatLng(p.x, options.y, p.z),
              )
            : [],
          fullPathLatLngs,
          pathLengthWorld: c.pathLengthWorld,
          staticWeight: c.staticWeight,
          finalScore: c.finalScore,
          scoreParts: c.scoreParts,
        })),
      };
    }
  }

  const useMulti =
    strategy === "polylineMulti" || legacyAnchorMode === "polyline-multi";

  const center = pointAtPolylineFractionXZ(coords, 0.5);
  const visible = computeVisibleAnchorXZForPolyline(
    coords,
    options.viewportWorldRectXZ,
  );
  const anchorXZ = strategy === "polylineCenter" ? center : (visible ?? center);
  const anchorLatLng = options.projection.locationToLatLng(
    anchorXZ.x,
    options.y,
    anchorXZ.z,
  );

  let anchorCandidatesLatLng: L.LatLng[] | undefined;
  let rotateDegCandidates: number[] | undefined;
  if (useMulti) {
    const samples = Math.max(
      3,
      Math.min(
        15,
        Number(
          options.displayAnchor?.anchorSamples ??
            options.legacyDeclutter?.anchorSamples ??
            7,
        ) || 7,
      ),
    );
    const half = Math.floor((samples - 1) / 2);
    const step = 0.1;
    const fracs: number[] = [];
    for (let i = 1; i <= half; i++) {
      fracs.push(0.5 - i * step);
      fracs.push(0.5 + i * step);
    }
    const pts = fracs.map((f) => pointAtPolylineFractionXZ(coords, f));
    anchorCandidatesLatLng = pts.map((p) =>
      options.projection.locationToLatLng(p.x, options.y, p.z),
    );
    rotateDegCandidates = pts.map((p) =>
      computePolylineTangentAngleDeg(coords, p),
    );
  }

  return {
    anchorLatLng,
    anchorCandidatesLatLng,
    rotateDeg: computePolylineTangentAngleDeg(coords, anchorXZ),
    rotateDegCandidates,
  };
}

function resolvePolygonAnchor(
  options: ResolveLabelAnchorOptions,
): ResolvedLabelAnchor | null {
  const poly = (options.feature.coords3 ?? []).map((p: WorldPoint3) => ({
    x: p.x,
    z: p.z,
  }));
  if (poly.length < 3) return null;

  const strategy = options.displayAnchor?.strategy;
  let anchorXZ: WorldPointXZ | null;

  if (
    strategy === "fixedInterior" ||
    strategy === "stableGeoCandidates" ||
    strategy === "largeFeatureStableCandidates"
  ) {
    const stable = chooseStableGeoAnchorCandidate({
      featureKey: options.feature.uid,
      poly,
      anchor: options.displayAnchor ?? null,
      realViewportRect:
        options.realViewportWorldRectXZ ?? options.viewportWorldRectXZ ?? null,
      layoutViewportRect:
        options.layoutViewportWorldRectXZ ?? options.viewportWorldRectXZ ?? null,
    });
    anchorXZ = stable?.worldXZ ?? computeFixedInteriorAnchorXZ(poly);
    const fallbackInside = anchorXZ ? pointInPolygonXZ(anchorXZ, poly) : false;
    const geoAnchorDebug = stable?.geoAnchorDebug ?? {
      strategy: strategy ?? "fixedInterior",
      selectedCandidateKind: fallbackInside ? "bboxCenter" : "edgeFallback",
      selectedCandidateId: "fallback",
      previousCandidateUsed: false,
      switchBlockedByThreshold: false,
    };
    if (!anchorXZ) return null;
    return {
      anchorLatLng: options.projection.locationToLatLng(anchorXZ.x, options.y, anchorXZ.z),
      geoAnchorDebug,
    };
  } else if (
    strategy === "visibleInteriorLargeOnly" ||
    strategy === "viewportHysteresis"
  ) {
    const stable = chooseStableGeoAnchorCandidate({
      featureKey: options.feature.uid,
      poly,
      anchor: {
        ...(options.displayAnchor ?? {}),
        strategy: "largeFeatureStableCandidates",
        geoCandidateMode:
          options.displayAnchor?.geoCandidateMode ??
          "viewportAwareCandidateSet",
        geoCandidateCount: options.displayAnchor?.geoCandidateCount ?? 9,
        preferPreviousGeoCandidate:
          options.displayAnchor?.preferPreviousGeoCandidate ?? true,
      },
      realViewportRect:
        options.realViewportWorldRectXZ ?? options.viewportWorldRectXZ ?? null,
      layoutViewportRect:
        options.layoutViewportWorldRectXZ ?? options.viewportWorldRectXZ ?? null,
    });
    anchorXZ =
      stable?.worldXZ ??
      computeVisibleAnchorXZForPolygon(
        poly,
        options.realViewportWorldRectXZ ?? options.viewportWorldRectXZ,
      ) ??
      computeFixedInteriorAnchorXZ(poly);
    const geoAnchorDebug = stable?.geoAnchorDebug ?? {
      strategy: strategy ?? "visibleInteriorLargeOnly",
      selectedCandidateKind: "viewportPreferred",
      selectedCandidateId: "fallback",
      previousCandidateUsed: false,
      switchBlockedByThreshold: false,
    };
    if (!anchorXZ) return null;
    return {
      anchorLatLng: options.projection.locationToLatLng(anchorXZ.x, options.y, anchorXZ.z),
      geoAnchorDebug,
    };
  } else {
    anchorXZ =
      computeVisibleAnchorXZForPolygon(
        poly,
        options.realViewportWorldRectXZ ?? options.viewportWorldRectXZ,
      ) ??
      computeFixedInteriorAnchorXZ(poly);
  }

  if (!anchorXZ) return null;
  return {
    anchorLatLng: options.projection.locationToLatLng(
      anchorXZ.x,
      options.y,
      anchorXZ.z,
    ),
    geoAnchorDebug: {
      strategy: strategy ?? "visibleInterior",
      selectedCandidateKind: pointInPolygonXZ(anchorXZ, poly)
        ? "viewportPreferred"
        : "edgeFallback",
      selectedCandidateId: "fallback",
      previousCandidateUsed: false,
      switchBlockedByThreshold: false,
    },
  };
}

export function resolveLabelAnchorForFeature(
  options: ResolveLabelAnchorOptions,
): ResolvedLabelAnchor | null {
  const feature = options.feature;

  if (feature.type === "Points") {
    const p = feature.p3;
    if (!p) return null;
    return {
      anchorLatLng: options.projection.locationToLatLng(p.x, p.y, p.z),
    };
  }

  if (feature.type === "Polyline") return resolvePolylineAnchor(options);
  if (feature.type === "Polygon") return resolvePolygonAnchor(options);
  return null;
}
