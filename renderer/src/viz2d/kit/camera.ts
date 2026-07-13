import { mat3, matMul } from '@/math/mat';
import type { Geometry, GeometryKind, Isometry2, Point2 } from '@/geometry/types';
import type { Model } from '@/models/types';

/**
 * Camera framing (`viz2d/kit`): the projection math that fits a view to the
 * content — kept in the toolkit, not the demos (a demo supplies only the
 * pixel size, margins, and view angles). All return `scalePx` (px per render
 * unit); the demo builds the `Camera` around it.
 */

/**
 * Fit a chart to the geometry: disk charts frame the domain radius (× margin),
 * a Euclidean plane fits ~16 inradii, a spherical plane a fixed span. The
 * ternary the field demos share.
 */
export function fitToDomain(
  model: Model<Point2>,
  kind: GeometryKind,
  r0: number,
  sizePx: number,
  margin = 1.08,
): number {
  if (model.domain.kind === 'disk') return sizePx / 2 / (model.domain.radius * margin);
  return kind === 'euclidean' ? sizePx / (16 * r0) : sizePx / 2 / 3.2;
}

/**
 * Fit a chart to a point set: project each point (optionally through a view
 * isometry) and scale so the farthest lands inside the frame at the given
 * margin. The framing for Cayley-node galleries and word-list tile patches.
 */
export function fitToPoints(
  geom: Geometry<Point2, Isometry2>,
  model: Model<Point2>,
  points: readonly Point2[],
  sizePx: number,
  opts?: { view?: Isometry2; margin?: number },
): number {
  const margin = opts?.margin ?? 1.1;
  let extent = 1e-9;
  for (const p of points) {
    const q = opts?.view ? geom.apply(opts.view, p) : p;
    const u = model.project(q);
    extent = Math.max(extent, Math.hypot(u[0], u[1]));
  }
  return sizePx / 2 / (extent * margin);
}

/** Rotation by `angle` in the (i, j) coordinate plane of ambient R³. */
export function planeRotation(i: number, j: number, angle: number): Isometry2 {
  const rows = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  rows[i][i] = Math.cos(angle);
  rows[j][j] = Math.cos(angle);
  rows[i][j] = -Math.sin(angle);
  rows[j][i] = Math.sin(angle);
  return mat3(rows);
}

/**
 * A generic off-axis view isometry for the sphere: tip about the (0,1) plane
 * then the (0,2) plane, so neither the globe nor the stereographic chart sits
 * on a symmetry axis.
 */
export function tippedView(a = 0.55, b = 0.35): Isometry2 {
  return matMul(planeRotation(0, 1, a), planeRotation(0, 2, b));
}
