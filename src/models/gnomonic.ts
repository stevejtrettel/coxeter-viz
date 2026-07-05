import { normSq, vec3, vec4, type Vec3 } from '@/math/vec';
import type { Mat3 } from '@/math/mat';
import type { Point2, Point3 } from '@/geometry/types';
import type { Domain, Model } from './types';
import { radialJacobian } from './radial';

/**
 * The gnomonic (central) projection of Sⁿ: u = spatial/p₀, from the center of
 * the sphere onto the tangent space at the origin. THE straight chart for
 * spherical geometry — great circles are straight lines — but it sees only
 * the open hemisphere p₀ > 0 (the equator is at infinity; the far hemisphere
 * projects onto the same plane). Jacobian: radial 1+r², transverse √(1+r²).
 */

export class Gnomonic2 implements Model<Point2> {
  readonly name = 'gnomonic';
  readonly kind = 'spherical' as const;
  readonly renderDim = 2 as const;
  readonly domain: Domain = { kind: 'plane' };
  readonly straight = true;

  project(p: Point2): Vec3 {
    return vec3(p[1] / p[0], p[2] / p[0], 0);
  }
  unproject(x: Vec3): Point2 {
    const f = 1 / Math.sqrt(1 + x[0] * x[0] + x[1] * x[1]);
    return vec3(f, f * x[0], f * x[1]);
  }
  scaleAt(p: Point2): number {
    return Math.sqrt(1 + normSq(this.project(p)));
  }
  jacobianAt(p: Point2): Mat3 {
    const u = this.project(p);
    const r2 = normSq(u);
    return radialJacobian(u, 1 + r2, Math.sqrt(1 + r2));
  }
}

export class Gnomonic3 implements Model<Point3> {
  readonly name = 'gnomonic';
  readonly kind = 'spherical' as const;
  readonly renderDim = 3 as const;
  readonly domain: Domain = { kind: 'space' };
  readonly straight = true;

  project(p: Point3): Vec3 {
    return vec3(p[1] / p[0], p[2] / p[0], p[3] / p[0]);
  }
  unproject(x: Vec3): Point3 {
    const f = 1 / Math.sqrt(1 + normSq(x));
    return vec4(f, f * x[0], f * x[1], f * x[2]);
  }
  scaleAt(p: Point3): number {
    return Math.sqrt(1 + normSq(this.project(p)));
  }
  jacobianAt(p: Point3): Mat3 {
    const u = this.project(p);
    const r2 = normSq(u);
    return radialJacobian(u, 1 + r2, Math.sqrt(1 + r2));
  }
}
