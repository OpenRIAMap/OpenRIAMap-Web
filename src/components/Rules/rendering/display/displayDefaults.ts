import type {
  DisplayAnchorCandidate,
  DisplayTier,
  FeatureDisplayPlan,
  FeatureDisplayRuleDraft,
} from "./displayTypes";

const DEFAULT_POINT_CANDIDATES: DisplayAnchorCandidate[] = [
  "E",
  "W",
  "N",
  "S",
  "NE",
  "NW",
  "SE",
  "SW",
];

export const BASE_DISPLAY_DEFAULTS: FeatureDisplayPlan = {
  displayTier: "poi",

  visibility: {
    minZoom: 0,
    maxZoom: 99,
  },

  geometry: {
    render: "none",
    interactive: true,
  },

  symbol: {
    enabled: false,
    type: "none",
    clickable: true,
  },

  label: {
    enabled: false,
    source: "Name",
    emptyBehavior: "hide",
    abbreviation: {
      enabled: true,
      maxChars: 10,
      suffix: "…",
    },
  },

  anchor: {
    strategy: "pointVariable",
    candidates: DEFAULT_POINT_CANDIDATES,
  },

  collision: {
    role: "optional",
    priority: 1000,
    allowHide: true,
    paddingPx: 4,
    hidePolicy: "abbreviateThenHide",
  },

  stability: {
    enabled: true,
    cacheKey: "featureID+zoomBucket",
    zoomBucketSize: 1,
    freezeDuringPan: true,
    recomputeOnMoveEnd: true,
    recomputeOnZoomEnd: true,
    hysteresisPx: 36,
    keepPreviousAnchor: true,
    keepPreviousCandidate: true,
  },

  density: {
    enabled: false,
    preserveSelected: true,
    preserveRequired: true,
  },

  interaction: {
    selected: {
      forceShowGeometry: true,
      forceShowSymbol: true,
      forceShowLabel: true,
      collisionRoleOverride: "required",
      priorityOverride: 10000,
      zIndexOverride: 10000,
    },
    searchResult: {
      forceShowLabel: true,
      pulseSymbol: true,
      priorityOverride: 9500,
    },
    editing: {
      forceShowVertices: true,
      forceShowLabel: true,
      renderDraftStyle: true,
      priorityOverride: 9000,
    },
    deletionMarked: {
      renderDeleteStyle: true,
      forceShowLabel: true,
    },
  },

  fallback: {
    whenNoLabelText: "hideLabel",
    whenCollisionFailed: "hideLabel",
    whenRuleMissing: "geometryOnly",
    whenGeometryInvalid: "skip",
  },
};

export const DISPLAY_TIER_DEFAULTS: Record<
  DisplayTier,
  FeatureDisplayRuleDraft
> = {
  baseSurface: {
    displayTier: "baseSurface",
    geometry: {
      render: "polygonFillOutline",
      fillOpacity: 0.22,
      strokeOpacity: 0.35,
      interactive: false,
    },
    symbol: {
      enabled: false,
    },
    label: {
      enabled: true,
      source: "Name",
    },
    anchor: {
      strategy: "largeFeatureStableCandidates",
      geoCandidateMode: "viewportAwareCandidateSet",
      geoCandidateCount: 9,
      geoCandidateMax: 100,
      preferPreviousGeoCandidate: true,
      switchThreshold: 0.35,
      candidateWeightMode: "distanceToCenter",
      candidateSwitchThreshold: 18,
      candidateReuseBonus: 12,
      candidateViewportPreference: true,
      candidateEdgePenalty: 8,
      largeFeature: {
        minScreenAreaPx: 12000,
        preferViewportCenter: true,
      },
    },
    collision: {
      role: "important",
      priority: 4500,
      group: "surfaceLabel",
      collideWith: ["requiredLabel", "importantLabel"],
      allowHide: false,
      hidePolicy: "forceShow",
      paddingPx: 8,
    },
    stability: {
      hysteresisPx: 120,
    },
  },

  geoStructure: {
    displayTier: "geoStructure",
    geometry: {
      render: "polygonFillOutline",
      fillOpacity: 0.2,
      strokeOpacity: 0.4,
    },
    symbol: {
      enabled: false,
    },
    label: {
      enabled: true,
      source: "Name",
    },
    anchor: {
      strategy: "largeFeatureStableCandidates",
      geoCandidateMode: "viewportAwareCandidateSet",
      geoCandidateCount: 9,
      geoCandidateMax: 100,
      preferPreviousGeoCandidate: true,
      switchThreshold: 0.35,
      candidateWeightMode: "distanceToCenter",
      candidateSwitchThreshold: 18,
      candidateReuseBonus: 12,
      candidateViewportPreference: true,
      candidateEdgePenalty: 8,
      largeFeature: {
        minScreenAreaPx: 10000,
        preferViewportCenter: true,
      },
    },
    collision: {
      role: "important",
      priority: 5000,
      group: "surfaceLabel",
      collideWith: ["requiredLabel", "importantLabel"],
      allowHide: false,
      hidePolicy: "forceShow",
      paddingPx: 8,
    },
    stability: {
      hysteresisPx: 120,
    },
  },

  network: {
    displayTier: "network",
    geometry: {
      render: "polyline",
      strokeOpacity: 0.75,
      strokeWidth: 2,
    },
    symbol: {
      enabled: false,
    },
    label: {
      enabled: true,
      source: "Name",
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
    collision: {
      role: "important",
      priority: 4000,
      group: "networkLabel",
      collideWith: ["requiredLabel", "importantLabel"],
      allowHide: true,
      hidePolicy: "abbreviateThenHide",
    },
  },

  structure: {
    displayTier: "structure",
    geometry: {
      render: "polygonFillOutline",
      fillOpacity: 0.18,
      strokeOpacity: 0.45,
      strokeWidth: 1,
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
      role: "soft",
      priority: 1100,
      group: "structureLabel",
      collideWith: [
        "symbol",
        "requiredLabel",
        "importantLabel",
        "optionalLabel",
        "softLabel",
      ],
      allowHide: true,
      paddingPx: 3,
      hidePolicy: "abbreviateThenHide",
    },
    density: {
      enabled: true,
      gridSizePx: 104,
      maxLabelsPerGrid: 2,
      reduceOrder: ["hideSoftLabels", "geometryOnly"],
      preserveSelected: true,
      preserveRequired: true,
    },
  },

  transportNode: {
    displayTier: "transportNode",
    geometry: {
      render: "none",
    },
    symbol: {
      enabled: true,
      type: "circle",
      radiusPx: 5,
      clickable: true,
      collisionBox: {
        widthPx: 18,
        heightPx: 18,
        paddingPx: 4,
      },
    },
    label: {
      enabled: true,
      source: "Name",
      styleKey: "bubble-dark-14",
      abbreviation: { enabled: true, maxChars: 8, suffix: "…" },
    },
    anchor: {
      strategy: "pointVariable",
      candidates: DEFAULT_POINT_CANDIDATES,
    },
    collision: {
      role: "important",
      priority: 6200,
      group: "transportLabel",
      collideWith: ["requiredLabel", "importantLabel"],
      allowHide: true,
      hidePolicy: "abbreviateThenHide",
    },
  },

  poi: {
    displayTier: "poi",
    geometry: {
      render: "none",
    },
    symbol: {
      enabled: true,
      type: "pin",
      sizePx: 18,
      clickable: true,
      collisionBox: {
        widthPx: 22,
        heightPx: 22,
        paddingPx: 4,
      },
    },
    label: {
      enabled: true,
      source: "Name",
      styleKey: "bubble-dark-14",
      abbreviation: { enabled: true, maxChars: 8, suffix: "…" },
    },
    anchor: {
      strategy: "pointVariable",
      candidates: DEFAULT_POINT_CANDIDATES,
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

  indoor: {
    displayTier: "indoor",
    visibility: {
      modes: ["floor", "editing"],
      geometryMinZoom: 0,
      labelMinZoom: 0,
    },
    geometry: {
      render: "polygonFillOutline",
      fillOpacity: 0.22,
      strokeOpacity: 0.75,
      strokeWidth: 1,
    },
    symbol: {
      enabled: false,
    },
    label: {
      enabled: true,
      source: "Name",
      styleKey: "bubble-dark-13",
      abbreviation: { enabled: true, maxChars: 10, suffix: "…" },
    },
    anchor: {
      strategy: "fixedInterior",
      geoCandidateMode: "fixedInterior",
      preferPreviousGeoCandidate: true,
      candidates: ["C"],
      requireInsideGeometry: true,
    },
    collision: {
      role: "required",
      priority: 8000,
      group: "indoorLabel",
      collideWith: ["requiredLabel"],
      allowHide: false,
      hidePolicy: "forceShow",
    },
    density: {
      enabled: false,
    },
  },

  editing: {
    displayTier: "editing",
    geometry: {
      render: "custom",
      interactive: true,
    },
    symbol: {
      enabled: true,
      type: "dot",
      clickable: true,
    },
    label: {
      enabled: true,
      source: "Name",
    },
    collision: {
      role: "required",
      priority: 9000,
      collideWith: ["requiredLabel"],
      allowHide: false,
      hidePolicy: "forceShow",
    },
    density: {
      enabled: false,
    },
  },

  debug: {
    displayTier: "debug",
    geometry: {
      render: "custom",
      interactive: false,
    },
    symbol: {
      enabled: true,
      type: "dot",
    },
    label: {
      enabled: true,
      source: "custom",
      customFormatterKey: "debugLabel",
    },
    collision: {
      role: "ignore",
      priority: 0,
      group: "debugLabel",
      allowOverlap: true,
      allowHide: false,
      hidePolicy: "showWithoutBlocking",
    },
    density: {
      enabled: false,
    },
    fallback: {
      whenRuleMissing: "debugDefault",
      whenGeometryInvalid: "debugOnly",
    },
  },
};

export function getDisplayTierDefaults(
  tier: DisplayTier,
): FeatureDisplayRuleDraft {
  return DISPLAY_TIER_DEFAULTS[tier];
}
