import type { PersistedFieldDef, WorkflowAuxInputDef, WorkflowEditorSchema } from './types';

const auxAbbr: WorkflowAuxInputDef = {
  key: 'abbr',
  label: '字符简称（用于ID）',
  order: 30,
  control: 'text',
  placeholder: '仅建议使用字母/数字/下划线/短横线',
  idAssemblyOnly: true,
};
const idField: WorkflowEditorSchema['idField'] = {
  key: 'ID',
  path: 'ID',
  labels: { default: '地物线ID', editor: '地物线ID', infocard: '地物线ID' },
  workflow: { visible: false },
  editor: { visible: true, order: 0, control: 'text' },
  infocard: { visible: false },
};

const baseLineFields = (): PersistedFieldDef[] => [
  {
    key: 'Name',
    path: 'Name',
    labels: { default: '名称', workflow: '名称', infocard: '名称' },
    workflow: { visible: true, order: 20, control: 'text' },
    editor: { visible: true, order: 20, control: 'text' },
    infocard: { visible: false },
  },
  {
    key: 'nomenclator',
    path: 'tags.nomenclator',
    labels: { default: '命名者', workflow: '命名者（tags.nomenclator，可选）' },
    workflow: { visible: true, order: 40, control: 'text', placeholder: '例如：XX社团 / 聚落 / 个人署名' },
    editor: { visible: true, order: 40, control: 'text' },
    infocard: { visible: true, order: 20, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'wiki',
    path: 'extensions.link.wiki',
    labels: { default: 'wiki链接', workflow: 'wiki链接（可选，将写入 extensions.link.wiki）', infocard: 'WIKI链接' },
    workflow: { visible: true, order: 80, control: 'text', placeholder: 'https://...' },
    editor: { visible: true, order: 80, control: 'text' },
    infocard: { visible: true, order: 70, section: 'main', formatter: 'externalLink', hideWhenEmpty: true },
  },
  {
    key: 'brief',
    path: 'extensions.character.brief',
    labels: { default: '简介', workflow: '简介（可选，将写入 extensions.character.brief）' },
    workflow: { visible: true, order: 90, control: 'textarea', rows: 4, placeholder: '支持长文本输入（不支持换行）' },
    editor: { visible: true, order: 90, control: 'textarea', rows: 4 },
    infocard: { visible: true, order: 80, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'Situation',
    path: 'Situation',
    labels: { default: '状态' },
    workflow: { visible: false },
    editor: { visible: true, order: 100, control: 'text' },
    infocard: { visible: true, order: 90, section: 'other', formatter: 'plain', hideWhenEmpty: true },
  },
];

const boundaryFields = (): PersistedFieldDef[] => [
  {
    key: 'BNgf1',
    path: 'tags.BNgf1',
    labels: { default: '边界侧自然地物1', workflow: '边界1（可选，将写入 tags.BNgf1）' },
    workflow: {
      visible: true,
      order: 50,
      control: 'featureSearch',
      searchConfigKey: 'landUnit',
      placeholder: '输入关键词检索：可匹配 Name / ID',
    },
    editor: { visible: true, order: 50, control: 'text' },
    infocard: { visible: true, order: 30, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'BNgf2',
    path: 'tags.BNgf2',
    labels: { default: '边界侧自然地物2', workflow: '边界2（可选，将写入 tags.BNgf2）' },
    workflow: {
      visible: true,
      order: 60,
      control: 'featureSearch',
      searchConfigKey: 'landUnit',
      placeholder: '输入关键词检索：可匹配 Name / ID',
    },
    editor: { visible: true, order: 60, control: 'text' },
    infocard: { visible: true, order: 40, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
];

const settlementBoundaryFields = (): PersistedFieldDef[] => [
  {
    key: 'Land',
    path: 'tags.Land',
    labels: { default: '所属地理单元', workflow: '所属地理单元（可选，将写入 tags.Land）' },
    workflow: {
      visible: true,
      order: 50,
      control: 'featureSearch',
      searchConfigKey: 'landUnit',
      placeholder: '输入关键词检索：可匹配 Name / ID',
    },
    editor: { visible: true, order: 50, control: 'featureSearch', searchConfigKey: 'landUnit' },
    infocard: { visible: true, order: 30, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'BAdm1',
    path: 'tags.BAdm1',
    labels: { default: '边界侧行政/聚落1', workflow: '边界1（可选，将写入 tags.BAdm1）' },
    workflow: {
      visible: true,
      order: 60,
      control: 'featureSearch',
      searchConfigKey: 'admAny',
      placeholder: '输入关键词检索：可匹配 Name / ID',
    },
    editor: { visible: true, order: 60, control: 'featureSearch', searchConfigKey: 'admAny' },
    infocard: { visible: true, order: 40, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'BAdm2',
    path: 'tags.BAdm2',
    labels: { default: '边界侧行政/聚落2', workflow: '边界2（可选，将写入 tags.BAdm2）' },
    workflow: {
      visible: true,
      order: 70,
      control: 'featureSearch',
      searchConfigKey: 'admAny',
      placeholder: '输入关键词检索：可匹配 Name / ID',
    },
    editor: { visible: true, order: 70, control: 'featureSearch', searchConfigKey: 'admAny' },
    infocard: { visible: true, order: 50, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'GAdm',
    path: 'tags.GAdm',
    labels: { default: '行政/聚落组', workflow: '所属聚落群(名称)（可选，将写入 tags.GAdm）' },
    workflow: { visible: true, order: 75, control: 'text', placeholder: '例如：主岛聚落群' },
    editor: { visible: true, order: 75, control: 'text' },
    infocard: { visible: true, order: 60, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
];

const schema = (args: { schemaKey: string; displayName: string; workflowKey: string; kind: string; skind: string; classificationLabel: string; fields: PersistedFieldDef[] }): WorkflowEditorSchema => ({
  schemaKey: args.schemaKey,
  displayName: args.displayName,
  match: { subType: '地物线', classCode: 'ISL', kind: args.kind, skind: args.skind, workflowKeys: [args.workflowKey] },
  classification: { ref: { mode: 'workflowCatalog', classCode: 'ISL', geom: '线', kind: args.kind, skind: args.skind }, editScope: 'schemaScope', workflow: { visible: true, label: args.classificationLabel, order: 10 }, editor: { visible: true, label: '地物线类型', order: 10 }, infocard: { visible: true, label: '类型', order: 10, section: 'main' } },
  idField,
  workflowAuxInputs: [auxAbbr],
  persistedFields: args.fields,
  allowUnparsedBlock: true,
  integrations: { editor: 'workflowStyleReady', workflow: 'registryOnly', infocard: 'registryOnly' },
});

export const SCHEMA_ISL_NGF_WTR = schema({
  schemaKey: 'isl_ngf_wtr',
  displayName: '自然要素-河道',
  workflowKey: 'ngf_wtr',
  kind: 'NGF',
  skind: 'WTR',
  classificationLabel: '类型（Kind=NGF, SKind=WTR）',
  fields: [...baseLineFields()],
});
export const SCHEMA_ISL_NGF_BOD = schema({
  schemaKey: 'isl_ngf_bod',
  displayName: '自然要素-地理边界',
  workflowKey: 'ngf_bod',
  kind: 'NGF',
  skind: 'BOD',
  classificationLabel: '类型（Kind=NGF, SKind=BOD）',
  fields: [...baseLineFields(), ...boundaryFields()],
});
export const SCHEMA_ISL_ADM_DBL = schema({
  schemaKey: 'isl_adm_dbl',
  displayName: '聚落边界线要素-确定边界',
  workflowKey: 'adm_line_settlement',
  kind: 'ADM',
  skind: 'DBL',
  classificationLabel: '类型（Kind=ADM 下所有线要素）',
  fields: [...baseLineFields(), ...settlementBoundaryFields()],
});
export const SCHEMA_ISL_ADM_PLL = schema({
  schemaKey: 'isl_adm_pll',
  displayName: '聚落边界线要素-规划边界',
  workflowKey: 'adm_line_settlement',
  kind: 'ADM',
  skind: 'PLL',
  classificationLabel: '类型（Kind=ADM 下所有线要素）',
  fields: [...baseLineFields(), ...settlementBoundaryFields()],
});

export const ISL_SCHEMAS: WorkflowEditorSchema[] = [SCHEMA_ISL_NGF_WTR, SCHEMA_ISL_NGF_BOD, SCHEMA_ISL_ADM_DBL, SCHEMA_ISL_ADM_PLL];
