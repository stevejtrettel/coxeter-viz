import { Matrix3, Matrix4, Vector3, Vector4 } from 'three';
import type { Geometry } from './types';
import type { Hyperplane } from './Hyperplane';
import { clamp, dual3, dual4, form3, form4, reflection3, reflection4 } from './ambient';

/**
 * The round sphere Sⁿ (κ = +1): points ⟨p,p⟩ = 1 in ambient R^{n+1} with the
 * standard form, isometries O(n+1). exp/log/distance are the κ-trig (cos/sin)
 * closed forms of the README. log is undefined at the cut locus (the
 * antipode, distance π); callers must stay inside it.
 */

export class Spherical2 implements Geometry<Vector3, Matrix3> {
  readonly kind = 'spherical' as const;
  readonly dim = 2 as const;

  form(a: Vector3, b: Vector3): number {
    return form3(1, a, b);
  }
  pairing(c: Vector3, p: Vector3): number {
    return c.dot(p);
  }
  dual(c: Vector3): Vector3 {
    return dual3(1, c);
  }
  origin(): Vector3 {
    return new Vector3(1, 0, 0);
  }
  normalize(p: Vector3): Vector3 {
    return p.clone().multiplyScalar(1 / Math.sqrt(this.form(p, p)));
  }
  distance(p: Vector3, q: Vector3): number {
    return Math.acos(clamp(this.form(p, q), -1, 1));
  }
  exp(p: Vector3, v: Vector3, t = 1): Vector3 {
    const len = Math.sqrt(Math.max(0, this.form(v, v)));
    if (len * Math.abs(t) < 1e-15) return p.clone();
    return p.clone().multiplyScalar(Math.cos(t * len)).addScaledVector(v, Math.sin(t * len) / len);
  }
  log(p: Vector3, q: Vector3): Vector3 {
    const d = this.distance(p, q);
    const w = q.clone().addScaledVector(p, -Math.cos(d)); // ⊥ p, length sin d
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
    return reflection3(1, wall.covector);
  }
}

export class Spherical3 implements Geometry<Vector4, Matrix4> {
  readonly kind = 'spherical' as const;
  readonly dim = 3 as const;

  form(a: Vector4, b: Vector4): number {
    return form4(1, a, b);
  }
  pairing(c: Vector4, p: Vector4): number {
    return c.dot(p);
  }
  dual(c: Vector4): Vector4 {
    return dual4(1, c);
  }
  origin(): Vector4 {
    return new Vector4(1, 0, 0, 0);
  }
  normalize(p: Vector4): Vector4 {
    return p.clone().multiplyScalar(1 / Math.sqrt(this.form(p, p)));
  }
  distance(p: Vector4, q: Vector4): number {
    return Math.acos(clamp(this.form(p, q), -1, 1));
  }
  exp(p: Vector4, v: Vector4, t = 1): Vector4 {
    const len = Math.sqrt(Math.max(0, this.form(v, v)));
    if (len * Math.abs(t) < 1e-15) return p.clone();
    return p.clone().multiplyScalar(Math.cos(t * len)).addScaledVector(v, Math.sin(t * len) / len);
  }
  log(p: Vector4, q: Vector4): Vector4 {
    const d = this.distance(p, q);
    const w = q.clone().addScaledVector(p, -Math.cos(d));
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
    return reflection4(1, wall.covector);
  }
}
