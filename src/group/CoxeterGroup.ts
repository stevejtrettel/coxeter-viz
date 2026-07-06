import type { Vec } from '@/math/vec';
import type { Geometry, Isometry2, Point2 } from '@/geometry/types';
import type { Hyperplane } from '@/geometry/Hyperplane';
import type { Polytope } from '@/polytope/Polytope';
import { transformPolytope } from '@/polytope/transform';
import type { RealizedPolygon } from '@/coxeter/solve';
import { matrixKey, orbit as runOrbit, type GroupOps, type OrbitElement } from './orbit';
import type { CayleyEdge, CayleyGraph, CayleyNode } from './cayley';

/**
 * A Coxeter group as a GEOMETRIC REPRESENTATION (folder README): the realized
 * walls, the generating reflections R_i aligned with them by generator index
 * (the construction invariant — the constructor derives the reflections, so
 * the alignment cannot be broken), and the verified chamber F it carries
 * around. Immutable, no lazy state: everything arrives pre-built from the
 * solver.
 *
 * Generic over the point/isometry types of the six cells; `I extends
 * Float64Array` because dedup is geometric — elements are keyed by their
 * quantized matrix entries (both Isometry2 and Isometry3 qualify).
 */

/** A tessellation tile: the chamber image word·F. */
export interface Tile<P, I> {
  word: number[];
  element: I;
  polytope: Polytope<P>;
}

/** The id scheme, fixed once here: "e" for [], else "."-joined indices. */
export function wordId(word: number[]): string {
  return word.length === 0 ? 'e' : word.join('.');
}

export class CoxeterGroup<P extends Vec, I extends Float64Array> {
  readonly geom: Geometry<P, I>;
  /** Walls by generator index (= the realization's walls). */
  readonly walls: Hyperplane[];
  /** R_i = geom.reflection(walls[i]), aligned with walls by construction. */
  readonly reflections: I[];
  /** The fundamental domain F, pre-built and verified by the solver. */
  readonly chamber: Polytope<P>;
  /** A chamber-interior point (the incenter): the canonical Cayley base point. */
  readonly basePoint: P;

  constructor(geom: Geometry<P, I>, walls: Hyperplane[], chamber: Polytope<P>, basePoint: P) {
    this.geom = geom;
    this.walls = walls;
    this.reflections = walls.map((w) => geom.reflection(w));
    this.chamber = chamber;
    this.basePoint = basePoint;
  }

  get rank(): number {
    return this.reflections.length;
  }

  /**
   * The element of a word, applied LEFT TO RIGHT: [i₀,…,i_k] applies R_{i₀}
   * first, so the matrix is R_{i_k}···R_{i₀} — each letter composed on the
   * left. Identity for [].
   */
  word(indices: number[]): I {
    return indices.reduce((g, i) => this.geom.compose(this.reflections[i], g), this.geom.identity());
  }

  /** The deduplicated ball of elements out to word length `maxWord`. */
  orbit(maxWord: number, maxCount?: number): OrbitElement<I>[] {
    const ops: GroupOps<I> = {
      identity: () => this.geom.identity(),
      compose: (g, h) => this.geom.compose(g, h),
      key: (g) => matrixKey(g),
    };
    return runOrbit(ops, this.reflections, maxWord, maxCount);
  }

  /**
   * Tile the space: one tile per orbit element, the chamber carried by
   * `transformPolytope` (face lattice invariant, walls transported
   * contravariantly). The chamber is a fundamental domain, so distinct
   * elements give distinct tiles.
   */
  tessellate(maxWord: number, maxCount?: number): Tile<P, I>[] {
    return this.orbit(maxWord, maxCount).map((e) => ({
      word: e.word,
      element: e.element,
      polytope: transformPolytope(this.chamber, this.geom, e.element),
    }));
  }

  /**
   * The Cayley graph out to word length `maxWord`: one node per orbit
   * element, edges {g, g·R_i} found by MATRIX-KEY LOOKUP among the nodes —
   * never word surgery (README). Edges whose far end fell outside the
   * enumerated ball are simply absent (the induced subgraph); each
   * undirected edge is emitted once, from its lower-indexed end.
   */
  cayleyGraph(maxWord: number, maxCount?: number): CayleyGraph<I> {
    const nodes: CayleyNode<I>[] = this.orbit(maxWord, maxCount).map((e) => ({
      word: e.word,
      element: e.element,
    }));
    const index = new Map(nodes.map((n, k) => [matrixKey(n.element), k]));

    const edges: CayleyEdge[] = [];
    for (let a = 0; a < nodes.length; a++) {
      for (let i = 0; i < this.rank; i++) {
        const b = index.get(matrixKey(this.geom.compose(nodes[a].element, this.reflections[i])));
        if (b !== undefined && a < b) edges.push({ a, b, generator: i });
      }
    }
    return { nodes, edges };
  }

  /**
   * The set of ELEMENTS a word list denotes (README, "Word lists"; M3): each
   * abstract word evaluates through `word()` and deduplicates by the matrix
   * key — two spellings of one element are one member, the first spelling
   * kept. All membership/coloring/coset semantics build on this, never on
   * literal word syntax.
   */
  elements(words: readonly (readonly number[])[]): Map<string, { word: number[]; element: I }> {
    const out = new Map<string, { word: number[]; element: I }>();
    for (const w of words) {
      const element = this.word([...w]);
      const k = matrixKey(element);
      if (!out.has(k)) out.set(k, { word: [...w], element });
    }
    return out;
  }

  /**
   * The tile each word represents — the image of the fundamental domain
   * under the word's element (the design doc's `tiles` op) — one tile per
   * DISTINCT element.
   */
  tilesFor(words: readonly (readonly number[])[]): Tile<P, I>[] {
    return [...this.elements(words).values()].map(({ word, element }) => ({
      word,
      element,
      polytope: transformPolytope(this.chamber, this.geom, element),
    }));
  }

  /**
   * The subgroup generated by arbitrary elements (a parabolic ⟨R_i, R_j⟩,
   * any `word()` outputs, …): BFS over the generators AND their inverses,
   * deduplicated by matrix key, returned as a keyed Map (membership tests
   * are the point). Subgroups of infinite groups are usually infinite —
   * `maxCount` is a hard stop, like orbit's.
   */
  subgroup(generators: readonly I[], maxCount = 5000): Map<string, I> {
    const id = this.geom.identity();
    const seen = new Map<string, I>([[matrixKey(id), id]]);
    const steps = [...generators, ...generators.map((g) => this.geom.inverse(g))];
    let frontier: I[] = [id];
    while (frontier.length > 0) {
      const next: I[] = [];
      for (const e of frontier) {
        for (const s of steps) {
          const h = this.geom.compose(e, s);
          const k = matrixKey(h);
          if (seen.has(k)) continue;
          seen.set(k, h);
          next.push(h);
          if (seen.size >= maxCount) return seen;
        }
      }
      frontier = next;
    }
    return seen;
  }

  /**
   * The tile adjacent to g·F across the image of wall i: reflect first, then
   * carry — (g·R_i)·F, word [i, …w] (README, "Words and composition"). The
   * word is the geometric adjacency word, not necessarily the element's
   * shortest BFS word.
   */
  neighbor(tile: Tile<P, I>, i: number): Tile<P, I> {
    const element = this.geom.compose(tile.element, this.reflections[i]);
    return {
      word: [i, ...tile.word],
      element,
      polytope: transformPolytope(this.chamber, this.geom, element),
    };
  }
}

/**
 * The 2D factory: consume a solved polygon and take it at its word — the
 * solver's postconditions already verified the realization; the group derives
 * the reflections and verifies nothing else. The incenter is the origin.
 */
export function groupFromPolygon(r: RealizedPolygon): CoxeterGroup<Point2, Isometry2> {
  return new CoxeterGroup(r.geom, r.walls, r.chamber, r.geom.origin());
}
