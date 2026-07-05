import { vec3, type Vec3 } from '@/math/vec';
import { identity, type Mat3 } from '@/math/mat';
import type { Point2 } from '@/geometry/types';
import type { Domain, Model } from './types';

/**
 * S² drawn as the round unit sphere in R³ — the honest, isometric picture
 * (renderDim 3). The only work is a coordinate shuffle: ambient (p₀, x, y)
 * renders as (x, y, p₀), so the origin (1,0,0) sits at the north pole
 * (0,0,1). Isometric ⇒ scale 1, identity jacobian.
 */

export class Globe2 implements Model<Point2> {
  readonly name = 'globe';
  readonly kind = 'spherical' as const;
  readonly renderDim = 3 as const;
  readonly domain: Domain = { kind: 'sphere', radius: 1 };
  readonly straight = false;

  project(p: Point2): Vec3 {
    return vec3(p[1], p[2], p[0]);
  }
  unproject(x: Vec3): Point2 {
    return vec3(x[2], x[0], x[1]);
  }
  scaleAt(): number {
    return 1;
  }
  jacobianAt(): Mat3 {
    return identity(3);
  }
}
