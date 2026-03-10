import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkflowBridge } from './WorkflowHost';
import { RULE_DATA_SOURCES } from '@/components/Rules/data/ruleDataSources';

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

type Option = { id: string; name: string; display: string };

const POOL_CACHE: Record<string, Option[]> = {};

async function fetchJsonArray(url: string): Promise<any[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${url}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function loadPool(worldId: string, cfg: SearchSelectConfig, bridge: WorkflowBridge): Promise<Option[]> {
  const cacheId = `${worldId}::${cfg.cacheKey}`;
  if (POOL_CACHE[cacheId]) return POOL_CACHE[cacheId];

  const out: Option[] = [];

  // (1) 预加载规则数据：RULE_DATA_SOURCES
  const ds = (RULE_DATA_SOURCES as any)?.[worldId];
  if (ds && ds.baseUrl && Array.isArray(ds.files)) {
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
        const fi = item as FeatureInfoAny;
        if (!cfg.filter(fi)) continue;
        const id = String(cfg.getId(fi) ?? '').trim();
        const name = String(cfg.getName(fi) ?? '').trim();
        if (!id || !name) continue;
        out.push({ id, name, display: cfg.formatOption(name, id) });
      }
    }
  }

  // (2) 当前已绘制但未预加载挂载的数据（可选）：bridge.getCommittedLayerJsonInfos
  const committed = bridge.getCommittedLayerJsonInfos?.() ?? [];
  for (const j of committed) {
    const fi = (j?.featureInfo ?? {}) as FeatureInfoAny;
    if (!fi || typeof fi !== 'object') continue;
    if (!cfg.filter(fi)) continue;
    const id = String(cfg.getId(fi) ?? '').trim();
    const name = String(cfg.getName(fi) ?? '').trim();
    if (!id || !name) continue;
    out.push({ id, name, display: cfg.formatOption(name, id) });
  }

  // 去重（以 id 为主键）
  const map = new Map<string, Option>();
  for (const o of out) map.set(o.id, o);
  const list = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));

  POOL_CACHE[cacheId] = list;
  return list;
}

function matchOption(o: Option, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return false;
  return o.name.toLowerCase().includes(s) || o.id.toLowerCase().includes(s) || o.display.toLowerCase().includes(s);
}

export default function WorkflowFeatureSearchSelect(props: Props) {
  const { bridge, label, value, onChange, placeholder, config, disabled } = props;

  const worldId = bridge.getCurrentWorldId();
  const [pool, setPool] = useState<Option[]>([]);
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
    loadPool(worldId, config, bridge)
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
  }, [worldId, bridge, config]);

  const suggestions = useMemo(() => {
    const q = String(value ?? '').trim();
    if (!q) return [];
    const list = pool.filter((o) => matchOption(o, q));
    return list.slice(0, 50);
  }, [pool, value]);

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
          // 延迟关闭：允许点击下拉项时不被 blur 打断
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
                // 选择后直接把“返回值”写入输入框（并保持可继续编辑）
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
