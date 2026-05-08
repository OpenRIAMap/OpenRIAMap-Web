import type { LineLabelAuditSnapshot } from "@/components/Rules/debug/lineLabelAudit";
import type {
  PolygonLabelAuditOptions,
  PolygonLabelAuditSnapshot,
} from "@/components/Rules/debug/polygonLabelAudit";

declare global {
  interface Window {
    RIA?: {
      debug?: {
        lineLabels?: () => LineLabelAuditSnapshot | null;
        lineLabelsTxt?: () => LineLabelAuditSnapshot | null;
        lineLabelsViewport?: (options?: {
          allAttempts?: boolean;
        }) => LineLabelAuditSnapshot | null;
        lineLabelsViewportTxt?: (options?: {
          allAttempts?: boolean;
        }) => LineLabelAuditSnapshot | null;
        polygonLabels?: (
          options?: PolygonLabelAuditOptions,
        ) => PolygonLabelAuditSnapshot | null;
        polygonLabelsTxt?: (
          options?: PolygonLabelAuditOptions,
        ) => PolygonLabelAuditSnapshot | null;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
  }
}

export {};
