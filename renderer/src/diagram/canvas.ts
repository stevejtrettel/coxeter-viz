import { GREY, WALL_COLORS } from '@/viz2d/kit/palette';
import type { RasterLayer } from '@/viz2d/render/png';
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
import { INK } from './svg';

/**
 * The canvas emitter (README): a `DiagramDrawing` as a `RasterLayer`, so PNG
 * export runs on the engine's ordinary `renderPng` — which is generic over
 * RasterLayer and knows nothing about groups. The layer IGNORES the camera
 * (a diagram has none) and fits its content to the device frame it is given,
 * so k× export is genuinely sharper, not upsampled.
 *
 * Paint order and every dimension come from the SAME `fit`/`edgeSegments` the
 * SVG emitter uses; that shared use is the SVG/PNG coincidence.
 */
export function diagramLayer(d: DiagramDrawing): RasterLayer {
  return {
    render(_camera, size) {
      const canvas = document.createElement('canvas');
      canvas.width = size.widthPx;
      canvas.height = size.heightPx;
      const g = canvas.getContext('2d');
      if (!g) throw new Error('diagramLayer: no 2d context');

      const F = fit(d, size);
      const px = (u: number): number => u * F.scale;

      // — edges —
      g.lineCap = 'round';
      for (const e of d.edges) {
        const hl = e.highlighted && d.highlightColor !== null;
        const k = hl ? HIGHLIGHT_SCALE : 1;
        g.strokeStyle = hl ? d.highlightColor! : INK;
        g.lineWidth = px(EDGE_WIDTH) * k;
        g.setLineDash(e.dashed ? [px(DASH[0]) * k, px(DASH[1]) * k] : []);
        const seg = edgeSegment(d, e);
        const [x1, y1] = project(F, seg.a[0], seg.a[1]);
        const [x2, y2] = project(F, seg.b[0], seg.b[1]);
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
      }
      g.setLineDash([]);

      // — edge labels —
      g.fillStyle = INK;
      g.font = `${px(LABEL_SIZE)}px Georgia, serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const e of d.edges) {
        if (e.label === null) continue;
        const [mx, my] = edgeLabelAt(d, e);
        const [x, y] = project(F, mx, my);
        g.fillText(e.label, x, y);
      }

      // — nodes, colored by generator (= wall color); a selected node wears a
      //   ring in the selection's color, so the node keeps its own identity —
      for (const p of d.nodes) {
        const [x, y] = project(F, p.x, p.y);
        if (p.highlighted && d.highlightColor !== null) {
          g.strokeStyle = d.highlightColor;
          g.lineWidth = px(EDGE_WIDTH) * HIGHLIGHT_SCALE;
          g.beginPath();
          g.arc(x, y, px(NODE_RADIUS) * 1.55, 0, 2 * Math.PI);
          g.stroke();
        }
        g.strokeStyle = GREY.page;
        g.lineWidth = px(EDGE_WIDTH);
        g.beginPath();
        g.arc(x, y, px(NODE_RADIUS), 0, 2 * Math.PI);
        g.fillStyle = WALL_COLORS[p.index % WALL_COLORS.length];
        g.fill();
        g.stroke();
      }
      return canvas;
    },
  };
}
