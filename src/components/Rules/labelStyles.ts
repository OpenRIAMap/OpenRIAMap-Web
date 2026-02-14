import * as L from 'leaflet';

/**
 * Label 视觉样式集中管理（便于维护与扩展）。
 *
 * 设计原则：
 * - 不依赖外部 CSS（全部 inline style），避免打包/样式作用域导致丢失。
 * - 通过 styleKey 调用，后续新增样式只改这里。
 */

/**
 * Label 样式 key。
 *
 * 说明：
 * - 兼容旧 key（如 gm-bw-15 / bubble-dark-13）。
 * - 支持可扩展尺寸系统：gm-bw-xx / gm-wtb-xx / bubble-dark-xx。
 */
export type LabelStyleKey =
  | 'bubble-dark'
  | `bubble-dark-${number}`
  | 'gm-outline'
  | 'gm-outline-bold'
  | `gm-bw-${number}`
  | `gm-wtb-${number}`;

export type LabelPlacement = 'center' | 'near';

export type LabelRenderOptions = {
  placement: LabelPlacement;
  withDot?: boolean;
  offsetY?: number;
  /** 是否允许交互（用于“点击 label”模式） */
  interactive?: boolean;
};

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[<>&"]/g, (m) => {
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    if (m === '&') return '&amp;';
    if (m === '"') return '&quot;';
    return m;
  });
}

function dotHtml(): string {
  return `
    <span style="
      display:inline-block;
      width:6px;height:6px;
      border-radius:999px;
      background:#fff;
      margin-right:6px;
      box-shadow:0 0 0 3px rgba(0,0,0,0.85);
      flex:0 0 auto;
    "></span>
  `;
}

function placementTransform(placement: LabelPlacement): string {
  return placement === 'near' ? 'translate(-50%, -120%)' : 'translate(-50%, -50%)';
}

function placementExtraMarginTopPx(placement: LabelPlacement, offsetY?: number): number {
  return placement === 'near' ? -(Number(offsetY ?? 0) || 0) : 0;
}

/**
 * 渲染 label HTML。
 * 注意：此处不做 DOM 操作，返回 HTML 字符串，用于 Leaflet.divIcon。
 */
export function renderLabelHtml(styleKey: LabelStyleKey, text: string, opts: LabelRenderOptions): string {
  const safe = escapeHtml(String(text ?? ''));

  const placement = opts.placement ?? 'center';
  const transform = placementTransform(placement);
  const extraMarginTop = placementExtraMarginTopPx(placement, opts.offsetY);

  const dot = opts.withDot ? dotHtml() : '';
  const pe = opts.interactive ? 'auto' : 'none';
  const cursor = opts.interactive ? 'pointer' : 'default';

  // Google Map 风格：描边字（webkit-text-stroke + text-shadow 双保险）
  // 固定格式 + 可扩展尺寸系统：gm-bw-xx / gm-wtb-xx
  const roundTo = (v: number, step: number) => {
    const s = Number(step) || 0;
    if (!s || !Number.isFinite(v)) return v;
    return Math.round(v / s) * s;
  };

  const parseSizeSuffix = (key: string, prefix: string): number | null => {
    if (!key.startsWith(prefix)) return null;
    const s = key.slice(prefix.length);
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  };

  const GM_STATIC: Record<string, { fontSize: number; strokeW: number; fill: string; stroke: string; fontWeight: number }> = {
    'gm-outline': { fontSize: 17, strokeW: 0.5, fill: '#ffffff', stroke: '#000000', fontWeight: 700 },
    'gm-outline-bold': { fontSize: 17, strokeW: 0.7, fill: '#ffffff', stroke: '#000000', fontWeight: 800 },
    // 保留旧 key 的显式覆盖（避免未来有人调整比例导致历史样式漂移）
    'gm-bw-15': { fontSize: 15, strokeW: 0.5, fill: '#ffffff', stroke: '#000000', fontWeight: 700 },
    'gm-bw-9': { fontSize: 9, strokeW: 0.3, fill: '#ffffff', stroke: '#000000', fontWeight: 700 },
    'gm-wtb-15': { fontSize: 15, strokeW: 0.5, fill: '#dbeafe', stroke: '#1d4ed8', fontWeight: 700 },
  };

  const gmStatic = GM_STATIC[String(styleKey)];
  const GM_STROKE_RATIO = 1 / 30; // 与旧值保持一致：15->0.5, 9->0.3

  const tryBuildGmDerived = (key: string): { fontSize: number; strokeW: number; fill: string; stroke: string; fontWeight: number } | null => {
    // gm-bw-xx：黑描边白填充
    const bw = parseSizeSuffix(key, 'gm-bw-');
    if (bw !== null) {
      return {
        fontSize: bw,
        strokeW: roundTo(bw * GM_STROKE_RATIO, 0.05),
        fill: '#ffffff',
        stroke: '#000000',
        fontWeight: 700,
      };
    }
    // gm-wtb-xx：淡天蓝填充 + 深蓝描边
    const wtb = parseSizeSuffix(key, 'gm-wtb-');
    if (wtb !== null) {
      return {
        fontSize: wtb,
        strokeW: roundTo(wtb * GM_STROKE_RATIO, 0.05),
        fill: '#dbeafe',
        stroke: '#1d4ed8',
        fontWeight: 700,
      };
    }
    return null;
  };

  const gm = gmStatic ?? tryBuildGmDerived(String(styleKey));
  if (gm) {
    const shadow = `
      0 0 0px rgba(0,0,0,0.9),
      0 0 0px rgba(0,0,0,0.9),
      0px 0 0 rgba(0,0,0,0.9),
      -0px 0 0 rgba(0,0,0,0.9),
      0 0px 0 rgba(0,0,0,0.9),
      0 -0px 0 rgba(0,0,0,0.9)
    `;

    return `
      <div style="
        transform:${transform};
        margin-top:${extraMarginTop}px;
        white-space:nowrap;
        pointer-events:${pe};
        cursor:${cursor};
        display:inline-flex;
        align-items:center;
        background:transparent;
        padding:0;
      ">
        ${dot}
        <span style="
          color:${gm.fill};
          font-weight:${gm.fontWeight};
          font-size:${gm.fontSize}px;
          line-height:1.1;
          -webkit-text-stroke:${gm.strokeW}px ${gm.stroke};
          text-shadow:${shadow};
        ">${safe}</span>
      </div>
    `;
  }

  // bubble-dark(-xx)：黑底半透明圆角气泡（参考 STA 的现有风格）
  // 需求：dot（若启用）应独立在气泡外部，气泡仅包裹文字。
  // 可扩展尺寸系统：bubble-dark-xx
  const bubbleSize =
    String(styleKey) === 'bubble-dark'
      ? 12
      : parseSizeSuffix(String(styleKey), 'bubble-dark-') ?? 12;

  // 与旧值保持一致（bubble-dark-13：paddingY=2, paddingX=6, radius=6）
  const BUBBLE_PADY_RATIO = 2 / 13;
  const BUBBLE_PADX_RATIO = 6 / 13;
  const BUBBLE_RADIUS_RATIO = 6 / 13;

  const bubblePadY = Math.max(1, Math.round(bubbleSize * BUBBLE_PADY_RATIO));
  const bubblePadX = Math.max(2, Math.round(bubbleSize * BUBBLE_PADX_RATIO));
  const bubbleRadius = Math.max(3, Math.round(bubbleSize * BUBBLE_RADIUS_RATIO));
  const bubbleSpan = `
    <span style="
      background: rgba(0,0,0,0.65);
      color: #fff;
      padding: ${bubblePadY}px ${bubblePadX}px;
      border-radius: ${bubbleRadius}px;
      font-size: ${bubbleSize}px;
      white-space: nowrap;
      line-height: 1;
    ">${safe}</span>
  `;

  return `
    <div style="
      transform: ${transform};
      margin-top: ${extraMarginTop}px;
      pointer-events: ${pe};
      cursor: ${cursor};
      display: inline-flex;
      align-items: center;
      white-space: nowrap;
      background: transparent;
      padding: 0;
    ">${dot}${bubbleSpan}</div>
  `;
}

export function makeLabelDivIcon(styleKey: LabelStyleKey, text: string, opts: LabelRenderOptions): L.DivIcon {
  const html = renderLabelHtml(styleKey, text, opts);
  return L.divIcon({ className: '', html, iconSize: [0, 0] });
}
