import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkflowBridge } from './WorkflowHost';
import { loadRuleItemsForWorld } from '@/components/Rules/data/ruleDataSources';
import { useRuleDataStore } from '@/store/ruleDataStore';

type FeatureInfoAny = Record<string, any>;

export type SearchSelectConfig = {
  /** 用于缓存：同一 worldId + cacheKey 只加载一次 */
  cacheKey: string;

  /** 过滤条件：锁定需要搜索的要素范围 */
  filter: (fi: FeatureInfoAny) => boolean;

  /** 用于匹配搜索：识别字段 */
  getId: (fi: FeatureInfoAny) => string;
  getName: (fi: FeatureInfoAny) => string;

  /** 下拉展示：例如 Name(ID) */
  formatOption: (name: string, id: string) => string;
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

const POOL_CACHE: Record<string, SearchPoolOption[]> = {};

export function buildWorkflowSearchOptionsFromFeatures(features: FeatureInfoAny[], cfg: SearchSelectConfig): SearchPoolOption[] {
  const out: SearchPoolOption[] = [];
  for (const item of features) {
    if (!item || typeof item !== 'object') continue;
    const fi = item as FeatureInfoAny;
    if (!cfg.filter(fi)) continue;
    const id = String(cfg.getId(fi) ?? '').trim();
    const name = String(cfg.getName(fi) ?? '').trim();
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

async function loadPool(worldId: string, cfg: SearchSelectConfig, bridge: WorkflowBridge, datasetLoadedAt: number): Promise<SearchPoolOption[]> {
  const cacheId = `${worldId}::${cfg.cacheKey}::${datasetLoadedAt}`;
  if (POOL_CACHE[cacheId]) return POOL_CACHE[cacheId];

  const out: SearchPoolOption[] = [];

  const arr = await loadRuleItemsForWorld(worldId);
  out.push(...buildWorkflowSearchOptionsFromFeatures(arr as FeatureInfoAny[], cfg));

  const committed = bridge.getCommittedLayerJsonInfos?.() ?? [];
  for (const j of committed) {
    const fi = (j?.featureInfo ?? {}) as FeatureInfoAny;
    if (!fi || typeof fi !== 'object') continue;
    if (!cfg.filter(fi)) continue;
    const id = String(cfg.getId(fi) ?? '').trim();
    const name = String(cfg.getName(fi) ?? '').trim();
    if (!id || !name) continue;
    out.push({ id, name, display: cfg.formatOption(name, id), className: String(fi?.Class ?? '').trim() || undefined });
  }

  const map = new Map<string, SearchPoolOption>();
  for (const o of out) map.set(o.id, o);
  const list = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));

  POOL_CACHE[cacheId] = list;
  return list;
}

export default function WorkflowFeatureSearchSelect(props: Props) {
  const { bridge, label, value, onChange, placeholder, config, disabled } = props;

  const worldId = bridge.getCurrentWorldId();
  const datasetLoadedAt = useRuleDataStore((s) => s.datasets[worldId]?.loadedAt ?? 0);
  const [pool, setPool] = useState<SearchPoolOption[]>([]);
  const [poolError, setPoolError] = useState<string>('');
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
    setPoolError('');
    loadPool(worldId, config, bridge, datasetLoadedAt)
      .then((list) => {
        if (cancelled || !mountedRef.current) return;
        setPool(list);
      })
      .catch((e) => {
        if (cancelled || !mountedRef.current) return;
        setPoolError(String(e?.message ?? e));
        setPool([]);
      });
    return () => {
      cancelled = true;
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
    </div>
  );
}
