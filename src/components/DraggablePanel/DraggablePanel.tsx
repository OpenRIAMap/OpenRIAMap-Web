/**
 * 可拖拽面板容器组件
 * 仅桌面端支持拖拽，手机端保持固定布局
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Square, X } from 'lucide-react';
import { useDesktopWindowStackLayer } from '@/components/DraggablePanel/desktopWindowStack';

interface DraggablePanelProps {
  id: string;
  defaultPosition?: { x: number; y: number };
  onFocus?: () => void;
  zIndex?: number;
  children: React.ReactNode;
  stackGroup?: string;
  stackGroupOrder?: number;
  constrainExpandedToViewport?: boolean;
  windowControlTone?: 'default' | 'light';
  minimizedTitleNode?: React.ReactNode;
  expandedControlLayout?: 'default' | 'playerCardGrid';
}

const HEADER_HEIGHT = 48;
const DESKTOP_BREAKPOINT = 640;
const WINDOW_BUTTON_SIZE = 28;
const WINDOW_BUTTON_GAP = 8;
const WINDOW_SIDE_PADDING = 12;
const MINIMIZED_MIN_WIDTH = 156;
const MINIMIZED_MAX_WIDTH = 320;
const MIN_VISIBLE_EXPANDED_WIDTH = 96;
function extractTitleText(root: HTMLElement | null, fallback: string): string {
  if (!root) return fallback;

  const explicit = root.querySelector<HTMLElement>('[data-draggable-title]');
  const candidate = explicit
    ?? root.querySelector<HTMLElement>('h1, h2, h3, h4, h5, h6')
    ?? root.querySelector<HTMLElement>('.font-semibold, .font-bold');

  const text = (candidate?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function findCloseButton(root: HTMLElement | null): HTMLButtonElement | null {
  if (!root) return null;

  const explicit = root.querySelector<HTMLButtonElement>('[data-draggable-close]');
  if (explicit) return explicit;

  const selectors = [
    'button[aria-label="关闭"]',
    'button[title="关闭"]',
    'button[aria-label*="关闭"]',
    'button[title*="关闭"]',
  ];
  for (const selector of selectors) {
    const found = root.querySelector<HTMLButtonElement>(selector);
    if (found) return found;
  }

  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
  for (const btn of buttons) {
    const text = (btn.textContent ?? '').replace(/\s+/g, '').trim();
    if (text === '关闭') return btn;
  }
  return null;
}

export function DraggablePanel({
  id,
  defaultPosition = { x: 16, y: 180 },
  onFocus,
  zIndex: _zIndex = 1000,
  children,
  stackGroup,
  stackGroupOrder = 0,
  constrainExpandedToViewport = false,
  windowControlTone = 'default',
  minimizedTitleNode,
  expandedControlLayout = 'default',
}: DraggablePanelProps) {
  const [position, setPosition] = useState(defaultPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [panelTitle, setPanelTitle] = useState(id);
  const [hasCloseButton, setHasCloseButton] = useState(false);
  const [preferProxyClose, setPreferProxyClose] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // 检测是否桌面端
  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    };
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  const refreshHeaderMeta = useCallback(() => {
    const root = contentRef.current;
    setPanelTitle(extractTitleText(root, id));
    setHasCloseButton(!!findCloseButton(root));
    setPreferProxyClose(!!root?.querySelector('[data-draggable-proxy-close]'));
  }, [id]);

  useEffect(() => {
    if (!isDesktop) return;
    const timer = window.setTimeout(refreshHeaderMeta, 0);
    return () => window.clearTimeout(timer);
  }, [children, isDesktop, refreshHeaderMeta]);

  const { portalRoot, effectiveZIndex, emitFocused } = useDesktopWindowStackLayer({
    id,
    stackGroup,
    stackGroupOrder,
    enabled: isDesktop,
    onFocus,
  });

  const clampPosition = useCallback((x: number, y: number, minimized: boolean) => {
    const panelWidth = panelRef.current?.offsetWidth || 300;
    const panelHeight = panelRef.current?.offsetHeight || HEADER_HEIGHT;

    if (minimized) {
      const maxX = Math.max(0, window.innerWidth - panelWidth);
      const maxY = Math.max(0, window.innerHeight - Math.min(panelHeight, window.innerHeight));
      return {
        x: Math.max(0, Math.min(x, maxX)),
        y: Math.max(0, Math.min(y, maxY)),
      };
    }

    const minX = -(panelWidth - MIN_VISIBLE_EXPANDED_WIDTH);
    const maxX = window.innerWidth - MIN_VISIBLE_EXPANDED_WIDTH;
    const minY = 0;
    const maxY = constrainExpandedToViewport
      ? Math.max(0, window.innerHeight - panelHeight)
      : window.innerHeight - HEADER_HEIGHT;

    return {
      x: Math.max(minX, Math.min(x, maxX)),
      y: Math.max(minY, Math.min(y, maxY)),
    };
  }, [constrainExpandedToViewport]);

  // 开始拖拽
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isDesktop) return;

    // 点击输入控件/按钮等交互元素时，不进入拖拽逻辑（避免抢焦点/阻止输入）
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, button, a, [role="button"]')) return;

    // 只有点击面板顶部标题栏区域才能拖拽（前 48px）
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relativeY = e.clientY - rect.top;
    if (relativeY > HEADER_HEIGHT) return;

    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    emitFocused();
  }, [emitFocused, isDesktop, position.x, position.y]);

  // 拖拽中
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragStartRef.current.x;
      const newY = e.clientY - dragStartRef.current.y;
      setPosition(clampPosition(newX, newY, isMinimized));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [clampPosition, isDragging, isMinimized]);

  useEffect(() => {
    if (!isDesktop) return;
    setPosition((prev) => clampPosition(prev.x, prev.y, isMinimized));
  }, [clampPosition, isDesktop, isMinimized]);

  const handleRootMouseDownCapture = useCallback(() => {
    emitFocused();
  }, [emitFocused]);

  // 根节点鼠标按下：仅按需启动拖拽（仅标题栏区域且不点到交互控件）
  const handleRootMouseDown = useCallback((e: React.MouseEvent) => {
    handleMouseDown(e);
  }, [handleMouseDown]);

  const handleToggleMinimize = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    emitFocused();
    setIsMinimized((prev) => !prev);
  }, [emitFocused]);

  const handleRequestClose = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    emitFocused();
    findCloseButton(contentRef.current)?.click();
  }, [emitFocused]);

  // 手机端：不渲染（手机端内容在 MapContainer 的 sm:hidden 区域单独渲染）
  if (!isDesktop) {
    return null;
  }

  // 桌面端窗口统一进入全局层级栈；zIndex 仅保留兼容旧调用，不再作为跨窗口层级屏障。
  const expandedControlButtonClass = windowControlTone === 'light'
    ? 'flex h-7 w-7 items-center justify-center rounded text-white/85 transition hover:bg-white/15 hover:text-white'
    : 'flex h-7 w-7 items-center justify-center rounded text-gray-400 transition hover:bg-gray-100 hover:text-gray-600';
  const minimizedControlButtonClass = 'flex h-7 w-7 items-center justify-center rounded text-gray-400 transition hover:bg-gray-100 hover:text-gray-600';
  const expandedControlTop = expandedControlLayout === 'playerCardGrid' ? 10 : 10;

  const panelNode = (
    <div
      ref={panelRef}
      data-panel-id={id}
      data-panel-minimized={isMinimized ? 'true' : 'false'}
      className="fixed pointer-events-auto"
      style={{
        left: position.x,
        top: position.y,
        zIndex: effectiveZIndex,
        cursor: isDragging ? 'grabbing' : 'default',
        width: isMinimized ? 'fit-content' : undefined,
        maxWidth: isMinimized ? MINIMIZED_MAX_WIDTH : undefined,
      }}
      onMouseDownCapture={handleRootMouseDownCapture}
      onMouseDown={handleRootMouseDown}
    >
      <div className="relative">
        <div
          ref={contentRef}
          style={isMinimized ? { display: 'none' } : undefined}
          aria-expanded={!isMinimized}
        >
          {children}
        </div>

        {isMinimized ? (
          <div
            className="flex items-center gap-2 rounded-2xl border border-black/10 bg-white shadow-md"
            style={{ minWidth: MINIMIZED_MIN_WIDTH }}
          >
            <div className="min-w-0 px-4 py-3 text-sm font-semibold text-gray-800 truncate" title={panelTitle}>
              {minimizedTitleNode ?? panelTitle}
            </div>
            <div className="ml-auto flex items-center gap-2 pr-3">
              <button
                type="button"
                onClick={handleToggleMinimize}
                className={minimizedControlButtonClass}
                aria-label="展开面板"
                title="展开面板"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
              {hasCloseButton ? (
                <button
                  type="button"
                  onClick={handleRequestClose}
                  className={minimizedControlButtonClass}
                  aria-label="关闭"
                  title="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={handleToggleMinimize}
              className={`absolute ${expandedControlButtonClass}`}
              aria-label="最小化面板"
              title="最小化面板"
              style={{
                top: expandedControlTop,
                right: WINDOW_SIDE_PADDING + WINDOW_BUTTON_SIZE + WINDOW_BUTTON_GAP,
                width: WINDOW_BUTTON_SIZE,
                height: WINDOW_BUTTON_SIZE,
              }}
            >
              <Minus className="h-4 w-4" />
            </button>
            {preferProxyClose && hasCloseButton ? (
              <button
                type="button"
                onClick={handleRequestClose}
                className={`absolute ${expandedControlButtonClass}`}
                aria-label="关闭"
                title="关闭"
                style={{
                  top: expandedControlTop,
                  right: WINDOW_SIDE_PADDING,
                  width: WINDOW_BUTTON_SIZE,
                  height: WINDOW_BUTTON_SIZE,
                }}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );

  if (!portalRoot) return null;
  return createPortal(panelNode, portalRoot);
}

export default DraggablePanel;
