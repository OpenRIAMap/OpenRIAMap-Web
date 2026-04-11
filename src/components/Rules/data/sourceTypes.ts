export type SourceKey = 'pub' | 'dat';

export type RulePictureSourceDef = {
  source: SourceKey;
  worldField?: string;
  classField?: string;
  kindField?: string;
  idField?: string;
  publicPictureRoot?: string;
  repositoryPictureMode?: 'index_by_id';
  debugName?: string;
};

export type TradeImageSourceDef = {
  source: SourceKey;
  worldField?: string;
  classField?: string;
  kindField?: string;
  idField?: string;
  tradeKeyField?: string;
  publicPictureRoot?: string;
  debugName?: string;
};

export type RuleWorldDataset = {
  worldId: string;
  mergeVersion: number | string;
  loadedAt: number;
  features: Record<string, unknown>[];
};
