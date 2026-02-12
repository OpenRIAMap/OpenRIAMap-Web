// File: src/components/Mapping/Workflow/TeleportPointWorkflow.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkflowComponentProps, WorldPoint } from './WorkflowHost';
import AppButton from '@/components/ui/AppButton';
import { EXT_VALUE_TYPE_TEXT, listCatalogClassOptions, type FeatureKey } from '@/components/Mapping/featureFormats';
import { listHubReturnPoints, type HubReturnPoint } from '@/components/Navigation/teleportHubReturnPoints';
import { RULE_DATA_SOURCES } from '@/components/Rules/ruleDataSources';
import WorkflowFeatureSearchSelect, { type SearchSelectConfig } from './WorkflowFeatureSearchSelect';

/**
 * TeleportPointWorkflow（工作流：传送点）
 *
 * 结构参照 NaturalLandWorkflow：多页表单 + 绘制并写入固定图层
 *
 * 页面：
 * 1) 填写者信息（CreateBy）
 * 2) 信息填写（Class=TPP 下所有点要素：选择 Kind/SKind + 名称/简称 + hub/聚落/wiki 等）
 * 3) 起点坐标（point，写入 coordinate + elevation）
 * 4) 目标点坐标（point，写入 TGTcoordinate + TGTelevation）
 *
 * 字段组合：
 * - TPPointID = WorldPrefix + 'TPP' + Kind + SKind + '_' + abbr
 * - tags: Land/UAdm/UAdmG
 * - extensions: link.wiki
 * - hub: 直属字段（非 tags）
 */

type Step = 'creator' | 'info' | 'src' | 'tgt';

type InfoForm = {
  typeKey: string; // `${kind}|${skind}`
  name: string;
  abbr: string;

  hub?: string;
  land?: string; // 所属大陆(一级)
  uadm?: string; // 所属聚落(地标点)
  uadmg?: string; // 所属聚落(区划)
  wiki?: string; // wiki链接

  // NEW: 目标 Warp 点（可选）
  tgtWarpText?: string; // 输入文本
  tgtWarpI2D?: string; // 选中的 WRPointI2D（写入 TGTWarp）
  tgtWarpName?: string; // 仅用于显示
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
  if (Number.isFinite(asNum) && WORLD_CODE_TO_PREFIX[asNum as any]) return WORLD_CODE_TO_PREFIX[asNum as any];

  const code = WORLD_ID_TO_CODE[w];
  if (Number.isFinite(code)) return WORLD_CODE_TO_PREFIX[code];

  if (/^[ZNHELY]$/i.test(w)) return w.toUpperCase();
  return 'Z';
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
  const p0 = pts[pts.length - 1];
  return [{ x: p0.x, z: p0.z, y: p0.y }];
}

function toNumOrUndefined(raw: string) {
  const s = String(raw ?? '').trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}



// =====================
// WRP pool loader (for typeahead)
// =====================

type WarpOption = { i2d: string; name: string };

const WRP_POOL_CACHE: Record<string, WarpOption[]> = {};

async function fetchJsonArray(url: string): Promise<any[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${url}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function loadWarpPool(worldId: string): Promise<WarpOption[]> {
  const cached = WRP_POOL_CACHE[worldId];
  if (cached) return cached;

  const ds = (RULE_DATA_SOURCES as any)?.[worldId];
  if (!ds || !ds.baseUrl || !Array.isArray(ds.files)) {
    WRP_POOL_CACHE[worldId] = [];
    return [];
  }

  const out: WarpOption[] = [];
  for (const f of ds.files as string[]) {
    const url = `${ds.baseUrl}/${f}`;
    let arr: any[] = [];
    try {
      arr = await fetchJsonArray(url);
    } catch {
      continue;
    }
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const cls = String((item as any).Class ?? (item as any).class ?? '').trim();
      if (cls !== 'WRP') continue;

      const i2d = String((item as any).WRPointI2D ?? (item as any).wrPointI2D ?? '').trim();
      const name = String((item as any).WRPointName ?? (item as any).wrPointName ?? i2d).trim();
      if (!i2d || !name) continue;
      out.push({ i2d, name });
    }
  }

  // 去重（以 i2d 为主键）
  const map = new Map<string, WarpOption>();
  for (const o of out) map.set(o.i2d, o);
  const list = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));

  WRP_POOL_CACHE[worldId] = list;
  return list;
}

function matchWarp(o: WarpOption, q: string) {
  const s = q.toLowerCase();
  return o.i2d.toLowerCase().includes(s) || o.name.toLowerCase().includes(s);
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

export default function TeleportPointWorkflow(props: WorkflowComponentProps) {
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
    typeKey: '',
    name: '',
    abbr: '',
    hub: '',
    land: '',
    uadm: '',
    uadmg: '',
    wiki: '',
    tgtWarpText: '',
    tgtWarpI2D: '',
    tgtWarpName: '',
  });

  // Page 3/4 points
  const [srcPoint, setSrcPoint] = useState<WorldPoint | null>(null);

  const [srcElevInput, setSrcElevInput] = useState<string>('');
  const [tgtElevInput, setTgtElevInput] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>('');

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
  const worldPrefix = useMemo(() => resolveWorldPrefix(worldId), [worldId]);

  const typeOptions = useMemo(() => {
    // Class = TPP，geom = 点
    return listCatalogClassOptions({ classCode: 'TPP', geom: '点' });
  }, []);

  const selected = useMemo(() => {
    const key = String(info.typeKey ?? '');
    if (!key) return null;
    const [kind, skind] = key.split('|');
    return typeOptions.find((o) => o.kind === kind && o.skind === skind) ?? null;
  }, [info.typeKey, typeOptions]);

  const hubOptions = useMemo(() => {
    const pts: HubReturnPoint[] = listHubReturnPoints(worldId) ?? [];
    const set = new Set<string>();
    for (const p of pts) {
      const h = String(p?.hub ?? '').trim();
      if (h) set.add(h);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  }, [worldId]);

  // warp 点检索池（当前世界预挂载的 WRP 要素）
  const [warpPool, setWarpPool] = useState<WarpOption[]>([]);
  const [warpPoolError, setWarpPoolError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setWarpPool([]);
    setWarpPoolError('');

    loadWarpPool(worldId)
      .then((list) => {
        if (cancelled) return;
        setWarpPool(list);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setWarpPoolError(String(e?.message ?? e ?? '加载失败'));
      });

    return () => {
      cancelled = true;
    };
  }, [worldId]);
  // Warp 点检索池扩展：除预挂载 WRP 外，也纳入当前已绘制的图层列表中的 WRP（即使未挂载）
  const warpPoolFromLayers = useMemo((): WarpOption[] => {
    const fn = (bridge as any)?.getCommittedLayerJsonInfos as
      | undefined
      | (() => Array<{ subType: any; featureInfo: any }>);
    if (!fn) return [];

    let rawList: any[] = [];
    try {
      rawList = (fn() as any[]) ?? [];
    } catch {
      rawList = [];
    }

    const targetPrefix = resolveWorldPrefix(worldId);
    const targetCode: any = Number.isFinite(Number(worldId)) ? Number(worldId) : (WORLD_ID_TO_CODE as any)[worldId];

    const out: WarpOption[] = [];
    for (const ji of rawList) {
      const fi = (ji as any)?.featureInfo ?? (ji as any)?.jsonInfo?.featureInfo ?? ji;
      if (!fi || typeof fi !== 'object') continue;

      const cls = String((fi as any).Class ?? (fi as any).class ?? '').trim();
      if (cls && cls !== 'WRP') continue;
      if (!cls) {
        const st = String((ji as any)?.subType ?? '').trim();
        if (st && st !== 'Warp点') continue;
      }

      // world filter（best-effort）：优先按数值 World 匹配，其次按字母前缀匹配；无法判定则放行
      const wRaw = (fi as any).World ?? (fi as any).world;
      const wStr = wRaw === undefined || wRaw === null ? '' : String(wRaw).trim();
      if (wStr) {
        const wNum = Number(wStr);
        if (Number.isFinite(targetCode as any) && Number.isFinite(wNum)) {
          if (wNum !== (targetCode as any)) continue;
        } else if (/^[ZNHELY]$/i.test(wStr)) {
          if (wStr.toUpperCase() !== targetPrefix) continue;
        } else {
          // 其他格式：尽量用 resolveWorldPrefix 做一次判定（不强制）
          const wPrefix = resolveWorldPrefix(wStr);
          if (wPrefix && wPrefix !== targetPrefix) {
            // 若能解析出 prefix 且不匹配，则过滤
            continue;
          }
        }
      }

      const i2d = String((fi as any).WRPointI2D ?? (fi as any).wrPointI2D ?? '').trim();
      const name = String(
        (fi as any).WRPointName ?? (fi as any).wrPointName ?? (fi as any).Name ?? (fi as any).name ?? i2d
      ).trim();
      if (!i2d) continue;
      out.push({ i2d, name: name || i2d });
    }

    // 去重（以 i2d 为主键）
    const map = new Map<string, WarpOption>();
    for (const o of out) map.set(o.i2d, o);
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }, [bridge, worldId]);

  const mergedWarpPool = useMemo(() => {
    const map = new Map<string, WarpOption>();
    // 先放预挂载，再用图层内的覆盖（图层通常更新更及时）
    for (const o of warpPool) map.set(o.i2d, o);
    for (const o of warpPoolFromLayers) map.set(o.i2d, o);
    return Array.from(map.values());
  }, [warpPool, warpPoolFromLayers]);

  const useWarpTarget = useMemo(() => nonEmpty(info.tgtWarpI2D), [info.tgtWarpI2D]);

  const warpQuery = useMemo(() => String(info.tgtWarpText ?? '').trim(), [info.tgtWarpText]);

  const warpSuggestions = useMemo(() => {
    const q = warpQuery.trim();
    if (!q) return [];
    return mergedWarpPool.filter((p) => matchWarp(p, q)).slice(0, 20);
  }, [warpQuery, mergedWarpPool]);


  // ----- step enter effects -----
  useEffect(() => {
    if (nonEmpty(creatorId)) bridgeRef.current.setEditorId(creatorId.trim());

    if (step === 'creator' || step === 'info') {
      bridgeRef.current.setDrawMode('none');
      bridgeRef.current.clearTempPoints();
      setSaveError('');
      return;
    }

    // draw: src/tgt 都是 point
    bridgeRef.current.setDrawMode('point');
    setSaveError('');
  }, [step, creatorId]);

  const canGoNextFromCreator = useMemo(() => nonEmpty(creatorId), [creatorId]);

  const abbrNormalized = useMemo(() => normalizeAbbr(info.abbr), [info.abbr]);

  const canGoNextFromInfo = useMemo(() => {
    return nonEmpty(info.typeKey) && nonEmpty(info.name) && nonEmpty(abbrNormalized);
  }, [info.typeKey, info.name, abbrNormalized]);

  const draftPoint: WorldPoint[] = (step === 'src' || step === 'tgt') ? (bridge.getTempPoints?.() ?? []) : [];

  // 约束：只保留最后一个点（避免多点草稿影响下一步判断）
  useEffect(() => {
    if (!(step === 'src' || step === 'tgt')) return;
    if (!Array.isArray(draftPoint)) return;
    if (draftPoint.length <= 1) return;
    bridgeRef.current.setTempPoints(firstPointOnly(draftPoint));
  }, [step, draftPoint.length]);

  const hasDraftPoint = useMemo(() => Array.isArray(draftPoint) && draftPoint.length >= 1, [draftPoint.length]);

  const canGoNextFromSrc = useMemo(() => {
    return canGoNextFromInfo && hasDraftPoint;
  }, [canGoNextFromInfo, hasDraftPoint]);

  const canCommit = useMemo(() => {
    return canGoNextFromInfo && srcPoint !== null && hasDraftPoint && !saving;
  }, [canGoNextFromInfo, srcPoint, hasDraftPoint, saving]);

  const applySrcPointAndNext = () => {
    const p0 = firstPointOnly(draftPoint)[0];
    if (!p0) return;
    setSrcPoint(p0);
    bridgeRef.current.clearTempPoints();

    // 若选择了 Warp 目标，则直接保存（跳过目标坐标页）
    if (useWarpTarget) {
      commitFromSrcWithWarp(p0);
      return;
    }

    setStep('tgt');
  };

  
  const commitFromSrcWithWarp = (p0: WorldPoint) => {
    setSaving(true);
    setSaveError('');

    try {
      const kind = String(selected?.kind ?? '').trim();
      const skind = String(selected?.skind ?? '').trim();

      const abbr = abbrNormalized;
      const tpId = `${worldPrefix}TPP${kind}${skind}_${abbr}`;

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

      const tgtWarpI2D = String(info.tgtWarpI2D ?? '').trim();
      if (!tgtWarpI2D) {
        setSaveError('未选择目标 Warp 点');
        return;
      }

      const res = bridgeRef.current.commitFeature({
        subType: '传送点' as FeatureKey,
        mode: 'point',
        coords: [{ x: p0.x, z: p0.z, y: p0.y }],
        editorId: creatorId.trim(),
        values: {
          TPPointID: tpId,
          TPPointName: String(info.name ?? '').trim(),
          TPPointKind: kind,
          TPPointSKind: skind,
          hub: String(info.hub ?? '').trim() || '',
          elevation: elevation ?? '',
          TGTWarp: tgtWarpI2D,
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

const commit = () => {
    if (!srcPoint) return;

    const pTgt = firstPointOnly(draftPoint)[0];
    if (!pTgt) return;

    setSaving(true);
    setSaveError('');

    try {
      const kind = String(selected?.kind ?? '').trim();
      const skind = String(selected?.skind ?? '').trim();

      const abbr = abbrNormalized;
      const tpId = `${worldPrefix}TPP${kind}${skind}_${abbr}`;

      const srcY = Number.isFinite(srcPoint.y as any) ? Number(srcPoint.y) : undefined;
      const tgtY = Number.isFinite(pTgt.y as any) ? Number(pTgt.y) : undefined;

      const elevation = srcY ?? toNumOrUndefined(srcElevInput);
      const TGTelevation = tgtY ?? toNumOrUndefined(tgtElevInput);

      const tags: Array<{ tagKey: string; tagValue: string }> = [];
      const land = String(info.land ?? '').trim();
      const uadm = String(info.uadm ?? '').trim();
      const uadmg = String(info.uadmg ?? '').trim();
      if (land) tags.push({ tagKey: 'Land', tagValue: land });
      if (uadm) tags.push({ tagKey: 'UAdm', tagValue: uadm });
      if (uadmg) tags.push({ tagKey: 'UAdmG', tagValue: uadmg });

      const wiki = String(info.wiki ?? '').trim();
      const extensions: Array<{ extGroup: string; extKey: string; extType: any; extValue: string }> = [];
      if (wiki) {
        extensions.push({ extGroup: 'link', extKey: 'wiki', extType: EXT_VALUE_TYPE_TEXT, extValue: wiki });
      }

      const res = bridgeRef.current.commitFeature({
        subType: '传送点',
        mode: 'point',
        coords: [{ x: srcPoint.x, z: srcPoint.z, y: srcPoint.y }],
        editorId: creatorId.trim(),
        values: {
          TPPointID: tpId,
          TPPointName: String(info.name ?? '').trim(),
          TPPointKind: kind,
          TPPointSKind: skind,
          // SKind2 预留
          hub: String(info.hub ?? '').trim() || '',
          TGT_x: pTgt.x,
          TGT_z: pTgt.z,
          elevation: elevation ?? '',
          TGTelevation: TGTelevation ?? '',
        },
        groupInfo: {
          tags,
          extensions,
        },
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

  // -------- render --------
  if (step === 'creator') {
    return (
      <div className="p-3 rounded border border-gray-300 bg-white">
        <TopNav title="传送点：填写者信息" showNext nextDisabled={!canGoNextFromCreator} onNext={() => setStep('info')} />

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
          title="传送点：信息填写"
          showPrev
          showNext
          prevDisabled={false}
          nextDisabled={!canGoNextFromInfo}
          onPrev={() => setStep('creator')}
          onNext={() => {
            setSrcPoint(null);
            bridgeRef.current.clearTempPoints();
            setStep('src');
          }}
        />

        <div className="space-y-3">
          <label className="block space-y-1">
            <div className="text-xs opacity-80">类型（Class=TPP）</div>
            <select
              className="w-full border p-1 rounded text-sm"
              value={info.typeKey}
              onChange={(e) => setInfo((prev) => ({ ...prev, typeKey: e.target.value }))}
              onMouseDownCapture={(e) => e.stopPropagation()}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onTouchStartCapture={(e) => e.stopPropagation()}
            >
              <option value="">请选择...</option>
              {typeOptions.map((o) => (
                <option key={`${o.kind}|${o.skind}`} value={`${o.kind}|${o.skind}`}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <LabeledInput label="名称" value={info.name} placeholder="例如：主城传送柱-北门" onChange={(v) => setInfo((prev) => ({ ...prev, name: v }))} />

          <LabeledInput
            label="字符简称（用于ID）"
            value={info.abbr}
            placeholder="仅建议使用字母/数字/下划线/短横线"
            onChange={(v) => setInfo((prev) => ({ ...prev, abbr: v }))}
          />
          {info.abbr && abbrNormalized !== info.abbr.trim() ? (
            <div className="text-xs text-gray-600">
              将用于 ID 的简称：<span className="font-mono">{abbrNormalized || '(空)'}</span>
            </div>
          ) : null}

          <label className="block space-y-1">
            <div className="text-xs opacity-80">所属枢纽区（可选，将写入 hub）</div>
            <select
              className="w-full border p-1 rounded text-sm"
              value={String(info.hub ?? '')}
              onChange={(e) => setInfo((prev) => ({ ...prev, hub: e.target.value }))}
              onMouseDownCapture={(e) => e.stopPropagation()}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onTouchStartCapture={(e) => e.stopPropagation()}
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
            label="所属地理单元（可选，将写入 tags.Land）"
            value={String(info.land ?? '')}
            placeholder="输入关键词检索：可匹配 PGonName / PGonID"
            config={landUnitSearchCfg}
            onChange={(v) => setInfo((prev) => ({ ...prev, land: v }))}
          />

          <WorkflowFeatureSearchSelect
            bridge={bridge}
            label="所属聚落(地标点)（可选，将写入 tags.UAdm）"
            value={String(info.uadm ?? '')}
            placeholder="输入关键词检索：可匹配 PointName / PointID"
            config={uadmLandmarkSearchCfg}
            onChange={(v) => setInfo((prev) => ({ ...prev, uadm: v }))}
          />

          <WorkflowFeatureSearchSelect
            bridge={bridge}
            label="所属聚落(区划)（可选，将写入 tags.UAdmG）"
            value={String(info.uadmg ?? '')}
            placeholder="输入关键词检索：可匹配 PGonName / PGonID"
            config={uadmGSearchCfg}
            onChange={(v) => setInfo((prev) => ({ ...prev, uadmg: v }))}
          />

          <LabeledInput
            label="wiki链接（可选，将写入 extensions.link.wiki）"
            value={info.wiki ?? ''}
            placeholder="https://..."
            onChange={(v) => setInfo((prev) => ({ ...prev, wiki: v }))}
          />

          {/* NEW: 目标 Warp 点（可选） */}
          <div className="space-y-1">
            <div className="text-xs opacity-80">目标Warp点(若有)（可选，将写入 TGTWarp；填写后将跳过“目标点坐标”页面）</div>
            <input
              className="w-full border p-1 rounded text-sm"
              value={String(info.tgtWarpText ?? '')}
              placeholder="输入关键词检索：可匹配 WRPointName 或 WRPointI2D"
              onChange={(e) => {
                const v = e.target.value;
                setInfo((prev) => ({
                  ...prev,
                  tgtWarpText: v,
                  // 只要用户手动改动，就清空选中值，避免“假选中”
                  tgtWarpI2D: '',
                  tgtWarpName: '',
                }));
              }}
              onMouseDownCapture={(e) => e.stopPropagation()}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onTouchStartCapture={(e) => e.stopPropagation()}
            />

            {warpPoolError ? <div className="text-xs text-rose-600">Warp点列表加载失败：{warpPoolError}</div> : null}

            {warpSuggestions.length ? (
              <div className="border rounded bg-white max-h-40 overflow-auto">
                {warpSuggestions.map((p) => (
                  <button
                    key={p.i2d}
                    type="button"
                    className="w-full text-left px-2 py-1 text-sm hover:bg-gray-50"
                    onClick={() => {
                      setInfo((prev) => ({
                        ...prev,
                        tgtWarpText: `${p.name}(${p.i2d})`,
                        tgtWarpI2D: p.i2d,
                        tgtWarpName: p.name,
                      }));
                    }}
                  >
                    {p.name}(<span className="font-mono">{p.i2d}</span>)
                  </button>
                ))}
              </div>
            ) : null}

            {useWarpTarget ? (
              <div className="text-xs text-gray-600">
                已选择：<span className="font-mono">{String(info.tgtWarpI2D)}</span>（之后将优先以该 Warp 点坐标作为目标点）
              </div>
            ) : null}
          </div>


          <div className="text-xs text-gray-600">
            生成 ID 规则：<span className="font-mono">{worldPrefix}TPP{selected?.kind ?? '??'}{selected?.skind ?? '??'}_{abbrNormalized || '??'}</span>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'src') {
    const p0 = firstPointOnly(draftPoint)[0];
    return (
      <div className="p-3 rounded border border-gray-300 bg-white">
        <TopNav
          title="传送点：起点坐标"
          showPrev
          showNext
          prevDisabled={false}
          nextDisabled={!canGoNextFromSrc}
          onPrev={() => {
            bridgeRef.current.clearTempPoints();
            setStep('info');
          }}
          onNext={applySrcPointAndNext}
        />

        <div className="space-y-2">
          <div className="text-xs text-gray-600">请在地图上点选起点坐标（触发方块位置）。</div>

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
        </div>
      </div>
    );
  }

  // step === 'tgt'
  const pTgt = firstPointOnly(draftPoint)[0];
  return (
    <div className="p-3 rounded border border-gray-300 bg-white">
      <TopNav
        title="传送点：目标点坐标"
        showPrev
        showNext
        prevDisabled={false}
        nextDisabled={!canCommit}
        onPrev={() => {
          setStep('src');
          bridgeRef.current.clearTempPoints();
        }}
        onNext={commit}
      />

      <div className="space-y-2">
        <div className="text-xs text-gray-600">请在地图上点选目标点坐标（传送到达位置）。</div>

        <LabeledInput
          label="高度值（可选，将写入 TGTelevation；若点坐标含 y，则优先使用 y）"
          value={tgtElevInput}
          placeholder="例如：64"
          type="number"
          onChange={(v) => setTgtElevInput(v)}
        />

        <div className="text-xs text-gray-700">
          当前点：{pTgt ? <span className="font-mono">{`x=${pTgt.x}, z=${pTgt.z}${Number.isFinite(pTgt.y as any) ? `, y=${pTgt.y}` : ''}`}</span> : '未选择'}
        </div>

        {saveError ? <div className="text-xs text-red-600">{saveError}</div> : null}

        <div className="flex items-center gap-2 pt-1">
          <AppButton
            type="button"
            className={`px-3 py-1.5 rounded text-sm border ${saving ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-50'}`}
            disabled={saving}
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
