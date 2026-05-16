import type { FeatureRecord } from "@/components/Rules/rendering/renderRules";

/**
 * RB_SLU_SF1: structure label priority list.
 *
 * Add IDs here when a BUD/STB feature should receive priority handling in the
 * low-zoom point+label mode. Accepted forms:
 * - raw feature ID, e.g. "ZRTSTB_QHC"
 * - feature uid, e.g. "rule-world:zth#380"
 * - Class-prefixed ID, e.g. "STB:ZRTSTB_QHC"
 */
export const PRIORITY_STRUCTURE_LABEL_IDS = new Set<string>([
  // "ZRTSTB_QHC",
  // "STB:ZRTSTB_QHC",
]);

export const STRUCTURE_LABEL_PRIORITY = {
  lowZoomNormal: 2400,
  lowZoomPriority: 5000,
  highZoom: 3600,
  isgReference: 5200,
} as const;

export function getStructurePriorityCandidateIds(r: FeatureRecord): string[] {
  const fi: any = r.featureInfo ?? {};
  const cls = String(r.meta?.Class ?? fi?.Class ?? "").trim();
  const id = String(r.meta?.idValue ?? fi?.ID ?? "").trim();
  const uid = String(r.uid ?? "").trim();

  return [id, uid, cls && id ? `${cls}:${id}` : ""].filter(Boolean);
}

export function isPriorityStructureLabelFeature(r: FeatureRecord): boolean {
  return getStructurePriorityCandidateIds(r).some((id) =>
    PRIORITY_STRUCTURE_LABEL_IDS.has(id),
  );
}

export const STRUCTURE_LABEL_AREA_BONUS_MAX = 999;
const STRUCTURE_LABEL_AREA_BONUS_DIVISOR = 10;

function polygonAreaXZ(coords: Array<{ x: number; z: number }> | undefined): number {
  if (!Array.isArray(coords) || coords.length < 3) return 0;
  let area2 = 0;
  for (let i = 0; i < coords.length; i += 1) {
    const a = coords[i];
    const b = coords[(i + 1) % coords.length];
    const ax = Number(a?.x);
    const az = Number(a?.z);
    const bx = Number(b?.x);
    const bz = Number(b?.z);
    if (![ax, az, bx, bz].every(Number.isFinite)) continue;
    area2 += ax * bz - bx * az;
  }
  return Math.abs(area2) / 2;
}

export function getStructureAreaPriorityBonus(r: FeatureRecord): number {
  const cls = String(r.meta?.Class ?? r.featureInfo?.Class ?? '').trim();
  if (r.type !== 'Polygon' || (cls !== 'BUD' && cls !== 'STB')) return 0;
  const area = polygonAreaXZ(r.coords3);
  if (!Number.isFinite(area) || area <= 0) return 0;
  return Math.max(0, Math.min(STRUCTURE_LABEL_AREA_BONUS_MAX, Math.floor(area / STRUCTURE_LABEL_AREA_BONUS_DIVISOR)));
}
