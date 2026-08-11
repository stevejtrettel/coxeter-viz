import { polygonToMatrix, type CoxeterMatrix } from '@/coxeter/matrix';
import type { Figure, GroupPresentation } from '@/schema/types';
import type { ViewSize } from '@/viz2d/render/types';
import { renderPng } from '@/viz2d/render/png';
import { Euclidean2 } from '@/geometry/Euclidean';
import { layoutDiagram } from './layout';
import { diagramSvg } from './svg';
import { diagramLayer } from './canvas';

/**
 * The diagram entry point (README): a CHECKED figure document whose layers are
 * diagram layers → an SVG string or a PNG blob. No realization is involved, so
 * these succeed for groups the geometric pipeline refuses.
 */

export { layoutDiagram, type DiagramDrawing, type DiagramStyle } from './layout';
export { diagramSvg } from './svg';
export { diagramLayer } from './canvas';

/** The document's abstract group as a Coxeter matrix, whichever presentation it used. */
export function matrixOf(group: GroupPresentation): CoxeterMatrix {
  return 'coxeterMatrix' in group ? group.coxeterMatrix : polygonToMatrix(group.polygon);
}

/**
 * Is this a DIAGRAM document? True iff it has at least one layer and every
 * layer is a diagram layer. Diagram and geometric layers cannot be mixed —
 * they live in different spaces — and `checkFigure` refuses the mixture, so
 * this predicate is total on checked documents.
 */
export function isDiagramFigure(figure: Figure): boolean {
  return figure.layers.length > 0 && figure.layers.every((l) => l.type === 'diagram');
}

/** The drawing the document asks for (the first diagram layer wins). */
function drawingFor(figure: Figure) {
  for (const l of figure.layers) {
    if (l.type === 'diagram') {
      return layoutDiagram(matrixOf(figure.group), l.style ?? 'coxeter', l.highlight);
    }
  }
  return layoutDiagram(matrixOf(figure.group), 'coxeter');
}

export function diagramToSvg(figure: Figure, size: ViewSize): string {
  return diagramSvg(drawingFor(figure), size);
}

export function diagramToPng(figure: Figure, size: ViewSize, k: number, background?: string): Promise<Blob> {
  const drawing = drawingFor(figure);
  // The layer ignores the camera (a diagram has none); renderPng still wants
  // one, so hand it the trivial Euclidean view.
  const camera = { view: new Euclidean2().identity(), scalePx: 1, centerPx: [0, 0] as const };
  return renderPng([diagramLayer(drawing)], camera, size, k, background);
}
