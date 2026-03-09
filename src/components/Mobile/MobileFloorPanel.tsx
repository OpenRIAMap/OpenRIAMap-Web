import AppButton from '@/components/ui/AppButton';
import AppCard from '@/components/ui/AppCard';
import { Building2, ChevronRight } from 'lucide-react';

type FloorOption = { label: string; value: string };

type Props = {
  visible: boolean;
  collapsed: boolean;
  buildingName: string;
  floorOptions: FloorOption[];
  activeFloorIndex: number;
  onSelectFloor: (index: number) => void;
  onToggleCollapsed: () => void;
};

export default function MobileFloorPanel({
  visible,
  collapsed,
  buildingName,
  floorOptions,
  activeFloorIndex,
  onSelectFloor,
  onToggleCollapsed,
}: Props) {
  if (!visible) return null;

  if (collapsed) {
    return (
      <AppButton
        onClick={onToggleCollapsed}
        className="h-[35px] w-[35px] rounded-[20px] border border-white/70 bg-white/92 text-gray-700 shadow-xl active:bg-gray-100 flex items-center justify-center"
        title="展开楼层面板"
      >
        <Building2 className="w-4 h-4" />
      </AppButton>
    );
  }

  return (
    <AppCard
      className="bg-white/95 border border-white/70 shadow-xl rounded-[24px] p-3 w-[150px]"
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gray-800">楼层视角</div>
          <div className="text-[11px] text-gray-600 truncate mt-1" title={buildingName}>
            {buildingName || '（未命名建筑）'}
          </div>
        </div>
        <AppButton
          onClick={onToggleCollapsed}
          className="h-7 w-7 shrink-0 rounded-full bg-transparent text-gray-500 active:bg-gray-100"
          title="折叠楼层面板"
        >
          <ChevronRight className="w-4 h-4" />
        </AppButton>
      </div>

      <div className="flex flex-col gap-2 max-h-[140px] overflow-y-auto pr-1">
        {floorOptions.map((opt, idx) => {
          const on = idx === activeFloorIndex;
          return (
            <AppButton
              key={opt.value}
              type="button"
              onClick={() => onSelectFloor(idx)}
              className={[
                'w-full h-10 px-3 rounded-[18px] text-sm border flex items-center justify-center shrink-0',
                on ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-700 border-gray-200 active:bg-gray-50',
              ].join(' ')}
            >
              {opt.label}
            </AppButton>
          );
        })}
      </div>
    </AppCard>
  );
}
