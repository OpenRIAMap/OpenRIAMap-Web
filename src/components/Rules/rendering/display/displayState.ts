/**
 * RB_SLU display-state definitions.
 *
 * DisplayState 是最终调试与审计用状态，不直接等同于 Leaflet layer 类型。
 */

export const DISPLAY_STATES = [
  'hidden',
  'geometryOnly',
  'geometryWithLabel',
  'symbolOnly',
  'symbolWithLabel',
  'forceVisible',
  'abbreviatedLabel',
  'softVisible',
  'debugVisible',
] as const;

export type FeatureDisplayState = (typeof DISPLAY_STATES)[number];

export type FeatureDisplayStateReason =
  | 'visibilityBlocked'
  | 'geometryInvalid'
  | 'labelDisabled'
  | 'labelEmpty'
  | 'collisionFailed'
  | 'densityReduced'
  | 'selectedOverride'
  | 'editingOverride'
  | 'debugOverride'
  | 'normal';

export type FeatureDisplayStateSnapshot = {
  featureUid: string;
  state: FeatureDisplayState;
  reason: FeatureDisplayStateReason;
  labelVisible: boolean;
  symbolVisible: boolean;
  geometryVisible: boolean;
};

export function isDisplayState(value: string): value is FeatureDisplayState {
  return (DISPLAY_STATES as readonly string[]).includes(value);
}

export function buildDisplayStateSnapshot(
  featureUid: string,
  state: FeatureDisplayState,
  reason: FeatureDisplayStateReason = 'normal',
): FeatureDisplayStateSnapshot {
  return {
    featureUid,
    state,
    reason,
    labelVisible:
      state === 'geometryWithLabel' ||
      state === 'symbolWithLabel' ||
      state === 'forceVisible' ||
      state === 'abbreviatedLabel' ||
      state === 'softVisible' ||
      state === 'debugVisible',
    symbolVisible: state === 'symbolOnly' || state === 'symbolWithLabel' || state === 'forceVisible',
    geometryVisible: state === 'geometryOnly' || state === 'geometryWithLabel' || state === 'forceVisible',
  };
}
