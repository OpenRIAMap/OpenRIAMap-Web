import type { FeatureRecord } from '@/components/Rules/rendering/renderRules';
import {
  getByPath,
  projectRegistryScene,
  resolveClassificationDisplayName,
  resolveWorkflowEditorSchema,
  type ProjectedRegistryField,
  type ProjectedRegistryGroup,
  type ProjectedRegistryScene,
  type WorkflowEditorSchema,
} from '../../Common/workflowEditorRegistry';
import { makeExternalLink } from './cardInteractions';
import type { CardRow } from './fieldRules';

export type CardRegistryFieldSource = ProjectedRegistryField | ProjectedRegistryGroup;

export type CardRegistryRowEntry = {
  source: CardRegistryFieldSource;
  row: CardRow;
};

export type CardRegistryContext = {
  feature: FeatureRecord;
  featureInfo: any;
  classCode: string;
  kind: string;
  skind: string;
  skind2: string;
  schema: WorkflowEditorSchema | null;
  schemaKey: string;
  view: ProjectedRegistryScene | null;
  classificationRow?: CardRow;
  rowsByKey: Map<string, CardRegistryRowEntry>;
  rowsByPath: Map<string, CardRegistryRowEntry>;
  defaultMainRows: CardRegistryRowEntry[];
  defaultOtherRows: CardRegistryRowEntry[];
  registryPaths: Set<string>;
  systemPaths: Set<string>;
};

const CLASS_TO_SUBTYPE: Record<string, string> = {
  ISG: '地物面',
  ISL: '地物线',
  ISP: '地物点',
  BUD: '建筑',
  FLR: '建筑楼层',
  ROD: '道路',
  TPP: '传送点',
  WRP: 'Warp点',
  TRP: '交易点',
  STA: '车站',
  PLF: '站台',
  RLE: '铁路',
  PFB: '站台轮廓',
  STB: '车站建筑',
  SBP: '车站建筑点',
  STF: '车站建筑楼层',
};

export const SYSTEM_META_PATHS = [
  'CreateTime',
  'createTime',
  'CreateBy',
  'createBy',
  'ModifityTime',
  'ModifyTime',
  'ModifiedTime',
  'modifityTime',
  'modifyTime',
  'modifiedTime',
  'ModifityBy',
  'ModifyBy',
  'ModifiedBy',
  'modifityBy',
  'modifyBy',
  'modifiedBy',
  'UpdateTime',
  'updateTime',
  'UpdateBy',
  'updateBy',
];

const normalize = (value: unknown): string => String(value ?? '').trim();

export const isEmptyCardValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
};

export const formatRegistryValue = (field: CardRegistryFieldSource, value: unknown): unknown => {
  if (field.formatter === 'externalLink') {
    const url = normalize(value);
    return url ? makeExternalLink(url) : '未知';
  }
  if (field.formatter === 'boolText') {
    if (value === true) return '是';
    if (value === false) return '否';
    const s = normalize(value).toLowerCase();
    if (s === 'true') return '是';
    if (s === 'false') return '否';
    return normalize(value) || '未知';
  }
  if (field.formatter === 'json') return value;
  return isEmptyCardValue(value) ? '未知' : value;
};

const getFeatureSubType = (classCode: string): any => CLASS_TO_SUBTYPE[classCode] ?? undefined;

const pushEntry = (ctx: CardRegistryContext, source: CardRegistryFieldSource, value: unknown) => {
  ctx.registryPaths.add(source.path);
  const row: CardRow = {
    label: source.label,
    value: formatRegistryValue(source, value),
    usedPaths: [source.path],
  };
  if ((source as any).hideWhenEmpty && isEmptyCardValue(value)) return;
  const entry: CardRegistryRowEntry = { source, row };
  ctx.rowsByKey.set(source.key, entry);
  ctx.rowsByPath.set(source.path, entry);
  if (source.section === 'other') ctx.defaultOtherRows.push(entry);
  else ctx.defaultMainRows.push(entry);
};

export const buildCardRegistryContext = (feature: FeatureRecord): CardRegistryContext => {
  const featureInfo: any = feature?.featureInfo ?? {};
  const classCode = normalize(feature?.meta?.Class ?? featureInfo?.Class ?? featureInfo?.Kind);
  const kind = normalize(featureInfo?.Kind);
  const skind = normalize(featureInfo?.SKind);
  const skind2 = normalize(featureInfo?.SKind2);
  const schema = resolveWorkflowEditorSchema({ subType: getFeatureSubType(classCode), featureInfo });
  const view = schema ? projectRegistryScene(schema, 'infocard') : null;

  const ctx: CardRegistryContext = {
    feature,
    featureInfo,
    classCode,
    kind,
    skind,
    skind2,
    schema,
    schemaKey: schema?.schemaKey ?? '',
    view,
    rowsByKey: new Map(),
    rowsByPath: new Map(),
    defaultMainRows: [],
    defaultOtherRows: [],
    registryPaths: new Set(SYSTEM_META_PATHS),
    systemPaths: new Set(SYSTEM_META_PATHS),
  };

  if (!schema || !view || schema.integrations?.infocard === 'fallback') return ctx;

  if (view.classification) {
    const label = resolveClassificationDisplayName(view.classification.ref, featureInfo) || schema.displayName || '未知';
    ctx.classificationRow = {
      label: view.classification.label || '类型',
      value: label || '未知',
      usedPaths: ['Kind', 'SKind', 'SKind2', 'Class'],
    };
    for (const path of ctx.classificationRow.usedPaths ?? []) ctx.registryPaths.add(path);
  } else if (schema.displayName) {
    ctx.classificationRow = {
      label: '类型',
      value: schema.displayName,
      usedPaths: ['Kind', 'SKind', 'SKind2', 'Class'],
    };
    for (const path of ctx.classificationRow.usedPaths ?? []) ctx.registryPaths.add(path);
  }

  for (const field of view.fields) {
    pushEntry(ctx, field, getByPath(featureInfo, field.path));
  }

  for (const group of view.groups) {
    pushEntry(ctx, group, getByPath(featureInfo, group.path));
  }

  return ctx;
};
