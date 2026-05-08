import type { CardRow } from './fieldRules';
import { makeExternalLink, makeFeatureLink } from './cardInteractions';

export type CardRegistryValueTransform = 'featureLink' | 'externalLink';

export type CardRegistryFieldOverlay = {
  path: string;
  label?: string;
  transform?: CardRegistryValueTransform;
  hidden?: boolean;
};

export type CardRegistryOverlay = {
  schemaKey?: string;
  fieldOverlays: CardRegistryFieldOverlay[];
};

export const CARD_REGISTRY_OVERLAYS: CardRegistryOverlay[] = [
  {
    schemaKey: 'flr_unit',
    fieldOverlays: [
      { path: 'BuildingID', transform: 'featureLink' },
      { path: 'tags.BuildingID', transform: 'featureLink' },
    ],
  },
  {
    schemaKey: 'tpp_teleport',
    fieldOverlays: [
      { path: 'TGTWarp', transform: 'featureLink' },
    ],
  },
  {
    schemaKey: 'rail_station',
    fieldOverlays: [
      { path: 'STBuilding', transform: 'featureLink' },
    ],
  },
  {
    schemaKey: 'rail_platform_boundary',
    fieldOverlays: [
      { path: 'LineID', transform: 'featureLink' },
    ],
  },
];

const normalize = (value: unknown): string => String(value ?? '').trim();

const findFieldOverlay = (schemaKey: string, path: string): CardRegistryFieldOverlay | null => {
  const normalizedSchemaKey = normalize(schemaKey);
  const normalizedPath = normalize(path);
  if (!normalizedPath) return null;
  for (const overlay of CARD_REGISTRY_OVERLAYS) {
    if (overlay.schemaKey && normalize(overlay.schemaKey) !== normalizedSchemaKey) continue;
    const hit = overlay.fieldOverlays.find((item) => normalize(item.path) === normalizedPath);
    if (hit) return hit;
  }
  return null;
};

export const applyCardRegistryFieldOverlay = (args: {
  schemaKey: string;
  path: string;
  row: CardRow;
}): CardRow | null => {
  const overlay = findFieldOverlay(args.schemaKey, args.path);
  if (!overlay) return args.row;
  if (overlay.hidden) return null;

  const next: CardRow = {
    ...args.row,
    label: overlay.label ?? args.row.label,
  };

  if (overlay.transform === 'featureLink') {
    const id = normalize(args.row.value);
    next.value = id ? makeFeatureLink(id) : '未知';
  }

  if (overlay.transform === 'externalLink') {
    const url = normalize(args.row.value);
    next.value = url ? makeExternalLink(url) : '未知';
  }

  return next;
};
