/**
 * 工具栏组件
 * 包含路径规划等快捷功能图标
 */

import { useState, useRef, useEffect } from 'react';
import { Navigation, List, HelpCircle, Train, Home, Moon, X, User, Users, Map, Palette, Pencil, Settings, Filter } from 'lucide-react';
import type { MapStyle } from '@/lib/cookies';
import ToolIconButton from '@/components/Toolbar/ToolIconButton';
import AppButton from '@/components/ui/AppButton';
import AppCard from '@/components/ui/AppCard';

interface ToolbarProps {
  onNavigationClick: () => void;
  onAttributeQueryClick: () => void;
  onLinesClick: () => void;
  onPlayersClick: () => void;
  onHelpClick: () => void;
  onSettingsClick: () => void;
  mobile?: boolean;
  frameless?: boolean;
}

function ToolbarButtons({
  onNavigationClick,
  onAttributeQueryClick,
  onLinesClick,
  onPlayersClick,
  onHelpClick,
  onSettingsClick,
  mobile = false,
}: Omit<ToolbarProps, 'frameless'>) {
  const buttonClass = mobile
    ? 'p-2.5 rounded-lg text-gray-600 transition-colors group relative active:scale-[0.98]'
    : 'p-2 rounded-lg transition-colors group relative';

  return (
    <>
      <AppButton
        onClick={onNavigationClick}
        className={`${buttonClass} hover:bg-blue-50 hover:text-blue-600`}
        title="路径规划"
      >
        <Navigation className="w-5 h-5" />
        <span className={`absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs bg-gray-800 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none ${mobile ? 'hidden' : ''}`}>
          路径规划
        </span>
      </AppButton>

      {!mobile && <div className="w-px h-6 bg-gray-200" />}

      <AppButton
        onClick={onAttributeQueryClick}
        className={`${buttonClass} hover:bg-emerald-50 hover:text-emerald-600`}
        title="按属性查询"
      >
        <Filter className="w-5 h-5" />
        <span className={`absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs bg-gray-800 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none ${mobile ? 'hidden' : ''}`}>
          按属性查询
        </span>
      </AppButton>

      <AppButton
        onClick={onLinesClick}
        className={`${buttonClass} hover:bg-gray-100 hover:text-gray-800`}
        title="线路列表"
      >
        <List className="w-5 h-5" />
        <span className={`absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs bg-gray-800 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none ${mobile ? 'hidden' : ''}`}>
          线路列表
        </span>
      </AppButton>

      <AppButton
        onClick={onPlayersClick}
        className={`${buttonClass} hover:bg-cyan-50 hover:text-cyan-600`}
        title="在线玩家"
      >
        <Users className="w-5 h-5" />
        <span className={`absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs bg-gray-800 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none ${mobile ? 'hidden' : ''}`}>
          在线玩家
        </span>
      </AppButton>

      <AppButton
        onClick={onHelpClick}
        className={`${buttonClass} hover:bg-gray-100 hover:text-gray-800`}
        title="帮助"
      >
        <HelpCircle className="w-5 h-5" />
        <span className={`absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs bg-gray-800 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none ${mobile ? 'hidden' : ''}`}>
          帮助
        </span>
      </AppButton>

      <AppButton
        onClick={onSettingsClick}
        className={`${buttonClass} hover:bg-gray-100 hover:text-gray-800`}
        title="设置"
      >
        <Settings className="w-5 h-5" />
        <span className={`absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs bg-gray-800 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none ${mobile ? 'hidden' : ''}`}>
          设置
        </span>
      </AppButton>
    </>
  );
}

export function Toolbar(props: ToolbarProps) {
  const { mobile = false, frameless = false } = props;
  const contentClass = mobile ? 'grid grid-cols-3 gap-1.5' : 'flex items-center gap-1';
  const content = <div className={contentClass}><ToolbarButtons {...props} mobile={mobile} /></div>;

  if (frameless) return content;

  return (
    <AppCard className={`bg-white/90 ${mobile ? 'p-2' : 'p-2'}`}>
      {content}
    </AppCard>
  );
}

const MAP_STYLE_OPTIONS: Array<{
  value: MapStyle;
  label: string;
  icon: React.ReactNode;
  description: string;
}> = [
  { value: 'default', label: '原版', icon: <Map className="w-5 h-5" />, description: '卫星原始渲染' },
  { value: 'watercolor', label: '淡彩', icon: <Palette className="w-5 h-5" />, description: '柔和水彩风格' },
  { value: 'sketch', label: '素描', icon: <Pencil className="w-5 h-5" />, description: '手绘地图风格' },
];

interface MapStyleSelectorProps {
  mapStyle: MapStyle;
  onToggleMapStyle: (style: MapStyle) => void;
}

function MapStyleSelector({ mapStyle, onToggleMapStyle }: MapStyleSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentStyle = MAP_STYLE_OPTIONS.find(s => s.value === mapStyle) || MAP_STYLE_OPTIONS[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className="relative">
      <AppButton
        onClick={() => setIsOpen(!isOpen)}
        className={`h-9 w-9 p-1.5 transition-colors group relative ${
          mapStyle !== 'default'
            ? 'bg-amber-100 text-amber-600'
            : 'hover:bg-gray-100 text-gray-400'
        }`}
        title="地图风格"
      >
        {currentStyle.icon}
        <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 text-xs bg-gray-800 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none max-md:hidden">
          {currentStyle.label}
        </span>
      </AppButton>

      <AppCard
        className={`absolute right-0 w-36 border border-gray-200 py-1 z-50 transition-all duration-150 md:mt-1 md:origin-top-right max-md:bottom-full max-md:mb-1 max-md:origin-bottom-right ${
          isOpen
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-95 pointer-events-none'
        }`}
      >
        {MAP_STYLE_OPTIONS.map((option) => (
          <AppButton
            key={option.value}
            onClick={() => {
              onToggleMapStyle(option.value);
              setIsOpen(false);
            }}
            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors ${
              mapStyle === option.value ? 'bg-amber-50 text-amber-700' : 'text-gray-700'
            }`}
          >
            {option.icon}
            <span className={mapStyle === option.value ? 'font-medium' : ''}>{option.label}</span>
          </AppButton>
        ))}
      </AppCard>
    </div>
  );
}

interface AboutCardProps {
  onClose: () => void;
}

export function AboutCard({ onClose }: AboutCardProps) {
  return (
    <AppCard className="bg-white/90">
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <h3 className="font-bold text-gray-800">关于</h3>
        <AppButton
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </AppButton>
      </div>
      <div className="p-4 text-xs text-gray-600 space-y-2">
        <div className="bg-yellow-50 border border-yellow-200 rounded px-2 py-1 text-yellow-700">
          该平台正在测试中
        </div>
        <div>
          <span className="font-medium text-gray-800">开发：</span>
          <span>Venti_Lynn</span>
        </div>
        <div>
          <span className="font-medium text-gray-800">测绘/测量控件：</span>
          <span>Ozstk639</span>
        </div>
        <div>
          <span className="font-medium text-gray-800">数据来源：</span>
          <div className="mt-1 space-y-0.5 text-gray-600">
            <div>
              <a href="https://satellite.ria.red/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                莉亚红一号卫星
              </a>
            </div>
            <div>秋月白</div>
            <div>FY_杨</div>
            <div>暗夜</div>
            <div>
              <a href="https://ria-data.vercel.app/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                莉亚数据开放平台
              </a>
            </div>
          </div>
        </div>
      </div>
    </AppCard>
  );
}

interface LayerControlProps {
  showRailway: boolean;
  showLandmark: boolean;
  showPlayers: boolean;
  dimBackground: boolean;
  mapStyle: MapStyle;
  onToggleRailway: (show: boolean) => void;
  onToggleLandmark: (show: boolean) => void;
  onTogglePlayers: (show: boolean) => void;
  onToggleDimBackground: (dim: boolean) => void;
  onToggleMapStyle: (style: MapStyle) => void;
  children?: React.ReactNode;
  mobile?: boolean;
  frameless?: boolean;
}

function LayerControlButtons({
  showRailway,
  showLandmark,
  showPlayers,
  dimBackground,
  mapStyle,
  onToggleRailway,
  onToggleLandmark,
  onTogglePlayers,
  onToggleDimBackground,
  onToggleMapStyle,
  children,
}: Omit<LayerControlProps, 'mobile' | 'frameless'>) {
  const hasExtra = !!children;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        <ToolIconButton
          label="铁路"
          icon={<Train className="w-5 h-5" />}
          active={showRailway}
          tone="blue"
          onClick={() => onToggleRailway(!showRailway)}
        />
        <ToolIconButton
          label="地标"
          icon={<Home className="w-5 h-5" />}
          active={showLandmark}
          tone="green"
          onClick={() => onToggleLandmark(!showLandmark)}
        />
        <ToolIconButton
          label="玩家"
          icon={<User className="w-5 h-5" />}
          active={showPlayers}
          tone="cyan"
          onClick={() => onTogglePlayers(!showPlayers)}
        />
      </div>

      <div className="h-px bg-gray-200" />

      <div className="flex flex-wrap items-center gap-1">
        {hasExtra ? <div className="flex flex-wrap items-center gap-1">{children}</div> : null}
        <ToolIconButton
          label="淡化背景"
          icon={<Moon className="w-5 h-5" />}
          active={dimBackground}
          tone="purple"
          onClick={() => onToggleDimBackground(!dimBackground)}
        />
        <MapStyleSelector mapStyle={mapStyle} onToggleMapStyle={onToggleMapStyle} />
      </div>
    </>
  );
}

export function LayerControl(props: LayerControlProps) {
  const { mobile = false, frameless = false } = props;
  const content = (
    <div className={`flex flex-col gap-2 ${mobile ? 'w-[196px]' : ''}`}>
      <LayerControlButtons {...props} />
    </div>
  );

  if (frameless) return content;

  return (
    <AppCard className={`bg-white/90 ${mobile ? 'p-2.5' : 'p-3'} flex flex-col gap-2`}>
      {content}
    </AppCard>
  );
}

export default Toolbar;
