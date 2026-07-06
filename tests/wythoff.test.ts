import { describe, expect, it } from 'vitest';
import { vec3 } from '@/math/vec';
import type { GeometryKind } from '@/geometry/types';
import type { RealizationSpec } from '@/coxeter/spec';
import { solvePolygon } from '@/coxeter/solve';
import { groupFromPolygon } from '@/group/CoxeterGroup';
import { matrixKey } from '@/group/orbit';
import { uniformCells, wythoffPoint } from '@/group/wythoff';

/**
 * §5.7 C3 — the Wythoff construction (group README, "Uniform tilings").
 * The seed's ring conditions are pinned against the walls' own side values
 * in all three geometries, and the tiling against hand-checkable spherical
 * truth: the omnitruncated (2,3,5) and the dodecahedron.
 */

function triangle(geometry: GeometryKind, orders: number[]) {
  const spec: RealizationSpec = {
    geometry,
    dim: 2,
    combinatorics: { kind: 'polygon', cyclicOrder: [0, 1, 2] },
    decorations: orders.map((m, k) => ({ walls: [k, (k + 1) % 3] as [number, number], order: m })),
  };
  const poly = solvePolygon(spec);
  return { poly, group: groupFromPolygon(poly) };
}

const MILESTONE_1: [GeometryKind, number[]][] = [
  ['hyperbolic', [2, 3, 7]],
  ['euclidean', [2, 4, 4]],
  ['spherical', [2, 3, 5]],
];

describe('wythoffPoint', () => {
  it('ring conditions: ON unringed mirrors, equal depth inside ringed ones', () => {
    for (const [geometry, orders] of MILESTONE_1) {
      const { poly } = triangle(geometry, orders);
      for (const rings of [
        [true, true, true],
        [true, false, false],
        [false, true, true],
      ]) {
        const p = wythoffPoint(poly, rings);
        const sides = poly.walls.map((w) => w.side(p));
        const ringedDepths = sides.filter((_, i) => rings[i]);
        for (const [i, s] of sides.entries()) {
          if (rings[i]) expect(s).toBeLessThan(0);
          else expect(Math.abs(s)).toBeLessThan(1e-9);
        }
        // Equal ringed depths (uniformity survives normalization as a ratio).
        for (const s of ringedDepths) expect(s).toBeCloseTo(ringedDepths[0], 9);
      }
    }
  });

  it('refuses non-simplex chambers and the all-unringed pattern', () => {
    const { poly } = triangle('spherical', [2, 3, 5]);
    expect(() => wythoffPoint(poly, [false, false, false])).toThrow(/ring/);
    const square = solvePolygon({
      geometry: 'euclidean',
      dim: 2,
      combinatorics: { kind: 'polygon', cyclicOrder: [0, 1, 2, 3] },
      decorations: [0, 1, 2, 3].map((k) => ({ walls: [k, (k + 1) % 4] as [number, number], order: 2 })),
    });
    expect(() => wythoffPoint(square, [true, true, true, true])).toThrow(/simplex/);
  });
});

describe('uniformCells on the sphere (exact truth)', () => {
  it('the omnitruncated (2,3,5): 30 squares + 20 hexagons + 12 decagons, Euler 2', () => {
    const { poly, group } = triangle('spherical', [2, 3, 5]);
    const cells = uniformCells(group, poly, [true, true, true], Math.PI);
    expect(cells).toHaveLength(62);
    // decorations: (0,1) order 2 → 4-gons, (1,2) order 3 → 6-gons, (2,0) order 5 → 10-gons.
    const byType = [0, 1, 2].map((t) => cells.filter((c) => c.type === t));
    expect(byType.map((c) => c.length)).toEqual([30, 20, 12]);
    expect(byType.map((c) => c[0].polytope.vertices.length)).toEqual([4, 6, 10]);
    // Euler characteristic of the sphere from the deduplicated skeleton.
    const verts = new Set<string>();
    const edges = new Set<string>();
    for (const c of cells) {
      const v = c.polytope.vertices;
      for (let k = 0; k < v.length; k++) {
        verts.add(matrixKey(v[k]));
        const w = v[(k + 1) % v.length];
        edges.add(
          matrixKey(
            group.geom.normalize(vec3(v[k][0] + w[0], v[k][1] + w[1], v[k][2] + w[2])),
          ),
        );
      }
    }
    expect(verts.size).toBe(120); // one vertex per group element
    expect(edges.size).toBe(180);
    expect(verts.size - edges.size + cells.length).toBe(2);
  });

  it('rings (1,0,0) on (2,3,5) collapse to the dodecahedron: 12 pentagons', () => {
    const { poly, group } = triangle('spherical', [2, 3, 5]);
    const cells = uniformCells(group, poly, [true, false, false], Math.PI);
    expect(cells).toHaveLength(12);
    for (const c of cells) {
      expect(c.type).toBe(2); // only the order-5 pair survives
      expect(c.polytope.vertices.length).toBe(5);
    }
  });
});

describe('uniform edge lengths', () => {
  it('every edge of the all-ringed (2,3,7) tiling has one intrinsic length', () => {
    const { poly, group } = triangle('hyperbolic', [2, 3, 7]);
    const cells = uniformCells(group, poly, [true, true, true], 1.5);
    expect(cells.length).toBeGreaterThan(3);
    const lengths: number[] = [];
    for (const c of cells) {
      const v = c.polytope.vertices;
      for (let k = 0; k < v.length; k++) {
        lengths.push(group.geom.distance(v[k], v[(k + 1) % v.length]));
      }
    }
    for (const L of lengths) expect(L).toBeCloseTo(lengths[0], 9);
  });
});
