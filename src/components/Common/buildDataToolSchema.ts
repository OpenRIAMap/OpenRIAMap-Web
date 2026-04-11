import { WORKFLOW_FEATURE_CATALOG, WORLD_CODE_BY_WORLD_ID } from './featureFormats';

export const DATA_TOOL_SCHEMA_VERSION = '1.1.0';
export const SPECIAL_CLASS_LIST = ['ISG', 'ISL', 'ISP'] as const;
export const BASE_FEATURE_CLASS_LIST = ['RLE', 'STA', 'STB', 'PLF', 'PFB', 'SBP'] as const;

export type DataToolSchema = {
  schemaVersion: string;
  worlds: Record<string, number>;
  featureClasses: string[];
  specialClasses: string[];
  workflowKinds: Record<string, string[]>;
  workflowSubKinds: Record<string, Record<string, string[]>>;
  classToDrawMode: Record<string, string>;
  classToGeometry: Record<string, string>;
};

const sortObjectKeys = <T>(obj: Record<string, T>): Record<string, T> => Object.fromEntries(
  Object.entries(obj).sort(([a], [b]) => a.localeCompare(b, 'zh-CN')),
) as Record<string, T>;

export function buildDataToolSchema(): DataToolSchema {
  const featureClasses = new Set<string>(BASE_FEATURE_CLASS_LIST);
  const workflowKinds: Record<string, Set<string>> = {};
  const workflowSubKinds: Record<string, Record<string, Set<string>>> = {};
  const classToDrawMode: Record<string, string> = {};
  const classToGeometry: Record<string, string> = {};

  for (const item of WORKFLOW_FEATURE_CATALOG) {
    featureClasses.add(item.classCode);
    (workflowKinds[item.classCode] ??= new Set<string>()).add(item.kind);
    if (item.skind) {
      ((workflowSubKinds[item.classCode] ??= {})[item.kind] ??= new Set<string>()).add(item.skind);
    }
    if (!(item.classCode in classToDrawMode)) classToDrawMode[item.classCode] = item.drawMode;
    if (!(item.classCode in classToGeometry)) classToGeometry[item.classCode] = item.geom;
  }

  const workflowKindsSorted = sortObjectKeys(
    Object.fromEntries(
      Object.entries(workflowKinds).map(([classCode, set]) => [classCode, Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-CN'))]),
    ),
  );

  const workflowSubKindsSorted = sortObjectKeys(
    Object.fromEntries(
      Object.entries(workflowSubKinds).map(([classCode, byKind]) => [
        classCode,
        sortObjectKeys(
          Object.fromEntries(
            Object.entries(byKind).map(([kind, set]) => [kind, Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-CN'))]),
          ),
        ),
      ]),
    ),
  );

  return {
    schemaVersion: DATA_TOOL_SCHEMA_VERSION,
    worlds: { ...WORLD_CODE_BY_WORLD_ID },
    featureClasses: Array.from(featureClasses).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    specialClasses: Array.from(SPECIAL_CLASS_LIST),
    workflowKinds: workflowKindsSorted,
    workflowSubKinds: workflowSubKindsSorted,
    classToDrawMode: sortObjectKeys(classToDrawMode),
    classToGeometry: sortObjectKeys(classToGeometry),
  };
}

export const DATA_TOOL_SCHEMA = buildDataToolSchema();
