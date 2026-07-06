import type { Covec, Vec, Vec3, Vec4 } from '@/math/vec';
import type { Mat3, Mat4 } from '@/math/mat';
import type { Hyperplane } from './Hyperplane';

export type GeometryKind = 'spherical' | 'euclidean' | 'hyperbolic';

/**
 * The canonical point types: ambient R³ for 2D geometries, R⁴ for 3D. A point
 * is an element of the geometry's NONLINEAR locus (⟨p,p⟩ = ±1, or the slice
 * p₀ = 1) — a geometric concept, which is why its alias lives here and not in
 * `math/` (where the linear vector/covector pair lives). Documentation
 * aliases: `normalize` is what produces a point; names and conventions do
 * the work.
 */
export type Point2 = Vec3;
export type Point3 = Vec4;
/** The isometry types: (n+1)×(n+1) matrices acting on the ambient space. */
export type Isometry2 = Mat3;
export type Isometry3 = Mat4;

/**
 * A constant-curvature geometry, described intrinsically on its point locus
 * in ambient R^{n+1} (see README). Generic over the canonical point type `P`
 * (Point2 / Point3) and isometry type `I` (Isometry2 / Isometry3). One
 * interface carries both the point operations and the isometry-group
 * operations — every homogeneous space has both, and the group machinery
 * (orbits, Coxeter groups) needs them together.
 *
 * Signatures mark the roles: `P` for points of the locus, `Vec` for raw
 * ambient vectors (tangents, unpromoted candidates), `Covec` for covectors.
 * Matrices act on vectors and covectors DIFFERENTLY (`applyToVector` /
 * `applyToCovector` in math/); `apply` and `applyDual` are those two actions.
 */
export interface Geometry<P extends Vec, I> {
  readonly kind: GeometryKind;
  /** Intrinsic dimension n (ambient is n+1). */
  readonly dim: 2 | 3;

  /** The ambient bilinear form ⟨a,b⟩_J (degenerate for Euclidean). */
  form(a: Vec, b: Vec): number;
  /** Plain coordinate pairing c·v — a covector against a point/vector. */
  pairing(c: Covec, v: Vec): number;
  /** The metric dual J·c (covector ↦ pole; the pole is NOT a point). */
  dual(c: Covec): Vec;

  origin(): P;
  /** Project a drifted vector back exactly onto the point locus. */
  normalize(p: Vec): P;
  distance(p: P, q: P): number;
  /** Flow from p along tangent v for parameter t (default 1). */
  exp(p: P, v: Vec, t?: number): P;
  /** The tangent at p reaching q at t = 1. Undefined at the cut locus (S). */
  log(p: P, q: P): Vec;
  /** Unit-domain geodesic p → q over t ∈ [0, 1]. */
  geodesic(p: P, q: P): (t: number) => P;

  identity(): I;
  apply(g: I, p: P): P;
  /**
   * Transport a covector: c ↦ (g⁻¹)ᵀ c = c·g⁻¹, the contravariant action, so
   * that side values are equivariant: (c·g⁻¹) · (g·p) = c·p. (For S/H this
   * equals JgJ·c; computed uniformly via the inverse.)
   */
  applyDual(g: I, c: Covec): Covec;
  /** The product g·h (apply h first). */
  compose(g: I, h: I): I;
  inverse(g: I): I;
  /** The reflection I − 2 (Jc)cᵀ in a wall (see README). */
  reflection(wall: Hyperplane): I;
  /**
   * Project a float-drifted matrix back onto the isometry group (README,
   * "isometry renormalization") — long composition chains (interactive
   * dragging) walk off the group, hyperbolically fast in H.
   */
  renormalizeIsometry(g: I): I;
}
