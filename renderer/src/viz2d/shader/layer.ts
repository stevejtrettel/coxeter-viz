import type { Point2 } from '@/geometry/types';
import type { Model } from '@/models/types';
import type { RealizedPolygon } from '@/coxeter/solve';
import type { RasterLayer } from '@/viz2d/render/png';
import type { TilingStyle } from './types';
import { TilingShader } from './TilingShader';

/**
 * The GPU field as a RasterLayer (render2d/png.ts) for PNG export. Each
 * render creates a scratch canvas and a fresh TilingShader, draws once, and
 * disposes — stateless, no retained WebGL contexts; an export is rare, so
 * the ~ms of program compile is irrelevant. The screen path deliberately
 * does NOT go through this (the live canvas needs a persistent context and
 * rAF scheduling); this seam is export-only.
 */
export function tilingLayer(
  poly: RealizedPolygon,
  model: Model<Point2>,
  style: TilingStyle,
): RasterLayer {
  return {
    render(camera, size) {
      const canvas = document.createElement('canvas');
      canvas.width = size.widthPx;
      canvas.height = size.heightPx;
      const shader = new TilingShader(canvas);
      try {
        shader.setPolygon(poly);
        shader.setChart(model);
        shader.draw(camera, style);
      } finally {
        shader.dispose();
      }
      return canvas;
    },
  };
}
