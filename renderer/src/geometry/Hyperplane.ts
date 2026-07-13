import { scale, type Covec, type Vec } from '@/math/vec';
import type { Geometry } from './types';

/**
 * A wall (mirror hyperplane): fundamentally a unit covector c (cᵀJc = 1),
 * with its pole Jc cached. The wall is { p : c·p = 0 }, the half-space is
 * { p : c·p ≤ 0 }, and the reflection in it is geometry.reflection(wall)
 * = I − 2 (Jc) cᵀ. See the folder README for why the covector — not the
 * pole — is the fundamental datum (the Euclidean pole loses the affine
 * offset). The ambient dimension is the array length; one class serves both.
 */
export class Hyperplane {
  /** Unit covector: cᵀJc = 1. */
  readonly covector: Covec;
  /** The pole Jc — an ambient vector, NOT generally a point of the space. */
  readonly pole: Vec;

  private constructor(covector: Covec, pole: Vec) {
    this.covector = covector;
    this.pole = pole;
  }

  /**
   * Build a wall from a covector, normalizing so cᵀJc = 1. Throws if the
   * covector is not spacelike-dual (cᵀJc ≤ 0) — such a c does not cut the
   * point locus in a totally-geodesic hypersurface.
   */
  static fromCovector<P extends Vec, I>(geom: Geometry<P, I>, c: Covec): Hyperplane {
    const norm2 = geom.pairing(c, geom.dual(c)); // cᵀJc
    if (!(norm2 > 1e-24)) {
      throw new Error(`Hyperplane: covector must satisfy cᵀJc > 0 (got ${norm2}); not a wall.`);
    }
    const covector = scale(c, 1 / Math.sqrt(norm2));
    return new Hyperplane(covector, geom.dual(covector));
  }

  /**
   * Build a wall from its pole (unit spacelike normal). Spherical and
   * hyperbolic only: there J² = I so c = Jn. A Euclidean pole (0, a) cannot
   * carry the wall's affine offset — construct from the covector (−d, a)
   * for the wall { a·x = d }.
   */
  static fromPole<P extends Vec, I>(geom: Geometry<P, I>, n: Vec): Hyperplane {
    if (geom.kind === 'euclidean') {
      throw new Error(
        'Hyperplane.fromPole: a Euclidean pole (0, a) loses the affine offset d; ' +
          'build the wall { a·x = d } from its covector (−d, a) via fromCovector.',
      );
    }
    return Hyperplane.fromCovector(geom, geom.dual(n));
  }

  /**
   * The perpendicular bisector of p ≠ q (README): the wall
   * { x : d(x,p) = d(x,q) }, oriented so side(p) < 0. In S/H equidistance is
   * ⟨x,p⟩ = ⟨x,q⟩, giving the covector J(q − p) (with q − p automatically
   * spacelike); in E the degenerate J would kill the affine offset (as
   * always), so the covector (−(|q_s|²−|p_s|²)/2, q_s − p_s) is written
   * directly. Passes through the geodesic midpoint, orthogonal to the
   * geodesic — so reflecting in it SWAPS p and q, the fact the drag
   * machinery composes into translations (render2d V3). Throws (via
   * fromCovector, zero covector) when p = q; antipodal spherical p, q give
   * the polar equator, which is correct.
   */
  static bisector<P extends Vec, I>(geom: Geometry<P, I>, p: P, q: P): Hyperplane {
    const c = new Float64Array(p.length);
    if (geom.kind === 'euclidean') {
      let offset = 0;
      for (let i = 1; i < p.length; i++) {
        c[i] = q[i] - p[i];
        offset += q[i] * q[i] - p[i] * p[i];
      }
      c[0] = -offset / 2;
    } else {
      const kappa = geom.kind === 'spherical' ? 1 : -1;
      c[0] = kappa * (q[0] - p[0]);
      for (let i = 1; i < p.length; i++) c[i] = q[i] - p[i];
    }
    return Hyperplane.fromCovector(geom, c);
  }

  /**
   * The signed side of p: the plain pairing c·p. Zero on the wall, negative
   * in the wall's half-space { c·p ≤ 0 }.
   */
  side(p: Vec): number {
    let s = 0;
    for (let i = 0; i < this.covector.length; i++) s += this.covector[i] * p[i];
    return s;
  }

  /**
   * Distance from p to the wall: the side value of a unit covector is the
   * κ-sine of the signed distance (README), inverted by one κ-trig row.
   */
  distanceTo<P extends Vec, I>(geom: Geometry<P, I>, p: P): number {
    const s = Math.abs(this.side(p));
    switch (geom.kind) {
      case 'spherical':
        return Math.asin(Math.min(1, s));
      case 'euclidean':
        return s;
      case 'hyperbolic':
        return Math.asinh(s);
    }
  }

  /**
   * The perpendicular foot of p on the wall: normalize(p − (c·p)·Jc) — the
   * nearest point of the wall to p, landing in the wall { c·x = 0 } in all
   * three geometries (κ enters only through the pole Jc). Degenerate only on
   * S when p is the wall's own pole (the whole wall is then equidistant);
   * such callers retry with another point. The anchor for wall-perpendicular
   * constructions: parabolic fixed points, Cayley/Wythoff feet, wall lines.
   */
  foot<P extends Vec, I>(geom: Geometry<P, I>, p: P): P {
    const s = this.side(p);
    const v = new Float64Array(p.length);
    for (let i = 0; i < p.length; i++) v[i] = p[i] - s * this.pole[i];
    return geom.normalize(v);
  }
}
