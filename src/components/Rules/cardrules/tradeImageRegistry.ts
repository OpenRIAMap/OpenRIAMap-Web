// 交易点(TRP)物品图标注册表（用于查询候选）
//
// 约定：
// - 工作流在选择 Img 时，会用此表提供可搜索的候选项（标签 -> URL/本地路径）。
// - Img 字段本身现在直接保存 URL 或本地路径（public 下以 "/" 开头）。
// - 信息卡渲染不再依赖本表做二次解析；渲染直接使用 Img 的值。

export const DEFAULT_TRP_ITEM_IMG = '/logo.png';

// 约定：
// - value 可以是 http(s) 完整 URL，也可以是以 "/" 开头的本地路径（public 下）。
// - key 建议使用“稳定的物品标签”（如 minecraft:emerald 或你的内部短码）。
export const TRP_ITEM_IMG_MAP: Record<string, string> = {
  // 示例：
  // 'minecraft:emerald': '/pictures/items/emerald.png',
  // 'my_mod:item_x': 'https://example.com/item_x.png',
};

export function resolveTrpItemImage(imgTag?: string | null): string {
  const tag = String(imgTag ?? '').trim();
  if (!tag) return DEFAULT_TRP_ITEM_IMG;

  // 允许直接填 URL / 本地路径
  if (/^https?:\/\//i.test(tag)) return tag;
  if (tag.startsWith('/')) return tag;

  return TRP_ITEM_IMG_MAP[tag] ?? DEFAULT_TRP_ITEM_IMG;
}
