import { describe, expect, it } from 'vitest';
import type { GeometryKind } from '@/geometry/types';
import { classifyPolygon, validatePolygon, type RealizationSpec } from '@/coxeter/spec';
import { solvePolygon } from '@/coxeter/solve';

/** Spec for the polygon with walls 0…n−1 in index order and orders[k] between walls k, k+1. */
function polygonSpec(geometry: GeometryKind, orders: number[]): RealizationSpec {
  const n = orders.length;
  return {
    geometry,
    dim: 2,
    combinatorics: { kind: 'polygon', cyclicOrder: Array.from({ length: n }, (_, k) => k) },
    decorations: orders.map((m, k) => ({ walls: [k, (k + 1) % n] as [number, number], order: m })),
  };
}

describe('spec validation & classification', () => {
  it.each([
    [[2, 3, 5], 'spherical'],
    [[2, 2, 2], 'spherical'],
    [[2, 3, 6], 'euclidean'],
    [[3, 3, 3], 'euclidean'],
    [[2, 4, 4], 'euclidean'],
    [[2, 3, 7], 'hyperbolic'],
    [[2, 2, 2, 2], 'euclidean'], // the square
    [[2, 2, 2, 2, 2], 'hyperbolic'], // right-angled pentagon
    [[3, 3, 3, 3], 'hyperbolic'],
  ] as [number[], GeometryKind][])('classifies %j as %s (exactly)', (orders, kind) => {
    expect(classifyPolygon(orders)).toBe(kind);
    expect(() => validatePolygon(polygonSpec(kind, orders))).not.toThrow();
  });

  it('rejects a declared geometry that disagrees with the classification', () => {
    expect(() => validatePolygon(polygonSpec('euclidean', [2, 3, 5]))).toThrow(/mismatch.*spherical/s);
    expect(() => validatePolygon(polygonSpec('spherical', [2, 3, 7]))).toThrow(/mismatch.*hyperbolic/s);
  });

  it('rejects digons, bad permutations, and bad orders', () => {
    expect(() => validatePolygon(polygonSpec('spherical', [2, 2]))).toThrow(/at least 3/);

    const bad = polygonSpec('hyperbolic', [2, 2, 2, 2, 2]);
    bad.combinatorics.cyclicOrder = [0, 1, 2, 3, 3];
    expect(() => validatePolygon(bad)).toThrow(/permutation/);

    expect(() => validatePolygon(polygonSpec('hyperbolic', [2, 2, 2, 2, 1]))).toThrow(/integer ≥ 2/);
    expect(() => validatePolygon(polygonSpec('hyperbolic', [2, 2, 2, 2, Infinity]))).toThrow(/non-compact|deferred/);
  });

  it('rejects missing adjacent decorations and decorated non-adjacent pairs', () => {
    const missing = polygonSpec('hyperbolic', [2, 3, 7]);
    missing.decorations.pop();
    expect(() => validatePolygon(missing)).toThrow(/no decoration/);

    const chord = polygonSpec('hyperbolic', [2, 2, 2, 2, 2]);
    chord.decorations.push({ walls: [0, 2], order: 3 }); // a chord — walls 0,2 do not meet
    expect(() => validatePolygon(chord)).toThrow(/not cyclically adjacent/);
  });
});

describe('the inscribed-circle solver', () => {
  it.each([
    ['spherical', [2, 3, 5]],
    ['spherical', [2, 2, 2]],
    ['euclidean', [2, 3, 6]],
    ['euclidean', [3, 3, 3]],
    ['euclidean', [2, 4, 4]],
    ['hyperbolic', [2, 3, 7]],
    ['hyperbolic', [2, 4, 5]],
  ] as [GeometryKind, number[]][])('%s triangle %j: verified chamber with exact angles', (kind, orders) => {
    const r = solvePolygon(polygonSpec(kind, orders));
    expect(r.chamber.vertices).toHaveLength(3);
    expect(r.chamber.edges).toHaveLength(3);
    expect(r.diagnostics.maxGramError).toBeLessThan(1e-9);
    // decorated pairs: ⟨n_i, n_j⟩ = −cos(π/m)
    for (const { walls: [a, b], order } of r.spec.decorations) {
      expect(r.gram[a][b]).toBeCloseTo(-Math.cos(Math.PI / order), 9);
    }
    // the origin is the incenter: equidistant from all walls, strictly inside
    const sides = r.walls.map((w) => w.side(r.geom.origin()));
    for (const s of sides) {
      expect(s).toBeLessThan(0);
      expect(s).toBeCloseTo(sides[0], 12);
    }
  });

  it('S² (2,2,2): the octant, with mutually orthogonal walls and vertices', () => {
    const r = solvePolygon(polygonSpec('spherical', [2, 2, 2]));
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++) expect(r.gram[i][j]).toBeCloseTo(0, 9);
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++)
        expect(r.geom.form(r.chamber.vertices[i], r.chamber.vertices[j])).toBeCloseTo(0, 7);
    // incircle radius of the octant: cos r = √(2/3)
    expect(r.inradius).toBeCloseTo(Math.acos(Math.sqrt(2 / 3)), 9);
  });

  it('E²: the square with incircle radius 1 — vertices (±1, ±1), sides 2', () => {
    const r = solvePolygon(polygonSpec('euclidean', [2, 2, 2, 2]));
    expect(r.chamber.vertices).toHaveLength(4);
    for (const v of r.chamber.vertices) {
      expect(Math.abs(v[1])).toBeCloseTo(1, 9);
      expect(Math.abs(v[2])).toBeCloseTo(1, 9);
    }
    for (const [a, b] of r.chamber.edges) {
      expect(r.geom.distance(r.chamber.vertices[a], r.chamber.vertices[b])).toBeCloseTo(2, 9);
    }
    // opposite walls are parallel: G = −1
    const parallelPairs = r.gram.flatMap((row, i) => row.filter((g, j) => j > i && Math.abs(g + 1) < 1e-9));
    expect(parallelPairs).toHaveLength(2);
  });

  it('E² (3,3,3): the equilateral triangle with incircle radius 1 has side 2√3', () => {
    const r = solvePolygon(polygonSpec('euclidean', [3, 3, 3]));
    for (const [a, b] of r.chamber.edges) {
      expect(r.geom.distance(r.chamber.vertices[a], r.chamber.vertices[b])).toBeCloseTo(2 * Math.sqrt(3), 9);
    }
  });

  it('H²: the right-angled pentagon is regular with cosh(ℓ/2) = √2·cos(π/5)', () => {
    const r = solvePolygon(polygonSpec('hyperbolic', [2, 2, 2, 2, 2]));
    expect(r.chamber.vertices).toHaveLength(5);
    const expected = 2 * Math.acosh(Math.sqrt(2) * Math.cos(Math.PI / 5));
    for (const [a, b] of r.chamber.edges) {
      expect(r.geom.distance(r.chamber.vertices[a], r.chamber.vertices[b])).toBeCloseTo(expected, 9);
    }
    // non-adjacent walls are ultraparallel: ⟨n_i, n_j⟩ < −1
    for (let i = 0; i < 5; i++)
      for (let j = i + 1; j < 5; j++) {
        const adjacent = (j - i) % 5 === 1 || (j - i) % 5 === 4;
        if (!adjacent) expect(r.gram[i][j]).toBeLessThan(-1);
      }
  });

  it('respects a shuffled cyclic order (generator indexing is load-bearing)', () => {
    // The square, but with walls listed in the cyclic order 2, 0, 3, 1.
    const spec: RealizationSpec = {
      geometry: 'euclidean',
      dim: 2,
      combinatorics: { kind: 'polygon', cyclicOrder: [2, 0, 3, 1] },
      decorations: [
        { walls: [2, 0], order: 2 },
        { walls: [0, 3], order: 2 },
        { walls: [3, 1], order: 2 },
        { walls: [1, 2], order: 2 },
      ],
    };
    const r = solvePolygon(spec);
    expect(r.chamber.vertices).toHaveLength(4);
    // cyclically OPPOSITE pairs — (2,3) and (0,1) — are the parallel ones
    expect(r.gram[2][3]).toBeCloseTo(-1, 9);
    expect(r.gram[0][1]).toBeCloseTo(-1, 9);
    // adjacent pairs are orthogonal
    expect(r.gram[2][0]).toBeCloseTo(0, 9);
    expect(r.gram[0][3]).toBeCloseTo(0, 9);
  });
});
