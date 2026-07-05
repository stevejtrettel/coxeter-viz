import { describe, expect, it } from 'vitest';
import { matMul, type Mat } from '@/math/mat';
import type { GeometryKind } from '@/geometry/types';
import type { RealizationSpec } from '@/coxeter/spec';
import { solvePolygon } from '@/coxeter/solve';
import { matrixKey, orbit, type GroupOps } from '@/group/orbit';
import { groupFromPolygon, wordId } from '@/group/CoxeterGroup';

/**
 * G1 — the generic orbit engine. The Coxeter-specific pins (relations,
 * spherical exhaustion against known orders, dedup honesty on real walls)
 * arrive with the CoxeterGroup class in G2; here the engine itself is pinned
 * on groups whose answers are known by hand.
 */

/**
 * The free monoid on "a","b" written multiplicatively: compose(g,h) = g·h is
 * the string g+h (h applied first). No dedup ever fires (all strings differ),
 * so BFS structure is fully visible.
 */
const freeOps: GroupOps<string> = {
  identity: () => '',
  compose: (g, h) => g + h,
  key: (g) => g,
};

/** 2×2 reflection across the line at angle θ in E². */
function mirror(theta: number): Mat {
  const c = Math.cos(2 * theta);
  const s = Math.sin(2 * theta);
  return Float64Array.from([c, s, s, -c]);
}

/** 2×2 rotation by α. */
function rotation(alpha: number): Mat {
  const c = Math.cos(alpha);
  const s = Math.sin(alpha);
  return Float64Array.from([c, -s, s, c]);
}

const matOps: GroupOps<Mat> = {
  identity: () => Float64Array.from([1, 0, 0, 1]),
  compose: (g, h) => matMul(g, h),
  key: (g) => matrixKey(g),
};

describe('orbit: the composition convention', () => {
  it('appends a letter by composing the new generator on the LEFT', () => {
    // word [0,1] means "apply a first, then b" = the product b·a = "ba".
    const elements = orbit(freeOps, ['a', 'b'], 2);
    const byWord = new Map(elements.map((e) => [e.word.join('.'), e.element]));
    expect(byWord.get('')).toBe('');
    expect(byWord.get('0.1')).toBe('ba');
    expect(byWord.get('1.0')).toBe('ab');
  });

  it('enumerates the full ball of words when nothing dedups', () => {
    const elements = orbit(freeOps, ['a', 'b'], 3);
    expect(elements).toHaveLength(1 + 2 + 4 + 8);
    for (const e of elements) {
      expect(e.word.length).toBeLessThanOrEqual(3);
      expect(e.word.length).toBe(e.element.length); // depth is derived, never stored
    }
  });

  it('maxCount is a hard stop', () => {
    expect(orbit(freeOps, ['a', 'b'], 10, 4)).toHaveLength(4);
  });
});

describe('orbit: exhaustion and shortest words on known groups', () => {
  it('a rotation of order 5 exhausts to the cyclic group C₅', () => {
    const elements = orbit(matOps, [rotation((2 * Math.PI) / 5)], 20);
    expect(elements).toHaveLength(5);
  });

  it('mirrors at angle π/3 exhaust to the dihedral group of order 6', () => {
    const elements = orbit(matOps, [mirror(0), mirror(Math.PI / 3)], 20);
    expect(elements).toHaveLength(6);

    // Shortest words: shell sizes 1, 2, 2, 1 — the Poincaré series of I₂(3).
    const byDepth = [0, 1, 2, 3].map((d) => elements.filter((e) => e.word.length === d).length);
    expect(byDepth).toEqual([1, 2, 2, 1]);
  });

  it('ties break by generator order: the longest element gets [0,1,0], not [1,0,1]', () => {
    const R0 = mirror(0);
    const R1 = mirror(Math.PI / 3);
    const elements = orbit(matOps, [R0, R1], 20);
    const longest = elements.find((e) => e.word.length === 3)!;
    expect(longest.word).toEqual([0, 1, 0]);
    // And its matrix really is R0·R1·R0 (word left-to-right ⇒ product reversed).
    expect(matOps.key(longest.element)).toBe(matOps.key(matMul(R0, matMul(R1, R0))));
  });

  it('maxWord truncates the ball without exhausting the group', () => {
    const elements = orbit(matOps, [mirror(0), mirror(Math.PI / 3)], 2);
    expect(elements).toHaveLength(5); // 1 + 2 + 2, the longest element not yet reached
  });
});

// ── G2: the CoxeterGroup class on real solved polygons ──────────────────────

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

function triangleGroup(geometry: GeometryKind, orders: number[]) {
  return groupFromPolygon(solvePolygon(polygonSpec(geometry, orders)));
}

const MILESTONE_1: [GeometryKind, number[]][] = [
  ['hyperbolic', [2, 3, 7]],
  ['euclidean', [2, 4, 4]],
  ['spherical', [2, 3, 5]],
];

describe('CoxeterGroup: the word convention', () => {
  it('wordId: "e" for the empty word, "."-joined indices otherwise', () => {
    expect(wordId([])).toBe('e');
    expect(wordId([0, 1, 2])).toBe('0.1.2');
    expect(wordId([10, 2])).toBe('10.2');
  });

  it('word([i,j]) is the matrix product R_j·R_i, not R_i·R_j', () => {
    const g = triangleGroup('hyperbolic', [2, 3, 7]);
    // Walls 1,2 carry order 3, so R₁ and R₂ do not commute and the two
    // products differ — the pin has teeth.
    const [, R1, R2] = g.reflections;
    expect(matrixKey(g.word([1, 2]))).toBe(matrixKey(g.geom.compose(R2, R1)));
    expect(matrixKey(g.word([1, 2]))).not.toBe(matrixKey(g.geom.compose(R1, R2)));
    expect(matrixKey(g.word([]))).toBe(matrixKey(g.geom.identity()));
  });

  it.each(MILESTONE_1)('relations hold in %s: (R_j R_i)^m = 1 per decorated pair', (kind, orders) => {
    const g = triangleGroup(kind, orders);
    const idKey = matrixKey(g.geom.identity());
    const n = orders.length;
    for (let k = 0; k < n; k++) {
      const [i, j] = [k, (k + 1) % n];
      const relator = Array.from({ length: orders[k] }, () => [i, j]).flat();
      expect(matrixKey(g.word(relator))).toBe(idKey);
      expect(matrixKey(g.word([i, i]))).toBe(idKey); // involutions
    }
  });

  it('neighbor(g·F, i) is (g·R_i)·F with word [i, …w], sharing wall i’s image', () => {
    const g = triangleGroup('hyperbolic', [2, 3, 7]);
    const tile = g.tessellate(2).find((t) => t.word.length === 2)!;
    const next = g.neighbor(tile, 0);

    expect(next.word).toEqual([0, ...tile.word]);
    expect(matrixKey(next.element)).toBe(matrixKey(g.geom.compose(tile.element, g.reflections[0])));

    // The two tiles share the image of wall 0: same hyperplane, opposite
    // orientation (a reflection flips its own covector's sign).
    const a = tile.polytope.facets[0].covector;
    const b = next.polytope.facets[0].covector;
    const sign = Math.sign(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) || 1;
    for (let c = 0; c < a.length; c++) expect(b[c]).toBeCloseTo(sign * a[c], 9);
  });

  it('the identity tile is the chamber itself', () => {
    const g = triangleGroup('euclidean', [2, 4, 4]);
    const [tile] = g.tessellate(0);
    expect(tile.word).toEqual([]);
    tile.polytope.vertices.forEach((v, k) => {
      expect(g.geom.distance(v, g.chamber.vertices[k])).toBeCloseTo(0, 10);
    });
  });
});

describe('CoxeterGroup: spherical exhaustion against known orders', () => {
  it.each([
    [[2, 3, 3], 24],
    [[2, 3, 4], 48],
    [[2, 3, 5], 120],
  ] as [number[], number][])('the (%j) triangle group has order %i', (orders, order) => {
    const g = triangleGroup('spherical', orders);
    expect(g.orbit(20)).toHaveLength(order);
    // The frontier emptied — a deeper maxWord finds nothing new (dedup
    // neither splits nor merges).
    expect(g.orbit(25)).toHaveLength(order);
  });
});

describe('CoxeterGroup: dedup honesty in E and H', () => {
  it.each([
    ['euclidean', [2, 4, 4]],
    ['hyperbolic', [2, 3, 7]],
  ] as [GeometryKind, number[]][])('%s base-point orbit is pairwise distinct at Milestone-1 depths', (kind, orders) => {
    const g = triangleGroup(kind, orders);
    const elements = g.orbit(6);
    expect(elements.length).toBe(g.tessellate(6).length); // element count = tile count

    const points = elements.map((e) => g.geom.apply(e.element, g.basePoint));
    for (let a = 0; a < points.length; a++) {
      for (let b = a + 1; b < points.length; b++) {
        expect(g.geom.distance(points[a], points[b])).toBeGreaterThan(1e-6);
      }
    }
  });
});

describe('CoxeterGroup: the Cayley graph', () => {
  function degrees(nodeCount: number, edges: { a: number; b: number }[]): number[] {
    const d = new Array(nodeCount).fill(0);
    for (const e of edges) {
      d[e.a]++;
      d[e.b]++;
    }
    return d;
  }

  function connected(nodeCount: number, edges: { a: number; b: number }[]): boolean {
    const adj: number[][] = Array.from({ length: nodeCount }, () => []);
    for (const e of edges) {
      adj[e.a].push(e.b);
      adj[e.b].push(e.a);
    }
    const seen = new Set([0]);
    const stack = [0];
    while (stack.length > 0) {
      for (const n of adj[stack.pop()!]) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    return seen.size === nodeCount;
  }

  it('the full (2,3,5) graph is 3-regular with 180 edges, connected', () => {
    const g = triangleGroup('spherical', [2, 3, 5]);
    const graph = g.cayleyGraph(20);
    expect(graph.nodes).toHaveLength(120);
    expect(graph.edges).toHaveLength((120 * 3) / 2);
    expect(degrees(graph.nodes.length, graph.edges).every((d) => d === g.rank)).toBe(true);
    expect(connected(graph.nodes.length, graph.edges)).toBe(true);
  });

  it.each(MILESTONE_1)('%s: every edge really is {g, g·R_i}, each emitted once', (kind, orders) => {
    const g = triangleGroup(kind, orders);
    const graph = g.cayleyGraph(4);
    const seen = new Set<string>();
    for (const e of graph.edges) {
      expect(e.a).toBeLessThan(e.b); // once, from the lower-indexed end
      const pair = `${e.a}:${e.b}`;
      expect(seen.has(pair)).toBe(false);
      seen.add(pair);
      const moved = g.geom.compose(graph.nodes[e.a].element, g.reflections[e.generator]);
      expect(matrixKey(moved)).toBe(matrixKey(graph.nodes[e.b].element));
    }
  });

  it('a truncated ball is the induced subgraph: degrees ≤ rank, still connected', () => {
    const g = triangleGroup('hyperbolic', [2, 3, 7]);
    const graph = g.cayleyGraph(4);
    expect(graph.nodes.length).toBe(g.orbit(4).length); // dual of the tessellation
    const d = degrees(graph.nodes.length, graph.edges);
    expect(d.every((k) => k <= g.rank)).toBe(true);
    // The identity's neighbors R_i all sit at depth 1, inside the ball.
    const idNode = graph.nodes.findIndex((n) => n.word.length === 0);
    expect(idNode).toBe(0);
    expect(d[0]).toBe(g.rank);
    // Dropping a word's first letter is a g·R_i step down in length, so the
    // ball is connected in the RIGHT-edge graph too (not just the BFS tree).
    expect(connected(graph.nodes.length, graph.edges)).toBe(true);
  });
});

describe('matrixKey', () => {
  it('merges within the quantum and splits beyond it', () => {
    const a = Float64Array.from([1, 0, 0, 1]);
    const b = Float64Array.from([1 + 1e-7, 0, 0, 1 - 1e-7]);
    const c = Float64Array.from([1 + 1e-3, 0, 0, 1]);
    expect(matrixKey(a)).toBe(matrixKey(b));
    expect(matrixKey(a)).not.toBe(matrixKey(c));
  });

  it('is sign-stable at zero (a rounded −0 keys as 0)', () => {
    expect(matrixKey(Float64Array.from([-1e-9]))).toBe(matrixKey(Float64Array.from([0])));
  });

  it('a coarser quantum merges more aggressively', () => {
    const a = Float64Array.from([1, 0, 0, 1]);
    const c = Float64Array.from([1 + 1e-3, 0, 0, 1]);
    expect(matrixKey(a, 1e-2)).toBe(matrixKey(c, 1e-2));
  });
});
