# OpenRIAMap Web 信息卡配置使用手册

适用基线：`OpenRIAMap-Web_RB_SLU_F`。本文只说明信息卡本体的配置与扩展方式，不包含字段对照文件 / workflow schema 字段表的逐项维护说明，也不展开“胶囊装色带”增强显示模式的内部定义。

目标：维护者只阅读本手册，即可独立完成信息卡字段排序、字段隐藏、字段补充、字段跳转绑定、外链展示、特殊解析模块与特殊信息卡的组装。

---

## 1. 信息卡渲染链路总览

默认信息卡入口是：

```ts
src/components/Rules/core/FeatureInteractionCard.tsx
```

字段组装入口是：

```ts
src/components/Rules/cardrules/fieldRules.ts
```

实际的 registry 布局控制文件是：

```ts
src/components/Rules/cardrules/cardRegistry.ts
```

核心流程：

```text
FeatureInteractionCard
→ buildInfoSectionsForFeature(feature, railIndex)
→ buildCardRowsFromRegistry(feature, railIndex)
→ buildCardRegistryContext(feature)
→ resolveCardRegistryLayout(...)
→ buildRowsByLayout(...)
→ mainRows / otherRows
→ FeatureInteractionCard 渲染主信息和“其他信息”折叠区
```

如果某个 Class 需要完全特殊的信息卡组件，则走：

```ts
src/components/Rules/cardrules/featureCardRegistry.ts
```

当前只有 `TRP` 注册了特殊卡：

```ts
export const FEATURE_CARD_REGISTRY = {
  TRP: TRPFeatureInteractionCard,
};
```

其他 Class 默认使用 `FeatureInteractionCard`。

---

## 2. 信息卡文件职责表

| 文件 | 职责 | 通常是否需要修改 |
|---|---|---|
| `cardRegistry.ts` | 信息卡字段顺序、字段插入、字段跳转、raw 字段、enhancement 插入 | 最常改 |
| `cardRegistryRows.ts` | 将 layout item 转为 `CardRow`；实现 transform | 一般不改，新增 transform 时改 |
| `cardRegistryContext.ts` | 从 workflow registry 的 infocard scene 生成基础 rows | 一般不改 |
| `cardInteractions.ts` | 外链、要素跳转、跳转目标约束类型 | 新增跳转能力时改 |
| `cardEnhancements.ts` | 自定义增强行构建 | 新增复杂计算行时改；本文不展开胶囊/色带内部定义 |
| `fieldRules.ts` | 信息卡 rows 总入口、标题解析 | 很少改 |
| `FeatureInteractionCard.tsx` | 通用信息卡 UI、图片幕、JSON、导入、行渲染 | 改 UI 时改 |
| `featureCardRegistry.ts` | Class → 特殊信息卡组件注册 | 新增特殊卡时改 |
| `TRPFeatureInteractionCard.tsx` | TRP 特殊卡示例 | 仅 TRP 或参考特殊卡时看 |
| `pictureRules.ts` | 信息卡图片幕来源与目录匹配 | 新增图片目录规则时改 |

---

## 3. 信息卡数据分区：mainRows 与 otherRows

通用信息卡分为两区：

```ts
mainRows: CardRow[];
otherRows: CardRow[];
```

`mainRows` 直接展示；`otherRows` 放入“其他信息”折叠区。

基础类型：

```ts
type CardRow = {
  label: string;
  value: any;
  usedPaths?: string[];
};
```

字段来源顺序：

```text
1. 标题：pickFeatureDisplayName(feature)，优先 Name / name / staName。
2. 图片幕：buildPictureUrlsForFeature(feature)。
3. 主信息：cardRegistry.ts 控制 mainRows。
4. 其他信息：默认 other rows + 未被使用的 raw fields + 系统时间/作者字段。
```

`FeatureInteractionCard` 会过滤空值和 `未知`，因此 value 为空、空字符串、`未知`、无效链接等不会占用卡片空间。

---

## 4. cardRegistry.ts：信息卡布局主控

布局配置类型：

```ts
export type CardRegistryLayout = {
  schemaKey?: string;
  match?: {
    classCode?: string;
    kind?: string;
    skind?: string;
    skind2?: string;
    schemaKey?: string;
  };
  items: CardLayoutItem[];
};
```

### 4.1 匹配规则

匹配顺序：

```text
1. 如果 layout.schemaKey 与当前 schemaKey 相同，优先命中。
2. 否则检查 layout.match。
3. match 中写了哪个字段，就必须完全匹配哪个字段。
4. 没有命中任何 layout 时，使用默认布局：classification + registryDefaultGroup。
```

推荐：优先使用 `schemaKey`。只有当多个 schema 需要共用同一布局，或无 schemaKey 可用时，再使用 `match`。

示例：

```ts
{
  schemaKey: 'rail_station',
  items: [
    { kind: 'classification' },
    { kind: 'registryDefaultGroup' },
  ],
}
```

```ts
{
  match: { classCode: 'STB' },
  items: [
    { kind: 'classification' },
    { kind: 'registryDefaultGroup' },
  ],
}
```

---

## 5. CardLayoutItem：所有可写 item 类型

`items` 的顺序就是主信息区字段顺序。当前支持五类 item：

```ts
classification
registryField
registryDefaultGroup
rawField
enhancement
```

### 5.1 classification：类型行

```ts
{ kind: 'classification', label?: string, hidden?: boolean }
```

用途：显示“类型”行。类型文本来自当前 schema 的 classification 或 schema displayName。

示例：

```ts
{ kind: 'classification' }
```

修改 label：

```ts
{ kind: 'classification', label: '分类' }
```

隐藏类型行：

```ts
{ kind: 'classification', hidden: true }
```

### 5.2 registryField：引用 registry 字段

```ts
{
  kind: 'registryField';
  key?: string;
  path?: string;
  label?: string;
  hidden?: boolean;
  transform?: CardValueTransform;
  linkTarget?: CardFeatureLinkTarget;
}
```

查找方式：

```text
优先按 key 找；没有 key 时按 path 找。
```

推荐写法：

```ts
{ kind: 'registryField', path: 'STBuilding' }
```

覆盖显示名：

```ts
{ kind: 'registryField', path: 'STBuilding', label: '所属站体' }
```

设置为要素跳转：

```ts
{
  kind: 'registryField',
  path: 'STBuilding',
  transform: 'featureLink',
  linkTarget: {
    classCode: 'STB',
    matchField: 'ID',
    displayField: 'Name',
    fallbackDisplay: 'raw',
  },
}
```

注意：`hidden: true` 只隐藏这个显式 item。如果后面仍有 `registryDefaultGroup`，同一路径可能仍会从默认组里出现。若要彻底控制显示，请不要使用 `registryDefaultGroup`，而是显式列出所有需要的字段；或在字段对照层把该字段设为 infocard 不可见。

### 5.3 registryDefaultGroup：插入默认主字段组

```ts
{ kind: 'registryDefaultGroup' }
```

作用：把 workflow registry 的 infocard main 字段按默认 order 插入当前位置。

常用场景：

```ts
items: [
  { kind: 'classification' },
  { kind: 'registryField', path: 'STBuilding', transform: 'featureLink', linkTarget: ... },
  { kind: 'registryDefaultGroup' },
]
```

含义：先显示类型，再显示一个自定义跳转字段，然后插入默认字段。

如果不写 `registryDefaultGroup`：

```text
默认 registry main rows 不会自动进入 mainRows。
```

这适合完全手动控制主信息区。

### 5.4 rawField：直接从 featureInfo 读取字段

```ts
{
  kind: 'rawField';
  path: string;
  label: string;
  transform?: CardValueTransform;
  linkTarget?: CardFeatureLinkTarget;
  usedPaths?: string[];
  hidden?: boolean;
}
```

用途：显示 registry 没有定义、但 featureInfo 中存在的字段。

路径支持点号：

```ts
{ kind: 'rawField', path: 'extensions.link.wiki', label: 'WIKI链接', transform: 'externalLink' }
```

`usedPaths` 用来防止同一字段后续在“其他信息”里重复出现：

```ts
{
  kind: 'rawField',
  path: 'tags.Land',
  label: '所属地理单元',
  transform: 'featureLink',
  linkTarget: { classCode: 'ISG', kind: 'NGF', matchField: 'ID', displayField: 'Name', fallbackDisplay: 'raw' },
  usedPaths: ['tags.Land'],
}
```

rawField 的值为空时，不会生成 row。

### 5.5 enhancement：增强行挂载点

```ts
{ kind: 'enhancement', key: CardEnhancementKey }
```

当前 key：

```ts
'railColorChip'
'platformLineChips'
'stationLineChips'
'stationBuildingLineChips'
```

本手册只说明 enhancement 的挂载方式，不展开胶囊装色带 / 线路色带增强显示模式的内部定义。新增普通字段、跳转和外链时，不应优先使用 enhancement；只有需要跨字段计算、查索引或插入复杂 React 内容时才使用。

---

## 6. CardValueTransform：字段值转换模式

当前支持：

```ts
export type CardValueTransform =
  | 'plain'
  | 'externalLink'
  | 'featureLink'
  | 'featureLinkList'
  | 'json';
```

### 6.1 plain

默认模式。空值显示为 `未知`，最终会被通用信息卡过滤，不占用空间。

```ts
{ kind: 'registryField', path: 'Name', transform: 'plain' }
```

### 6.2 externalLink

将值渲染为外部网页链接。

```ts
{ kind: 'rawField', path: 'extensions.link.wiki', label: 'WIKI链接', transform: 'externalLink' }
```

链接规范化逻辑：

```text
https://example.com → 原样
//example.com → https://example.com
wiki.ria.red → https://wiki.ria.red
mailto: / tel: / ftp: / file: → 原样
```

另外，通用卡也会自动识别“看起来像 URL 的纯字符串”，即使没有 transform，也可能渲染为链接。但正式配置建议写 `externalLink`。

### 6.3 featureLink

将当前字段值作为目标要素 ID，点击后尝试触发目标要素的 labelClick。

```ts
{
  kind: 'registryField',
  path: 'STBuilding',
  transform: 'featureLink',
  linkTarget: {
    classCode: 'STB',
    matchField: 'ID',
    displayField: 'Name',
    fallbackDisplay: 'raw',
  },
}
```

### 6.4 featureLinkList

用于数组或可视为数组的多值字段。每个元素都会生成一个跳转链接。

```ts
{
  kind: 'rawField',
  path: 'StationIDs',
  label: '关联车站',
  transform: 'featureLinkList',
  linkTarget: {
    classCode: 'STA',
    matchField: 'ID',
    displayField: 'Name',
    fallbackDisplay: 'raw',
  },
}
```

如果数组元素是对象，需要指定 `sourceValuePath`：

```ts
{
  kind: 'rawField',
  path: 'Stations',
  label: '关联车站',
  transform: 'featureLinkList',
  linkTarget: {
    classCode: 'STA',
    sourceValuePath: 'ID',
    matchField: 'ID',
    displayField: 'Name',
    fallbackDisplay: 'raw',
  },
}
```

### 6.5 json

保留原始对象/数组，最终由 `FeatureInteractionCard` 使用 JSON 字符串兜底显示；过长文本会截断。

```ts
{ kind: 'rawField', path: 'Trade', label: '交易原始数据', transform: 'json' }
```

---

## 7. 字段跳转 linkTarget 完整定义

类型：

```ts
type CardFeatureLinkTarget = {
  classCode?: string;
  kind?: string;
  skind?: string;
  skind2?: string;
  schemaKey?: string;
  subType?: string;
  sourceValuePath?: string;
  matchField?: string;
  displayField?: string;
  multiple?: boolean;
  fallbackDisplay?: 'raw' | 'unknown';
};
```

字段说明：

| 字段 | 作用 | 常用值 |
|---|---|---|
| `classCode` | 目标 Class 限定 | `BUD`, `ISG`, `STA`, `STB`, `WRP` |
| `kind` | 目标 Kind 限定 | `NGF`, `ADM` 等 |
| `skind` | 目标 SKind 限定 | 需要精确分类时使用 |
| `skind2` | 目标 SKind2 限定 | 需要精确分类时使用 |
| `schemaKey` | 目标 schemaKey 限定 | 少用，除非分类字段不足 |
| `subType` | 目标 subtype 限定 | 少用 |
| `sourceValuePath` | 当前值为对象时，从对象里取哪个字段作为 ID | `ID`, `stationId` |
| `matchField` | 用目标要素哪个字段匹配当前 ID；默认 `ID` | `ID`, `Name` |
| `displayField` | 命中目标后显示哪个字段 | `Name` |
| `multiple` | 多值标记；当前主要由 `featureLinkList` 表达 | `true` |
| `fallbackDisplay` | 找不到目标时如何显示 | `raw` 或 `unknown` |

显示文本优先级：

```text
1. CardFeatureLinkValue.text
2. 目标要素 displayField
3. 目标要素 pickFeatureDisplayName(target)
4. fallbackDisplay === 'unknown' 时显示“未知”
5. 否则显示原 ID
```

点击行为：

```text
点击 featureLink / featureLinkList 项
→ onTryTriggerLabelClickById(id, linkTarget)
→ 上层尝试定位并触发目标要素 labelClick
```

推荐写法：

```ts
linkTarget: {
  classCode: 'ISG',
  kind: 'NGF',
  matchField: 'ID',
  displayField: 'Name',
  fallbackDisplay: 'raw',
}
```

---

## 8. 字段顺序调整方法

字段顺序由 `items` 数组决定。

### 8.1 把某个默认字段提前

```ts
{
  schemaKey: 'rail_station',
  items: [
    { kind: 'classification' },
    {
      kind: 'registryField',
      path: 'STBuilding',
      transform: 'featureLink',
      linkTarget: { classCode: 'STB', matchField: 'ID', displayField: 'Name', fallbackDisplay: 'raw' },
    },
    { kind: 'registryDefaultGroup' },
  ],
}
```

效果：`STBuilding` 会在默认字段组之前出现。由于该 row 的 `usedPaths` 会被记录，默认组里同一路径不会重复出现。

### 8.2 完全手动控制主字段

```ts
{
  schemaKey: 'my_schema',
  items: [
    { kind: 'classification' },
    { kind: 'registryField', path: 'Name' },
    { kind: 'registryField', path: 'Owner' },
    { kind: 'rawField', path: 'extensions.link.wiki', label: 'WIKI链接', transform: 'externalLink' },
  ],
}
```

不写 `registryDefaultGroup`，就不会自动插入 registry 默认主字段。

### 8.3 只想增加一个额外字段

```ts
items: [
  { kind: 'classification' },
  { kind: 'registryDefaultGroup' },
  { kind: 'rawField', path: 'extensions.character.brief', label: '简介' },
]
```

此时 rawField 会显示在默认主字段之后。

---

## 9. 新增字段解析的推荐路线

按复杂度选择实现方式：

| 需求 | 推荐位置 | 说明 |
|---|---|---|
| 只是调整顺序 | `cardRegistry.ts` | 调整 `items` 顺序 |
| 显示 registry 已有字段 | `registryField` | 用 `key` 或 `path` |
| 显示任意嵌套字段 | `rawField` | 用点号 path |
| 外部链接 | `transform: 'externalLink'` | 推荐显式写 transform |
| 单个要素跳转 | `transform: 'featureLink'` | 配 `linkTarget` |
| 多个要素跳转 | `transform: 'featureLinkList'` | 配 `sourceValuePath` |
| 复杂计算行 | `cardEnhancements.ts` | 本手册不展开胶囊/色带内部定义 |
| 完全特殊 UI | `featureCardRegistry.ts` + 自定义组件 | 参考 TRP |

---

## 10. 特殊信息卡注册方式

如果某个 Class 的信息卡不适合普通表格行，可以注册特殊组件。

文件：

```ts
src/components/Rules/cardrules/featureCardRegistry.ts
```

注册：

```ts
export const FEATURE_CARD_REGISTRY = {
  TRP: TRPFeatureInteractionCard,
  MYC: MyCustomFeatureInteractionCard,
};
```

特殊卡组件接收公共 props：

```ts
type FeatureCardCommonProps = {
  open: boolean;
  feature?: FeatureRecord | null;
  onClose?: () => void;
  resolveFeatureById?: ResolveFeatureById;
  onTryTriggerLabelClickById?: (id: string, linkTarget?: CardFeatureLinkTarget) => void;
  variant?: 'floating' | 'embedded';
  onOpenJsonPanel?: (payload: { title: string; jsonText: string; filename: string }) => void;
};
```

推荐写法：仍复用 `FeatureInteractionCard`，只插入中段模块或覆盖信息区：

```tsx
export default function MyCustomFeatureInteractionCard(props: FeatureCardCommonProps) {
  const { feature } = props;
  return (
    <FeatureInteractionCard
      {...props}
      midSection={feature ? <MyCustomSection feature={feature} /> : null}
      cardClassName="w-[420px]"
      infoSectionsOverride={undefined}
    />
  );
}
```

TRP 的做法：

```text
1. 使用 TRPTradeSection 作为 midSection。
2. 将交易列表、Land、wiki、brief 等大段解析放入专用模块。
3. 通过 infoSectionsOverride 把普通字段挪到 otherRows，避免主信息过长。
```

---

## 11. 图片幕配置

信息卡顶部图片幕由：

```ts
src/components/Rules/cardrules/pictureRules.ts
```

控制。

当前支持两类来源：

```text
1. public/pictures 目录探测；
2. Data 仓库 Picture index_by_id 模式。
```

新增 public 图片目录规则：

```ts
PICTURE_DIR_RULES.push({
  name: '示例目录',
  match: { Kind: 'NGF', SKind: 'LAD', SKind2: 'ISD' },
  dir: 'NGF/LAD/ISD',
});
```

图片命名规则：

```text
{ID}_1.png
{ID}_2.png
...
```

支持扩展名：

```text
.png, .jpg, .jpeg, .webp
```

无图片时使用：

```text
/pictures/normal.png
```

---

## 12. 当前自动兜底规则

即使没有在 `cardRegistry.ts` 中显式配置，系统也会做一些自动处理：

```text
1. 标题自动取 Name / name / staName / 其他 *name 字段 / Class:ID。
2. mainRows 为空且没有 midSection 时显示“暂无可显示的信息”。
3. otherRows 会折叠在“其他信息”中。
4. 未使用的普通字段会被 flattenRemainingRows 展开，但跳过 Conpoints / Flrpoints / PLpoints / Linepoints / coordinate。
5. 系统元数据会被统一显示为创建时间、创建者、最后编辑时间、编辑者。
6. 空值和“未知”会被 FeatureInteractionCard 过滤。
```

系统元数据识别路径：

```text
CreateTime / createTime
CreateBy / createBy
ModifityTime / ModifyTime / ModifiedTime / modifityTime / modifyTime / modifiedTime
ModifityBy / ModifyBy / ModifiedBy / modifityBy / modifyBy / modifiedBy
```

---

## 13. 常用配置模板

### 13.1 字段跳转到建筑 BUD

```ts
{
  kind: 'registryField',
  path: 'BuildingID',
  transform: 'featureLink',
  linkTarget: {
    classCode: 'BUD',
    matchField: 'ID',
    displayField: 'Name',
    fallbackDisplay: 'raw',
  },
}
```

### 13.2 字段跳转到自然地物面 ISG/NGF

```ts
{
  kind: 'registryField',
  path: 'tags.Land',
  label: '所属地理单元',
  transform: 'featureLink',
  linkTarget: {
    classCode: 'ISG',
    kind: 'NGF',
    matchField: 'ID',
    displayField: 'Name',
    fallbackDisplay: 'raw',
  },
}
```

### 13.3 外部 wiki 链接

```ts
{
  kind: 'rawField',
  path: 'extensions.link.wiki',
  label: 'WIKI链接',
  transform: 'externalLink',
  usedPaths: ['extensions.link.wiki'],
}
```

### 13.4 多目标要素跳转

```ts
{
  kind: 'rawField',
  path: 'Stations',
  label: '关联车站',
  transform: 'featureLinkList',
  linkTarget: {
    classCode: 'STA',
    sourceValuePath: 'ID',
    matchField: 'ID',
    displayField: 'Name',
    fallbackDisplay: 'raw',
  },
  usedPaths: ['Stations'],
}
```

### 13.5 完全手写一个 schema 的主信息卡

```ts
{
  schemaKey: 'my_schema',
  items: [
    { kind: 'classification' },
    { kind: 'registryField', path: 'Name', label: '名称' },
    { kind: 'rawField', path: 'extensions.character.brief', label: '简介' },
    { kind: 'rawField', path: 'extensions.link.wiki', label: 'WIKI链接', transform: 'externalLink' },
  ],
}
```

---

## 14. 维护检查清单

新增或修改信息卡前，按顺序检查：

```text
1. 目标要素是否有 schemaKey？有则优先用 schemaKey 匹配。
2. 是否需要保留 classification？
3. 是否需要 registryDefaultGroup？
4. 要提前的字段是否用 registryField 明确写出？
5. 嵌套字段是否应该用 rawField？
6. rawField 是否配置 usedPaths，避免 otherRows 重复？
7. ID 字段是否应该 transform 为 featureLink？
8. linkTarget 是否写 classCode / kind / matchField / displayField？
9. 找不到目标时应该 fallbackDisplay raw 还是 unknown？
10. 外链字段是否显式写 externalLink？
11. 是否需要特殊解析模块？若需要，优先考虑特殊卡 midSection。
12. 是否会和 TRP / STA / STB / PLF 的 railIndex 需求冲突？
13. 是否误把胶囊装色带增强模式当成普通字段？本手册不展开该模式。
```

---

## 15. 常见问题

### Q1：为什么我把 registryField hidden=true 后，字段还在默认组里出现？

因为 `hidden=true` 只隐藏这个显式 item；如果后面有 `registryDefaultGroup`，默认组仍可能插入同一路径。要彻底控制，建议不使用 `registryDefaultGroup`，改为显式列出需要的字段；或到字段对照层关闭该字段的 infocard visible。

### Q2：为什么跳转字段显示的是 ID，而不是目标名称？

检查 `linkTarget.displayField` 是否写了 `Name`，以及目标要素是否能被 `classCode/kind/skind/skind2/matchField` 找到。找不到时，如果 `fallbackDisplay='raw'`，会显示原 ID。

### Q3：为什么 rawField 不显示？

常见原因：路径不存在、值为空、值为 `未知` 后被通用卡过滤。检查 `path` 是否与 featureInfo 的嵌套结构一致。

### Q4：为什么 otherRows 出现很多原始字段？

这是 `flattenRemainingRows` 的兜底机制。给主信息中已消费的字段写 `usedPaths`，或减少未使用字段。

### Q5：什么时候需要特殊信息卡？

当普通 `label/value` 行无法表达结构，例如交易列表、复杂表格、大段描述、横向滚动列表时，使用 `FEATURE_CARD_REGISTRY` 注册特殊卡。普通字段顺序和链接不要用特殊卡解决。

---

## 16. 最小新增步骤

### 新增一个普通字段

```text
1. 打开 cardRegistry.ts。
2. 找到目标 schemaKey layout。
3. 在 items 中插入 registryField 或 rawField。
4. 需要跳转则加 transform + linkTarget。
5. 需要默认字段继续显示则保留 registryDefaultGroup。
```

### 新增一个外链字段

```text
1. 使用 rawField 或 registryField。
2. transform 写 externalLink。
3. path 指向链接字符串。
```

### 新增一个要素跳转字段

```text
1. transform 写 featureLink 或 featureLinkList。
2. linkTarget 至少写 classCode、matchField、displayField。
3. 如果当前值是对象，写 sourceValuePath。
```

### 新增特殊信息卡

```text
1. 新建 MyFeatureInteractionCard.tsx。
2. 复用 FeatureInteractionCard。
3. 用 midSection 插入自定义模块，或用 infoSectionsOverride 改写 mainRows/otherRows。
4. 在 featureCardRegistry.ts 注册 ClassCode。
```
