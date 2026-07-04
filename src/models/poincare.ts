import { Matrix3, Vector3, Vector4 } from 'three';
import type { Domain, Model } from './types';

/**
 * The Poincaré (conformal) models of Hⁿ: u = spatial/(1 + p₀), stereographic
 * projection from the mirror image (−1, 0, …) of the origin onto the unit
 * disk/ball. Conformal with exact scale (1 − |u|²)/2 — angles are true,
 * geodesics are circular arcs meeting the boundary orthogonally.
 */

export class Poincare2 implements Model<Vector3> {
  readonly name = 'poincare-disk';
  readonly kind = 'hyperbolic' as const;
  readonly renderDim = 2 as const;
  readonly domain: Domain = { kind: 'disk', radius: 1 };
  readonly straight = false;

  project(p: Vector3): Vector3 {
    const f = 1 / (1 + p.x);
    return new Vector3(f * p.y, f * p.z, 0);
  }
  unproject(x: Vector3): Vector3 {
    const r2 = x.x * x.x + x.y * x.y;
    const f = 1 / (1 - r2);
    return new Vector3(f * (1 + r2), 2 * f * x.x, 2 * f * x.y);
  }
  scaleAt(p: Vector3): number {
    return (1 - this.project(p).lengthSq()) / 2;
  }
  jacobianAt(p: Vector3): Matrix3 {
    return new Matrix3().multiplyScalar(this.scaleAt(p));
  }
}

export class Poincare3 implements Model<Vector4> {
  readonly name = 'poincare-ball';
  readonly kind = 'hyperbolic' as const;
  readonly renderDim = 3 as const;
  readonly domain: Domain = { kind: 'ball', radius: 1 };
  readonly straight = false;

  project(p: Vector4): Vector3 {
    const f = 1 / (1 + p.x);
    return new Vector3(f * p.y, f * p.z, f * p.w);
  }
  unproject(x: Vector3): Vector4 {
    const r2 = x.lengthSq();
    const f = 1 / (1 - r2);
    return new Vector4(f * (1 + r2), 2 * f * x.x, 2 * f * x.y, 2 * f * x.z);
  }
  scaleAt(p: Vector4): number {
    return (1 - this.project(p).lengthSq()) / 2;
  }
  jacobianAt(p: Vector4): Matrix3 {
    return new Matrix3().multiplyScalar(this.scaleAt(p));
  }
}
