// 交易点(TRP)物品图标注册表（用于查询候选）
//
// 当前新增：
// - 保留旧的 TRP_ITEM_IMG_MAP 兼容行为
// - 暴露 TRADE_IMAGE_SOURCE，供后续走统一源解析层时复用

import type { TradeImageSourceDef } from '@/components/Rules/data/sourceTypes';

export const DEFAULT_TRP_ITEM_IMG = '/logo.png';

export const TRADE_IMAGE_SOURCE: TradeImageSourceDef = {
  source: 'pub',
  worldField: 'World',
  classField: 'Class',
  kindField: 'Kind',
  idField: 'ID',
  tradeKeyField: 'Img',
  publicPictureRoot: '/pictures/items',
  debugName: 'TRP_DEFAULT_TRADE_IMAGE',
};

// 约定：
// - value 可以是 http(s) 完整 URL，也可以是以 "/" 开头的本地路径（public 下）。
// - key 建议使用“稳定的物品标签”（如 minecraft:emerald 或你的内部短码）。
export const TRP_ITEM_IMG_MAP: Record<string, string> = {
  // 'minecraft:emerald': '/pictures/items/emerald.png',
};

export function resolveTrpItemImage(imgTag?: string | null): string {
  const tag = String(imgTag ?? '').trim();
  if (!tag) return DEFAULT_TRP_ITEM_IMG;
  if (/^https?:\/\//i.test(tag)) return tag;
  if (tag.startsWith('/')) return tag;
  return TRP_ITEM_IMG_MAP[tag] ?? DEFAULT_TRP_ITEM_IMG;
}
