/**
 * 搜索组件
 * 支持搜索站点、地标和线路
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { HelpCircle, Search as SearchIcon } from 'lucide-react';
import type { ParsedStation, ParsedLine } from '@/types';
import type { ParsedLandmark } from '@/lib/landmarkParser';
import AppButton from '@/components/ui/AppButton';
import AppCard from '@/components/ui/AppCard';
import type { FeatureRecord } from '@/components/Rules/renderRules';
import { pickIdFieldValue } from '@/components/Rules/renderRules';
import { getRuleSearchPool } from '@/components/Rules/ruleSearchRegistry';
import { loadRailNewIndex, passLineBooleanFilters, type RailNewIndex } from '@/components/Navigation/railNewIndex';
import {
  isRuleBlacklisted,
  getRulePriorityIndex,
  getRuleCategoryLabelWithParent,
  getRuleDisplayName,
  buildBuildingNameIndex,
} from '@/components/Search/searchRuleTables';

// NOTE: blacklist & priority tables are now shared in searchRuleTables.ts

export interface SearchResult {
  type: 'station' | 'landmark' | 'line' | 'rule';
  name: string;
  coord: { x: number; y: number; z: number } | null;
  extra?: string;  // 额外信息，如线路或等级
  lineData?: ParsedLine;  // 线路数据（当 type 为 line 时）

  // rule 专用
  ruleRecord?: FeatureRecord;
}

interface SearchBarProps {
  stations: ParsedStation[];
  landmarks: ParsedLandmark[];
  lines: ParsedLine[];
  worldId: string;
  onSelect: (result: SearchResult) => void;
  onLineSelect?: (line: ParsedLine) => void;  // 线路选中回调
  mobile?: boolean;
  variant?: 'desktop' | 'mobile';
  onAboutClick?: () => void;
}

function normalizeQuery(q: string): string {
  return String(q ?? '').trim().toLowerCase();
}

// 兼容映射：将旧字段归一到 ID/Name（避免历史 index / localStorage 数据导致 build 环境崩溃）
function pickCompatId(v: any): string {
  return String(
    v?.ID ??
      v?.Id ??
      v?.id ??
      v?.lineId ??
      v?.stationID ??
      v?.landmarkID ??
      v?.globalId ??
      ''
  ).trim();
}

function pickCompatName(v: any): string {
  return String(
    v?.Name ??
      v?.name ??
      v?.stationName ??
      v?.landmarkName ??
      v?.lineName ??
      ''
  ).trim();
}

function normalizeHexColorInput(v: any): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const t = s.startsWith('0x') || s.startsWith('0X') ? `#${s.slice(2)}` : s;
  if (/^#[0-9a-fA-F]{3}$/.test(t) || /^#[0-9a-fA-F]{6}$/.test(t) || /^#[0-9a-fA-F]{8}$/.test(t)) return t;
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t}`;
  return t; // 允许 CSS color（例如 rgb(...)）
}

// isRuleBlacklisted / getRulePriorityIndex are shared

// getRuleCategoryName / getRuleDisplayName moved to searchRuleTables.ts (single source of truth)

type LineToken = { label: string; color: string; title?: string };

function extractLinePrefix(name: string): string {
  const s = String(name ?? '').trim();
  if (!s) return '';
  const idx = s.indexOf('线');
  if (idx >= 0) return s.slice(0, idx + 1);
  return s;
}

function getRuleCenterCoord(r: FeatureRecord): { x: number; y: number; z: number } | null {
  if (r?.p3) return { x: r.p3.x, y: r.p3.y, z: r.p3.z };
  const coords = Array.isArray(r?.coords3) ? r.coords3 : [];
  if (coords.length === 0) return null;
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
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    z: (minZ + maxZ) / 2,
  };
}

export function SearchBar({ stations, landmarks, lines, worldId, onSelect, onLineSelect, mobile = false, variant, onAboutClick }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [railIndex, setRailIndex] = useState<RailNewIndex | null>(null);
  const [dropdownWidth, setDropdownWidth] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 站场/站台/铁路新结构索引：用于“包含线路”与 RLE 颜色条。
  // - 采用 railNewIndex 的内部缓存，避免重复 fetch。
  useEffect(() => {
    let cancelled = false;
    loadRailNewIndex(worldId)
      .then((idx) => {
        if (!cancelled) setRailIndex(idx);
      })
      .catch(() => {
        if (!cancelled) setRailIndex(null);
      });
    return () => {
      cancelled = true;
    };
  }, [worldId]);

  // 用于楼层类（FLR/STF）的“所属建筑/车站建筑”名映射。
  // - 尽量复用 SearchPool（无需额外 fetch）
  const buildingNameIndex = useMemo(() => {
    const pool = getRuleSearchPool(worldId);
    const m = new Map<string, string>();
    for (const r of pool) {
      const fi: any = r?.featureInfo ?? {};
      const cls = String(r?.meta?.Class ?? fi?.Class ?? '').trim();
      if (cls !== 'BUD' && cls !== 'STB' && cls !== 'SBP') continue;

      const picked = pickIdFieldValue(fi, cls);
      const id = String((picked as any)?.idValue ?? '').trim();
      if (!id) continue;

      // 复用本文件内的 name 推导逻辑
      const dn = getRuleDisplayName(r);
      const name = String(dn?.rawName ?? dn?.name ?? '').trim();
      if (!name) continue;
      if (!m.has(id)) m.set(id, name);
    }
    return m;
  }, [worldId]);

  const getLineTokensForRule = (r: FeatureRecord | undefined | null): LineToken[] => {
    if (!r || !railIndex) return [];
    const fi: any = r?.featureInfo ?? {};
    const cls = String(r?.meta?.Class ?? fi?.Class ?? '').trim();

    const refs: Array<{ id: string; flags?: Record<string, boolean> }> = [];

    const collectFromPlf = (plfId: string) => {
      const pid = String(plfId ?? '').trim();
      if (!pid) return;
      const plf = railIndex.plfs.get(pid);
      if (!plf?.lines?.length) return;
      for (const lr of plf.lines) refs.push({ id: String(lr.id ?? '').trim(), flags: (lr as any)?.flags });
    };

    if (cls === 'PLF') {
      collectFromPlf(String(r?.meta?.idValue ?? fi?.ID ?? ''));
    } else if (cls === 'PFB') {
      collectFromPlf(String(fi?.ID ?? ''));
    } else if (cls === 'STA') {
      const stationId = String(r?.meta?.idValue ?? fi?.ID ?? '').trim();
      const sta = stationId ? railIndex.stas.get(stationId) : undefined;
      for (const pid of (sta?.platformIds ?? [])) collectFromPlf(pid);
    } else if (cls === 'STB' || cls === 'SBP') {
      const buildingId = String(r?.meta?.idValue ?? '').trim();
      const stationIds = buildingId && railIndex.buildingToStations.get(buildingId)
        ? Array.from(railIndex.buildingToStations.get(buildingId)!)
        : [];
      for (const sid of stationIds) {
        const sta = sid ? railIndex.stas.get(sid) : undefined;
        for (const pid of (sta?.platformIds ?? [])) collectFromPlf(pid);
      }
    }

    // 规则 0：过滤不可用线路 + 维持遍历顺序
    const picked: Array<{ id: string; bureau: string; line: string; name: string; prefix: string; color: string }> = [];
    for (const lr of refs) {
      const id = String(lr.id ?? '').trim();
      if (!id) continue;
      if (!passLineBooleanFilters(lr.flags)) continue;
      const rle = railIndex.rles.get(id);
      if (!rle) continue;
      const name = String(rle.name || rle.line || rle.id || id).trim();
      const prefix = extractLinePrefix(name);
      const color = normalizeHexColorInput((rle as any)?.color) || '#999999';
      picked.push({ id, bureau: String((rle as any)?.bureau ?? '').trim(), line: String((rle as any)?.line ?? '').trim(), name, prefix, color });
    }
    if (picked.length === 0) return [];

    // 规则 1：按 bureau+line 组合进行“建制去重”
    const groups = new Map<string, Array<typeof picked[number]>>();
    const orderKeys: string[] = [];
    for (const it of picked) {
      const key = it.bureau && it.line ? `${it.bureau}@@${it.line}` : `__id__@@${it.id}`;
      if (!groups.has(key)) {
        groups.set(key, []);
        orderKeys.push(key);
      }
      groups.get(key)!.push(it);
    }

    const out: LineToken[] = [];
    const seen = new Set<string>();

    const pushToken = (label: string, color: string, title?: string) => {
      const k = `${label}@@${color}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ label, color, title });
    };

    for (const gk of orderKeys) {
      const arr = groups.get(gk) ?? [];
      if (arr.length === 0) continue;
      if (arr.length === 1) {
        const a = arr[0];
        pushToken(a.prefix || a.name, a.color, a.name);
        continue;
      }

      // 同 bureau+line：检查“线”字之前是否一致
      const firstPrefix = String(arr[0].prefix || '').trim();
      const allSamePrefix = firstPrefix && arr.every((x) => String(x.prefix || '').trim() === firstPrefix);
      if (allSamePrefix) {
        pushToken(firstPrefix, arr[0].color, arr.map((x) => x.name).join(' / '));
        continue;
      }

      // 若不一致：按 prefix 再去重（保持首个出现的色号）
      const localSeen = new Set<string>();
      for (const a of arr) {
        const p = String(a.prefix || a.name).trim();
        if (!p) continue;
        if (localSeen.has(p)) continue;
        localSeen.add(p);
        pushToken(p, a.color, a.name);
      }
    }

    return out;
  };

  // 下拉宽度：若“灰字 + 线路条 + 坐标”整体超出输入框，则自动加宽（不换行）。
  useEffect(() => {
    if (!isOpen || results.length === 0) {
      setDropdownWidth(null);
      return;
    }
    const t = window.setTimeout(() => {
      const base = containerRef.current?.getBoundingClientRect().width ?? 0;
      const rows = Array.from(dropdownRef.current?.querySelectorAll('[data-sr-row]') ?? []);
      let mx = base;
      for (const el of rows) {
        const w = (el as HTMLElement).scrollWidth;
        if (Number.isFinite(w) && w > mx) mx = w;
      }
      setDropdownWidth(mx > 0 ? Math.ceil(mx) : null);
    }, 0);
    return () => window.clearTimeout(t);
  }, [isOpen, results]);

  // 搜索逻辑
  useEffect(() => {
    if (query.length < 1) {
      setResults([]);
      return;
    }

    const searchQuery = normalizeQuery(query);
    const matchedResults: SearchResult[] = [];

    // 搜索线路（优先显示）
    for (const line of lines) {
      const anyLine: any = line as any;
      const id = pickCompatId(anyLine);
      const name = pickCompatName(anyLine);
      const bureau = String(anyLine?.bureau ?? '').trim();
      const lineNo = String(anyLine?.line ?? '').trim();

      // 优先使用通用 Name；若缺失则回退到旧字段格式（保持原展示风格）
      const displayName = name
        ? name
        : (bureau === 'RMP'
          ? lineNo
          : (bureau || lineNo)
            ? `${bureau}局${lineNo}号线`
            : id);

      const altName = bureau && lineNo ? `${bureau}-${lineNo}` : '';
      const hay = `${id} ${displayName} ${altName} ${bureau} ${lineNo}`.toLowerCase();

      if (hay.includes(searchQuery)) {
        // 计算线路中点作为定位坐标
        const midIndex = Math.floor(line.stations.length / 2);
        const midStation = line.stations[midIndex] || line.stations[0];

        matchedResults.push({
          type: 'line',
          name: displayName,
          coord: midStation?.coord || { x: 0, y: 64, z: 0 },
          extra: '旧+线路',
          lineData: line,
        });
      }
    }

    // 搜索站点
    for (const station of stations) {
      const anySta: any = station as any;
      const id = pickCompatId(anySta);
      const name = pickCompatName(anySta) || String(anySta?.name ?? '').trim();
      const hay = `${id} ${name}`.toLowerCase();
      if (hay.includes(searchQuery)) {
        matchedResults.push({
          type: 'station',
          name: name || String(anySta?.name ?? '').trim(),
          coord: anySta?.coord ?? null,
          extra: '旧+车站',
        });
      }
    }

    // 搜索地标（支持名称和编号搜索）
    for (const landmark of landmarks) {
      const anyLm: any = landmark as any;
      const coord = anyLm?.coord;
      if (!coord) continue;

      const id = pickCompatId(anyLm) || String(anyLm?.id ?? '').trim();
      const name = pickCompatName(anyLm) || String(anyLm?.name ?? '').trim();

      // 支持按编号搜索（如 #42 或 42）
      const idString = String(id);
      const idWithHash = idString ? `#${idString}` : '';
      const nameMatch = String(name).toLowerCase().includes(searchQuery);
      const idMatch = idWithHash
        ? (searchQuery.startsWith('#')
          ? idWithHash.toLowerCase() === searchQuery || idWithHash.toLowerCase().startsWith(searchQuery)
          : idString === searchQuery || idString.startsWith(searchQuery))
        : false;

      if (nameMatch || idMatch) {
        matchedResults.push({
          type: 'landmark',
          name: idString ? `#${idString} ${name}`.trim() : name,
          coord,
          extra: '旧+地标',
        });
      }
    }

    // 搜索 Rules（当前世界预加载池；包含临时挂载启用数据；不包含“被更新挂载替换而暂时停用”的记录）
    // - 这里只做模糊检索（name/id）；点击后由 MapContainer 负责聚焦/缩放 & 发事件给 RuleDrivenLayer 打开信息卡。
    const rulePool = getRuleSearchPool(worldId);
    const buildingNameIndex = rulePool.length ? buildBuildingNameIndex(rulePool) : null;
    if (rulePool.length) {
      for (const r of rulePool) {
        const fi: any = r?.featureInfo ?? {};
        const cls = String(r?.meta?.Class ?? fi?.Class ?? '').trim();

        // 临时挂载“更新挂载”覆盖：被覆盖的记录会在 globalIdIndex 侧标记为 disabled
        // （在 SearchBar 侧不硬编码字段名，优先读 meta.disabled / featureInfo.__disabled ）
        const disabled = (r as any)?.meta?.disabled || (fi as any)?.__disabled;
        if (disabled) continue;

        // 搜索黑名单：按 Class/Kind/SKind/SKind2 过滤不希望被检索到的要素
        if (isRuleBlacklisted(r)) continue;

        const dn = getRuleDisplayName(r);
        // 规则要素检索：仅按 Name/ID/Class 做模糊匹配（不包含 Kind/SKind/SKind2 的编码检索）。
        const hay = `${dn.name} ${dn.rawName} ${cls} ${dn.idValue}`.toLowerCase();
        if (!hay.includes(searchQuery)) continue;

        const center = getRuleCenterCoord(r);
        matchedResults.push({
          type: 'rule',
          name: dn.name,
          coord: center,
          extra: getRuleCategoryLabelWithParent(r, buildingNameIndex),
          ruleRecord: r,
        });
      }
    }

    // 规则要素排序：命中“优先级表”的类型，按表内顺序提前显示；其余保持原顺序。
    const nonRule = matchedResults.filter((x) => x.type !== 'rule');
    const ruleWithOrder = matchedResults
      .map((x, i) => ({ x, i }))
      .filter((it) => it.x.type === 'rule');

    ruleWithOrder.sort((a, b) => {
      const pa = a.x.ruleRecord ? getRulePriorityIndex(a.x.ruleRecord) : Number.POSITIVE_INFINITY;
      const pb = b.x.ruleRecord ? getRulePriorityIndex(b.x.ruleRecord) : Number.POSITIVE_INFINITY;
      if (pa !== pb) return pa - pb;
      return a.i - b.i; // 稳定排序
    });

    const finalResults = [...nonRule, ...ruleWithOrder.map((it) => it.x)];

    // 限制结果数量
    setResults(finalResults.slice(0, 35));
  }, [query, stations, landmarks, lines, worldId]);

  // 点击外部关闭
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 依据当前结果内容动态调整下拉框宽度：
  // - 灰字信息优先完整显示；线路条区域不足时整体加宽（不换行）。
  useEffect(() => {
    if (!isOpen || results.length === 0) {
      setDropdownWidth(null);
      return;
    }
    const t = window.setTimeout(() => {
      const baseW = containerRef.current?.getBoundingClientRect().width ?? 0;
      const root = dropdownRef.current;
      if (!root) return;
      const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-sr-row]'));

      let maxW = baseW;
      rows.forEach((row) => {
        // 关键：测量“内容本身”的宽度，避免因此前被加宽后 scrollWidth=clientWidth 导致无法缩回。
        const left = row.querySelector<HTMLElement>('[data-sr-left-inner]');
        const coord = row.querySelector<HTMLElement>('[data-sr-coord]');
        if (!left || !coord) return;

        // left-inner 为 w-fit：scrollWidth 不会被父容器加宽后的 clientWidth 撑大
        const leftW = left.scrollWidth;
        const coordW = coord.scrollWidth;
        // gap：线路条与坐标之间的固定间距（ml-3 ≈ 12px），再加按钮左右 padding + 轻微余量。
        const needed = leftW + 12 + coordW + 24 + 16;
        if (needed > maxW) maxW = needed;
      });

      setDropdownWidth(maxW > 0 ? Math.ceil(maxW) : null);
    }, 0);
    return () => window.clearTimeout(t);
  }, [isOpen, results]);


  const isMobileVariant = variant ? variant === 'mobile' : mobile;
  const shellClassName = isMobileVariant
    ? 'flex items-center min-h-[50px] rounded-[24px] px-1'
    : 'flex items-center min-h-[54px] sm:min-h-0 rounded-2xl';
  const inputClassName = isMobileVariant
    ? 'flex-1 min-w-0 w-full px-3 py-2.5 text-[16px] outline-none rounded-r-[24px] bg-transparent'
    : 'flex-1 w-full sm:w-64 px-3 sm:px-3 py-3 sm:py-2 text-base sm:text-sm outline-none rounded-r-2xl bg-transparent';

  const handleSelect = (result: SearchResult) => {
    // 如果是线路，调用线路选中回调
    if (result.type === 'line' && result.lineData && onLineSelect) {
      onLineSelect(result.lineData);
    }
    onSelect(result);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${isMobileVariant ? 'flex items-stretch gap-2' : ''}`}>
      <AppCard className={`${shellClassName} ${isMobileVariant && onAboutClick ? 'flex-1 min-w-0' : ''}`}>
        <span className="pl-4 sm:pl-3 text-gray-400">
          <SearchIcon className={`${isMobileVariant ? 'w-5 h-5' : 'w-5 h-5'} sm:w-5 sm:h-5`} />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="搜索线路、站点、地标或规则要素..."
          className={inputClassName}
        />
      </AppCard>

      {isMobileVariant && onAboutClick ? (
        <AppButton
          onClick={onAboutClick}
          className="h-[50px] w-[50px] rounded-[24px] bg-white/95 text-gray-600 flex items-center justify-center shadow-[0_12px_30px_rgba(0,0,0,0.12)] border border-gray-200/70 shrink-0"
          title="关于"
        >
          <HelpCircle className="w-5 h-5" />
        </AppButton>
      ) : null}

      {/* 搜索结果下拉框 */}
      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef as any}
          className="absolute top-full left-0 mt-1 z-50"
          style={{ width: dropdownWidth ?? undefined }}
        >
          <AppCard className="max-h-80 overflow-y-auto">
            {results.map((result, index) => (
	            <AppButton
              key={`${result.type}-${result.name}-${index}`}
              className="w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center justify-start border-b border-gray-100 last:border-b-0"
              onClick={() => handleSelect(result)}
            >
	              <div data-sr-row className="flex w-full items-center">
	                {/* 名称和额外信息（始终左对齐；不跟随下拉框宽度变化而居中） */}
	                <div data-sr-left className="flex-1 min-w-0">
	                  {/* inner 使用 w-fit，确保 scrollWidth 代表“真实内容宽度”，下拉框可随结果缩回 */}
	                  <div data-sr-left-inner className="inline-flex flex-col w-fit">
	                    <div className="text-sm font-medium text-gray-800 whitespace-nowrap">
	                      {result.name}
	                    </div>
	                    {result.extra && (
	                      <div className="text-xs text-gray-500 flex items-center gap-2 whitespace-nowrap">
                    <span className="shrink-0">{(() => {
                      if (result.type !== 'rule') return result.extra;
                      const r = result.ruleRecord;
                      const fi: any = r?.featureInfo ?? {};
                      const cls = String(r?.meta?.Class ?? fi?.Class ?? '').trim();

                      // 楼层类：补充所属建筑/车站建筑名，避免“同名楼层”歧义
                      if (cls === 'FLR') {
                        const bid = String(fi?.BuildingID ?? fi?.buildingID ?? fi?.buildingId ?? '').trim();
                        const bname = bid ? (buildingNameIndex.get(bid) || '') : '';
                        return bname ? `${result.extra}（${bname}）` : result.extra;
                      }
                      if (cls === 'STF') {
                        const bid = String(fi?.staBuildingID ?? fi?.staBuildingId ?? fi?.STBuilding ?? fi?.BuildingID ?? '').trim();
                        const bname = bid ? (buildingNameIndex.get(bid) || '') : '';
                        return bname ? `${result.extra}（${bname}）` : result.extra;
                      }
                      return result.extra;
                    })()}</span>

                    {/* 包含线路：PLF/PFB/STA/STB */}
                    {result.type === 'rule' && (() => {
                      const r = result.ruleRecord;
                      const fi: any = r?.featureInfo ?? {};
                      const cls = String(r?.meta?.Class ?? fi?.Class ?? '').trim();
                      if (!['PLF', 'PFB', 'STA', 'STB', 'SBP'].includes(cls)) return null;
                      const tokens = getLineTokensForRule(r);
                      if (!tokens.length) return null;
                      return (
                        <div className="flex items-center gap-1 flex-nowrap">
                          {tokens.map((it, idx) => (
                            <span
                              key={`${it.label}-${idx}`}
                              className="inline-flex flex-none w-fit shrink-0 items-center rounded px-1.5 border text-[9px] font-semibold leading-[14px] h-[14px] whitespace-nowrap"
                              style={{ borderColor: it.color, backgroundColor: it.color, color: '#ffffff' }}
                              title={it.title ?? it.label}
                            >
                              {it.label}
                            </span>
                          ))}
                        </div>
                      );
                    })()}

                    {/* RLE：颜色条（与信息卡一致） */}
                    {result.type === 'rule' && (() => {
                      const r = result.ruleRecord;
                      const fi: any = r?.featureInfo ?? {};
                      const cls = String(r?.meta?.Class ?? fi?.Class ?? '').trim();
                      if (cls !== 'RLE') return null;
                      const color = normalizeHexColorInput(fi?.color ?? fi?.Color) || '#999999';
                      return (
                        <span
                          className="inline-block rounded-sm"
                          style={{ width: 22, height: 14, backgroundColor: color }}
                          title={color}
                        />
                      );
                    })()}
	                      </div>
	                    )}
	                  </div>
	                </div>

	                {/* 坐标（始终靠右） */}
	                <div data-sr-coord className="text-xs text-gray-400 flex-none ml-3">
	                  {result.coord ? `${Math.round(result.coord.x)}, ${Math.round(result.coord.z)}` : '--, --'}
	                </div>
	              </div>
            </AppButton>
            ))}
          </AppCard>
        </div>
      )}

      {/* 无结果提示 */}
      {isOpen && query.length > 0 && results.length === 0 && (
        <AppCard className="absolute top-full left-0 right-0 mt-1 p-3 text-sm text-gray-500 z-50">
          未找到匹配结果
        </AppCard>
      )}
    </div>
  );
}

export default SearchBar;