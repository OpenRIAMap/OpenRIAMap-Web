import { type ReactNode, type WheelEvent, useEffect, useMemo, useRef, useState } from 'react';

import DraggablePanel from '@/components/DraggablePanel/DraggablePanel';
import AppCard from '@/components/ui/AppCard';
import AppButton from '@/components/ui/AppButton';
import { loadMapSettings } from '@/lib/cookies';

import type { FeatureRecord } from './renderRules';
import { buildInfoSectionsForFeature, pickFeatureDisplayName } from './cardrules/fieldRules';
import { buildPictureUrlsForFeature } from './cardrules/pictureRules';
import {
  isExternalLinkValue,
  isFeatureLinkValue,
  normalizeExternalHref,
  type ResolveFeatureById,
} from './cardrules/cardInteractions';
// 使用相对路径，避免不同构建环境下 @ 别名解析差异导致 TS2307。
import { loadRailNewIndex, type RailNewIndex } from '../Navigation/railNewIndex';

type Props = {
  open: boolean;
  feature?: FeatureRecord | null;
  onClose?: () => void;
  /** 由上层（RuleDrivenLayer）提供：用于在“要素跳转”中通过 id 找到目标要素 */
  resolveFeatureById?: ResolveFeatureById;
  /** 由上层（RuleDrivenLayer）提供：用于在“要素跳转”中尝试触发目标要素的 labelClick */
  onTryTriggerLabelClickById?: (id: string) => void;

  /** 可选：在图片幕与主信息之间插入额外模块（例如 TRP 交易列表） */
  midSection?: ReactNode;
  /** 可选：覆盖卡片宽度（例如 TRP 需要更宽） */
  cardClassName?: string;
  /** 可选：覆盖图片幕每张图的尺寸 */
  pictureItemSize?: { width: number; height: number };
  /** 可选：不使用 FIELD_RULES（避免特殊卡被 fieldRules.ts 误定义影响） */
  disableFieldRules?: boolean;

  /** 可选：覆盖主信息/其他信息分区（用于特殊卡把大段信息挪到自定义模块中） */
  infoSectionsOverride?: { mainRows: CardRow[]; otherRows: CardRow[] };
  /** 渲染模式：floating=桌面悬浮，embedded=嵌入容器（移动端底部抽屉） */
  variant?: 'floating' | 'embedded';
};

type CardRow = { label: string; value: any };

function normalizeMultilineText(s: string): string {
  // Works with real newlines and literal sequences like "\\n" / "\\r\\n".
  return s
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\n/g, '\n');
}

function formatValue(v: any): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 500 ? s.slice(0, 500) + '…' : s;
  } catch {
    return String(v);
  }
}

function renderRichValue(v: any) {
  if (!v || typeof v !== 'object') return null;

  if (v.kind === 'colorChip') {
    const color = v.color || '#999999';
    const text = v.text || '#999999';
    return (
      <div
        className="px-2 py-1 rounded-md text-[11px] font-semibold"
        style={{
          backgroundColor: color,
          color: '#ffffff',
          minWidth: 92,
          textAlign: 'center',
        }}
        title={text}
      >
        {text}
      </div>
    );
  }

  if (v.kind === 'lineChips') {
    const items = Array.isArray(v.items) ? v.items : [];
    return (
      <div className="flex flex-wrap justify-end gap-2">
        {items.map((it: any, idx: number) => {
          const color = it?.color || '#999999';
          const name = it?.name || '未知';
          const text = it?.text || '';
          return (
            <div
              key={`${name}-${idx}`}
              className="px-2 py-1 rounded-md text-[11px] font-semibold"
              style={{
                backgroundColor: color,
                color: '#ffffff',
                maxWidth: 220,
              }}
              title={text ? `${name} ${text}` : name}
            >
              {name}
            </div>
          );
        })}
      </div>
    );
  }

  return null;
}

export default function FeatureInteractionCard(props: Props) {
  const {
    open,
    feature,
    onClose,
    resolveFeatureById,
    onTryTriggerLabelClickById,
    midSection,
    cardClassName,
    pictureItemSize,
    disableFieldRules,
    infoSectionsOverride,
    variant = 'floating',
  } = props;
  if (!open) return null;

  const title = useMemo(() => pickFeatureDisplayName(feature), [feature]);

  const [pictures, setPictures] = useState<string[]>(['/pictures/normal.png']);
  useEffect(() => {
    let alive = true;
    (async () => {
      const urls = await buildPictureUrlsForFeature(feature);
      if (!alive) return;
      setPictures(urls.length > 0 ? urls : ['/pictures/normal.png']);
    })();
    return () => {
      alive = false;
    };
  }, [feature]);

  // rail index（仅 STA / STB 需要）
  const [railIndex, setRailIndex] = useState<RailNewIndex | null>(null);

  useEffect(() => {
    let alive = true;

    const clsOrKind = String(
      feature?.meta?.Class ?? feature?.featureInfo?.Kind ?? feature?.featureInfo?.Class ?? '',
    ).trim();
    const needRail = clsOrKind === 'STA' || clsOrKind === 'STB' || clsOrKind === 'PLF';

    if (!needRail) {
      setRailIndex(null);
      return;
    }

    // worldId：优先从要素属性读取；若缺失，则退回到当前地图设置的 world（保持与导航一致）
    const worldId = String(
      feature?.featureInfo?.World ?? feature?.featureInfo?.world ?? feature?.meta?.World ?? ''
    ).trim();

    const fallbackWorldId = loadMapSettings()?.currentWorld ?? 'zth';
    const effectiveWorldId = worldId || fallbackWorldId;

    (async () => {
      try {
        const idx = await loadRailNewIndex(effectiveWorldId);
        if (!alive) return;
        setRailIndex(idx);
      } catch {
        if (!alive) return;
        setRailIndex(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, [feature]);

  const { mainRows, otherRows } = useMemo(() => {
    if (infoSectionsOverride) return infoSectionsOverride;
    if (!feature) return { mainRows: [] as CardRow[], otherRows: [] as CardRow[] };
    const { mainRows, otherRows } = buildInfoSectionsForFeature(feature, railIndex, {
      disableFieldRules: !!disableFieldRules,
    });
    // 过滤“空值/未知”行：避免大量“未知”占位挤占信息卡空间
    const isEmptyOrUnknown = (v: any): boolean => {
      if (v === null || v === undefined) return true;
      if (typeof v === 'string') {
        const s = v.trim();
        return !s || s === '未知';
      }
      // 交互型 value：缺少关键字段也视为空
      if (v && typeof v === 'object') {
        const kind = String((v as any).kind ?? '').trim();
        if (kind === 'externalLink') return !String((v as any).href ?? '').trim();
        if (kind === 'featureLink') return !String((v as any).targetId ?? '').trim();
        if (kind === 'colorChip') return !String((v as any).color ?? '').trim();
        if (kind === 'lineChips') return !Array.isArray((v as any).items) || (v as any).items.length === 0;
      }
      return false;
    };

    return {
      mainRows: (mainRows ?? []).filter((r) => r && !isEmptyOrUnknown((r as any).value)),
      otherRows: (otherRows ?? []).filter((r) => r && !isEmptyOrUnknown((r as any).value)),
    };
  }, [feature, railIndex, disableFieldRules, infoSectionsOverride]);

  const [otherOpen, setOtherOpen] = useState(false);
  useEffect(() => {
    setOtherOpen(false);
  }, [feature]);

  const stripRef = useRef<HTMLDivElement>(null);
  const onStripWheel = (e: WheelEvent<HTMLDivElement>) => {
    const el = stripRef.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    el.scrollLeft += e.deltaY;
  };

  // ======== 单要素 JSON 面板（用于复制/下载并再导入编辑） ========
  const [jsonOpen, setJsonOpen] = useState(false);
  useEffect(() => setJsonOpen(false), [feature]);

  const featureJsonText = useMemo(() => {
    if (!feature) return '[]';
    // 以数组形式导出，便于直接作为“导入数据”的 JSON 内容
    try {
      return JSON.stringify([feature.featureInfo ?? {}], null, 2);
    } catch {
      return JSON.stringify([{}], null, 2);
    }
  }, [feature]);

  const downloadTextFile = (filename: string, content: string) => {
    try {
      const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  const cardBody = (
    <AppCard className={cardClassName ?? 'w-[360px]'} onWheel={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-black/10">
          <div className="text-sm font-semibold truncate" title={title}>
            {title || '（未命名要素）'}
          </div>
          <div className="flex items-center gap-2">
            <AppButton
              className="px-2 py-1 text-xs bg-transparent hover:bg-black/5"
              onClick={() => setJsonOpen(true)}
              type="button"
            >
              JSON
            </AppButton>
            {variant === 'embedded' ? null : (
              <AppButton className="px-2 py-1 text-xs bg-transparent hover:bg-black/5" onClick={onClose} type="button">
                关闭
              </AppButton>
            )}
          </div>
        </div>

        <div className="px-3 pt-3">
          <div
            ref={stripRef}
            className="flex gap-2 overflow-x-auto overflow-y-hidden pb-2 snap-x snap-mandatory"
            onWheel={onStripWheel}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {pictures.map((src, idx) => (
              <div
                key={`${src}-${idx}`}
                className="shrink-0 snap-start rounded-md border border-black/10 bg-black/5"
                style={{
                  width: pictureItemSize?.width ?? 324,
                  height: pictureItemSize?.height ?? 182,
                }}
              >
                <img
                  src={src}
                  alt={title ? `${title}-${idx + 1}` : `picture-${idx + 1}`}
                  className="w-full h-full object-cover rounded-md"
                  draggable={false}
                  onError={(ev) => {
                    const img = ev.currentTarget;
                    if (img && img.src && !img.src.endsWith('/pictures/normal.png')) {
                      img.src = '/pictures/normal.png';
                    }
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="px-3 pb-3" onWheel={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          {/* 图片幕以下：统一纵向滚动（与常规信息卡一致），包含可插入的 midSection */}
          <div className="mt-1 rounded-md border border-black/10 bg-white max-h-[60vh] overflow-y-auto">
            {midSection ? <div className="px-3 pt-3 pb-2">{midSection}</div> : null}
            {mainRows.length > 0 ? (
              mainRows.map((r, i) => {
                const v = r.value;

                // ===== 交互型 value：外部链接 / 要素跳转 =====
                let rich = renderRichValue(v);
                let textNode: any = null;

                // ===== 自动识别纯字符串 URL（用于未定义规则时的 extensions.link.* 等） =====
                const tryStringAsUrl = (raw: any) => {
                  if (typeof raw !== 'string') return '';
                  const s = raw.trim();
                  if (!s) return '';
                  // 仅对“看起来像链接”的字符串启用：
                  // - 明确协议/双斜杠
                  // - 或包含 '.' 且不含空格（避免误把普通文本当链接）
                  if (/^(https?:\/\/|mailto:|tel:|ftp:\/\/|file:\/\/|\/\/)/i.test(s)) return s;
                  if (s.includes(' ') || s.length > 2048) return '';
                  if (s.includes('.') && !s.startsWith('#')) return s;
                  return '';
                };
                const maybeUrl = !rich ? tryStringAsUrl(v) : '';

                if (!rich && isExternalLinkValue(v)) {
                  const href = normalizeExternalHref(v.href);
                  const text = String(v.text ?? href).trim();
                  textNode = href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#2563eb', textDecoration: 'underline', cursor: 'pointer' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {text}
                    </a>
                  ) : (
                    '未知'
                  );
                } else if (!rich && isFeatureLinkValue(v)) {
                  const id = String(v.targetId ?? '').trim();
                  const target = id && resolveFeatureById ? resolveFeatureById(id) : undefined;
                  const display =
                    String(v.text ?? '').trim() ||
                    (target ? pickFeatureDisplayName(target) : '') ||
                    id ||
                    '未知';

                  textNode = (
                    <span
                      style={{ color: '#2563eb', textDecoration: 'underline', cursor: 'pointer' }}
                      title={id || undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!id) return;
                        try {
                          onTryTriggerLabelClickById?.(id);
                        } catch {
                          // 按需求：静默失败，不抛错、不重试
                        }
                      }}
                    >
                      {display}
                    </span>
                  );
                }

                // 兜底：纯字符串 URL 也渲染为外链
                if (!rich && !textNode && maybeUrl) {
                  const href = normalizeExternalHref(maybeUrl);
                  textNode = (
                    <a
                      className="text-blue-600 hover:underline"
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      title={href}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {String(v)}
                    </a>
                  );
                }

                const text =
                  rich || textNode
                    ? null
                    : normalizeMultilineText(formatValue(v));

                return (
                  <div
                    key={`${r.label}-${i}`}
                    className={`flex items-start justify-between gap-3 px-2 py-2 text-xs ${
                      i === 0 ? '' : 'border-t border-black/10'
                    }`}
                  >
                    <div className="text-black/60 shrink-0">{r.label}</div>
                    <div
                      className="text-right text-black/90 break-words max-w-[240px]"
                      style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                    >
                      {rich ? rich : textNode ? textNode : text || '-'}
                    </div>
                  </div>
                );
              })
            ) : midSection ? null : (
              <div className="px-2 py-2 text-xs text-black/60">暂无可显示的信息。</div>
            )}

            {otherRows.length > 0 && (
              <>
                <div className="border-t border-black/10" />
                <div className="px-2 py-1">
                  <AppButton
                    className="w-full justify-between text-xs bg-transparent hover:bg-black/5"
                    onClick={() => setOtherOpen((v) => !v)}
                  >
                    <span>其他信息</span>
                    <span className="text-black/60">{otherOpen ? '收起' : '展开'}</span>
                  </AppButton>
                </div>
                {otherOpen && (
                  <div className="border-t border-black/10">
                    {otherRows.map((r, i) => {
                      const v = r.value;
                      let rich = renderRichValue(v);
                      let textNode: any = null;

                      if (!rich && isExternalLinkValue(v)) {
                        const href = normalizeExternalHref(v.href);
                        const text = String(v.text ?? href).trim();
                        textNode = href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: '#2563eb', textDecoration: 'underline', cursor: 'pointer' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {text}
                          </a>
                        ) : (
                          '未知'
                        );
                      } else if (!rich && isFeatureLinkValue(v)) {
                        const id = String(v.targetId ?? '').trim();
                        const target = id && resolveFeatureById ? resolveFeatureById(id) : undefined;
                        const display =
                          String(v.text ?? '').trim() ||
                          (target ? pickFeatureDisplayName(target) : '') ||
                          id ||
                          '未知';

                        textNode = (
                          <span
                            style={{ color: '#2563eb', textDecoration: 'underline', cursor: 'pointer' }}
                            title={id || undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!id) return;
                              try {
                                onTryTriggerLabelClickById?.(id);
                              } catch {
                                // 静默失败
                              }
                            }}
                          >
                            {display}
                          </span>
                        );
                      }

                      const text =
                        rich || textNode
                          ? null
                          : normalizeMultilineText(formatValue(v));

                      return (
                        <div
                          key={`other-${r.label}-${i}`}
                          className={`flex items-start justify-between gap-3 px-2 py-2 text-xs ${
                            i === 0 ? '' : 'border-t border-black/10'
                          }`}
                        >
                          <div className="text-black/60 shrink-0">{r.label}</div>
                          <div
                            className="text-right text-black/90 break-words max-w-[240px]"
                            style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                          >
                            {rich ? rich : textNode ? textNode : text || '-'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
    </AppCard>
  );

  return (
    <>
      {variant === 'embedded' ? cardBody : (
        <DraggablePanel id="featureInteractionCard" defaultPosition={{ x: 16, y: 180 }}>
          {cardBody}
        </DraggablePanel>
      )}

      {jsonOpen && (
        <DraggablePanel id="featureJsonPanel" defaultPosition={{ x: 400, y: 200 }}>
          <AppCard className="w-[420px] max-h-[70vh] overflow-hidden" onWheel={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-black/10">
              <div className="text-sm font-semibold">当前要素 JSON</div>
              <AppButton
                className="px-2 py-1 text-xs bg-transparent hover:bg-black/5"
                onClick={() => setJsonOpen(false)}
                type="button"
              >
                关闭
              </AppButton>
            </div>

            <div className="p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <AppButton
                  type="button"
                  className="px-2 py-1 text-xs border border-gray-300 bg-white hover:bg-gray-50"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(featureJsonText);
                    } catch {
                      // ignore
                    }
                  }}
                >
                  复制
                </AppButton>
                <AppButton
                  type="button"
                  className="px-2 py-1 text-xs border border-gray-300 bg-white hover:bg-gray-50"
                  onClick={() => {
                    const id = String(feature?.meta?.idValue ?? 'feature').trim() || 'feature';
                    downloadTextFile(`${id}.json`, featureJsonText);
                  }}
                >
                  下载
                </AppButton>
                <div className="text-[11px] text-gray-500">可复制/下载后在“导入数据”中重新导入编辑</div>
              </div>
              <textarea
                className="w-full flex-1 min-h-[360px] text-xs font-mono border border-gray-200 rounded p-2 bg-white"
                value={featureJsonText}
                readOnly
              />
            </div>
          </AppCard>
        </DraggablePanel>
      )}
    </>
  );
}
