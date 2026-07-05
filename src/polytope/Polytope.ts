import type { Hyperplane } from '@/geometry/Hyperplane';

/**
 * Where a vertex lives relative to the geometry. v1 builds only 'finite'
 * vertices; 'ideal' (on the boundary at infinity) and 'hyperideal' (beyond
 * it) are carried in the type so non-compact polytopes can be added without
 * reshaping the data. In E, "ideal" is the intersection at infinity of
 * parallel walls.
 */
export type VertexKind = 'finite' | 'ideal' | 'hyperideal';

/** A 2-face: its vertices as a cyclically-ordered loop, plus the wall it lies on. */
export interface PolytopeFace {
  /** Vertex indices, cyclically ordered around the facet plane. */
  loop: number[];
  /** Index into `Polytope.facets` of the supporting wall. */
  facet: number;
}

/**
 * The combinatorial + geometric data of a convex polytope in any geometry
 * cell: canonical vertices (on the point locus), the walls bounding it, and
 * the face lattice connecting them. In 2D the polytope IS the polygon: its
 * vertices are cyclically ordered, edges are consecutive pairs, `faces` is
 * empty. Model-free: draw it through any chart.
 */
export class Polytope<P> {
  readonly dim: 2 | 3;
  /** Canonical vertices on the point locus (cyclically ordered in 2D). */
  readonly vertices: P[];
  readonly vertexKind: VertexKind[];
  /** Edges as vertex-index pairs. */
  readonly edges: [number, number][];
  /** 2-faces (empty in 2D). */
  readonly faces: PolytopeFace[];
  /** The bounding walls; the polytope is { p : side(p) ≤ 0 for all walls }. */
  readonly facets: Hyperplane[];

  constructor(
    dim: 2 | 3,
    vertices: P[],
    vertexKind: VertexKind[],
    edges: [number, number][],
    faces: PolytopeFace[],
    facets: Hyperplane[],
  ) {
    this.dim = dim;
    this.vertices = vertices;
    this.vertexKind = vertexKind;
    this.edges = edges;
    this.faces = faces;
    this.facets = facets;
  }
}
