import type { FeatureDisplayRuleDraft } from "./displayTypes";

export const DISPLAY_PROFILE_KEYS = [
  "largeGeoSurface",
  "networkLine",
  "buildingStructure",
  "stationStructure",
  "transportNode",
  "poiPoint",
  "indoorUnit",
  "geometryOnlyFallback",
] as const;

export type DisplayProfileKey = (typeof DISPLAY_PROFILE_KEYS)[number];

export const DISPLAY_PROFILES: Record<
  DisplayProfileKey,
  FeatureDisplayRuleDraft
> = {
  largeGeoSurface: {
    displayTier: "geoStructure",
    visibility: {
      geometryMinZoom: 1,
      labelMinZoom: 3,
      minScreenAreaPx: 12000,
    },
    anchor: {
      strategy: "largeFeatureStableCandidates",
      geoCandidateMode: "viewportAwareCandidateSet",
      geoCandidateCount: 9,
      geoCandidateMax: 100,
      preferPreviousGeoCandidate: true,
      switchThreshold: 0.4,
      candidateWeightMode: "distanceToCenter",
      candidateSwitchThreshold: 20,
      candidateReuseBonus: 12,
      candidateViewportPreference: true,
      candidateEdgePenalty: 8,
      largeFeature: {
        minScreenAreaPx: 12000,
        preferViewportCenter: true,
      },
    },
    label: {
      enabled: true,
      source: "Name",
      styleKey: "gm-outline",
      abbreviation: { enabled: true, maxChars: 12, suffix: "…" },
    },
    collision: {
      role: "important",
      priority: 5200,
      group: "surfaceLabel",
      collideWith: ["requiredLabel", "importantLabel"],
      allowHide: false,
      paddingPx: 8,
      hidePolicy: "forceShow",
    },
  },

  networkLine: {
    displayTier: "network",
    visibility: {
      geometryMinZoom: 0,
      labelMinZoom: 5,
    },
    anchor: {
      strategy: "polylineStableCandidates",
      anchorSamples: 7,
      lineLabelMode: "strictOnLine",
      lineCandidateSpacing: 160,
      lineCandidateMinSpacing: 40,
      lineCandidateMax: 32,
      lineShortThresholdMultiplier: 2,
      lineLongMode: "evenSplit",
      lineCandidateOrdering: "centerOut",
      lineCenterWeightMode: "distanceToCenter",
      lineCandidateSwitchThreshold: 16,
      lineCandidateReuseBonus: 12,
      lineCandidateEndpointPaddingRatio: 0.12,
      lineCandidateEndpointPaddingMin: 40,
      preferPreviousLineCandidate: true,
      lineCandidateHysteresisPx: 160,
      minLineLabelLengthPx: 80,
      maxAngleDeltaDeg: 45,
      lineTextMode: "auto",
      textPathMinLengthPx: 120,
      textPathPaddingPx: 30,
      textPathMaxAngleDeltaDeg: 45,
      textPathMaxTotalBendDeg: 100,
      textPathPreferReadableDirection: true,
      textPathFallback: "rotatedLabel",
      lineTextOrientationPolicy: "autoCjkUpright",
      textPathVerticalAngleThresholdDeg: 45,
      textPathVerticalLengthRatio: 0.6,
      lineCjkVerticalRenderMode: "legacyVertical",
      advancedLineTextEnabled: true,
      advancedLineTextBudgetGroup: "network",
      cjkGlyphRotationPolicy: "uprightWhenSteep",
      cjkGlyphUprightAngleThresholdDeg: 45,
      cjkGlyphPathMode: "auto",
      cjkGlyphSpacingPx: 2,
      cjkGlyphCollisionPaddingPx: 8,
      cjkGlyphMaxCount: 16,
      cjkGlyphAllowTextPathFallback: false,
      lineTextPathHalfLengthMultiplier: 1.6,
      lineTextPathMinHalfLengthWorld: 160,
      lineTextPathMaxHalfLengthRatio: 0.46,
      lineTextCollisionRectMode: "compactTextBox",
      cjkGlyphCompactMode: "auto",
      cjkGlyphMinAdvanceScale: 0.62,
      cjkGlyphFallbackMode: "simpleLineLabel",
      lineTextSimpleFallbackEnabled: true,
      lineTextSimpleFallbackRotate: true,
      lineTextRepositionMode: 'chainageSearch',
      lineTextRepositionAttemptsPerDirection: 3,
      lineTextRepositionStepMode: 'labelSpan',
      lineTextRepositionFailure: 'hide',
      lineTextRepositionStrictSvg: true,
      lineTextAvoidLineGeometry: false,
      lineTextAvoidPolygonGeometry: false,
      lineTextAvoidPointSymbols: true,
      lineTextViewportRectMode: "anchorNormalized",
      lineTextViewportCandidateMode: "stableFirstViewportFallback",
      lineTextViewportCandidateBufferPx: 72,
      lineTextViewportCandidateMaxTargets: 1,
      lineTextViewportCandidateMinIntervalPx: 48,
      svgVerticalCjkMinLengthPx: 24,
      svgVerticalCjkLetterSpacingPx: 1,
      textPathCollisionPaddingPx: 10,
      textPathLetterSpacingPx: 0.5,
      textPathCurvedLetterSpacingPx: 1.8,
      textPathCurvedSpacingMinBendDeg: 30,
    },
    label: {
      enabled: true,
      source: "Name",
      styleKey: "gm-outline",
      abbreviation: { enabled: true, maxChars: 12, suffix: "…" },
    },
    collision: {
      role: "important",
      priority: 4000,
      group: "networkLabel",
      collideWith: ["requiredLabel", "importantLabel"],
      allowHide: true,
      hidePolicy: "abbreviateThenHide",
    },
  },

  buildingStructure: {
    displayTier: "structure",
    visibility: {
      geometryMinZoom: 3,
      labelMinZoom: 3,
    },
    symbol: {
      enabled: false,
    },
    label: {
      enabled: true,
      source: "Name",
      styleKey: "structure-label-12",
      abbreviation: { enabled: true, maxChars: 12, suffix: "…" },
    },
    anchor: {
      strategy: "fixedInterior",
      geoCandidateMode: "fixedInterior",
      preferPreviousGeoCandidate: true,
      candidates: ["C", "N", "S", "E", "W"],
      requireInsideGeometry: true,
    },
    collision: {
      role: "important",
      priority: 3600,
      group: "structureLabel",
      allowHide: true,
      paddingPx: 4,
      hidePolicy: "abbreviateThenHide",
    },
    density: {
      enabled: true,
      gridSizePx: 104,
      maxLabelsPerGrid: 3,
      reduceOrder: ["abbreviateOptionalLabels", "hideOptionalLabels"],
      preserveSelected: true,
      preserveRequired: true,
    },
  },

  stationStructure: {
    displayTier: "structure",
    visibility: {
      geometryMinZoom: 3,
      labelMinZoom: 3,
    },
    symbol: {
      enabled: false,
    },
    label: {
      enabled: true,
      source: "Name",
      styleKey: "structure-label-12",
      abbreviation: { enabled: true, maxChars: 12, suffix: "…" },
    },
    anchor: {
      strategy: "fixedInterior",
      geoCandidateMode: "fixedInterior",
      preferPreviousGeoCandidate: true,
      candidates: ["C", "N", "S", "E", "W"],
      requireInsideGeometry: true,
    },
    collision: {
      role: "optional",
      priority: 2600,
      group: "structureLabel",
      allowHide: true,
      paddingPx: 4,
      hidePolicy: "abbreviateThenHide",
    },
    density: {
      enabled: true,
      gridSizePx: 104,
      maxLabelsPerGrid: 3,
      reduceOrder: ["abbreviateOptionalLabels", "hideOptionalLabels"],
      preserveSelected: true,
      preserveRequired: true,
    },
  },

  transportNode: {
    displayTier: "transportNode",
    visibility: {
      symbolMinZoom: 4,
      labelMinZoom: 5,
    },
    label: {
      enabled: true,
      source: "Name",
      styleKey: "bubble-dark-14",
      abbreviation: { enabled: true, maxChars: 8, suffix: "…" },
    },
    collision: {
      role: "important",
      priority: 6200,
      group: "transportLabel",
      collideWith: ["requiredLabel", "importantLabel"],
      allowHide: true,
      paddingPx: 6,
      hidePolicy: "abbreviateThenHide",
    },
  },

  poiPoint: {
    displayTier: "poi",
    visibility: {
      symbolMinZoom: 5,
      labelMinZoom: 6,
    },
    label: {
      enabled: true,
      source: "Name",
      styleKey: "bubble-dark-14",
      abbreviation: { enabled: true, maxChars: 8, suffix: "…" },
    },
    anchor: {
      strategy: "pointVariable",
      candidates: ["N", "NE", "NW", "E", "W", "SE", "SW", "S"],
    },
    collision: {
      role: "optional",
      priority: 2500,
      group: "poiLabel",
      collideWith: [
        "symbol",
        "requiredLabel",
        "importantLabel",
        "optionalLabel",
      ],
      allowHide: true,
      paddingPx: 6,
      hidePolicy: "abbreviateThenHide",
    },
    density: {
      enabled: true,
      gridSizePx: 72,
      maxLabelsPerGrid: 3,
      reduceOrder: ["abbreviateOptionalLabels", "hideOptionalLabels"],
      preserveSelected: true,
      preserveRequired: true,
    },
  },

  indoorUnit: {
    displayTier: "indoor",
    visibility: {
      modes: ["floor", "editing"],
      geometryMinZoom: 0,
      labelMinZoom: 0,
    },
    collision: {
      role: "required",
      priority: 8000,
      allowHide: false,
      hidePolicy: "forceShow",
    },
    density: {
      enabled: false,
    },
  },

  geometryOnlyFallback: {
    displayTier: "structure",
    symbol: {
      enabled: false,
    },
    label: {
      enabled: false,
    },
    collision: {
      role: "ignore",
      priority: 0,
      allowHide: true,
      hidePolicy: "geometryOnly",
    },
    fallback: {
      whenRuleMissing: "geometryOnly",
      whenCollisionFailed: "showGeometryOnly",
    },
  },
};

export function isDisplayProfileKey(value: string): value is DisplayProfileKey {
  return (DISPLAY_PROFILE_KEYS as readonly string[]).includes(value);
}

export function getDisplayProfile(
  profile: string | undefined,
): FeatureDisplayRuleDraft | undefined {
  if (!profile || !isDisplayProfileKey(profile)) return undefined;
  return DISPLAY_PROFILES[profile];
}
