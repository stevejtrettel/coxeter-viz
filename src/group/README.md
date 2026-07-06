# `group/` — the 2D group layer

From a **RealizedPolygon** (the solver's verified output) to the **group
acting**: the generating reflections, word composition, the deduplicated
orbit, the tessellation by chamber images, and the combinatorial Cayley
graph. Depends on `math/`, `geometry/`, `polytope/`, `coxeter/` — and
nothing above (the viz systems consume this layer's own output vocabulary).

Decided collaboratively 2026-07-05 (PLAN.md §5.4); this README is the spec,
written before the code.

## The seam: a RealizedPolygon in, nothing re-verified

The factory consumes a `RealizedPolygon` and takes it at its word: the
solver's postconditions already proved that the walls realize the spec's
combinatorics with the decorated dihedral angles. The group layer derives

```
reflections[i] = geom.reflection(walls[i])        (generator indexing: wall i ↔ generator i)
```

and verifies nothing else. Everything the parent's constructor assembled by
hand arrives pre-built: the geometry instance, walls by generator index, the
verified chamber (the fundamental domain F), and the incenter at the origin
— the canonical base point, equidistant from all walls. Every non-identity
element moves a chamber-interior point (the action on chamber interiors is
free), so the base point's orbit bijects with the group: it is the right
Cayley-graph node placement, and a wall point would give a Wythoff uniform
polytope instead (deliberately out of scope for Milestone 1).

The class is immutable with no lazy state — the parent memoized its
fundamental domain; ours arrives pre-built.

## Words and composition — the one convention, matched everywhere

A **word** is a list of generator indices `[i₀,…,i_k]`, applied **left to
right**: i₀ first. On a point that is x ↦ R_{i_k}(⋯R_{i₀}(x)⋯), so

```
word([i₀,…,i_k])  =  R_{i_k}···R_{i₀}      (matrix product; identity for [])
```

Every composition site follows from this one line:

- **BFS extension**: appending a letter i to a word applies R_i *last*, so
  the engine composes the new generator on the **left**:
  `h = compose(R_i, g)`.
- **Tile adjacency**: the neighbor of tile g·F across (the image of) wall i
  is `g·R_i·F` — reflect first, then carry — so `neighbor` composes on the
  **right** (`compose(g, R_i)`) and the word is `[i, …w]` (prepending).
  The two tiles share the image of wall i.
- **Cayley edges** join g to g·R_i, labelled by i.

After dedup an element's word is the **first BFS word that reached it** —
shortest, ties broken by generator order (the BFS scans generators in index
order). Cayley edges are found by **matrix-key lookup, never word surgery**:
`neighbor`'s word `[i, …w]` is the geometric adjacency word and need not be
the element's stored shortest word.

### Why left and right both appear

The BFS extends elements by **left** multiplication (R_i·g) while tile
adjacency and Cayley edges use **right** multiplication (g·R_i). This is the
standard structure of a Cayley graph, not an implementation accident, and
each side is forced separately:

- **Edges must be right.** Tessellation duality is the load-bearing fact:
  the tiles g·F and h·F share a wall image **iff** h = g·R_i (the shared
  wall is g's image of mirror i). For the Cayley graph to overlay the
  tessellation — node g at g·basePoint, each edge crossing exactly its
  tiles' shared wall — the edges have to be {g, g·R_i}. A
  left-multiplication "edge" {g, R_i·g} would join tiles that are generally
  far apart: R_i·(g·F) is the reflection of the whole tile in the original
  fixed mirror i.
- **The BFS must be left.** Words apply left to right (the glossary, matched
  to the parent), so appending a letter means "then apply R_i" — left
  multiplication on the matrix. Given the word convention, the BFS has no
  choice.

The two halves then cohere classically:

- The enumerated **set** is the same either way — ℓ(g) is the minimal letter
  count regardless of composition side — so BFS words are genuinely shortest
  and the ball {ℓ(g) ≤ maxWord} is the right node set for both structures.
- Left multiplication h ↦ g·h is precisely the **symmetry** of the
  right-edge graph: it permutes nodes and preserves edges and their
  generator labels. This is why the drawn Cayley graph inherits the full
  group symmetry of the tessellation — and exactly what would be lost if
  edges and BFS used the same side.
- A stored word is still an edge-path: read **right to left**,
  `[i₀,…,i_k]` is a minimal right-edge path (a minimal gallery) from the
  identity node to g, crossing one shared wall per letter — dropping a
  reduced word's *first* letter is one g·R_i step down in length. The same
  fact makes the truncated ball **connected** as an induced subgraph (every
  element steps down to a shorter one without leaving the ball); the G3
  tests pin it.

The only coherent alternatives would flip *both* sides (words read right to
left, right-composing BFS — contradicting the glossary and the parent) or
draw left-multiplication edges (breaking the dual-graph picture).

## The orbit engine (`orbit.ts`) — generic, free-standing

The BFS needs only identity / compose / key — nothing Coxeter — so it stays
a free function over a minimal `GroupOps<I>`. An enumerated element is
`{ word, element }`; depth (= `word.length`) and parity are derived, never
stored.

**Dedup is geometric**: two elements are equal iff their matrix entries,
rounded to a quantum, agree. `matrixKey` works directly on our flat
row-major `Float64Array` matrices. Quantum `1e-5` and `maxCount = 5000` are
inherited constants, kept for now.

**Documented limitation**: this is not a combinatorial normal form. In H the
matrix entries grow like cosh(distance to the identity), so an *absolute*
quantum can split deep elements under float drift. Fine at Milestone-1
depths; the Tits/ShortLex automaton is the parked correct answer (PLAN.md
§6). The "dedup honesty" tests below keep it honest at the depths we use.

**Depth policy is camera-free**: `maxWord` bounds word length, `maxCount`
caps the element count (a hard stop — hitting it may truncate the last
shell mid-depth). No geometric cutoff: tiles are isometric copies of F, so
nothing intrinsic shrinks — only chart images do — and the camera-dependent
cut lives where the camera lives (render2d culls sub-pixel items per
frame). Generate generously; the renderer culls.

## The group (`CoxeterGroup.ts`)

An immutable class `CoxeterGroup<P, I>` — the repo's pattern for
mathematical objects with construction invariants (here: walls, reflections,
and chamber aligned by generator index). Generic over the six cells; the 2D
factory from `RealizedPolygon` instantiates `⟨Point2, Isometry2⟩`, and
Milestone 2 adds the 3D factory.

- `word(indices)` — the element of a word, per the convention above.
- `orbit(maxWord, maxCount?)` — the deduplicated ball of elements.
- `tessellate(maxWord, maxCount?)` — a **tile** per orbit element:
  `{ word, element, polytope }`, the chamber carried by `transformPolytope`
  (face lattice invariant, walls transported contravariantly).
- `neighbor(tile, i)` — the adjacent tile across wall i's image, as above.
- `cayleyGraph(maxWord, maxCount?)` — the combinatorial graph, below.

**Identity — the id scheme, fixed once, here.** A word serializes with `.`
separators and the empty word as `"e"`: `wordId([0,1,2]) = "0.1.2"`,
`wordId([]) = "e"`. Downstream scene ids build on it — `tile:<word>`,
`cay:<word>`, `cayedge:<word>:<i>` — but constructing those strings is the
consumer's business; this layer provides only `wordId`.

## The Cayley graph (`cayley.ts`)

Purely **combinatorial**: nodes are the orbit's elements (each carrying its
word), undirected edges `{g, g·R_i}` labelled by generator, each edge once
(emitted for `a < b` under matrix-key lookup of g·R_i among the nodes; edges
whose far end fell outside the enumerated ball are simply absent — the
induced subgraph). It is the dual graph of the tessellation: one node per
tile, one edge per shared wall image.

Geometric placement is immediate *downstream*: node g sits at g·basePoint,
edges are geodesics between node points. Conversion to render2d Scene items
lives in the Milestone-1 demo (promotable to an adapter module if demos
repeat themselves); there is no `CayleyGraphView` equivalent here.

**Left out deliberately** (parent features Milestone 1 doesn't need):
`subgroup` enumeration, Wythoff constructions. They return in later phases.
(Milestone 3 is that phase for `subgroup` — below; Wythoff stays out.)

## Word lists (Milestone 3)

**A word list denotes a SET OF ELEMENTS** (user ruling, 2026-07-06): words
are input in the abstract group — lists of generator indices, applied left
to right as everywhere — and the code converts each to its element,
deduplicating by the matrix key. Two spellings of one element are one
member; membership, coloring, and coset tests are always elementwise, never
literal word syntax. Per the design doc's semantics rule, every word-list
operation states what a word maps to:

- `elements(words)` — the denoted set: a Map from element key to the first
  `{word, element}` that produced it.
- `tilesFor(words)` — **the tile each word represents**: the image of the
  fundamental domain under the word's element, one tile per DISTINCT
  element.
- `subgroup(generators, maxCount?)` — the subgroup generated by arbitrary
  elements (e.g. a parabolic ⟨R_i, R_j⟩, or any `word()` outputs), BFS over
  the generators and their inverses, deduplicated, as a keyed Map. Subgroups
  of infinite groups are usually infinite: `maxCount` bounds the
  enumeration (a hard stop, like orbit's).
- `cosetIndex(subgroup, elements)` (`wordlists.ts`) — assigns each element
  its LEFT coset gH: two elements share a coset iff g₁⁻¹g₂ ∈ H, computed by
  keying the orbit {g·h : h ∈ H} by its minimal matrix key. O(|elements|·|H|)
  — fine at demo scales.
- `hullOfWords(group, words)` (`wordlists.ts`, 2D) — **the convex hull of
  the base-point images** of the word list's elements, via the polytope
  engine's `fromVertices2`. The spherical hemisphere refusal propagates
  (a hull spanning more than a hemisphere throws, by design).

## Type shapes

```ts
// orbit.ts
export interface GroupOps<I> {
  identity(): I;
  /** The product g·h (h applied first). */
  compose(g: I, h: I): I;
  /** A stable string key identifying an element up to quantization. */
  key(g: I): string;
}

/** An enumerated element: shortest BFS word (left-to-right) + the isometry. */
export interface OrbitElement<I> {
  word: number[];
  element: I;
}

export function orbit<I>(
  ops: GroupOps<I>,
  generators: I[],
  maxWord: number,
  maxCount?: number, // default 5000
): OrbitElement<I>[];

/** Quantized-entry dedup key for a flat row-major matrix. */
export function matrixKey(m: Float64Array, quantum?: number): string; // default 1e-5
```

```ts
// CoxeterGroup.ts
/** A tessellation tile: the chamber image word·F. */
export interface Tile<P, I> {
  word: number[];
  element: I;
  polytope: Polytope<P>;
}

/** "e" for [], else "."-joined indices: [0,1,2] → "0.1.2". */
export function wordId(word: number[]): string;

export class CoxeterGroup<P extends Vec, I> {
  readonly geom: Geometry<P, I>;
  /** Walls by generator index (= the realization's walls). */
  readonly walls: Hyperplane[];
  /** R_i = geom.reflection(walls[i]), aligned with walls. */
  readonly reflections: I[];
  /** The fundamental domain F, pre-built and verified by the solver. */
  readonly chamber: Polytope<P>;
  /** The incenter (the origin): the canonical Cayley base point. */
  readonly basePoint: P;

  get rank(): number; // = reflections.length

  word(indices: number[]): I;
  orbit(maxWord: number, maxCount?: number): OrbitElement<I>[];
  tessellate(maxWord: number, maxCount?: number): Tile<P, I>[];
  neighbor(tile: Tile<P, I>, i: number): Tile<P, I>;
  cayleyGraph(maxWord: number, maxCount?: number): CayleyGraph<I>;
}

/** The 2D factory: consume a solved polygon, derive the reflections. */
export function groupFromPolygon(r: RealizedPolygon): CoxeterGroup<Point2, Isometry2>;
```

```ts
// cayley.ts
export interface CayleyNode<I> {
  word: number[];
  element: I;
}

/** Undirected edge {nodes[a], nodes[a]·R_generator} = {g, g·R_i}, once. */
export interface CayleyEdge {
  a: number;
  b: number;
  generator: number;
}

export interface CayleyGraph<I> {
  nodes: CayleyNode<I>[];
  edges: CayleyEdge[];
}
```

## Files

| file | responsibility | increment |
|---|---|---|
| `orbit.ts` | the generic BFS engine: `GroupOps<I>`, `orbit`, `matrixKey` | G1 |
| `CoxeterGroup.ts` | the class, `Tile`, `wordId`, the 2D factory; M3 adds `elements`, `tilesFor`, `subgroup` | G2, M3.2 |
| `cayley.ts` | the combinatorial graph types (the builder is a class method) | G3 |
| `wordlists.ts` | M3: `cosetIndex`, `hullOfWords` (2D) | M3.2–3 |

## Tests pin the mathematics

- **Convention pins**: `word([i,j])` = the matrix product R_j·R_i (not
  R_i·R_j); `neighbor(tile, i)` has element g·R_i and word `[i, …w]`, and
  its polytope shares wall-i's image with the tile.
- **Relations**: `word([i,j]·m_ij)` = identity for every decorated pair, in
  all three geometries.
- **Spherical exhaustion against known orders**: (2,3,3) → 24, (2,3,4) →
  48, (2,3,5) → 120 — the BFS frontier empties at the right count with
  `maxWord` generous, pinning that dedup neither splits nor merges.
- **Dedup honesty in E/H**: the base point's orbit is pairwise distinct at
  Milestone-1 depths; element count = tile count.
- **Cayley**: node degree ≤ rank; every edge's endpoints differ by R_i
  (matrix check); each undirected edge appears once.
- `wordId`: `[]` → `"e"`, round-trip-unambiguous joins.

## Increments (PLAN.md §5.4)

**G0** this README + type shapes, approved before further code · **G1**
`orbit.ts` + tests · **G2** the `CoxeterGroup` class + the
convention/relation/exhaustion tests · **G3** the Cayley graph + tests ·
**G4** the Milestone-1 demo: (2,3,7) H, (2,4,4) E, (2,3,5) S tessellations
and Cayley graphs through at least two models per geometry, including
(2,3,5) on the perspective globe.
