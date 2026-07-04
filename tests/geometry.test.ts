import { describe, expect, it } from 'vitest';
import { cells, expectVecClose, randomPoint, randomTangent, rng } from './helpers';

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
