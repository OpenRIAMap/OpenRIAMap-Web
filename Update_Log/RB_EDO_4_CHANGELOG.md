# RB_EDO_4 更新说明

基线：`OpenRIAMap-Web_RB_EDO_3_T1.zip`

## 部署准备

- 补全 `vercel.json`：保留 `/api/dynmap/:path*` 代理，并增加 Vite SPA fallback、构建命令、输出目录、缓存响应头和 Git 自动部署显式配置。
- 在 `package.json` 中锁定 Node 版本为 `20.x`。
- 新增 `.vercelignore`，避免 Vercel CLI / 手动上传部署时包含 `node_modules`、`dist`、`.git` 等无关内容。
- 同步 `package-lock.json`，确保 `tsx` 依赖可被 Vercel 安装并用于 `export:data-schema`。

## 分享链接

- 分享链接打开后会一次性读取 `worldId / featureId`，然后通过 `history.replaceState` 清理为主网址。
- 有效分享链接仍会在数据加载后自动跳转并打开对应要素。
- 无效世界或要素 ID 会在主地图上显示提示：“无效世界或要素ID”。
- 刷新主网址后不会再次重复执行分享跳转。

## 玩家功能

- 恢复玩家相关工具栏入口和图层控制入口。
- 玩家数据默认走 `/api/dynmap` same-origin 代理，适配 Vercel 部署。
- `MapContainer` 统一维护玩家快照，`PlayerLayer` 在收到外部 `players` 时只负责渲染，避免重复轮询。
- 玩家头像默认通过 `/api/dynmap` 代理读取。

## 搜索与导航

- 主搜索栏增加在线玩家搜索，点击结果会跳转到生成搜索结果时的玩家坐标。
- 导航起点/终点可搜索在线玩家。
- 玩家作为导航点时，输入框显示为坐标值，路线计算使用选中瞬间的玩家坐标。

## 保持不变

- 不修改 GitHub 数据源路径。
- 不修改 DraggablePanel。
- 不修改规则图层、Label、BUD/STB、InfoCard、Workflow 和测绘功能。
