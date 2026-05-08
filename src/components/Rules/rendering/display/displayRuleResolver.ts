import type { FeatureStore } from '@/components/Rules/data/featureStore';
import type { FeatureRecord, RenderContext, RenderRule } from '@/components/Rules/rendering/renderRules';
import { getDisplayPlanSortKey } from './displayPriority';
import { normalizeDisplayRule } from './displayRuleNormalizer';
import type { DisplayMode, DisplayTier, FeatureDisplayPlan } from './displayTypes';

/**
 * RB_SLU display resolver.
 *
 * 本文件是 RB_SLU_3 的接入层：
 * - 将 RenderRule.display 标准化为完整 FeatureDisplayPlan；
 * - 提供不会改变旧视觉表现的基础 visibility gate；
 * - 暂不改写 symbol / label / collision 的实际渲染路径。
 */

export type ResolveFeatureDisplayPlanOptions = {
  selected?: boolean;
  hovered?: boolean;
  editing?: boolean;
  searchResult?: boolean;
  deletionMarked?: boolean;
};

export type DisplayVisibilityGateOptions = {
  /**
   * RB_SLU_3 默认不启用 mode gate，避免 indoor / editing 规则提前改变旧显示表现。
   * 后续 patch 接管显示引擎时再打开。
   */
  applyModeGate?: boolean;
};

const CLASS_TIER_HINTS: Record<string, DisplayTier> = {
  RLE: 'network',
  ROD: 'network',
  ISL: 'network',
  ISG: 'geoStructure',

  BUD: 'structure',
  STB: 'structure',
  PFB: 'structure',

  STA: 'transportNode',
  PLF: 'transportNode',

  STF: 'indoor',
  FLR: 'indoor',

  TRP: 'poi',
  TPP: 'poi',
  WRP: 'poi',
  ISP: 'poi',
  SBP: 'poi',
};

export function getDisplayModeFromRenderContext(ctx: RenderContext): DisplayMode {
  return ctx.inFloorView ? 'floor' : 'normal';
}

function inferDisplayTier(feature: FeatureRecord, rule: RenderRule | null): DisplayTier {
  const explicit = rule?.display?.displayTier;
  if (explicit) return explicit;

  const cls = String(feature?.meta?.Class ?? '').trim();
  const byClass = CLASS_TIER_HINTS[cls];
  if (byClass) return byClass;

  if (feature.type === 'Polyline') return 'network';
  if (feature.type === 'Polygon') return 'structure';
  return 'poi';
}

function mergeMatchFromRule(plan: FeatureDisplayPlan, rule: RenderRule | null, feature: FeatureRecord): FeatureDisplayPlan {
  if (plan.match) return plan;

  return {
    ...plan,
    match: {
      Class: rule?.match?.Class ?? feature.meta.Class,
      Type: rule?.match?.Type ?? feature.type,
    },
  };
}

function applyForceLabelOverride(
  plan: FeatureDisplayPlan,
  args: {
    priority?: number;
    role?: FeatureDisplayPlan['collision']['role'];
    forceShowLabel?: boolean;
  },
): FeatureDisplayPlan {
  const forceShowLabel = args.forceShowLabel !== false;

  return {
    ...plan,
    collision: {
      ...plan.collision,
      role: args.role ?? plan.collision.role,
      priority: args.priority ?? plan.collision.priority,
      allowHide: forceShowLabel ? false : plan.collision.allowHide,
      hidePolicy: forceShowLabel ? 'forceShow' : plan.collision.hidePolicy,
    },
    density: forceShowLabel
      ? {
          ...plan.density,
          preserveSelected: true,
          preserveRequired: true,
        }
      : plan.density,
  };
}

function applyInteractionOverrides(
  plan: FeatureDisplayPlan,
  options: ResolveFeatureDisplayPlanOptions,
): FeatureDisplayPlan {
  let next = plan;

  if (options.selected) {
    const selected = plan.interaction.selected;
    next = applyForceLabelOverride(next, {
      role: selected?.collisionRoleOverride ?? 'required',
      priority: selected?.priorityOverride ?? 10000,
      forceShowLabel: selected?.forceShowLabel ?? true,
    });
  }

  if (options.searchResult) {
    const searchResult = plan.interaction.searchResult;
    next = applyForceLabelOverride(next, {
      role: 'required',
      priority: searchResult?.priorityOverride ?? 9500,
      forceShowLabel: searchResult?.forceShowLabel ?? true,
    });
  }

  if (options.editing) {
    const editing = plan.interaction.editing;
    next = applyForceLabelOverride(next, {
      role: 'required',
      priority: editing?.priorityOverride ?? 9000,
      forceShowLabel: editing?.forceShowLabel ?? true,
    });
  }

  if (options.deletionMarked) {
    const deletionMarked = plan.interaction.deletionMarked;
    next = applyForceLabelOverride(next, {
      role: 'required',
      priority: Math.max(next.collision.priority, 9000),
      forceShowLabel: deletionMarked?.forceShowLabel ?? true,
    });
  }

  if (options.hovered && plan.interaction.hover?.showLabel) {
    next = applyForceLabelOverride(next, {
      role: next.collision.role === 'soft' ? 'optional' : next.collision.role,
      priority: Math.max(next.collision.priority, 7000),
      forceShowLabel: true,
    });
  }

  return next;
}

export function resolveFeatureDisplayPlan(
  feature: FeatureRecord,
  rule: RenderRule | null,
  ctx: RenderContext,
  _store?: FeatureStore,
  options: ResolveFeatureDisplayPlanOptions = {},
): FeatureDisplayPlan {
  const defaultTier = inferDisplayTier(feature, rule);
  const normalized = normalizeDisplayRule(rule?.display, {
    defaultTier,
    name: rule?.name,
  });

  const withMatch = mergeMatchFromRule(normalized, rule, feature);

  return applyInteractionOverrides(withMatch, {
    ...options,
    editing: options.editing ?? getDisplayModeFromRenderContext(ctx) === 'editing',
  });
}

export function shouldRenderByDisplayPlan(
  plan: FeatureDisplayPlan,
  ctx: RenderContext,
  options: DisplayVisibilityGateOptions = {},
): boolean {
  const visibility = plan.visibility;
  const zoomLevel = ctx.zoomLevel;

  if (visibility.minZoom !== undefined && zoomLevel < visibility.minZoom) return false;
  if (visibility.maxZoom !== undefined && zoomLevel > visibility.maxZoom) return false;

  if (options.applyModeGate && visibility.modes && visibility.modes.length > 0) {
    const mode = getDisplayModeFromRenderContext(ctx);
    if (!visibility.modes.includes(mode)) return false;
  }

  return true;
}

export function summarizeDisplayPlan(plan: FeatureDisplayPlan): string {
  return [
    `tier=${plan.displayTier}`,
    `role=${plan.collision.role}`,
    `priority=${plan.collision.priority}`,
    `anchor=${plan.anchor.strategy}`,
    `stateKey=${getDisplayPlanSortKey(plan)}`,
  ].join(';');
}
