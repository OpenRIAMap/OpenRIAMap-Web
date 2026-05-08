import type { FeatureRecord } from '@/components/Rules/rendering/renderRules';

/** 外部网页超链接（新标签打开） */
export type CardExternalLinkValue = {
  kind: 'externalLink';
  href: string;
  text?: string;
};

/** 信息卡 ID 跳转的目标匹配约束。 */
export type CardFeatureLinkTarget = {
  /** 目标范围约束。 */
  classCode?: string;
  kind?: string;
  skind?: string;
  skind2?: string;

  /** 可选补充约束。常规场景优先使用 classCode/kind/skind/skind2。 */
  schemaKey?: string;
  subType?: string;

  /** 当前值为对象/数组元素时，从该 path 提取用于匹配的值。 */
  sourceValuePath?: string;

  /** 用目标要素的哪个字段匹配当前值。默认 ID。 */
  matchField?: string;

  /** 命中目标后，用目标要素的哪个字段作为显示文本。默认 Name，再回退 ID。 */
  displayField?: string;

  /** 多值字段标记。 */
  multiple?: boolean;

  /** 找不到目标时如何显示。 */
  fallbackDisplay?: 'raw' | 'unknown';
};

/** 要素跳转超链接（点击时尝试触发目标要素 labelClick） */
export type CardFeatureLinkValue = {
  kind: 'featureLink';
  targetId: string;
  /** 可选：指定显示文本；不填则由渲染层用 linkTarget.displayField / Name / ID 兜底 */
  text?: string;
  /** 可选：目标匹配约束，由信息卡总控台现场配置。 */
  linkTarget?: CardFeatureLinkTarget;
};

export type CardFeatureLinkListValue = {
  kind: 'featureLinkList';
  items: CardFeatureLinkValue[];
};

export type CardInteractiveValue = CardExternalLinkValue | CardFeatureLinkValue | CardFeatureLinkListValue;

/**
 * 将输入链接规范化为“绝对外链”，避免浏览器把 `wiki.ria.red` 解释为相对路径。
 * - 已带协议（http/https/mailto/tel/ftp/file 等）：原样
 * - `//example.com`：补 `https:`
 * - 其他：默认补 `https://`
 */
export function normalizeExternalHref(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';

  if (/^(https?:\/\/|mailto:|tel:|ftp:\/\/|file:\/\/)/i.test(s)) return s;
  if (s.startsWith('//')) return `https:${s}`;
  return `https://${s}`;
}

/** 1) 网页链接：在信息卡构建器中用此函数包装 value */
export function makeExternalLink(href: string, text?: string): CardExternalLinkValue {
  const s = normalizeExternalHref(href);
  return { kind: 'externalLink', href: s, text: text?.trim() || undefined };
}

/** 2) 要素跳转：在信息卡构建器中用此函数包装 value */
export function makeFeatureLink(
  targetId: string,
  text?: string,
  linkTarget?: CardFeatureLinkTarget,
): CardFeatureLinkValue {
  const s = String(targetId ?? '').trim();
  return { kind: 'featureLink', targetId: s, text: text?.trim() || undefined, linkTarget };
}

export function makeFeatureLinkList(items: CardFeatureLinkValue[]): CardFeatureLinkListValue {
  return { kind: 'featureLinkList', items: items.filter((item) => String(item.targetId ?? '').trim()) };
}

export function isExternalLinkValue(v: any): v is CardExternalLinkValue {
  return !!v && typeof v === 'object' && v.kind === 'externalLink' && typeof v.href === 'string';
}

export function isFeatureLinkValue(v: any): v is CardFeatureLinkValue {
  return !!v && typeof v === 'object' && v.kind === 'featureLink' && typeof v.targetId === 'string';
}

export function isFeatureLinkListValue(v: any): v is CardFeatureLinkListValue {
  return !!v && typeof v === 'object' && v.kind === 'featureLinkList' && Array.isArray(v.items);
}

export type ResolveFeatureById = (id: string, linkTarget?: CardFeatureLinkTarget) => FeatureRecord | undefined;
