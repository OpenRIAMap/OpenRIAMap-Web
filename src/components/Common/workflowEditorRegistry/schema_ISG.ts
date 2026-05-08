import type { PersistedFieldDef, WorkflowAuxInputDef, WorkflowEditorSchema } from './types';

const idField = (label = '地物ID'): WorkflowEditorSchema['idField'] => ({
  key: 'ID',
  path: 'ID',
  labels: { default: label, editor: label, infocard: label },
  workflow: { visible: false },
  editor: { visible: true, order: 0, control: 'text' },
  infocard: { visible: false },
});

const auxAbbr: WorkflowAuxInputDef = {
  key: 'abbr',
  label: '字符简称（用于ID）',
  order: 30,
  control: 'text',
  placeholder: '仅建议使用字母/数字/下划线/短横线',
  idAssemblyOnly: true,
};

const baseInfoFields = (): PersistedFieldDef[] => [
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
    workflow: { visible: true, order: 90, control: 'text', placeholder: 'https://...' },
    editor: { visible: true, order: 90, control: 'text' },
    infocard: { visible: true, order: 80, section: 'main', formatter: 'externalLink', hideWhenEmpty: true },
  },
  {
    key: 'brief',
    path: 'extensions.character.brief',
    labels: { default: '简介', workflow: '简介（可选，将写入 extensions.character.brief）' },
    workflow: { visible: true, order: 100, control: 'textarea', rows: 4, placeholder: '支持长文本输入（不支持换行）' },
    editor: { visible: true, order: 100, control: 'textarea', rows: 4 },
    infocard: { visible: true, order: 90, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'Situation',
    path: 'Situation',
    labels: { default: '状态' },
    workflow: { visible: false },
    editor: { visible: true, order: 110, control: 'text' },
    infocard: { visible: true, order: 95, section: 'other', formatter: 'plain', hideWhenEmpty: true },
  },
];

const landAdmFields = (workflowVisible = true): PersistedFieldDef[] => [
  {
    key: 'Land',
    path: 'tags.Land',
    labels: { default: '所属地理单元', workflow: '所属地理单元（可选，将写入 tags.Land）' },
    workflow: {
      visible: workflowVisible,
      order: 50,
      control: 'featureSearch',
      searchConfigKey: 'landUnit',
      placeholder: '输入关键词检索：可匹配 Name / ID',
    },
    editor: { visible: true, order: 50, control: 'featureSearch', searchConfigKey: 'landUnit' },
    infocard: { visible: true, order: 30, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'Adm',
    path: 'tags.Adm',
    labels: { default: '所属聚落', workflow: '所属聚落(一级)（可选，将写入 tags.Adm）' },
    workflow: { visible: workflowVisible, order: 60, control: 'featureSearch', searchConfigKey: 'admAny', placeholder: '例如：鳕鱼鱼' },
    editor: { visible: true, order: 60, control: 'featureSearch', searchConfigKey: 'admAny' },
    infocard: { visible: true, order: 40, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
];

const admFields = (popLabel: string): PersistedFieldDef[] => [
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
    key: 'UAdm',
    path: 'tags.UAdm',
    labels: { default: '上级行政/聚落单元', workflow: '所属上级要素（可选，将写入 tags.UAdm）' },
    workflow: {
      visible: true,
      order: 60,
      control: 'featureSearch',
      searchConfigKey: 'admAny',
      placeholder: '输入关键词检索：可匹配 xxxName / xxxID',
    },
    editor: { visible: true, order: 60, control: 'featureSearch', searchConfigKey: 'admAny' },
    infocard: { visible: true, order: 40, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'Pop',
    path: 'tags.Pop',
    labels: { default: '相关成员/人口', workflow: popLabel },
    workflow: { visible: true, order: 70, control: 'text', placeholder: '例如：Codusk' },
    editor: { visible: true, order: 80, control: 'text' },
    infocard: { visible: true, order: 60, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'GAdm',
    path: 'tags.GAdm',
    labels: { default: '行政/聚落组', workflow: '所属聚落群(名称)（可选，将写入 tags.GAdm）' },
    workflow: { visible: true, order: 80, control: 'text', placeholder: '例如：主岛聚落群' },
    editor: { visible: true, order: 70, control: 'text' },
    infocard: { visible: true, order: 50, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
];

const schema = (args: { schemaKey: string; displayName: string; workflowKey: string; kind: string; skind: string; classificationLabel: string; fields: PersistedFieldDef[] }): WorkflowEditorSchema => ({
  schemaKey: args.schemaKey,
  displayName: args.displayName,
  match: { subType: '地物面', classCode: 'ISG', kind: args.kind, skind: args.skind, workflowKeys: [args.workflowKey] },
  classification: {
    ref: { mode: 'workflowCatalog', classCode: 'ISG', geom: '面', kind: args.kind, skind: args.skind },
    editScope: 'schemaScope',
    workflow: { visible: true, label: args.classificationLabel, order: 10 },
    editor: { visible: true, label: '地物类型', order: 10 },
    infocard: { visible: true, label: '类型', order: 10, section: 'main' },
  },
  idField: idField(),
  workflowAuxInputs: [auxAbbr],
  persistedFields: args.fields,
  allowUnparsedBlock: true,
  integrations: { editor: 'workflowStyleReady', workflow: 'registryOnly', infocard: 'registryOnly' },
});

export const SCHEMA_ISG_NGF_LAD = schema({
  schemaKey: 'isg_ngf_lad',
  displayName: '自然要素-陆地',
  workflowKey: 'ngf_land',
  kind: 'NGF',
  skind: 'LAD',
  classificationLabel: '类型（Kind=NGF, SKind=LAD）',
  fields: [...baseInfoFields()],
});
export const SCHEMA_ISG_NGF_LIS = schema({
  schemaKey: 'isg_ngf_lis',
  displayName: '自然要素-陆面要素',
  workflowKey: 'ngf_lis',
  kind: 'NGF',
  skind: 'LIS',
  classificationLabel: '类型（Kind=NGF, SKind=LIS）',
  fields: [...baseInfoFields(), ...landAdmFields(true)],
});
export const SCHEMA_ISG_NGF_WTB = schema({
  schemaKey: 'isg_ngf_wtb',
  displayName: '自然要素-水域',
  workflowKey: 'ngf_wtb',
  kind: 'NGF',
  skind: 'WTB',
  classificationLabel: '类型（Kind=NGF, SKind=WTB）',
  fields: [...baseInfoFields(), ...landAdmFields(false)],
});
export const SCHEMA_ISG_ADM_DBZ = schema({
  schemaKey: 'isg_adm_dbz',
  displayName: '聚落范围-确定范围',
  workflowKey: 'adm_dbz_set',
  kind: 'ADM',
  skind: 'DBZ',
  classificationLabel: '类型（Kind=ADM, SKind=DBZ）',
  fields: [...baseInfoFields(), ...admFields('相关人员（可选，将写入 tags.Pop）')],
});
export const SCHEMA_ISG_ADM_PLZ = schema({
  schemaKey: 'isg_adm_plz',
  displayName: '聚落范围-规划范围',
  workflowKey: 'adm_plz_plan',
  kind: 'ADM',
  skind: 'PLZ',
  classificationLabel: '类型（Kind=ADM, SKind=PLZ）',
  fields: [
    ...baseInfoFields(),
    ...admFields('负责人员（可选，将写入 tags.Pop）'),
    {
      key: 'YTime',
      path: 'tags.YTime',
      labels: { default: '规划/年代', workflow: '预期完成时间（可选，将写入 tags.YTime）' },
      workflow: { visible: true, order: 85, control: 'text', placeholder: '例如：2026-12 / 2027Q2' },
      editor: { visible: true, order: 85, control: 'text' },
      infocard: { visible: true, order: 65, section: 'main', formatter: 'plain', hideWhenEmpty: true },
    },
  ],
});

export const ISG_SCHEMAS: WorkflowEditorSchema[] = [SCHEMA_ISG_NGF_LAD, SCHEMA_ISG_NGF_LIS, SCHEMA_ISG_NGF_WTB, SCHEMA_ISG_ADM_DBZ, SCHEMA_ISG_ADM_PLZ];
