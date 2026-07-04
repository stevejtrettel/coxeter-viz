import type { Matrix3, Matrix4, Vector3, Vector4 } from 'three';
import type { Hyperplane } from './Hyperplane';

export type GeometryKind = 'spherical' | 'euclidean' | 'hyperbolic';

/** The canonical point types: ambient R³ for 2D geometries, R⁴ for 3D. */
export type Point2 = Vector3;
export type Point3 = Vector4;
/** The isometry types: (n+1)×(n+1) matrices acting on the ambient space. */
export type Isometry2 = Matrix3;
export type Isometry3 = Matrix4;

/** The minimal vector operations generic code needs from a point type. */
export interface Vec<P> {
  clone(): P;
  multiplyScalar(s: number): P;
  addScaledVector(v: P, s: number): P;
}

/**
 * A constant-curvature geometry, described intrinsically on its point locus
 * in ambient R^{n+1} (see README). Generic over the canonical point type `P`
 * (Vector3 / Vector4) and isometry type `I` (Matrix3 / Matrix4). One
 * interface carries both the point operations and the isometry-group
 * operations — every homogeneous space has both, and the group machinery
 * (orbits, Coxeter groups) needs them together.
 */
export interface Geometry<P extends Vec<P>, I> {
  readonly kind: GeometryKind;
  /** Intrinsic dimension n (ambient is n+1). */
  readonly dim: 2 | 3;

  /** The ambient bilinear form ⟨a,b⟩_J (degenerate for Euclidean). */
  form(a: P, b: P): number;
  /** Plain coordinate pairing c·p — a covector against a point. */
  pairing(c: P, p: P): number;
  /** The metric dual J·c (covector ↔ pole). */
  dual(c: P): P;

  origin(): P;
  /** Project a drifted vector back exactly onto the point locus. */
  normalize(p: P): P;
  distance(p: P, q: P): number;
  /** Flow from p along tangent v for parameter t (default 1). */
  exp(p: P, v: P, t?: number): P;
  /** The tangent at p reaching q at t = 1. Undefined at the cut locus (S). */
  log(p: P, q: P): P;
  /** Unit-domain geodesic p → q over t ∈ [0, 1]. */
  geodesic(p: P, q: P): (t: number) => P;

  identity(): I;
  apply(g: I, p: P): P;
  /** The product g·h (apply h first). */
  compose(g: I, h: I): I;
  inverse(g: I): I;
  /** The reflection I − 2 (Jc)cᵀ in a wall (see README). */
  reflection(wall: Hyperplane<P>): I;
}
