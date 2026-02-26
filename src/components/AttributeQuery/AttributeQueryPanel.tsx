import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { X, Filter, Search, Plus, Trash2 } from 'lucide-react';
import AppCard from '@/components/ui/AppCard';
import AppButton from '@/components/ui/AppButton';

import { getRuleSearchPool } from '@/components/Rules/ruleSearchRegistry';
import { getValueByPath, pickIdFieldValue, type FeatureRecord } from '@/components/Rules/renderRules';
import type { SearchResult } from '@/components/Search/SearchBar';

type Op = '=' | '!=' | '>' | '>=' | '<' | '<=';

// Join with previous rows:
// - 并：需要同时满足（交集）
// - 或：满足任一条件（并集）
type Join = 'UNION' | 'INTERSECT';

type QueryRow = {
  id: string;
  join: Join; // 与上一行的组合方式（第一行 join 无意义）
  field: string;
  op: Op;
  value: string;
};

const makeRow = (join: Join = 'INTERSECT'): QueryRow => ({
  id: (globalThis as any).crypto?.randomUUID?.() ?? String(Date.now() + Math.random()),
  join,
  field: '',
  op: '=',
  value: '',
});

export function AttributeQueryPanel({
  worldId,
  onSelect,
  onClose,
}: {
  worldId: string;
  onSelect: (r: SearchResult) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<QueryRow[]>([makeRow('INTERSECT')]);
  const [results, setResults] = useState<FeatureRecord[]>([]);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 打开后默认聚焦
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, []);

  const pool = useMemo(() => getRuleSearchPool(worldId), [worldId]);

  const resetAll = () => {
    setRows([makeRow('INTERSECT')]);
    setResults([]);
    setSearched(false);
  };

  const close = () => {
    resetAll();
    onClose();
  };

  const getRuleDisplayName = (r: FeatureRecord): { name: string; idValue: string; cls: string } => {
    const fi: any = r?.featureInfo ?? {};
    const tags: any = (fi?.tags ?? fi?.Tags ?? {}) as any;
    const cls = String(r?.meta?.Class ?? fi?.Class ?? '').trim();

    const picked = pickIdFieldValue(fi, cls);
    const idField = String((picked as any)?.idField ?? '').trim();
    const idValue = String((picked as any)?.idValue ?? '').trim();

    const keyMap = (() => {
      const m = new Map<string, string>();
      if (!fi || typeof fi !== 'object') return m;
      for (const k of Object.keys(fi)) m.set(String(k).toLowerCase(), k);
      return m;
    })();

    const tryGet = (obj: any, k: string) => {
      const v = obj?.[k];
      return v === null || v === undefined ? '' : String(v).trim();
    };
    const tryGetCI = (k: string) => {
      const direct = tryGet(fi, k) || tryGet(tags, k);
      if (direct) return direct;
      const realKey = keyMap.get(String(k).toLowerCase());
      return realKey ? (tryGet(fi, realKey) || tryGet(tags, realKey)) : '';
    };

    let rawName = '';
    if (idField) {
      const derivedNameKey = idField.replace(/ID$/i, 'Name');
      rawName = tryGetCI(derivedNameKey);
      if (!rawName && derivedNameKey && derivedNameKey[0]) {
        const cap = derivedNameKey[0].toUpperCase() + derivedNameKey.slice(1);
        rawName = tryGetCI(cap);
      }
    }
    if (!rawName) {
      const commonKeys = ['Name', 'name', 'ID', 'id'];
      for (const k of commonKeys) {
        rawName = tryGetCI(k);
        if (rawName) break;
      }
    }

    const name = rawName ? rawName : idValue ? `${cls} ${idValue}` : `${cls}`;
    return { name, idValue, cls };
  };

  const getPolylineMidpoint = (coords: Array<{ x: number; y: number; z: number }>) => {
    if (!coords?.length) return null;
    if (coords.length === 1) return coords[0];
    let total = 0;
    const seg: number[] = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i];
      const b = coords[i + 1];
      const dx = (b.x ?? 0) - (a.x ?? 0);
      const dy = (b.y ?? 0) - (a.y ?? 0);
      const dz = (b.z ?? 0) - (a.z ?? 0);
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      seg.push(l);
      total += l;
    }
    if (total <= 0) return coords[Math.floor(coords.length / 2)];
    const half = total / 2;
    let acc = 0;
    for (let i = 0; i < seg.length; i++) {
      const l = seg[i];
      if (acc + l >= half) {
        const t = l > 0 ? (half - acc) / l : 0;
        const a = coords[i];
        const b = coords[i + 1];
        return { x: a.x + (b.x - a.x) * t, y: (a.y ?? 64) + ((b.y ?? 64) - (a.y ?? 64)) * t, z: a.z + (b.z - a.z) * t };
      }
      acc += l;
    }
    return coords[coords.length - 1];
  };

  const getPolygonCenter = (coords: Array<{ x: number; y: number; z: number }>) => {
    if (!coords?.length) return null;
    let minX = coords[0].x, maxX = coords[0].x;
    let minZ = coords[0].z, maxZ = coords[0].z;
    let minY = coords[0].y, maxY = coords[0].y;
    for (const c of coords) {
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.z < minZ) minZ = c.z;
      if (c.z > maxZ) maxZ = c.z;
      if (c.y < minY) minY = c.y;
      if (c.y > maxY) maxY = c.y;
    }
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
  };

  const getRepresentativeCoord = (r: FeatureRecord) => {
    if (r?.p3) return r.p3;
    const coords = Array.isArray(r?.coords3) ? r.coords3 : [];
    if (!coords.length) return null;
    if (r.type === 'Polyline') return getPolylineMidpoint(coords);
    if (r.type === 'Polygon') return getPolygonCenter(coords);
    return coords[0];
  };

  const resolveFieldValue = (fi: any, fieldName: string): any => {
    const f = String(fieldName ?? '').trim();
    if (!f) return undefined;

    // 1) 支持 path：tags.xxx / Tags.xxx
    const byPath = getValueByPath(fi, f);
    if (byPath !== undefined) return byPath;

    // 2) 兼容 tags 作为根
    const tags = fi?.tags ?? fi?.Tags;
    const byTagsPath = tags ? getValueByPath(tags, f) : undefined;
    if (byTagsPath !== undefined) return byTagsPath;

    // 3) 字段名大小写兼容
    if (fi && typeof fi === 'object') {
      const keyMap = new Map<string, string>();
      for (const k of Object.keys(fi)) keyMap.set(String(k).toLowerCase(), k);
      const rk = keyMap.get(f.toLowerCase());
      if (rk) return fi?.[rk];
    }

    return undefined;
  };

  const pass = (raw: any, op: Op, valueText: string): boolean => {
    if (raw === undefined) return false;
    const vt = String(valueText ?? '').trim();
    const rs = raw === null ? '' : String(raw).trim();

    const rn = Number(rs);
    const vn = Number(vt);
    const rawIsNum = Number.isFinite(rn) && rs !== '';
    const valIsNum = Number.isFinite(vn) && vt !== '';

    if (op === '=' || op === '!=') {
      if (rawIsNum && valIsNum) return op === '=' ? rn === vn : rn !== vn;
      const ok = rs === vt;
      return op === '=' ? ok : !ok;
    }

    // 其他比较：优先数值
    if (rawIsNum && valIsNum) {
      if (op === '>') return rn > vn;
      if (op === '>=') return rn >= vn;
      if (op === '<') return rn < vn;
      if (op === '<=') return rn <= vn;
    }
    return false;
  };

  const runSearch = () => {
    const cleaned = rows
      .map((r) => ({ ...r, field: r.field.trim(), value: r.value.trim() }))
      .filter((r) => r.field && r.value);

    if (!cleaned.length) {
      setResults([]);
      setSearched(true);
      return;
    }

    const calcOne = (row: QueryRow): FeatureRecord[] => {
      const out: FeatureRecord[] = [];
      for (const r of pool) {
        const fi: any = r?.featureInfo ?? {};
        const raw = resolveFieldValue(fi, row.field);
        if (!pass(raw, row.op, row.value)) continue;
        out.push(r);
        if (out.length >= 2000) break; // 多行组合前允许更多候选，后续再裁剪
      }
      return out;
    };

    let current: Map<string, FeatureRecord> | null = null;

    for (let i = 0; i < cleaned.length; i++) {
      const row = cleaned[i];
      const list = calcOne(row);
      const m = new Map<string, FeatureRecord>();
      for (const r of list) m.set(r.uid, r);

      if (!current) {
        current = m;
        continue;
      }

      // 并：交集（必须同时满足）
      // 或：并集（满足任一）
      if (row.join === 'INTERSECT') {
        for (const k of Array.from(current.keys())) {
          if (!m.has(k)) current.delete(k);
        }
      } else {
        for (const [k, v] of m) current.set(k, v);
      }
    }

    const out = current ? Array.from(current.values()).slice(0, 200) : [];
    setResults(out);
    setSearched(true);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') runSearch();
  };

  return (
    <AppCard className="bg-white/95 w-96 max-w-[92vw]">
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-emerald-600" />
          <h3 className="font-bold text-gray-800">按属性查询</h3>
        </div>
        <AppButton onClick={close} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded" title="关闭">
          <X className="w-4 h-4" />
        </AppButton>
      </div>

      <div className="p-3 border-b">
        <div className="space-y-2">
          {rows.map((row, idx) => (
            <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
              {idx === 0 ? (
                <div className="col-span-2 text-[11px] text-gray-500">条件</div>
              ) : (
                <select
                  className="col-span-2 px-2 py-1.5 border rounded text-sm bg-white"
                  value={row.join}
                  onChange={(e) =>
                    setRows((p) => p.map((x) => (x.id === row.id ? { ...x, join: e.target.value as Join } : x)))
                  }
                  title="与上一行组合"
                >
                  <option value="INTERSECT">并</option>
                  <option value="UNION">或</option>
                </select>
              )}

              <input
                ref={idx === 0 ? inputRef : undefined}
                className="col-span-4 px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="字段（如 Class / tags.Kind）"
                value={row.field}
                onChange={(e) => setRows((p) => p.map((x) => (x.id === row.id ? { ...x, field: e.target.value } : x)))}
                onKeyDown={onKeyDown}
              />

              <select
                className="col-span-2 px-2 py-1.5 border rounded text-sm bg-white"
                value={row.op}
                onChange={(e) => setRows((p) => p.map((x) => (x.id === row.id ? { ...x, op: e.target.value as Op } : x)))}
              >
                <option value="=">=</option>
                <option value="!=">!=</option>
                <option value=">">&gt;</option>
                <option value=">=">&gt;=</option>
                <option value="<">&lt;</option>
                <option value="<=">&lt;=</option>
              </select>

              <input
                className="col-span-3 px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="值"
                value={row.value}
                onChange={(e) => setRows((p) => p.map((x) => (x.id === row.id ? { ...x, value: e.target.value } : x)))}
                onKeyDown={onKeyDown}
              />

              <AppButton
                onClick={() => setRows((p) => (p.length <= 1 ? p : p.filter((x) => x.id !== row.id)))}
                className="col-span-1 p-1.5 border rounded bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-50"
                disabled={rows.length <= 1}
                title="删除此行"
              >
                <Trash2 className="w-4 h-4" />
              </AppButton>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="text-[11px] text-gray-500">范围：当前世界预加载池（含临时挂载）</div>
          <div className="flex items-center gap-2">
            <AppButton
              onClick={() => setRows((p) => [...p, makeRow('INTERSECT')])}
              className="px-2 py-1 text-xs border rounded bg-white hover:bg-gray-50 text-gray-600 flex items-center gap-1"
              title="添加条件"
            >
              <Plus className="w-3 h-3" />
              添加
            </AppButton>
            <AppButton
              onClick={resetAll}
              className="px-2 py-1 text-xs border rounded bg-white hover:bg-gray-50 text-gray-600"
              title="清空"
            >
              清空
            </AppButton>
            <AppButton
              onClick={runSearch}
              className="px-2 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1"
              title="搜索"
            >
              <Search className="w-3 h-3" />
              搜索
            </AppButton>
          </div>
        </div>
      </div>

      <div className="p-2 max-h-[50vh] overflow-auto">
        {searched && results.length === 0 && (
          <div className="text-sm text-gray-500 px-2 py-3">未找到匹配要素</div>
        )}

        {results.length > 0 && (
          <div className="text-[11px] text-gray-500 px-2 py-1">共 {results.length} 条（最多显示 200 条）</div>
        )}

        <div className="space-y-1">
          {results.map((r) => {
            const { name, idValue, cls } = getRuleDisplayName(r);
            const coord = getRepresentativeCoord(r);
            const subtitle = idValue ? `${cls} · ${idValue}` : cls;
            return (
              <AppButton
                key={r.uid}
                onClick={() => {
                  onSelect({
                    type: 'rule',
                    name,
                    coord: coord ? { x: coord.x, y: coord.y ?? 64, z: coord.z } : null,
                    ruleRecord: r,
                  });
                }}
                className="w-full px-2 py-2 text-left rounded hover:bg-gray-50 flex items-center justify-between"
                title="定位并打开信息卡"
              >
                <div className="min-w-0">
                  <div className="text-sm text-gray-800 truncate">{name}</div>
                  <div className="text-[11px] text-gray-500 truncate">{subtitle}</div>
                </div>
                <div className="text-[11px] text-emerald-600 flex-shrink-0">定位</div>
              </AppButton>
            );
          })}
        </div>
      </div>
    </AppCard>
  );
}
