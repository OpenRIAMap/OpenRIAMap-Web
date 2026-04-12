// File: src/components/Mapping/Workflow/TradePointWorkflow.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkflowComponentProps, WorldPoint } from './WorkflowHost';
import AppButton from '@/components/ui/AppButton';
import { EXT_VALUE_TYPE_TEXT, listCatalogClassOptions, type FeatureKey } from '@/components/Common/featureFormats';
import WorkflowFeatureSearchSelect, { type SearchSelectConfig } from './WorkflowFeatureSearchSelect';

/**
 * TradePointWorkflow（工作流：交易点）
 *
 * 结构对齐 NaturalLandWorkflow（多页表单 + 绘制并写入固定图层），并借鉴 TeleportPointWorkflow 的“粗检索选择”交互。
 *
 * 页面：
 * 1) 填写者信息（CreateBy）
 * 2) 信息填写（Kind/SKind + 名称/简称 + 归属单元/聚落/wiki/交互方式 + Brief）
 * 3) Trade 信息填写（Trade 组；OfferItems/ReceiveItems 子组）
 * 4) 交易点点坐标（point；写入 coordinate + elevation）
 */

type Step = 'creator' | 'info' | 'trade' | 'point';

type InfoForm = {
  typeKey: string; // `${kind}|${skind}`
  name: string;
  abbr: string;

  landId?: string;
  uadmId?: string;
  uadmgId?: string;

  wiki?: string;
  interaction?: string;
  situation?: string;

  brief?: string;
};

type TradeItem = {
  Name: string;
  Img?: string;
  Count: string; // 以字符串存储，提交时转 number
  ItemID?: string;
  Brief?: string;

  // UI 辅助：Img 输入与选择
  ImgText?: string;
};

type TradeGroup = {
  TradeNum: number;
  Note?: string;
  OfferItems: TradeItem[];
  ReceiveItems: TradeItem[];
};

const WORLD_ID_TO_CODE: Record<string, number> = {
  zth: 0,
  naraku: 1,
  houtu: 2,
  eden: 3,
  laputa: 4,
  yunduan: 5,
};

const WORLD_CODE_TO_PREFIX: Record<number, string> = {
  0: 'Z',
  1: 'N',
  2: 'H',
  3: 'E',
  4: 'L',
  5: 'Y',
};

function resolveWorldPrefix(worldIdRaw: string): string {
  const w = String(worldIdRaw ?? '').trim();
  if (!w) return 'Z';

  const asNum = Number(w);
  if (Number.isFinite(asNum) && WORLD_CODE_TO_PREFIX[asNum as any]) return WORLD_CODE_TO_PREFIX[asNum];

  const code = WORLD_ID_TO_CODE[w];
  if (Number.isFinite(code)) return WORLD_CODE_TO_PREFIX[code];

  if (/^[ZNHELY]$/i.test(w)) return w.toUpperCase();
  return 'Z';
}

function nonEmpty(s: any) {
  return String(s ?? '').trim().length > 0;
}

function normalizeAbbr(raw: string) {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9_-]/g, '');
}

function firstPointOnly(pts: WorldPoint[]) {
  if (!Array.isArray(pts) || pts.length < 1) return [];
  const p0 = pts[pts.length - 1];
  return [{ x: p0.x, z: p0.z, y: p0.y }];
}

function toNumOrEmpty(raw: string) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const n = Number(s);
  return Number.isFinite(n) ? n : '';
}

type TopNavProps = {
  title: string;
  showPrev?: boolean;
  showNext?: boolean;
  showExit?: boolean;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onExit?: () => void;
};

function TopNav(props: TopNavProps) {
  const { title, showPrev, showNext, showExit, prevDisabled, nextDisabled, onPrev, onNext, onExit } = props;
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <div className="text-sm font-semibold">{title}</div>
      <div className="flex items-center gap-2">
        {showExit ? (
          <AppButton
            className="px-3 py-1.5 rounded text-sm border border-gray-300 bg-white text-gray-900 hover:bg-gray-100"
            type="button"
            onClick={onExit}
          >
            返回
          </AppButton>
        ) : null}
        {showPrev ? (
          <AppButton
            className={`px-3 py-1.5 rounded text-sm border border-gray-300 bg-white text-gray-900 ${
              prevDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'
            }`}
            disabled={!!prevDisabled}
            onClick={onPrev}
            type="button"
          >
            上一步
          </AppButton>
        ) : null}
        {showNext ? (
          <AppButton
            className={`px-3 py-1.5 rounded text-sm border border-gray-300 bg-white text-gray-900 ${
              nextDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'
            }`}
            disabled={!!nextDisabled}
            onClick={onNext}
            type="button"
          >
            下一步
          </AppButton>
        ) : null}
      </div>
    </div>
  );
}

type LabeledInputProps = {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  type?: 'text' | 'number';
};

function LabeledInput(props: LabeledInputProps) {
  const { label, value, placeholder, onChange, type = 'text' } = props;
  return (
    <label className="block space-y-1">
      <div className="text-xs opacity-80">{label}</div>
      <input
        type={type}
        className="w-full border p-1 rounded text-sm"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onMouseDownCapture={(e) => e.stopPropagation()}
        onPointerDownCapture={(e) => e.stopPropagation()}
        onTouchStartCapture={(e) => e.stopPropagation()}
      />
    </label>
  );
}

type LabeledTextareaProps = {
  label: string;
  value: string;
  placeholder?: string;
  rows?: number;
  onChange: (v: string) => void;
};

function LabeledTextarea(props: LabeledTextareaProps) {
  const { label, value, placeholder, rows, onChange } = props;
  return (
    <label className="block space-y-1">
      <div className="text-xs opacity-80">{label}</div>
      <textarea
        className="w-full border p-1 rounded text-sm min-h-[80px]"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onMouseDownCapture={(e) => e.stopPropagation()}
        onPointerDownCapture={(e) => e.stopPropagation()}
        onTouchStartCapture={(e) => e.stopPropagation()}
      />
    </label>
  );
}

type ImgOption = { key: string; value: string; label: string };
const IMG_OPTIONS: ImgOption[] = [];

function matchImg(o: ImgOption, q: string) {
  const s = q.toLowerCase();
  return o.key.toLowerCase().includes(s) || o.value.toLowerCase().includes(s) || o.label.toLowerCase().includes(s);
}

function isDirectImgPath(v: string): boolean {
  const s = String(v ?? '').trim();
  if (!s) return false;
  return /^https?:\/\//i.test(s);
}

function ensureTradeItem(): TradeItem {
  return { Name: '', Img: '', ImgText: '', Count: '1', ItemID: '', Brief: '' };
}

export default function TradePointWorkflow(props: WorkflowComponentProps) {
  const { bridge } = props;

  const bridgeRef = useRef(bridge);
  useEffect(() => {
    bridgeRef.current = bridge;
  }, [bridge]);

  const [step, setStep] = useState<Step>('creator');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const worldId = bridge.getCurrentWorldId?.() ?? 'zth';
  const worldPrefix = useMemo(() => resolveWorldPrefix(worldId), [worldId]);

  // Page 1
  const [creatorId, setCreatorId] = useState<string>(() => (bridgeRef.current.getEditorId?.() ?? '').trim());

  // Page 2
  const [info, setInfo] = useState<InfoForm>({
    typeKey: '',
    name: '',
    abbr: '',
    landId: '',
    uadmId: '',
    uadmgId: '',
    wiki: '',
    interaction: '',
    situation: '',
    brief: '',
  });

  const [tradeGroups, setTradeGroups] = useState<TradeGroup[]>(() => [
    {
      TradeNum: 1,
      Note: '',
      OfferItems: [ensureTradeItem()],
      ReceiveItems: [ensureTradeItem()],
    },
  ]);

  // Page 4
  const [elevInput, setElevInput] = useState('');

  // 关键修复点：绘制页不要 useMemo 缓存草稿点序，直接读取 bridge.getTempPoints()
  const draftPoint: WorldPoint[] = step === 'point' ? (bridge.getTempPoints?.() ?? []) : [];

  const typeOptions = useMemo(() => listCatalogClassOptions({ classCode: 'TRP', geom: '点' }), []);

  // ===== 可复用“粗检索选择”配置（仅作为参数块；运行期 worldId/数据池仍在组件内部） =====
  const readFirst = (fi: any, keys: string[]) => {
    for (const k of keys) {
      const v = fi?.[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
    }
    return '';
  };

  const matchAllowed = (fi: any, keys: string[], allowed: string[]) => {
    const v = readFirst(fi, keys);
    if (!v) return false;
    return allowed.includes(v);
  };

  const landUnitSearchCfg: SearchSelectConfig = useMemo(
    () => ({
      cacheKey: 'trp_land',
      filter: (fi) =>
        fi?.Class === 'ISG' &&
        matchAllowed(fi, ['Kind'], ['NGF']) &&
        matchAllowed(fi, ['SKind'], ['LAD', 'WTB']),
      // 新规范：所有要素 self 主键/主名均为 ID / Name
      getId: (fi) => readFirst(fi, ['ID']),
      getName: (fi) => readFirst(fi, ['Name']),
      formatOption: (name, id) => `${name}(${id})`,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const uadmLandmarkSearchCfg: SearchSelectConfig = useMemo(
    () => ({
      cacheKey: 'trp_uadm',
      filter: (fi) =>
        fi?.Class === 'ISP' &&
        matchAllowed(fi, ['Kind'], ['ADM']) &&
        matchAllowed(fi, ['SKind'], ['DBP']) &&
        matchAllowed(fi, ['SKind2'], ['SHR']),
      getId: (fi) => readFirst(fi, ['ID']),
      getName: (fi) => readFirst(fi, ['Name']),
      formatOption: (name, id) => `${name}(${id})`,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const uadmGSearchCfg: SearchSelectConfig = useMemo(
    () => ({
      cacheKey: 'trp_uadmg',
      filter: (fi) =>
        fi?.Class === 'ISG' &&
        matchAllowed(fi, ['Kind'], ['ADM']) &&
        matchAllowed(fi, ['SKind'], ['DBP', 'PLZ']),
      getId: (fi) => readFirst(fi, ['ID']),
      getName: (fi) => readFirst(fi, ['Name']),
      formatOption: (name, id) => `${name}(${id})`,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const selectedType = useMemo(() => {
    const [k, s] = String(info.typeKey ?? '').split('|');
    const kind = String(k ?? '').trim();
    const skind = String(s ?? '').trim();
    return typeOptions.find((o) => o.kind === kind && o.skind === skind) ?? null;
  }, [info.typeKey, typeOptions]);

  const abbrNormalized = useMemo(() => normalizeAbbr(info.abbr), [info.abbr]);

  const canGoNextFromCreator = useMemo(() => nonEmpty(creatorId), [creatorId]);
  const canGoNextFromInfo = useMemo(() => {
    return nonEmpty(creatorId) && nonEmpty(info.typeKey) && nonEmpty(info.name) && nonEmpty(abbrNormalized);
  }, [creatorId, info.typeKey, info.name, abbrNormalized]);

  const canGoNextFromTrade = useMemo(() => {
    if (!canGoNextFromInfo) return false;
    for (const tg of tradeGroups ?? []) {
      if (!Number.isFinite(tg.TradeNum)) return false;
      if (!Array.isArray(tg.OfferItems) || tg.OfferItems.length < 1) return false;
      if (!Array.isArray(tg.ReceiveItems) || tg.ReceiveItems.length < 1) return false;
      for (const it of tg.OfferItems) {
        if (!nonEmpty(it.Name)) return false;
        if (!nonEmpty(it.Count)) return false;
      }
      for (const it of tg.ReceiveItems) {
        if (!nonEmpty(it.Name)) return false;
        if (!nonEmpty(it.Count)) return false;
      }
    }
    return true;
  }, [tradeGroups, canGoNextFromInfo]);

  const hasDraftPoint = useMemo(() => Array.isArray(draftPoint) && draftPoint.length >= 1, [draftPoint.length]);
  const canCommit = useMemo(() => canGoNextFromTrade && hasDraftPoint && !saving, [canGoNextFromTrade, hasDraftPoint, saving]);

  useEffect(() => {
    if (nonEmpty(creatorId)) {
      bridgeRef.current.setEditorId?.(creatorId.trim());
    }

    if (step !== 'point') {
      bridgeRef.current.suspendDrawMode?.();
      setSaveError('');
      return;
    }

    bridgeRef.current.setDrawMode('point');
    setSaveError('');
  }, [step, creatorId]);

  useEffect(() => {
    if (step !== 'point') return;
    if (!Array.isArray(draftPoint)) return;
    if (draftPoint.length <= 1) return;
    bridgeRef.current.setTempPoints(firstPointOnly(draftPoint));
  }, [step, draftPoint.length]);

  const computedIdPreview = useMemo(() => {
    const kind = String(selectedType?.kind ?? '??');
    const skind = String(selectedType?.skind ?? '??');
    return `${worldPrefix}TRP${kind}${skind}_${abbrNormalized || '??'}`;
  }, [worldPrefix, selectedType, abbrNormalized]);

  const addTradeGroup = () => {
    setTradeGroups((prev) => {
      const nextNum = (prev?.length ?? 0) + 1;
      return [
        ...(prev ?? []),
        {
          TradeNum: nextNum,
          Note: '',
          OfferItems: [ensureTradeItem()],
          ReceiveItems: [ensureTradeItem()],
        },
      ];
    });
  };

  const commit = () => {
    if (!canCommit) return;
    setSaving(true);
    setSaveError('');

    try {
      const kind = String(selectedType?.kind ?? '').trim();
      const skind = String(selectedType?.skind ?? '').trim();
      const trpId = `${worldPrefix}TRP${kind}${skind}_${abbrNormalized}`;

      const p0 = firstPointOnly(draftPoint)[0];
      if (!p0) {
        setSaveError('未绘制点坐标');
        return;
      }

      const srcY = Number.isFinite(p0.y as any) ? Number(p0.y) : undefined;
      const elevation = srcY ?? (typeof toNumOrEmpty(elevInput) === 'number' ? (toNumOrEmpty(elevInput) as number) : undefined);

      const tags: Array<{ tagKey: string; tagValue: string }> = [];
      const land = String(info.landId ?? '').trim();
      const uadm = String(info.uadmId ?? '').trim();
      const uadmg = String(info.uadmgId ?? '').trim();
      if (land) tags.push({ tagKey: 'Land', tagValue: land });
      if (uadm) tags.push({ tagKey: 'UAdm', tagValue: uadm });
      if (uadmg) tags.push({ tagKey: 'UAdmG', tagValue: uadmg });

      const extensions: Array<{ extGroup: string; extKey: string; extType: any; extValue: string }> = [];
      const wiki = String(info.wiki ?? '').trim();
      if (wiki) extensions.push({ extGroup: 'link', extKey: 'wiki', extType: EXT_VALUE_TYPE_TEXT, extValue: wiki });

      const brief = String(info.brief ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
      if (brief) extensions.push({ extGroup: 'character', extKey: 'brief', extType: EXT_VALUE_TYPE_TEXT, extValue: brief });

      const trade = (tradeGroups ?? []).map((tg) => {
        const offer = (tg.OfferItems ?? []).map((it) => ({
          Name: String(it.Name ?? '').trim(),
          Img: String(it.Img ?? '').trim(),
          Count: toNumOrEmpty(it.Count) === '' ? 1 : toNumOrEmpty(it.Count),
          ItemID: String(it.ItemID ?? '').trim(),
          Brief: String(it.Brief ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
        }));
        const receive = (tg.ReceiveItems ?? []).map((it) => ({
          Name: String(it.Name ?? '').trim(),
          Img: String(it.Img ?? '').trim(),
          Count: toNumOrEmpty(it.Count) === '' ? 1 : toNumOrEmpty(it.Count),
          ItemID: String(it.ItemID ?? '').trim(),
          Brief: String(it.Brief ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
        }));
        const obj: any = {
          TradeNum: Number(tg.TradeNum),
          OfferItems: offer,
          ReceiveItems: receive,
        };
        const note = String(tg.Note ?? '').trim();
        if (note) obj.Note = note;
        return obj;
      });

      const res = bridgeRef.current.commitFeature({
        subType: '交易点' as FeatureKey,
        mode: 'point',
        coords: [{ x: p0.x, z: p0.z, y: p0.y }],
        editorId: creatorId.trim(),
        values: {
          // ===== New normalized self schema =====
          // self 主键/主名：ID / Name
          // 三元分类：Kind / SKind / SKind2
          // 其他外键字段保持原名（此处无外键）
          ID: trpId,
          Name: String(info.name ?? '').trim(),
          Kind: kind,
          SKind: skind,
          SKind2: '',
          Situation: String(info.situation ?? '').trim(),
          Interaction: String(info.interaction ?? '').trim(),
          elevation: elevation ?? '',
          Trade: trade,
        },
        groupInfo: { tags, extensions },
      });

      if (!res.ok) {
        setSaveError(res.error || '保存失败');
        return;
      }

      bridgeRef.current.clearTempPoints();
      bridgeRef.current.exitWorkflowToSelector();
    } catch (e: any) {
      setSaveError(String(e?.message ?? e ?? '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  // ===== Render =====
  if (step === 'creator') {
    return (
      <div className="p-3 rounded border border-gray-300 bg-white">
        <TopNav
          title="交易点：填写者"
          showExit
          showNext
          nextDisabled={!canGoNextFromCreator}
          onExit={() => bridgeRef.current.exitWorkflowToSelector()}
          onNext={() => {
            bridgeRef.current.setEditorId?.(creatorId.trim());
            setStep('info');
          }}
        />

        <div className="space-y-3">
          <LabeledInput label="填写者ID (CreateBy)" value={creatorId} placeholder="例如：yz1825" onChange={setCreatorId} />
          <div className="text-xs text-gray-600">此工作流用于快速建立交易点测试数据集。</div>
        </div>
      </div>
    );
  }

  if (step === 'info') {
    return (
      <div className="p-3 rounded border border-gray-300 bg-white">
        <TopNav
          title="交易点：信息填写"
          showPrev
          showNext
          prevDisabled={false}
          nextDisabled={!canGoNextFromInfo}
          onPrev={() => setStep('creator')}
          onNext={() => setStep('trade')}
        />

        <div className="space-y-3">
          <label className="block space-y-1">
            <div className="text-xs opacity-80">交易点种类（必填）</div>
            <select
              className="w-full border p-1 rounded text-sm"
              value={String(info.typeKey ?? '')}
              onChange={(e) => setInfo((p) => ({ ...p, typeKey: e.target.value }))}
              onMouseDownCapture={(e) => e.stopPropagation()}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onTouchStartCapture={(e) => e.stopPropagation()}
            >
              <option value="">请选择...</option>
              {typeOptions.map((o) => (
                <option key={`${o.kind}|${o.skind}`} value={`${o.kind}|${o.skind}`}>
                  {o.name}（{o.kind}/{o.skind}）
                </option>
              ))}
            </select>
          </label>

          <LabeledInput label="交易点名称（必填）" value={info.name} placeholder="例如：村民交易站" onChange={(v) => setInfo((p) => ({ ...p, name: v }))} />
          <LabeledInput label="字符简称（必填，用于ID）" value={info.abbr} placeholder="例如：VIL" onChange={(v) => setInfo((p) => ({ ...p, abbr: v }))} />

          <WorkflowFeatureSearchSelect
            bridge={bridgeRef.current}
            label="所属地理单元（可选，将写入 tags.Land）"
            placeholder="输入关键词检索：可匹配 Name / ID"
            value={String(info.landId ?? '')}
            config={landUnitSearchCfg}
            onChange={(v) => setInfo((p) => ({ ...p, landId: v }))}
          />

          <WorkflowFeatureSearchSelect
            bridge={bridgeRef.current}
            label="所属聚落(地标点)（可选，将写入 tags.UAdm）"
            placeholder="输入关键词检索：可匹配 Name / ID"
            value={String(info.uadmId ?? '')}
            config={uadmLandmarkSearchCfg}
            onChange={(v) => setInfo((p) => ({ ...p, uadmId: v }))}
          />

          <WorkflowFeatureSearchSelect
            bridge={bridgeRef.current}
            label="所属聚落(区划)（可选，将写入 tags.UAdmG）"
            placeholder="输入关键词检索：可匹配 Name / ID"
            value={String(info.uadmgId ?? '')}
            config={uadmGSearchCfg}
            onChange={(v) => setInfo((p) => ({ ...p, uadmgId: v }))}
          />

          <LabeledInput label="wiki链接（可选，将写入 extensions.link.wiki）" value={String(info.wiki ?? '')} placeholder="https://..." onChange={(v) => setInfo((p) => ({ ...p, wiki: v }))} />
          <LabeledInput label="交互方式（可选，将写入 Interaction）" value={String(info.interaction ?? '')} placeholder="例如：右键打开" onChange={(v) => setInfo((p) => ({ ...p, interaction: v }))} />
          <LabeledInput label="启用状况（可选，将写入 Situation）" value={String(info.situation ?? '')} placeholder="例如：Enable" onChange={(v) => setInfo((p) => ({ ...p, situation: v }))} />

          <LabeledTextarea
            label="简介（可选，将写入 extensions.character.brief）"
            value={String(info.brief ?? '')}
            placeholder="支持换行"
            onChange={(v) => setInfo((p) => ({ ...p, brief: v }))}
          />

          <div className="text-xs text-gray-600">
            生成 ID 规则：<span className="font-mono">{computedIdPreview}</span>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'trade') {
    return (
      <div className="p-3 rounded border border-gray-300 bg-white">
        <TopNav
          title="交易点：Trade 信息"
          showPrev
          showNext
          prevDisabled={false}
          nextDisabled={!canGoNextFromTrade}
          onPrev={() => setStep('info')}
          onNext={() => setStep('point')}
        />

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold">交易条目（Trade）</div>
            <AppButton
              type="button"
              className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100"
              onClick={addTradeGroup}
            >
              添加交易
            </AppButton>
          </div>

          {tradeGroups.map((tg, idx) => (
            <div key={idx} className="border border-gray-200 rounded p-2 bg-white space-y-2">
              <div className="text-xs font-semibold">交易条目 #{idx + 1}</div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <LabeledInput
                  label="交易列表中编号 (TradeNum，必填)"
                  value={String(tg.TradeNum)}
                  type="number"
                  onChange={(v) =>
                    setTradeGroups((p) => {
                      const next = [...p];
                      next[idx] = { ...next[idx], TradeNum: Number(v || next[idx].TradeNum) };
                      return next;
                    })
                  }
                />
              </div>

              <LabeledTextarea
                label="备注 (Note，可选)"
                value={String(tg.Note ?? '')}
                placeholder="支持换行"
                rows={3}
                onChange={(v) =>
                  setTradeGroups((p) => {
                    const next = [...p];
                    next[idx] = { ...next[idx], Note: v };
                    return next;
                  })
                }
              />

              {/* OfferItems */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold">提供物品（OfferItems）</div>
                  <AppButton
                    type="button"
                    className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100"
                    onClick={() =>
                      setTradeGroups((p) => {
                        const next = [...p];
                        const cur = next[idx];
                        next[idx] = { ...cur, OfferItems: [...(cur.OfferItems ?? []), ensureTradeItem()] };
                        return next;
                      })
                    }
                  >
                    添加提供物品
                  </AppButton>
                </div>

                {tg.OfferItems.map((it, j) => (
                  <div key={j} className="border border-gray-100 rounded p-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold">提供物品 #{j + 1}</div>
                      {j > 0 ? (
                        <AppButton
                          type="button"
                          className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100"
                          onClick={() =>
                            setTradeGroups((p) => {
                              const next = [...p];
                              const cur = next[idx];
                              next[idx] = { ...cur, OfferItems: (cur.OfferItems ?? []).filter((_, ii) => ii !== j) };
                              return next;
                            })
                          }
                        >
                          删除
                        </AppButton>
                      ) : null}
                    </div>

                    <LabeledInput
                      label="物品名称（必填）"
                      value={String(it.Name ?? '')}
                      onChange={(v) =>
                        setTradeGroups((p) => {
                          const next = [...p];
                          const cur = next[idx];
                          const items = [...(cur.OfferItems ?? [])];
                          items[j] = { ...items[j], Name: v };
                          next[idx] = { ...cur, OfferItems: items };
                          return next;
                        })
                      }
                    />

                    {/* Img coarse select */}
                    <div className="space-y-1">
                      <div className="text-xs opacity-80">图像（可选，仅支持 http/https 外部链接；其他输入将回退默认图标）</div>
                      <input
                        className="w-full border p-1 rounded text-sm"
                        value={String(it.ImgText ?? '')}
                        placeholder="输入外部图片链接（http/https）"
                        onChange={(e) => {
                          const v = e.target.value;
                          setTradeGroups((p) => {
                            const next = [...p];
                            const cur = next[idx];
                            const items = [...(cur.OfferItems ?? [])];
                            items[j] = { ...items[j], ImgText: v, Img: isDirectImgPath(v) ? v.trim() : '' };
                            next[idx] = { ...cur, OfferItems: items };
                            return next;
                          });
                        }}
                        onMouseDownCapture={(e) => e.stopPropagation()}
                        onPointerDownCapture={(e) => e.stopPropagation()}
                        onTouchStartCapture={(e) => e.stopPropagation()}
                      />
                      {String(it.ImgText ?? '').trim() ? (
                        (() => {
                          const q = String(it.ImgText ?? '').trim();
                          const list = IMG_OPTIONS.filter((o) => matchImg(o, q)).slice(0, 20);
                          return list.length ? (
                            <div className="border rounded bg-white max-h-40 overflow-auto">
                              {list.map((o) => (
                                <button
                                  key={`${o.key}-${o.value}`}
                                  type="button"
                                  className="w-full text-left px-2 py-1 text-sm hover:bg-gray-50"
                                  onClick={() => {
                                    setTradeGroups((p) => {
                                      const next = [...p];
                                      const cur = next[idx];
                                      const items = [...(cur.OfferItems ?? [])];
                                      items[j] = { ...items[j], ImgText: o.label, Img: o.value };
                                      next[idx] = { ...cur, OfferItems: items };
                                      return next;
                                    });
                                  }}
                                >
                                  {o.key}(<span className="font-mono">{o.value}</span>)
                                </button>
                              ))}
                            </div>
                          ) : null;
                        })()
                      ) : null}
                      {nonEmpty(it.Img) ? (
                        <div className="text-xs text-gray-600">
                          已选择：<span className="font-mono">{String(it.Img)}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <LabeledInput
                        label="数量（必填）"
                        value={String(it.Count ?? '')}
                        type="number"
                        onChange={(v) =>
                          setTradeGroups((p) => {
                            const next = [...p];
                            const cur = next[idx];
                            const items = [...(cur.OfferItems ?? [])];
                            items[j] = { ...items[j], Count: v };
                            next[idx] = { ...cur, OfferItems: items };
                            return next;
                          })
                        }
                      />
                      <LabeledInput
                        label="物品ID（可选）"
                        value={String(it.ItemID ?? '')}
                        placeholder="minecraft:xxx"
                        onChange={(v) =>
                          setTradeGroups((p) => {
                            const next = [...p];
                            const cur = next[idx];
                            const items = [...(cur.OfferItems ?? [])];
                            items[j] = { ...items[j], ItemID: v };
                            next[idx] = { ...cur, OfferItems: items };
                            return next;
                          })
                        }
                      />
                    </div>
                    <LabeledTextarea
                      label="简介（可选）"
                      value={String(it.Brief ?? '')}
                      placeholder="支持换行"
                      onChange={(v) =>
                        setTradeGroups((p) => {
                          const next = [...p];
                          const cur = next[idx];
                          const items = [...(cur.OfferItems ?? [])];
                          items[j] = { ...items[j], Brief: v };
                          next[idx] = { ...cur, OfferItems: items };
                          return next;
                        })
                      }
                    />
                  </div>
                ))}
              </div>

              {/* ReceiveItems */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold">获得物品（ReceiveItems）</div>
                  <AppButton
                    type="button"
                    className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100"
                    onClick={() =>
                      setTradeGroups((p) => {
                        const next = [...p];
                        const cur = next[idx];
                        next[idx] = { ...cur, ReceiveItems: [...(cur.ReceiveItems ?? []), ensureTradeItem()] };
                        return next;
                      })
                    }
                  >
                    添加获得物品
                  </AppButton>
                </div>

                {tg.ReceiveItems.map((it, j) => (
                  <div key={j} className="border border-gray-100 rounded p-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold">获得物品 #{j + 1}</div>
                      {j > 0 ? (
                        <AppButton
                          type="button"
                          className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100"
                          onClick={() =>
                            setTradeGroups((p) => {
                              const next = [...p];
                              const cur = next[idx];
                              next[idx] = { ...cur, ReceiveItems: (cur.ReceiveItems ?? []).filter((_, ii) => ii !== j) };
                              return next;
                            })
                          }
                        >
                          删除
                        </AppButton>
                      ) : null}
                    </div>

                    <LabeledInput
                      label="物品名称（必填）"
                      value={String(it.Name ?? '')}
                      onChange={(v) =>
                        setTradeGroups((p) => {
                          const next = [...p];
                          const cur = next[idx];
                          const items = [...(cur.ReceiveItems ?? [])];
                          items[j] = { ...items[j], Name: v };
                          next[idx] = { ...cur, ReceiveItems: items };
                          return next;
                        })
                      }
                    />

                    {/* Img coarse select */}
                    <div className="space-y-1">
                      <div className="text-xs opacity-80">图像（可选，仅支持 http/https 外部链接；其他输入将回退默认图标）</div>
                      <input
                        className="w-full border p-1 rounded text-sm"
                        value={String(it.ImgText ?? '')}
                        placeholder="输入外部图片链接（http/https）"
                        onChange={(e) => {
                          const v = e.target.value;
                          setTradeGroups((p) => {
                            const next = [...p];
                            const cur = next[idx];
                            const items = [...(cur.ReceiveItems ?? [])];
                            items[j] = { ...items[j], ImgText: v, Img: isDirectImgPath(v) ? v.trim() : '' };
                            next[idx] = { ...cur, ReceiveItems: items };
                            return next;
                          });
                        }}
                        onMouseDownCapture={(e) => e.stopPropagation()}
                        onPointerDownCapture={(e) => e.stopPropagation()}
                        onTouchStartCapture={(e) => e.stopPropagation()}
                      />
                      {String(it.ImgText ?? '').trim() ? (
                        (() => {
                          const q = String(it.ImgText ?? '').trim();
                          const list = IMG_OPTIONS.filter((o) => matchImg(o, q)).slice(0, 20);
                          return list.length ? (
                            <div className="border rounded bg-white max-h-40 overflow-auto">
                              {list.map((o) => (
                                <button
                                  key={`${o.key}-${o.value}`}
                                  type="button"
                                  className="w-full text-left px-2 py-1 text-sm hover:bg-gray-50"
                                  onClick={() => {
                                    setTradeGroups((p) => {
                                      const next = [...p];
                                      const cur = next[idx];
                                      const items = [...(cur.ReceiveItems ?? [])];
                                      items[j] = { ...items[j], ImgText: o.label, Img: o.value };
                                      next[idx] = { ...cur, ReceiveItems: items };
                                      return next;
                                    });
                                  }}
                                >
                                  {o.key}(<span className="font-mono">{o.value}</span>)
                                </button>
                              ))}
                            </div>
                          ) : null;
                        })()
                      ) : null}
                      {nonEmpty(it.Img) ? (
                        <div className="text-xs text-gray-600">
                          已选择：<span className="font-mono">{String(it.Img)}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <LabeledInput
                        label="数量（必填）"
                        value={String(it.Count ?? '')}
                        type="number"
                        onChange={(v) =>
                          setTradeGroups((p) => {
                            const next = [...p];
                            const cur = next[idx];
                            const items = [...(cur.ReceiveItems ?? [])];
                            items[j] = { ...items[j], Count: v };
                            next[idx] = { ...cur, ReceiveItems: items };
                            return next;
                          })
                        }
                      />
                      <LabeledInput
                        label="物品ID（可选）"
                        value={String(it.ItemID ?? '')}
                        placeholder="minecraft:xxx"
                        onChange={(v) =>
                          setTradeGroups((p) => {
                            const next = [...p];
                            const cur = next[idx];
                            const items = [...(cur.ReceiveItems ?? [])];
                            items[j] = { ...items[j], ItemID: v };
                            next[idx] = { ...cur, ReceiveItems: items };
                            return next;
                          })
                        }
                      />
                    </div>
                    <LabeledTextarea
                      label="简介（可选）"
                      value={String(it.Brief ?? '')}
                      placeholder="支持换行"
                      onChange={(v) =>
                        setTradeGroups((p) => {
                          const next = [...p];
                          const cur = next[idx];
                          const items = [...(cur.ReceiveItems ?? [])];
                          items[j] = { ...items[j], Brief: v };
                          next[idx] = { ...cur, ReceiveItems: items };
                          return next;
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // point step
  const p0 = firstPointOnly(draftPoint)[0];
  return (
    <div className="p-3 rounded border border-gray-300 bg-white">
      <TopNav
        title="交易点：交易点点坐标"
        showPrev
        showNext
        prevDisabled={false}
        nextDisabled={!canCommit}
        onPrev={() => setStep('trade')}
        onNext={commit}
      />

      <div className="space-y-2">
        <div className="text-xs text-gray-600">请在地图上点选交易点坐标。</div>
        <LabeledInput
          label="高度值（可选，将写入 elevation；若点坐标含 y，则优先使用 y）"
          value={elevInput}
          type="number"
          placeholder="例如：64"
          onChange={setElevInput}
        />

        {p0 ? (
          <div className="text-xs text-gray-600">
            当前点：x=<span className="font-mono">{p0.x}</span> z=<span className="font-mono">{p0.z}</span> y=<span className="font-mono">{String(p0.y ?? '')}</span>
          </div>
        ) : null}

        {saveError ? <div className="text-xs text-rose-600">{saveError}</div> : null}
      </div>
    </div>
  );
}
