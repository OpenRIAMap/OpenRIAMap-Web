import * as L from "leaflet";

const LINE_TEXT_MARKER_META = "__riaLineTextMarkerMeta";

/**
 * RB_SLU_24: metadata in this file is only used to identify advanced
 * line-text markers and to support diagnostics. It must not be used to reuse
 * full SVG plans or markerLatLng across moveend/zoomend refreshes because
 * those values are derived from viewport container coordinates.
 */

type LineTextMarkerKind = "textPath" | "glyphPath";

type LineTextMarkerMeta = {
  kind: LineTextMarkerKind;
  markerLatLng: L.LatLng;
  planKey: string;
};

function finiteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function lineTextZoomBucket(map: L.Map, bucketSize?: number): number {
  const zoom = Number(map.getZoom?.() ?? 0);
  const step = Math.max(0.05, finiteNumber(bucketSize, 0.5));
  return Math.round(zoom / step) * step;
}

export function lineTextPathSignature(
  pathLatLngs: L.LatLng[] | null | undefined,
): string {
  const pts = Array.isArray(pathLatLngs) ? pathLatLngs : [];
  if (!pts.length) return "empty";
  const maxSamples = 10;
  const indexes = new Set<number>();
  if (pts.length <= maxSamples) {
    pts.forEach((_, i) => indexes.add(i));
  } else {
    for (let i = 0; i < maxSamples; i++) {
      indexes.add(Math.round((i / (maxSamples - 1)) * (pts.length - 1)));
    }
  }
  const parts = [...indexes]
    .sort((a, b) => a - b)
    .map((idx) => {
      const ll = pts[idx];
      return `${Math.round(ll.lat * 1e5)},${Math.round(ll.lng * 1e5)}`;
    });
  return `${pts.length}:${parts.join("|")}`;
}

// RB_SLU_25: plan-cache key generation was removed. Full SVG plans
// contain viewport container coordinates and must not be reused across refreshes.

export function markLineTextMarker(
  marker: L.Marker,
  meta: {
    kind: LineTextMarkerKind;
    markerLatLng: L.LatLng;
    planKey: string;
  },
): L.Marker {
  (marker as unknown as Record<string, LineTextMarkerMeta>)[LINE_TEXT_MARKER_META] = {
    kind: meta.kind,
    markerLatLng: meta.markerLatLng,
    planKey: meta.planKey,
  };
  return marker;
}

function getMeta(marker: L.Marker): LineTextMarkerMeta | null {
  return (
    (marker as unknown as Record<string, LineTextMarkerMeta | undefined>)[
      LINE_TEXT_MARKER_META
    ] ?? null
  );
}

export function isLineTextMarker(marker: unknown): boolean {
  return !!marker && !!getMeta(marker as L.Marker);
}


export function isAdvancedLineTextMarker(marker: unknown): boolean {
  return isLineTextMarker(marker);
}
