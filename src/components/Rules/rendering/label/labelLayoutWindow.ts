import * as L from 'leaflet';

/**
 * RB_SLU_15 padded label layout window.
 *
 * This is a lightweight pseudo-tile strategy:
 * - layout is calculated for the current viewport plus a pixel buffer;
 * - small/medium pans inside that buffered window can reuse the previous layout;
 * - once the visible viewport approaches or leaves the buffered window, the
 *   RuleDrivenLayer performs a full label refresh.
 */

export type LabelLayoutWindowState = {
  bounds: L.LatLngBounds;
  paddedBounds: L.LatLngBounds;
  zoom: number;
  signature: string;
  createdAt: number;
  paddingPx: number;
};

export type LabelLayoutWindowOptions = {
  /** Extra layout padding as a ratio of the larger viewport side. */
  paddingRatio?: number;
  /** Minimum layout padding in screen pixels. */
  minPaddingPx?: number;
  /** Maximum time to reuse the same layout window. */
  maxReuseMs?: number;
  /** When the current viewport reaches this inner edge band, refresh. */
  refreshEdgeRatio?: number;
  /** Maximum zoom delta considered the same layout window. */
  zoomEpsilon?: number;
};

export const DEFAULT_LABEL_LAYOUT_WINDOW_OPTIONS: Required<LabelLayoutWindowOptions> = {
  paddingRatio: 0.45,
  minPaddingPx: 240,
  maxReuseMs: 2500,
  refreshEdgeRatio: 0.18,
  zoomEpsilon: 0.001,
};

function finitePositive(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function finiteNonNegative(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export function normalizeLabelLayoutWindowOptions(
  options: LabelLayoutWindowOptions = {},
): Required<LabelLayoutWindowOptions> {
  const paddingRatio = finiteNonNegative(options.paddingRatio, DEFAULT_LABEL_LAYOUT_WINDOW_OPTIONS.paddingRatio);
  const minPaddingPx = finitePositive(options.minPaddingPx, DEFAULT_LABEL_LAYOUT_WINDOW_OPTIONS.minPaddingPx);
  const maxReuseMs = finitePositive(options.maxReuseMs, DEFAULT_LABEL_LAYOUT_WINDOW_OPTIONS.maxReuseMs);
  const refreshEdgeRatioRaw = finiteNonNegative(options.refreshEdgeRatio, DEFAULT_LABEL_LAYOUT_WINDOW_OPTIONS.refreshEdgeRatio);
  const refreshEdgeRatio = Math.max(0, Math.min(0.45, refreshEdgeRatioRaw));
  const zoomEpsilon = finitePositive(options.zoomEpsilon, DEFAULT_LABEL_LAYOUT_WINDOW_OPTIONS.zoomEpsilon);

  return {
    paddingRatio,
    minPaddingPx,
    maxReuseMs,
    refreshEdgeRatio,
    zoomEpsilon,
  };
}

export function getLabelLayoutWindowPaddingPx(
  map: L.Map,
  options: LabelLayoutWindowOptions = {},
): number {
  const opts = normalizeLabelLayoutWindowOptions(options);
  const size = map.getSize();
  return Math.max(opts.minPaddingPx, Math.max(size.x, size.y) * opts.paddingRatio);
}

export function createLabelLayoutWindow(
  map: L.Map,
  signature: string,
  options: LabelLayoutWindowOptions = {},
): LabelLayoutWindowState {
  const paddingPx = getLabelLayoutWindowPaddingPx(map, options);
  const size = map.getSize();

  const nw = map.containerPointToLatLng(L.point(-paddingPx, -paddingPx));
  const se = map.containerPointToLatLng(L.point(size.x + paddingPx, size.y + paddingPx));

  return {
    bounds: map.getBounds(),
    paddedBounds: L.latLngBounds(nw, se),
    zoom: map.getZoom(),
    signature,
    createdAt: Date.now(),
    paddingPx,
  };
}

function containsBounds(container: L.LatLngBounds, inner: L.LatLngBounds): boolean {
  return container.contains(inner.getNorthWest())
    && container.contains(inner.getNorthEast())
    && container.contains(inner.getSouthWest())
    && container.contains(inner.getSouthEast());
}

function shrinkBounds(bounds: L.LatLngBounds, ratio: number): L.LatLngBounds {
  if (ratio <= 0) return bounds;
  const clamped = Math.max(0, Math.min(0.45, ratio));
  const shrunk = bounds.pad(-clamped);
  // Leaflet may produce invalid or very small bounds if the map is tiny.
  return shrunk.isValid() ? shrunk : bounds;
}

export function canReuseLabelLayoutWindow(
  map: L.Map,
  state: LabelLayoutWindowState | null | undefined,
  options: LabelLayoutWindowOptions = {},
  signature?: string,
): boolean {
  if (!state) return false;

  const opts = normalizeLabelLayoutWindowOptions(options);
  if (signature && state.signature !== signature) return false;
  if (Math.abs(map.getZoom() - state.zoom) > opts.zoomEpsilon) return false;
  if (Date.now() - state.createdAt > opts.maxReuseMs) return false;

  const current = map.getBounds();
  if (!containsBounds(state.paddedBounds, current)) return false;

  // Refresh before the visible viewport reaches the padded-window edge. This
  // avoids waiting until labels suddenly run out at the boundary.
  const safeBounds = shrinkBounds(state.paddedBounds, opts.refreshEdgeRatio);
  return containsBounds(safeBounds, current);
}

/**
 * labelLayout.ts uses viewportPaddingPx as a shrink value. A negative value
 * expands the valid label placement area beyond the current viewport, which is
 * exactly what the padded layout window needs.
 */
export function getLabelLayoutViewportPaddingPx(state: LabelLayoutWindowState | null | undefined): number {
  if (!state) return 0;
  return -Math.max(0, state.paddingPx);
}
