import { normSq, vec3, vec4, type Vec3 } from '@/math/vec';
import { identity, matScale, type Mat3 } from '@/math/mat';
import type { Point2, Point3 } from '@/geometry/types';
import type { Domain, Model } from './types';

/**
 * The Poincaré (conformal) models of Hⁿ: u = spatial/(1 + p₀), stereographic
 * projection from the mirror image (−1, 0, …) of the origin onto the unit
 * disk/ball. Conformal with exact scale (1 − |u|²)/2 — angles are true,
 * geodesics are circular arcs meeting the boundary orthogonally.
 */

export class Poincare2 implements Model<Point2> {
  readonly name = 'poincare-disk';
  readonly kind = 'hyperbolic' as const;
  readonly renderDim = 2 as const;
  readonly domain: Domain = { kind: 'disk', radius: 1 };
  readonly straight = false;

  project(p: Point2): Vec3 {
    const f = 1 / (1 + p[0]);
    return vec3(f * p[1], f * p[2], 0);
  }
  unproject(x: Vec3): Point2 {
    const r2 = x[0] * x[0] + x[1] * x[1];
    const f = 1 / (1 - r2);
    return vec3(f * (1 + r2), 2 * f * x[0], 2 * f * x[1]);
  }
  scaleAt(p: Point2): number {
    return (1 - normSq(this.project(p))) / 2;
  }
  jacobianAt(p: Point2): Mat3 {
    return matScale(identity(3), this.scaleAt(p));
  }
}

export class Poincare3 implements Model<Point3> {
  readonly name = 'poincare-ball';
  readonly kind = 'hyperbolic' as const;
  readonly renderDim = 3 as const;
  readonly domain: Domain = { kind: 'ball', radius: 1 };
  readonly straight = false;

  project(p: Point3): Vec3 {
    const f = 1 / (1 + p[0]);
    return vec3(f * p[1], f * p[2], f * p[3]);
  }
  unproject(x: Vec3): Point3 {
    const r2 = normSq(x);
    const f = 1 / (1 - r2);
    return vec4(f * (1 + r2), 2 * f * x[0], 2 * f * x[1], 2 * f * x[2]);
  }
  scaleAt(p: Point3): number {
    return (1 - normSq(this.project(p))) / 2;
  }
  jacobianAt(p: Point3): Mat3 {
    return matScale(identity(3), this.scaleAt(p));
  }
}
