# RB_EDO_6_CHANGELOG

基线：OpenRIAMap-Web_RB_EDO_5.zip

## 修改范围

- 玩家卡顶部按钮改为右上 2×2 控制区，长玩家 ID 不再被导航/分享按钮挤压。
- 设置面板新增“源数据仓库链接模式”，支持 `CDN加速(639)` 与 `Github Raw` 切换。
- 新增 `sourceLinkModes.ts`，以注册表方式维护数据源链接模式。
- `fetchWithMirror.ts` 现在优先使用当前数据源链接模式，并保留 GitHub Raw / kkgithub / jsDelivr fallback。
- Data_Merge 与 Picture 的远端 base URL 改为按当前链接模式动态解析。
- 道路工作流默认分类输出修复：默认道路仅输出 `Kind: NOM`，不再输出 `SKind: NOM`。
- BUD/STB 增加内部面积优先级加分，面积越大同组内部显示优先级越高；加分上限为 `STRUCTURE_LABEL_AREA_BONUS_MAX = 999`，不改变外部 display tier。
- 单楼层 FLR/STF 建筑在 floor view 中自动显示唯一楼层内容，但不显示楼层选择面板。
- STB label 字号统一为 `structure-label-12`，与 BUD 一致。

## 不修改范围

- 未修改 Vercel / EdgeOne / IIS 配置。
- 未修改 package.json / package-lock.json / vercel.json。
- 未修改玩家 API、玩家列表主体、PlayerLayer、SearchBar 主体逻辑。
- 未修改 EDO_5 的玩家分享路径 `/#/player/world/playerID`。
- 未修改 Legacy 按需加载主逻辑。

## EdgeOne 数据源假设

`CDN加速(639)` 默认使用：

```text
https://data.ozk639.top/{owner}/{repo}/{branch}/{path}
```

也就是 GitHub Raw 兼容路径模式。EdgeOne 需要将 `data.ozk639.top` 回源到 `raw.githubusercontent.com`，并把回源 Host 设置为 `raw.githubusercontent.com`。
