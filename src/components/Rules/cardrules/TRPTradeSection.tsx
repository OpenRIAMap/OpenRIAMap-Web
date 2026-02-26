import { useMemo, useRef, type WheelEvent } from 'react';

import type { FeatureRecord } from '../renderRules';
// 仅作为 TRP 专用展示模块，不依赖 FIELD_RULES。
import { WORKFLOW_FEATURE_CATALOG } from '@/components/Mapping/featureFormats';

type Props = {
  feature: FeatureRecord;
  /** 可选：用于“所属地理单元”等内链接跳转 */
  onTryTriggerLabelClickById?: (id: string) => void;
};

type TradeItem = {
  Name?: string;
  Img?: string;
  Count?: any;
  ItemID?: string;
  Brief?: string;
};

type TradeGroup = {
  TradeNum?: any;
  Note?: string;
  OfferItems?: TradeItem[];
  ReceiveItems?: TradeItem[];
};

function nonEmpty(v: any): boolean {
  return String(v ?? '').trim().length > 0;
}

function resolveImgSrc(raw: any): string {
  const s = String(raw ?? '').trim();
  if (!s) return '/logo.png';
  // local path: "/xxx"
  if (s.startsWith('/')) return s;
  // external: keep as-is (browser will request absolute URL)
  return s;
}

function buildTrpTypeLabel(fi: any): string {
  const kind = String(fi?.Kind ?? fi?.Kind ?? fi?.Kind ?? fi?.kind ?? '').trim();
  const skind = String(fi?.SKind ?? fi?.SKind ?? fi?.SKind ?? fi?.skind ?? '').trim();
  const skind2 = String(fi?.SKind2 ?? fi?.SKind2 ?? fi?.SKind2 ?? fi?.skind2 ?? '').trim();
  const hit = WORKFLOW_FEATURE_CATALOG.find(
    (e) => e.classCode === 'TRP' && e.kind === kind && e.skind === skind && String(e.skind2 ?? '') === skind2,
  );
  return hit?.name ?? '';
}

function normalizeTradeList(raw: any): Array<{ key: string; note: string; offers: TradeItem[]; receives: TradeItem[] }> {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((it: TradeGroup, idx: number) => {
    const offers = Array.isArray(it?.OfferItems) ? it.OfferItems : [];
    const receives = Array.isArray(it?.ReceiveItems) ? it.ReceiveItems : [];
    const tradeNum = String(it?.TradeNum ?? idx + 1).trim();
    const key = tradeNum || String(idx + 1);
    const note = String(it?.Note ?? '').trim();
    return { key, note, offers, receives };
  });
}

function buildItemTitle(item: TradeItem): string {
  const lines: string[] = [];
  const itemId = String(item?.ItemID ?? '').trim();
  if (itemId) lines.push(itemId);
  const brief = String(item?.Brief ?? '').trim();
  if (brief) {
    // keep user-authored line breaks & literal \n
    lines.push(brief.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\\n/g, '\n'));
  }
  return lines.join('\n');
}

function TrpItemLine({ item }: { item: TradeItem }) {
  const title = buildItemTitle(item);
  const imgSrc = resolveImgSrc(item?.Img);
  const imgSize = 42; // ~ 2/3 of 64

  return (
    <div className="flex items-center gap-2 min-w-0">
      <img
        src={imgSrc}
        alt={String(item?.Name ?? '')}
        style={{ width: imgSize, height: imgSize }}
        className="rounded border border-black/10 bg-white object-contain shrink-0"
        draggable={false}
        onError={(ev) => {
          const img = ev.currentTarget;
          if (img && img.src && !img.src.endsWith('/logo.png')) img.src = '/logo.png';
        }}
      />

      <div className="min-w-0">
        {title ? (
          <abbr title={title} className="no-underline cursor-help">
            <div className="text-xs font-medium text-gray-800 break-words whitespace-pre-wrap">{item?.Name}</div>
          </abbr>
        ) : (
          <div className="text-xs font-medium text-gray-800 break-words whitespace-pre-wrap">{item?.Name}</div>
        )}
      </div>
    </div>
  );
}

export default function TRPTradeSection({ feature, onTryTriggerLabelClickById }: Props) {
  const fi: any = feature?.featureInfo ?? {};

  const typeLabel = useMemo(() => buildTrpTypeLabel(fi), [fi]);
  const interaction = String(fi?.Interaction ?? fi?.interaction ?? '').trim();
  const situation = String(fi?.Situation ?? fi?.situation ?? '').trim();
  const landId = String(fi?.tags?.Land ?? fi?.tags?.land ?? '').trim();
  const wiki = String(fi?.extensions?.link?.wiki ?? fi?.extensions?.Link?.wiki ?? '').trim();
  const briefRaw = String(fi?.extensions?.character?.brief ?? fi?.extensions?.Character?.brief ?? '').trim();
  const brief = briefRaw
    ? briefRaw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\\n/g, '\n')
    : '';

  const trades = useMemo(() => normalizeTradeList(fi?.Trade ?? fi?.trade), [fi]);

  // trade list horizontal scroll (wheel-to-x like picture strip)
  const tradeRef = useRef<HTMLDivElement>(null);
  const onTradeWheel = (e: WheelEvent<HTMLDivElement>) => {
    const el = tradeRef.current;
    if (!el) return;
    // allow vertical page scroll when there is no horizontal overflow
    if (el.scrollWidth <= el.clientWidth) return;
    e.preventDefault();
    e.stopPropagation();
    el.scrollLeft += e.deltaY;
  };

  return (
    <div className="mt-1 rounded-md border border-black/10 bg-white">
      <div className="px-3 py-2 border-b border-black/10">
        <div className="text-xs font-semibold text-gray-800">交易点信息</div>
      </div>

      <div className="px-3 py-2 space-y-1">
        <div className="flex items-start justify-between gap-3">
          <div className="text-[11px] text-gray-500 shrink-0">类型</div>
          <div className="text-[11px] text-gray-800 text-right">{typeLabel || '（未匹配）'}</div>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="text-[11px] text-gray-500 shrink-0">交互模式</div>
          <div className="text-[11px] text-gray-800 text-right">{interaction || '（空）'}</div>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="text-[11px] text-gray-500 shrink-0">启用状况</div>
          <div className="text-[11px] text-gray-800 text-right">{situation || '（空）'}</div>
        </div>

        {/* ===== 专项解析：Land / wiki / brief（与全局信息卡风格一致） ===== */}
        {landId ? (
          <div className="flex items-start justify-between gap-3">
            <div className="text-[11px] text-gray-500 shrink-0">所属地理单元</div>
            <div className="text-[11px] text-right">
              <span
                style={{ color: '#2563eb', textDecoration: 'underline', cursor: 'pointer' }}
                title={landId}
                onClick={(e) => {
                  e.stopPropagation();
                  try {
                    onTryTriggerLabelClickById?.(landId);
                  } catch {
                    // 静默失败
                  }
                }}
              >
                {landId}
              </span>
            </div>
          </div>
        ) : null}

        {wiki ? (
          <div className="flex items-start justify-between gap-3">
            <div className="text-[11px] text-gray-500 shrink-0">wiki链接</div>
            <div className="text-[11px] text-right">
              <a
                href={wiki.startsWith('http') || wiki.startsWith('//') ? wiki : `https://${wiki}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#2563eb', textDecoration: 'underline', cursor: 'pointer' }}
                onClick={(e) => e.stopPropagation()}
              >
                {wiki}
              </a>
            </div>
          </div>
        ) : null}

        {brief ? (
          <div className="flex items-start justify-between gap-3">
            <div className="text-[11px] text-gray-500 shrink-0">简介</div>
            <div
              className="text-[11px] text-gray-800 text-right"
              style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
            >
              {brief}
            </div>
          </div>
        ) : null}
      </div>

      <div className="px-3 py-2 border-t border-black/10">
        <div className="text-xs font-semibold text-gray-800 mb-2">交易列表</div>

                <div className="rounded-md border border-black/10 overflow-hidden">
          <div
            ref={tradeRef}
            className="overflow-x-auto overflow-y-hidden"
            onWheel={onTradeWheel}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <table className="w-max min-w-full table-auto text-[11px]">
              <colgroup>
                <col />
                <col style={{ width: '5ch' }} />
                <col />
                <col style={{ width: '5ch' }} />
              </colgroup>

              <thead className="bg-black/5 text-gray-700">
                <tr className="border-b border-black/10">
                  <th className="text-left font-semibold px-2 py-2">提供的物品</th>
                  <th className="text-center font-semibold px-2 py-2">
                    <span className="inline-flex items-center justify-center rounded-md border border-slate-500 px-1 py-1 leading-none min-w-[4ch] justify-center">
                      数量
                    </span>
                  </th>
                  <th className="text-left font-semibold px-2 py-2">获得的物品</th>
                  <th className="text-center font-semibold px-2 py-2">
                    <span className="inline-flex items-center justify-center rounded-md border border-slate-500 px-1 py-1 leading-none min-w-[4ch] justify-center">
                      数量
                    </span>
                  </th>
                </tr>
              </thead>

              <tbody className="bg-white text-gray-800">
                {trades.length > 0 ? (
                  trades.map((t, idx) => {
                    const offers = t.offers.length > 0 ? t.offers : ([null] as any[]);
                    const receives = t.receives.length > 0 ? t.receives : ([null] as any[]);
                    const lines = Math.max(offers.length, receives.length);

                    const renderQty = (v: any) => {
                      const s = String(v ?? '').trim();
                      const empty = !s;
                      return (
                        <div
                          className={[
                            'h-[42px] w-full rounded-xl bg-black/5',
                            'flex items-center justify-center tabular-nums',
                            empty ? 'text-gray-400' : 'text-gray-900',
                          ].join(' ')}
                        >
                          {empty ? '—' : s}
                        </div>
                      );
                    };

                    const renderEmptyItem = () => (
                      <div className="h-[42px] w-full flex items-center justify-center text-gray-400">—</div>
                    );

                    return (
                      <>
                        {Array.from({ length: lines }).map((_, li) => {
                          const o = offers[li] ?? null;
                          const r = receives[li] ?? null;
                          return (
                            <tr key={`${t.key}-${idx}-line-${li}`} className={li === 0 ? 'border-t border-black/10' : ''}>
                              <td className="px-2 py-2 align-middle">
                                <div className="min-w-0" style={{ maxWidth: 'calc(42px + 10ch + 24px)' }}>
                                  {o ? <TrpItemLine item={o} /> : renderEmptyItem()}
                                </div>
                              </td>
                              <td className="px-2 py-2 align-middle text-center">{renderQty(o?.Count)}</td>
                              <td className="px-2 py-2 align-middle">
                                <div className="min-w-0" style={{ maxWidth: 'calc(42px + 10ch + 24px)' }}>
                                  {r ? <TrpItemLine item={r} /> : renderEmptyItem()}
                                </div>
                              </td>
                              <td className="px-2 py-2 align-middle text-center">{renderQty(r?.Count)}</td>
                            </tr>
                          );
                        })}

                        {nonEmpty(t.note) ? (
                          <tr key={`${t.key}-${idx}-note`} className="border-b border-black/10">
                            <td colSpan={4} className="px-2 pb-3 -mt-1 text-[11px] text-gray-600 break-words whitespace-pre-wrap">
                              <div className="flex items-stretch gap-2">
                                <div className="w-[3px] rounded bg-black/20" />
                                <div className="min-w-0">{t.note}</div>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr key={`${t.key}-${idx}-sp`} className="border-b border-black/10">
                            <td colSpan={4} className="h-2" />
                          </tr>
                        )}
                      </>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-[11px] text-gray-500">
                      （未找到 Trade 列表）
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
