import type { TextPathStatus } from "@/components/Rules/rendering/display/displayTypes";

export type LineLabelAuditBlockedStep =
  | "none"
  | "feature-filter"
  | "zoom-rule"
  | "no-line-geometry"
  | "no-label-text"
  | "anchor-resolve"
  | "request-build"
  | "advanced-budget"
  | "layout"
  | "collision"
  | "chainage-search"
  | "svg-eligibility"
  | "viewport"
  | "render"
  | "unknown";

export type LineLabelAuditRenderMode =
  | "glyphPath"
  | "textPath"
  | "simpleLineLabel"
  | "normalLabel"
  | "hidden"
  | "none";

export type LineLabelViewportFailureSubtype =
  | "anchorPointOutsideViewport"
  | "labelRectOutsideViewport"
  | "labelRectOversizedForViewport"
  | "pathSliceOutsideViewport"
  | "noAttemptAnchorInsideViewport"
  | "noAttemptRectInsideViewport"
  | "candidateSourcePathLimited"
  | "candidateStepTooSmall"
  | "viewportBufferTooSmall"
  | "unknownViewportFailure";

export type LineLabelViewportAttemptAudit = {
  attemptIndex: number;
  candidateId?: string;
  baseCandidateId?: string;
  shiftIndex?: number;

  anchorPx?: { x: number; y: number };
  anchorInsideViewport?: boolean;

  rect?: { x: number; y: number; w: number; h: number };
  rawRect?: { x: number; y: number; w: number; h: number };
  normalizedRect?: { x: number; y: number; w: number; h: number };
  rectSource?: "rawMetrics" | "anchorNormalized" | "anchorNormalizedFallback";
  rawRectCenterDistancePx?: number;
  rawRectImplausible?: boolean;
  viewportTempBase?: boolean;
  viewportLocalIntervalIndex?: number;
  viewportLocalIntervalLengthPx?: number;
  rectInsideViewport?: boolean;
  rectOversizedForViewport?: boolean;

  overflow?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    max: number;
  };

  pathSliceBoundsPx?: { x: number; y: number; w: number; h: number };
  pathSliceInsideRatio?: number;
  pathSliceLengthPx?: number;

  estimatedLabelSpanPx?: number;
  effectiveStepPx?: number;

  sourcePathKind?: "fullPathLatLngs" | "localPathLatLngs" | "unknown";
  sourcePathPointCount?: number;
  sourcePathLengthPx?: number;

  viewportSubtype?: LineLabelViewportFailureSubtype;
  viewportReason?: string;

  svgEligible?: boolean;
  svgFailureReason?: string;
  glyphPathStatus?: string;
  textPathStatus?: string;
};

export type LineLabelAuditRow = {
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
  inRealViewport: boolean;
  inLayoutViewport: boolean;
  expectedInViewport: boolean;
  expectedLabel: boolean;

  displayed: boolean;
  blockedStep: LineLabelAuditBlockedStep;
  blockedReason?: string;

  candidateId?: string;
  candidateChainage?: number;
  repositionMode?: string;
  repositionShiftIndex?: number;
  repositionAttempts?: number;
  repositionFailureReason?: string;

  viewportFailureSubtype?: LineLabelViewportFailureSubtype;
  viewportFailureSummary?: string;
  viewportBufferPx?: number;
  viewportSizePx?: { w: number; h: number };
  viewportAttempts?: LineLabelViewportAttemptAudit[];
  viewportBestAttempt?: LineLabelViewportAttemptAudit;
  anyAttemptAnchorInsideViewport?: boolean;
  anyAttemptRectInsideViewport?: boolean;
  anyAttemptRectOversized?: boolean;
  sourcePathKind?: "fullPathLatLngs" | "localPathLatLngs" | "unknown";
  sourcePathPointCount?: number;
  sourcePathLengthPx?: number;
  estimatedLabelSpanPx?: number;
  effectiveStepPx?: number;
  viewportRectSource?: "rawMetrics" | "anchorNormalized" | "anchorNormalizedFallback";
  viewportRawRectImplausible?: boolean;
  viewportRawRectCenterDistancePx?: number;
  viewportTempBase?: boolean;
  viewportLocalIntervalIndex?: number;
  viewportLocalIntervalLengthPx?: number;

  renderMode?: LineLabelAuditRenderMode;
  textPathStatus?: TextPathStatus;
  glyphPathStatus?: string;
  glyphPathFallbackReason?: string;
  textPathFallbackReason?: string;

  collisionRole?: string;
  collisionGroup?: string;
  priority?: number;
};

export type LineLabelAuditSnapshot = {
  worldId?: string;
  zoom: number;
  zoomLevel?: number;
  generatedAt: number;
  reason?: string;
  viewport: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  rows: LineLabelAuditRow[];
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

function fmtRect(
  rect: { x: number; y: number; w: number; h: number } | undefined,
): string {
  if (!rect) return "-";
  return `x:${fmtFixed(rect.x)} y:${fmtFixed(rect.y)} w:${fmtFixed(rect.w)} h:${fmtFixed(rect.h)}`;
}

function fmtOverflow(
  overflow: LineLabelViewportAttemptAudit["overflow"],
): string {
  if (!overflow) return "-";
  return `L:${fmtFixed(overflow.left)} R:${fmtFixed(overflow.right)} T:${fmtFixed(overflow.top)} B:${fmtFixed(overflow.bottom)} max:${fmtFixed(overflow.max)}`;
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

export function formatLineLabelAuditText(
  snapshot: LineLabelAuditSnapshot | null | undefined,
): string {
  if (!snapshot) return "[RIA Line Label Audit]\nNo snapshot is available yet.";

  const rows = snapshot.rows ?? [];
  const displayed = rows.filter((r) => r.displayed).length;
  const hidden = rows.length - displayed;
  const byStep = new Map<string, number>();
  for (const row of rows) {
    const step = row.displayed ? "displayed" : row.blockedStep || "unknown";
    byStep.set(step, (byStep.get(step) ?? 0) + 1);
  }

  const lines: string[] = [];
  lines.push("[RIA Line Label Audit]");
  lines.push(`generatedAt=${dateStamp(snapshot.generatedAt)}`);
  lines.push(`world=${fmt(snapshot.worldId)}`);
  lines.push(`zoom=${fmt(Math.round(snapshot.zoom * 100) / 100)}`);
  if (snapshot.zoomLevel !== undefined)
    lines.push(`zoomLevel=${fmt(snapshot.zoomLevel)}`);
  if (snapshot.reason) lines.push(`refreshReason=${snapshot.reason}`);
  lines.push(
    `viewport=N:${snapshot.viewport.north.toFixed(6)} S:${snapshot.viewport.south.toFixed(6)} E:${snapshot.viewport.east.toFixed(6)} W:${snapshot.viewport.west.toFixed(6)}`,
  );
  lines.push(`rows=${rows.length} displayed=${displayed} hidden=${hidden}`);
  lines.push(
    `summary=${Array.from(byStep.entries())
      .map(([k, v]) => `${k}:${v}`)
      .join(", ")}`,
  );
  lines.push("");

  for (const row of rows) {
    lines.push(
      `[${row.index}] ID=${fmt(row.id)} Name=${fmt(row.name)} UID=${fmt(row.uid)}`,
    );
    lines.push(
      `    Type=${fmt(row.classCode)} / Kind=${fmt(row.kind)} / SKind=${fmt(row.skind)} / SKind2=${fmt(row.skind2)}`,
    );
    lines.push(
      `    InRealViewport=${row.inRealViewport ? "yes" : "no"} InLayoutViewport=${row.inLayoutViewport ? "yes" : "no"} ExpectedLabel=${row.expectedLabel ? "yes" : "no"}`,
    );
    lines.push(
      `    LabelText=${fmt(row.labelText)} Displayed=${row.displayed ? "yes" : "no"} RenderMode=${fmt(row.renderMode ?? (row.displayed ? "normalLabel" : "hidden"))}`,
    );
    lines.push(
      `    BlockedStep=${row.displayed ? "none" : fmt(row.blockedStep)} BlockedReason=${fmt(row.blockedReason)}`,
    );
    if (!row.displayed && row.blockedStep === "viewport") {
      lines.push(
        `    ViewportSubtype=${fmt(row.viewportFailureSubtype)} ViewportSummary=${fmt(row.viewportFailureSummary)}`,
      );
      lines.push(
        `    ViewportBufferPx=${fmt(row.viewportBufferPx)} ViewportSize=${fmt(row.viewportSizePx ? `${fmtFixed(row.viewportSizePx.w)}x${fmtFixed(row.viewportSizePx.h)}` : undefined)}`,
      );
      lines.push(
        `    AnchorInsideAny=${row.anyAttemptAnchorInsideViewport ? "yes" : "no"} RectInsideAny=${row.anyAttemptRectInsideViewport ? "yes" : "no"} RectOversizedAny=${row.anyAttemptRectOversized ? "yes" : "no"}`,
      );
      lines.push(
        `    SourcePath=${fmt(row.sourcePathKind)} points=${fmt(row.sourcePathPointCount)} lengthPx=${fmtFixed(row.sourcePathLengthPx)}`,
      );
      lines.push(
        `    EstimatedSpanPx=${fmtFixed(row.estimatedLabelSpanPx)} EffectiveStepPx=${fmtFixed(row.effectiveStepPx)}`,
      );
      const best = row.viewportBestAttempt;
      if (best) {
        lines.push(
          `    BestAttempt shift=${fmt(best.shiftIndex)} subtype=${fmt(best.viewportSubtype)} anchorInside=${best.anchorInsideViewport ? "yes" : "no"} rectInside=${best.rectInsideViewport ? "yes" : "no"}`,
        );
        lines.push(
          `      anchorPx=${best.anchorPx ? `(${fmtFixed(best.anchorPx.x)}, ${fmtFixed(best.anchorPx.y)})` : "-"} rect=${fmtRect(best.rect)} overflow=${fmtOverflow(best.overflow)}`,
        );
      }
    }
    lines.push(
      `    CandidateId=${fmt(row.candidateId)} Chainage=${fmt(row.candidateChainage)} Reposition=${fmt(row.repositionMode)} shift=${fmt(row.repositionShiftIndex)} attempts=${fmt(row.repositionAttempts)}`,
    );
    lines.push(
      `    RepositionFailure=${fmt(row.repositionFailureReason)} TextPathStatus=${fmt(row.textPathStatus)} GlyphPathStatus=${fmt(row.glyphPathStatus)}`,
    );
    lines.push(
      `    CollisionRole=${fmt(row.collisionRole)} CollisionGroup=${fmt(row.collisionGroup)} Priority=${fmt(row.priority)}`,
    );
    lines.push("");
  }

  return lines.join("\n");
}

export function printLineLabelAudit(
  snapshot: LineLabelAuditSnapshot | null | undefined,
): void {
  if (!snapshot) {
    console.warn(
      "[RIA Line Label Audit] No snapshot is available yet. Move/zoom the map once, then retry.",
    );
    return;
  }
  const text = formatLineLabelAuditText(snapshot);
  console.groupCollapsed(
    `[RIA Line Label Audit] rows=${snapshot.rows.length} displayed=${snapshot.rows.filter((r) => r.displayed).length}`,
  );
  console.log(text);
  try {
    console.table(
      snapshot.rows.map((r) => ({
        index: r.index,
        id: r.id,
        name: r.name,
        classCode: r.classCode,
        labelText: r.labelText,
        displayed: r.displayed,
        blockedStep: r.displayed ? "none" : r.blockedStep,
        blockedReason: r.blockedReason,
        candidateId: r.candidateId,
        repositionShiftIndex: r.repositionShiftIndex,
        renderMode: r.renderMode,
      })),
    );
  } catch {
    // console.table may be unavailable in some embedded browsers.
  }
  console.groupEnd();
}

export function formatLineLabelViewportAuditText(
  snapshot: LineLabelAuditSnapshot | null | undefined,
  options?: { allAttempts?: boolean },
): string {
  if (!snapshot)
    return "[RIA Line Label Viewport Audit]\nNo snapshot is available yet.";
  const rows = (snapshot.rows ?? []).filter(
    (r) => !r.displayed && r.blockedStep === "viewport",
  );
  const subtypeCounts = new Map<string, number>();
  for (const row of rows) {
    const subtype = row.viewportFailureSubtype ?? "unknownViewportFailure";
    subtypeCounts.set(subtype, (subtypeCounts.get(subtype) ?? 0) + 1);
  }
  const lines: string[] = [];
  lines.push("[RIA Line Label Viewport Audit]");
  lines.push(`generatedAt=${dateStamp(snapshot.generatedAt)}`);
  lines.push(`world=${fmt(snapshot.worldId)}`);
  lines.push(`zoom=${fmt(Math.round(snapshot.zoom * 100) / 100)}`);
  if (snapshot.zoomLevel !== undefined)
    lines.push(`zoomLevel=${fmt(snapshot.zoomLevel)}`);
  if (snapshot.reason) lines.push(`refreshReason=${snapshot.reason}`);
  lines.push(`rows=${snapshot.rows.length} viewportBlocked=${rows.length}`);
  lines.push(
    `subtypes=${
      Array.from(subtypeCounts.entries())
        .map(([k, v]) => `${k}:${v}`)
        .join(", ") || "-"
    }`,
  );
  lines.push("");

  for (const row of rows) {
    lines.push(
      `[${row.index}] ID=${fmt(row.id)} Name=${fmt(row.name)} UID=${fmt(row.uid)}`,
    );
    lines.push(
      `    ViewportSubtype=${fmt(row.viewportFailureSubtype)} Summary=${fmt(row.viewportFailureSummary)}`,
    );
    lines.push(
      `    Attempts=${fmt(row.repositionAttempts)} AnchorInsideAny=${row.anyAttemptAnchorInsideViewport ? "yes" : "no"} RectInsideAny=${row.anyAttemptRectInsideViewport ? "yes" : "no"} RectOversizedAny=${row.anyAttemptRectOversized ? "yes" : "no"}`,
    );
    lines.push(
      `    SourcePath=${fmt(row.sourcePathKind)} points=${fmt(row.sourcePathPointCount)} lengthPx=${fmtFixed(row.sourcePathLengthPx)}`,
    );
    lines.push(
      `    LabelSpanPx=${fmtFixed(row.estimatedLabelSpanPx)} StepPx=${fmtFixed(row.effectiveStepPx)} ViewportBufferPx=${fmt(row.viewportBufferPx)}`,
    );
    const best = row.viewportBestAttempt;
    if (best) {
      lines.push(
        `    BestAttempt shift=${fmt(best.shiftIndex)} candidate=${fmt(best.candidateId)} subtype=${fmt(best.viewportSubtype)}`,
      );
      lines.push(
        `      anchorInside=${best.anchorInsideViewport ? "yes" : "no"} rectInside=${best.rectInsideViewport ? "yes" : "no"} rectOversized=${best.rectOversizedForViewport ? "yes" : "no"}`,
      );
      lines.push(
        `      anchorPx=${best.anchorPx ? `(${fmtFixed(best.anchorPx.x)}, ${fmtFixed(best.anchorPx.y)})` : "-"}`,
      );
      lines.push(`      rect=${fmtRect(best.rect)}`);
      lines.push(`      overflow=${fmtOverflow(best.overflow)}`);
      lines.push(
        `      pathSliceBounds=${fmtRect(best.pathSliceBoundsPx)} pathInsideRatio=${fmtFixed(best.pathSliceInsideRatio, 3)} pathSliceLengthPx=${fmtFixed(best.pathSliceLengthPx)}`,
      );
      lines.push(
        `      RectSource=${fmt(best.rectSource)} RawRectImplausible=${best.rawRectImplausible ? "yes" : "no"} RawRectCenterDistancePx=${fmtFixed(best.rawRectCenterDistancePx)}`,
      );
      lines.push(
        `      rawRect=${fmtRect(best.rawRect)} normalizedRect=${fmtRect(best.normalizedRect)}`,
      );
      lines.push(
        `      ViewportTempBase=${best.viewportTempBase ? "yes" : "no"} ViewportLocalInterval=${fmt(best.viewportLocalIntervalIndex)} intervalLengthPx=${fmtFixed(best.viewportLocalIntervalLengthPx)}`,
      );
    }
    if (options?.allAttempts && row.viewportAttempts?.length) {
      lines.push("    AttemptsDetail:");
      for (const at of row.viewportAttempts) {
        lines.push(
          `      [${at.attemptIndex}] shift=${fmt(at.shiftIndex)} subtype=${fmt(at.viewportSubtype)} anchorInside=${at.anchorInsideViewport ? "yes" : "no"} rectInside=${at.rectInsideViewport ? "yes" : "no"} rect=${fmtRect(at.rect)} rectSource=${fmt(at.rectSource)} rawImplausible=${at.rawRectImplausible ? "yes" : "no"} viewportTemp=${at.viewportTempBase ? "yes" : "no"} overflow=${fmtOverflow(at.overflow)}`,
        );
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function printLineLabelViewportAudit(
  snapshot: LineLabelAuditSnapshot | null | undefined,
  options?: { allAttempts?: boolean },
): void {
  if (!snapshot) {
    console.warn(
      "[RIA Line Label Viewport Audit] No snapshot is available yet. Move/zoom the map once, then retry.",
    );
    return;
  }
  const rows = snapshot.rows.filter(
    (r) => !r.displayed && r.blockedStep === "viewport",
  );
  const text = formatLineLabelViewportAuditText(snapshot, options);
  console.groupCollapsed(
    `[RIA Line Label Viewport Audit] viewportBlocked=${rows.length}`,
  );
  console.log(text);
  try {
    console.table(
      rows.map((r) => ({
        index: r.index,
        id: r.id,
        name: r.name,
        subtype: r.viewportFailureSubtype,
        attempts: r.repositionAttempts,
        anchorInsideAny: r.anyAttemptAnchorInsideViewport,
        rectInsideAny: r.anyAttemptRectInsideViewport,
        bestShift: r.viewportBestAttempt?.shiftIndex,
        bestOverflow: r.viewportBestAttempt?.overflow?.max,
        sourcePath: r.sourcePathKind,
        stepPx: r.effectiveStepPx,
        rectSource: r.viewportBestAttempt?.rectSource,
        rawRectImplausible: r.viewportBestAttempt?.rawRectImplausible,
        viewportTempBase: r.viewportBestAttempt?.viewportTempBase,
      })),
    );
  } catch {
    // console.table may be unavailable in some embedded browsers.
  }
  console.groupEnd();
}

export function downloadLineLabelViewportAuditTxt(
  snapshot: LineLabelAuditSnapshot | null | undefined,
  options?: { allAttempts?: boolean },
): void {
  if (!snapshot) {
    console.warn(
      "[RIA Line Label Viewport Audit] No snapshot is available to download.",
    );
    return;
  }
  if (typeof document === "undefined") return;
  const text = formatLineLabelViewportAuditText(snapshot, options);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ria_line_label_viewport_audit_${sanitizeFilenamePart(snapshot.worldId)}_z${sanitizeFilenamePart(Math.round(snapshot.zoom * 100) / 100)}_${fileStamp(snapshot.generatedAt)}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadLineLabelAuditTxt(
  snapshot: LineLabelAuditSnapshot | null | undefined,
): void {
  if (!snapshot) {
    console.warn(
      "[RIA Line Label Audit] No snapshot is available to download.",
    );
    return;
  }
  if (typeof document === "undefined") return;
  const text = formatLineLabelAuditText(snapshot);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ria_line_label_audit_${sanitizeFilenamePart(snapshot.worldId)}_z${sanitizeFilenamePart(Math.round(snapshot.zoom * 100) / 100)}_${fileStamp(snapshot.generatedAt)}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
