import type { PersistedFieldDef, RegistryGroupDef, WorkflowAuxInputDef, WorkflowEditorSchema } from './types';

const idField: WorkflowEditorSchema['idField'] = {
  key: 'ID',
  path: 'ID',
  labels: { default: '交易点ID', workflow: '交易点ID', editor: '交易点ID', infocard: '交易点ID' },
  workflow: { visible: false },
  editor: { visible: true, order: 0, control: 'text' },
  infocard: { visible: false },
};

const workflowAuxInputs: WorkflowAuxInputDef[] = [
  {
    key: 'abbr',
    label: '字符简称（必填，用于ID）',
    order: 30,
    control: 'text',
    placeholder: '例如：VIL',
    idAssemblyOnly: true,
  },
];

const fields: PersistedFieldDef[] = [
  {
    key: 'Name',
    path: 'Name',
    labels: { default: '名称', workflow: '交易点名称（必填）', editor: '交易点名', infocard: '名称' },
    workflow: { visible: true, order: 20, control: 'text', placeholder: '例如：村民交易站' },
    editor: { visible: true, order: 20, control: 'text' },
    infocard: { visible: false },
  },
  {
    key: 'Kind',
    path: 'Kind',
    labels: { default: '类型' },
    workflow: { visible: false },
    editor: { visible: false },
    infocard: { visible: false },
  },
  {
    key: 'SKind',
    path: 'SKind',
    labels: { default: '子类型' },
    workflow: { visible: false },
    editor: { visible: false },
    infocard: { visible: false },
  },
  {
    key: 'SKind2',
    path: 'SKind2',
    labels: { default: '三级子类型' },
    workflow: { visible: false },
    editor: { visible: false },
    infocard: { visible: false },
  },
  {
    key: 'Land',
    path: 'tags.Land',
    labels: { default: '所属地理单元', workflow: '所属地理单元（可选，将写入 tags.Land）' },
    workflow: {
      visible: true,
      order: 32,
      control: 'featureSearch',
      searchConfigKey: 'landUnit',
      placeholder: '输入关键词检索：可匹配 Name / ID',
    },
    editor: { visible: true, order: 32, control: 'featureSearch', searchConfigKey: 'landUnit' },
    infocard: { visible: true, order: 18, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'UAdm',
    path: 'tags.UAdm',
    labels: { default: '所属聚落(地标点)', workflow: '所属聚落(地标点)（可选，将写入 tags.UAdm）' },
    workflow: {
      visible: true,
      order: 34,
      control: 'featureSearch',
      searchConfigKey: 'admAny',
      placeholder: '输入关键词检索：可匹配 Name / ID',
    },
    editor: { visible: true, order: 34, control: 'featureSearch', searchConfigKey: 'admAny' },
    infocard: { visible: true, order: 19, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'UAdmG',
    path: 'tags.UAdmG',
    labels: { default: '所属聚落(区划)', workflow: '所属聚落(区划)（可选，将写入 tags.UAdmG）' },
    workflow: {
      visible: true,
      order: 36,
      control: 'featureSearch',
      searchConfigKey: 'admAny',
      placeholder: '输入关键词检索：可匹配 Name / ID',
    },
    editor: { visible: true, order: 36, control: 'featureSearch', searchConfigKey: 'admAny' },
    infocard: { visible: true, order: 21, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'Interaction',
    path: 'Interaction',
    labels: { default: '交互模式', workflow: '交互方式（可选，将写入 Interaction）' },
    workflow: { visible: true, order: 40, control: 'text', placeholder: '例如：右键打开' },
    editor: { visible: true, order: 40, control: 'text' },
    infocard: { visible: true, order: 20, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'Situation',
    path: 'Situation',
    labels: { default: '启用状况', workflow: '启用状况（可选，将写入 Situation）' },
    workflow: { visible: true, order: 50, control: 'text', placeholder: '例如：Enable' },
    editor: { visible: true, order: 50, control: 'text' },
    infocard: { visible: true, order: 30, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'Trade',
    path: 'Trade',
    labels: { default: '交易列表', workflow: '交易条目（Trade）' },
    workflow: { visible: false },
    editor: { visible: true, order: 60, control: 'trpTrade' },
    infocard: { visible: true, order: 40, section: 'other', formatter: 'json', hideWhenEmpty: true },
  },
  {
    key: 'elevation',
    path: 'elevation',
    labels: { default: '高度(y)', workflow: '高度值（可选，将写入 elevation；若点坐标含 y，则优先使用 y）' },
    workflow: { visible: false, order: 70, control: 'number', placeholder: '例如：64' },
    editor: { visible: true, order: 70, control: 'number' },
    infocard: { visible: true, order: 50, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'wiki',
    path: 'extensions.link.wiki',
    labels: { default: 'wiki链接', workflow: 'wiki链接（可选，将写入 extensions.link.wiki）', infocard: 'WIKI链接' },
    workflow: { visible: true, order: 80, control: 'text', placeholder: 'https://...' },
    editor: { visible: true, order: 80, control: 'text' },
    infocard: { visible: true, order: 60, section: 'main', formatter: 'externalLink', hideWhenEmpty: true },
  },
  {
    key: 'brief',
    path: 'extensions.character.brief',
    labels: { default: '简介', workflow: '简介（可选，将写入 extensions.character.brief）' },
    workflow: { visible: true, order: 90, control: 'textarea', rows: 4, placeholder: '支持换行' },
    editor: { visible: true, order: 90, control: 'textarea', rows: 4 },
    infocard: { visible: true, order: 70, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
];

const groups: RegistryGroupDef[] = [];

export const SCHEMA_TRP_TRADE: WorkflowEditorSchema = {
  schemaKey: 'trp_trade',
  displayName: '交易点',
  match: { subType: '交易点', classCode: 'TRP', workflowKeys: ['trp_point'] },
  classification: {
    ref: { mode: 'classCatalog', classCode: 'TRP', geom: '点' },
    editScope: 'classScope',
    workflow: { visible: true, label: '交易点种类（必填）', order: 10 },
    editor: { visible: true, label: '交易点类型', order: 10 },
    infocard: { visible: true, label: '类型', order: 10, section: 'main' },
  },
  idField,
  workflowAuxInputs,
  persistedFields: fields,
  groups,
  allowUnparsedBlock: true,
  integrations: { editor: 'workflowStyleReady', workflow: 'registryOnly', infocard: 'registryOnly' },
};

export const TRP_SCHEMAS: WorkflowEditorSchema[] = [SCHEMA_TRP_TRADE];
