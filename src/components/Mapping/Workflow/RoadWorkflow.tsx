// File: src/components/Mapping/Workflow/RoadWorkflow.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkflowComponentProps, WorldPoint } from './WorkflowHost';
import AppButton from '@/components/ui/AppButton';
import {
  EXT_VALUE_TYPE_TEXT,
  type ExtValueType,
  EXT_VALUE_TYPE_OPTIONS,
  listCatalogClassOptions,
} from '@/components/Mapping/featureFormats';
import WorkflowFeatureSearchSelect, { type SearchSelectConfig } from './WorkflowFeatureSearchSelect';

/**
 * RoadWorkflow（工作流：道路）
 *
 * 页面结构（与 NaturalLandSurfaceWorkflow 同一风格）：
 * 1) 填写者信息（CreateBy）
 * 2) 信息填写（类型下拉 + 道路层级/是否单向/限速 + 名称/简称/命名者/wiki + extensions）
 * 3) 绘制道路（polyline）：完成后写入固定图层，并退出回到快捷测绘主页面
 */

type Step = 'creator' | 'info' | 'draw';

type InfoForm = {
  // 目录类型（ROD）
  kind: string;
  skind: string;
  skind2: string;

  name: string;
  abbr: string;
  nomenclator: string;
  wiki?: string;

  // tags (可选)
  land?: string; // tags.Land
  uadm?: string; // tags.UAdm
  uadmg?: string; // tags.UAdmG

  // Road specific
  level: number; // [-10,10]
  oneway: boolean;
  enter: boolean;
  exit: boolean;
  selfJunction: boolean;
  speed: string; // optional float input
};

type ConnectLItem = {
  mode: 'endpoint' | 'middle';
  tgt: string;
};

type BlacklistItem = {
  tgt: string;
};

type ExtensionItem = {
  extGroup: string;
  extKey: string;
  extType: ExtValueType;
  extValue: string;
};

// 与其他工作流一致的 World 前缀映射
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
  if (Number.isFinite(asNum) && WORLD_CODE_TO_PREFIX[asNum as any]) return WORLD_CODE_TO_PREFIX[asNum as any];

  const code = WORLD_ID_TO_CODE[w];
  if (Number.isFinite(code)) return WORLD_CODE_TO_PREFIX[code];

  if (/^[ZNHELY]$/i.test(w)) return w.toUpperCase();

  return 'Z';
}

function nonEmpty(s: string) {
  return String(s ?? '').trim().length > 0;
}

function normalizeAbbr(raw: string) {
  // ID 片段：保守收敛为 [A-Za-z0-9_-]
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9_-]/g, '');
}

type TopNavProps = {
  title: string;
  showPrev?: boolean;
  showNext?: boolean;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
};

function TopNav(props: TopNavProps) {
  const { title, showPrev, showNext, prevDisabled, nextDisabled, onPrev, onNext } = props;
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <div className="text-sm font-semibold">{title}</div>
      <div className="flex items-center gap-2">
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

/**
 * 注意：必须在组件外定义，避免父组件 re-render 时“组件类型变化”导致 input 被卸载重建。
 */
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

export default function RoadWorkflow(props: WorkflowComponentProps) {
  const { bridge } = props;

  const bridgeRef = useRef(bridge);
  useEffect(() => {
    bridgeRef.current = bridge;
  }, [bridge]);

  const [step, setStep] = useState<Step>('creator');

  // Page 1
  const [creatorId, setCreatorId] = useState<string>(() => (bridgeRef.current.getEditorId?.() ?? '').trim());

  // Page 2
  const [info, setInfo] = useState<InfoForm>({
    kind: 'NOM',
    skind: 'NOM',
    skind2: '',

    name: '',
    abbr: '',
    nomenclator: '',
    wiki: '',

    land: '',
    uadm: '',
    uadmg: '',

    level: 0,
    oneway: false,
    enter: true,
    exit: true,
    selfJunction: false,
    speed: '',
  });
  const [extItems, setExtItems] = useState<ExtensionItem[]>([]);

  // 显式连接关系（ConnectL）：初始为空，仅显示“+”按钮
  const [connectL, setConnectL] = useState<ConnectLItem[]>([]);
  // 黑名单（Blacklist）：初始为空，仅显示“+”按钮
  const [blacklist, setBlacklist] = useState<BlacklistItem[]>([]);

  // Page 3
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>('');

  const worldPrefix = useMemo(() => resolveWorldPrefix(bridge.getCurrentWorldId?.() ?? ''), [bridge]);

  const rodTypeOptions = useMemo(() => {
    // Class=ROD 下所有线要素（Kind/SKind）
    return listCatalogClassOptions({ classCode: 'ROD', geom: '线' });
  }, []);

  // ===== 复用检索组件：所属地理单元 / 所属聚落（与 TeleportPointWorkflow 一致） =====
  const landUnitSearchCfg: SearchSelectConfig = useMemo(
    () => ({
      cacheKey: 'ISG_NGF_LAD_WTB',
      filter: (fi: any) => {
        const cls = String(fi.Class ?? fi.class ?? '').trim();
        if (cls !== 'ISG') return false;
        const kind = String(fi.PGonKind ?? fi.Kind ?? fi?.tags?.PGonKind ?? fi?.tags?.Kind ?? '').trim();
        const skind = String(fi.PGonSKind ?? fi.SKind ?? fi?.tags?.PGonSKind ?? fi?.tags?.SKind ?? '').trim();
        return kind === 'NGF' && (skind === 'LAD' || skind === 'WTB');
      },
      getId: (fi: any) => String(fi.PGonID ?? fi.PgonID ?? fi.pgonID ?? '').trim(),
      getName: (fi: any) => String(fi.PGonName ?? fi.PgonName ?? fi.pgonName ?? '').trim(),
      formatOption: (name, id) => `${name}(${id})`,
    }),
    []
  );

  const uadmLandmarkSearchCfg: SearchSelectConfig = useMemo(
    () => ({
      cacheKey: 'ISP_ADM_DBP_SHR',
      filter: (fi: any) => {
        const cls = String(fi.Class ?? fi.class ?? '').trim();
        if (cls !== 'ISP') return false;
        const kind = String(fi.PointKind ?? fi.Kind ?? fi?.tags?.PointKind ?? fi?.tags?.Kind ?? '').trim();
        const skind = String(fi.PointSKind ?? fi.SKind ?? fi?.tags?.PointSKind ?? fi?.tags?.SKind ?? '').trim();
        const sk2 = String(fi.PointSKind2 ?? fi.SKind2 ?? fi?.tags?.PointSKind2 ?? fi?.tags?.SKind2 ?? '').trim();
        return kind === 'ADM' && skind === 'DBP' && sk2 === 'SHR';
      },
      getId: (fi: any) => String(fi.PointID ?? fi.pointID ?? '').trim(),
      getName: (fi: any) => String(fi.PointName ?? fi.pointName ?? '').trim(),
      formatOption: (name, id) => `${name}(${id})`,
    }),
    []
  );

  const uadmGSearchCfg: SearchSelectConfig = useMemo(
    () => ({
      cacheKey: 'ISG_ADM_DBP_PLZ',
      filter: (fi: any) => {
        const cls = String(fi.Class ?? fi.class ?? '').trim();
        if (cls !== 'ISG') return false;
        const kind = String(fi.PGonKind ?? fi.Kind ?? fi?.tags?.PGonKind ?? fi?.tags?.Kind ?? '').trim();
        const skind = String(fi.PGonSKind ?? fi.SKind ?? fi?.tags?.PGonSKind ?? fi?.tags?.SKind ?? '').trim();
        return kind === 'ADM' && (skind === 'DBP' || skind === 'PLZ');
      },
      getId: (fi: any) => String(fi.PGonID ?? fi.PgonID ?? fi.pgonID ?? '').trim(),
      getName: (fi: any) => String(fi.PGonName ?? fi.PgonName ?? fi.pgonName ?? '').trim(),
      formatOption: (name, id) => `${name}(${id})`,
    }),
    []
  );

  // ===== 复用检索组件：道路（Class=ROD） =====
  const roadSearchCfg: SearchSelectConfig = useMemo(
    () => ({
      cacheKey: 'ROD_ALL',
      filter: (fi: any) => String(fi.Class ?? fi.class ?? '').trim() === 'ROD',
      getId: (fi: any) => String(fi.ID ?? fi.id ?? '').trim(),
      getName: (fi: any) => String(fi.Name ?? fi.name ?? '').trim(),
      formatOption: (name, id) => `${name}(${id})`,
    }),
    []
  );

  // --------- step enter effects (draw mode) ----------
  useEffect(() => {
    // 同步 CreateBy
    if (nonEmpty(creatorId)) {
      bridgeRef.current.setEditorId(creatorId.trim());
    }

    if (step !== 'draw') {
      bridgeRef.current.setDrawMode('none');
      bridgeRef.current.clearTempPoints();
      setSaveError('');
      return;
    }

    // draw
    bridgeRef.current.setDrawMode('polyline');
  }, [step, creatorId]);

  const canGoNextFromCreator = useMemo(() => nonEmpty(creatorId), [creatorId]);

  const abbrNormalized = useMemo(() => normalizeAbbr(info.abbr), [info.abbr]);

  const canGoNextFromInfo = useMemo(() => {
    // 类型（Kind/SKind）+ Name/abbr/nomenclator + Level/Oneway
    if (!nonEmpty(info.kind) || !nonEmpty(info.skind)) return false;
    // nomenclator 改为可选（不再阻塞下一步）
    if (!nonEmpty(info.name) || !nonEmpty(abbrNormalized)) return false;
    if (!Number.isFinite(Number(info.level))) return false;
    // speed 可空；若填必须是 float
    const sp = String(info.speed ?? '').trim();
    if (sp && !Number.isFinite(Number(sp))) return false;
    return true;
  }, [info.kind, info.skind, info.name, abbrNormalized, info.level, info.speed]);

  // 绘制页：不缓存草稿点序，直接读取 bridge.getTempPoints()
  const draftLine: WorldPoint[] = step === 'draw' ? (bridge.getTempPoints?.() ?? []) : [];

  const canCommit = useMemo(() => {
    return canGoNextFromInfo && Array.isArray(draftLine) && draftLine.length >= 2 && !saving;
  }, [canGoNextFromInfo, draftLine.length, saving]);

  const addExtensionRow = () => {
    setExtItems((prev) => [...prev, { extGroup: '', extKey: '', extType: EXT_VALUE_TYPE_TEXT, extValue: '' }]);
  };

  const updateExtensionRow = (idx: number, patch: Partial<ExtensionItem>) => {
    setExtItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const removeExtensionRow = (idx: number) => {
    setExtItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCommit = async () => {
    if (!canCommit) return;
    setSaving(true);
    setSaveError('');

    try {
      const coords = bridgeRef.current.getTempPoints?.() ?? [];
      if (!Array.isArray(coords) || coords.length < 2) {
        setSaveError('草稿点不足（至少 2 点）');
        return;
      }

      // ---- ID 组合规则（按你要求）：World + ROD + Kind + SKind + SKind2(若有) + _ + abbr ----
      const kind = String(info.kind ?? '').trim();
      const skind = String(info.skind ?? '').trim();
      const skind2 = String(info.skind2 ?? '').trim();
      const id = `${worldPrefix}ROD${kind}${skind}${skind2 ? skind2 : ''}_${abbrNormalized}`;

      // extensions：
      // - link.wiki（若填写）
      // - 其他自定义 extensions
      const extList: Array<{ extGroup: string; extKey: string; extType: ExtValueType; extValue: string }> = [];
      const wiki = String(info.wiki ?? '').trim();
      if (wiki) {
        extList.push({ extGroup: 'link', extKey: 'wiki', extType: EXT_VALUE_TYPE_TEXT, extValue: wiki });
      }
      for (const it of extItems ?? []) {
        const g = String(it.extGroup ?? '').trim();
        const k = String(it.extKey ?? '').trim();
        if (!g || !k) continue;
        // 避免重复 link.wiki
        if (g === 'link' && k === 'wiki') continue;
        extList.push({
          extGroup: g,
          extKey: k,
          extType: (it.extType ?? EXT_VALUE_TYPE_TEXT) as ExtValueType,
          extValue: String(it.extValue ?? ''),
        });
      }

      // tags：nomenclator 改为可选（若填写则写入 tags.nomenclator）
      const tags: Array<{ tagKey: string; tagValue: string }> = [];
      const nom = String(info.nomenclator ?? '').trim();
      if (nom) tags.push({ tagKey: 'nomenclator', tagValue: nom });

      // 以下三个字段与传送点工作流一致：作为可选 tags 写入
      const land = String(info.land ?? '').trim();
      const uadm = String(info.uadm ?? '').trim();
      const uadmg = String(info.uadmg ?? '').trim();
      if (land) tags.push({ tagKey: 'Land', tagValue: land });
      if (uadm) tags.push({ tagKey: 'UAdm', tagValue: uadm });
      if (uadmg) tags.push({ tagKey: 'UAdmG', tagValue: uadmg });

      const level = Math.trunc(Number(info.level));
      const oneway = Boolean(info.oneway);
      const enter = typeof info.enter === 'boolean' ? Boolean(info.enter) : true;
      const exit = typeof info.exit === 'boolean' ? Boolean(info.exit) : true;
      const spRaw = String(info.speed ?? '').trim();
      const speed = spRaw ? Number(spRaw) : undefined;

      // ConnectL：仅保留合法条目（tgt 非空；mode 合法）
      const cl = (connectL ?? [])
        .map((it) => ({ mode: it?.mode, tgt: String(it?.tgt ?? '').trim() }))
        .filter((it) => (it.mode === 'endpoint' || it.mode === 'middle') && !!it.tgt);

      // Blacklist：仅保留非空 tgt
      const bl = (blacklist ?? [])
        .map((it) => ({ tgt: String(it?.tgt ?? '').trim() }))
        .filter((it) => !!it.tgt);

      const res = bridgeRef.current.commitFeature({
        subType: '道路',
        mode: 'polyline',
        coords,
        editorId: creatorId.trim(),
        values: {
          ID: id,
          Name: String(info.name ?? '').trim(),
          Kind: kind,
          SKind: skind,
          SKind2: skind2,
          Level: level,
          Oneway: oneway,
          Enter: enter,
          Exit: exit,
          SelfJunction: info.selfJunction,
          Speed: speed as any, // optional
        },
        groupInfo: {
          tags,
          extensions: extList.map((it) => ({
            extGroup: it.extGroup,
            extKey: it.extKey,
            extType: it.extType,
            extValue: it.extValue,
          })),
          // ConnectL：作为 groups.ConnectL 写入 featureFormats
          ...(cl.length ? { ConnectL: cl } : {}),
          // Blacklist：作为 groups.Blacklist 写入 featureFormats
          ...(bl.length ? { Blacklist: bl } : {}),
        },
      });

      if (!res.ok) {
        setSaveError(res.error || '保存失败');
        return;
      }

      // 清理草稿并返回快捷测绘主页面
      bridgeRef.current.clearTempPoints();
      bridgeRef.current.exitWorkflowToSelector();
    } catch (e: any) {
      setSaveError(String(e?.message ?? e ?? '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  // --------- render ----------
  if (step === 'creator') {
    return (
      <div className="p-3 rounded border border-gray-300 bg-white">
        <TopNav title="道路：填写者信息" showNext nextDisabled={!canGoNextFromCreator} onNext={() => setStep('info')} />

        <div className="space-y-2">
          <LabeledInput label="填写者ID（CreateBy）" value={creatorId} placeholder="例如：YZ1825" onChange={(v) => setCreatorId(v)} />
          <div className="text-xs text-gray-600">该字段将写入 CreateBy（系统字段），用于标识本次测绘的编辑者。</div>
        </div>
      </div>
    );
  }

  if (step === 'info') {
    return (
      <div className="p-3 rounded border border-gray-300 bg-white">
        <TopNav
          title="道路：信息填写"
          showPrev
          showNext
          prevDisabled={saving}
          nextDisabled={!canGoNextFromInfo}
          onPrev={() => setStep('creator')}
          onNext={() => setStep('draw')}
        />

        <div className="space-y-3">
          {/* 类型（Class=ROD） */}
          <label className="block space-y-1">
            <div className="text-xs opacity-80">道路类型（Class=ROD）</div>
            <select
              className="w-full border p-1 rounded text-sm"
              value={`${info.kind}/${info.skind}`}
              onChange={(e) => {
                const v = String(e.target.value ?? '');
                const [k, s] = v.split('/');
                setInfo((prev) => ({ ...prev, kind: (k ?? '').trim(), skind: (s ?? '').trim() }));
              }}
              onMouseDownCapture={(e) => e.stopPropagation()}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onTouchStartCapture={(e) => e.stopPropagation()}
            >
              {rodTypeOptions.map((o) => (
                <option key={`${o.kind}/${o.skind}`} value={`${o.kind}/${o.skind}`}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          {/* Road specific fields */}
          <div className="grid grid-cols-3 gap-2">
            <label className="block space-y-1">
              <div className="text-xs opacity-80">道路层级（Level，必选）</div>
              <select
                className="w-full border p-1 rounded text-sm"
                value={String(info.level)}
                onChange={(e) => setInfo((prev) => ({ ...prev, level: Number(e.target.value) }))}
                onMouseDownCapture={(e) => e.stopPropagation()}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onTouchStartCapture={(e) => e.stopPropagation()}
              >
                {Array.from({ length: 21 }).map((_, i) => {
                  const v = i - 10;
                  return (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  );
                })}
              </select>
            </label>

            <label className="block space-y-1">
              <div className="text-xs opacity-80">是否单向（Oneway，必选）</div>
              <select
                className="w-full border p-1 rounded text-sm"
                value={info.oneway ? 'true' : 'false'}
                onChange={(e) => setInfo((prev) => ({ ...prev, oneway: e.target.value === 'true' }))}
                onMouseDownCapture={(e) => e.stopPropagation()}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onTouchStartCapture={(e) => e.stopPropagation()}
              >
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            </label>

            <label className="block space-y-1">
              <div className="text-xs opacity-80">是否可进入（Enter，可选，缺省=true）</div>
              <select
                className="w-full border p-1 rounded text-sm"
                value={info.enter ? 'true' : 'false'}
                onChange={(e) => setInfo((prev) => ({ ...prev, enter: e.target.value === 'true' }))}
                onMouseDownCapture={(e) => e.stopPropagation()}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onTouchStartCapture={(e) => e.stopPropagation()}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
          </div>

          {/* Enter/Exit + ConnectL：插入在“是否可进入”之后、“限速”之前 */}
          <div className="grid grid-cols-3 gap-2">
            <label className="block space-y-1">
              <div className="text-xs opacity-80">是否可离开（Exit，可选，缺省=true）</div>
              <select
                className="w-full border p-1 rounded text-sm"
                value={info.exit ? 'true' : 'false'}
                onChange={(e) => setInfo((prev) => ({ ...prev, exit: e.target.value === 'true' }))}
                onMouseDownCapture={(e) => e.stopPropagation()}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onTouchStartCapture={(e) => e.stopPropagation()}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
            <label className="block space-y-1">
              <div className="text-xs opacity-80">是否允许自交（SelfJunction，可选，缺省=false）</div>
              <select
                className="w-full border p-1 rounded text-sm"
                value={info.selfJunction ? 'true' : 'false'}
                onChange={(e) => setInfo((prev) => ({ ...prev, selfJunction: e.target.value === 'true' }))}
                onMouseDownCapture={(e) => e.stopPropagation()}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onTouchStartCapture={(e) => e.stopPropagation()}
              >
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            </label>

          </div>

          <div className="border rounded p-2">
            <div className="text-xs font-semibold mb-1">显式连接关系（ConnectL，可选）</div>
            <div className="text-[11px] text-gray-600 mb-2">
              强行指定连接道路 ID。指定后将越过“自然交叉/打断”的 Level 规则：只要平面关系满足，即视作连接。
            </div>

            {connectL.length ? (
              <div className="space-y-2">
                {connectL.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <label className="col-span-3 space-y-1">
                      <div className="text-xs opacity-80">方式</div>
                      <select
                        className="w-full border p-1 rounded text-sm"
                        value={row.mode}
                        onChange={(e) => {
                          const v = (e.target.value as any) as 'endpoint' | 'middle';
                          setConnectL((prev) => prev.map((it, i) => (i === idx ? { ...it, mode: v } : it)));
                        }}
                        onMouseDownCapture={(e) => e.stopPropagation()}
                        onPointerDownCapture={(e) => e.stopPropagation()}
                        onTouchStartCapture={(e) => e.stopPropagation()}
                      >
                        <option value="endpoint">端点</option>
                        <option value="middle">中段</option>
                      </select>
                    </label>

                    <div className="col-span-8">
                      <WorkflowFeatureSearchSelect
                        bridge={bridge}
                        label="目标道路（选择后写入 ID）"
                        value={String(row.tgt ?? '')}
                        placeholder="输入关键词检索：可匹配 Name / ID"
                        config={roadSearchCfg}
                        onChange={(v) => setConnectL((prev) => prev.map((it, i) => (i === idx ? { ...it, tgt: v } : it)))}
                      />
                    </div>

                    <div className="col-span-1 flex justify-end">
                      <AppButton
                        type="button"
                        className="px-2 py-1 text-xs rounded border bg-white hover:bg-gray-50"
                        onClick={() => setConnectL((prev) => prev.filter((_, i) => i !== idx))}
                        title="删除该条"
                      >
                        −
                      </AppButton>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500">（未添加显式连接关系）</div>
            )}

            <div className="mt-2 flex justify-end">
              <AppButton
                type="button"
                className="px-2 py-1 text-xs rounded border bg-white hover:bg-gray-50"
                onClick={() => setConnectL((prev) => [...prev, { mode: 'endpoint', tgt: '' }])}
                title="添加一条连接关系"
              >
                ＋
              </AppButton>
            </div>
          </div>

          <div className="border rounded p-2">
            <div className="text-xs font-semibold mb-1">黑名单（Blacklist，可选）</div>
            <div className="text-[11px] text-gray-600 mb-2">
              记录不希望与其产生自然连接（交叉/端点对线/端点对端点候选）的目标道路 ID。仅在本要素未设置 ConnectL 时生效。
            </div>

            {blacklist.length ? (
              <div className="space-y-2">
                {blacklist.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-11">
                      <WorkflowFeatureSearchSelect
                        bridge={bridge}
                        label="目标道路（选择后写入 ID）"
                        value={String(row.tgt ?? '')}
                        placeholder="输入关键词检索：可匹配 Name / ID"
                        config={roadSearchCfg}
                        onChange={(v) => setBlacklist((prev) => prev.map((it, i) => (i === idx ? { ...it, tgt: v } : it)))}
                      />
                    </div>

                    <div className="col-span-1 flex justify-end">
                      <AppButton
                        type="button"
                        className="px-2 py-1 text-xs rounded border bg-white hover:bg-gray-50"
                        onClick={() => setBlacklist((prev) => prev.filter((_, i) => i !== idx))}
                        title="删除该条"
                      >
                        −
                      </AppButton>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500">（未添加黑名单）</div>
            )}

            <div className="mt-2 flex justify-end">
              <AppButton
                type="button"
                className="px-2 py-1 text-xs rounded border bg-white hover:bg-gray-50"
                onClick={() => setBlacklist((prev) => [...prev, { tgt: '' }])}
                title="添加一条黑名单"
              >
                ＋
              </AppButton>
            </div>
          </div>

          <LabeledInput
            label="限速（Speed，可选，float）"
            value={info.speed}
            placeholder="例如：4.5（留空则使用默认出行方式速度）"
            onChange={(v) => setInfo((prev) => ({ ...prev, speed: v }))}
            type="number"
          />

          {/* 基本信息 */}
          <LabeledInput label="道路名称（Name）" value={info.name} placeholder="例如：中央大道" onChange={(v) => setInfo((prev) => ({ ...prev, name: v }))} />
          <LabeledInput
            label="字符简称（用于ID末尾）"
            value={info.abbr}
            placeholder="例如：CDA"
            onChange={(v) => setInfo((prev) => ({ ...prev, abbr: v }))}
          />
          <div className="text-xs text-gray-600">ID 将写成：{worldPrefix}RODKindSKindSKind2_abbr（abbr 仅允许字母数字与 _-）。</div>
          <LabeledInput
            label="命名者（tags.nomenclator，可选）"
            value={info.nomenclator}
            placeholder="例如：YZ1825"
            onChange={(v) => setInfo((prev) => ({ ...prev, nomenclator: v }))}
          />

          {/* 以下三个可选项与传送点工作流一致，写入 tags.Land / tags.UAdm / tags.UAdmG */}
          <WorkflowFeatureSearchSelect
            bridge={bridge}
            label="所属地理单元（可选，将写入 tags.Land）"
            value={String(info.land ?? '')}
            placeholder="输入关键词检索：可匹配 Name / ID"
            config={landUnitSearchCfg}
            onChange={(v) => setInfo((prev) => ({ ...prev, land: v }))}
          />

          <WorkflowFeatureSearchSelect
            bridge={bridge}
            label="所属聚落(地标点)（可选，将写入 tags.UAdm）"
            value={String(info.uadm ?? '')}
            placeholder="输入关键词检索：可匹配 Name / ID"
            config={uadmLandmarkSearchCfg}
            onChange={(v) => setInfo((prev) => ({ ...prev, uadm: v }))}
          />

          <WorkflowFeatureSearchSelect
            bridge={bridge}
            label="所属聚落(区划)（可选，将写入 tags.UAdmG）"
            value={String(info.uadmg ?? '')}
            placeholder="输入关键词检索：可匹配 Name / ID"
            config={uadmGSearchCfg}
            onChange={(v) => setInfo((prev) => ({ ...prev, uadmg: v }))}
          />

          <LabeledInput
            label="Wiki（可选，将写入 extensions.link.wiki）"
            value={info.wiki ?? ''}
            placeholder="例如：https://..."
            onChange={(v) => setInfo((prev) => ({ ...prev, wiki: v }))}
          />

          {/* extensions */}
          <div className="border-t pt-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">扩展字段（extensions，可选）</div>
              <AppButton
                type="button"
                className="px-2 py-1 text-xs rounded border bg-white hover:bg-gray-50"
                onClick={addExtensionRow}
              >
                添加一行
              </AppButton>
            </div>

            {extItems.length ? (
              <div className="space-y-2 mt-2">
                {extItems.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <label className="col-span-3 space-y-1">
                      <div className="text-xs opacity-80">Group</div>
                      <input
                        className="w-full border p-1 rounded text-sm"
                        value={it.extGroup}
                        onChange={(e) => updateExtensionRow(idx, { extGroup: e.target.value })}
                        onMouseDownCapture={(e) => e.stopPropagation()}
                        onPointerDownCapture={(e) => e.stopPropagation()}
                        onTouchStartCapture={(e) => e.stopPropagation()}
                      />
                    </label>
                    <label className="col-span-3 space-y-1">
                      <div className="text-xs opacity-80">Key</div>
                      <input
                        className="w-full border p-1 rounded text-sm"
                        value={it.extKey}
                        onChange={(e) => updateExtensionRow(idx, { extKey: e.target.value })}
                        onMouseDownCapture={(e) => e.stopPropagation()}
                        onPointerDownCapture={(e) => e.stopPropagation()}
                        onTouchStartCapture={(e) => e.stopPropagation()}
                      />
                    </label>
                    <label className="col-span-3 space-y-1">
                      <div className="text-xs opacity-80">Type</div>
                      <select
                        className="w-full border p-1 rounded text-sm"
                        value={it.extType}
                        onChange={(e) => updateExtensionRow(idx, { extType: e.target.value as any })}
                        onMouseDownCapture={(e) => e.stopPropagation()}
                        onPointerDownCapture={(e) => e.stopPropagation()}
                        onTouchStartCapture={(e) => e.stopPropagation()}
                      >
                        {EXT_VALUE_TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="col-span-3 space-y-1">
                      <div className="text-xs opacity-80">Value</div>
                      <input
                        className="w-full border p-1 rounded text-sm"
                        value={it.extValue}
                        onChange={(e) => updateExtensionRow(idx, { extValue: e.target.value })}
                        onMouseDownCapture={(e) => e.stopPropagation()}
                        onPointerDownCapture={(e) => e.stopPropagation()}
                        onTouchStartCapture={(e) => e.stopPropagation()}
                      />
                    </label>
                    <div className="col-span-12 flex justify-end">
                      <AppButton
                        type="button"
                        className="px-2 py-1 text-xs rounded border bg-white hover:bg-gray-50"
                        onClick={() => removeExtensionRow(idx)}
                      >
                        删除
                      </AppButton>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500 mt-2">（未添加扩展字段）</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // draw
  return (
    <div className="p-3 rounded border border-gray-300 bg-white">
      <TopNav
        title="绘制道路"
        showPrev
        prevDisabled={saving}
        onPrev={() => {
          bridgeRef.current.setDrawMode('none');
          bridgeRef.current.clearTempPoints();
          setStep('info');
        }}
      />

      <div className="space-y-2">
        <div className="text-xs text-gray-600">
          请在地图上绘制一条道路折线（至少 2 个点）。完成后点击“保存并退出”。
        </div>
        <div className="text-xs text-gray-600">
          立交规则：不同 Level 的道路在空间相交时不会连通（导航构图使用）。
        </div>

        {saveError ? <div className="text-xs text-rose-600">{saveError}</div> : null}

        <div className="flex gap-2">
          <AppButton
            type="button"
            className={`flex-1 py-2 rounded border ${canCommit ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
            disabled={!canCommit}
            onClick={handleCommit}
          >
            {saving ? '保存中…' : '保存并退出'}
          </AppButton>

          <AppButton
            type="button"
            className="px-3 py-2 rounded border bg-white hover:bg-gray-50"
            onClick={() => {
              bridgeRef.current.clearTempPoints();
              setSaveError('');
            }}
          >
            清空草稿
          </AppButton>
        </div>

        <div className="text-xs text-gray-500">
          草稿点数：{draftLine.length}（需要 ≥2）
        </div>
      </div>
    </div>
  );
}
