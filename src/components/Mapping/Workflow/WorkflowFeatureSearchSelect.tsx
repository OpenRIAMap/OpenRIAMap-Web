import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkflowBridge } from './WorkflowHost';
import { loadRuleItemsForWorld } from '@/components/Rules/data/ruleDataSources';
import { useRuleDataStore } from '@/store/ruleDataStore';
import AppCard from '@/components/ui/AppCard';

type FeatureInfoAny = Record<string, any>;

export type SearchSelectConfig = {
  /** 用于缓存：同一 worldId + cacheKey + 搜索配置签名复用同一静态基础池 */
  cacheKey: string;

  /** 过滤条件：锁定需要搜索的要素范围 */
  filter: (fi: FeatureInfoAny) => boolean;

  /** 用于匹配搜索：识别字段 */
  getId: (fi: FeatureInfoAny) => string;
  getName: (fi: FeatureInfoAny) => string;

  /** 下拉展示：例如 Name(ID) */
  formatOption: (name: string, id: string) => string;

  /** 可选：用于判断图层管理动态池缓存是否足够稳定 */
  searchFields?: string[];
  displayFields?: string[];
  returnFields?: string[];
  requiredFields?: string[];
};

type Props = {
  bridge: WorkflowBridge;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  config: SearchSelectConfig;
  /** 当未找到图片等场景时也保持输入框可用 */
  disabled?: boolean;
};

export type SearchPoolOption = { id: string; name: string; display: string; className?: string };

const CORE_SEARCH_FINGERPRINT_FIELDS = new Set(['ID', 'Class', 'Name', 'World', 'Kind', 'SKind', 'SKind2']);

const DEFAULT_ID_KEYS = [
  'ID',
  'Id',
  'id',
  'BuildingID',
  'StationID',
  'StructureID',
  'GeoID',
  'GeoUnitID',
  'LineID',
  'RoadID',
  'PointID',
  'PgonID',
  'PolylineID',
  'WRPointI2D',
  'buildingID',
  'buildingId',
  'stationID',
  'stationId',
  'pointID',
  'pointId',
  'pgonID',
  'pgonId',
  'polylineID',
  'polylineId',
];

const DEFAULT_NAME_KEYS = [
  'Name',
  'name',
  'BuildingName',
  'StationName',
  'StructureName',
  'GeoName',
  'GeoUnitName',
  'LineName',
  'RoadName',
  'PointName',
  'PgonName',
  'PolylineName',
  'buildingName',
  'stationName',
  'pointName',
  'pgonName',
  'polylineName',
  'Label',
  'label',
];

const STATIC_BASE_POOL_CACHE = new Map<string, SearchPoolOption[]>();
const COMMITTED_OVERLAY_POOL_CACHE = new Map<string, SearchPoolOption[]>();

function readFirstString(fi: FeatureInfoAny, keys: string[]): string {
  for (const key of keys) {
    const value = fi?.[key];
    if (value === null || value === undefined) continue;
    const s = String(value).trim();
    if (s) return s;
  }
  return '';
}

function readCandidateId(fi: FeatureInfoAny, cfg: SearchSelectConfig): string {
  const fromCfg = String(cfg.getId(fi) ?? '').trim();
  if (fromCfg) return fromCfg;
  return readFirstString(fi, DEFAULT_ID_KEYS);
}

function readCandidateName(fi: FeatureInfoAny, cfg: SearchSelectConfig): string {
  const fromCfg = String(cfg.getName(fi) ?? '').trim();
  if (fromCfg) return fromCfg;
  return readFirstString(fi, DEFAULT_NAME_KEYS);
}

function normalizeId(raw: any): string {
  return String(raw ?? '').trim();
}

function getSearchConfigRequiredFields(cfg: SearchSelectConfig): Set<string> {
  const fields = [
    ...(cfg.requiredFields ?? []),
    ...(cfg.searchFields ?? []),
    ...(cfg.displayFields ?? []),
    ...(cfg.returnFields ?? []),
  ]
    .map((x) => String(x ?? '').trim())
    .filter(Boolean);

  if (fields.length === 0) {
    fields.push('ID', 'Name');
  }
  return new Set(fields);
}

function buildSearchConfigSignature(cfg: SearchSelectConfig): string {
  const required = Array.from(getSearchConfigRequiredFields(cfg)).sort();
  return JSON.stringify({ cacheKey: cfg.cacheKey, required });
}

function canUseCoreCommittedFingerprint(cfg: SearchSelectConfig): boolean {
  return Array.from(getSearchConfigRequiredFields(cfg)).every((field) => CORE_SEARCH_FINGERPRINT_FIELDS.has(field));
}

function buildCommittedCoreFingerprint(committed: Array<{ featureInfo: FeatureInfoAny }>): string {
  const rows = committed
    .map((item) => {
      const info = (item?.featureInfo ?? {}) as FeatureInfoAny;
      return {
        ID: info.ID ?? '',
        Class: info.Class ?? '',
        Name: info.Name ?? '',
        World: info.World ?? '',
        Kind: info.Kind ?? '',
        SKind: info.SKind ?? '',
        SKind2: info.SKind2 ?? '',
      };
    })
    .sort((a, b) => {
      const ak = `${a.World}|${a.Class}|${a.ID}|${a.Name}|${a.Kind}|${a.SKind}|${a.SKind2}`;
      const bk = `${b.World}|${b.Class}|${b.ID}|${b.Name}|${b.Kind}|${b.SKind}|${b.SKind2}`;
      return ak.localeCompare(bk, 'zh-Hans-CN');
    });
  return JSON.stringify(rows);
}

function readDeleteMarkedIds(bridge: WorkflowBridge): Set<string> {
  const ids = bridge.getDeleteMarkedFeatureIds?.() ?? [];
  return new Set(ids.map((x) => normalizeId(x)).filter(Boolean));
}

export function buildWorkflowSearchOptionsFromFeatures(features: FeatureInfoAny[], cfg: SearchSelectConfig): SearchPoolOption[] {
  const out: SearchPoolOption[] = [];
  for (const item of features) {
    if (!item || typeof item !== 'object') continue;
    const fi = item as FeatureInfoAny;
    if (!cfg.filter(fi)) continue;
    const id = readCandidateId(fi, cfg);
    const name = readCandidateName(fi, cfg);
    if (!id || !name) continue;
    out.push({
      id,
      name,
      display: cfg.formatOption(name, id),
      className: String(fi?.Class ?? '').trim() || undefined,
    });
  }
  return out;
}

export function filterWorkflowSearchOptions(pool: SearchPoolOption[], q: string, limit = 50): SearchPoolOption[] {
  const s = q.trim().toLowerCase();
  if (!s) return pool.slice(0, limit);
  return pool
    .filter((o) =>
      o.name.toLowerCase().includes(s) ||
      o.id.toLowerCase().includes(s) ||
      o.display.toLowerCase().includes(s) ||
      String(o.className ?? '').toLowerCase().includes(s)
    )
    .slice(0, limit);
}

async function loadStaticBasePool(
  worldId: string,
  cfg: SearchSelectConfig,
  datasetLoadedAt: number,
  configSignature: string,
  setStage?: (text: string) => void,
): Promise<SearchPoolOption[]> {
  const staticCacheId = `${worldId}::${cfg.cacheKey}::${datasetLoadedAt}::${configSignature}`;
  const cached = STATIC_BASE_POOL_CACHE.get(staticCacheId);
  if (cached) return cached;

  setStage?.('正在读取当前数据源');
  const arr = await loadRuleItemsForWorld(worldId);
  const list = buildWorkflowSearchOptionsFromFeatures(arr as FeatureInfoAny[], cfg);
  STATIC_BASE_POOL_CACHE.set(staticCacheId, list);
  return list;
}

function loadCommittedOverlayPool(
  cfg: SearchSelectConfig,
  bridge: WorkflowBridge,
  configSignature: string,
  canUseCoreFingerprint: boolean,
  setStage?: (text: string) => void,
): SearchPoolOption[] {
  const committed = bridge.getCommittedLayerJsonInfos?.() ?? [];
  const validCommitted = committed
    .map((x) => ({ featureInfo: (x?.featureInfo ?? {}) as FeatureInfoAny }))
    .filter((x) => x.featureInfo && typeof x.featureInfo === 'object');

  if (canUseCoreFingerprint) {
    const fingerprint = buildCommittedCoreFingerprint(validCommitted);
    const committedCacheId = `${cfg.cacheKey}::${configSignature}::${fingerprint}`;
    const cached = COMMITTED_OVERLAY_POOL_CACHE.get(committedCacheId);
    if (cached) return cached;

    setStage?.('正在合并图层管理要素');
    const list = buildWorkflowSearchOptionsFromFeatures(validCommitted.map((x) => x.featureInfo), cfg);
    COMMITTED_OVERLAY_POOL_CACHE.set(committedCacheId, list);
    return list;
  }

  setStage?.('正在合并图层管理要素');
  return buildWorkflowSearchOptionsFromFeatures(validCommitted.map((x) => x.featureInfo), cfg);
}

async function loadPool(
  worldId: string,
  cfg: SearchSelectConfig,
  bridge: WorkflowBridge,
  datasetLoadedAt: number,
  setStage?: (text: string) => void,
): Promise<SearchPoolOption[]> {
  const configSignature = buildSearchConfigSignature(cfg);
  const useCoreFingerprint = canUseCoreCommittedFingerprint(cfg);

  // 给延迟加载框一次渲染机会，避免大池首次生成时 UI 完全无反馈。
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

  const staticPool = await loadStaticBasePool(worldId, cfg, datasetLoadedAt, configSignature, setStage);
  const committedPool = loadCommittedOverlayPool(cfg, bridge, configSignature, useCoreFingerprint, setStage);
  const deleteMarkedIds = readDeleteMarkedIds(bridge);

  setStage?.('正在应用删除标记');
  const merged = new Map<string, SearchPoolOption>();
  for (const item of staticPool) {
    const id = normalizeId(item.id);
    if (!id) continue;
    merged.set(id, item);
  }
  for (const item of committedPool) {
    const id = normalizeId(item.id);
    if (!id) continue;
    merged.set(id, item);
  }

  setStage?.('正在生成搜索候选项');
  return Array.from(merged.values())
    .filter((item) => !deleteMarkedIds.has(normalizeId(item.id)))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

export default function WorkflowFeatureSearchSelect(props: Props) {
  const { bridge, label, value, onChange, placeholder, config, disabled } = props;

  const worldId = bridge.getCurrentWorldId();
  const datasetLoadedAt = useRuleDataStore((s) => s.datasets[worldId]?.loadedAt ?? 0);
  const [pool, setPool] = useState<SearchPoolOption[]>([]);
  const [poolError, setPoolError] = useState<string>('');
  const [poolLoadingVisible, setPoolLoadingVisible] = useState(false);
  const [poolLoadingStage, setPoolLoadingStage] = useState('正在准备搜索池');
  const [open, setOpen] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let shown = false;
    const timer = window.setTimeout(() => {
      shown = true;
      setPoolLoadingStage('正在准备搜索池');
      setPoolLoadingVisible(true);
    }, 1000);

    const setStage = (text: string) => {
      if (!shown || cancelled || !mountedRef.current) return;
      setPoolLoadingStage(text);
    };

    setPoolError('');
    loadPool(worldId, config, bridge, datasetLoadedAt, setStage)
      .then((list) => {
        if (cancelled || !mountedRef.current) return;
        setPool(list);
      })
      .catch((e) => {
        if (cancelled || !mountedRef.current) return;
        setPoolError(String(e?.message ?? e));
        setPool([]);
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (!cancelled && mountedRef.current) {
          setPoolLoadingVisible(false);
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setPoolLoadingVisible(false);
    };
  }, [worldId, bridge, config, datasetLoadedAt]);

  const suggestions = useMemo(() => filterWorkflowSearchOptions(pool, String(value ?? ''), 50), [pool, value]);

  return (
    <div className="space-y-1">
      <div className="text-xs opacity-80">{label}</div>
      <input
        className="w-full border p-1 rounded text-sm"
        value={value ?? ''}
        placeholder={placeholder}
        disabled={!!disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        onMouseDownCapture={(e) => e.stopPropagation()}
        onPointerDownCapture={(e) => e.stopPropagation()}
        onTouchStartCapture={(e) => e.stopPropagation()}
      />

      {poolError ? <div className="text-xs text-rose-600">检索池加载失败：{poolError}</div> : null}

      {open && suggestions.length ? (
        <div className="border rounded bg-white max-h-40 overflow-auto">
          {suggestions.map((o) => (
            <button
              key={o.id}
              type="button"
              className="w-full text-left px-2 py-1 text-sm hover:bg-gray-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            >
              {o.display}
            </button>
          ))}
        </div>
      ) : null}

      {poolLoadingVisible ? (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/20" onMouseDown={(e) => e.stopPropagation()}>
          <AppCard className="w-[320px] p-4 shadow-2xl">
            <div className="text-sm font-semibold text-gray-800">正在重建搜索池</div>
            <div className="mt-2 text-xs text-gray-500">{poolLoadingStage}</div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-500" />
            </div>
          </AppCard>
        </div>
      ) : null}
    </div>
  );
}
