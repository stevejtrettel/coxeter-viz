import { vec3, vec4, type Vec3 } from '@/math/vec';
import { identity, type Mat3 } from '@/math/mat';
import type { Point2, Point3 } from '@/geometry/types';
import type { Domain, Model } from './types';

/**
 * The identity charts of Eⁿ: drop the homogeneous coordinate, u = spatial.
 * Simultaneously the straight chart AND conformal (scale 1) — Euclidean
 * space is its own picture.
 */

export class Cartesian2 implements Model<Point2> {
  readonly name = 'cartesian';
  readonly kind = 'euclidean' as const;
  readonly renderDim = 2 as const;
  readonly domain: Domain = { kind: 'plane' };
  readonly straight = true;

  project(p: Point2): Vec3 {
    return vec3(p[1] / p[0], p[2] / p[0], 0);
  }
  unproject(x: Vec3): Point2 {
    return vec3(1, x[0], x[1]);
  }
  scaleAt(): number {
    return 1;
  }
  jacobianAt(): Mat3 {
    return identity(3);
  }
}

export class Cartesian3 implements Model<Point3> {
  readonly name = 'cartesian';
  readonly kind = 'euclidean' as const;
  readonly renderDim = 3 as const;
  readonly domain: Domain = { kind: 'space' };
  readonly straight = true;

  project(p: Point3): Vec3 {
    return vec3(p[1] / p[0], p[2] / p[0], p[3] / p[0]);
  }
  unproject(x: Vec3): Point3 {
    return vec4(1, x[0], x[1], x[2]);
  }
  scaleAt(): number {
    return 1;
  }
  jacobianAt(): Mat3 {
    return identity(3);
  }
}
