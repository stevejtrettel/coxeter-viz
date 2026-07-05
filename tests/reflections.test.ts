import { describe, expect, it } from 'vitest';
import { add, vec3 } from '@/math/vec';
import { Hyperplane } from '@/geometry/Hyperplane';
import { Euclidean2 } from '@/geometry/Euclidean';
import { cells, expectVecClose, matrixDiff, randomPoint, rng, type Cell } from './helpers';

/** A generic test wall per cell (not through the origin, nothing axis-aligned). */
function sampleWall(cell: Cell): Hyperplane {
  const { geom, vec, dim } = cell;
  // covector components chosen so cᵀJc > 0 in every geometry
  const c = dim === 2 ? vec(0.3, 1.0, 0.5) : vec(0.3, 1.0, 0.5, -0.4);
  return Hyperplane.fromCovector(geom, c);
}

describe.each(cells)('$name reflections', (cell) => {
  const { geom, comps } = cell;

  it('R² = identity on points', () => {
    const wall = sampleWall(cell);
    const R = geom.reflection(wall);
    const rand = rng(11);
    for (let k = 0; k < 10; k++) {
      const p = randomPoint(cell, rand);
      expectVecClose(comps, geom.apply(R, geom.apply(R, p)), p, 1e-9);
    }
  });

  it('preserves distances (is an isometry) and the point locus', () => {
    // NB: the invariant valid in ALL three geometries is the distance — in E
    // the degenerate form on point positions is not preserved (only tangents
    // and differences are), so a naive form(Rp, Rq) = form(p, q) check would
    // be wrong mathematics there.
    const wall = sampleWall(cell);
    const R = geom.reflection(wall);
    const rand = rng(12);
    for (let k = 0; k < 10; k++) {
      const p = randomPoint(cell, rand);
      const q = randomPoint(cell, rand);
      expect(geom.distance(geom.apply(R, p), geom.apply(R, q))).toBeCloseTo(geom.distance(p, q), 9);
      expectVecClose(comps, geom.normalize(geom.apply(R, p)), geom.apply(R, p), 1e-9);
    }
  });

  it('swaps sides and fixes the wall pointwise', () => {
    const wall = sampleWall(cell);
    const R = geom.reflection(wall);
    const rand = rng(13);
    const p = randomPoint(cell, rand);
    const Rp = geom.apply(R, p);
    expect(wall.side(Rp)).toBeCloseTo(-wall.side(p), 9);

    // the geodesic midpoint of p and Rp lies on the wall and is fixed
    const m = geom.normalize(add(p, Rp));
    expect(wall.side(m)).toBeCloseTo(0, 9);
    expectVecClose(comps, geom.apply(R, m), m, 1e-9);
  });

  it.each([2, 3, 4, 5, 7])('walls at dihedral angle π/%i give (R₁R₂) of exact order', (m) => {
    // two walls through the origin meeting at angle π/m — in EVERY geometry
    const { vec, dim } = cell;
    const a = Math.PI / m;
    const c1 = dim === 2 ? vec(0, 0, 1) : vec(0, 0, 1, 0);
    const c2 = dim === 2 ? vec(0, Math.sin(a), -Math.cos(a)) : vec(0, Math.sin(a), -Math.cos(a), 0);
    const R1 = geom.reflection(Hyperplane.fromCovector(geom, c1));
    const R2 = geom.reflection(Hyperplane.fromCovector(geom, c2));
    const g = geom.compose(R1, R2); // rotation by 2π/m

    let power = geom.identity();
    for (let k = 1; k <= m; k++) {
      power = geom.compose(power, g);
      if (k < m) expect(matrixDiff(power, geom.identity())).toBeGreaterThan(0.1);
    }
    expect(matrixDiff(power, geom.identity())).toBeLessThan(1e-9);
  });
});

describe('Euclidean specifics', () => {
  it('fromPole throws with a mathematical explanation', () => {
    const geom = new Euclidean2();
    expect(() => Hyperplane.fromPole(geom, vec3(0, 1, 0))).toThrow(/affine offset/);
  });

  it('reflection matrices are homogeneous (slice-preserving)', () => {
    const geom = new Euclidean2();
    const cell = cells.find((c) => c.name === 'E2')!;
    const wall = sampleWall(cell);
    const R = geom.reflection(wall);
    // row 0 of R is e₀ᵀ ⇒ row-major entries 0,1,2 are 1,0,0
    expect(R[0]).toBeCloseTo(1, 12);
    expect(R[1]).toBeCloseTo(0, 12);
    expect(R[2]).toBeCloseTo(0, 12);
  });
});
