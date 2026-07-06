import type { Geometry, Isometry2, Point2 } from '@/geometry/types';
import { clamp } from '@/geometry/ambient';

/**
 * 2D measures, exact through the geometry (README, "Measures"): polygon area
 * by Gauss–Bonnet in S/H (the area IS the angle excess/defect — for constant
 * curvature κ = ±1, ∫κ dA over a geodesic polygon gives
 * κ·A = Σθᵢ − (n−2)π), by the shoelace in the affine slice for E; perimeter
 * as the edge-distance sum; circle measures as the κ-trig closed forms. No
 * numerical integration anywhere.
 */

/** Interior angle at v between the geodesics toward a and b. */
function interiorAngle(
  geom: Geometry<Point2, Isometry2>,
  v: Point2,
  a: Point2,
  b: Point2,
): number {
  const u = geom.log(v, a);
  const w = geom.log(v, b);
  const c = geom.form(u, w) / Math.sqrt(geom.form(u, u) * geom.form(w, w));
  return Math.acos(clamp(c, -1, 1));
}

/**
 * The area of the geodesic polygon on a cyclic vertex loop (convex, like
 * every region the pipeline handles). S: angle excess; H: angle defect
 * (|Σθ − (n−2)π| covers both signs of κ); E: the shoelace on the slice.
 */
export function polygonArea(geom: Geometry<Point2, Isometry2>, verts: readonly Point2[]): number {
  const n = verts.length;
  if (n < 3) return 0;
  if (geom.kind === 'euclidean') {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % n];
      s += a[1] * b[2] - b[1] * a[2];
    }
    return Math.abs(s) / 2;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += interiorAngle(geom, verts[i], verts[(i - 1 + n) % n], verts[(i + 1) % n]);
  }
  return Math.abs(sum - (n - 2) * Math.PI);
}

/** The perimeter of the cyclic vertex loop: the edge-distance sum. */
export function polygonPerimeter(geom: Geometry<Point2, Isometry2>, verts: readonly Point2[]): number {
  let s = 0;
  for (let i = 0; i < verts.length; i++) {
    s += geom.distance(verts[i], verts[(i + 1) % verts.length]);
  }
  return s;
}

/** Circumference of the metric circle of intrinsic radius r: 2π·sin_κ(r). */
export function circleCircumference(geom: Geometry<Point2, Isometry2>, r: number): number {
  switch (geom.kind) {
    case 'spherical':
      return 2 * Math.PI * Math.sin(r);
    case 'euclidean':
      return 2 * Math.PI * r;
    case 'hyperbolic':
      return 2 * Math.PI * Math.sinh(r);
  }
}

/** Area of the metric disk of intrinsic radius r: ∫ circumference. */
export function circleArea(geom: Geometry<Point2, Isometry2>, r: number): number {
  switch (geom.kind) {
    case 'spherical':
      return 2 * Math.PI * (1 - Math.cos(r));
    case 'euclidean':
      return Math.PI * r * r;
    case 'hyperbolic':
      return 2 * Math.PI * (Math.cosh(r) - 1);
  }
}
