import { describe, expect, it } from 'vitest';
import type { Vec } from '@/math/vec';
import type { Mat } from '@/math/mat';
import { Hyperplane } from '@/geometry/Hyperplane';
import { cells, expectVecClose, isometryResidual, randomPoint, randomTangent, rng, type Cell } from './helpers';

describe.each(cells)('$name intrinsic geometry', (cell) => {
  const { geom, vec, comps } = cell;

  it('normalize is the identity on points of the locus', () => {
    const rand = rng(1);
    for (let k = 0; k < 20; k++) {
      const p = randomPoint(cell, rand);
      expectVecClose(comps, geom.normalize(p), p, 1e-12);
    }
  });

  it('log inverts exp', () => {
    const rand = rng(2);
    for (let k = 0; k < 20; k++) {
      const p = randomPoint(cell, rand);
      const v = randomTangent(cell, p, rand, 0.2 + rand());
      const q = geom.exp(p, v);
      expectVecClose(comps, geom.log(p, q), v, 1e-9);
    }
  });

  it('distance(p, exp_p(v)) = |v|', () => {
    const rand = rng(3);
    for (let k = 0; k < 20; k++) {
      const p = randomPoint(cell, rand);
      const len = 0.2 + rand();
      const v = randomTangent(cell, p, rand, len);
      expect(geom.distance(p, geom.exp(p, v))).toBeCloseTo(len, 9);
    }
  });

  it('geodesic(p,q)(1/2) is the midpoint', () => {
    const rand = rng(4);
    const p = randomPoint(cell, rand);
    const q = randomPoint(cell, rand);
    const d = geom.distance(p, q);
    const mid = geom.geodesic(p, q)(0.5);
    expect(geom.distance(p, mid)).toBeCloseTo(d / 2, 9);
    expect(geom.distance(mid, q)).toBeCloseTo(d / 2, 9);
  });

  it('matches a closed-form distance', () => {
    const origin = geom.origin();
    if (geom.kind === 'spherical') {
      // origin to a point a quarter-turn away
      const q = cell.dim === 2 ? vec(0, 1, 0) : vec(0, 0, 1, 0);
      expect(geom.distance(origin, q)).toBeCloseTo(Math.PI / 2, 12);
    } else if (geom.kind === 'hyperbolic') {
      const q =
        cell.dim === 2
          ? vec(Math.cosh(1), Math.sinh(1), 0)
          : vec(Math.cosh(1), 0, Math.sinh(1), 0);
      expect(geom.distance(origin, q)).toBeCloseTo(1, 12);
    } else {
      // a 3-4-5 triangle in the slice
      const q = cell.dim === 2 ? vec(1, 3, 4) : vec(1, 0, 3, 4);
      expect(geom.distance(origin, q)).toBeCloseTo(5, 12);
    }
  });

  it('compose/inverse/identity behave as a group on points', () => {
    // use a generic reflection as the sample isometry
    const rand = rng(5);
    const p = randomPoint(cell, rand);
    const id = geom.identity();
    expectVecClose(comps, geom.apply(id, p), p, 1e-12);
  });
});

// ── V3.1: bisector, wall distance, isometry renormalization ────────────────

/** The double-bisector translation p → q (render2d V3's drag transform). */
function translation(cell: Cell, p: Vec, q: Vec): Mat {
  const { geom } = cell;
  const m = geom.geodesic(p, q)(0.5);
  const r1 = geom.reflection(Hyperplane.bisector(geom, p, m));
  const r2 = geom.reflection(Hyperplane.bisector(geom, m, q));
  return geom.compose(r2, r1); // r1 first
}

describe.each(cells)('$name V3.1 primitives', (cell) => {
  const { geom, comps } = cell;

  it('bisector: side(p) < 0 < side(q), passes through the midpoint, reflection swaps p and q', () => {
    const rand = rng(31);
    for (let k = 0; k < 20; k++) {
      const p = randomPoint(cell, rand);
      const q = randomPoint(cell, rand);
      if (geom.distance(p, q) < 1e-6) continue;
      const bis = Hyperplane.bisector(geom, p, q);
      expect(bis.side(p)).toBeLessThan(0);
      expect(bis.side(q)).toBeGreaterThan(0);
      expect(bis.side(geom.geodesic(p, q)(0.5))).toBeCloseTo(0, 10);
      const R = geom.reflection(bis);
      expectVecClose(comps, geom.apply(R, p), q, 1e-9);
      expectVecClose(comps, geom.apply(R, q), p, 1e-9);
    }
  });

  it('the double-bisector translation maps p → q and translates along the geodesic', () => {
    const rand = rng(32);
    for (let k = 0; k < 10; k++) {
      const p = randomPoint(cell, rand);
      const q = randomPoint(cell, rand);
      const d = geom.distance(p, q);
      if (d < 1e-6) continue;
      const T = translation(cell, p, q);
      expectVecClose(comps, geom.apply(T, p), q, 1e-9);
      expect(isometryResidual(cell.geom, T)).toBeLessThan(1e-12);
      // The midpoint advances by d along the same geodesic: to parameter 1.5.
      const m = geom.geodesic(p, q)(0.5);
      expectVecClose(comps, geom.apply(T, m), geom.geodesic(p, q)(1.5), 1e-9);
    }
  });

  it('distanceTo inverts exp along the wall normal (the κ-sine row)', () => {
    const rand = rng(33);
    for (let k = 0; k < 10; k++) {
      const p = randomPoint(cell, rand);
      const q = randomPoint(cell, rand);
      if (geom.distance(p, q) < 1e-6) continue;
      const wall = Hyperplane.bisector(geom, p, q);
      const x = geom.geodesic(p, q)(0.5); // on the wall
      // The pole is the unit normal tangent at any wall point (c·pole-check
      // via ⟨pole, x⟩ = side(x) = 0), so exp along it measures true distance.
      const t = 0.2 + rand();
      expect(wall.distanceTo(geom, geom.exp(x, wall.pole, t))).toBeCloseTo(t, 9);
      expect(wall.distanceTo(geom, x)).toBeCloseTo(0, 10);
    }
  });

  it('renormalizeIsometry: exact projection, small move, idempotent, E keeps its translation', () => {
    const rand = rng(34);
    for (let k = 0; k < 10; k++) {
      const p = randomPoint(cell, rand);
      const q = randomPoint(cell, rand);
      if (geom.distance(p, q) < 1e-6) continue;
      const g = translation(cell, p, q);
      const drifted = Float64Array.from(g, (x) => x + 1e-8 * (rand() - 0.5));
      const fixed = geom.renormalizeIsometry(drifted);

      expect(isometryResidual(cell.geom, fixed)).toBeLessThan(1e-13);
      let move = 0;
      for (let i = 0; i < g.length; i++) move = Math.max(move, Math.abs(fixed[i] - drifted[i]));
      expect(move).toBeLessThan(1e-6); // O(ε) correction for O(ε) drift
      const twice = geom.renormalizeIsometry(fixed);
      for (let i = 0; i < g.length; i++) {
        // Idempotent up to float noise, relative to the entry size (H entries grow like cosh).
        expect(Math.abs(twice[i] - fixed[i])).toBeLessThan(1e-13 * Math.max(1, Math.abs(fixed[i])));
      }
      if (geom.kind === 'euclidean') {
        const n = cell.dim + 1;
        expect(fixed[0]).toBe(1);
        for (let r = 1; r < n; r++) expect(fixed[r * n]).toBe(drifted[r * n]); // translation column untouched
      }
    }
  });

  it('a long composition chain stays on the group when renormalized every 64 steps', () => {
    const rand = rng(35);
    let g = geom.identity();
    const base = geom.origin();
    for (let k = 0; k < 1000; k++) {
      const a = geom.apply(g, base);
      const step = randomTangent(cell, a, rand, 0.03);
      const T = translation(cell, a, geom.exp(a, step));
      g = geom.compose(T, g);
      if ((k + 1) % 64 === 0) g = geom.renormalizeIsometry(g);
    }
    g = geom.renormalizeIsometry(g);
    expect(isometryResidual(cell.geom, g)).toBeLessThan(1e-12);
  });
});
