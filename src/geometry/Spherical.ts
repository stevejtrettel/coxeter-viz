import { addScaled, clone, dot, scale, vec3, vec4, type Covec, type Vec } from '@/math/vec';
import { applyToCovector, applyToVector, identity, matInverse, matMul } from '@/math/mat';
import type { Geometry, Isometry2, Isometry3, Point2, Point3 } from './types';
import type { Hyperplane } from './Hyperplane';
import { clamp, dual, form, reflectionMat } from './ambient';

/**
 * The round sphere Sⁿ (κ = +1): points ⟨p,p⟩ = 1 in ambient R^{n+1} with the
 * standard form, isometries O(n+1). exp/log/distance are the κ-trig (cos/sin)
 * closed forms of the README. log is undefined at the cut locus (the
 * antipode, distance π); callers must stay inside it. The 2D and 3D cells
 * share one dimension-generic body (the array length is the ambient
 * dimension); only `dim` and `origin` differ.
 */

abstract class SphericalBase<P extends Vec, I extends Vec> implements Geometry<P, I> {
  readonly kind = 'spherical' as const;
  abstract readonly dim: 2 | 3;
  abstract origin(): P;

  form(a: Vec, b: Vec): number {
    return form(1, a, b);
  }
  pairing(c: Covec, v: Vec): number {
    return dot(c, v);
  }
  dual(c: Covec): Vec {
    return dual(1, c);
  }
  normalize(p: Vec): P {
    return scale(p, 1 / Math.sqrt(this.form(p, p))) as P;
  }
  distance(p: P, q: P): number {
    return Math.acos(clamp(this.form(p, q), -1, 1));
  }
  exp(p: P, v: Vec, t = 1): P {
    const len = Math.sqrt(Math.max(0, this.form(v, v)));
    if (len * Math.abs(t) < 1e-15) return clone(p) as P;
    return addScaled(scale(p, Math.cos(t * len)), v, Math.sin(t * len) / len) as P;
  }
  log(p: P, q: P): Vec {
    const d = this.distance(p, q);
    const w = addScaled(q, p, -Math.cos(d)); // ⊥ p, length sin d
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
    return reflectionMat(1, wall.covector) as I;
  }
}

export class Spherical2 extends SphericalBase<Point2, Isometry2> {
  readonly dim = 2 as const;
  origin(): Point2 {
    return vec3(1, 0, 0);
  }
}

export class Spherical3 extends SphericalBase<Point3, Isometry3> {
  readonly dim = 3 as const;
  origin(): Point3 {
    return vec4(1, 0, 0, 0);
  }
}
