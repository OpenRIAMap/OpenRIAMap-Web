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
  labels: { default: '地物点ID', editor: '地物点ID', infocard: '地物点ID' },
  workflow: { visible: false },
  editor: { visible: true, order: 0, control: 'text' },
  infocard: { visible: false },
};

const basePointFields = (): PersistedFieldDef[] => [
  {
    key: 'Name',
    path: 'Name',
    labels: { default: '名称', workflow: '名称', infocard: '名称' },
    workflow: { visible: true, order: 20, control: 'text' },
    editor: { visible: true, order: 20, control: 'text' },
    infocard: { visible: false },
  },
  {
    key: 'elevation',
    path: 'elevation',
    labels: { default: '高度(y)' },
    workflow: { visible: false },
    editor: { visible: true, order: 35, control: 'number' },
    infocard: { visible: true, order: 18, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'nomenclator',
    path: 'tags.nomenclator',
    labels: { default: '命名者', workflow: '命名者（tags.nomenclator，可选）' },
    workflow: { visible: true, order: 40, control: 'text', placeholder: '例如：官方公告 / OSM / 个人署名' },
    editor: { visible: true, order: 40, control: 'text' },
    infocard: { visible: true, order: 20, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
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
    labels: { default: '所属行政/聚落单元', workflow: '所属上级要素（可选，将写入 tags.UAdm）' },
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
    labels: { default: '相关成员', workflow: '参与人员（可选，将写入 tags.Pop）' },
    workflow: { visible: true, order: 70, control: 'text', placeholder: '例如：Codusk' },
    editor: { visible: true, order: 70, control: 'text' },
    infocard: { visible: true, order: 50, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'event',
    path: 'extensions.character.event',
    labels: { default: '事件或类型', workflow: '事件或类型（可选，将写入 extensions.character.event）' },
    workflow: { visible: true, order: 75, control: 'text', placeholder: '例如：纪念碑 / 战役 / 历史事件' },
    editor: { visible: true, order: 75, control: 'text' },
    infocard: { visible: true, order: 55, section: 'main', formatter: 'plain', hideWhenEmpty: true },
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
    workflow: { visible: true, order: 90, control: 'textarea', rows: 4, placeholder: '支持长文本输入（不支持换行）' },
    editor: { visible: true, order: 90, control: 'textarea', rows: 4 },
    infocard: { visible: true, order: 70, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
];

const schema = (args: { schemaKey: string; displayName: string; workflowKey: string; kind: string; skind: string; classificationLabel: string; fields: PersistedFieldDef[] }): WorkflowEditorSchema => ({
  schemaKey: args.schemaKey,
  displayName: args.displayName,
  match: { subType: '地物点', classCode: 'ISP', kind: args.kind, skind: args.skind, workflowKeys: [args.workflowKey] },
  classification: { ref: { mode: 'workflowCatalog', classCode: 'ISP', geom: '点', kind: args.kind, skind: args.skind }, editScope: 'schemaScope', workflow: { visible: true, label: args.classificationLabel, order: 10 }, editor: { visible: true, label: '地物点类型', order: 10 }, infocard: { visible: true, label: '类型', order: 10, section: 'main' } },
  idField,
  workflowAuxInputs: [auxAbbr],
  persistedFields: args.fields,
  allowUnparsedBlock: true,
  integrations: { editor: 'workflowStyleReady', workflow: 'registryOnly', infocard: 'registryOnly' },
});

export const SCHEMA_ISP_NGF_SCP = schema({
  schemaKey: 'isp_ngf_scp',
  displayName: '特定自然要素点',
  workflowKey: 'adm_point_special',
  kind: 'NGF',
  skind: 'SCP',
  classificationLabel: '类型（Kind=NGF 下所有点要素）',
  fields: [...basePointFields()],
});
export const SCHEMA_ISP_ADM_DBP = schema({
  schemaKey: 'isp_adm_dbp',
  displayName: '特定人文/地标点',
  workflowKey: 'adm_point_special',
  kind: 'ADM',
  skind: 'DBP',
  classificationLabel: '类型（Kind=ADM 下所有点要素）',
  fields: [...basePointFields()],
});
export const SCHEMA_ISP_ADM_PLP = schema({
  schemaKey: 'isp_adm_plp',
  displayName: '规划/建设点',
  workflowKey: 'adm_point_special',
  kind: 'ADM',
  skind: 'PLP',
  classificationLabel: '类型（Kind=ADM 下所有点要素）',
  fields: [...basePointFields()],
});

export const ISP_SCHEMAS: WorkflowEditorSchema[] = [SCHEMA_ISP_NGF_SCP, SCHEMA_ISP_ADM_DBP, SCHEMA_ISP_ADM_PLP];
