# RB_SLU display system

本目录承载新的单要素显示驱动结构。它的目标是把要素显示从零散的 `withDot / declutter / anchorMode / allowHide` 判断，收束为一套统一的 DisplayRule / DisplayPlan。

## 维护入口

后续要素显示规则优先收敛到：

```ts
display: {
  displayTier,
  visibility,
  geometry,
  symbol,
  label,
  anchor,
  collision,
  stability,
  density,
  interaction,
  fallback,
}
```

当前 `RB_SLU_1` 只建立结构，不改变 `RuleDrivenLayer.tsx` 和 `labelLayout.ts` 的运行路径。

## 文件职责

- `displayTypes.ts`：核心类型。
- `displayDefaults.ts`：各显示层级的默认值。
- `displayProfiles.ts`：常用类别的推荐配置模板。
- `displayRuleNormalizer.ts`：把局部规则补齐为完整 DisplayPlan。
- `displayPriority.ts`：层级、碰撞角色、优先级排序工具。
- `displayState.ts`：最终显示状态定义，供后续 debug / 审计使用。

## 长期原则

- 只保留一套新的显示语义。
- 旧底层能力可以复用，但旧显示字段不应长期作为主维护入口。
- 建筑、POI、交通节点、地理结构、室内对象应通过 `displayTier` 和 `collision.role` 区分。


## RB_SLU_2 规则标注口径

`featureRenderRules.ts` 从 RB_SLU_2 开始为主要规则补充 `display` 字段。

本阶段的 `display` 字段只描述“显示语义”，不接管实际渲染入口：

- `symbol` 仍由既有 Leaflet 渲染路径读取；
- `labelLayout.ts` 仍使用旧的 declutter 输入；
- `RuleDrivenLayer.tsx` 尚未消费标准化后的 DisplayPlan；
- 因此 RB_SLU_2 不应改变当前地图观感。

维护时优先把新规则写进 `display`，避免再新增零散的旧式字段。后续 patch 会逐步让渲染入口读取标准化后的 DisplayPlan。

当前保留的 `legacyStructureDotLabel` / `legacyIndoorDotLabel` 是“当前观感描述 profile”，不是长期目标。它们用于保证后续接入 DisplayPlan 时可以先维持现状，再在后续 patch 中统一切换到建筑无点状 marker、室内单元高优先等目标状态。


## RB_SLU_3 规则解析接入层

本 patch 新增 `displayRuleResolver.ts`，并在 `RuleDrivenLayer.tsx` 的主渲染循环中调用：

```ts
const displayPlan = resolveFeatureDisplayPlan(r, rule, context, store);
if (!shouldRenderByDisplayPlan(displayPlan, context)) continue;
```

当前阶段的约束：

- `DisplayPlan` 已经进入渲染循环，但暂时只执行基础 `minZoom / maxZoom` gate。
- `modes` gate 默认不启用，避免楼层、编辑态对象的旧显示行为提前变化。
- `symbol / label / collision / anchor / density` 仍由现有旧执行路径负责。
- 本 patch 不改变 BUD / STB / FLR / ISG / POI 的实际观感。
- 后续 patch 才会逐步让 `symbol`、`labelLayout`、`collision role` 消费完整 `DisplayPlan`。

维护口径：

- 新增规则时继续优先填写 `display` 字段。
- 不要新增 `displayRuleAdapter.ts`；标准入口是 `displayRuleResolver.ts + displayRuleNormalizer.ts`。
- 若某个要素暂时出现显示差异，优先检查 `display.visibility.minZoom / maxZoom` 是否被显式设置。

## RB_SLU_4：Display collision bridge

`RB_SLU_4` 开始让 DisplayPlan 的 `collision` 语义进入现有 LabelLayout 请求：

- 新增 `rendering/label/labelCollision.ts`；
- `RuleDrivenLayer.tsx` 在生成 `LabelRequest` 后，把 `displayPlan.collision` 合并进 `request.declutter`；
- `labelLayout.ts` 仍然使用旧式 greedy 布局，但 `priority / allowHide / groupKey / minSpacingPx` 已开始来自 DisplayPlan；
- `collisionRole / collisionGroup / hidePolicy` 作为只读元数据随请求进入布局层，供后续完整碰撞矩阵使用。

本 patch 不改变几何绘制、点状 marker、label 锚点计算和 BUD/STB 的真实 symbol 策略。
它只是把“谁更重要、谁可隐藏”从零散旧字段逐步收束到 `display.collision`。


## RB_SLU_5：目标显示策略切换

`RB_SLU_5` 开始在新 Display 体系内调整真实观感，重点是把“建筑结构”和“点状 POI”分开：

- `BUD / STB` 切换为结构面显示：
  - 使用浅填充 + 细轮廓；
  - label 固定在中心候选位置；
  - 不再显示中心点 / dot marker；
  - `BUD` 使用 `soft` collision，避免压制地理结构和交通骨架；
  - `STB` 使用较高的 structure priority，但仍低于交通节点和大型地理结构。

- `STF / FLR` 保持楼层视角高优先：
  - 使用 `indoor` tier；
  - `collision.role = required`；
  - 保留楼层视角中的 dot + label 表达，避免和普通建筑策略混淆。

- `ISG` 大型地理面 label 转为重要结构 label：
  - `collision.role = important`；
  - `allowHide = false`；
  - `hidePolicy = forceShow`；
  - 普通建筑不再通过同级优先级压制大型地理结构 label。

- fallback 点要素不再主动显示 label：
  - 未注册点仍可显示点符号；
  - label 默认关闭，避免未知点类污染地图。

从本 patch 起，主规则不再引用 `legacyStructureDotLabel / legacyIndoorDotLabel` profile。后续若继续调整观感，应直接修改 `buildingStructure / stationStructure / indoorUnit / poiPoint / largeGeoSurface` 等正式 profile。

## RB_SLU_6：Label density gate 与隐藏原因审计

`RB_SLU_6` 开始让 DisplayPlan 的 `density` 语义进入现有 LabelLayout 执行层：

- 新增 `rendering/label/labelDensity.ts`；
- `labelCollision.ts` 将 `displayPlan.density` 合并进 `LabelRequest.declutter`；
- `labelLayout.ts` 新增屏幕网格密度限制：同一 density group 在同一网格内只保留有限数量 label；
- `required` label 默认穿透 density 限制，避免楼层对象、选中对象等强显示对象被密度降级误伤；
- `PlacedLabel.hiddenReason` 开始记录 `viewport / collision / groupLimit / densityLimit / notPlaced`，供后续 debug 面板或日志审计使用。

当前 density gate 只作用于 declutter label 的布局结果，不改变几何绘制、点状 marker 绘制、锚点选择，也不引入完整碰撞矩阵。

维护口径：

- 建筑类 `structureLabel` 可通过 `density.gridSizePx / maxLabelsPerGrid` 控制密集区域 label 数量；
- POI 类 `poiLabel` 可单独配置 density，不会和建筑 label 共用密度计数；
- `density.reduceOrder` 当前作为规则语义和审计字段保留，执行层现阶段只实现“超出网格上限则隐藏该 label”；
- 若某类 label 不应被密度限制，设置 `density.enabled = false` 或将其 `collision.role` 设为 `required` 并保留 `density.preserveRequired = true`。


## RB_SLU_7：Label placement cache

`RB_SLU_7` 开始让 DisplayPlan 的 `stability` 语义进入 label 布局层：

- 新增 `rendering/label/labelPlacementCache.ts`；
- `labelCollision.ts` 将 `displayPlan.stability` 合并进 `LabelRequest.declutter`；
- `labelLayout.ts` 会缓存上一次成功的 `anchorCandidateIndex + candidateName`；
- 下一次布局时优先尝试上一次成功位置，但仍然重新执行 viewport、collision、group、density 检查；
- 如果旧位置不可用，会继续回退到原有候选序列，不会强行覆盖避让结果。

当前 cache 只复用“候选位选择”，不缓存最终像素坐标，也不绕过避让。  
因此它主要用于降低轻微 pan / 小幅刷新时的 label 跳动，不会改变几何绘制、marker 绘制或完整 collision matrix。

维护口径：

- 普通建筑、POI、线状 label 默认可使用 `stability.keepPreviousCandidate = true`；
- 大型地理面后续还需要配合 `labelAnchor.ts` 做更完整的 viewport hysteresis；
- 若某类 label 不应复用候选位，可设置 `display.stability.enabled = false` 或关闭 `keepPreviousCandidate / keepPreviousAnchor`。

## RB_SLU_8：label anchor 策略抽离

本 patch 将 label 锚点计算从 `RuleDrivenLayer.tsx` 抽离到：

```text
src/components/Rules/rendering/label/labelAnchor.ts
```

维护规则：

```text
1. 普通建筑 / 站房 / 普通面对象使用 fixedInterior。
2. 大型地理面对象优先使用 largeFeatureStableCandidates；visibleInteriorLargeOnly 仅作为兼容旧规则的回退策略。
3. 线状对象使用 polylineMulti / polylineCenter。
4. 点对象继续使用自身坐标作为 anchor。
5. RuleDrivenLayer.tsx 只调用 resolveLabelAnchorForFeature，不再直接维护 polygon / polyline anchor 算法。
```

当前边界：

```text
1. 本 patch 不启用完整 viewport hysteresis。
2. 本 patch 不改变 collision matrix。
3. 本 patch 不新增 UI debug 面板。
4. 本 patch 主要让 display.anchor.strategy 开始成为锚点选择的来源。
```

后续新增要素时，应优先在 `display.anchor.strategy` 中声明锚点策略，而不是在 `RuleDrivenLayer.tsx` 中增加新的 class 判断。

## RB_SLU_9：collision role matrix

`RB_SLU_9` 将 `required / important / optional / soft / ignore` 从只读元数据推进为 label 布局层的实际避让矩阵。

默认矩阵：

```text
incoming required  -> 只避让 already-placed required
incoming important -> 避让 required / important
incoming optional  -> 避让 required / important / optional
incoming soft      -> 避让 required / important / optional / soft
incoming ignore    -> 不参与避让
```

执行原则：

```text
1. labelLayout.ts 先按 collision role 排序，再按 priority 排序。
2. required / forceShow label 放不下时会进入 force placement，并写入 collision index。
3. soft label 不再阻挡 important / required label。
4. optional label 不再被 soft label 阻挡。
5. symbol avoid rect 默认只压制 optional / soft，不压制 required / important。
6. DisplayPlan.collision.collideWith / blocks / allowOverlap 会通过 labelCollision.ts 进入 labelLayout.ts。
```

维护口径：

```text
1. “必须显示”的对象使用 collision.role = required 或 hidePolicy = forceShow。
2. 大型地理结构、交通骨架使用 important。
3. 普通 POI 使用 optional。
4. 普通建筑使用 soft。
5. 除非确实需要特殊避让，不要随意配置 collision.blocks；默认矩阵已经覆盖大部分情况。
```

本 patch 仍保留现有 greedy layout 引擎。  
它不是完全重写布局算法，而是在既有引擎中加入稳定的角色矩阵和强制显示占位规则。


## RB_SLU_10：交互态覆盖与诊断输出

`RB_SLU_10` 让 DisplayPlan 的 interaction 语义进入渲染循环，并增加无 UI 依赖的诊断输出能力。

执行原则：

```text
1. selected feature 会转为 required label，priority 默认提升到 10000。
2. searchResult feature 会转为 required label，priority 默认提升到 9500。
3. interaction override 只改变 DisplayPlan 的 collision / density 语义，不直接重写几何绘制。
4. labelLayout.ts 会在 PlacedLabel 中保留 collisionRole / collisionGroup / priority / hiddenReason。
5. displayDiagnostics.ts 只在显式开启 debug 时输出事件和 console.debug，不影响正常渲染。
```

开启诊断：

```js
window.__RIA_RULE_DISPLAY_DEBUG__ = true
// 或：
localStorage.setItem('ria_rule_display_debug', '1')
```

监听诊断事件：

```js
window.addEventListener('ria:rule-display-diagnostics', (ev) => {
  console.log(ev.detail.records)
})
```

维护口径：

```text
1. 选中态、搜索结果态应通过 display.interaction.* 调整 priority / forceShowLabel。
2. 不要在 RuleDrivenLayer.tsx 中新增零散的 class 特判来强行显示 label。
3. 若要解释 label 为什么隐藏，优先查看 hiddenReason、collisionRole、finalPriority 和 anchorStrategy。
4. 当前 patch 不新增正式 UI debug panel；后续可基于 ria:rule-display-diagnostics 事件单独开发面板。
```


## RB_SLU_11：最终逐类观感调参与维护入口收束

`RB_SLU_11` 是本轮显示层升级的收束 patch。它不再扩大渲染入口，而是把已经接入的 DisplayPlan、collision matrix、density、anchor、placement cache 和 diagnostics 收束为一套长期维护口径。

维护入口：

```text
1. 新增/修改要素显示语义：优先改 featureRenderRules.ts 中的 display 字段。
2. 新增通用类别默认值：改 displayProfiles.ts / displayDefaults.ts。
3. 新增 label 视觉样式：改 labelStyles.ts。
4. 不再把 withDot / declutter.priority / anchorMode 等旧字段作为新增规则的主维护入口。
```

本 patch 的观感收束：

```text
BUD
- 保持 structure tier。
- 无 dot / marker。
- 使用 structure-label-12 轻量文字，不再使用黑色 bubble 铺满建筑区。
- soft label，priority 低于地理结构、交通骨架和 POI。

STB
- 保持 structure tier。
- 无 dot / marker。
- 使用 structure-label-13，优先级略高于普通建筑。
- RB_SLU_A2：STB label 不再要求 Stations.length >= 2；楼层视图外只要 Name 非空即可进入 label request。

ISG
- 保持 geoStructure tier。
- important / forceShow。
- 大型地理面 label 不应被普通建筑或普通 POI 压制。

STA / PLF
- 保持 transportNode tier。
- symbol + label。
- priority 高于普通 POI 和普通建筑。

TRP / TPP / WRP / ISP
- 保持 poi tier。
- optional label。
- 高密度场景下可缩略或隐藏，不压制地理结构和交通骨架。

fallback
- 未注册 polygon / polyline 默认 geometryOnly。
- 未注册 point 默认不主动显示 label。
```

旧字段保留口径：

```text
symbol.pathStyle、symbol.point、symbol.label、labelClick 仍然是当前 Leaflet 执行层需要读取的底层能力。
但显示策略的“为什么显示、何时显示、谁优先、如何避让、是否密度降级”应由 display 字段表达。
```

新增要素时的最小检查表：

```text
1. displayTier 是否正确？
2. geometry / symbol 是否符合“结构不是 POI”的原则？
3. label 是否有合适 styleKey 和 abbreviation？
4. anchor.strategy 是否稳定？
5. collision.role / priority 是否符合层级？
6. density 是否需要启用？
7. selected / searchResult 是否能通过 interaction 强制显示？
8. fallback 是否不会污染 label 层？
```


## RB_SLU_12：Pan/Zoom Label Stability 与轻量淡入淡出

`RB_SLU_12` 不是新增显示类别，而是稳定既有显示结果。它针对拖动地图后 viewport 改变导致的面/线 anchor 重算、collision/density 成片重排、label 硬切闪烁问题。

执行原则：

```text
1. Leaflet 自身会在拖动过程中移动已有 marker；RuleDrivenLayer 不应在小幅 pan 后立即重跑完整 label layout。
2. moveend 后若累计 pan 距离仍低于阈值，复用上一轮 label 布局。
3. 超过阈值、zoom 变化、数据/楼层/选中态/编辑态变化时，仍执行完整 refresh。
4. 新增 label 使用短 fade-in。
5. 被隐藏或移除的 label 使用短 fade-out，避免高密度区域硬闪。
6. 该 patch 不改变 BUD/STB/POI/ISG 的类别策略，也不处理线 label strict-on-line。
```

维护口径：

```text
1. 轻微拖动导致的 label 抖动，优先检查 labelViewportStability.ts 的 panSkipPx / maxSkipMs。
2. 候选位选择稳定性仍由 labelPlacementCache.ts 负责。
3. anchor 计算仍由 labelAnchor.ts 负责。
4. 不要通过增加 class 特判来阻止 label 重排；应通过 viewport stability、placement cache、anchor hysteresis 分层处理。
5. 若某类 label 必须在选中/搜索时立即刷新，应通过 display.interaction 抬升为 required，而不是关闭 pan stability。
```

## RB_SLU_13：line label strict-on-line

`RB_SLU_13` 开始把线状要素 label 从“普通屏幕候选位避让”收束为“严格贴线”模式。

维护规则：

```text
1. RLE / ROD / ISL 等 networkLine 默认使用 anchor.lineLabelMode = strictOnLine。
2. strictOnLine label 只能使用 C 候选位，不能使用 N/E/S/W/NE/NW/SE/SW 等点式偏移。
3. label 仍可沿 polylineMulti 的多个线段候选 anchor 尝试，但每个候选 anchor 都必须位于线要素上。
4. 若 C 候选位无法通过 viewport / collision / density，则隐藏，不再漂移到线外。
5. 沿线文字旋转角以最终选中的 anchorCandidate 对应角度为准，避免多 anchor 后文字角度与线段不一致。
```

本 patch 不实现 SVG textPath，也不让文字沿曲线逐字弯曲。当前目标是先修正“线 label 脱离线体”的问题：线名必须贴在线上；放不下则隐藏。若后续需要道路名沿曲线自然弯折，可在 strictOnLine 稳定后单独设计 `textPath` 阶段。

## RB_SLU_14：稳定地理锚点候选点

RB_SLU_14 将 polygon label 的锚点来源从“每次按当前 viewport 自由重算”推进为“稳定地理候选点 + 滞后选择”。

### 维护口径

- 普通建筑、站房、楼层等普通面应继续使用 `fixedInterior`。
- 大型地理面应优先使用 `largeFeatureStableCandidates`。
- 默认大型地理面使用 `viewportAwareCandidateSet`，会生成少量稳定候选点，而不是每次拖动都重新自由取点。
- 特殊大型面、岛屿、湖泊、复杂行政区可以配置 `geoCandidateMode: 'gridByWorldUnits'`。
- `geoGridSize` 的最小建议值为 100；小于该值时会按最小值处理。
- `geoCandidateMax` 默认建议为 100；超出后使用确定性排序裁切，不使用真随机，以免破坏稳定性。

### 示例：默认大型地理面

```ts
anchor: {
  strategy: 'largeFeatureStableCandidates',
  geoCandidateMode: 'viewportAwareCandidateSet',
  geoCandidateCount: 9,
  geoCandidateMax: 100,
  preferPreviousGeoCandidate: true,
  switchThreshold: 0.4,
}
```

### 示例：复杂岛屿 / 湖泊 / 大型区域

```ts
anchor: {
  strategy: 'largeFeatureStableCandidates',
  geoCandidateMode: 'gridByWorldUnits',
  geoGridSize: 100,
  geoCandidateMax: 100,
  preferPreviousGeoCandidate: true,
  switchThreshold: 0.4,
}
```

### 行为说明

稳定候选点缓存以 `featureUid + geometryHash + candidateMode + gridSize` 为 key。几何不变时，候选点集合不变；拖动地图时只从已缓存候选点里选择。上一次候选点仍在扩展视口内时会优先沿用，只有旧点明显不可用或新点明显更优时才切换。

RB_SLU_14 不改变 collision / density / strict-on-line / pseudo tile 逻辑。它只负责减少 polygon label 的 anchor 源头跳动。


## RB_SLU_15：Pseudo Tile / Padded Label Layout Window

RB_SLU_15 adds a lightweight pseudo-tile label layout window. It does **not**
turn OpenRIAMap into a real vector-tile renderer. Instead, the rule layer now
calculates labels for the current viewport plus a padded buffer, then reuses that
layout while the visible viewport remains inside the buffered window.

### Why this exists

Without a padded layout window, every `moveend` can slightly change the active
record set, visible polygon anchors, collision order, and density grids. In dense
or mixed large-feature areas this makes labels jump even when their geographic
features have barely moved on screen.

The new policy is:

```text
current viewport + padded window -> layout once
small/medium pan inside window   -> reuse existing layout
near/outside window edge         -> refresh layout
zoom/data/state changes          -> refresh layout
```

### Maintenance notes

- The layout-window behavior is global to `RuleDrivenLayer.tsx`; individual
  feature rules should not normally configure it.
- `labelLayoutWindow.ts` owns the padded bounds and reuse checks.
- `labelViewportStability.ts` now prefers layout-window reuse and only falls
  back to the older small-pan skip if no window exists yet.
- `labelLayout.ts` accepts a negative `viewportPaddingPx` from the rule layer so
  labels can be placed slightly outside the current visible viewport and enter
  naturally during pan.
- Increasing the padding ratio improves pan stability but increases the number
  of preloaded geometries and label requests.
- Decreasing the padding ratio reduces work but can make labels refresh more
  frequently near viewport edges.

Default window policy:

```ts
paddingRatio: 0.45
minPaddingPx: 240
maxReuseMs: 2500
refreshEdgeRatio: 0.18
```

RB_SLU_15 is intentionally separate from RB_SLU_14. RB_SLU_14 stabilizes the
geographic anchor source for polygon labels; RB_SLU_15 stabilizes when a full
label layout pass is allowed to run.

## RB_SLU_16：Stable Line Anchor Candidates

RB_SLU_16 adds the line-label counterpart of RB_SLU_14's stable polygon anchor candidates.
Line labels now support `anchor.strategy = 'polylineStableCandidates'`, which generates deterministic
world-space candidates along the polyline chainage instead of only sampling around the currently visible line segment.

Recommended maintenance pattern:

```ts
anchor: {
  strategy: 'polylineStableCandidates',
  lineLabelMode: 'strictOnLine',
  lineCandidateSpacing: 160,
  lineCandidateMinSpacing: 40,
  lineCandidateMax: 32,
  lineShortThresholdMultiplier: 2,
  lineLongMode: 'evenSplit',
  lineCandidateEndpointPaddingRatio: 0.12,
  lineCandidateEndpointPaddingMin: 40,
  preferPreviousLineCandidate: true,
  lineCandidateHysteresisPx: 160,
  minLineLabelLengthPx: 80,
  maxAngleDeltaDeg: 45,
}
```

Generation policy:

- Short lines (`totalLength < spacing * lineShortThresholdMultiplier`) receive a single midpoint candidate.
- Medium lines use `lineCandidateSpacing` along the path, with endpoint padding.
- Long lines whose theoretical candidate count exceeds `lineCandidateMax` use deterministic even-split candidates.
- Candidates stay on the source line and carry a tangent angle for final label rotation.
- Candidates near sharp bends are filtered by `maxAngleDeltaDeg`; if filtering would remove all candidates, the raw set is retained as fallback.
- Candidate overflow is deterministic. Do not randomly drop line candidates, because that would reintroduce label jumping.

Class-level tuning should happen in `featureRenderRules.ts` by overriding the `anchor` section of the network display profile:

- `RLE`: slightly larger spacing for railway labels.
- `ROD`: denser spacing for road labels.
- `ISL`: larger max candidate count for long waterways or boundary-like lines.

This patch does not implement SVG `textPath` or curved-per-character road text. It only stabilizes where a line label may be placed.

## RB_SLU_18：TextPath integration fix

RB_SLU_18 收束 RB_SLU_17 的 SVG `textPath` 接入边界：

- `textPath` 只用于 ROD / ISL 等纯线文字，不转换 RLE 药丸、线路牌、站点、POI 或面要素 label。
- ROD / ISL 的 `textPathFallback` 改为 `svgStraightLabel`，曲线不适合时仍使用 SVG 直线文字，避免同一套道路系统在 SVG 与旧 DivIcon label 间混用。
- RLE 默认保持 `lineTextMode: rotatedLabel`，保护铁路药丸 / 线路牌结构。
- SVG 文字样式需要继承旧道路 label 口径，默认应保持白字黑描边，并保留点击交互。
- `textPath` 的碰撞 footprint 在布局阶段按 path bbox + `textPathCollisionPaddingPx` 近似计算；不做逐字符精确碰撞。
- 曲线文字可通过 `textPathLetterSpacingPx`、`textPathCurvedLetterSpacingPx`、`textPathCurvedSpacingMinBendDeg` 控制字距，减少弯曲路径上的字符拥挤。
- 缩放动画期间不应立即重建 label；`zoomend` 后短延迟 settle 再刷新，降低 label 抢先跳到目标位置的观感。

维护建议：

```ts
anchor: {
  lineTextMode: 'auto',
  textPathFallback: 'svgStraightLabel',
  textPathCollisionPaddingPx: 8,
  textPathLetterSpacingPx: 0.5,
  textPathCurvedLetterSpacingPx: 1.5,
  textPathCurvedSpacingMinBendDeg: 35,
}
```

不要给 RLE pill / badge 类 label 启用 `textPath`，除非后续明确拆分出“纯文字型 RLE label”。

## RB_SLU_19：TextPath Position / Orientation / Zoom Lifecycle Fix

- `textPath` 仍然只用于纯线文字；RLE 药丸、线路牌、站点、POI、面 label 不进入该渲染路径。
- `labelTextPath.ts` 的 plan 与 layout metrics 使用同一套计算结果，SVG marker 的真实中心来自 path bbox center，而不是原始 line anchor。
- `labelTextPathLayer.ts` 必须把 textPath marker 放入 `ria-label` pane，并保留与普通 label 相同的点击交互入口。
- 中文/CJK 线 label 默认使用 `lineTextOrientationPolicy: 'autoCjkUpright'`：当候选路径主要呈竖向时，回退到旧的 upright vertical label，而不是把中文整体旋转 90 度。
- 英文/数字线 label 可继续使用沿线 `textPath` 或 rotated label。
- `zoomstart` 到 `zoomend + settle delay` 期间应冻结 label relayout；所有 pending refresh 合并到 zoom settle 后执行一次，避免 label 先跳到底图动画目标位置。

## RB_SLU_20：Weighted Candidate Ranking + SVG Vertical CJK + TextPath Diagnostics

RB_SLU_20 makes stable candidates non-flat. Candidate generation remains deterministic, but polygon and line candidates now carry score metadata so the renderer can prefer visually central candidates without reintroducing jitter.

### Candidate scoring policy

- Padded layout windows define whether the current candidate is still usable.
- The real viewport defines whether a more central candidate is preferable.
- Existing candidates receive a reuse bonus, so small pans do not force immediate switching.
- A new candidate must exceed the current candidate by `candidateSwitchThreshold` / `lineCandidateSwitchThreshold` before it replaces the previous candidate.

For large polygon labels, use:

```ts
anchor: {
  candidateWeightMode: 'distanceToCenter',
  candidateSwitchThreshold: 18,
  candidateReuseBonus: 12,
  candidateViewportPreference: true,
  candidateEdgePenalty: 8,
}
```

For stable line labels, use:

```ts
anchor: {
  lineCandidateOrdering: 'centerOut',
  lineCenterWeightMode: 'distanceToCenter',
  lineCandidateSwitchThreshold: 16,
  lineCandidateReuseBonus: 12,
}
```

`lineCandidateMax` remains the total candidate cap. Center-out generation does not double the number of candidates; it only changes the order from start-to-end to midpoint, midpoint + spacing, midpoint - spacing, and so on.

### SVG vertical CJK labels

CJK line labels that are mostly vertical should not use SVG `textPath`, because that rotates the glyphs along the path. RB_SLU_20 allows the same SVG marker family to render upright CJK vertical text:

```svg
<text writing-mode="vertical-rl" text-orientation="upright">鸭岛通</text>
```

Default policy:

```ts
anchor: {
  lineTextOrientationPolicy: 'autoCjkUpright',
  lineCjkVerticalRenderMode: 'svgVertical',
  svgVerticalCjkLetterSpacingPx: 1,
}
```

RLE remains protected: rail pill / badge structures should keep `rotatedLabel` unless a future rule explicitly separates pure rail text from pill/badge labels.

### Diagnostics

Diagnostics now include candidate and text-path decisions when the debug event is enabled:

```js
localStorage.setItem('ria_rule_display_debug', '1')
window.addEventListener('ria:rule-display-diagnostics', (ev) => console.table(ev.detail.records))
```

Useful fields:

- `candidateStaticWeight`
- `candidateScore`
- `candidateScoreParts`
- `textPathStatus`
- `lineCandidateOrdering`
- `lineTextOrientationPolicy`

This patch does not implement Canvas per-character road text, true vector-tile labels, cross-tile textPath de-duplication, repeated road-name placement, or any STB visibility strategy changes.

## RB_SLU_21：候选点稳定性回收与高级线文字预算

`RB_SLU_21` 只做稳定性回收、纠偏和性能预算，不实现新的 CJK glyph-on-path 渲染。

### 候选点身份

- 线 label 候选点以 `candidateId` 作为稳定身份。
- `sourceIndex` 表示候选点生成时的原始序号，不应因 viewport prune 或排序变化而改写。
- `displayOrder` 可随可见性、权重和视口裁剪变化，用于显示排序，不得作为候选点身份。
- `anchorCandidateIndex` 仅保留为旧诊断字段，后续渲染反查应优先使用 `anchorCandidateId`。
- 短线 midpoint 候选点固定使用 `candidateId = "midpoint"`，避免短线被 viewport prune 误重排到端点候选。

### 真实视口与 padded layout window

- `realViewportWorldRectXZ` 代表当前屏幕真实视口，用于候选点评分和中心偏好。
- `layoutViewportWorldRectXZ` 代表 padded layout window，只用于判断旧候选点是否仍可复用。
- 大型面 label 不应使用 padded window 代替真实 viewport 参与中心偏好评分。
- 当真实 viewport 内的中心候选点明显优于旧候选点时，允许切换回中心候选点。

### CJK 线文字

- 当前错误的整块 `svgVerticalCjk` 默认暂停。
- 近竖向 CJK 不再把整串文字渲染成独立竖排 block。
- 本轮继续回退到 rotated label / legacy fallback。
- “字符沿线排列、单字按局部 tangent 角度判断方向”的真实目标保留到后续 CJK glyph-on-path patch。

### 高级线文字预算

- 高级 textPath 只对预算内的高优先级线 label 启用。
- 超出预算的线 label 回退 `rotatedLabel`，不阻塞首次地图渲染。
- `RLE` 默认不进入高级 SVG textPath。
- `ROD / ISL` 可以尝试高级 textPath，但受 `advancedLineTextEnabled`、`advancedLineTextBudgetGroup` 和运行时预算共同限制。
- layout 阶段只使用轻量近似 textPath metrics；完整 SVG textPath plan 只在最终渲染阶段构建。

### 诊断字段

开启 display diagnostics 后，可检查：

- `anchorCandidateId`
- `anchorCandidateSourceIndex`
- `anchorCandidateDisplayOrder`
- `textPathBudgetStatus`
- `textPathFallbackReason`
- `candidateScoreParts.realViewportPreference`
- `candidateScoreParts.layoutWindowUsable`
- `candidateScoreParts.candidateSwitchBlockedByThreshold`

这些字段用于判断 label 未切换、短线偏移、textPath 回退或预算降级的具体原因。

## RB_SLU_22: CJK glyph-on-path line labels

- CJK line labels now use glyph-on-path when `cjkGlyphPathMode: "auto"` is enabled and the advanced line-text budget allows it.
- This is not the old whole-block vertical SVG mode: every CJK character is placed along the selected line path with its own local position and rotation.
- `cjkGlyphRotationPolicy: "uprightWhenSteep"` keeps characters upright on steep segments while still preserving along-line spacing and attachment.
- `candidateId` remains the stable identity used to align layout, path candidate lookup, diagnostics, and rendering.
- Layout only consumes approximate glyph metrics; SVG glyph DOM is built only for the final placed label.
- `svgVerticalCjk` remains disabled by default. Do not re-enable it as the default CJK line-label path.
- RLE remains conservative: it should not enter glyph-on-path unless an explicit future rule changes that behavior.

## RB_SLU_23 line label recovery rules

1. Line text path slices may be wider than candidate spacing, but this only expands the local SVG/glyph path window. It must not rewrite `candidateId`, `sourceIndex`, or the short-line midpoint rule.
2. CJK glyph-on-path uses compact mode when the selected local path is slightly shorter than the normal glyph advance span. Compact mode preserves per-character line placement instead of falling back to a whole-string rotated label.
3. CJK glyphPath failure defaults to `cjkGlyphFallbackMode: "hide"`. Do not reintroduce the old whole-string rotated fallback unless a rule explicitly opts into it.
4. SVG line-text markers are plan-centered. Their marker latlng comes from `plan.markerContainerPoint`, not from the regular label anchor latlng.
5. `RuleDrivenLayer` must not blindly call `setLatLng(anchorLatLng)` on glyph/textPath markers. Reuse requires a `zoomBucket + pathSignature + candidateId` key.
6. Layout may use approximate metrics, but render constructs the full SVG/glyph plan only for the final placed label. Diagnostics remain opt-in and must not be part of the default hot path.

## RB_SLU_24 Line Label Stability Recovery

RB_SLU_24 restores line-label correctness after the RB_SLU_23 performance pass.

1. Full glyphPath/textPath plans must not be cached across viewport refreshes. They contain `markerContainerPoint`, which is a viewport container coordinate and becomes stale after pan or zoom.
2. Advanced line text markers must not be reused across `moveend` / `zoomend` refreshes. They should be rebuilt from current viewport geometry.
3. `moveend` must trigger line-label relayout. Reusing a previous layout window can keep stale line-label visibility and prevent labels in the new viewport from appearing.
4. Advanced render failure does not mean the label should be hidden. The stable fallback order is `glyphPath -> textPath -> simpleLineLabel`.
5. Layout decides visibility and candidate. Render decides visual mode.
6. `candidateId` remains the stable identity. Render must not choose a new candidate.
7. Polygon label logic is outside RB_SLU_24 and should not be modified by line-label stability fixes.

## RB_SLU_25 Line Label Chainage Reposition

RB_SLU_25 adds a line-label-only reposition mode for strict SVG line labels. This mode is deliberately scoped to `lineTextRepositionMode === "chainageSearch"` and does **not** change polygon / area label scoring, `labelGeoAnchorCache.ts`, or the RB_SLU_21 real/layout viewport behavior for surface labels.

Rules:

1. Chainage reposition keeps the label on the source line; it does not move labels sideways.
2. Search order is `0, +1, -1, +2, -2, +3, -3` label spans.
3. Enabled line labels require SVG eligibility by default. If all chainage attempts fail, the label is hidden rather than falling back to legacy vertical or simple line labels.
4. Line geometry is not avoided by default (`lineTextAvoidLineGeometry: false`) because line labels are intended to sit on their source line.
5. Point symbols and other labels are avoided by default.
6. Chainage reposition is real-viewport-first: candidates in the current viewport take priority over candidates that are only inside the padded layout window.
7. Full glyph/textPath plans remain uncached across viewport refreshes, and advanced line SVG markers are not reused across `moveend` / `zoomend` refreshes.
8. RLE pill/badge labels do not use chainage reposition; RLE line-name labels may opt into it via a label-level `displayAnchor` override.

## RB_SLU_26 Line Label Viewport Gate Correction

- `chainageSearch` keeps stable line candidates as the primary candidate system.
- `viewport-temp` candidates are generated only when no stable candidate falls inside the real viewport + buffer while the source line itself intersects the real viewport.
- `viewport-temp` candidates simulate the midpoint of the currently visible line segment and are temporary: they must not be written into placement cache or treated as previous candidates.
- `chainageSearch` viewport and collision gates use anchor-normalized compact text rectangles by default (`lineTextViewportRectMode: "anchorNormalized"`).
- Raw glyph/textPath metrics rectangles are kept for diagnostics only when anchor-normalized mode is active.
- Polygon / area label logic is not changed. `labelGeoAnchorCache.ts` remains outside RB_SLU_26.
- Full glyph/textPath plans are still not cached across viewport refreshes.
- Advanced line SVG markers are still not reused across moveend / zoomend refreshes.

## RB_SLU_A1 Polygon Label Audit Tool

RB_SLU_A1 adds a read-only polygon label audit console tool. It is diagnostic only and must not change polygon label scoring, candidate selection, collision, density, placement cache, rendering, or style behavior.

Console commands:

- `RIA.debug.polygonLabels()`
- `RIA.debug.polygonLabelsTxt()`
- `RIA.debug.polygonLabels({ allCandidates: true })`
- `RIA.debug.polygonLabels({ classCodes: ["BUD", "ISG"], onlyHidden: true })`

The audit reports polygon label visibility, blocked step / reason, geometry bounds, selected geo anchor, geo-anchor candidate diagnostics, previous-candidate reuse, switch-threshold status, layout candidate selection, density status, and collision status.

Use this tool before changing polygon label placement logic. In particular, use it to distinguish BUD / ISG issues caused by geo-anchor selection, screen-candidate offset, density limits, collision blockers, viewport gates, or stale previous-candidate reuse.


## RB_SLU_A2 Structure Label Center Revalidation

- `structureLabel` labels with `center` placement always revalidate the `C` layout candidate before cached non-center candidates.
- Cached `W` / `E` / `N` / `S` candidates remain available only after `C` fails viewport / density / collision checks.
- This preserves layout stability while allowing structure labels to return to the polygon center when center placement becomes valid again.
- STB labels no longer require `Stations.length >= 2`; outside floor view, non-empty `Name` is sufficient to enter the label request pipeline.
- STB / BUD density, collision role, priority, hide policy, and style are unchanged.
- ISG / `surfaceLabel`, line labels, geo-anchor scoring, density logic, and collision logic are not changed.
