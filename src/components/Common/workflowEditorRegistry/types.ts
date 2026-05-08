import type { FeatureKey, WorkflowCatalogGeom } from '../featureFormats';

export type RegistryScene = 'workflow' | 'editor' | 'infocard';

export type RegistryClassCode =
  | 'ISG'
  | 'ISL'
  | 'ISP'
  | 'BUD'
  | 'FLR'
  | 'ROD'
  | 'TPP'
  | 'WRP'
  | 'TRP'
  | 'STA'
  | 'PLF'
  | 'RLE'
  | 'PFB'
  | 'STB'
  | 'SBP'
  | 'STF';

export type RegistryClassificationRef =
  | {
      mode: 'classCatalog';
      classCode: Extract<RegistryClassCode, 'BUD' | 'FLR' | 'ROD' | 'TPP' | 'WRP' | 'TRP'>;
      geom?: WorkflowCatalogGeom;
    }
  | {
      mode: 'workflowCatalog';
      classCode: Extract<RegistryClassCode, 'ISG' | 'ISL' | 'ISP'>;
      geom: WorkflowCatalogGeom;
      kind?: string;
      skind?: string;
    };

export type ClassificationEditScope = 'schemaScope' | 'classScope' | 'fixedSchema';

export type RegistryIntegrationMode =
  | 'registryOnly'
  | 'fallback'
  | 'workflowStyleReady'
  | 'custom'
  | 'overlayHeavy';

export type RegistryControlType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'bool'
  | 'select'
  | 'featureSearch'
  | 'json'
  | 'trpTrade';

export type RegistryFormatter = 'plain' | 'externalLink' | 'boolText' | 'json';

export type RegistrySelectOption = { label: string; value: string };

export type RegistryMatch = {
  subType?: FeatureKey;
  classCode?: RegistryClassCode;
  kind?: string;
  skind?: string;
  skind2?: string;
  workflowKeys?: string[];
};

export type FieldSceneUsage = {
  visible?: boolean;
  order?: number;
  label?: string;
  control?: RegistryControlType;
  rows?: number;
  selectSource?: string;
  searchConfigKey?: string;
  section?: 'main' | 'other';
  formatter?: RegistryFormatter;
  hideWhenEmpty?: boolean;
  placeholder?: string;
  readonly?: boolean;
};

export type RegistryLabels = {
  default: string;
  workflow?: string;
  editor?: string;
  infocard?: string;
};

export type PersistedFieldDef = {
  key: string;
  path: string;
  labels: RegistryLabels;
  workflow?: FieldSceneUsage;
  editor?: FieldSceneUsage;
  infocard?: FieldSceneUsage;
  createOnly?: boolean;
  editOnly?: boolean;
};

export type RegistryGroupItemFieldDef = {
  key: string;
  path?: string;
  labels: RegistryLabels;
  control?: RegistryControlType;
  optional?: boolean;
  defaultValue?: unknown;
  placeholder?: string;
  searchConfigKey?: string;
  options?: RegistrySelectOption[];
  rows?: number;
};

export type RegistryGroupDef = {
  key: string;
  path: string;
  labels: RegistryLabels;
  optional?: boolean;
  minItems?: number;
  workflow?: FieldSceneUsage;
  editor?: FieldSceneUsage;
  infocard?: FieldSceneUsage;
  fields: RegistryGroupItemFieldDef[];
};

export type WorkflowAuxInputDef = {
  key: string;
  label: string;
  order: number;
  control: RegistryControlType;
  placeholder?: string;
  idAssemblyOnly?: boolean;
  selectSource?: string;
};

export type ClassificationSceneUsage = {
  visible: boolean;
  label: string;
  order: number;
  section?: 'main' | 'other';
};

export type RegistryClassificationDef = {
  ref?: RegistryClassificationRef;
  editScope: ClassificationEditScope;
  workflow?: ClassificationSceneUsage;
  editor?: ClassificationSceneUsage;
  infocard?: ClassificationSceneUsage;
};

export type WorkflowEditorSchema = {
  schemaKey: string;
  displayName: string;
  match: RegistryMatch;
  classification?: RegistryClassificationDef;
  idField: PersistedFieldDef & { key: 'ID'; path: 'ID' };
  persistedFields: PersistedFieldDef[];
  groups?: RegistryGroupDef[];
  workflowAuxInputs?: WorkflowAuxInputDef[];
  allowUnparsedBlock?: boolean;
  integrations?: {
    editor?: RegistryIntegrationMode;
    workflow?: RegistryIntegrationMode;
    infocard?: RegistryIntegrationMode;
  };
};

export type ProjectedRegistryField = {
  key: string;
  path: string;
  label: string;
  control?: RegistryControlType;
  rows?: number;
  selectSource?: string;
  searchConfigKey?: string;
  section?: 'main' | 'other';
  formatter?: RegistryFormatter;
  order: number;
  placeholder?: string;
  readonly?: boolean;
  hideWhenEmpty?: boolean;
};

export type ProjectedRegistryGroup = {
  key: string;
  path: string;
  label: string;
  order: number;
  optional?: boolean;
  minItems?: number;
  section?: 'main' | 'other';
  formatter?: RegistryFormatter;
  fields: RegistryGroupItemFieldDef[];
};

export type ProjectedRegistryClassification = {
  ref?: RegistryClassificationRef;
  editScope: ClassificationEditScope;
  label: string;
  order: number;
  section?: 'main' | 'other';
};

export type ProjectedRegistryScene = {
  schemaKey: string;
  displayName: string;
  scene: RegistryScene;
  classification?: ProjectedRegistryClassification;
  idField: ProjectedRegistryField;
  auxInputs: WorkflowAuxInputDef[];
  fields: ProjectedRegistryField[];
  groups: ProjectedRegistryGroup[];
  allowUnparsedBlock: boolean;
  integrations?: WorkflowEditorSchema['integrations'];
};

export type RegistryClassificationOption = {
  kind: string;
  skind: string;
  skind2: string;
  name: string;
  label: string;
  classCode: string;
  geom: WorkflowCatalogGeom;
};
