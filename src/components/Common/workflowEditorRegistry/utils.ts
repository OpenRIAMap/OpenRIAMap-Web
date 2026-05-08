import {
  WORKFLOW_FEATURE_CATALOG,
  listCatalogClassOptions,
  listCatalogKindOptions,
  listCatalogSKind2Options,
  type FeatureKey,
} from '../featureFormats';
import type {
  FieldSceneUsage,
  PersistedFieldDef,
  ProjectedRegistryClassification,
  ProjectedRegistryField,
  ProjectedRegistryGroup,
  ProjectedRegistryScene,
  RegistryClassificationDef,
  RegistryClassificationOption,
  RegistryClassificationRef,
  RegistryScene,
  WorkflowEditorSchema,
} from './types';

const normalizeText = (value: unknown): string => String(value ?? '').trim();

const scoreSchemaMatch = (schema: WorkflowEditorSchema, args: {
  workflowKey?: string;
  subType?: FeatureKey;
  featureInfo?: any;
}): number => {
  const match = schema.match;
  const workflowKey = normalizeText(args.workflowKey);
  const subType = args.subType;
  const kind = normalizeText(args.featureInfo?.Kind);
  const skind = normalizeText(args.featureInfo?.SKind);
  const skind2 = normalizeText(args.featureInfo?.SKind2);

  if (workflowKey && match.workflowKeys?.includes(workflowKey)) return 1000;

  if (match.subType && subType && match.subType !== subType) return -1;
  if (match.subType && !subType) return -1;
  if (match.kind && match.kind !== kind) return -1;
  if (match.skind && match.skind !== skind) return -1;
  if (match.skind2 && match.skind2 !== skind2) return -1;

  let score = 0;
  if (match.subType && subType === match.subType) score += 10;
  if (match.kind) score += 20;
  if (match.skind) score += 30;
  if (match.skind2) score += 40;
  if (match.classCode) score += 1;
  return score > 0 ? score : -1;
};

export const resolveRegistrySchema = (
  schemas: readonly WorkflowEditorSchema[],
  args: {
    workflowKey?: string;
    subType?: FeatureKey;
    featureInfo?: any;
  }
): WorkflowEditorSchema | null => {
  let best: { schema: WorkflowEditorSchema; score: number } | null = null;
  for (const schema of schemas) {
    const score = scoreSchemaMatch(schema, args);
    if (score < 0) continue;
    if (!best || score > best.score) best = { schema, score };
  }
  return best?.schema ?? null;
};

export const getByPath = (obj: unknown, path: string): unknown => {
  if (!path) return undefined;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
};

export const setByPath = (obj: Record<string, unknown>, path: string, value: unknown): void => {
  const parts = path.split('.').filter(Boolean);
  if (!parts.length) return;
  let cursor: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    const next = cursor[key];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
};

const getSceneUsage = (
  field: PersistedFieldDef,
  scene: RegistryScene
): FieldSceneUsage | undefined => {
  if (scene === 'workflow') return field.workflow;
  if (scene === 'editor') return field.editor;
  return field.infocard;
};

export const getSceneLabel = (
  field: Pick<PersistedFieldDef, 'labels'>,
  scene: RegistryScene,
  usage?: FieldSceneUsage
): string => {
  if (usage?.label) return usage.label;
  if (scene === 'workflow' && field.labels.workflow) return field.labels.workflow;
  if (scene === 'editor' && field.labels.editor) return field.labels.editor;
  if (scene === 'infocard' && field.labels.infocard) return field.labels.infocard;
  return field.labels.default;
};

const projectField = (
  field: PersistedFieldDef,
  scene: RegistryScene,
  fallbackOrder: number
): ProjectedRegistryField | null => {
  const usage = getSceneUsage(field, scene);
  if (!usage?.visible) return null;
  return {
    key: field.key,
    path: field.path,
    label: getSceneLabel(field, scene, usage),
    control: usage.control,
    rows: usage.rows,
    selectSource: usage.selectSource,
    searchConfigKey: usage.searchConfigKey,
    section: usage.section,
    formatter: usage.formatter,
    order: usage.order ?? fallbackOrder,
    placeholder: usage.placeholder,
    readonly: usage.readonly,
    hideWhenEmpty: usage.hideWhenEmpty,
  };
};

const projectClassification = (
  classification: RegistryClassificationDef | undefined,
  scene: RegistryScene
): ProjectedRegistryClassification | undefined => {
  if (!classification) return undefined;
  const usage = scene === 'workflow'
    ? classification.workflow
    : scene === 'editor'
      ? classification.editor
      : classification.infocard;
  if (!usage?.visible) return undefined;
  return {
    ref: classification.ref,
    editScope: classification.editScope,
    label: usage.label,
    order: usage.order,
    section: usage.section,
  };
};

export const projectRegistryScene = (
  schema: WorkflowEditorSchema,
  scene: RegistryScene
): ProjectedRegistryScene => {
  const idField = projectField(schema.idField, scene, 0) ?? {
    key: 'ID',
    path: 'ID',
    label: getSceneLabel(schema.idField, scene, undefined),
    control: 'text',
    order: 0,
  };

  const fields = schema.persistedFields
    .map((field, index) => projectField(field, scene, 100 + index))
    .filter((field): field is ProjectedRegistryField => Boolean(field))
    .sort((a, b) => a.order - b.order);

  const groups = (schema.groups ?? [])
    .map<ProjectedRegistryGroup | null>((group, index) => {
      const usage = scene === 'workflow' ? group.workflow : scene === 'editor' ? group.editor : group.infocard;
      if (!usage?.visible) return null;
      return {
        key: group.key,
        path: group.path,
        label: usage.label ?? group.labels[scene] ?? group.labels.default,
        order: usage.order ?? 500 + index,
        optional: group.optional,
        minItems: group.minItems,
        section: usage.section,
        formatter: usage.formatter,
        fields: group.fields,
      };
    })
    .filter((group): group is ProjectedRegistryGroup => Boolean(group))
    .sort((a, b) => a.order - b.order);

  const auxInputs = scene === 'workflow'
    ? [...(schema.workflowAuxInputs ?? [])].sort((a, b) => a.order - b.order)
    : [];

  return {
    schemaKey: schema.schemaKey,
    displayName: schema.displayName,
    scene,
    classification: projectClassification(schema.classification, scene),
    idField,
    auxInputs,
    fields,
    groups,
    allowUnparsedBlock: Boolean(schema.allowUnparsedBlock),
    integrations: schema.integrations,
  };
};

export const getClassificationOptions = (
  ref: RegistryClassificationRef | undefined
): RegistryClassificationOption[] => {
  if (!ref) return [];
  if (ref.mode === 'classCatalog') {
    return listCatalogClassOptions({ classCode: ref.classCode, geom: ref.geom }).map((item) => ({
      kind: item.kind,
      skind: item.skind,
      skind2: item.entry.skind2,
      name: item.name,
      label: item.label,
      classCode: item.entry.classCode,
      geom: item.entry.geom,
    }));
  }

  if (ref.skind) {
    return listCatalogSKind2Options({ kind: ref.kind ?? '', skind: ref.skind, geom: ref.geom }).map((item) => ({
      kind: item.entry.kind,
      skind: item.entry.skind,
      skind2: item.skind2,
      name: item.name,
      label: item.label,
      classCode: item.entry.classCode,
      geom: item.entry.geom,
    }));
  }

  if (ref.kind) {
    return listCatalogKindOptions({ kind: ref.kind, geom: ref.geom }).map((item) => ({
      kind: ref.kind ?? item.entry.kind,
      skind: item.skind,
      skind2: item.skind2,
      name: item.name,
      label: item.label,
      classCode: item.entry.classCode,
      geom: item.entry.geom,
    }));
  }

  return WORKFLOW_FEATURE_CATALOG
    .filter((entry) => entry.classCode === ref.classCode && entry.geom === ref.geom)
    .map((entry) => ({
      kind: entry.kind,
      skind: entry.skind,
      skind2: entry.skind2,
      name: entry.name,
      label: `${entry.name}（${entry.kind}/${entry.skind}/${entry.skind2}）`,
      classCode: entry.classCode,
      geom: entry.geom,
    }));
};

export const resolveClassificationDisplayName = (
  ref: RegistryClassificationRef | undefined,
  featureInfo: any
): string => {
  if (!ref) return '';
  const kind = normalizeText(featureInfo?.Kind);
  const skind = normalizeText(featureInfo?.SKind);
  const skind2 = normalizeText(featureInfo?.SKind2);
  const hit = WORKFLOW_FEATURE_CATALOG.find((entry) => {
    if (ref.mode === 'classCatalog' && entry.classCode !== ref.classCode) return false;
    if (ref.mode === 'workflowCatalog' && (entry.classCode !== ref.classCode || entry.geom !== ref.geom)) return false;
    return entry.kind === kind && entry.skind === skind && entry.skind2 === skind2;
  });
  return hit?.name ?? [kind, skind, skind2].filter(Boolean).join('/');
};
