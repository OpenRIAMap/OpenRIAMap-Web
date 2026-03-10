import { useMemo } from 'react';

import AppButton from '@/components/ui/AppButton';

type TradeItem = {
  Name?: string;
  Img?: string;
  Count?: any;
  ItemID?: string;
  Brief?: string;
};

export type TradeGroup = {
  TradeNum?: number;
  Note?: string;
  OfferItems?: TradeItem[];
  ReceiveItems?: TradeItem[];
};

export type Props = {
  value: TradeGroup[] | undefined;
  onChange: (v: TradeGroup[]) => void;
};

function ensureTradeItem(): TradeItem {
  return { Name: '', Img: '', Count: '1', ItemID: '', Brief: '' };
}

function ensureGroup(idx: number, g?: TradeGroup): TradeGroup {
  const tradeNum = Number.isFinite(g?.TradeNum as any) ? Number(g?.TradeNum) : idx + 1;
  const offers = Array.isArray(g?.OfferItems) && g!.OfferItems!.length > 0 ? g!.OfferItems! : [ensureTradeItem()];
  const receives = Array.isArray(g?.ReceiveItems) && g!.ReceiveItems!.length > 0 ? g!.ReceiveItems! : [ensureTradeItem()];
  return {
    TradeNum: tradeNum,
    Note: String(g?.Note ?? ''),
    OfferItems: offers,
    ReceiveItems: receives,
  };
}

export default function TRPTradeEditor(props: Props) {
  const { value, onChange } = props;

  const groups = useMemo(() => {
    const arr = Array.isArray(value) ? value : [];
    const normalized = arr.map((g, i) => ensureGroup(i, g));
    return normalized.length > 0 ? normalized : [ensureGroup(0, undefined)];
  }, [value]);

  const setGroups = (next: TradeGroup[]) => {
    // ensure at least 1
    const arr = next.length > 0 ? next : [ensureGroup(0, undefined)];
    // re-number defaults if missing
    onChange(arr.map((g, i) => ensureGroup(i, g)));
  };

  const addGroup = () => setGroups([...groups, ensureGroup(groups.length, undefined)]);
  const removeGroup = (idx: number) => {
    if (groups.length <= 1) return;
    setGroups(groups.filter((_, i) => i !== idx));
  };

  const updateGroup = (idx: number, patch: Partial<TradeGroup>) => {
    const next = [...groups];
    next[idx] = { ...next[idx], ...patch };
    setGroups(next);
  };

  const updateItem = (
    gIdx: number,
    side: 'OfferItems' | 'ReceiveItems',
    iIdx: number,
    patch: Partial<TradeItem>,
  ) => {
    const next = [...groups];
    const g = ensureGroup(gIdx, next[gIdx]);
    const list = [...(g[side] ?? [])];
    list[iIdx] = { ...(list[iIdx] ?? ensureTradeItem()), ...patch };
    next[gIdx] = { ...g, [side]: list };
    setGroups(next);
  };

  const addItem = (gIdx: number, side: 'OfferItems' | 'ReceiveItems') => {
    const g = ensureGroup(gIdx, groups[gIdx]);
    const list = [...(g[side] ?? [])];
    list.push(ensureTradeItem());
    updateGroup(gIdx, { [side]: list } as any);
  };

  const removeItem = (gIdx: number, side: 'OfferItems' | 'ReceiveItems', iIdx: number) => {
    const g = ensureGroup(gIdx, groups[gIdx]);
    const list = [...(g[side] ?? [])];
    if (list.length <= 1) return; // keep 1
    list.splice(iIdx, 1);
    updateGroup(gIdx, { [side]: list } as any);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold">交易列表（Trade）</div>
        <AppButton
          type="button"
          className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100"
          onClick={addGroup}
        >
          添加交易
        </AppButton>
      </div>

      {groups.map((g, gi) => (
        <div key={gi} className="border border-gray-200 rounded p-2 bg-white space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold">交易条目 #{gi + 1}</div>
            {groups.length > 1 ? (
              <AppButton
                type="button"
                className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100"
                onClick={() => removeGroup(gi)}
              >
                删除交易
              </AppButton>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <div className="text-xs opacity-80 mb-1">交易列表中编号 (TradeNum，必填)</div>
              <input
                type="number"
                className="w-full border p-1 rounded"
                value={String(g.TradeNum ?? gi + 1)}
                onChange={(e) => updateGroup(gi, { TradeNum: Number(e.target.value || gi + 1) })}
              />
            </div>
          </div>

          <div>
            <div className="text-xs opacity-80 mb-1">备注 (Note，可选)</div>
            <textarea
              className="w-full border p-1 rounded"
              rows={3}
              placeholder="支持换行"
              value={String(g.Note ?? '')}
              onChange={(e) => updateGroup(gi, { Note: e.target.value })}
            />
          </div>

          {/* Offer */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold">提供物品（OfferItems）</div>
              <AppButton
                type="button"
                className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100"
                onClick={() => addItem(gi, 'OfferItems')}
              >
                添加提供物品
              </AppButton>
            </div>

            {(g.OfferItems ?? []).map((it, ii) => (
              <div key={ii} className="border border-gray-200 rounded p-2 bg-white space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold">提供物品 #{ii + 1}</div>
                  {(g.OfferItems?.length ?? 0) > 1 ? (
                    <AppButton
                      type="button"
                      className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100"
                      onClick={() => removeItem(gi, 'OfferItems', ii)}
                    >
                      删除
                    </AppButton>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs opacity-80 mb-1">物品名称（必填）</div>
                    <input
                      type="text"
                      className="w-full border p-1 rounded"
                      value={String(it?.Name ?? '')}
                      onChange={(e) => updateItem(gi, 'OfferItems', ii, { Name: e.target.value })}
                    />
                  </div>
                  <div>
                    <div className="text-xs opacity-80 mb-1">数量（必填）</div>
                    <input
                      type="number"
                      className="w-full border p-1 rounded"
                      value={String(it?.Count ?? '')}
                      onChange={(e) => updateItem(gi, 'OfferItems', ii, { Count: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <div className="text-xs opacity-80 mb-1">图像 (Img，可选，直接保存 URL/本地路径)</div>
                  <input
                    type="text"
                    className="w-full border p-1 rounded"
                    placeholder="例如：https://... 或 /items/xxx.png"
                    value={String(it?.Img ?? '')}
                    onChange={(e) => updateItem(gi, 'OfferItems', ii, { Img: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs opacity-80 mb-1">物品ID（可选）</div>
                    <input
                      type="text"
                      className="w-full border p-1 rounded"
                      value={String(it?.ItemID ?? '')}
                      onChange={(e) => updateItem(gi, 'OfferItems', ii, { ItemID: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <div className="text-xs opacity-80 mb-1">简介（可选，可换行）</div>
                  <textarea
                    className="w-full border p-1 rounded"
                    rows={4}
                    value={String(it?.Brief ?? '')}
                    onChange={(e) => updateItem(gi, 'OfferItems', ii, { Brief: e.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Receive */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold">获得物品（ReceiveItems）</div>
              <AppButton
                type="button"
                className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100"
                onClick={() => addItem(gi, 'ReceiveItems')}
              >
                添加获得物品
              </AppButton>
            </div>

            {(g.ReceiveItems ?? []).map((it, ii) => (
              <div key={ii} className="border border-gray-200 rounded p-2 bg-white space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold">获得物品 #{ii + 1}</div>
                  {(g.ReceiveItems?.length ?? 0) > 1 ? (
                    <AppButton
                      type="button"
                      className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100"
                      onClick={() => removeItem(gi, 'ReceiveItems', ii)}
                    >
                      删除
                    </AppButton>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs opacity-80 mb-1">物品名称（必填）</div>
                    <input
                      type="text"
                      className="w-full border p-1 rounded"
                      value={String(it?.Name ?? '')}
                      onChange={(e) => updateItem(gi, 'ReceiveItems', ii, { Name: e.target.value })}
                    />
                  </div>
                  <div>
                    <div className="text-xs opacity-80 mb-1">数量（必填）</div>
                    <input
                      type="number"
                      className="w-full border p-1 rounded"
                      value={String(it?.Count ?? '')}
                      onChange={(e) => updateItem(gi, 'ReceiveItems', ii, { Count: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <div className="text-xs opacity-80 mb-1">图像 (Img，可选，直接保存 URL/本地路径)</div>
                  <input
                    type="text"
                    className="w-full border p-1 rounded"
                    placeholder="例如：https://... 或 /items/xxx.png"
                    value={String(it?.Img ?? '')}
                    onChange={(e) => updateItem(gi, 'ReceiveItems', ii, { Img: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs opacity-80 mb-1">物品ID（可选）</div>
                    <input
                      type="text"
                      className="w-full border p-1 rounded"
                      value={String(it?.ItemID ?? '')}
                      onChange={(e) => updateItem(gi, 'ReceiveItems', ii, { ItemID: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <div className="text-xs opacity-80 mb-1">简介（可选，可换行）</div>
                  <textarea
                    className="w-full border p-1 rounded"
                    rows={4}
                    value={String(it?.Brief ?? '')}
                    onChange={(e) => updateItem(gi, 'ReceiveItems', ii, { Brief: e.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
