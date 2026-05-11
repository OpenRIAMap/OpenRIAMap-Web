import { useEffect, useRef, useState, type ReactNode } from 'react';

type Position = { x: number; y: number };

type SmallDraggablePanelProps = {
  id: string;
  title?: string;
  defaultPosition: Position;
  zIndex?: number;
  className?: string;
  children: ReactNode;
  /**
   * Optional CSS selector limiting drag start to a specific handle area.
   * When omitted, the whole panel remains draggable for backwards compatibility.
   */
  dragHandleSelector?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'button, input, textarea, select, a, [role="button"], [data-no-drag]',
    ),
  );
}

function isWithinHandle(
  root: HTMLElement | null,
  target: EventTarget | null,
  selector?: string,
): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (!root) return false;
  if (!selector) return root.contains(target);

  const handle = target.closest(selector);
  return Boolean(handle && root.contains(handle));
}

export default function SmallDraggablePanel(props: SmallDraggablePanelProps) {
  const {
    id,
    title,
    defaultPosition,
    zIndex = 2147483647,
    className = '',
    children,
    dragHandleSelector,
  } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startPos: Position;
  } | null>(null);
  const [pos, setPos] = useState<Position>(() => defaultPosition);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setPos(defaultPosition);
  }, [defaultPosition.x, defaultPosition.y]);

  useEffect(() => {
    if (!isDragging || typeof document === 'undefined') return;
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = 'grabbing';
    return () => {
      document.body.style.cursor = prevCursor;
    };
  }, [isDragging]);

  const clampToViewport = (next: Position): Position => {
    const el = rootRef.current;
    const w = el?.offsetWidth ?? 140;
    const h = el?.offsetHeight ?? 160;
    const maxX = Math.max(8, window.innerWidth - w - 8);
    const maxY = Math.max(8, window.innerHeight - h - 8);
    return { x: clamp(next.x, 8, maxX), y: clamp(next.y, 8, maxY) };
  };

  return (
    <div
      ref={rootRef}
      id={id}
      className={className}
      aria-label={title || undefined}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex,
        pointerEvents: 'auto',
        cursor: isDragging ? 'grabbing' : 'default',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        if (isInteractiveTarget(e.target)) return;
        if (!isWithinHandle(rootRef.current, e.target, dragHandleSelector)) return;

        e.preventDefault();
        e.stopPropagation();
        dragRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          startPos: pos,
        };
        setIsDragging(true);
        try {
          rootRef.current?.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }}
      onPointerMove={(e) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        e.preventDefault();
        e.stopPropagation();
        setPos(
          clampToViewport({
            x: drag.startPos.x + e.clientX - drag.startX,
            y: drag.startPos.y + e.clientY - drag.startY,
          }),
        );
      }}
      onPointerUp={(e) => {
        if (dragRef.current?.pointerId === e.pointerId) {
          dragRef.current = null;
          setIsDragging(false);
        }
        try {
          rootRef.current?.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }}
      onPointerCancel={(e) => {
        if (dragRef.current?.pointerId === e.pointerId) {
          dragRef.current = null;
          setIsDragging(false);
        }
      }}
    >
      {children}
    </div>
  );
}
