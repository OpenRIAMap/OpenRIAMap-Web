import * as L from 'leaflet';
import { canReuseLabelLayoutWindow, type LabelLayoutWindowOptions, type LabelLayoutWindowState } from './labelLayoutWindow';

/**
 * RB_SLU_12 viewport stability helpers.
 *
 * The rule layer already lets Leaflet move existing markers during pan/zoom.
 * This module decides whether a moveend is small enough that we should keep the
 * previous label layout instead of re-running anchor/collision/density selection.
 */

export type LabelViewportSnapshot = {
  center: L.LatLng;
  zoom: number;
  signature: string;
  updatedAt: number;
};

export type LabelViewportStabilityOptions = {
  /** Maximum cumulative pan distance, in screen pixels, that can reuse the current label layout. */
  panSkipPx?: number;
  /** Maximum zoom delta considered the same zoom state. */
  zoomEpsilon?: number;
  /** Optional maximum time to keep skipping relayouts. */
  maxSkipMs?: number;
  /** State signature. A changed signature always disables reuse. */
  signature?: string;
};

const DEFAULT_PAN_SKIP_PX = 96;
const DEFAULT_ZOOM_EPSILON = 0.001;
const DEFAULT_MAX_SKIP_MS = 1200;

function finitePositive(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

export function captureLabelViewportSnapshot(map: L.Map, signature: string): LabelViewportSnapshot {
  return {
    center: map.getCenter(),
    zoom: map.getZoom(),
    signature,
    updatedAt: Date.now(),
  };
}

export function getPanDeltaPxFromSnapshot(map: L.Map, snapshot: LabelViewportSnapshot | null | undefined): number {
  if (!snapshot) return Infinity;
  const size = map.getSize();
  const currentCenterPx = L.point(size.x / 2, size.y / 2);
  const oldCenterPx = map.latLngToContainerPoint(snapshot.center);
  return Math.hypot(oldCenterPx.x - currentCenterPx.x, oldCenterPx.y - currentCenterPx.y);
}

export function shouldSkipPanRelayout(
  map: L.Map,
  snapshot: LabelViewportSnapshot | null | undefined,
  options: LabelViewportStabilityOptions = {},
): boolean {
  if (!snapshot) return false;

  const signature = String(options.signature ?? '');
  if (signature && snapshot.signature !== signature) return false;

  const zoomEpsilon = finitePositive(options.zoomEpsilon, DEFAULT_ZOOM_EPSILON);
  if (Math.abs(map.getZoom() - snapshot.zoom) > zoomEpsilon) return false;

  const maxSkipMs = finitePositive(options.maxSkipMs, DEFAULT_MAX_SKIP_MS);
  if (Date.now() - snapshot.updatedAt > maxSkipMs) return false;

  const panSkipPx = finitePositive(options.panSkipPx, DEFAULT_PAN_SKIP_PX);
  return getPanDeltaPxFromSnapshot(map, snapshot) <= panSkipPx;
}


export type LabelViewportReuseOptions = LabelViewportStabilityOptions & {
  layoutWindow?: LabelLayoutWindowState | null;
  layoutWindowOptions?: LabelLayoutWindowOptions;
};

/**
 * RB_SLU_15: Prefer padded layout-window reuse over the older small-pan shortcut.
 * If a layout window exists, leaving or approaching its edge forces a refresh.
 * If no window exists yet, fall back to the RB_SLU_12 small-pan check.
 */
export function shouldReuseLabelViewportLayout(
  map: L.Map,
  snapshot: LabelViewportSnapshot | null | undefined,
  options: LabelViewportReuseOptions = {},
): boolean {
  const signature = String(options.signature ?? '');

  if (options.layoutWindow) {
    return canReuseLabelLayoutWindow(
      map,
      options.layoutWindow,
      options.layoutWindowOptions,
      signature || undefined,
    );
  }

  return shouldSkipPanRelayout(map, snapshot, options);
}
