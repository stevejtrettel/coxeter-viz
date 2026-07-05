import type { Point2 } from '@/geometry/types';
import type { Model } from '@/models/types';
import type { RenderTolerances } from './types';

/**
 * Point marks (see README, "Intrinsic styling"): a point of intrinsic radius
 * r at p renders as the jacobian-image ellipse project(p) + r·J·(unit
 * circle) — the image of the infinitesimal intrinsic disk, valid because
 * point radii are small. Its axes are r times the in-plane singular values
 * of jacobianAt. (Finite-radius circles are NOT this — they are honestly
 * sampled in sample.ts.)
 *
 * The ellipse is an exact linear image, so no recursion is needed: the
 * polygon vertex count comes straight from the sagitta bound
 * s = R(1 − cos(π/k)) ≤ flatnessPx, with R the major px radius.
 */

const MIN_VERTICES = 8;
const MAX_VERTICES = 64;

/**
 * The in-plane singular values [σ₁, σ₂] (descending) of jacobianAt(p) —
 * the mark's semi-axes per unit intrinsic radius. Flat charts keep the
 * render plane invariant, so only the upper-left 2×2 block acts.
 */
export function markAxes(model: Model<Point2>, p: Point2): [number, number] {
  const J = model.jacobianAt(p);
  const a = J[0];
  const b = J[1];
  const c = J[3];
  const d = J[4];
  // Singular values of [[a,b],[c,d]]: σ± = (√((a+d)²+(b−c)²) ± √((a−d)²+(b+c)²))/2.
  const s = Math.hypot(a + d, b - c);
  const t = Math.hypot(a - d, b + c);
  return [(s + t) / 2, Math.abs(s - t) / 2];
}

/**
 * The mark's outline: one closed contour (interleaved [x₀,y₀,…], render
 * coordinates) approximating the ellipse project(p) + r·J·(unit circle).
 */
export function markEllipse(
  model: Model<Point2>,
  p: Point2,
  radius: number,
  scalePx: number,
  tol: RenderTolerances,
): Float64Array {
  const u = model.project(p);
  const J = model.jacobianAt(p);
  // Columns of r·(in-plane block of J): the images of r·x̂ and r·ŷ.
  const ax = radius * J[0];
  const cx = radius * J[3];
  const by = radius * J[1];
  const dy = radius * J[4];

  const majorPx = scalePx * radius * markAxes(model, p)[0];
  // Sagitta bound R(1 − cos(π/k)) ≤ flatnessPx ⇒ k ≥ π/acos(1 − f/R).
  let k = MIN_VERTICES;
  if (majorPx > tol.flatnessPx) {
    k = Math.ceil(Math.PI / Math.acos(1 - tol.flatnessPx / majorPx));
    k = Math.min(MAX_VERTICES, Math.max(MIN_VERTICES, k));
  }

  const contour = new Float64Array(2 * k);
  for (let j = 0; j < k; j++) {
    const theta = (2 * Math.PI * j) / k;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    contour[2 * j] = u[0] + ax * cos + by * sin;
    contour[2 * j + 1] = u[1] + cx * cos + dy * sin;
  }
  return contour;
}
