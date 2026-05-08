import type { PersistedFieldDef, RegistryGroupDef, WorkflowEditorSchema } from './types';

const fixedIntegrations: WorkflowEditorSchema['integrations'] = {
  editor: 'workflowStyleReady',
  workflow: 'custom',
  infocard: 'overlayHeavy',
};

const pointHeightField = (order: number): PersistedFieldDef => ({
  key: 'elevation',
  path: 'elevation',
  labels: { default: '高度(y)' },
  workflow: { visible: true, order, control: 'number' },
  editor: { visible: true, order, control: 'number' },
  infocard: { visible: true, order, section: 'main', formatter: 'plain', hideWhenEmpty: true },
});

const polygonHeightFields = (startOrder: number): PersistedFieldDef[] => [
  {
    key: 'elevation',
    path: 'elevation',
    labels: { default: '高度(y)' },
    workflow: { visible: true, order: startOrder, control: 'number' },
    editor: { visible: true, order: startOrder, control: 'number' },
    infocard: { visible: true, order: startOrder, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
  {
    key: 'height',
    path: 'height',
    labels: { default: '高度/层高(height)' },
    workflow: { visible: true, order: startOrder + 10, control: 'number' },
    editor: { visible: true, order: startOrder + 10, control: 'number' },
    infocard: { visible: true, order: startOrder + 10, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
];

const idField = (label: string): WorkflowEditorSchema['idField'] => ({
  key: 'ID',
  path: 'ID',
  labels: { default: label, editor: label, infocard: label },
  workflow: { visible: false },
  editor: { visible: true, order: 0, control: 'text' },
  infocard: { visible: false },
});

const nameField = (label: string): PersistedFieldDef => ({
  key: 'Name',
  path: 'Name',
  labels: { default: '名称', workflow: label, editor: label, infocard: '名称' },
  workflow: { visible: true, order: 20, control: 'text' },
  editor: { visible: true, order: 20, control: 'text' },
  infocard: { visible: false },
});

const optionalWikiBrief = (wikiOrder = 900): PersistedFieldDef[] => [
  {
    key: 'wiki',
    path: 'extensions.link.wiki',
    labels: { default: 'wiki链接', infocard: 'WIKI链接' },
    workflow: { visible: false },
    editor: { visible: false },
    infocard: { visible: true, order: wikiOrder, section: 'main', formatter: 'externalLink', hideWhenEmpty: true },
  },
  {
    key: 'brief',
    path: 'extensions.character.brief',
    labels: { default: '简介' },
    workflow: { visible: false },
    editor: { visible: false },
    infocard: { visible: true, order: wikiOrder + 10, section: 'main', formatter: 'plain', hideWhenEmpty: true },
  },
];

const schemaBase = (args: {
  schemaKey: string;
  displayName: string;
  subType: WorkflowEditorSchema['match']['subType'];
  classCode: WorkflowEditorSchema['match']['classCode'];
  workflowKeys?: string[];
  idLabel: string;
  fields: PersistedFieldDef[];
  groups?: RegistryGroupDef[];
}): WorkflowEditorSchema => ({
  schemaKey: args.schemaKey,
  displayName: args.displayName,
  match: { subType: args.subType, classCode: args.classCode, workflowKeys: args.workflowKeys },
  classification: { editScope: 'fixedSchema' },
  idField: idField(args.idLabel),
  persistedFields: args.fields,
  groups: args.groups,
  allowUnparsedBlock: true,
  integrations: fixedIntegrations,
});

const platformGroup: RegistryGroupDef = {
  key: 'platforms',
  path: 'platforms',
  labels: { default: '包含站台' },
  optional: false,
  minItems: 1,
  workflow: { visible: true, order: 100, control: 'json' },
  editor: { visible: true, order: 100, control: 'json' },
  infocard: { visible: true, order: 100, section: 'other', formatter: 'json', hideWhenEmpty: true },
  fields: [
    {
      key: 'ID',
      labels: { default: '站台ID' },
      control: 'text',
    },
  ],
};

const linesGroup: RegistryGroupDef = {
  key: 'lines',
  path: 'lines',
  labels: { default: '经行线路' },
  optional: false,
  minItems: 1,
  workflow: { visible: true, order: 100, control: 'json' },
  editor: { visible: true, order: 100, control: 'json' },
  infocard: { visible: true, order: 100, section: 'other', formatter: 'json', hideWhenEmpty: true },
  fields: [
    {
      key: 'ID',
      labels: { default: '线路ID' },
      control: 'text',
    },
    {
      key: 'stationCode',
      labels: { default: '站台编号' },
      control: 'number',
      optional: true,
    },
    {
      key: 'stationDistance',
      labels: { default: '线路距离' },
      control: 'number',
      optional: true,
    },
    {
      key: 'Avaliable',
      labels: { default: '可使用性' },
      control: 'bool',
    },
    {
      key: 'Overtaking',
      labels: { default: '越行' },
      control: 'bool',
    },
    {
      key: 'getin',
      labels: { default: '可上车' },
      control: 'bool',
    },
    {
      key: 'getout',
      labels: { default: '可下车' },
      control: 'bool',
    },
    {
      key: 'NextOT',
      labels: { default: '下一站越行' },
      control: 'bool',
    },
  ],
};

const floorsGroup = (required = false): RegistryGroupDef => ({
  key: 'Floors',
  path: 'Floors',
  labels: { default: '包含楼层' },
  optional: !required,
  workflow: { visible: true, order: 100, control: 'json' },
  editor: { visible: true, order: 100, control: 'json' },
  infocard: { visible: true, order: 100, section: 'other', formatter: 'json', hideWhenEmpty: true },
  fields: [
    { key: 'ID', labels: { default: '楼层ID' }, control: 'text', optional: !required },
    { key: 'Group', labels: { default: '分组' }, control: 'text', optional: true },
  ],
});

const stationsGroup: RegistryGroupDef = {
  key: 'stations',
  path: 'stations',
  labels: { default: '包含车站' },
  optional: false,
  minItems: 1,
  workflow: { visible: true, order: 110, control: 'json' },
  editor: { visible: true, order: 110, control: 'json' },
  infocard: { visible: true, order: 110, section: 'other', formatter: 'json', hideWhenEmpty: true },
  fields: [
    {
      key: 'ID',
      labels: { default: '车站ID' },
      control: 'text',
    },
  ],
};

export const SCHEMA_RAIL_STATION = schemaBase({
  schemaKey: 'rail_station',
  displayName: '车站',
  subType: '车站',
  classCode: 'STA',
  workflowKeys: ['station'],
  idLabel: '车站ID',
  fields: [
    nameField('车站名'),
    {
      key: 'STBuilding',
      path: 'STBuilding',
      labels: { default: '所属车站建体' },
      workflow: { visible: true, order: 30, control: 'text' },
      editor: { visible: true, order: 30, control: 'text' },
      infocard: { visible: true, order: 20, section: 'main', formatter: 'plain', hideWhenEmpty: true },
    },
    pointHeightField(40),
    ...optionalWikiBrief(),
  ],
  groups: [platformGroup],
});

export const SCHEMA_RAIL_PLATFORM = schemaBase({
  schemaKey: 'rail_platform',
  displayName: '站台',
  subType: '站台',
  classCode: 'PLF',
  workflowKeys: ['station'],
  idLabel: '站台ID',
  fields: [
    nameField('站台名称'),
    pointHeightField(40),
    {
      key: 'Situation',
      path: 'Situation',
      labels: { default: '站台是否启用' },
      workflow: { visible: true, order: 50, control: 'bool' },
      editor: { visible: true, order: 50, control: 'bool' },
      infocard: { visible: true, order: 20, section: 'main', formatter: 'boolText', hideWhenEmpty: true },
    },
    {
      key: 'Connect',
      path: 'Connect',
      labels: { default: '外部连接功能' },
      workflow: { visible: true, order: 60, control: 'bool' },
      editor: { visible: true, order: 60, control: 'bool' },
      infocard: { visible: true, order: 30, section: 'main', formatter: 'boolText', hideWhenEmpty: true },
    },
    ...optionalWikiBrief(),
  ],
  groups: [linesGroup],
});

export const SCHEMA_RAIL_LINE = schemaBase({
  schemaKey: 'rail_line',
  displayName: '铁路',
  subType: '铁路',
  classCode: 'RLE',
  workflowKeys: ['railway'],
  idLabel: '线路ID',
  fields: [
    nameField('线路名'),
    {
      key: 'bureau',
      path: 'bureau',
      labels: { default: '路局代码' },
      workflow: { visible: true, order: 30, control: 'text' },
      editor: { visible: true, order: 30, control: 'text' },
      infocard: { visible: true, order: 20, section: 'main', formatter: 'plain', hideWhenEmpty: true },
    },
    {
      key: 'line',
      path: 'line',
      labels: { default: '线路编号' },
      workflow: { visible: true, order: 40, control: 'text' },
      editor: { visible: true, order: 40, control: 'text' },
      infocard: { visible: true, order: 30, section: 'main', formatter: 'plain', hideWhenEmpty: true },
    },
    {
      key: 'color',
      path: 'color',
      labels: { default: '标准色号' },
      workflow: { visible: true, order: 50, control: 'text' },
      editor: { visible: true, order: 50, control: 'text' },
      infocard: { visible: true, order: 40, section: 'main', formatter: 'plain', hideWhenEmpty: true },
    },
    {
      key: 'direction',
      path: 'direction',
      labels: { default: '方向' },
      workflow: { visible: true, order: 60, control: 'select' },
      editor: { visible: true, order: 60, control: 'select' },
      infocard: { visible: true, order: 50, section: 'main', formatter: 'plain', hideWhenEmpty: true },
    },
    {
      key: 'startplf',
      path: 'startplf',
      labels: { default: '起点站台名' },
      workflow: { visible: true, order: 70, control: 'text' },
      editor: { visible: true, order: 70, control: 'text' },
      infocard: { visible: true, order: 60, section: 'main', formatter: 'plain', hideWhenEmpty: true },
    },
    {
      key: 'endplf',
      path: 'endplf',
      labels: { default: '终点站台名' },
      workflow: { visible: true, order: 80, control: 'text' },
      editor: { visible: true, order: 80, control: 'text' },
      infocard: { visible: true, order: 70, section: 'main', formatter: 'plain', hideWhenEmpty: true },
    },
    ...optionalWikiBrief(),
  ],
});

export const SCHEMA_RAIL_PLATFORM_BOUNDARY = schemaBase({
  schemaKey: 'rail_platform_boundary',
  displayName: '站台轮廓',
  subType: '站台轮廓',
  classCode: 'PFB',
  idLabel: '站台轮廓ID',
  fields: [
    nameField('站台轮廓名'),
    {
      key: 'LineID',
      path: 'LineID',
      labels: { default: '线路ID' },
      workflow: { visible: true, order: 30, control: 'text' },
      editor: { visible: true, order: 30, control: 'text' },
      infocard: { visible: true, order: 20, section: 'main', formatter: 'plain', hideWhenEmpty: true },
    },
    ...polygonHeightFields(40),
    ...optionalWikiBrief(),
  ],
});

export const SCHEMA_RAIL_STATION_BUILDING = schemaBase({
  schemaKey: 'rail_station_building',
  displayName: '车站建筑',
  subType: '车站建筑',
  classCode: 'STB',
  idLabel: '车站建筑ID',
  fields: [nameField('车站建筑名'), ...polygonHeightFields(30), ...optionalWikiBrief()],
  groups: [floorsGroup()],
});

export const SCHEMA_RAIL_STATION_BUILDING_POINT = schemaBase({
  schemaKey: 'rail_station_building_point',
  displayName: '车站建筑点',
  subType: '车站建筑点',
  classCode: 'SBP',
  idLabel: '车站建筑点ID',
  fields: [nameField('车站建筑名'), pointHeightField(30), ...optionalWikiBrief()],
  groups: [floorsGroup(), stationsGroup],
});

export const SCHEMA_RAIL_STATION_BUILDING_FLOOR = schemaBase({
  schemaKey: 'rail_station_building_floor',
  displayName: '车站建筑楼层',
  subType: '车站建筑楼层',
  classCode: 'STF',
  idLabel: '楼层ID',
  fields: [
    nameField('楼层名'),
    {
      key: 'NofFloor',
      path: 'NofFloor',
      labels: { default: '楼层名/楼层号' },
      workflow: { visible: true, order: 30, control: 'text' },
      editor: { visible: true, order: 30, control: 'text' },
      infocard: { visible: true, order: 20, section: 'main', formatter: 'plain', hideWhenEmpty: true },
    },
    {
      key: 'staBuildingID',
      path: 'staBuildingID',
      labels: { default: '所属车站建筑' },
      workflow: { visible: true, order: 40, control: 'text' },
      editor: { visible: true, order: 40, control: 'text' },
      infocard: { visible: true, order: 30, section: 'main', formatter: 'plain', hideWhenEmpty: true },
    },
    {
      key: 'Situation',
      path: 'Situation',
      labels: { default: '状态' },
      workflow: { visible: true, order: 50, control: 'text' },
      editor: { visible: true, order: 50, control: 'text' },
      infocard: { visible: true, order: 40, section: 'main', formatter: 'plain', hideWhenEmpty: true },
    },
    ...polygonHeightFields(60),
    ...optionalWikiBrief(),
  ],
});

export const RAIL_SCHEMAS: WorkflowEditorSchema[] = [
  SCHEMA_RAIL_STATION,
  SCHEMA_RAIL_PLATFORM,
  SCHEMA_RAIL_LINE,
  SCHEMA_RAIL_PLATFORM_BOUNDARY,
  SCHEMA_RAIL_STATION_BUILDING,
  SCHEMA_RAIL_STATION_BUILDING_POINT,
  SCHEMA_RAIL_STATION_BUILDING_FLOOR,
];
