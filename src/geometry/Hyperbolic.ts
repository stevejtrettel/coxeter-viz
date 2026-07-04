import { Matrix3, Matrix4, Vector3, Vector4 } from 'three';
import type { Geometry } from './types';
import type { Hyperplane } from './Hyperplane';
import { dual3, dual4, form3, form4, reflection3, reflection4 } from './ambient';

/**
 * Hyperbolic space Hⁿ (κ = −1): the upper sheet ⟨p,p⟩ = −1, p₀ > 0 of the
 * hyperboloid in Minkowski R^{n,1} (coordinate 0 timelike), isometries
 * O(n,1)⁺. exp/log/distance are the κ-trig (cosh/sinh) closed forms of the
 * README. `normalize` also flips a past-pointing vector back to the upper
 * sheet.
 */

export class Hyperbolic2 implements Geometry<Vector3, Matrix3> {
  readonly kind = 'hyperbolic' as const;
  readonly dim = 2 as const;

  form(a: Vector3, b: Vector3): number {
    return form3(-1, a, b);
  }
  pairing(c: Vector3, p: Vector3): number {
    return c.dot(p);
  }
  dual(c: Vector3): Vector3 {
    return dual3(-1, c);
  }
  origin(): Vector3 {
    return new Vector3(1, 0, 0);
  }
  normalize(p: Vector3): Vector3 {
    const s = Math.sqrt(-this.form(p, p));
    return p.clone().multiplyScalar(p.x < 0 ? -1 / s : 1 / s);
  }
  distance(p: Vector3, q: Vector3): number {
    return Math.acosh(Math.max(1, -this.form(p, q)));
  }
  exp(p: Vector3, v: Vector3, t = 1): Vector3 {
    const len = Math.sqrt(Math.max(0, this.form(v, v))); // tangents are spacelike
    if (len * Math.abs(t) < 1e-15) return p.clone();
    return p.clone().multiplyScalar(Math.cosh(t * len)).addScaledVector(v, Math.sinh(t * len) / len);
  }
  log(p: Vector3, q: Vector3): Vector3 {
    const d = this.distance(p, q);
    // q = cosh(d) p + sinh(d) v̂  ⇒  w = q − cosh(d) p has length sinh(d).
    const w = q.clone().addScaledVector(p, -Math.cosh(d));
    const s = Math.sqrt(Math.max(0, this.form(w, w)));
    return s < 1e-15 ? w : w.multiplyScalar(d / s);
  }
  geodesic(p: Vector3, q: Vector3): (t: number) => Vector3 {
    const v = this.log(p, q);
    return (t) => this.exp(p, v, t);
  }

  identity(): Matrix3 {
    return new Matrix3();
  }
  apply(g: Matrix3, p: Vector3): Vector3 {
    return p.clone().applyMatrix3(g);
  }
  compose(g: Matrix3, h: Matrix3): Matrix3 {
    return new Matrix3().multiplyMatrices(g, h);
  }
  inverse(g: Matrix3): Matrix3 {
    return g.clone().invert();
  }
  reflection(wall: Hyperplane<Vector3>): Matrix3 {
    return reflection3(-1, wall.covector);
  }
}

export class Hyperbolic3 implements Geometry<Vector4, Matrix4> {
  readonly kind = 'hyperbolic' as const;
  readonly dim = 3 as const;

  form(a: Vector4, b: Vector4): number {
    return form4(-1, a, b);
  }
  pairing(c: Vector4, p: Vector4): number {
    return c.dot(p);
  }
  dual(c: Vector4): Vector4 {
    return dual4(-1, c);
  }
  origin(): Vector4 {
    return new Vector4(1, 0, 0, 0);
  }
  normalize(p: Vector4): Vector4 {
    const s = Math.sqrt(-this.form(p, p));
    return p.clone().multiplyScalar(p.x < 0 ? -1 / s : 1 / s);
  }
  distance(p: Vector4, q: Vector4): number {
    return Math.acosh(Math.max(1, -this.form(p, q)));
  }
  exp(p: Vector4, v: Vector4, t = 1): Vector4 {
    const len = Math.sqrt(Math.max(0, this.form(v, v)));
    if (len * Math.abs(t) < 1e-15) return p.clone();
    return p.clone().multiplyScalar(Math.cosh(t * len)).addScaledVector(v, Math.sinh(t * len) / len);
  }
  log(p: Vector4, q: Vector4): Vector4 {
    const d = this.distance(p, q);
    const w = q.clone().addScaledVector(p, -Math.cosh(d));
    const s = Math.sqrt(Math.max(0, this.form(w, w)));
    return s < 1e-15 ? w : w.multiplyScalar(d / s);
  }
  geodesic(p: Vector4, q: Vector4): (t: number) => Vector4 {
    const v = this.log(p, q);
    return (t) => this.exp(p, v, t);
  }

  identity(): Matrix4 {
    return new Matrix4();
  }
  apply(g: Matrix4, p: Vector4): Vector4 {
    return p.clone().applyMatrix4(g);
  }
  compose(g: Matrix4, h: Matrix4): Matrix4 {
    return new Matrix4().multiplyMatrices(g, h);
  }
  inverse(g: Matrix4): Matrix4 {
    return g.clone().invert();
  }
  reflection(wall: Hyperplane<Vector4>): Matrix4 {
    return reflection4(-1, wall.covector);
  }
}
