import type { Vec, Vec3 } from '@/math/vec';
import type { Mat3 } from '@/math/mat';
import type { GeometryKind } from '@/geometry/types';

/** Shape of a model's render-space image (for boundaries, clipping, framing). */
export type Domain =
  | { kind: 'disk'; radius: number }
  | { kind: 'ball'; radius: number }
  | { kind: 'sphere'; radius: number }
  | { kind: 'plane' }
  | { kind: 'space' };

/**
 * A coordinate chart: maps canonical ambient points (see geometry/README)
 * into a concrete picture and reports how the intrinsic metric is distorted
 * there. Pure math — a model holds no scene state and knows no rendering
 * library.
 *
 * Models are deliberately decoupled from `Geometry<P,I>`: consumers that
 * need both (views, hull builders) take both.
 */
export interface Model<P extends Vec> {
  readonly name: string;
  readonly kind: GeometryKind;
  /** Does this chart render into R² (flat) or R³ (ball / globe / space)? */
  readonly renderDim: 2 | 3;
  readonly domain: Domain;
  /** Geodesics are straight lines in this chart (the computational chart). */
  readonly straight: boolean;

  /** Canonical point → render coordinates (always length 3; [2] = 0 for flat charts). */
  project(p: P): Vec3;
  /** Inverse of project on the model's domain. */
  unproject(x: Vec3): P;

  /** Isotropic render length per unit intrinsic length (exact for conformal charts). */
  scaleAt(p: P): number;
  /** Full local distortion as a 3×3 matrix on the render-space tangent. */
  jacobianAt(p: P): Mat3;
}
