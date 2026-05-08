# OpenRIAMap Web 要素显示定义使用手册

适用基线：OpenRIAMap-Web_RB_SLU_F。本文面向 `src/components/Rules/rendering/featureRenderRules.ts` 与 `src/components/Rules/rendering/display/` 显示配置体系，目标是让维护者可以只阅读本文，就能独立组装新的要素显示定义。

## 0. 总体原则

### 0.1 推荐写法

新增要素规则时，优先在 `featureRenderRules.ts` 中新增一个 `RenderRule`。标准结构如下：

```ts
{
  name: "规则名称，便于维护阅读",
  match: { Class: "XXX", Type: "Polygon" },
  zoom: [0, 99],
  display: DISPLAY_XXX,
  hideIfSameIdExistsInClasses: ["YYY"],
  visible: (r, ctx, store) => true,
  symbol: {
    pane: "ria-overlay",
    pathStyle: { color: "#fff", weight: 1 },
    point: { kind: "circle", radius: 5 },
    label: {
      enabled: true,
      textFrom: "Name",
      placement: "center",
      minLevel: 5,
      styleKey: "gm-outline",
      declutter: {
        priority: 2600,
        candidates: ["C", "N", "S", "E", "W"],
        allowHide: true,
      },
    },
    labelClick: { enabled: true, mode: "labelOnly", openCard: true },
  },
}
```

### 0.2 显示计划的合并顺序

`display` 字段不是直接完整执行对象，而是声明式草稿 `FeatureDisplayRuleDraft`。运行时会被标准化为完整 `FeatureDisplayPlan`。合并顺序是：

```text
BASE_DISPLAY_DEFAULTS
→ DISPLAY_TIER_DEFAULTS[displayTier]
→ DISPLAY_PROFILES[profile]
→ 当前规则 display
→ selected / searchResult / editing / deletionMarked 等交互态覆盖
```

因此：

```text
1. displayTier 决定大类默认值；
2. profile 决定常用显示模板；
3. 当前规则 display 只写需要覆盖的字段；
4. symbol / label / labelClick 是 Leaflet 底层绘制接口，display 是规则语义接口。
```

### 0.3 zoom 与 zoomLevel

规则中的 `zoom: [min, max]` 使用的是项目内部 `zoomLevel`，并且包含两端。`display.visibility.*Zoom` 也使用 `zoomLevel`。Leaflet 原始缩放在上下文中是 `ctx.leafletZoom`，通常不直接用于规则。

## 1. featureRenderRules.ts 的 RenderRule 写法

`RenderRule` 是主规则数组 `FEATURE_RENDER_RULES` 的元素。字段如下。

### 1.1 name

```ts
name: string
```

用途：只读维护说明，不参与匹配。建议写清 Class、Kind、显示目标和特殊条件。

### 1.2 match

```ts
match: {
  Class?: string;
  Type?: "Points" | "Polyline" | "Polygon";
}
```

用途：主匹配条件。常见写法：

```ts
match: { Class: "ROD", Type: "Polyline" }
match: { Class: "ISG", Type: "Polygon" }
match: { Type: "Points" } // fallback 点规则
```

注意：`RenderRule.match` 当前只定义 `Class` 与 `Type`。如果要按 `Kind / SKind / SKind2 / World / ID` 细分，应使用 `visible` 函数或写入 `display.match` 作为声明信息，但真正复杂筛选通常仍在 `visible` 中完成。

### 1.3 zoom

```ts
zoom?: [number, number]
```

用途：控制整条规则是否进入渲染。示例：

```ts
zoom: [0, 99]
zoom: [5, 99]
```

如果某个 label 还要单独控制显示级别，使用 `symbol.label.minLevel` 或 `display.visibility.labelMinZoom`。

### 1.4 display

```ts
display?: FeatureDisplayRuleDraft
```

用途：声明显示语义，包括 displayTier、visibility、geometry、symbol、label、anchor、collision、stability、density、interaction、fallback。详见第 3 节。

推荐：新增或维护规则时一定写 `display`，因为它统一承担避让、密度、稳定性、候选点、交互态等语义。

### 1.5 hideIfSameIdExistsInClasses

```ts
hideIfSameIdExistsInClasses?: string[]
```

用途：如果同一 `idValue` 在指定 Class 中存在，则隐藏当前要素。适合用于“新旧类互斥”“点/面同 ID 只显示一种”。示例：

```ts
hideIfSameIdExistsInClasses: ["STA"]
```

### 1.6 visible

```ts
visible?: (r: FeatureRecord, ctx: RenderContext, store: FeatureStore) => boolean
```

用途：复杂可见性判断。返回 false 时该要素不渲染。可访问：

```text
r.meta.Class / r.meta.Type / r.meta.idValue
r.featureInfo 原始属性
r.coords3 / r.p3 几何
ctx.worldId / ctx.zoomLevel / ctx.inFloorView / ctx.activeBuildingUid / ctx.activeFloorSelector
store.byClass / store.byClassId / store.all
```

常见用途：

```text
1. 根据 Kind / SKind / SKind2 显示；
2. 根据楼层视角隐藏或显示；
3. 根据其它要素是否存在进行互斥；
4. 根据 RLE direction、Connect、Stations 等业务字段分流。
```

### 1.7 symbol

```ts
symbol: SymbolPlan
```

`symbol` 是实际 Leaflet 绘制接口。包括 pane、pathStyle、point、label、labelClick。

## 2. symbol 字段完整定义

### 2.1 pane

```ts
pane?: string
```

用途：主几何所在 Leaflet pane。常用：

```text
ria-overlay       线/面默认层
ria-overlay-top   高亮线/面层
ria-point         点默认层
ria-point-top     更顶层点
ria-label         label 层
```

### 2.2 pathStyle

```ts
pathStyle?: L.PathOptions | ((r, ctx, store) => L.PathOptions)
```

用途：线/面样式。常用字段：

```ts
{
  pane?: string,
  color?: string,
  weight?: number,
  opacity?: number,
  fillColor?: string,
  fillOpacity?: number,
  dashArray?: string,
  lineCap?: "butt" | "round" | "square",
  lineJoin?: "miter" | "round" | "bevel",
  interactive?: boolean
}
```

示例：

```ts
pathStyle: { color: "#66ccff", weight: 2, opacity: 0.85 }
pathStyle: (r) => ({ color: r.featureInfo.color ?? "#999", weight: 3 })
```

### 2.3 point

```ts
point?: PointSymbolPlan | ((r, ctx, store) => PointSymbolPlan)
```

点符号有两种：circle 与 icon。

#### circle

```ts
{
  kind: "circle";
  radius?: number;
  style?: L.CircleMarkerOptions;
  pane?: string;
}
```

示例：

```ts
point: { kind: "circle", radius: 5, pane: "ria-point" }
```

#### icon

```ts
{
  kind: "icon";
  iconUrl?: string;
  iconUrlFrom?: string;
  iconSize?: [number, number];
  iconAnchor?: [number, number];
  pane?: string;
  zIndexOffset?: number;
}
```

`iconUrlFrom` 表示从 `featureInfo` 指定字段取 URL。

### 2.4 label

```ts
label?: LabelPlan | ((r, ctx, store) => LabelPlan | null)
```

`label` 是旧执行层 label 配置，仍是目前具体生成 label request 的入口。

#### enabled

```ts
enabled: boolean
```

false 时不显示 label。

#### textFrom

```ts
textFrom?: string | ((r, ctx, store) => string)
```

字符串时，从 `featureInfo[textFrom]` 取值。函数时可自定义。

示例：

```ts
textFrom: "Name"
textFrom: (r) => String(r.featureInfo.Name ?? r.meta.idValue ?? "")
```

#### placement

```ts
placement: "center" | "near"
```

`center`：label 以 anchor 为中心。面要素、线要素常用。

`near`：label 在点附近显示。点要素常用。

#### minLevel

```ts
minLevel?: number
```

label 最小 zoomLevel。未达到则不生成 label。

#### offsetY

```ts
offsetY?: number
```

点 label 垂直上移参数，主要用于非 declutter 的普通 label。

#### withDot

```ts
withDot?: boolean
```

label 内是否带小圆点。会影响 label HTML 与估算宽度。

#### styleKey

```ts
styleKey?: LabelStyleKey
```

当前支持：

```text
bubble-dark
bubble-dark-${number}
gm-outline
gm-outline-bold
structure-label
structure-label-${number}
gm-bw-${number}
gm-wtb-${number}
rle-line-${number}
rle-pill-${number}
```

也可传运行时对象：

```ts
{ key: "rle-line-13", color: "#ff0000", rotateDeg: 45, writingMode: "horizontal" }
```

#### declutter

```ts
declutter?: LabelDeclutterConfig
```

开启后 label 进入统一避让布局。见第 2.5 节。

### 2.5 declutter

```ts
declutter: LabelDeclutterConfig
```

字段：

```text
strategy?: "greedy"                         当前实现为 greedy
candidates?: ("C"|"N"|"NE"|"E"|"SE"|"S"|"SW"|"W"|"NW" | {name,dx,dy,score})[]
priority?: number                            越大越先放置
collisionRole?: "required"|"important"|"optional"|"soft"|"ignore"
collisionGroup?: string                      如 surfaceLabel / networkLabel / structureLabel
hidePolicy?: "hide"|"abbreviateThenHide"|"forceShow"|"showWithoutBlocking"|"geometryOnly"
collisionAllowOverlap?: boolean
collisionCollideWith?: DisplayCollisionTarget[]
collisionBlocks?: DisplayCollisionBlockTarget[]
densityEnabled?: boolean
densityGridSizePx?: number
densityMaxLabelsPerGrid?: number
densityPreserveRequired?: boolean
densityGroupKey?: string
densityReduceOrder?: DisplayDensityReduceStep[]
placementCacheEnabled?: boolean
placementCacheKey?: "featureID"|"featureID+zoomBucket"|"featureID+mode"|"custom"|string
placementCacheCustomKey?: string
placementZoomBucketSize?: number
placementKeepPreviousCandidate?: boolean
placementKeepPreviousAnchor?: boolean
lineLabelMode?: "free"|"strictOnLine"
lineTextMode?: "rotatedLabel"|"textPath"|"auto"
textPathFallback?: "rotatedLabel"|"hide"|"svgStraightLabel"
minSpacingPx?: number
groupKey?: string
maxPerScreen?: number
allowHide?: boolean
allowAbbrev?: boolean
abbrev?: (text:string)=>string
viewportPaddingPx?: number
```

维护建议：

```text
1. 面结构 label：candidates 通常 C,N,S,E,W；structureLabel 当前会每轮优先重验证 C。
2. 点 label：通常 N,NE,NW,E,W,SE,SW,S。
3. 线 label：strictOnLine 时实际只使用线派生候选，避免 label 飘离线。
4. required / forceShow 不宜大量使用，否则会压制其它 label。
5. density 适合 soft / optional label，避免高密度区域过载。
```

### 2.6 labelClick

```ts
labelClick?: LabelClickPlan | ((r, ctx, store) => LabelClickPlan | null)
```

字段：

```text
enabled: boolean
mode: "normal" | "labelOnly"
labelStyleKey?: LabelStyleKey
highlightStyleKey?: "dash" | "dash-strong" | "solid" | "nav-outline"
pointPinStyleKey?: "pin-red" | "pin-blue" | "pin-black"
openCard?: boolean
geom?: { point?: boolean; path?: boolean }
```

说明：

```text
mode="labelOnly"：主几何会被隐藏或弱化，主要点击 label。
mode="normal"：保留主几何，可配置 geom.point / geom.path 让几何本体也响应点击。
openCard=true：点击打开信息卡。
highlightStyleKey：点击后高亮几何样式。
pointPinStyleKey：点要素点击后的图钉样式。
```

## 3. display 显示组件包完整定义

`display` 使用 `FeatureDisplayRuleDraft`。所有字段都是可选覆盖项，标准化后会成为完整 `FeatureDisplayPlan`。

### 3.1 FeatureDisplayRuleDraft 顶层字段

```ts
{
  name?: string;
  match?: FeatureDisplayMatch;
  profile?: string;
  displayTier?: DisplayTier;
  visibility?: Partial<DisplayVisibilityConfig>;
  geometry?: Partial<DisplayGeometryConfig>;
  symbol?: Partial<DisplaySymbolConfig>;
  label?: Partial<DisplayLabelConfig>;
  anchor?: Partial<DisplayAnchorConfig>;
  collision?: Partial<DisplayCollisionConfig>;
  stability?: Partial<DisplayStabilityConfig>;
  density?: Partial<DisplayDensityConfig>;
  interaction?: Partial<DisplayInteractionConfig>;
  fallback?: Partial<DisplayFallbackConfig>;
}
```

### 3.2 match

```ts
{
  Class?: string;
  Type?: "Points" | "Polyline" | "Polygon";
  Kind?: string;
  SKind?: string;
  SKind2?: string;
  IDPrefix?: string;
  world?: string | number | Array<string | number>;
}
```

用途：声明显示计划所属对象。注意当前主规则匹配主要仍由 `RenderRule.match + visible` 执行，`display.match` 更偏声明和诊断。

### 3.3 displayTier

```text
baseSurface      大型底面 / 地理面
geoStructure     地理结构面 / ISG 类面
network          道路 / 铁路 / 线路
structure        建筑 / 站体 / 小结构面
transportNode    STA / PLF 等交通节点
poi              普通 POI 点
indoor           楼层 / 室内单元
editing          编辑态
debug            调试态
```

### 3.4 profile

当前可用 profile：

```text
largeGeoSurface        ISG / 大面 label
networkLine            ROD / RLE / ISL 线 label
buildingStructure      BUD 结构面
stationStructure       STB 站体结构面
transportNode          STA / PLF
poiPoint               普通点
indoorUnit             楼层面
geometryOnlyFallback   只显示几何，不显示 label
```

### 3.5 visibility

```ts
{
  minZoom?: number;
  maxZoom?: number;
  labelMinZoom?: number;
  labelMaxZoom?: number;
  geometryMinZoom?: number;
  geometryMaxZoom?: number;
  symbolMinZoom?: number;
  symbolMaxZoom?: number;
  modes?: ("normal"|"navigation"|"floor"|"editing"|"preview"|"debug")[];
  requireSelected?: boolean;
  hideWhenFiltered?: boolean;
  hideWhenInactiveWorld?: boolean;
  minScreenAreaPx?: number;
  minScreenLengthPx?: number;
}
```

说明：

```text
minZoom/maxZoom：整体显示范围。
labelMinZoom/labelMaxZoom：仅 label 范围。
geometryMinZoom/geometryMaxZoom：仅几何范围。
symbolMinZoom/symbolMaxZoom：仅点符号范围。
modes：按 normal/floor/editing 等模式显示。
minScreenAreaPx：面要素屏幕面积下限。
minScreenLengthPx：线要素屏幕长度下限。
```

### 3.6 geometry

```ts
{
  render: "none"|"polygonFill"|"polygonOutline"|"polygonFillOutline"|"polyline"|"point"|"custom";
  zIndex?: number;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  fill?: string;
  fillOpacity?: number;
  dashArray?: string;
  lineCap?: "butt"|"round"|"square";
  lineJoin?: "miter"|"round"|"bevel";
  interactive?: boolean;
  hitTolerancePx?: number;
}
```

推荐：

```text
Polygon：polygonFillOutline
Polyline：polyline
Points：通常 geometry.render=none，使用 symbol 绘制
纯逻辑要素：none
特殊自定义：custom
```

### 3.7 symbol

```ts
{
  enabled: boolean;
  type?: "dot"|"circle"|"pin"|"icon"|"image"|"none";
  iconKey?: string;
  sizePx?: number;
  radiusPx?: number;
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  zIndex?: number;
  collisionBox?: { widthPx: number; heightPx: number; paddingPx?: number };
  clickable?: boolean;
}
```

说明：

```text
enabled=false：不显示点符号。
type=circle/dot/pin：点符号常用。
collisionBox：点符号参与 label 避让时的占位盒。
clickable：是否允许点击。
```

### 3.8 label

```ts
{
  enabled: boolean;
  source?: "Name"|"ID"|"Kind"|"SKind"|"SKind2"|"Class"|"custom" | Array<...>;
  customFormatterKey?: string;
  maxChars?: number;
  minChars?: number;
  emptyBehavior?: "hide"|"showID"|"showKind"|"placeholder";
  abbreviation?: { enabled: boolean; maxChars: number; suffix?: string };
  multiline?: boolean;
  maxLines?: number;
  styleKey?: string;
  className?: string;
  opacity?: number;
}
```

说明：

```text
source：声明式 label 字段来源；旧执行层仍常用 symbol.label.textFrom。
customFormatterKey：预留自定义格式化器。
abbreviation：缩略策略。
styleKey：对应 labelStyles.ts 的样式 key。
emptyBehavior：无文本时的兜底策略。
```

### 3.9 anchor

`anchor` 是显示系统中最重要的候选点配置。顶层字段如下：

```ts
{
  strategy: DisplayAnchorStrategy;
  candidates?: DisplayAnchorCandidate[];
  offsetPx?: { x: number; y: number };
  candidateOffsetsPx?: { name: string; x: number; y: number }[];
  allowOutsideGeometry?: boolean;
  requireInsideGeometry?: boolean;
  anchorSamples?: number;
  ...线候选字段;
  ...面候选字段;
}
```

#### strategy 可选值

```text
fixedInterior                 面内固定点，BUD/STB 常用
stableGeoCandidates           稳定地理候选
largeFeatureStableCandidates  大面稳定候选，ISG 常用
visibleInteriorLargeOnly      大型可见内部点
viewportHysteresis            视窗迟滞
pointVariable                 点 label 多方向候选
polylineCenter                线中心
polylineMulti                 线多候选
polylineStableCandidates      稳定线候选，ROD/RLE/ISL 常用
manual                        手动
none                          不生成 anchor
```

#### candidates 可选值

```text
C, N, S, E, W, NE, NW, SE, SW,
lineCenter, lineStart, lineEnd, visibleCenter
```

### 3.10 anchor：面要素字段

```ts
geoCandidateMode?: "none"|"fixedInterior"|"autoInteriorGrid"|"largeFeatureGrid"|"viewportAwareCandidateSet"|"gridByWorldUnits";
geoCandidateCount?: number;
geoGridSize?: number;
geoGridMinSize?: number;
geoCandidateMax?: number;
geoCandidateScanMax?: number;
geoCandidateOverflow?: "rankedPrune"|"seededPrune";
preferPreviousGeoCandidate?: boolean;
switchThreshold?: number;
allowViewportCandidateFallback?: boolean;
largeFeature?: { minScreenAreaPx: number; preferViewportCenter: boolean };
```

推荐组合：

```text
BUD/STB：strategy=fixedInterior, geoCandidateMode=fixedInterior, candidates=C/N/S/E/W, requireInsideGeometry=true。
ISG：strategy=largeFeatureStableCandidates, geoCandidateMode=viewportAwareCandidateSet, geoCandidateCount=9, geoCandidateMax=100。
室内面：fixedInterior + candidates=C。
```

### 3.11 anchor：线要素字段

```ts
lineLabelMode?: "free"|"strictOnLine";
lineCandidateSpacing?: number;
lineCandidateMinSpacing?: number;
lineCandidateMax?: number;
lineShortThresholdMultiplier?: number;
lineLongMode?: "evenSplit";
lineCandidateEndpointPaddingRatio?: number;
lineCandidateEndpointPaddingMin?: number;
preferPreviousLineCandidate?: boolean;
lineCandidateHysteresisPx?: number;
minLineLabelLengthPx?: number;
maxAngleDeltaDeg?: number;
lineCandidateOrdering?: "startToEnd"|"centerOut";
lineCenterWeightMode?: "none"|"distanceToCenter";
lineCandidateSwitchThreshold?: number;
lineCandidateReuseBonus?: number;
```

推荐：道路/连接线使用 `strictOnLine + polylineStableCandidates`，避免 label 离线。

### 3.12 anchor：高级线文字字段

```ts
lineTextMode?: "rotatedLabel"|"textPath"|"auto";
textPathMinLengthPx?: number;
textPathPaddingPx?: number;
textPathMaxAngleDeltaDeg?: number;
textPathMaxTotalBendDeg?: number;
textPathPreferReadableDirection?: boolean;
textPathFallback?: "rotatedLabel"|"hide"|"svgStraightLabel";
textPathCollisionPaddingPx?: number;
textPathLetterSpacingPx?: number;
textPathCurvedLetterSpacingPx?: number;
textPathCurvedSpacingMinBendDeg?: number;
lineTextOrientationPolicy?: "autoCjkUpright"|"alwaysTextPath"|"alwaysRotated";
textPathVerticalAngleThresholdDeg?: number;
textPathVerticalLengthRatio?: number;
lineCjkVerticalRenderMode?: "legacyVertical"|"svgVertical"|"auto";
advancedLineTextEnabled?: boolean;
advancedLineTextBudgetGroup?: "network"|"surface"|"none";
advancedLineTextMaxLabels?: number;
advancedLineTextMaxCandidatesPerPass?: number;
cjkGlyphRotationPolicy?: "uprightWhenSteep"|"followLine"|"alwaysUpright";
cjkGlyphUprightAngleThresholdDeg?: number;
cjkGlyphPathMode?: "off"|"auto"|"force";
cjkGlyphSpacingPx?: number;
cjkGlyphCollisionPaddingPx?: number;
cjkGlyphMinPathLengthPx?: number;
cjkGlyphMaxCount?: number;
cjkGlyphMaxAngleDeltaDeg?: number;
cjkGlyphMaxTotalBendDeg?: number;
cjkGlyphPreferReadableDirection?: boolean;
cjkGlyphAllowTextPathFallback?: boolean;
lineTextPathHalfLengthMultiplier?: number;
lineTextPathMinHalfLengthWorld?: number;
lineTextPathMaxHalfLengthWorld?: number;
lineTextPathMaxHalfLengthRatio?: number;
lineTextCollisionRectMode?: "pathBox"|"textBox"|"compactTextBox";
cjkGlyphCompactMode?: "off"|"auto";
cjkGlyphMinAdvanceScale?: number;
cjkGlyphFallbackMode?: "simpleLineLabel"|"textPathIfAllowed"|"hide"|"rotatedLabel";
lineTextSimpleFallbackEnabled?: boolean;
lineTextSimpleFallbackRotate?: boolean;
lineTextRepositionMode?: "off"|"chainageSearch";
lineTextRepositionAttemptsPerDirection?: number;
lineTextRepositionStepMode?: "labelSpan"|"fixedWorld"|"fixedPx";
lineTextRepositionFailure?: "hide"|"simpleLineLabel";
lineTextRepositionStrictSvg?: boolean;
lineTextAvoidLineGeometry?: boolean;
lineTextAvoidPolygonGeometry?: boolean;
lineTextAvoidPointSymbols?: boolean;
lineTextRepositionCollisionScope?: ("lineLabel"|"surfaceLabel"|"pointLabel"|"pointSymbol"|"requiredLabel"|"selectedLabel"|"searchResultLabel")[];
lineTextViewportRectMode?: "rawMetrics"|"anchorNormalized"|"auto";
lineTextViewportCandidateMode?: "off"|"stableFirstViewportFallback";
lineTextViewportCandidateBufferPx?: number;
lineTextViewportCandidateMaxTargets?: number;
lineTextViewportCandidateMinIntervalPx?: number;
```

维护建议：

```text
ROD/ISL：lineTextMode=auto, cjkGlyphPathMode=auto, lineTextRepositionMode=chainageSearch。
RLE 药丸/标记模式：advancedLineTextEnabled=false, cjkGlyphPathMode=off。
需要严格贴线：lineLabelMode=strictOnLine。
需要失败后不退化旧式 label：lineTextRepositionFailure=hide。
```

### 3.13 collision

```ts
{
  role: "required"|"important"|"optional"|"soft"|"ignore";
  priority: number;
  group?: "surfaceLabel"|"networkLabel"|"structureLabel"|"transportLabel"|"poiLabel"|"indoorLabel"|"debugLabel";
  collideWith?: ("symbol"|"requiredLabel"|"importantLabel"|"optionalLabel"|"softLabel"|"geometry")[];
  blocks?: ("optionalLabel"|"softLabel"|"poiLabel"|"structureLabel")[];
  allowOverlap?: boolean;
  allowHide?: boolean;
  paddingPx?: number;
  hidePolicy?: "hide"|"abbreviateThenHide"|"forceShow"|"showWithoutBlocking"|"geometryOnly";
}
```

语义：

```text
required：最高优先，通常不隐藏。
important：重要 label，可压制 optional/soft。
optional：普通可隐藏 label。
soft：低优先 label，密集时优先隐藏。
ignore：基本不参与避让。
priority：同 role 内越大越早放置。
group：density 和 audit 中的分组名。
allowHide=false + forceShow：即使碰撞也尽量显示。
```

### 3.14 stability

```ts
{
  enabled: boolean;
  cacheKey?: "featureID"|"featureID+zoomBucket"|"featureID+mode"|"custom";
  zoomBucketSize?: number;
  freezeDuringPan?: boolean;
  recomputeOnMoveEnd?: boolean;
  recomputeOnZoomEnd?: boolean;
  hysteresisPx?: number;
  keepPreviousCandidate?: boolean;
  keepPreviousAnchor?: boolean;
  invalidateWhen?: ("zoomBucketChanged"|"featureGeometryChanged"|"featureTextChanged"|"modeChanged"|"worldChanged"|"labelOutOfViewport"|"collisionFailedRepeatedly")[];
}
```

说明：用于减少 label 抖动。A2 后，`structureLabel + center placement` 会每轮优先重验证 C，避免旧 W/E/N/S 候选长期压过中心。

### 3.15 density

```ts
{
  enabled: boolean;
  gridSizePx?: number;
  maxLabelsPerGrid?: number;
  maxSymbolsPerGrid?: number;
  reduceOrder?: ("hideSoftLabels"|"abbreviateOptionalLabels"|"hideOptionalLabels"|"hideSymbols"|"geometryOnly")[];
  importanceField?: string;
  preserveSelected?: boolean;
  preserveRequired?: boolean;
}
```

说明：以屏幕网格限制 label 数量。适合 BUD/STB/POI 等密集 label。不要用 density 处理 required 大面 label。

### 3.16 interaction

```ts
{
  hover?: { raiseZIndex?: boolean; showLabel?: boolean; highlightGeometry?: boolean };
  selected?: { forceShowGeometry?: boolean; forceShowSymbol?: boolean; forceShowLabel?: boolean; collisionRoleOverride?: "required"; priorityOverride?: number; zIndexOverride?: number };
  searchResult?: { forceShowLabel?: boolean; pulseSymbol?: boolean; priorityOverride?: number };
  editing?: { forceShowVertices?: boolean; forceShowLabel?: boolean; renderDraftStyle?: boolean; priorityOverride?: number };
  deletionMarked?: { renderDeleteStyle?: boolean; forceShowLabel?: boolean };
}
```

说明：交互态会在 display resolver 中提高 label 优先级、强制显示或修改 collision role。

### 3.17 fallback

```ts
{
  whenNoLabelText?: "hideLabel"|"showID"|"showClassKind"|"placeholder";
  whenCollisionFailed?: "hideLabel"|"abbreviate"|"forceShow"|"showGeometryOnly";
  whenRuleMissing?: "geometryOnly"|"hidden"|"debugDefault"|"legacyDefault";
  whenGeometryInvalid?: "skip"|"showErrorMarker"|"debugOnly";
}
```

说明：兜底策略。当前具体执行仍以规则层和 labelLayout 为主，fallback 主要是显示语义和后续扩展入口。

## 4. 常见模板

### 4.1 BUD/STB 结构面 label

```ts
const DISPLAY_MY_STRUCTURE: FeatureDisplayRuleDraft = {
  profile: "buildingStructure",
  displayTier: "structure",
  visibility: { geometryMinZoom: 5, labelMinZoom: 6 },
  geometry: { render: "polygonFillOutline" },
  symbol: { enabled: false },
  label: { enabled: true, source: "Name", styleKey: "structure-label-12" },
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
    allowHide: true,
    hidePolicy: "abbreviateThenHide",
    paddingPx: 3,
  },
  density: { enabled: true, gridSizePx: 104, maxLabelsPerGrid: 2 },
};
```

### 4.2 ISG 大面 label

```ts
const DISPLAY_MY_SURFACE: FeatureDisplayRuleDraft = {
  profile: "largeGeoSurface",
  displayTier: "geoStructure",
  visibility: { geometryMinZoom: 0, labelMinZoom: 0 },
  geometry: { render: "polygonFillOutline" },
  label: { enabled: true, source: "Name", styleKey: "gm-outline" },
  anchor: {
    strategy: "largeFeatureStableCandidates",
    geoCandidateMode: "viewportAwareCandidateSet",
    geoCandidateCount: 9,
    geoCandidateMax: 100,
    preferPreviousGeoCandidate: true,
    allowViewportCandidateFallback: true,
    largeFeature: { minScreenAreaPx: 10000, preferViewportCenter: true },
  },
  collision: { role: "important", priority: 5000, group: "surfaceLabel", allowHide: false, hidePolicy: "forceShow" },
};
```

### 4.3 ROD/ISL 道路线 label

```ts
const DISPLAY_MY_LINE: FeatureDisplayRuleDraft = {
  profile: "networkLine",
  displayTier: "network",
  visibility: { geometryMinZoom: 0, labelMinZoom: 4 },
  geometry: { render: "polyline" },
  label: { enabled: true, source: "Name", styleKey: "gm-bw-12" },
  anchor: {
    strategy: "polylineStableCandidates",
    lineLabelMode: "strictOnLine",
    lineCandidateSpacing: 120,
    lineCandidateMax: 40,
    lineTextMode: "auto",
    advancedLineTextEnabled: true,
    cjkGlyphPathMode: "auto",
    lineTextRepositionMode: "chainageSearch",
    lineTextRepositionFailure: "hide",
    lineTextViewportRectMode: "anchorNormalized",
    lineTextViewportCandidateMode: "stableFirstViewportFallback",
  },
  collision: { role: "important", priority: 3600, group: "networkLabel", allowHide: true },
};
```

### 4.4 点 POI label

```ts
const DISPLAY_MY_POINT: FeatureDisplayRuleDraft = {
  profile: "poiPoint",
  displayTier: "poi",
  geometry: { render: "none" },
  symbol: { enabled: true, type: "circle", radiusPx: 4 },
  label: { enabled: true, source: "Name", styleKey: "bubble-dark-14" },
  anchor: { strategy: "pointVariable", candidates: ["N", "NE", "NW", "E", "W", "SE", "SW", "S"] },
  collision: { role: "optional", priority: 2500, group: "poiLabel", allowHide: true },
  density: { enabled: true, gridSizePx: 72, maxLabelsPerGrid: 3 },
};
```

## 5. 新增规则时的检查清单

```text
1. match 是否足够精确？Class / Type 是否正确？
2. zoom 与 visibility 的 zoom 是否冲突？
3. displayTier 与 profile 是否匹配要素类型？
4. geometry.render 是否符合几何类型？
5. label.enabled 与 symbol.label.enabled 是否都符合预期？
6. label 文本来源是否存在？textFrom / source 是否能取到 Name？
7. anchor.strategy 是否适合几何类型？
8. 面 label 是否 requireInsideGeometry？线 label 是否 strictOnLine？
9. collision.role / priority / group 是否会过度压制其它 label？
10. density 是否只用于可隐藏 label？
11. stability 是否可能导致旧候选粘滞？structureLabel 已有 C-first 保护。
12. 需要点击时是否配置 labelClick？
13. 调试时使用 RIA.debug.lineLabels / lineLabelsViewport / polygonLabels。
```

## 6. 推荐维护流程

```text
1. 先复制最接近的 DISPLAY_XXX 模板。
2. 修改 match / zoom / visible。
3. 修改 display.profile / displayTier。
4. 修改 symbol.pathStyle 或 point。
5. 修改 label.textFrom 与 styleKey。
6. 配置 anchor。
7. 配置 collision 与 density。
8. 编译检查。
9. 在浏览器中用 audit 命令检查显示状态。
10. 如果出现显示少、偏移、隐藏，先看 audit blockedStep，不要直接盲改候选逻辑。
```
