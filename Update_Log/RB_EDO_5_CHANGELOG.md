# RB_EDO_5 更新说明

基线：`OpenRIAMap-Web_RB_EDO_4_F3.zip`

## 变更范围

本次更新只处理 EDO 大版本内的两类问题：旧 Legacy 数据源按需加载，以及玩家信息卡正式化改造。

## 主要修改

1. 默认进入页面时不再自动加载旧 Legacy railway / landmark / RMP 数据。
2. 新增 `src/lib/legacyDataLoader.ts`，旧数据源只在用户明确启用旧铁路、旧地标、旧线路或旧导航模式后加载，并复用现有全局加载条流程。
3. 玩家信息卡移除附近站点、附近地标及空占位提示，彻底脱离 Legacy 数据。
4. 玩家信息卡坐标、生命值、护甲值随玩家轮询状态自动刷新。
5. 玩家信息卡顶部增加导航、分享按钮，并通过 DraggablePanel 可选参数提供白色缩放/关闭按钮。
6. 玩家信息卡分享链接改为独立玩家路径：`/#/player/world/playerID`。
7. 打开玩家分享链接后，会在目标 world 的在线玩家列表中查找 playerID；找到后定位到玩家当前位置并打开玩家卡，找不到则提示“无效世界或玩家ID”。
8. DraggablePanel 仅新增可选参数 `windowControlTone` 与 `minimizedTitleNode`，默认行为不变。
9. 玩家卡缩小后显示玩家图标、玩家名、展开按钮和关闭按钮。

## 不修改范围

- 未修改 Vercel / EdgeOne / IIS 配置。
- 未修改 `package.json`、`package-lock.json`、`vercel.json`。
- 未修改 Data_Merge / Picture / GitHub 新数据源路径。
- 未修改 RuleDrivenLayer、BUD/STB label、玩家 API、PlayerLayer、PlayersList 主体逻辑。
