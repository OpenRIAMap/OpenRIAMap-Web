import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import AppCard from '@/components/ui/AppCard';

interface MobileQuickPanelProps {
  anchorTop: number;
  anchorHeight: number;
  containerHeight: number;
  direction?: 'down' | 'up';
  children: ReactNode;
}

export default function MobileQuickPanel({
  anchorTop,
  anchorHeight,
  containerHeight,
  direction = 'down',
  children,
}: MobileQuickPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(anchorTop);

  useLayoutEffect(() => {
    const panelEl = panelRef.current;
    if (!panelEl) return;

    const update = () => {
      const panelHeight = panelEl.offsetHeight || 0;
      const downTop = anchorTop;
      const upTop = anchorTop + anchorHeight - panelHeight;
      const preferredTop = direction === 'up' ? upTop : downTop;
      const clampedTop = Math.min(
        Math.max(0, preferredTop),
        Math.max(0, containerHeight - panelHeight),
      );
      setTop(clampedTop);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(panelEl);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [anchorTop, anchorHeight, containerHeight, direction, children]);

  return (
    <div
      ref={panelRef}
      className="absolute right-full mr-3 w-[min(248px,calc(100vw-96px))] pointer-events-auto"
      style={{ top }}
    >
      <AppCard className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-black/5 p-2.5 overflow-visible">
        {children}
      </AppCard>
    </div>
  );
}
