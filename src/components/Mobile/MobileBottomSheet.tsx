import AppButton from '@/components/ui/AppButton';
import AppCard from '@/components/ui/AppCard';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

interface MobileBottomSheetProps {
  open: boolean;
  hidden?: boolean;
  collapsed?: boolean;
  title?: string;
  onClose: () => void;
  onHide?: () => void;
  onToggleCollapsed?: () => void;
  onOffsetChange?: (offsetPx: number) => void;
  children: ReactNode;
}

export default function MobileBottomSheet({
  open,
  hidden = false,
  collapsed = false,
  title,
  onClose,
  onToggleCollapsed,
  onOffsetChange,
  children,
}: MobileBottomSheetProps) {
  const shellRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      onOffsetChange?.(0);
      return;
    }

    const update = () => {
      const el = shellRef.current;
      if (!el) return;
      onOffsetChange?.(el.offsetHeight + 12);
    };

    update();
    const observer = new ResizeObserver(update);
    if (shellRef.current) observer.observe(shellRef.current);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [open, hidden, collapsed, children, onOffsetChange]);

  useEffect(() => {
    if (!open) onOffsetChange?.(0);
  }, [open, onOffsetChange]);

  if (!open) return null;

  const previewMode = hidden || collapsed;

  return (
    <div className="sm:hidden absolute inset-x-2 bottom-2 z-[1002] pointer-events-none">
      <div
        ref={shellRef}
        className={[
          'transition-all duration-200 pointer-events-auto',
          hidden ? 'translate-y-[calc(100%-56px)]' : '',
        ].join(' ')}
      >
        <AppCard className="bg-white/95 backdrop-blur-sm rounded-[28px] shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-gray-100 gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <AppButton
                onClick={onToggleCollapsed}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 rounded-full px-1.5 py-1 shrink-0"
                title={previewMode ? '展开面板' : '折叠面板'}
              >
                <span className="block w-10 h-1 rounded-full bg-gray-300" />
                {previewMode ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </AppButton>
              {title ? <div className="font-medium text-sm text-gray-800 truncate">{title}</div> : null}
            </div>
            <AppButton
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full shrink-0"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </AppButton>
          </div>

          <div className={previewMode ? 'max-h-0 overflow-hidden' : 'block'} aria-hidden={previewMode}>
            <div className="max-h-[58vh] overflow-y-auto p-2 pb-4">{children}</div>
          </div>
        </AppCard>
      </div>
    </div>
  );
}
