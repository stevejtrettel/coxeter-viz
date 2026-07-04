import { Matrix3, Vector3 } from 'three';
import type { Domain, Model } from './types';

/**
 * S² drawn as the round unit sphere in R³ — the honest, isometric picture
 * (renderDim 3). The only work is a coordinate shuffle: ambient (p₀, x, y)
 * renders as (x, y, p₀), so the origin (1,0,0) sits at the north pole
 * (0,0,1). Isometric ⇒ scale 1, identity jacobian.
 */

export class Globe2 implements Model<Vector3> {
  readonly name = 'globe';
  readonly kind = 'spherical' as const;
  readonly renderDim = 3 as const;
  readonly domain: Domain = { kind: 'sphere', radius: 1 };
  readonly straight = false;

  project(p: Vector3): Vector3 {
    return new Vector3(p.y, p.z, p.x);
  }
  unproject(x: Vector3): Vector3 {
    return new Vector3(x.z, x.x, x.y);
  }
  scaleAt(): number {
    return 1;
  }
  jacobianAt(): Matrix3 {
    return new Matrix3();
  }
}
