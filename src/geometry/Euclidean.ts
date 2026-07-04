import { Matrix3, Matrix4, Vector3, Vector4 } from 'three';
import type { Geometry } from './types';
import type { Hyperplane } from './Hyperplane';
import { dual3, dual4, form3, form4, reflection3, reflection4 } from './ambient';

/**
 * Euclidean space Eⁿ (κ = 0): the affine slice p₀ = 1 in R^{n+1} with the
 * degenerate form J = diag(0, 1, …, 1). Isometries are the homogeneous
 * matrices [[1,0],[t,R]] — plain Matrix3/Matrix4 like the other geometries,
 * which is the point: all group machinery stays generic. Tangent vectors
 * have vanishing coordinate 0, so the degenerate form is *exact* on them
 * (no limit-taking anywhere; this cell is ordinary affine arithmetic).
 */

export class Euclidean2 implements Geometry<Vector3, Matrix3> {
  readonly kind = 'euclidean' as const;
  readonly dim = 2 as const;

  form(a: Vector3, b: Vector3): number {
    return form3(0, a, b);
  }
  pairing(c: Vector3, p: Vector3): number {
    return c.dot(p);
  }
  dual(c: Vector3): Vector3 {
    return dual3(0, c);
  }
  origin(): Vector3 {
    return new Vector3(1, 0, 0);
  }
  normalize(p: Vector3): Vector3 {
    return p.clone().multiplyScalar(1 / p.x);
  }
  distance(p: Vector3, q: Vector3): number {
    const w = q.clone().addScaledVector(p, -1);
    return Math.sqrt(this.form(w, w));
  }
  exp(p: Vector3, v: Vector3, t = 1): Vector3 {
    return p.clone().addScaledVector(v, t);
  }
  log(p: Vector3, q: Vector3): Vector3 {
    return q.clone().addScaledVector(p, -1);
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
    return reflection3(0, wall.covector);
  }
}

export class Euclidean3 implements Geometry<Vector4, Matrix4> {
  readonly kind = 'euclidean' as const;
  readonly dim = 3 as const;

  form(a: Vector4, b: Vector4): number {
    return form4(0, a, b);
  }
  pairing(c: Vector4, p: Vector4): number {
    return c.dot(p);
  }
  dual(c: Vector4): Vector4 {
    return dual4(0, c);
  }
  origin(): Vector4 {
    return new Vector4(1, 0, 0, 0);
  }
  normalize(p: Vector4): Vector4 {
    return p.clone().multiplyScalar(1 / p.x);
  }
  distance(p: Vector4, q: Vector4): number {
    const w = q.clone().addScaledVector(p, -1);
    return Math.sqrt(this.form(w, w));
  }
  exp(p: Vector4, v: Vector4, t = 1): Vector4 {
    return p.clone().addScaledVector(v, t);
  }
  log(p: Vector4, q: Vector4): Vector4 {
    return q.clone().addScaledVector(p, -1);
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
    return reflection4(0, wall.covector);
  }
}
