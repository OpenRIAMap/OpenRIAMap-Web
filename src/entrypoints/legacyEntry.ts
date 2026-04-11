type LegacyModuleBundle = {
  RailwayLayer: typeof import('@/components/Legacy/map/RailwayLayer').RailwayLayer;
  LandmarkLayer: typeof import('@/components/Legacy/map/LandmarkLayer').LandmarkLayer;
  LineDetailCard: typeof import('@/components/Legacy/detail/LineDetailCard').LineDetailCard;
  PointDetailCard: typeof import('@/components/Legacy/detail/PointDetailCard').PointDetailCard;
  LinesPage: typeof import('@/components/Legacy/lines/LinesPage').LinesPage;
  buildRailwayGraph: typeof import('@/components/Legacy/data/pathfinding').buildRailwayGraph;
  simplifyPath: typeof import('@/components/Legacy/data/pathfinding').simplifyPath;
  findAutoPath: typeof import('@/components/Legacy/data/pathfinding').findAutoPath;
  findRailOnlyPath: typeof import('@/components/Legacy/data/pathfinding').findRailOnlyPath;
  findWalkPath: typeof import('@/components/Legacy/data/pathfinding').findWalkPath;
  calculateEstimatedTime: typeof import('@/components/Legacy/data/pathfinding').calculateEstimatedTime;
  calculateElytraConsumption: typeof import('@/components/Legacy/data/pathfinding').calculateElytraConsumption;
  calculateWalkTime: typeof import('@/components/Legacy/data/pathfinding').calculateWalkTime;
  calculateRailTime: typeof import('@/components/Legacy/data/pathfinding').calculateRailTime;
  findTeleportPath: typeof import('@/components/Legacy/data/toriiTeleport').findTeleportPath;
  extractToriiList: typeof import('@/components/Legacy/data/toriiTeleport').extractToriiList;
};

let legacyBundlePromise: Promise<LegacyModuleBundle> | null = null;

async function createLegacyModuleBundle(): Promise<LegacyModuleBundle> {
  const [railwayLayer, landmarkLayer, lineDetailCard, pointDetailCard, linesPage, pathfinding, toriiTeleport] = await Promise.all([
    import('@/components/Legacy/map/RailwayLayer'),
    import('@/components/Legacy/map/LandmarkLayer'),
    import('@/components/Legacy/detail/LineDetailCard'),
    import('@/components/Legacy/detail/PointDetailCard'),
    import('@/components/Legacy/lines/LinesPage'),
    import('@/components/Legacy/data/pathfinding'),
    import('@/components/Legacy/data/toriiTeleport'),
  ]);

  return {
    RailwayLayer: railwayLayer.RailwayLayer,
    LandmarkLayer: landmarkLayer.LandmarkLayer,
    LineDetailCard: lineDetailCard.LineDetailCard,
    PointDetailCard: pointDetailCard.PointDetailCard,
    LinesPage: linesPage.LinesPage,
    buildRailwayGraph: pathfinding.buildRailwayGraph,
    simplifyPath: pathfinding.simplifyPath,
    findAutoPath: pathfinding.findAutoPath,
    findRailOnlyPath: pathfinding.findRailOnlyPath,
    findWalkPath: pathfinding.findWalkPath,
    calculateEstimatedTime: pathfinding.calculateEstimatedTime,
    calculateElytraConsumption: pathfinding.calculateElytraConsumption,
    calculateWalkTime: pathfinding.calculateWalkTime,
    calculateRailTime: pathfinding.calculateRailTime,
    findTeleportPath: toriiTeleport.findTeleportPath,
    extractToriiList: toriiTeleport.extractToriiList,
  };
}

export async function loadLegacyModuleBundle(): Promise<LegacyModuleBundle> {
  if (!legacyBundlePromise) {
    legacyBundlePromise = createLegacyModuleBundle();
  }
  return legacyBundlePromise;
}

export type { LegacyModuleBundle };
