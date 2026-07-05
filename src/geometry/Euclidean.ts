import { addScaled, dot, scale, vec3, vec4, type Covec, type Vec } from '@/math/vec';
import { applyToCovector, applyToVector, identity, matInverse, matMul } from '@/math/mat';
import type { Geometry, Isometry2, Isometry3, Point2, Point3 } from './types';
import type { Hyperplane } from './Hyperplane';
import { dual, form, reflectionMat } from './ambient';

/**
 * Euclidean space Eⁿ (κ = 0): the affine slice p₀ = 1 in R^{n+1} with the
 * degenerate form J = diag(0, 1, …, 1). Isometries are the homogeneous
 * matrices [[1,0],[t,R]] — plain (n+1)×(n+1) matrices like the other
 * geometries, which is the point: all group machinery stays generic. Tangent
 * vectors have vanishing coordinate 0, so the degenerate form is *exact* on
 * them (no limit-taking anywhere; this cell is ordinary affine arithmetic).
 * The 2D and 3D cells share one dimension-generic body.
 */

abstract class EuclideanBase<P extends Vec, I extends Vec> implements Geometry<P, I> {
  readonly kind = 'euclidean' as const;
  abstract readonly dim: 2 | 3;
  abstract origin(): P;

  form(a: Vec, b: Vec): number {
    return form(0, a, b);
  }
  pairing(c: Covec, v: Vec): number {
    return dot(c, v);
  }
  dual(c: Covec): Vec {
    return dual(0, c);
  }
  normalize(p: Vec): P {
    return scale(p, 1 / p[0]) as P;
  }
  distance(p: P, q: P): number {
    const w = addScaled(q, p, -1);
    return Math.sqrt(this.form(w, w));
  }
  exp(p: P, v: Vec, t = 1): P {
    return addScaled(p, v, t) as P;
  }
  log(p: P, q: P): Vec {
    return addScaled(q, p, -1);
  }
  geodesic(p: P, q: P): (t: number) => P {
    const v = this.log(p, q);
    return (t) => this.exp(p, v, t);
  }

  identity(): I {
    return identity(this.dim + 1) as I;
  }
  apply(g: I, p: P): P {
    return applyToVector(g, p) as P;
  }
  applyDual(g: I, c: Covec): Covec {
    return applyToCovector(matInverse(g), c);
  }
  compose(g: I, h: I): I {
    return matMul(g, h) as I;
  }
  inverse(g: I): I {
    return matInverse(g) as I;
  }
  reflection(wall: Hyperplane): I {
    return reflectionMat(0, wall.covector) as I;
  }
}

export class Euclidean2 extends EuclideanBase<Point2, Isometry2> {
  readonly dim = 2 as const;
  origin(): Point2 {
    return vec3(1, 0, 0);
  }
}

export class Euclidean3 extends EuclideanBase<Point3, Isometry3> {
  readonly dim = 3 as const;
  origin(): Point3 {
    return vec4(1, 0, 0, 0);
  }
}