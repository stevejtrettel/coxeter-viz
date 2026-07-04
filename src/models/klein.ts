import { Matrix3, Vector3, Vector4 } from 'three';
import type { Domain, Model } from './types';
import { radialJacobian } from './radial';

/**
 * The Klein (projective) models of Hⁿ: central projection u = spatial/p₀
 * onto the unit disk/ball. THE straight chart for hyperbolic geometry —
 * geodesics are straight chords — at the price of non-conformality
 * (jacobian: radial 1−r², transverse √(1−r²); see folder README).
 */

export class Klein2 implements Model<Vector3> {
  readonly name = 'klein-disk';
  readonly kind = 'hyperbolic' as const;
  readonly renderDim = 2 as const;
  readonly domain: Domain = { kind: 'disk', radius: 1 };
  readonly straight = true;

  project(p: Vector3): Vector3 {
    return new Vector3(p.y / p.x, p.z / p.x, 0);
  }
  unproject(x: Vector3): Vector3 {
    const f = 1 / Math.sqrt(1 - x.x * x.x - x.y * x.y);
    return new Vector3(f, f * x.x, f * x.y);
  }
  scaleAt(p: Vector3): number {
    const r2 = this.project(p).lengthSq();
    return Math.sqrt(1 - r2);
  }
  jacobianAt(p: Vector3): Matrix3 {
    const u = this.project(p);
    const r2 = u.lengthSq();
    return radialJacobian(u, 1 - r2, Math.sqrt(1 - r2));
  }
}

export class Klein3 implements Model<Vector4> {
  readonly name = 'klein-ball';
  readonly kind = 'hyperbolic' as const;
  readonly renderDim = 3 as const;
  readonly domain: Domain = { kind: 'ball', radius: 1 };
  readonly straight = true;

  project(p: Vector4): Vector3 {
    return new Vector3(p.y / p.x, p.z / p.x, p.w / p.x);
  }
  unproject(x: Vector3): Vector4 {
    const f = 1 / Math.sqrt(1 - x.lengthSq());
    return new Vector4(f, f * x.x, f * x.y, f * x.z);
  }
  scaleAt(p: Vector4): number {
    return Math.sqrt(1 - this.project(p).lengthSq());
  }
  jacobianAt(p: Vector4): Matrix3 {
    const u = this.project(p);
    const r2 = u.lengthSq();
    return radialJacobian(u, 1 - r2, Math.sqrt(1 - r2));
  }
}
