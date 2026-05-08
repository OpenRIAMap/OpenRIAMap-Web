import {
  getByPath,
  setByPath,
  type ProjectedRegistryScene,
  type ProjectedRegistryField,
  type ProjectedRegistryGroup,
} from './workflowEditorRegistry';

export const CLASSIFICATION_DRAFT_KEY = '__workflowEditorClassification';

export type WorkflowEditorDraftValues = Record<string, unknown>;

export type WorkflowEditorUnparsedEntry = {
  path: string;
  value: unknown;
  valueText: string;
  valueKind: 'primitive' | 'json';
};

const SYSTEM_ROOT_KEYS = new Set([
  'Type',
  'Class',
  'World',
  'CreateTime',
  'CreateBy',
  'ModifyTime',
  'ModifyBy',
  'ModifityTime',
  'ModifityBy',
  'ModifiedTime',
  'ModifiedBy',
  'UpdateTime',
  'UpdateBy',
]);

const GEOMETRY_ROOT_KEYS = new Set([
  'coordinate',
  'coordinates',
  'Linepoints',
  'PLpoints',
  'Flrpoints',
  'Conpoints',
  'Polygonpoints',
]);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

const cloneJsonValue = <T,>(value: T): T => {
  if (value === undefined || value === null) return value;
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
};

const encodeClassificationValue = (featureInfo: Record<string, unknown> | undefined): string => {
  const kind = String(featureInfo?.Kind ?? '').trim();
  const skind = String(featureInfo?.SKind ?? '').trim();
  const skind2 = String(featureInfo?.SKind2 ?? '').trim();
  return [kind, skind, skind2].join('||');
};

const decodeClassificationValue = (encoded: unknown): { kind: string; skind: string; skind2: string } | null => {
  const text = String(encoded ?? '').trim();
  if (!text) return null;
  const [kind = '', skind = '', skind2 = ''] = text.split('||');
  if (!kind && !skind && !skind2) return null;
  return { kind, skind, skind2 };
};

const stableStringify = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const isPrimitiveValue = (value: unknown): boolean => {
  return value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value);
};

const isBlankValue = (value: unknown): boolean => {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (isRecord(value)) return Object.keys(value).length === 0;
  return false;
};

const shouldOmitEmptyPath = (field: ProjectedRegistryField, value: unknown): boolean => {
  if (!isBlankValue(value)) return false;
  if (field.path.startsWith('tags.') || field.path.startsWith('extensions.')) return true;
  if (field.hideWhenEmpty) return true;
  return false;
};

const deleteByPath = (obj: Record<string, unknown>, path: string): void => {
  const parts = path.split('.').filter(Boolean);
  if (!parts.length) return;

  const parents: Array<{ obj: Record<string, unknown>; key: string }> = [];
  let cursor: unknown = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!isRecord(cursor)) return;
    const key = parts[i];
    parents.push({ obj: cursor, key });
    cursor = cursor[key];
  }
  if (!isRecord(cursor)) return;
  delete cursor[parts[parts.length - 1]];

  for (let i = parents.length - 1; i >= 0; i -= 1) {
    const parent = parents[i];
    const child = parent.obj[parent.key];
    if (isRecord(child) && Object.keys(child).length === 0) {
      delete parent.obj[parent.key];
    } else {
      break;
    }
  }
};

const isPathCovered = (path: string, coveredPaths: Set<string>): boolean => {
  if (coveredPaths.has(path)) return true;
  for (const covered of coveredPaths) {
    if (path.startsWith(`${covered}.`)) return true;
  }
  return false;
};

const hasCoveredDescendant = (path: string, coveredPaths: Set<string>): boolean => {
  for (const covered of coveredPaths) {
    if (covered.startsWith(`${path}.`)) return true;
  }
  return false;
};

const addUnparsedEntry = (entries: WorkflowEditorUnparsedEntry[], path: string, value: unknown): void => {
  entries.push({
    path,
    value: cloneJsonValue(value),
    valueText: stableStringify(value),
    valueKind: isPrimitiveValue(value) ? 'primitive' : 'json',
  });
};

const collectNestedUnparsed = (
  entries: WorkflowEditorUnparsedEntry[],
  value: unknown,
  prefix: string,
  coveredPaths: Set<string>
): void => {
  if (isPathCovered(prefix, coveredPaths)) return;

  if (isRecord(value) && hasCoveredDescendant(prefix, coveredPaths)) {
    for (const [key, child] of Object.entries(value)) {
      collectNestedUnparsed(entries, child, `${prefix}.${key}`, coveredPaths);
    }
    return;
  }

  addUnparsedEntry(entries, prefix, value);
};

const collectUnparsedEntries = (
  featureInfo: Record<string, unknown>,
  coveredPaths: Set<string>
): WorkflowEditorUnparsedEntry[] => {
  const entries: WorkflowEditorUnparsedEntry[] = [];

  for (const [rootKey, rootValue] of Object.entries(featureInfo)) {
    if (SYSTEM_ROOT_KEYS.has(rootKey) || GEOMETRY_ROOT_KEYS.has(rootKey)) continue;
    if (isPathCovered(rootKey, coveredPaths)) continue;

    if ((rootKey === 'tags' || rootKey === 'extensions') && isRecord(rootValue)) {
      for (const [childKey, childValue] of Object.entries(rootValue)) {
        collectNestedUnparsed(entries, childValue, `${rootKey}.${childKey}`, coveredPaths);
      }
      continue;
    }

    collectNestedUnparsed(entries, rootValue, rootKey, coveredPaths);
  }

  return entries.sort((a, b) => a.path.localeCompare(b.path));
};

const collectCoveredPaths = (view: ProjectedRegistryScene): Set<string> => {
  const out = new Set<string>();
  out.add(view.idField.path);
  for (const field of view.fields) {
    out.add(field.path);
    if (field.key === 'TGTelevation') out.add('TGTcoordinate.y');
    if (field.path === 'Trade') out.add('trade');
  }
  for (const group of view.groups) out.add(group.path);
  if (view.classification) {
    out.add('Kind');
    out.add('SKind');
    out.add('SKind2');
  }
  return out;
};

const initFieldValue = (field: ProjectedRegistryField, raw: unknown): unknown => {
  if (raw !== undefined && raw !== null) return cloneJsonValue(raw);
  if (field.control === 'bool') return false;
  return '';
};

const normalizeGroupItem = (group: ProjectedRegistryGroup, rawItem: unknown): Record<string, unknown> => {
  if (isRecord(rawItem)) return cloneJsonValue(rawItem);

  const singleField = group.fields.length === 1 ? group.fields[0] : null;
  if (singleField) {
    if (Array.isArray(rawItem)) return { [singleField.key]: rawItem[0] ?? '' };
    return { [singleField.key]: rawItem ?? '' };
  }

  return {};
};

const initGroupValue = (group: ProjectedRegistryGroup, raw: unknown): unknown => {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => normalizeGroupItem(group, item));
};

export const parseFeatureInfoByRegistry = (
  featureInfo: unknown,
  view: ProjectedRegistryScene
): { values: WorkflowEditorDraftValues; unparsedEntries: WorkflowEditorUnparsedEntry[] } => {
  const source = isRecord(featureInfo) ? featureInfo : {};
  const values: WorkflowEditorDraftValues = {};

  values[view.idField.path] = initFieldValue(view.idField, getByPath(source, view.idField.path));

  if (view.classification) {
    values[CLASSIFICATION_DRAFT_KEY] = encodeClassificationValue(source);
  }

  for (const field of view.fields) {
    let rawFieldValue = getByPath(source, field.path);
    if (rawFieldValue === undefined && field.key === 'TGTelevation') {
      rawFieldValue = getByPath(source, 'TGTcoordinate.y');
    }
    if (rawFieldValue === undefined && field.path === 'Trade') {
      rawFieldValue = getByPath(source, 'trade');
    }
    values[field.path] = initFieldValue(field, rawFieldValue);
  }

  for (const group of view.groups) {
    values[group.path] = initGroupValue(group, getByPath(source, group.path));
  }

  const coveredPaths = collectCoveredPaths(view);
  const unparsedEntries = view.allowUnparsedBlock ? collectUnparsedEntries(source, coveredPaths) : [];

  return { values, unparsedEntries };
};

export const updateUnparsedEntryValue = (
  entry: WorkflowEditorUnparsedEntry,
  nextText: string
): WorkflowEditorUnparsedEntry => {
  if (entry.valueKind === 'primitive') {
    return { ...entry, value: nextText, valueText: nextText };
  }

  try {
    return { ...entry, value: JSON.parse(nextText), valueText: nextText };
  } catch {
    return { ...entry, valueText: nextText };
  }
};

export const mergeEditorDraftIntoFeatureInfo = (args: {
  originalFeatureInfo: unknown;
  view: ProjectedRegistryScene;
  draftValues: WorkflowEditorDraftValues;
}): Record<string, unknown> => {
  const next = cloneJsonValue(isRecord(args.originalFeatureInfo) ? args.originalFeatureInfo : {}) as Record<string, unknown>;

  setByPath(next, args.view.idField.path, args.draftValues[args.view.idField.path] ?? '');

  if (args.view.classification) {
    const decoded = decodeClassificationValue(args.draftValues[CLASSIFICATION_DRAFT_KEY]);
    if (decoded) {
      setByPath(next, 'Kind', decoded.kind);
      if (decoded.skind) setByPath(next, 'SKind', decoded.skind);
      else deleteByPath(next, 'SKind');
      if (decoded.skind2) setByPath(next, 'SKind2', decoded.skind2);
      else deleteByPath(next, 'SKind2');
    }
  }

  for (const field of args.view.fields) {
    const value = args.draftValues[field.path];
    if (shouldOmitEmptyPath(field, value)) {
      deleteByPath(next, field.path);
    } else {
      setByPath(next, field.path, cloneJsonValue(value));
      if (field.path === 'Trade') deleteByPath(next, 'trade');
    }
  }

  for (const group of args.view.groups) {
    setByPath(next, group.path, cloneJsonValue(args.draftValues[group.path] ?? []));
  }

  return next;
};

export const mergeUnparsedEntriesIntoFeatureInfo = (
  featureInfo: unknown,
  unparsedEntries: WorkflowEditorUnparsedEntry[]
): Record<string, unknown> => {
  const next = cloneJsonValue(isRecord(featureInfo) ? featureInfo : {}) as Record<string, unknown>;
  for (const entry of unparsedEntries) {
    if (!entry.path) continue;
    setByPath(next, entry.path, cloneJsonValue(entry.value));
  }
  return next;
};
