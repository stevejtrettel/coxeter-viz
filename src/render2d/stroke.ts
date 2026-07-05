import { applyToVector } from '@/math/mat';
import type { Model } from '@/models/types';
import type { Point2 } from '@/geometry/types';
import type { CurveSample, SampledCurve } from './sample';

/**
 * Filled-outline strokes (see README, "Intrinsic styling"): a stroke of
 * intrinsic width w along a sampled curve is the region between the two
 * offset curves u(t) ± (w/2)·J·n̂(t), with n̂(t) the render-space unit normal
 * to the projected curve and J = model.jacobianAt(γ(t)). The half-width
 * vector is a point of the jacobian ellipse of intrinsic radius w/2, so the
 * stroke has intrinsic width w at every sample — width varies along the
 * stroke, anisotropically where the chart is (thinner radially in Klein).
 *
 * Open curves yield ONE closed contour (left offsets forward, right offsets
 * backward — the two offset curves joined at the ends, i.e. butt caps).
 * Closed curves yield TWO contours (the two offset loops), which the
 * even-odd fill rule turns into an annulus.
 */

/** Below this render length an edge direction is considered degenerate. */
const EPS_DIR = 1e-12;

/**
 * Build the outline contour(s) for a stroke of intrinsic width `width` along
 * `curve`. Returns interleaved [x₀,y₀,x₁,y₁,…] contours in render
 * coordinates, ready for RenderPath.contours (even-odd fill).
 */
export function strokeOutline(
  curve: SampledCurve,
  model: Model<Point2>,
  width: number,
): Float64Array[] {
  const { samples, closed } = curve;
  const n = samples.length;
  if (n < 2 || width <= 0) return [];

  const normals = curveNormals(samples, closed);
  const half = width / 2;
  const left = new Float64Array(2 * n);
  const right = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const h = applyToVector(model.jacobianAt(s.p), normals[i]);
    left[2 * i] = s.u[0] + half * h[0];
    left[2 * i + 1] = s.u[1] + half * h[1];
    right[2 * i] = s.u[0] - half * h[0];
    right[2 * i + 1] = s.u[1] - half * h[1];
  }

  if (closed) return [left, right];

  // One contour: left side forward, right side backward.
  const contour = new Float64Array(4 * n);
  contour.set(left, 0);
  for (let i = 0; i < n; i++) {
    const j = n - 1 - i;
    contour[2 * n + 2 * i] = right[2 * j];
    contour[2 * n + 2 * i + 1] = right[2 * j + 1];
  }
  return [contour];
}

/**
 * Per-sample unit normals (as render vectors, z = 0) of the projected
 * polyline: edge directions, degenerate edges inheriting a neighbor's, then
 * vertex tangents averaged from the adjacent edges (ends one-sided for open
 * curves, wrapping for closed) and rotated by +90°.
 */
function curveNormals(samples: readonly CurveSample[], closed: boolean): Float64Array[] {
  const n = samples.length;
  const edgeCount = closed ? n : n - 1;
  const dirs = new Float64Array(2 * edgeCount);
  let lastX = 0;
  let lastY = 0;
  let seeded = false;
  for (let i = 0; i < edgeCount; i++) {
    const a = samples[i].u;
    const b = samples[(i + 1) % n].u;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len > EPS_DIR) {
      lastX = dx / len;
      lastY = dy / len;
      if (!seeded) {
        // Backfill any degenerate leading edges with the first valid direction.
        for (let j = 0; j < i; j++) {
          dirs[2 * j] = lastX;
          dirs[2 * j + 1] = lastY;
        }
        seeded = true;
      }
    }
    dirs[2 * i] = lastX;
    dirs[2 * i + 1] = lastY;
  }
  if (!seeded) throw new Error('strokeOutline: curve is degenerate (all samples coincide)');

  const normals: Float64Array[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let tx: number;
    let ty: number;
    if (closed) {
      const prev = (i - 1 + n) % n;
      tx = dirs[2 * prev] + dirs[2 * i];
      ty = dirs[2 * prev + 1] + dirs[2 * i + 1];
    } else if (i === 0) {
      tx = dirs[0];
      ty = dirs[1];
    } else if (i === n - 1) {
      tx = dirs[2 * (n - 2)];
      ty = dirs[2 * (n - 2) + 1];
    } else {
      tx = dirs[2 * (i - 1)] + dirs[2 * i];
      ty = dirs[2 * (i - 1) + 1] + dirs[2 * i + 1];
    }
    const len = Math.hypot(tx, ty);
    if (len > EPS_DIR) {
      tx /= len;
      ty /= len;
    } else {
      // Adjacent edges exactly reverse — fall back to the incoming edge.
      const k = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
      tx = dirs[2 * k];
      ty = dirs[2 * k + 1];
    }
    normals[i] = Float64Array.of(-ty, tx, 0);
  }
  return normals;
}
