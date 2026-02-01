import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RULE_BUTTON_DEFS,
  RULE_BUTTON_POLICY,
  DEFAULT_ACTIVE_RULE_BUTTONS_BY_WORLD,
  DEFAULT_ACTIVE_RULE_BUTTONS_FALLBACK,
} from './buttonRuleConfig';

export type RuleButtonState = {
  /** 以“启用顺序”存储的 active id 列表（用于 maxActive 的淘汰策略） */
  activeOrdered: string[];
};

const STORAGE_KEY = 'ria_rule_button_state_v1';

function uniqKeepOrder(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of list) {
    const k = String(v ?? '').trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function getDefaultActive(worldId: string): string[] {
  const byWorld = DEFAULT_ACTIVE_RULE_BUTTONS_BY_WORLD[String(worldId)];
  return uniqKeepOrder(byWorld ?? DEFAULT_ACTIVE_RULE_BUTTONS_FALLBACK);
}

function readStorage(): Record<string, RuleButtonState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return {};
    return obj as any;
  } catch {
    return {};
  }
}

function writeStorage(obj: Record<string, RuleButtonState>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

function getDef(id: string) {
  return RULE_BUTTON_DEFS.find((d) => d.id === id) || null;
}

/**
 * 规则按钮状态：
 * - worldId 维度存储（不同世界可不同组合）
 * - 支持互斥规则（exclusiveWith）
 * - 支持最大开启数（maxActive）
 */
export function useRuleButtonState(worldId: string) {
  const wid = String(worldId ?? '').trim() || 'default';

  const [state, setState] = useState<RuleButtonState>(() => ({
    activeOrdered: getDefaultActive(wid),
  }));

  // load from localStorage when world changes
  useEffect(() => {
    const all = readStorage();
    const next = all[wid];
    if (next && Array.isArray(next.activeOrdered)) {
      setState({ activeOrdered: uniqKeepOrder(next.activeOrdered) });
    } else {
      setState({ activeOrdered: getDefaultActive(wid) });
    }
  }, [wid]);

  // persist
  useEffect(() => {
    const all = readStorage();
    all[wid] = state;
    writeStorage(all);
  }, [wid, state]);

  const activeSet = useMemo(() => new Set(state.activeOrdered), [state.activeOrdered]);

  const toggle = useCallback((id: string) => {
    const key = String(id ?? '').trim();
    if (!key) return;

    setState((prev) => {
      const cur = uniqKeepOrder(prev.activeOrdered);
      const isOn = cur.includes(key);

      // OFF: remove
      if (isOn) {
        return { activeOrdered: cur.filter((x) => x !== key) };
      }

      // ON: add + apply exclusives + maxActive
      let next = [...cur, key];

      // mutual exclusion
      const def = getDef(key);
      if (def?.exclusiveWith && def.exclusiveWith.length > 0) {
        const ex = new Set(def.exclusiveWith.map((x) => String(x).trim()).filter(Boolean));
        next = next.filter((x) => !ex.has(x));
        // ensure the toggled key stays
        if (!next.includes(key)) next.push(key);
      }

      next = uniqKeepOrder(next);

      // maxActive policy: evict oldest
      const max = Number(RULE_BUTTON_POLICY.maxActive ?? 0);
      if (Number.isFinite(max) && max > 0 && next.length > max) {
        // keep newest (rightmost)
        next = next.slice(next.length - max);
      }

      return { activeOrdered: next };
    });
  }, []);

  const activeButtonIds = useMemo(() => state.activeOrdered, [state.activeOrdered]);

  return {
    activeButtonIds,
    activeSet,
    toggle,
  };
}
