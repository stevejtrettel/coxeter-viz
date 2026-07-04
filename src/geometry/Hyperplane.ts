import type { Geometry, Vec } from './types';

/**
 * A wall (mirror hyperplane): fundamentally a unit covector c (cᵀJc = 1),
 * with its pole Jc cached. The wall is { p : c·p = 0 }, the half-space is
 * { p : c·p ≤ 0 }, and the reflection in it is geometry.reflection(wall)
 * = I − 2 (Jc) cᵀ. See the folder README for why the covector — not the
 * pole — is the fundamental datum (the Euclidean pole loses the affine
 * offset).
 */
export class Hyperplane<P extends Vec<P>> {
  /** Unit covector: cᵀJc = 1. */
  readonly covector: P;
  /** The pole Jc. */
  readonly pole: P;
  private readonly pair: (c: P, p: P) => number;

  private constructor(covector: P, pole: P, pair: (c: P, p: P) => number) {
    this.covector = covector;
    this.pole = pole;
    this.pair = pair;
  }

  /**
   * Build a wall from a covector, normalizing so cᵀJc = 1. Throws if the
   * covector is not spacelike-dual (cᵀJc ≤ 0) — such a c does not cut the
   * point locus in a totally-geodesic hypersurface.
   */
  static fromCovector<P extends Vec<P>, I>(geom: Geometry<P, I>, c: P): Hyperplane<P> {
    const norm2 = geom.pairing(c, geom.dual(c)); // cᵀJc
    if (!(norm2 > 1e-24)) {
      throw new Error(`Hyperplane: covector must satisfy cᵀJc > 0 (got ${norm2}); not a wall.`);
    }
    const covector = c.clone().multiplyScalar(1 / Math.sqrt(norm2));
    return new Hyperplane(covector, geom.dual(covector), (a, p) => geom.pairing(a, p));
  }

  /**
   * Build a wall from its pole (unit spacelike normal). Spherical and
   * hyperbolic only: there J² = I so c = Jn. A Euclidean pole (0, a) cannot
   * carry the wall's affine offset — construct from the covector (−d, a)
   * for the wall { a·x = d }.
   */
  static fromPole<P extends Vec<P>, I>(geom: Geometry<P, I>, n: P): Hyperplane<P> {
    if (geom.kind === 'euclidean') {
      throw new Error(
        'Hyperplane.fromPole: a Euclidean pole (0, a) loses the affine offset d; ' +
          'build the wall { a·x = d } from its covector (−d, a) via fromCovector.',
      );
    }
    return Hyperplane.fromCovector(geom, geom.dual(n));
  }

  /**
   * The signed side of p: the plain pairing c·p. Zero on the wall, negative
   * in the wall's half-space { c·p ≤ 0 }.
   */
  side(p: P): number {
    return this.pair(this.covector, p);
  }
}
