import { Matrix3, Vector3, Vector4 } from 'three';
import type { Domain, Model } from './types';

/**
 * The identity charts of Eⁿ: drop the homogeneous coordinate, u = spatial.
 * Simultaneously the straight chart AND conformal (scale 1) — Euclidean
 * space is its own picture.
 */

export class Cartesian2 implements Model<Vector3> {
  readonly name = 'cartesian';
  readonly kind = 'euclidean' as const;
  readonly renderDim = 2 as const;
  readonly domain: Domain = { kind: 'plane' };
  readonly straight = true;

  project(p: Vector3): Vector3 {
    return new Vector3(p.y / p.x, p.z / p.x, 0);
  }
  unproject(x: Vector3): Vector3 {
    return new Vector3(1, x.x, x.y);
  }
  scaleAt(): number {
    return 1;
  }
  jacobianAt(): Matrix3 {
    return new Matrix3();
  }
}

export class Cartesian3 implements Model<Vector4> {
  readonly name = 'cartesian';
  readonly kind = 'euclidean' as const;
  readonly renderDim = 3 as const;
  readonly domain: Domain = { kind: 'space' };
  readonly straight = true;

  project(p: Vector4): Vector3 {
    return new Vector3(p.y / p.x, p.z / p.x, p.w / p.x);
  }
  unproject(x: Vector3): Vector4 {
    return new Vector4(1, x.x, x.y, x.z);
  }
  scaleAt(): number {
    return 1;
  }
  jacobianAt(): Matrix3 {
    return new Matrix3();
  }
}
