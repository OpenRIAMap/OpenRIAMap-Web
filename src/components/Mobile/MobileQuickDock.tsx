import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import AppButton from '@/components/ui/AppButton';
import MobileQuickPanel from './MobileQuickPanel';

type DockItem = {
  key: string;
  icon: ReactNode;
  label: string;
  activeClassName: string;
};

interface MobileQuickDockProps {
  items: DockItem[];
  activeKey: string | null;
  onToggle: (key: string) => void;
  renderPanel: (key: string) => ReactNode;
  zoomControls?: ReactNode;
  directionMap?: Partial<Record<string, 'down' | 'up'>>;
}

export default function MobileQuickDock({
  items,
  activeKey,
  onToggle,
  renderPanel,
  zoomControls,
  directionMap,
}: MobileQuickDockProps) {
  const dockRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [anchorRect, setAnchorRect] = useState<{ top: number; height: number; containerHeight: number }>({
    top: 0,
    height: 44,
    containerHeight: 0,
  });

  useLayoutEffect(() => {
    if (!activeKey) return;
    const dockEl = dockRef.current;
    const btnEl = buttonRefs.current[activeKey];
    if (!dockEl || !btnEl) return;

    const dockRect = dockEl.getBoundingClientRect();
    const btnRect = btnEl.getBoundingClientRect();
    setAnchorRect({
      top: btnRect.top - dockRect.top,
      height: btnRect.height,
      containerHeight: dockRect.height,
    });
  }, [activeKey, items]);

  const direction = useMemo(() => {
    if (!activeKey) return 'down' as const;
    return directionMap?.[activeKey] ?? 'down';
  }, [activeKey, directionMap]);

  return (
    <div ref={dockRef} className="relative flex flex-col items-end gap-2 pointer-events-none">
      {activeKey ? (
        <MobileQuickPanel
          anchorTop={anchorRect.top}
          anchorHeight={anchorRect.height}
          containerHeight={anchorRect.containerHeight}
          direction={direction}
        >
          {renderPanel(activeKey)}
        </MobileQuickPanel>
      ) : null}

      <div className="flex flex-col gap-2 pointer-events-auto">
        {items.map((item) => {
          const active = activeKey === item.key;
          return (
            <AppButton
              key={item.key}
              ref={(node: HTMLButtonElement | null) => {
                buttonRefs.current[item.key] = node;
              }}
              onClick={() => onToggle(item.key)}
              className={[
                'relative h-11 w-11 rounded-full shadow-xl border border-white/70 backdrop-blur-sm transition-all flex items-center justify-center',
                active ? item.activeClassName : 'bg-white/92 text-gray-700 hover:bg-white',
              ].join(' ')}
              title={item.label}
            >
              {item.icon}
            </AppButton>
          );
        })}
      </div>

      {zoomControls ? <div className="pointer-events-auto w-11">{zoomControls}</div> : null}
    </div>
  );
}
