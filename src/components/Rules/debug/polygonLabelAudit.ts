export type PolygonLabelBlockedStep =
  | "none"
  | "feature-filter"
  | "zoom-rule"
  | "no-polygon-geometry"
  | "no-label-text"
  | "not-in-real-viewport"
  | "not-in-layout-viewport"
  | "geo-anchor"
  | "geo-anchor-outside-polygon"
  | "geo-anchor-cache"
  | "request-build"
  | "viewport"
  | "density"
  | "collision"
  | "layout"
  | "render"
  | "unknown";

export type PolygonLabelAuditRenderMode = "normalLabel" | "hidden" | "none";

export type PolygonGeoCandidateAudit = {
  index: number;
  candidateId?: string;
  kind?: string;
  latLng?: { lat: number; lng: number };
  worldXZ?: { x: number; z: number };
  px?: { x: number; y: number };
  insidePolygon?: boolean;
  inRealViewport?: boolean;
  inLayoutViewport?: boolean;
  score?: number;
  scoreParts?: Record<string, number | boolean | undefined>;
  isPrevious?: boolean;
  isSelected?: boolean;
  rejected?: boolean;
  rejectedReason?: string;
};

export type PolygonLayoutCandidateAudit = {
  index: number;
  name: string;
  offsetPx?: { x: number; y: number };
  anchorPx?: { x: number; y: number };
  labelRect?: { x: number; y: number; w: number; h: number };
  rectInsideViewport?: boolean;
  anchorInsidePolygon?: boolean;
  labelCenterInsidePolygon?: boolean;
  collisionPassed?: boolean;
  collisionBlockedBy?: Array<{
    uid?: string;
    id?: string;
    name?: string;
    classCode?: string;
    collisionRole?: string;
    collisionGroup?: string;
    reason?: string;
  }>;
  densityPassed?: boolean;
  densityGridKey?: string;
  densityCountBefore?: number;
  densityMaxPerGrid?: number;
  densityBlockedReason?: string;
  selected?: boolean;
  rejected?: boolean;
  rejectedReason?: string;
};

export type PolygonLabelAuditRow = {
  index: number;
  uid: string;
  id?: string;
  name?: string;
  labelText?: string;

  classCode?: string;
  kind?: string;
  skind?: string;
  skind2?: string;
  world?: string;

  zoom: number;
  zoomLevel?: number;
  inRealViewport: boolean;
  inLayoutViewport: boolean;
  expectedInViewport: boolean;
  expectedLabel: boolean;

  displayed: boolean;
  renderMode?: PolygonLabelAuditRenderMode;
  blockedStep: PolygonLabelBlockedStep;
  blockedReason?: string;

  geometryKind?: "Polygon" | "MultiPolygon" | "unknown";
  polygonPartCount?: number;
  polygonAreaPx?: number;
  polygonBoundsPx?: { x: number; y: number; w: number; h: number };
  polygonCenterPx?: { x: number; y: number };

  geoAnchorKind?: string;
  geoAnchorCandidateKind?: string;
  geoAnchorCandidateId?: string;
  geoAnchorInsidePolygon?: boolean;
  geoAnchorLatLng?: { lat: number; lng: number };
  geoAnchorWorldXZ?: { x: number; z: number };
  geoAnchorPx?: { x: number; y: number };
  geoAnchorDistanceToPolygonCenterPx?: number;
  geoAnchorDistanceToViewportCenterPx?: number;
  previousGeoCandidateUsed?: boolean;
  previousGeoCandidateId?: string;
  candidateSwitchBlockedByThreshold?: boolean;
  candidateSwitchScoreDelta?: number;
  candidateSwitchThreshold?: number;
  geoCandidates?: PolygonGeoCandidateAudit[];

  layoutCandidateName?: string;
  layoutCandidateOffsetPx?: { x: number; y: number };
  finalLabelPx?: { x: number; y: number };
  finalAnchorInsidePolygon?: boolean;
  finalLabelCenterInsidePolygon?: boolean;
  layoutCandidatesTried?: string[];
  layoutCandidates?: PolygonLayoutCandidateAudit[];

  densityEnabled?: boolean;
  densityPassed?: boolean;
  densityGridKey?: string;
  densityGridSizePx?: number;
  densityCountBefore?: number;
  densityMaxPerGrid?: number;
  densityBlockedReason?: string;

  collisionRole?: string;
  collisionGroup?: string;
  priority?: number;
  collisionPassed?: boolean;
  collisionBlockedBy?: PolygonLayoutCandidateAudit["collisionBlockedBy"];

  placementCacheUsed?: boolean;
  placementCacheCandidateId?: string;
  geoCandidateCacheUsed?: boolean;
  geoCandidateCacheKey?: string;
  preferPreviousGeoCandidate?: boolean;
  switchThreshold?: number;
  switchBlocked?: boolean;
};

export type PolygonLabelAuditSnapshot = {
  worldId?: string;
  zoom: number;
  zoomLevel?: number;
  reason?: string;
  generatedAt: number;
  viewport: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  rows: PolygonLabelAuditRow[];
};

export type PolygonLabelAuditOptions = {
  classCodes?: string[];
  onlyHidden?: boolean;
  onlyDisplayed?: boolean;
  includePadded?: boolean;
  allCandidates?: boolean;
  includeCollisionDetails?: boolean;
  includeDensityDetails?: boolean;
};

function fmt(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "-";
  return String(value);
}

function fmtFixed(value: unknown, digits = 1): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "-";
}

function fmtPoint(p: { x: number; y: number } | undefined): string {
  if (!p) return "-";
  return `(${fmtFixed(p.x)}, ${fmtFixed(p.y)})`;
}

function fmtRect(rect: { x: number; y: number; w: number; h: number } | undefined): string {
  if (!rect) return "-";
  return `x:${fmtFixed(rect.x)} y:${fmtFixed(rect.y)} w:${fmtFixed(rect.w)} h:${fmtFixed(rect.h)}`;
}

function dateStamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fileStamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function sanitizeFilenamePart(value: unknown): string {
  return (
    String(value ?? "unknown")
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "unknown"
  );
}

function filterRows(rows: PolygonLabelAuditRow[], options?: PolygonLabelAuditOptions): PolygonLabelAuditRow[] {
  let out = rows;
  const classes = options?.classCodes?.map((s) => String(s).trim()).filter(Boolean);
  if (classes?.length) out = out.filter((r) => classes.includes(String(r.classCode ?? "")));
  if (options?.onlyHidden) out = out.filter((r) => !r.displayed);
  if (options?.onlyDisplayed) out = out.filter((r) => r.displayed);
  if (!options?.includePadded) out = out.filter((r) => r.inRealViewport);
  return out;
}

function countBy(rows: PolygonLabelAuditRow[], fn: (r: PolygonLabelAuditRow) => string): string {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = fn(r) || "unknown";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries()).map(([k, v]) => `${k}:${v}`).join(", ") || "-";
}

export function formatPolygonLabelAuditText(
  snapshot: PolygonLabelAuditSnapshot | null | undefined,
  options?: PolygonLabelAuditOptions,
): string {
  if (!snapshot) return "[RIA Polygon Label Audit]\nNo snapshot is available yet.";
  const rows = filterRows(snapshot.rows ?? [], options);
  const displayed = rows.filter((r) => r.displayed).length;
  const hidden = rows.length - displayed;
  const lines: string[] = [];
  lines.push("[RIA Polygon Label Audit]");
  lines.push(`generatedAt=${dateStamp(snapshot.generatedAt)}`);
  lines.push(`world=${fmt(snapshot.worldId)}`);
  lines.push(`zoom=${fmt(Math.round(snapshot.zoom * 100) / 100)}`);
  if (snapshot.zoomLevel !== undefined) lines.push(`zoomLevel=${fmt(snapshot.zoomLevel)}`);
  if (snapshot.reason) lines.push(`refreshReason=${snapshot.reason}`);
  lines.push(
    `viewport=N:${snapshot.viewport.north.toFixed(6)} S:${snapshot.viewport.south.toFixed(6)} E:${snapshot.viewport.east.toFixed(6)} W:${snapshot.viewport.west.toFixed(6)}`,
  );
  lines.push(`rows=${rows.length} displayed=${displayed} hidden=${hidden}`);
  lines.push(`summary=${countBy(rows, (r) => (r.displayed ? "displayed" : r.blockedStep))}`);
  lines.push(`classes=${countBy(rows, (r) => `${fmt(r.classCode)}:${r.displayed ? "displayed" : "hidden"}`)}`);
  lines.push(`anchorSummary=${countBy(rows, (r) => r.previousGeoCandidateUsed ? "previousUsed" : r.candidateSwitchBlockedByThreshold ? "switchBlocked" : r.geoAnchorCandidateKind ?? "anchorUnknown")}`);
  lines.push("");

  for (const row of rows) {
    lines.push(`[${row.index}] ID=${fmt(row.id)} Name=${fmt(row.name)} UID=${fmt(row.uid)}`);
    lines.push(`    Type=${fmt(row.classCode)} / Kind=${fmt(row.kind)} / SKind=${fmt(row.skind)} / SKind2=${fmt(row.skind2)}`);
    lines.push(`    InRealViewport=${row.inRealViewport ? "yes" : "no"} InLayoutViewport=${row.inLayoutViewport ? "yes" : "no"} ExpectedLabel=${row.expectedLabel ? "yes" : "no"}`);
    lines.push(`    LabelText=${fmt(row.labelText)} Displayed=${row.displayed ? "yes" : "no"} RenderMode=${fmt(row.renderMode ?? (row.displayed ? "normalLabel" : "hidden"))}`);
    lines.push(`    BlockedStep=${row.displayed ? "none" : fmt(row.blockedStep)} BlockedReason=${fmt(row.blockedReason)}`);
    lines.push(`    Geometry=${fmt(row.geometryKind)} parts=${fmt(row.polygonPartCount)} areaPx=${fmtFixed(row.polygonAreaPx)} bounds=${fmtRect(row.polygonBoundsPx)} center=${fmtPoint(row.polygonCenterPx)}`);
    lines.push(`    GeoAnchorKind=${fmt(row.geoAnchorKind)} Candidate=${fmt(row.geoAnchorCandidateKind)} CandidateId=${fmt(row.geoAnchorCandidateId)}`);
    lines.push(`    GeoAnchorInside=${row.geoAnchorInsidePolygon ? "yes" : "no"} GeoAnchorPx=${fmtPoint(row.geoAnchorPx)} DistToPolyCenterPx=${fmtFixed(row.geoAnchorDistanceToPolygonCenterPx)} DistToViewportCenterPx=${fmtFixed(row.geoAnchorDistanceToViewportCenterPx)}`);
    lines.push(`    PreviousGeoCandidateUsed=${row.previousGeoCandidateUsed ? "yes" : "no"} PreviousCandidate=${fmt(row.previousGeoCandidateId)} SwitchBlocked=${row.candidateSwitchBlockedByThreshold ? "yes" : "no"} SwitchDelta=${fmtFixed(row.candidateSwitchScoreDelta)} SwitchThreshold=${fmtFixed(row.candidateSwitchThreshold ?? row.switchThreshold)}`);
    lines.push(`    LayoutCandidate=${fmt(row.layoutCandidateName)} OffsetPx=${row.layoutCandidateOffsetPx ? `(${fmtFixed(row.layoutCandidateOffsetPx.x)}, ${fmtFixed(row.layoutCandidateOffsetPx.y)})` : "-"} FinalLabelPx=${fmtPoint(row.finalLabelPx)}`);
    lines.push(`    FinalAnchorInsidePolygon=${row.finalAnchorInsidePolygon ? "yes" : "no"} FinalLabelCenterInsidePolygon=${row.finalLabelCenterInsidePolygon ? "yes" : "no"} Tried=${fmt(row.layoutCandidatesTried?.join(","))}`);
    lines.push(`    Density=${row.densityEnabled ? (row.densityPassed ? "passed" : "blocked") : "disabled"} grid=${fmt(row.densityGridKey)} count=${fmt(row.densityCountBefore)}/${fmt(row.densityMaxPerGrid)} reason=${fmt(row.densityBlockedReason)}`);
    lines.push(`    Collision=${row.collisionPassed === undefined ? "-" : row.collisionPassed ? "passed" : "blocked"} Role=${fmt(row.collisionRole)} Group=${fmt(row.collisionGroup)} Priority=${fmt(row.priority)}`);
    if (options?.includeCollisionDetails !== false && row.collisionBlockedBy?.length) {
      lines.push(`    CollisionBlockedBy=${row.collisionBlockedBy.map((b) => `${fmt(b.classCode)}:${fmt(b.name ?? b.id ?? b.uid)}(${fmt(b.reason)})`).join("; ")}`);
    }
    if (options?.allCandidates && row.geoCandidates?.length) {
      lines.push("    GeoCandidates:");
      for (const c of row.geoCandidates) {
        lines.push(`      [${c.index}] kind=${fmt(c.kind)} id=${fmt(c.candidateId)} inside=${c.insidePolygon ? "yes" : "no"} realViewport=${c.inRealViewport ? "yes" : "no"} layoutViewport=${c.inLayoutViewport ? "yes" : "no"} selected=${c.isSelected ? "yes" : "no"} previous=${c.isPrevious ? "yes" : "no"} score=${fmtFixed(c.score)} px=${fmtPoint(c.px)}`);
      }
    }
    if (options?.allCandidates && row.layoutCandidates?.length) {
      lines.push("    LayoutCandidates:");
      for (const c of row.layoutCandidates) {
        lines.push(`      [${c.index}] ${c.name} offset=${c.offsetPx ? `(${fmtFixed(c.offsetPx.x)}, ${fmtFixed(c.offsetPx.y)})` : "-"} rect=${fmtRect(c.labelRect)} viewport=${c.rectInsideViewport ? "yes" : "no"} collision=${c.collisionPassed === undefined ? "-" : c.collisionPassed ? "passed" : "blocked"} density=${c.densityPassed === undefined ? "-" : c.densityPassed ? "passed" : "blocked"} selected=${c.selected ? "yes" : "no"} rejected=${c.rejected ? fmt(c.rejectedReason) : "no"}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function printPolygonLabelAudit(
  snapshot: PolygonLabelAuditSnapshot | null | undefined,
  options?: PolygonLabelAuditOptions,
): void {
  if (!snapshot) {
    console.warn("[RIA Polygon Label Audit] No snapshot is available yet. Move/zoom the map once, then retry.");
    return;
  }
  const rows = filterRows(snapshot.rows ?? [], options);
  const text = formatPolygonLabelAuditText(snapshot, options);
  console.groupCollapsed(`[RIA Polygon Label Audit] rows=${rows.length} displayed=${rows.filter((r) => r.displayed).length}`);
  console.log(text);
  try {
    console.table(rows.map((r) => ({
      index: r.index,
      id: r.id,
      name: r.name,
      classCode: r.classCode,
      displayed: r.displayed,
      blockedStep: r.displayed ? "none" : r.blockedStep,
      blockedReason: r.blockedReason,
      geoAnchorKind: r.geoAnchorKind,
      geoAnchorCandidateKind: r.geoAnchorCandidateKind,
      previousUsed: r.previousGeoCandidateUsed,
      switchBlocked: r.candidateSwitchBlockedByThreshold,
      layoutCandidate: r.layoutCandidateName,
      density: r.densityEnabled ? (r.densityPassed ? "passed" : "blocked") : "disabled",
      collision: r.collisionPassed === undefined ? "-" : r.collisionPassed ? "passed" : "blocked",
    })));
  } catch {
    // console.table may be unavailable in some embedded browsers.
  }
  console.groupEnd();
}

export function downloadPolygonLabelAuditTxt(
  snapshot: PolygonLabelAuditSnapshot | null | undefined,
  options?: PolygonLabelAuditOptions,
): void {
  if (!snapshot) {
    console.warn("[RIA Polygon Label Audit] No snapshot is available to download.");
    return;
  }
  if (typeof document === "undefined") return;
  const text = formatPolygonLabelAuditText(snapshot, options);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ria_polygon_label_audit_${sanitizeFilenamePart(snapshot.worldId)}_z${sanitizeFilenamePart(Math.round(snapshot.zoom * 100) / 100)}_${fileStamp(snapshot.generatedAt)}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
