import { addScaled, clone, dot, scale, vec3, vec4, type Covec, type Vec } from '@/math/vec';
import { applyToCovector, applyToVector, identity, matInverse, matMul } from '@/math/mat';
import type { Geometry, Isometry2, Isometry3, Point2, Point3 } from './types';
import type { Hyperplane } from './Hyperplane';
import { dual, form, reflectionMat } from './ambient';

/**
 * Hyperbolic space Hⁿ (κ = −1): the upper sheet ⟨p,p⟩ = −1, p₀ > 0 of the
 * hyperboloid in Minkowski R^{n,1} (coordinate 0 timelike), isometries
 * O(n,1)⁺. exp/log/distance are the κ-trig (cosh/sinh) closed forms of the
 * README. `normalize` also flips a past-pointing vector back to the upper
 * sheet. The 2D and 3D cells share one dimension-generic body.
 */

abstract class HyperbolicBase<P extends Vec, I extends Vec> implements Geometry<P, I> {
  readonly kind = 'hyperbolic' as const;
  abstract readonly dim: 2 | 3;
  abstract origin(): P;

  form(a: Vec, b: Vec): number {
    return form(-1, a, b);
  }
  pairing(c: Covec, v: Vec): number {
    return dot(c, v);
  }
  dual(c: Covec): Vec {
    return dual(-1, c);
  }
  normalize(p: Vec): P {
    const s = Math.sqrt(-this.form(p, p));
    return scale(p, p[0] < 0 ? -1 / s : 1 / s) as P;
  }
  distance(p: P, q: P): number {
    return Math.acosh(Math.max(1, -this.form(p, q)));
  }
  exp(p: P, v: Vec, t = 1): P {
    const len = Math.sqrt(Math.max(0, this.form(v, v))); // tangents are spacelike
    if (len * Math.abs(t) < 1e-15) return clone(p) as P;
    return addScaled(scale(p, Math.cosh(t * len)), v, Math.sinh(t * len) / len) as P;
  }
  log(p: P, q: P): Vec {
    const d = this.distance(p, q);
    // q = cosh(d) p + sinh(d) v̂  ⇒  w = q − cosh(d) p has length sinh(d).
    const w = addScaled(q, p, -Math.cosh(d));
    const s = Math.sqrt(Math.max(0, this.form(w, w)));
    return s < 1e-15 ? scale(w, 0) : scale(w, d / s);
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
    return reflectionMat(-1, wall.covector) as I;
  }
}

export class Hyperbolic2 extends HyperbolicBase<Point2, Isometry2> {
  readonly dim = 2 as const;
  origin(): Point2 {
    return vec3(1, 0, 0);
  }
}

export class Hyperbolic3 extends HyperbolicBase<Point3, Isometry3> {
  readonly dim = 3 as const;
  origin(): Point3 {
    return vec4(1, 0, 0, 0);
  }
}
