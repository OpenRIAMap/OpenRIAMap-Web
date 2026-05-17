import { useCallback, useEffect, useState } from 'react';

export const DESKTOP_WINDOW_ROOT_ID = 'ria-desktop-window-root';
export const DESKTOP_WINDOW_ROOT_Z = 20000;
export const GLOBAL_WINDOW_Z_BASE = 5000;

const PANEL_STACK_ORDER = new Map<string, number>();
const GROUP_STACK_ORDER = new Map<string, number>();
let GLOBAL_STACK_CURSOR = 1;

export type DesktopWindowFocusDetail = {
  id?: string;
  stackGroup?: string;
  order?: number;
};

export function ensureDesktopWindowRoot(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null;
  let root = document.getElementById(DESKTOP_WINDOW_ROOT_ID) as HTMLDivElement | null;
  if (!root) {
    root = document.createElement('div');
    root.id = DESKTOP_WINDOW_ROOT_ID;
    Object.assign(root.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      zIndex: String(DESKTOP_WINDOW_ROOT_Z),
    });
    document.body.appendChild(root);
  }
  return root;
}

export function nextStackOrder() {
  GLOBAL_STACK_CURSOR += 1;
  return GLOBAL_STACK_CURSOR;
}

export function ensurePanelOrder(id: string) {
  if (!PANEL_STACK_ORDER.has(id)) {
    PANEL_STACK_ORDER.set(id, nextStackOrder());
  }
  return PANEL_STACK_ORDER.get(id) ?? 1;
}

export function ensureGroupOrder(group: string) {
  if (!GROUP_STACK_ORDER.has(group)) {
    GROUP_STACK_ORDER.set(group, nextStackOrder());
  }
  return GROUP_STACK_ORDER.get(group) ?? 1;
}

export function emitDesktopWindowFocus(detail: { id: string; stackGroup?: string; order: number }) {
  window.dispatchEvent(new CustomEvent('ria:draggable-panel-focus', { detail }));
}

type UseDesktopWindowStackLayerOptions = {
  id: string;
  stackGroup?: string;
  stackGroupOrder?: number;
  enabled?: boolean;
  autoFocusOnEnable?: boolean;
  onFocus?: () => void;
};

export function useDesktopWindowStackLayer({
  id,
  stackGroup,
  stackGroupOrder = 0,
  enabled = true,
  autoFocusOnEnable = true,
  onFocus,
}: UseDesktopWindowStackLayerOptions) {
  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null);
  const [stackOrder, setStackOrder] = useState(() => (stackGroup ? ensureGroupOrder(stackGroup) : ensurePanelOrder(id)));

  useEffect(() => {
    if (!enabled) {
      setPortalRoot(null);
      return;
    }
    setPortalRoot(ensureDesktopWindowRoot());
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const handleWindowFocus = (ev: Event) => {
      const detail = (ev as CustomEvent<DesktopWindowFocusDetail>).detail;
      if (!detail || typeof detail.order !== 'number') return;
      if (stackGroup) {
        if (detail.stackGroup === stackGroup) setStackOrder(detail.order);
        return;
      }
      if (detail.id === id) setStackOrder(detail.order);
    };

    window.addEventListener('ria:draggable-panel-focus', handleWindowFocus as EventListener);
    return () => {
      window.removeEventListener('ria:draggable-panel-focus', handleWindowFocus as EventListener);
    };
  }, [enabled, id, stackGroup]);

  const emitFocused = useCallback(() => {
    const order = nextStackOrder();
    if (stackGroup) {
      GROUP_STACK_ORDER.set(stackGroup, order);
    } else {
      PANEL_STACK_ORDER.set(id, order);
    }
    setStackOrder(order);
    emitDesktopWindowFocus({ id, stackGroup, order });
    onFocus?.();
  }, [id, onFocus, stackGroup]);

  useEffect(() => {
    if (!enabled || !autoFocusOnEnable) return;
    const timer = window.setTimeout(() => {
      emitFocused();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoFocusOnEnable, emitFocused, enabled]);

  return {
    portalRoot,
    stackOrder,
    effectiveZIndex: GLOBAL_WINDOW_Z_BASE + stackOrder * 100 + stackGroupOrder,
    emitFocused,
  };
}
