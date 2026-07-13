/**
 * The Cayley graph as a purely COMBINATORIAL object (folder README): nodes
 * are the enumerated group elements, undirected edges join g to g·R_i,
 * labelled by the generator, each edge once. It is the dual graph of the
 * tessellation — one node per tile g·F, one edge per shared wall image.
 *
 * Geometric placement is immediate downstream: node g sits at g·basePoint,
 * edges are geodesics between node points (the base point's orbit bijects
 * with the group — the action on chamber interiors is free). Conversion to
 * render2d Scene items lives in the demo, not here.
 */

export interface CayleyNode<I> {
  /** The shortest BFS word reaching g (left-to-right). */
  word: number[];
  /** The group element g (this node's tile is g·F). */
  element: I;
}

/** Undirected edge {nodes[a], nodes[a]·R_generator} = {g, g·R_i}, emitted once (a < b). */
export interface CayleyEdge {
  a: number;
  b: number;
  generator: number;
}

export interface CayleyGraph<I> {
  nodes: CayleyNode<I>[];
  edges: CayleyEdge[];
}
