import { GREY, WALL_COLORS } from '@/viz2d/kit/palette';
import type { ViewSize } from '@/viz2d/render/types';
import {
  DASH,
  EDGE_WIDTH,
  HIGHLIGHT_SCALE,
  LABEL_SIZE,
  NODE_RADIUS,
  edgeLabelAt,
  edgeSegment,
  fit,
  project,
  type DiagramDrawing,
} from './layout';

/**
 * The SVG emitter (README): a `DiagramDrawing` → a standalone `<svg>` string.
 * Paints edges first, then labels, then nodes on top. Shares `fit`/`project`
 * with the canvas emitter, so the two produce the same picture.
 */

export const INK = '#333333';

const f2 = (v: number): string => (Math.abs(v) < 1e-9 ? '0' : v.toFixed(2));

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function diagramSvg(d: DiagramDrawing, size: ViewSize): string {
  const F = fit(d, size);
  const px = (u: number): number => u * F.scale;
  const out: string[] = [];

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.widthPx}" height="${size.heightPx}" ` +
      `viewBox="0 0 ${size.widthPx} ${size.heightPx}">`,
  );

  // — edges —
  for (const e of d.edges) {
    const hl = e.highlighted && d.highlightColor !== null;
    const w = px(EDGE_WIDTH) * (hl ? HIGHLIGHT_SCALE : 1);
    const dash = e.dashed
      ? ` stroke-dasharray="${f2(px(DASH[0]) * (hl ? HIGHLIGHT_SCALE : 1))} ${f2(px(DASH[1]) * (hl ? HIGHLIGHT_SCALE : 1))}"`
      : '';
    const seg = edgeSegment(d, e);
    const [x1, y1] = project(F, seg.a[0], seg.a[1]);
    const [x2, y2] = project(F, seg.b[0], seg.b[1]);
    out.push(
      `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" ` +
        `stroke="${hl ? d.highlightColor : INK}" stroke-width="${f2(w)}" stroke-linecap="round"${dash}/>`,
    );
  }

  // — edge labels, seated beside their edge —
  for (const e of d.edges) {
    if (e.label === null) continue;
    const [mx, my] = edgeLabelAt(d, e);
    const [x, y] = project(F, mx, my);
    out.push(
      `<text x="${f2(x)}" y="${f2(y)}" fill="${INK}" font-size="${f2(px(LABEL_SIZE))}" ` +
        `font-family="Georgia, serif" text-anchor="middle" dominant-baseline="central">${esc(e.label)}</text>`,
    );
  }

  // — nodes, colored by generator (= wall color); a selected node wears a
  //   ring in the selection's color, so the node keeps its own identity —
  for (const p of d.nodes) {
    const [x, y] = project(F, p.x, p.y);
    if (p.highlighted && d.highlightColor !== null) {
      out.push(
        `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(px(NODE_RADIUS) * 1.55)}" ` +
          `fill="none" stroke="${d.highlightColor}" stroke-width="${f2(px(EDGE_WIDTH) * HIGHLIGHT_SCALE)}"/>`,
      );
    }
    out.push(
      `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(px(NODE_RADIUS))}" ` +
        `fill="${WALL_COLORS[p.index % WALL_COLORS.length]}" stroke="${GREY.page}" ` +
        `stroke-width="${f2(px(EDGE_WIDTH))}"/>`,
    );
  }

  out.push('</svg>');
  return out.join('\n');
}
