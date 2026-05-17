# RB_EDO_6_F4 更新记录

基线：`OpenRIAMap-Web_RB_EDO_6_F3.zip`

## 修复内容

### 1. 要素分享链接查找启动时机后移

- 修复弱网环境下，分享链接解析后过早开始搜索要素，导致规则数据尚未加载完成就误报“无效世界或要素ID”的问题。
- 要素分享现在会先保存 pending target，并等待当前 world 的规则数据 ready、全局加载条退出后，再开始执行 `getRuleSearchPool()` 和要素 ID 查找。
- 等待地图数据阶段只显示“正在等待地图数据加载完成...”，不消耗查找次数，不触发 invalid。

### 2. 玩家分享链接等待首轮玩家数据

- 新增当前 world 玩家快照 ready 标记。
- 玩家分享现在会等待对应 world 成功完成一轮玩家接口读取后，再开始查找 `playerID`。
- 玩家接口失败时不会被误判为玩家 ID 无效；只有成功读取玩家列表后仍找不到目标，才进入既有有限重试与“无效世界或玩家ID”提示。

### 3. 保留无效 world 立即报错逻辑

- world 是否有效仍由分享链接解析阶段判断。
- 无效要素分享 world 会立即提示“无效世界或要素ID”。
- 无效玩家分享 world 会立即提示“无效世界或玩家ID”。
- 无效 world 不进入地图数据等待或玩家数据等待阶段。

## 修改文件

- `src/components/Map/MapContainer.tsx`

## 不修改范围

- 不修改 Vercel / EdgeOne / IIS 配置。
- 不修改数据源链接模式、fetchWithMirror、Legacy 按需加载。
- 不修改玩家 API 内部实现、PlayerLayer、PlayersList、NavigationPanel、SearchBar。
- 不修改分享链接 URL 格式。
- 不修改 RuleDrivenLayer、ruleDataStore、测绘导入导出和 BUD/STB label 体系。
