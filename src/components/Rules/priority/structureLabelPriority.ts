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
