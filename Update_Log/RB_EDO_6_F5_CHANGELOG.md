# RB_EDO_6_F5 Changelog

基线：`OpenRIAMap-Web_RB_EDO_6_F4.zip`

## 修复内容

1. **FLR/STF 搜索与分享跳转楼层同步**
   - 搜索或分享链接选中 `FLR` / `STF` 要素时，读取目标要素的 `NofFloor`。
   - 若对应建筑的 floor view 已启动，则自动切换到该楼层。
   - 若 floor view 尚未启动但可确认目标建筑与楼层，则预写该建筑的楼层记忆；用户随后放大触发 floor view 时会自动打开到目标楼层。
   - 同一建筑内连续搜索不同楼层要素时，也会自动切换到新的目标楼层。
   - 仅处理具备有效 `NofFloor` 且能关联到建筑的 `FLR` / `STF`；普通要素与信息不足的楼层要素不受影响。

2. **加载窗口标题文案调整**
   - 将加载窗口标题从 `RIA 铁路在线地图` 调整为 `RIA 在线地图`。

## 修改文件

- `src/components/Rules/core/RuleDrivenLayer.tsx`
- `src/components/Loading/LoadingOverlay.tsx`
