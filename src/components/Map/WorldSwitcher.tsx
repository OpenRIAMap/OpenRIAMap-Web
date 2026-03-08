/**
 * 世界切换器组件
 * 使用标签页样式在不同世界之间切换
 */

import { Globe } from 'lucide-react';
import AppButton from '@/components/ui/AppButton';
import AppCard from '@/components/ui/AppCard';

interface World {
  id: string;
  name: string;
  center: { x: number; y: number; z: number };
}

interface WorldSwitcherProps {
  worlds: World[];
  currentWorld: string;
  onWorldChange: (worldId: string) => void;
  mobile?: boolean;
  frameless?: boolean;
  showIcon?: boolean;
}

export function WorldSwitcher({
  worlds,
  currentWorld,
  onWorldChange,
  mobile = false,
  frameless = false,
  showIcon,
}: WorldSwitcherProps) {
  const shouldShowIcon = showIcon ?? !mobile;

  const content = (
    <div className={`${mobile ? 'flex flex-wrap items-center gap-1.5 overflow-x-auto' : 'flex items-center gap-1 mt-2 flex-wrap'}`}>
      {shouldShowIcon ? <Globe className={`${mobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-gray-400 ${mobile ? 'mr-1' : 'mr-1'} flex-shrink-0`} /> : null}
      {worlds.map(world => (
        <AppButton
          key={world.id}
          onClick={() => onWorldChange(world.id)}
          className={`flex-shrink-0 ${mobile ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1 text-xs'} font-medium rounded-full transition-all ${
            world.id === currentWorld
              ? 'bg-blue-500 text-white shadow-sm'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {world.name}
        </AppButton>
      ))}
    </div>
  );

  if (frameless) return content;

  return <AppCard className={mobile ? 'bg-white/90 p-2.5' : 'bg-white/90 px-4 py-3 inline-block'}>{content}</AppCard>;
}

export default WorldSwitcher;
