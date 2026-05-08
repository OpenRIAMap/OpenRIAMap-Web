import { BASE_DISPLAY_DEFAULTS, getDisplayTierDefaults } from './displayDefaults';
import { getDisplayProfile } from './displayProfiles';
import type {
  DisplayTier,
  FeatureDisplayPlan,
  FeatureDisplayRuleDraft,
} from './displayTypes';

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeObjects<T extends object>(base: T, patch: Partial<T> | undefined): T {
  if (!patch) return { ...base };

  const out: PlainObject = { ...(base as PlainObject) };
  for (const [key, value] of Object.entries(patch as PlainObject)) {
    if (value === undefined) continue;

    const previous = out[key];
    if (isPlainObject(previous) && isPlainObject(value)) {
      out[key] = mergeObjects(previous, value);
    } else if (Array.isArray(value)) {
      out[key] = [...value];
    } else {
      out[key] = value;
    }
  }

  return out as T;
}

function mergeDisplayDraft(base: FeatureDisplayPlan, patch: FeatureDisplayRuleDraft | undefined): FeatureDisplayPlan {
  if (!patch) return { ...base };

  return {
    name: patch.name ?? base.name,
    match: patch.match ?? base.match,
    profile: patch.profile ?? base.profile,
    displayTier: patch.displayTier ?? base.displayTier,
    visibility: mergeObjects(base.visibility, patch.visibility),
    geometry: mergeObjects(base.geometry, patch.geometry),
    symbol: mergeObjects(base.symbol, patch.symbol),
    label: mergeObjects(base.label, patch.label),
    anchor: mergeObjects(base.anchor, patch.anchor),
    collision: mergeObjects(base.collision, patch.collision),
    stability: mergeObjects(base.stability, patch.stability),
    density: mergeObjects(base.density, patch.density),
    interaction: mergeObjects(base.interaction, patch.interaction),
    fallback: mergeObjects(base.fallback, patch.fallback),
  };
}

export type NormalizeDisplayRuleOptions = {
  defaultTier?: DisplayTier;
  profile?: string;
  name?: string;
};

export function normalizeDisplayRule(
  draft: FeatureDisplayRuleDraft | undefined,
  options: NormalizeDisplayRuleOptions = {},
): FeatureDisplayPlan {
  const requestedTier = draft?.displayTier ?? options.defaultTier ?? BASE_DISPLAY_DEFAULTS.displayTier;
  const requestedProfile = draft?.profile ?? options.profile;

  let plan = mergeDisplayDraft(BASE_DISPLAY_DEFAULTS, getDisplayTierDefaults(requestedTier));
  plan = mergeDisplayDraft(plan, getDisplayProfile(requestedProfile));
  plan = mergeDisplayDraft(plan, draft);

  return {
    ...plan,
    name: draft?.name ?? options.name ?? plan.name,
    profile: requestedProfile ?? plan.profile,
    displayTier: draft?.displayTier ?? plan.displayTier,
  };
}
