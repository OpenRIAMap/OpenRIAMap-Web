# RB_EDO_6_F3 修复说明

生成基线：`OpenRIAMap-Web_RB_EDO_6_F2.zip`

## 修改范围

- `src/components/DraggablePanel/desktopWindowStack.ts`
- `src/components/DraggablePanel/DraggablePanel.tsx`
- `src/components/Mapping/core/MeasuringModule.tsx`
- `src/components/Map/PlayerLayer.tsx`

## 修复内容

### 1. 测绘下拉菜单接入桌面窗口层级栈

- 将 DraggablePanel 内部桌面窗口层级栈抽取为共享工具 `desktopWindowStack.ts`。
- DraggablePanel 继续使用原有 root 与先来后到层级逻辑，默认行为不变。
- 桌面端测绘下拉菜单改为通过 portal 渲染到 `ria-desktop-window-root`。
- 测绘下拉菜单打开或被点击时会获得当前最高窗口层级。
- 点击其他 DraggablePanel 后，其他 panel 可以重新盖过测绘下拉菜单。
- 移动端测绘下拉菜单仍保留原局部定位逻辑。

### 2. 玩家 hover tooltip 提升到规则 symbol / label 之上

- PlayerLayer 新增专用 Leaflet pane：`ria-player-tooltip`。
- 该 pane 的 z-index 设置为 `900`。
- 玩家 hover tooltip 现在指定到该 pane，避免被规则点位、label 或其他要素符号遮挡。
- 玩家头像 marker 本体层级不提升，避免影响普通要素点击与显示。

## 检查结果

已执行：

```bash
node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit --pretty false
```

结果：通过。
