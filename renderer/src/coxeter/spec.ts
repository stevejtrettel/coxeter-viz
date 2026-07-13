import type { GeometryKind } from '@/geometry/types';

/**
 * The RealizationSpec — the internal seam between exact combinatorics and
 * numerical solving (PLAN.md §4, folder README). Phase 3a: 2D (polygons).
 * All indices are GENERATOR indices; the indexing is load-bearing and shared
 * with decorations, word lists, and Cayley edges.
 */

export interface Decoration {
  /** The meeting pair of walls, as generator indices. */
  walls: [number, number];
  /** They meet at dihedral angle π/order; integer ≥ 2. */
  order: number;
}

export interface PolygonCombinatorics {
  kind: 'polygon';
  /** Generator indices of the walls in cyclic order around the polygon. */
  cyclicOrder: number[];
}

export interface RealizationSpec {
  geometry: GeometryKind;
  dim: 2 | 3;
  combinatorics: PolygonCombinatorics; // PolyhedronCombinatorics joins in Phase 3b
  decorations: Decoration[];
}

/** The exact, checked form of a 2D spec that the solver consumes. */
export interface ValidatedPolygon {
  geometry: GeometryKind;
  n: number;
  /** cyclicOrder, verified to be a permutation of 0…n−1. */
  cyclicOrder: number[];
  /** vertexOrders[k] = order m of the pair (cyclicOrder[k], cyclicOrder[k+1]). */
  vertexOrders: number[];
}

const pairKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);

/**
 * Classify a cyclic order list exactly: compare Σ π/mₖ with (n−2)π in
 * integer arithmetic (Σ P/mₖ vs (n−2)·P for P = Π mₖ), so the Euclidean
 * equality case is decided exactly, not by float luck.
 */
export function classifyPolygon(vertexOrders: number[]): GeometryKind {
  const n = vertexOrders.length;
  const P = vertexOrders.reduce((p, m) => p * m, 1);
  const angleSum = vertexOrders.reduce((s, m) => s + P / m, 0); // Σ P/mₖ — each term an integer
  const flat = (n - 2) * P;
  if (angleSum > flat) return 'spherical';
  if (angleSum === flat) return 'euclidean';
  return 'hyperbolic';
}

/**
 * Validate a 2D spec (see README): combinatorial sanity, decoration
 * placement (exactly the adjacent pairs), compactness (finite orders), and
 * the classification cross-check against the declared geometry. Throws with
 * a mathematical reason; returns the checked form the solver consumes.
 */
export function validatePolygon(spec: RealizationSpec): ValidatedPolygon {
  if (spec.dim !== 2 || spec.combinatorics.kind !== 'polygon') {
    throw new Error('validatePolygon: only dim 2 polygon specs are implemented (3D is Phase 3b).');
  }
  const cyclic = spec.combinatorics.cyclicOrder;
  const n = cyclic.length;
  if (n < 3) {
    throw new Error(`A polygon needs at least 3 walls; got ${n} (digons/lunes are not compact chambers here).`);
  }
  if (new Set(cyclic).size !== n || cyclic.some((g) => !Number.isInteger(g) || g < 0 || g >= n)) {
    throw new Error(`cyclicOrder must be a permutation of 0…${n - 1}; got [${cyclic}].`);
  }

  const byPair = new Map<string, number>();
  for (const { walls, order } of spec.decorations) {
    const [a, b] = walls;
    if (a === b || ![a, b].every((g) => Number.isInteger(g) && g >= 0 && g < n)) {
      throw new Error(`decoration walls [${a},${b}] are not a valid pair of generator indices.`);
    }
    if (byPair.has(pairKey(a, b))) throw new Error(`duplicate decoration on walls [${a},${b}].`);
    if (order === Infinity || order === -1) {
      throw new Error(
        `walls [${a},${b}] have infinite order: a non-compact polygon (ideal vertex) — deferred in v1.`,
      );
    }
    if (!Number.isInteger(order) || order < 2) {
      throw new Error(`decoration order on walls [${a},${b}] must be an integer ≥ 2; got ${order}.`);
    }
    byPair.set(pairKey(a, b), order);
  }

  // Exactly the cyclically-adjacent pairs must be decorated.
  const vertexOrders: number[] = [];
  const adjacent = new Set<string>();
  for (let k = 0; k < n; k++) {
    const a = cyclic[k];
    const b = cyclic[(k + 1) % n];
    const key = pairKey(a, b);
    adjacent.add(key);
    const m = byPair.get(key);
    if (m === undefined) {
      throw new Error(
        `adjacent walls [${a},${b}] carry no decoration — adjacent polygon sides meet and need an order.`,
      );
    }
    vertexOrders.push(m);
  }
  for (const key of byPair.keys()) {
    if (!adjacent.has(key)) {
      throw new Error(
        `walls [${key}] are decorated but not cyclically adjacent — non-adjacent polygon sides do not meet.`,
      );
    }
  }

  const derived = classifyPolygon(vertexOrders);
  if (derived !== spec.geometry) {
    throw new Error(
      `geometry mismatch: the orders [${vertexOrders}] classify as ${derived} ` +
        `(Σ π/m vs (n−2)π), but the spec declares ${spec.geometry}.`,
    );
  }

  return { geometry: derived, n, cyclicOrder: [...cyclic], vertexOrders };
}
