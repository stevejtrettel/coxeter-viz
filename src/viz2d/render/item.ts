import { cross, vec3, type Vec3 } from '@/math/vec';
import type { Geometry, Isometry2, Point2 } from '@/geometry/types';
import { Hyperplane } from '@/geometry/Hyperplane';
import type { SampledCurve } from './sample';

/**
 * Per-item contour primitives shared by the flat builder (`scene.ts`) and the
 * perspective builder (`sphere/scene.ts`): turning sampled curves into fill
 * contours, the convex-polygon membership predicate, and covariant wall
 * transport. The builders differ only in their VISIBILITY POLICY (flat
 * single-pass frame clip vs sphere two-pass silhouette split); assembling an
 * item's contours from samples is the same on both sides and lives here.
 */

/** The closed spine contour of a sampled closed curve (every sample once). */
export function spineContour(curve: SampledCurve): Float64Array {
  const n = curve.samples.length;
  const contour = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    contour[2 * i] = curve.samples[i].u[0];
    contour[2 * i + 1] = curve.samples[i].u[1];
  }
  return contour;
}

/**
 * A polygon's fill boundary from its sampled edges: each edge contributes its
 * samples MINUS the last (the next edge's first sample is the shared vertex),
 * so every vertex appears exactly once around the loop.
 */
export function fillContourFromEdges(edges: readonly SampledCurve[]): Float64Array {
  let count = 0;
  for (const e of edges) count += e.samples.length - 1;
  const contour = new Float64Array(2 * count);
  let k = 0;
  for (const e of edges) {
    for (let i = 0; i + 1 < e.samples.length; i++) {
      contour[k++] = e.samples[i].u[0];
      contour[k++] = e.samples[i].u[1];
    }
  }
  return contour;
}

/** The (unnormalized) chordal mean of a vertex loop — inside the convex hull. */
export function vertexMean(verts: readonly Point2[]): Vec3 {
  const s = vec3(0, 0, 0);
  for (const v of verts) {
    s[0] += v[0];
    s[1] += v[1];
    s[2] += v[2];
  }
  return s;
}

/**
 * Convex containment for a geodesically convex vertex loop — the standing
 * convexity assumption shared by fill honesty, the sphere fills, and the hit
 * test: q is inside iff each edge covector cross(vᵢ, vᵢ₊₁) pairs with q on
 * the same side as with the vertex mean. `tol` slackens the boundary (1e-12
 * for the sphere fills; 0 for the exact hit test).
 */
export function convexContainment(verts: readonly Point2[], tol = 0): (q: Point2) => boolean {
  if (verts.length < 3) return () => false;
  const mean = vertexMean(verts);
  const covs = verts.map((v, i) => cross(v, verts[(i + 1) % verts.length]));
  const signs = covs.map((c) => c[0] * mean[0] + c[1] * mean[1] + c[2] * mean[2]);
  return (q: Point2) =>
    covs.every((c, i) => (c[0] * q[0] + c[1] * q[1] + c[2] * q[2]) * signs[i] >= -tol);
}

/** Transport a wall covariantly by the isometry g (the covector action). */
export function transportWall(
  geom: Geometry<Point2, Isometry2>,
  g: Isometry2,
  wall: Hyperplane,
): Hyperplane {
  return Hyperplane.fromCovector(geom, geom.applyDual(g, wall.covector));
}
