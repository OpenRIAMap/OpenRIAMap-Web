import type { PersistedFieldDef, WorkflowAuxInputDef, WorkflowEditorSchema } from './types';

const idField: WorkflowEditorSchema['idField'] = {
  key: 'ID',
  path: 'ID',
  labels: { default: '建筑ID', workflow: '建筑ID', editor: '建筑ID', infocard: '建筑ID' },
  workflow: { visible: false },
  editor: { visible: true, order: 0, control: 'text' },
  infocard: { visible: false },
};

const workflowAuxInputs: WorkflowAuxInputDef[] = [
  {
    key: 'catAbbr',
    label: '所属分类代号（仅用于ID组装，可选）',
    order: 30,
    control: 'text',
    placeholder: '例如：HH',
    idAssemblyOnly: true,
  },
  {
    key: 'abbr',
    label: '字符简称（用于ID后缀）',
    order: 40,
    control: 'text',
    placeholder: '例如：ZDMT',
    idAssemblyOnly: true,
  },
];

const fields: PersistedFieldDef[] = [
  {
    key: 'Name',
    path: 'Name',
    labels: { default: '名称', workflow: '名称', editor: '建筑名称', infocard: '名称' },
    workflow: { visible: true, order: 20, control: 'text', placeholder: '例如：主岛码头' },
    editor: { visible: true, order: 20, control: 'text' },
    infocard: { visible: false },
  },
  {
    key: 'Kind',
    path: 'Kind',
    labels: { default: '建筑类型' },
    workflow: { visible: false },
    editor: { visible: false },
    infocard: { visible: false },
  },
  {
    key: 'SKind',
    path: 'SKind',
    labels: { default: '建筑子类型' },
    workflow: { visible: false },
    editor: { visible: false },
    infocard: { visible: false },
  },
  {
    key: 'SKind2',
    path: 'SKind2',
    labels: { default: '建筑三级子类型' },
    workflow: { visible: false },
    editor: { visible: false },
    infocard: { visible: false },
  },
  {
    key: 'nomenclator',
    path: 'tags.nomenclator',
    labels: { default: '命名者', workflow: '命名者（tags.nomenclator，可选）' },
    workflow: { visible: true, order: 50, control: 'text', placeholder: '例如：Codusk' },
    editor: { visible: true, order: 40, control: 'text' },
    infocard: { visible: true, order: 20, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'Land',
    path: 'tags.Land',
    labels: { default: '所属地理单元', workflow: '所属地理单元（可选，将写入 tags.Land）' },
    workflow: {
      visible: true,
      order: 60,
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
    workflow: { visible: true, order: 70, control: 'featureSearch', searchConfigKey: 'admAny', placeholder: '例如：鳕鱼鱼' },
    editor: { visible: true, order: 60, control: 'featureSearch', searchConfigKey: 'admAny' },
    infocard: { visible: true, order: 40, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'Pop',
    path: 'tags.Pop',
    labels: { default: '相关成员', workflow: '相关成员（可选）' },
    workflow: { visible: true, order: 75, control: 'text' },
    editor: { visible: true, order: 70, control: 'text' },
    infocard: { visible: true, order: 50, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'Situation',
    path: 'Situation',
    labels: { default: '状态' },
    workflow: { visible: false },
    editor: { visible: true, order: 75, control: 'text' },
    infocard: { visible: true, order: 55, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'elevation',
    path: 'elevation',
    labels: { default: '高度(y)' },
    workflow: { visible: false },
    editor: { visible: true, order: 82, control: 'number' },
    infocard: { visible: true, order: 58, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'height',
    path: 'height',
    labels: { default: '建筑高度' },
    workflow: { visible: false },
    editor: { visible: true, order: 84, control: 'number' },
    infocard: { visible: true, order: 59, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'wiki',
    path: 'extensions.link.wiki',
    labels: { default: 'wiki链接', workflow: 'wiki链接（可选）', infocard: 'WIKI链接' },
    workflow: { visible: true, order: 90, control: 'text', placeholder: '例如：wiki.ria.red/xxx' },
    editor: { visible: true, order: 90, control: 'text' },
    infocard: { visible: true, order: 60, section: 'main', formatter: 'externalLink', hideWhenEmpty: true },
  },
  {
    key: 'brief',
    path: 'extensions.character.brief',
    labels: { default: '简介', workflow: '简介（可选，将写入 extensions.character.brief）' },
    workflow: { visible: true, order: 100, control: 'textarea', rows: 4, placeholder: '支持长文本输入（不支持换行）' },
    editor: { visible: true, order: 100, control: 'textarea', rows: 4 },
    infocard: { visible: true, order: 70, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
];

export const SCHEMA_BUD_BUILDING: WorkflowEditorSchema = {
  schemaKey: 'bud_building',
  displayName: '建筑',
  match: { subType: '建筑', classCode: 'BUD', workflowKeys: ['bud_building'] },
  classification: {
    ref: { mode: 'classCatalog', classCode: 'BUD', geom: '面' },
    editScope: 'classScope',
    workflow: { visible: true, label: '类型（Class=BUD）', order: 10 },
    editor: { visible: true, label: '建筑类型', order: 10 },
    infocard: { visible: true, label: '类型', order: 10, section: 'main' },
  },
  idField,
  workflowAuxInputs,
  persistedFields: fields,
  allowUnparsedBlock: true,
  integrations: { editor: 'workflowStyleReady', workflow: 'registryOnly', infocard: 'registryOnly' },
};

export const BUD_SCHEMAS: WorkflowEditorSchema[] = [SCHEMA_BUD_BUILDING];
