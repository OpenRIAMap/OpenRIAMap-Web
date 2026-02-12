// File: src/components/Mapping/Workflow/WarpPointWorkflow.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkflowComponentProps, WorldPoint } from './WorkflowHost';
import AppButton from '@/components/ui/AppButton';
import { EXT_VALUE_TYPE_TEXT, listCatalogClassOptions, type FeatureKey } from '@/components/Mapping/featureFormats';
import { HUB_RETURN_POINTS } from '@/components/Navigation/teleportHubReturnPoints';
import WorkflowFeatureSearchSelect, { type SearchSelectConfig } from './WorkflowFeatureSearchSelect';

/**
 * WarpPointWorkflow（工作流：Warp点）
 * - 结构参照 NaturalLandWorkflow
 * - 仅点要素：第 3 页为“起点坐标”并写入 coordinate/elevation
 *
 * 关键字段：
 * - WRPointID = WorldPrefix + 'WRP' + Kind + SKind + '_' + abbr
 * - WRPointI2D = “服内Warp名”（必填）
 * - tags: Land/UAdm/UAdmG
 * - extensions: link.wiki
 * - hub: 直属字段（可选）
 */

type Step = 'creator' | 'info' | 'src';

type InfoForm = {
  typeKey: string; // `${kind}|${skind}`
  name: string;
  abbr: string;

  hub?: string;
  land?: string;
  uadm?: string;
  uadmg?: string;
  wiki?: string;

  wrpI2D: string; // 服内Warp名（必填）
};

type Option = { kind: string; skind: string; label: string };

const WORLD_CODE_TO_PREFIX: Record<number, string> = {
  0: 'Z',
  1: 'N',
  2: 'H',
  3: 'E',
  4: 'L',
  5: 'Y',
};

const WORLD_ID_TO_CODE: Record<string, number> = {
  zth: 0,
  naraku: 1,
  houtu: 2,
  eden: 3,
  laputa: 4,
  yunduan: 5,
};

function worldPrefixFromWorldId(worldId: string) {
  const w = String(worldId ?? '').trim();
  const code = WORLD_ID_TO_CODE[w];
  if (Number.isFinite(code)) return WORLD_CODE_TO_PREFIX[code];
  if (/^[ZNHELY]$/i.test(w)) return w.toUpperCase();
  return 'Z';
}

function toNumOrUndefined(v: any): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function nonEmpty(s: string | undefined | null) {
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
  return [pts[0]];
}

type LabeledInputProps = {
  label: string;
  value: string;
  placeholder?: string;
  type?: 'text' | 'number';
  onChange: (v: string) => void;
};

function LabeledInput(props: LabeledInputProps) {
  const { label, value, placeholder, type, onChange } = props;
  return (
    <label className="block">
      <div className="text-xs text-gray-600 mb-1">{label}</div>
      <input
        className="w-full border rounded px-2 py-1 text-sm"
        value={value}
        placeholder={placeholder}
        type={type ?? 'text'}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
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

export default function WarpPointWorkflow(props: WorkflowComponentProps) {
  const { bridge, onExit } = props;

  const bridgeRef = useRef(bridge);
  bridgeRef.current = bridge;

  const [step, setStep] = useState<Step>('creator');
  const [creatorId, setCreatorId] = useState<string>(bridge.getEditorId?.() ?? '');

  const [info, setInfo] = useState<InfoForm>({
    typeKey: 'NOM|NOM',
    name: '',
    abbr: '',
    hub: '',
    land: '',
    uadm: '',
    uadmg: '',
    wiki: '',
    wrpI2D: '',
  });

  const [srcElevInput, setSrcElevInput] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // draw state
  const draftPoint: WorldPoint[] = step === 'src' ? (bridge.getTempPoints?.() ?? []) : [];
  const [srcPoint, setSrcPoint] = useState<WorldPoint | null>(null);
  void onExit;
  void srcPoint;


  const worldId = useMemo(() => String(bridge.getCurrentWorldId?.() ?? '').trim(), [bridge]);

  // ===== 复用检索组件：所属地理单元 / 所属聚落 =====
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
  const worldPrefix = useMemo(() => worldPrefixFromWorldId(worldId), [worldId]);

  const kind = useMemo(() => String(info.typeKey.split('|')[0] ?? '').trim(), [info.typeKey]);
  const skind = useMemo(() => String(info.typeKey.split('|')[1] ?? '').trim(), [info.typeKey]);
  const abbrNormalized = useMemo(() => normalizeAbbr(info.abbr), [info.abbr]);

  const typeOptions: Option[] = useMemo(() => {
    // 仅列出 WRP
    const options = listCatalogClassOptions({ classCode: 'WRP', geom: '点' });
    return options.map((o) => ({ kind: o.kind, skind: o.skind, label: `${o.name}（${o.kind}/${o.skind}）` }));
  }, []);

  const hubOptions = useMemo(() => {
    // 从 HUB_RETURN_POINTS 中提取当前世界可用 hub；允许为空
    const list = HUB_RETURN_POINTS[worldId] ?? [];
    const s = new Set<string>();
    for (const p of list) {
      const h = String(p?.hub ?? '').trim();
      if (h) s.add(h);
    }
    return Array.from(s.values()).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  }, [worldId]);

  // step enter effects
  useEffect(() => {
    if (nonEmpty(creatorId)) bridgeRef.current.setEditorId(creatorId.trim());
    if (step === 'creator' || step === 'info') {
      bridgeRef.current.setDrawMode('none');
      bridgeRef.current.clearTempPoints();
      setSaveError('');
      return;
    }

    if (step === 'src') {
      bridgeRef.current.setDrawMode('point');
      bridgeRef.current.clearTempPoints();
      setSaveError('');
      return;
    }
  }, [step, creatorId]);

  // enforce single point
  useEffect(() => {
    if (step !== 'src') return;
    if (!Array.isArray(draftPoint)) return;
    if (draftPoint.length <= 1) return;
    bridgeRef.current.setTempPoints(firstPointOnly(draftPoint));
  }, [step, draftPoint.length]);

  const canGoNextFromCreator = useMemo(() => nonEmpty(creatorId), [creatorId]);
  const canGoNextFromInfo = useMemo(() => {
    if (!nonEmpty(info.name)) return false;
    if (!nonEmpty(abbrNormalized)) return false;
    if (!nonEmpty(info.wrpI2D)) return false;
    if (!kind || !skind) return false;
    return true;
  }, [info.name, abbrNormalized, info.wrpI2D, kind, skind]);

  const hasDraftPoint = useMemo(() => Array.isArray(draftPoint) && draftPoint.length >= 1, [draftPoint.length]);
  const canCommit = useMemo(() => canGoNextFromInfo && hasDraftPoint && !saving, [canGoNextFromInfo, hasDraftPoint, saving]);

  const commit = () => {
    const p0 = firstPointOnly(draftPoint)[0];
    if (!p0) return;
    setSrcPoint(p0);
    setSaving(true);
    setSaveError('');

    try {
      const abbr = abbrNormalized;
      const wrId = `${worldPrefix}WRP${kind}${skind}_${abbr}`;

      const srcY = Number.isFinite(p0.y as any) ? Number(p0.y) : undefined;
      const elevation = srcY ?? toNumOrUndefined(srcElevInput);

      const tags: Array<{ tagKey: string; tagValue: string }> = [];
      const land = String(info.land ?? '').trim();
      const uadm = String(info.uadm ?? '').trim();
      const uadmg = String(info.uadmg ?? '').trim();
      if (land) tags.push({ tagKey: 'Land', tagValue: land });
      if (uadm) tags.push({ tagKey: 'UAdm', tagValue: uadm });
      if (uadmg) tags.push({ tagKey: 'UAdmG', tagValue: uadmg });

      const wiki = String(info.wiki ?? '').trim();
      const extensions: Array<{ extGroup: string; extKey: string; extType: any; extValue: string }> = [];
      if (wiki) extensions.push({ extGroup: 'link', extKey: 'wiki', extType: EXT_VALUE_TYPE_TEXT, extValue: wiki });

      const res = bridgeRef.current.commitFeature({
        subType: 'Warp点' as FeatureKey,
        mode: 'point',
        coords: [{ x: p0.x, z: p0.z, y: p0.y }],
        editorId: creatorId.trim(),
        values: {
          WRPointID: wrId,
          WRPointI2D: String(info.wrpI2D ?? '').trim(),
          WRPointName: String(info.name ?? '').trim(),
          WRPointKind: kind,
          WRPointSKind: skind,
          hub: String(info.hub ?? '').trim() || '',
          elevation: elevation ?? '',
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

  // ------------------------------
  // render
  // ------------------------------

  if (step === 'creator') {
    return (
      <div className="p-3 rounded border border-gray-300 bg-white">
        <TopNav title="Warp点：填写者信息" showNext nextDisabled={!canGoNextFromCreator} onNext={() => setStep('info')} />
        <div className="space-y-2">
          <LabeledInput label="填写者（CreateBy）" value={creatorId} placeholder="例如：yz1825" onChange={setCreatorId} />
          <div className="text-xs text-gray-600">填写者会写入 CreateBy，并用于后续编辑记录。</div>
        </div>
      </div>
    );
  }

  if (step === 'info') {
    return (
      <div className="p-3 rounded border border-gray-300 bg-white">
        <TopNav
          title="Warp点：信息填写"
          showPrev
          showNext
          prevDisabled={false}
          nextDisabled={!canGoNextFromInfo}
          onPrev={() => setStep('creator')}
          onNext={() => setStep('src')}
        />

        <div className="space-y-2">
          <label className="block">
            <div className="text-xs text-gray-600 mb-1">类别（Kind/SKind）</div>
            <select
              className="w-full border rounded px-2 py-1 text-sm"
              value={info.typeKey}
              onChange={(e) => setInfo((s) => ({ ...s, typeKey: e.target.value }))}
            >
              {typeOptions.map((o) => (
                <option key={`${o.kind}|${o.skind}`} value={`${o.kind}|${o.skind}`}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <LabeledInput label="Warp点名称（WRPointName）" value={info.name} placeholder="例如：主城-中心" onChange={(v) => setInfo((s) => ({ ...s, name: v }))} />
          <LabeledInput label="字符简称（用于组装 WRPointID）" value={info.abbr} placeholder="例如：MAIN1" onChange={(v) => setInfo((s) => ({ ...s, abbr: v }))} />

          <LabeledInput
            label="服内Warp名（必填，将写入 WRPointI2D）"
            value={info.wrpI2D}
            placeholder="例如：zthspawn"
            onChange={(v) => setInfo((s) => ({ ...s, wrpI2D: v }))}
          />

          <label className="block">
            <div className="text-xs text-gray-600 mb-1">所属枢纽区（可选，hub）</div>
            <select
              className="w-full border rounded px-2 py-1 text-sm"
              value={String(info.hub ?? '')}
              onChange={(e) => setInfo((s) => ({ ...s, hub: e.target.value }))}
            >
              <option value="">（无）</option>
              {hubOptions.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>

          <WorkflowFeatureSearchSelect
            bridge={bridge}
            label="所属地理单元（可选，写入 tags.Land）"
            value={String(info.land ?? '')}
            placeholder="输入关键词检索：可匹配 PGonName / PGonID"
            config={landUnitSearchCfg}
            onChange={(v) => setInfo((s) => ({ ...s, land: v }))}
          />
          <WorkflowFeatureSearchSelect
            bridge={bridge}
            label="所属聚落(地标点)（可选，写入 tags.UAdm）"
            value={String(info.uadm ?? '')}
            placeholder="输入关键词检索：可匹配 PointName / PointID"
            config={uadmLandmarkSearchCfg}
            onChange={(v) => setInfo((s) => ({ ...s, uadm: v }))}
          />
          <WorkflowFeatureSearchSelect
            bridge={bridge}
            label="所属聚落(区划)（可选，写入 tags.UAdmG）"
            value={String(info.uadmg ?? '')}
            placeholder="输入关键词检索：可匹配 PGonName / PGonID"
            config={uadmGSearchCfg}
            onChange={(v) => setInfo((s) => ({ ...s, uadmg: v }))}
          />
          <LabeledInput label="wiki链接（可选，写入 extensions.link.wiki）" value={String(info.wiki ?? '')} placeholder="例如：wiki.ria.red/xxx" onChange={(v) => setInfo((s) => ({ ...s, wiki: v }))} />
        </div>
      </div>
    );
  }

  // step === 'src'
  const p0 = firstPointOnly(draftPoint)[0];

  return (
    <div className="p-3 rounded border border-gray-300 bg-white">
      <TopNav
        title="Warp点：起点坐标"
        showPrev
        showNext
        prevDisabled={false}
        nextDisabled={!canCommit}
        onPrev={() => {
          setStep('info');
          bridgeRef.current.clearTempPoints();
        }}
        onNext={commit}
      />

      <div className="space-y-2">
        <div className="text-xs text-gray-600">请在地图上点选 Warp 点坐标。</div>

        <LabeledInput
          label="高度值（可选，将写入 elevation；若点坐标含 y，则优先使用 y）"
          value={srcElevInput}
          placeholder="例如：64"
          type="number"
          onChange={(v) => setSrcElevInput(v)}
        />

        <div className="text-xs text-gray-700">
          当前点：{p0 ? <span className="font-mono">{`x=${p0.x}, z=${p0.z}${Number.isFinite(p0.y as any) ? `, y=${p0.y}` : ''}`}</span> : '未选择'}
        </div>

        {saveError ? <div className="text-xs text-red-600">{saveError}</div> : null}

        <div className="flex items-center gap-2 pt-1">
          <AppButton
            type="button"
            className="px-3 py-1.5 rounded text-sm border hover:bg-gray-50"
            onClick={() => {
              try {
                bridgeRef.current.exitWorkflowToSelector();
              } catch {
                // ignore
              }
            }}
          >
            取消
          </AppButton>
          <div className="text-xs text-gray-600">保存后将写入固定图层，并返回快捷测绘主页面。</div>
        </div>
      </div>
    </div>
  );
}
