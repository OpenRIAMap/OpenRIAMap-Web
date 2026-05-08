import type { FeatureRecord } from "@/components/Rules/rendering/renderRules";
import type { PlacedLabel } from "@/components/Rules/rendering/labelLayout";
import type { FeatureDisplayPlan } from "./displayTypes";
import { getDisplayPlanSortKey } from "./displayPriority";

/**
 * RB_SLU_10 display diagnostics.
 *
 * This module intentionally has no UI dependency. It provides a small, opt-in
 * audit payload so future debug panels or console tools can inspect why a
 * feature label was shown, hidden, forced, or de-prioritized.
 */

export type DisplayInteractionReason =
  | "selected"
  | "hovered"
  | "editing"
  | "searchResult"
  | "deletionMarked";

export type RuleDisplayDiagnostic = {
  featureUid: string;
  classCode?: string;
  idValue?: string;
  name?: string;
  geometryType: FeatureRecord["type"];

  displayTier: FeatureDisplayPlan["displayTier"];
  displayState: string;
  collisionRole: FeatureDisplayPlan["collision"]["role"];
  collisionGroup?: FeatureDisplayPlan["collision"]["group"];
  finalPriority: number;
  anchorStrategy: FeatureDisplayPlan["anchor"]["strategy"];
  sortKey: number;

  labelText?: string;
  labelHidden?: boolean;
  hiddenReason?: PlacedLabel["hiddenReason"];
  candidateName?: PlacedLabel["candidateName"];
  anchorCandidateIndex?: number;
  anchorCandidateId?: string;
  anchorCandidateSourceIndex?: number;
  anchorCandidateDisplayOrder?: number;
  candidateStaticWeight?: number;
  candidateScore?: number;
  candidateScoreParts?: unknown;
  textPathStatus?: PlacedLabel["textPathStatus"];
  textPathBudgetStatus?: PlacedLabel["textPathBudgetStatus"];
  textPathFallbackReason?: string;
  glyphPathStatus?: PlacedLabel["glyphPathStatus"];
  glyphPathFallbackReason?: string;
  glyphPathGlyphCount?: number;
  glyphPathUsed?: boolean;
  glyphPathCompactUsed?: boolean;
  glyphPathAdvanceScale?: number;
  glyphPathRenderable?: boolean;
  glyphPathFailureReason?: string;
  lineTextPathSignature?: string;
  lineTextZoomBucket?: number;
  lineTextMarkerReused?: boolean;
  lineTextMarkerPlanKey?: string;
  lineTextMarkerBudgetStatus?: "allowed" | "budgetExceeded";
  lineTextFullPlanCacheDisabled?: boolean;
  lineTextMarkerReuseDisabled?: boolean;
  lineTextMoveRelayoutForced?: boolean;
  lineTextActualRenderMode?: "glyphPath" | "textPath" | "simpleLineLabel" | "normalLabel" | "hidden";
  lineTextAdvancedRenderFailed?: boolean;
  lineTextSimpleFallbackUsed?: boolean;
  lineTextCollisionRectMode?: string;
  lineTextRepositionMode?: string;
  lineTextRepositionUsed?: boolean;
  lineTextRepositionShiftIndex?: number;
  lineTextRepositionAttempts?: number;
  lineTextRepositionFailureReason?: string;
  lineTextStrictSvgRequired?: boolean;
  lineTextAvoidLineGeometry?: boolean;
  lineTextRealViewportFirst?: boolean;
  lineTextPlanKeyCleanupApplied?: boolean;
  lineTextViewportRectMode?: string;
  lineTextViewportCandidateMode?: string;
  lineTextRectSource?: string;
  lineTextRawRectImplausible?: boolean;
  lineTextRawRectCenterDistancePx?: number;
  lineTextViewportTempBase?: boolean;
  lineTextViewportLocalIntervalIndex?: number;
  lineTextViewportLocalIntervalLengthPx?: number;
  glyphPathPolicy?: FeatureDisplayPlan["anchor"]["cjkGlyphRotationPolicy"];
  glyphPathUprightThresholdDeg?: number;
  glyphPathBudgetStatus?: PlacedLabel["glyphPathStatus"];
  polygonAuditBlockedStep?: string;
  polygonAuditBlockedReason?: string;
  polygonGeoAnchorKind?: string;
  polygonGeoAnchorCandidateKind?: string;
  polygonGeoAnchorInside?: boolean;
  polygonPreviousGeoCandidateUsed?: boolean;
  polygonCandidateSwitchBlockedByThreshold?: boolean;
  polygonLayoutCandidateName?: string;
  polygonDensityBlocked?: boolean;
  polygonCollisionBlocked?: boolean;
  glyphPathCandidateId?: string;
  lineCandidateOrdering?: FeatureDisplayPlan["anchor"]["lineCandidateOrdering"];
  lineTextOrientationPolicy?: FeatureDisplayPlan["anchor"]["lineTextOrientationPolicy"];

  interactions?: DisplayInteractionReason[];
};

declare global {
  interface Window {
    __RIA_RULE_DISPLAY_DEBUG__?: boolean;
  }
}

function stringOrUndefined(value: unknown): string | undefined {
  const s = String(value ?? "").trim();
  return s || undefined;
}

export function isDisplayDiagnosticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__RIA_RULE_DISPLAY_DEBUG__ === true) return true;
  try {
    return window.localStorage?.getItem("ria_rule_display_debug") === "1";
  } catch {
    return false;
  }
}

export function createRuleDisplayDiagnostic(args: {
  feature: FeatureRecord;
  plan: FeatureDisplayPlan;
  placedLabel?: PlacedLabel | null;
  interactions?: DisplayInteractionReason[];
}): RuleDisplayDiagnostic {
  const { feature, plan, placedLabel, interactions = [] } = args;
  const labelHidden = placedLabel ? !!placedLabel.hidden : undefined;

  let displayState = "geometryOnly";
  if (placedLabel) {
    displayState = placedLabel.hidden ? "labelHidden" : "labelVisible";
  } else if (plan.symbol.enabled && plan.label.enabled) {
    displayState = "symbolWithLabelPlan";
  } else if (plan.symbol.enabled) {
    displayState = "symbolOnly";
  } else if (plan.label.enabled) {
    displayState = "labelPlanned";
  }

  return {
    featureUid: feature.uid,
    classCode: stringOrUndefined(feature.meta?.Class),
    idValue: stringOrUndefined(
      feature.meta?.idValue ?? (feature.featureInfo as any)?.ID,
    ),
    name: stringOrUndefined(
      (feature.featureInfo as any)?.Name ?? (feature.featureInfo as any)?.name,
    ),
    geometryType: feature.type,
    displayTier: plan.displayTier,
    displayState,
    collisionRole: plan.collision.role,
    collisionGroup: plan.collision.group,
    finalPriority: plan.collision.priority,
    anchorStrategy: plan.anchor.strategy,
    sortKey: getDisplayPlanSortKey(plan),
    labelText: placedLabel?.text,
    labelHidden,
    hiddenReason: placedLabel?.hiddenReason,
    candidateName: placedLabel?.candidateName,
    anchorCandidateIndex: placedLabel?.anchorCandidateIndex,
    anchorCandidateId: placedLabel?.anchorCandidateId,
    anchorCandidateSourceIndex: placedLabel?.anchorCandidateSourceIndex,
    anchorCandidateDisplayOrder: placedLabel?.anchorCandidateDisplayOrder,
    candidateStaticWeight: placedLabel?.candidateStaticWeight,
    candidateScore: placedLabel?.candidateScore,
    candidateScoreParts: placedLabel?.candidateScoreParts,
    textPathStatus: placedLabel?.textPathStatus,
    textPathBudgetStatus: placedLabel?.textPathBudgetStatus,
    textPathFallbackReason: placedLabel?.textPathFallbackReason,
    glyphPathStatus: placedLabel?.glyphPathStatus,
    glyphPathFallbackReason: placedLabel?.glyphPathFallbackReason,
    glyphPathGlyphCount: placedLabel?.glyphPathGlyphCount,
    glyphPathUsed: placedLabel?.glyphPathUsed,
    glyphPathCompactUsed: placedLabel?.glyphPathCompactUsed,
    glyphPathAdvanceScale: placedLabel?.glyphPathAdvanceScale,
    glyphPathRenderable: placedLabel?.glyphPathRenderable,
    glyphPathFailureReason: placedLabel?.glyphPathFailureReason,
    lineTextPathSignature: placedLabel?.lineTextPathSignature,
    lineTextZoomBucket: placedLabel?.lineTextZoomBucket,
    lineTextFullPlanCacheDisabled: true,
    lineTextMarkerReuseDisabled: true,
    lineTextMoveRelayoutForced: true,
    lineTextActualRenderMode: placedLabel?.hidden
      ? "hidden"
      : placedLabel?.glyphPathUsed
        ? "glyphPath"
        : placedLabel?.textPathStatus === "usedTextPath"
          ? "textPath"
          : placedLabel?.textPathStatus
            ? "simpleLineLabel"
            : undefined,
    lineTextAdvancedRenderFailed: !!placedLabel?.glyphPathFailureReason,
    lineTextSimpleFallbackUsed:
      !!placedLabel?.glyphPathFailureReason && !placedLabel?.glyphPathUsed,
    lineTextCollisionRectMode: plan.anchor.lineTextCollisionRectMode,
    lineTextRepositionMode: placedLabel?.lineTextRepositionMode,
    lineTextRepositionUsed: placedLabel?.lineTextRepositionUsed,
    lineTextRepositionShiftIndex: placedLabel?.lineTextRepositionShiftIndex,
    lineTextRepositionAttempts: placedLabel?.lineTextRepositionAttempts,
    lineTextRepositionFailureReason: placedLabel?.lineTextRepositionFailureReason,
    lineTextStrictSvgRequired: placedLabel?.lineTextStrictSvgRequired,
    lineTextAvoidLineGeometry: placedLabel?.lineTextAvoidLineGeometry,
    lineTextRealViewportFirst: placedLabel?.lineTextRealViewportFirst,
    lineTextPlanKeyCleanupApplied: true,
    lineTextViewportRectMode: placedLabel?.lineTextViewportRectMode,
    lineTextViewportCandidateMode: placedLabel?.lineTextViewportCandidateMode,
    lineTextRectSource: placedLabel?.lineTextRectSource,
    lineTextRawRectImplausible: placedLabel?.lineTextRawRectImplausible,
    lineTextRawRectCenterDistancePx: placedLabel?.lineTextRawRectCenterDistancePx,
    lineTextViewportTempBase: placedLabel?.lineTextViewportTempBase,
    lineTextViewportLocalIntervalIndex: placedLabel?.lineTextViewportLocalIntervalIndex,
    lineTextViewportLocalIntervalLengthPx: placedLabel?.lineTextViewportLocalIntervalLengthPx,
    glyphPathPolicy: plan.anchor.cjkGlyphRotationPolicy,
    glyphPathUprightThresholdDeg: plan.anchor.cjkGlyphUprightAngleThresholdDeg,
    glyphPathBudgetStatus: placedLabel?.glyphPathStatus,
    polygonLayoutCandidateName: placedLabel?.polygonLayoutCandidateName,
    polygonDensityBlocked:
      placedLabel?.densityPassed === undefined ? undefined : !placedLabel.densityPassed,
    polygonCollisionBlocked:
      placedLabel?.collisionPassed === undefined ? undefined : !placedLabel.collisionPassed,
    glyphPathCandidateId: placedLabel?.anchorCandidateId,
    lineCandidateOrdering: plan.anchor.lineCandidateOrdering,
    lineTextOrientationPolicy: plan.anchor.lineTextOrientationPolicy,
    interactions: interactions.length ? interactions : undefined,
  };
}

export function emitRuleDisplayDiagnostics(
  records: RuleDisplayDiagnostic[],
): void {
  if (!records.length || !isDisplayDiagnosticsEnabled()) return;

  const detail = {
    timestamp: Date.now(),
    count: records.length,
    records,
  };

  try {
    window.dispatchEvent(
      new CustomEvent("ria:rule-display-diagnostics", { detail }),
    );
  } catch {
    // Diagnostics must never break map rendering.
  }

  try {
    // Keep console output opt-in and compact. A future UI panel can listen to the event above.
    // eslint-disable-next-line no-console
    console.debug("[RB_SLU diagnostics]", detail);
  } catch {
    // noop
  }
}
