import { normSq, vec3, vec4, type Vec3 } from '@/math/vec';
import { identity, matScale, type Mat3 } from '@/math/mat';
import type { Point2, Point3 } from '@/geometry/types';
import type { Domain, Model } from './types';

/**
 * Stereographic projection of Sⁿ: u = spatial/(1 + p₀), from the antipode
 * (−1, 0, …) of the origin onto Rⁿ. Conformal with exact scale (1 + |u|²)/2;
 * sees everything except the antipode itself. The κ = +1 mirror of the
 * Poincaré model — same formula, opposite sign in the conformal factor.
 */

export class Stereographic2 implements Model<Point2> {
  readonly name = 'stereographic';
  readonly kind = 'spherical' as const;
  readonly renderDim = 2 as const;
  readonly domain: Domain = { kind: 'plane' };
  readonly straight = false;

  project(p: Point2): Vec3 {
    const f = 1 / (1 + p[0]);
    return vec3(f * p[1], f * p[2], 0);
  }
  unproject(x: Vec3): Point2 {
    const r2 = x[0] * x[0] + x[1] * x[1];
    const f = 1 / (1 + r2);
    return vec3(f * (1 - r2), 2 * f * x[0], 2 * f * x[1]);
  }
  scaleAt(p: Point2): number {
    return (1 + normSq(this.project(p))) / 2;
  }
  jacobianAt(p: Point2): Mat3 {
    return matScale(identity(3), this.scaleAt(p));
  }
}

export class Stereographic3 implements Model<Point3> {
  readonly name = 'stereographic';
  readonly kind = 'spherical' as const;
  readonly renderDim = 3 as const;
  readonly domain: Domain = { kind: 'space' };
  readonly straight = false;

  project(p: Point3): Vec3 {
    const f = 1 / (1 + p[0]);
    return vec3(f * p[1], f * p[2], f * p[3]);
  }
  unproject(x: Vec3): Point3 {
    const r2 = normSq(x);
    const f = 1 / (1 + r2);
    return vec4(f * (1 - r2), 2 * f * x[0], 2 * f * x[1], 2 * f * x[2]);
  }
  scaleAt(p: Point3): number {
    return (1 + normSq(this.project(p))) / 2;
  }
  jacobianAt(p: Point3): Mat3 {
    return matScale(identity(3), this.scaleAt(p));
  }
}
