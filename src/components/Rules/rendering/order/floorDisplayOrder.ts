export type ParsedFloorOrder = {
  known: boolean;
  kind: "above" | "ground" | "below" | "unknown";
  level: number;
  raw: string;
};

export const FLOOR_ORDER_ALIASES = {
  ground: ["G", "GF", "GROUND", "0", "L0", "0F"],
  basementPrefixes: ["B"],
  aboveSuffixes: ["F"],
} as const;

function normalizeFloorRaw(value: unknown): string {
  return String(value ?? "").trim();
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function parseFloorForDisplayOrder(value: unknown): ParsedFloorOrder {
  const raw = normalizeFloorRaw(value);
  const upper = raw.toUpperCase().replace(/\s+/g, "");
  if (!upper) {
    return { known: false, kind: "unknown", level: 0, raw };
  }

  if ((FLOOR_ORDER_ALIASES.ground as readonly string[]).includes(upper)) {
    return { known: true, kind: "ground", level: 0, raw };
  }

  const basement = upper.match(/^B(\d+)(?:F)?$/);
  if (basement) {
    return {
      known: true,
      kind: "below",
      level: Math.max(1, Number(basement[1])),
      raw,
    };
  }

  const negative = upper.match(/^-(\d+)F?$/);
  if (negative) {
    return {
      known: true,
      kind: "below",
      level: Math.max(1, Number(negative[1])),
      raw,
    };
  }

  const above = upper.match(/^(?:L)?(\d+)(?:F)?$/);
  if (above) {
    const level = Number(above[1]);
    if (level === 0) return { known: true, kind: "ground", level: 0, raw };
    return { known: true, kind: "above", level, raw };
  }

  return { known: false, kind: "unknown", level: 0, raw };
}

export function compareFloorDisplayOrder(a: unknown, b: unknown): number {
  const pa = parseFloorForDisplayOrder(a);
  const pb = parseFloorForDisplayOrder(b);

  const rank = (p: ParsedFloorOrder): number => {
    if (p.kind === "above") return 0;
    if (p.kind === "ground") return 1;
    if (p.kind === "below") return 2;
    return 3;
  };

  const ra = rank(pa);
  const rb = rank(pb);
  if (ra !== rb) return ra - rb;

  if (pa.kind === "above") return pb.level - pa.level;
  if (pa.kind === "below") return pa.level - pb.level;
  if (pa.kind === "ground") return 0;
  return naturalCompare(pa.raw, pb.raw);
}

export function formatFloorDisplayLabel(value: unknown): string {
  const raw = normalizeFloorRaw(value);
  const parsed = parseFloorForDisplayOrder(value);
  if (!parsed.known) return raw;
  if (parsed.kind === "ground") return "G";
  if (parsed.kind === "above") return `${parsed.level}F`;
  if (parsed.kind === "below") return `B${parsed.level}F`;
  return raw;
}
