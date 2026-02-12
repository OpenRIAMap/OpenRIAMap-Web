import type { ComponentType } from 'react';

import FeatureInteractionCard from '../FeatureInteractionCard';
import TRPFeatureInteractionCard from './TRPFeatureInteractionCard';

import type { FeatureRecord } from '../renderRules';
import type { ResolveFeatureById } from './cardInteractions';

export type FeatureCardCommonProps = {
  open: boolean;
  feature?: FeatureRecord | null;
  onClose?: () => void;
  // Optional hooks used by the default card; special cards may ignore.
  resolveFeatureById?: ResolveFeatureById;
  onTryTriggerLabelClickById?: (id: string) => void;
};

export const FEATURE_CARD_REGISTRY: Record<string, ComponentType<FeatureCardCommonProps>> = {
  TRP: TRPFeatureInteractionCard,
};

export function resolveFeatureCardComponent(classCode: unknown): ComponentType<FeatureCardCommonProps> {
  const key = String(classCode ?? '').trim().toUpperCase();
  return FEATURE_CARD_REGISTRY[key] ?? FeatureInteractionCard;
}
