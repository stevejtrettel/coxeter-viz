import type { Isometry2, Point2 } from '@/geometry/types';
import type { Hyperplane } from '@/geometry/Hyperplane';
import type { Polytope } from '@/polytope/Polytope';
import { wordId, type CoxeterGroup, type Tile } from '@/group/CoxeterGroup';
import { matrixKey } from '@/group/orbit';
import type { CayleyGraph, CayleyNode } from '@/group/cayley';
import type {
  DomainItem,
  GeodesicItem,
  ItemId,
  PointStyle,
  PolygonItem,
  RegionStyle,
  SceneItem,
  StrokeStyle,
  StyleOverride,
} from '@/viz2d/render/types';
import { GREY } from './palette';

/**
 * Scene assembly (`viz2d/kit`): the group layer's structures → render2d
 * `Scene` items, with the one load-bearing id scheme and the color maps. The
 * builders own the SHAPE and the ID; the caller passes a `styleOf` function
 * for the colors. No geometry beyond `apply(element, basePoint)` — the tiles,
 * graphs, and hulls arrive already computed.
 */

// ── The id scheme (matched everywhere: combinatorics, words, hover, export) ──

export const tileId = (word: number[]): string => `tile:${wordId(word)}`;
export const cayId = (word: number[]): string => `cay:${wordId(word)}`;
export const cayEdgeId = (word: number[], generator: number): string => `cayedge:${wordId(word)}:${generator}`;
export const wallId = (i: number): string => `wall:${i}`;
/** The GPU-field tiles' id (distinct namespace from the named `tile:`). */
export const fieldTileId = (word: number[]): string => `field:tile:${wordId(word)}`;

// ── Item builders ────────────────────────────────────────────────────────────

/**
 * The chart's own image region ("the geometry itself"): filled + rimmed disk
 * for the CPU picture, rim-only when a GPU field draws the fill beneath.
 * `fill` overrides the house domain grey (P3: the figure document's
 * `domain.fill`).
 */
export function domainItem(filled = true, fill: string = GREY.domain): DomainItem {
  const rim = { color: GREY.rim, widthPx: 1.25 };
  return {
    id: 'domain',
    kind: 'domain',
    style: filled ? { fill: { color: fill }, rim } : { rim },
  };
}

/** Tiles → polygon items; `styleOf` colors each, `idOf` names it (default `tile:`). */
export function tilesToScene(
  tiles: readonly Tile<Point2, Isometry2>[],
  styleOf: (tile: Tile<Point2, Isometry2>) => RegionStyle,
  idOf: (word: number[]) => string = tileId,
): PolygonItem[] {
  return tiles.map((t) => ({
    id: idOf(t.word),
    kind: 'polygon',
    vertices: t.polytope.vertices,
    style: styleOf(t),
  }));
}

/** The chamber's mirrors → full-line geodesic items; `styleOf` colors by index. */
export function wallItems(
  walls: readonly Hyperplane[],
  styleOf: (i: number) => StrokeStyle,
): GeodesicItem[] {
  return walls.map((wall, i) => ({
    id: wallId(i),
    kind: 'geodesic',
    source: { type: 'line', wall },
    style: styleOf(i),
  }));
}

/**
 * A Cayley graph → node points (at `element·basePoint`) and generator-labelled
 * geodesic edges. `edge(generator)` styles an edge, `node(cayleyNode)` a node
 * (so nodes can be colored by coset). Edges first, then nodes (paint order).
 */
export function cayleyScene(
  group: CoxeterGroup<Point2, Isometry2>,
  graph: CayleyGraph<Isometry2>,
  styleOf: {
    edge: (generator: number) => StrokeStyle;
    node: (node: CayleyNode<Isometry2>) => PointStyle;
  },
): SceneItem[] {
  const points = graph.nodes.map((n) => group.geom.apply(n.element, group.basePoint));
  const items: SceneItem[] = [];
  for (const e of graph.edges) {
    items.push({
      id: cayEdgeId(graph.nodes[e.a].word, e.generator),
      kind: 'geodesic',
      source: { type: 'segment', a: points[e.a], b: points[e.b] },
      style: styleOf.edge(e.generator),
    });
  }
  graph.nodes.forEach((n, k) => {
    items.push({ id: cayId(n.word), kind: 'point', at: points[k], style: styleOf.node(n) });
  });
  return items;
}

/**
 * The panel type of each chamber edge: `edgeGen[k]` is the generator index i
 * whose wall supports `chamber.edges[k]` (both endpoints lie on `walls[i]`).
 * `transformPolytope` preserves the edge index order, so this one chamber-level
 * map colors every tile's edges verbatim. Each edge lies on exactly one wall,
 * so the argmin over incidence residual is unambiguous.
 */
export function edgeGenerators(
  chamber: Polytope<Point2>,
  walls: readonly Hyperplane[],
): number[] {
  return chamber.edges.map(([a, b]) => {
    let best = 0;
    let bestResidual = Infinity;
    walls.forEach((wall, i) => {
      const residual = Math.abs(wall.side(chamber.vertices[a])) + Math.abs(wall.side(chamber.vertices[b]));
      if (residual < bestResidual) {
        bestResidual = residual;
        best = i;
      }
    });
    return best;
  });
}

/**
 * The tiling's edges as generator-colored geodesic segments (the panel-type
 * coloring): every tile contributes each of its edges, but the shared interior
 * edge between g·F and g·s_i·F is emitted ONCE — deduped by the unordered
 * element pair {g, g·R_i}. `styleOf(i)` colors the edge by its panel type i.
 */
export function tessellationEdgeItems(
  group: CoxeterGroup<Point2, Isometry2>,
  tiles: readonly Tile<Point2, Isometry2>[],
  edgeGen: readonly number[],
  styleOf: (generator: number) => StrokeStyle,
): GeodesicItem[] {
  const seen = new Set<string>();
  const items: GeodesicItem[] = [];
  for (const t of tiles) {
    const kt = matrixKey(t.element);
    t.polytope.edges.forEach(([a, b], k) => {
      const i = edgeGen[k];
      const kn = matrixKey(group.geom.compose(t.element, group.reflections[i]));
      const key = kt < kn ? `${kt}|${kn}` : `${kn}|${kt}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({
        id: `tileedge:${wordId(t.word)}:${i}`,
        kind: 'geodesic',
        source: { type: 'segment', a: t.polytope.vertices[a], b: t.polytope.vertices[b] },
        style: styleOf(i),
      });
    });
  }
  return items;
}

/**
 * A polytope → a filled polygon scene item: the fundamental domain, a convex
 * hull (`hullOfWords` / `hullOfTiles`), any distinguished region. The caller
 * names it (`'fd'`, `'hull'`, `'hull:centers'`, …).
 */
export function polygonItem(polytope: Polytope<Point2>, style: RegionStyle, id: string): PolygonItem {
  return { id, kind: 'polygon', vertices: polytope.vertices, style };
}

/**
 * The per-frame overrides a typed word list induces — ELEMENTWISE (any
 * spelling of an element hits its one tile/node): each denoted element
 * (`group.elements`, deduped by matrix key) whose ids are in `idsOf` gets the
 * tile and node override. Elements outside the drawn ball are skipped.
 */
export function highlightElements(
  group: CoxeterGroup<Point2, Isometry2>,
  words: readonly (readonly number[])[],
  idsOf: ReadonlyMap<string, { tile: ItemId; node: ItemId }>,
  styles: { tile: StyleOverride; node: StyleOverride },
): Map<ItemId, StyleOverride> {
  const out = new Map<ItemId, StyleOverride>();
  for (const key of group.elements(words).keys()) {
    const ids = idsOf.get(key);
    if (!ids) continue;
    out.set(ids.tile, styles.tile);
    out.set(ids.node, styles.node);
  }
  return out;
}

// ── Color maps (math → color string) ─────────────────────────────────────────

/** Word-length parity → tile color: identity / even / odd (= the sign character). */
export function parityColor(word: number[], tri: { identity: string; even: string; odd: string }): string {
  return word.length === 0 ? tri.identity : word.length % 2 === 0 ? tri.even : tri.odd;
}

/** Golden-angle pastel for a coset ordinal (the anchor-free fallback coloring). */
export function cosetColor(i: number): string {
  return `hsl(${((i * 137.508) % 360).toFixed(1)}, 55%, 78%)`;
}

/** A hashHue value h ∈ [0,1) → hsl — the shared §5.8 convention (CPU = GPU). */
export function hueColor(h: number): string {
  return `hsl(${(h * 360).toFixed(2)}, 55%, 78%)`;
}
