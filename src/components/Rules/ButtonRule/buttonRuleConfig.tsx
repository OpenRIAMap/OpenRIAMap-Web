import type React from 'react';
import { Building2, Leaf, Map, Home, Train, Zap, ShoppingCart } from 'lucide-react';

/**
 * 规则图层“分组开关”配置
 * - 修改这里即可增删按钮/规则
 * - 每个按钮的 criteria 默认使用 AND 逻辑：同时满足所有字段约束才会命中
 */

export type RuleButtonCriteria = {
  /** featureInfo.Class（优先读取 record.meta.className） */
  Class?: string[];
  /**
   * 归一化 Kind（根据要素表自动映射）：
   * - Point: PointKind / PointSKind / PointSKind2
   * - Polyline: PLineKind / PLineSKind / PLineSKind2
   * - Polygon: PGonKind / PGonSKind / PGonSKind2
   * - Building: BuildingKind / BuildingSKind
   * - Floor: FloorKind / FloorSKind
   * - fallback: Kind / SKind / SKind2
   */
  Kind?: string[];
  SKind?: string[];
  SKind2?: string[];
};


export type RuleButtonDef = {
  id: string;
  label: string;
  /** ToolIconButton 的 tone */
  tone: 'blue' | 'green' | 'cyan' | 'purple' | 'gray';
  icon: React.ReactNode;
  criteria: RuleButtonCriteria;

  /**
   * 互斥规则（预备结构）：当开启本按钮时，若这些按钮当前为开启状态，则会被强制关闭。
   * - 只需要在一侧声明即可（非必须对称）
   */
  exclusiveWith?: string[];
};

/**
 * 预设按钮：与当前“铁路/地标/玩家”相同的按钮风格与尺寸（ToolIconButton）
 */
export const RULE_BUTTON_DEFS: RuleButtonDef[] = [
  {
    id: 'railway_new',
    label: '铁路-新',
    tone: 'blue',
    icon: <Train className="w-5 h-5" />,
    criteria: { Class: ['RLE','STA', 'STB', 'PLF', 'PFB', 'SBP', 'STF'] },
  },
  {
    id: 'natural_geo',
    label: '自然地理',
    tone: 'green',
    icon: <Leaf className="w-5 h-5" />,
    criteria: { Class: ['ISG'], Kind: ['NGF'] },
  },
  {
    id: 'settlement',
    label: '聚落',
    tone: 'cyan',
    icon: <Home className="w-5 h-5" />,
    criteria: { Kind: ['ADM'], SKind: ['DBZ', 'DBP'] },
  },
  {
    id: 'planning',
    label: '规划',
    tone: 'gray',
    icon: <Map className="w-5 h-5" />,
    criteria: { Kind: ['ADM'], SKind: ['PLP'] },
  },
  {
    id: 'teleport_point',
    label: '传送点',
    tone: 'cyan',
    icon: <Zap className="w-5 h-5" />,
    criteria: { Class: ['TPP','WRP'] },
  },
  {
    id: 'trade_point',
    label: '交易点',
    tone: 'green',
    icon: <ShoppingCart className="w-5 h-5" />,
    criteria: { Class: ['TRP'] },
  },
  {
    id: 'building',
    label: '建筑',
    tone: 'purple',
    icon: <Building2 className="w-5 h-5" />,
    criteria: { Class: ['BUD', 'FLR', 'STB', 'STF'] },
  },
];

/**
 * 全局开关策略（预备结构）
 */
export const RULE_BUTTON_POLICY = {
  /** 同时开启的最大按钮数（<=0 视为不限制） */
  maxActive: 6,
};

/**
 * 每个世界的默认开启状态：
 * - 为了避免“全规则要素”过多，这里默认只启用上述五类
 * - 你可以按 worldId 覆盖（例如某些 world 想默认多开/少开）
 */
export const DEFAULT_ACTIVE_RULE_BUTTONS_BY_WORLD: Record<string, string[] | undefined> = {
  // e.g. 'ZTH': ['railway_new', 'settlement'],
  // fallback: undefined
};

export const DEFAULT_ACTIVE_RULE_BUTTONS_FALLBACK: string[] = RULE_BUTTON_DEFS.map((d) => d.id);
