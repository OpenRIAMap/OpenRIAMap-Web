import type { PersistedFieldDef, WorkflowAuxInputDef, WorkflowEditorSchema } from './types';

const idField: WorkflowEditorSchema['idField'] = {
  key: 'ID',
  path: 'ID',
  labels: { default: 'Warp点ID', workflow: 'Warp点ID', editor: 'Warp点ID', infocard: 'Warp点ID' },
  workflow: { visible: false },
  editor: { visible: true, order: 0, control: 'text' },
  infocard: { visible: false },
};

const workflowAuxInputs: WorkflowAuxInputDef[] = [
  {
    key: 'abbr',
    label: '字符简称（用于组装 ID）',
    order: 30,
    control: 'text',
    placeholder: '例如：MAIN1',
    idAssemblyOnly: true,
  },
];

const fields: PersistedFieldDef[] = [
  {
    key: 'WRPointI2D',
    path: 'WRPointI2D',
    labels: { default: '游戏内ID', workflow: '服内Warp名（必填，将写入 WRPointI2D）' },
    workflow: { visible: true, order: 18, control: 'text', placeholder: '例如：zthspawn' },
    editor: { visible: true, order: 18, control: 'text' },
    infocard: { visible: true, order: 18, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'Name',
    path: 'Name',
    labels: { default: '名称', workflow: 'Warp点名称（Name）', editor: 'Warp点名', infocard: '名称' },
    workflow: { visible: true, order: 20, control: 'text', placeholder: '例如：主城-中心' },
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
    key: 'hub',
    path: 'hub',
    labels: { default: '枢纽', workflow: '所属枢纽区（可选，hub）' },
    workflow: { visible: true, order: 40, control: 'text' },
    editor: { visible: true, order: 40, control: 'text' },
    infocard: { visible: true, order: 20, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'elevation',
    path: 'elevation',
    labels: { default: '高度(y)', workflow: '高度值（可选，将写入 elevation；若点坐标含 y，则优先使用 y）' },
    workflow: { visible: false, order: 50, control: 'number', placeholder: '例如：64' },
    editor: { visible: true, order: 50, control: 'number' },
    infocard: { visible: true, order: 30, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'Land',
    path: 'tags.Land',
    labels: { default: '所属地理单元', workflow: '所属地理单元（可选，写入 tags.Land）' },
    workflow: {
      visible: true,
      order: 55,
      control: 'featureSearch',
      searchConfigKey: 'landUnit',
      placeholder: '输入关键词检索：可匹配 Name / ID',
    },
    editor: { visible: true, order: 55, control: 'featureSearch', searchConfigKey: 'landUnit' },
    infocard: { visible: true, order: 35, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'UAdm',
    path: 'tags.UAdm',
    labels: { default: '所属行政/聚落单元', workflow: '所属聚落(地标点)（可选，写入 tags.UAdm）' },
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
    key: 'UAdmG',
    path: 'tags.UAdmG',
    labels: { default: '所属聚落(区划)', workflow: '所属聚落(区划)（可选，写入 tags.UAdmG）' },
    workflow: {
      visible: true,
      order: 65,
      control: 'featureSearch',
      searchConfigKey: 'admAny',
      placeholder: '输入关键词检索：可匹配 Name / ID',
    },
    editor: { visible: true, order: 65, control: 'featureSearch', searchConfigKey: 'admAny' },
    infocard: { visible: true, order: 45, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'wiki',
    path: 'extensions.link.wiki',
    labels: { default: 'wiki链接', workflow: 'wiki链接（可选，写入 extensions.link.wiki）', infocard: 'WIKI链接' },
    workflow: { visible: true, order: 70, control: 'text', placeholder: '例如：wiki.ria.red/xxx' },
    editor: { visible: true, order: 70, control: 'text' },
    infocard: { visible: true, order: 50, section: 'main', formatter: 'externalLink', hideWhenEmpty: true },
  },
  {
    key: 'brief',
    path: 'extensions.character.brief',
    labels: { default: '简介' },
    workflow: { visible: false },
    editor: { visible: true, order: 80, control: 'textarea', rows: 4 },
    infocard: { visible: true, order: 60, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
];

export const SCHEMA_WRP_WARP: WorkflowEditorSchema = {
  schemaKey: 'wrp_warp',
  displayName: 'Warp点',
  match: { subType: 'Warp点', classCode: 'WRP', workflowKeys: ['wrp_point'] },
  classification: {
    ref: { mode: 'classCatalog', classCode: 'WRP', geom: '点' },
    editScope: 'classScope',
    workflow: { visible: true, label: '类别（Kind/SKind）', order: 10 },
    editor: { visible: true, label: 'Warp点类型', order: 10 },
    infocard: { visible: true, label: '类型', order: 10, section: 'main' },
  },
  idField,
  workflowAuxInputs,
  persistedFields: fields,
  allowUnparsedBlock: true,
  integrations: { editor: 'workflowStyleReady', workflow: 'registryOnly', infocard: 'registryOnly' },
};

export const WRP_SCHEMAS: WorkflowEditorSchema[] = [SCHEMA_WRP_WARP];
