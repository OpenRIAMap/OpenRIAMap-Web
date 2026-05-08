import type { DisplayCollisionRole, DisplayTier, FeatureDisplayPlan } from './displayTypes';

export const DISPLAY_TIER_ORDER: Record<DisplayTier, number> = {
  baseSurface: 100,
  geoStructure: 200,
  network: 300,
  structure: 400,
  transportNode: 500,
  poi: 600,
  indoor: 700,
  editing: 900,
  debug: 1000,
};

export const COLLISION_ROLE_ORDER: Record<DisplayCollisionRole, number> = {
  ignore: 0,
  soft: 100,
  optional: 200,
  important: 300,
  required: 400,
};

export function getDisplayTierOrder(tier: DisplayTier): number {
  return DISPLAY_TIER_ORDER[tier] ?? 0;
}

export function getCollisionRoleOrder(role: DisplayCollisionRole): number {
  return COLLISION_ROLE_ORDER[role] ?? 0;
}

export function getDisplayPlanSortKey(plan: FeatureDisplayPlan): number {
  const tierOrder = getDisplayTierOrder(plan.displayTier);
  const roleOrder = getCollisionRoleOrder(plan.collision.role);
  return tierOrder * 100000 + roleOrder * 1000 + plan.collision.priority;
}

export function compareDisplayPlans(a: FeatureDisplayPlan, b: FeatureDisplayPlan): number {
  return getDisplayPlanSortKey(b) - getDisplayPlanSortKey(a);
}

export type CollisionRoleMatrix = Record<DisplayCollisionRole, DisplayCollisionRole[]>;

/**
 * RB_SLU_9 default label-vs-label collision matrix.
 *
 * Interpretation:
 * - the key is the incoming label role;
 * - the value is the set of already-placed label roles that should block it.
 *
 * This mirrors labelLayout.ts and exists as display-level documentation for
 * future rule authors. labelLayout keeps a local lightweight copy to avoid
 * coupling rendering internals back to registry helpers.
 */
export const DEFAULT_COLLISION_ROLE_MATRIX: CollisionRoleMatrix = {
  required: ['required'],
  important: ['required', 'important'],
  optional: ['required', 'important', 'optional'],
  soft: ['required', 'important', 'optional', 'soft'],
  ignore: [],
};

export function getBlockingRolesForIncomingRole(role: DisplayCollisionRole): DisplayCollisionRole[] {
  return DEFAULT_COLLISION_ROLE_MATRIX[role] ?? [];
}

