# coxeter-viz — build plan

> Status: **planning**. This document is being edited collaboratively; nothing in
> the repo is code yet. Companion documents: `coxeter-viz-DESIGN.md` (in
> `hyperbolic-polytopes/`, the original product design) and this plan, which
> supersedes it where they disagree (notably: the role of the Gram matrix).

## 1. What we are building

A system that takes **abstract Coxeter data** — generators and the orders
m_ij of pairwise products — and

1. decides **what the group is** (spherical / Euclidean / hyperbolic),
2. determines the **combinatorics of the fundamental domain**,
3. produces a **geometric representation** (walls, reflections, chamber)
   in S², E², H² (rank 3) or S³, E³, H³ (rank 4),

then supports everything downstream of that representation: tessellations,
Cayley graphs, images of word lists, convex hulls of tile sets, areas and
volumes — all rendered beautifully through swappable coordinate models.

Consumers are research mathematicians. The visualization engine is
TypeScript; Python users drive it through a thin package whose seam is
**pure group theory** (generators, orders of products, word lists — never
geometry). The pip wheel vendors the compiled JS bundle (the Plotly pattern);
see `coxeter-viz-DESIGN.md` §5 for packaging details, which stand unchanged.

### The Gram matrix is not the input

The Gram matrix is a *byproduct*, and internally an input only in the rigid
(simplex) cases. For anything past a simplex the abstract data leaves moduli
undetermined (distances between non-meeting walls), so there is no canonical
Gram to hand an engine. Realization goes through dimension-specific solvers
(§4), and where moduli exist the solver picks the **canonical
representative: the chamber with an inscribed circle/sphere (minimal
perimeter)** — Porti's polygon in H², the square rather than a rectangle in
E², etc.

## 2. Parent repositories

This is a ground-up **rewrite that marries two working systems** — and is
also a cleanup: the goal is very easy-to-read, modular, close-to-the-math
code that just works together.

| parent | what it contributes |
|---|---|
| `homogeneous-spaces` | the geometry substrate, already general over S/E/H in 2D & 3D: `Geometry<P,I>` (with isometry ops built in), coordinate models per geometry, metric-correct rendering (`scaleAt`/`jacobianAt`), App harness |
| `hyperbolic-polytopes` | everything Coxeter-specific, currently hyperbolic-only: polytope engine (hulls in the straight chart, V/E/F lattice), `Hyperplane`, the 2D Porti solver, the 3D Andreev+LM solver, `CoxeterGroup`, orbit BFS, Cayley graphs, words, Wythoff |
| `hyperbolic-polytopes/COX_COMPUTE/` | the written pipeline for seedless 3D realization (dual graph → Steinitz → Andreev → Tutte/polar seed → Newton/LM → verify), digesting Roeder's *Constructing Hyperbolic Polyhedra Using Newton's Method* |

## 3. Rules of construction

These govern every phase; they are why the estimates are generous.

1. **Copy nothing verbatim.** Every ported file is re-derived: read the
   original, understand the mathematics, write the version this system
   wants. The parents are references, not sources.
2. **One canonical form per concept.** The parents have two `Geometry`
   interfaces, two model layers, two render harnesses. This repo has exactly
   one of each; the Coxeter machinery is rewritten against the unified one.
   (`GroupGeometry` disappears — isometry ops live in `Geometry<P,I>` from
   day one. "Klein model" as a special name disappears in favor of *the
   straight-geodesic chart*, which each geometry designates.)
3. **Modules read like the mathematics.** Every `src/` folder has a
   `README.md` stating the math it implements — written *first*, as the
   module's spec. If the README's math statement is awkward, the module
   boundary is wrong.
4. **Names from the literature, one vocabulary.** Wall, mirror, pole,
   chamber, decoration, spec, realization — fixed once in the glossary
   (CLAUDE.md) and used identically in code, tests, and schema.
5. **Small single-purpose files; dependency direction is law.**
   math → geometry → models → polytope → coxeter → group → render → app.
   Wanting to import downward is a design smell to discuss, not work around.
6. **Tests pin the mathematics, not the implementation.** Round-trips,
   invariants (⟨n_i,n_j⟩ against prescribed orders, Gauss–Bonnet, orbit
   counts against known group orders), and solver postconditions.

## 4. Architecture

### The unified ambient picture

All six cells share one linear-algebra home: points and walls live in
R^{n+1}, isometries are (n+1)×(n+1) matrices.

| geometry | points | isometries |
|---|---|---|
| Sⁿ | unit sphere ⟨p,p⟩ = 1 | O(n+1) |
| Eⁿ | affine slice x₀ = 1 | homogeneous matrices [[R,t],[0,1]] |
| Hⁿ | hyperboloid sheet ⟨p,p⟩ = −1 | O(n,1) |

Walls are **covectors**; incidence is the same pairing ⟨p,n⟩ in every case.
This keeps `CoxeterGroup`, orbit BFS, matrix dedup, and polytope transforms
fully generic.

### The internal seam

The system splits at the **RealizationSpec** — the decorated combinatorial
polytope. Everything above the seam is exact/combinatorial; everything below
is numerical.

```
inference layer (exact):   Coxeter matrix → FD combinatorics → classify geometry
                           → validate → SPEC
                                            │   ← the seam
solver layer (numeric):    SPEC → manufacture seed → solve → verify → REALIZATION
```

The seam sits where the data is exactly sufficient: by Andreev uniqueness
(H³) and the canonicality rule (elsewhere), a spec names its realization.

```ts
interface RealizationSpec {
  geometry: 'spherical' | 'euclidean' | 'hyperbolic';
  dim: 2 | 3;
  combinatorics: PolygonCombinatorics | PolyhedronCombinatorics; // indices = GENERATOR indices, everywhere
  decorations: Decoration[];   // { walls: [i,j], order: m } — walls meet at π/m
}
// Undecorated pair = the walls do NOT meet; the distance between them is the
// moduli the solver resolves canonically (inscribed circle / min perimeter).
// The decoration slot is an object so it can later grow angles / lengths.
```

Agreed contract rules:

- **Generator indexing is load-bearing** and identical across combinatorics,
  decorations, word lists, and Cayley edges.
- **`validate(spec)` runs before any solve** (angle-sum trichotomy, spherical
  definiteness, Andreev inequalities) and fails with a mathematical reason.
- **Every solver verifies its postcondition**: re-derive the realized
  combinatorics from the solved walls (hull engine) and check it against the
  spec. You get walls that provably realize your combinatorics, or an error.
- **Seeds and numerical strategy are invisible but not inaccessible**: an
  options bag (`initialGuess?`, `continuationPath?`, tolerances) — never part
  of the spec.
- The spec is **internal** (and a handy hand-written fixture format). The
  public/Python contract stays pure group theory.

### The solver dispatch table

`(geometry, dim) → solver`. Simplices collapse to one shared path in all six
cells: their decorations determine the Gram matrix outright, and the
generalized diagonalization (`realize` accepting all three signatures) reads
off the walls.

| | 2D | 3D |
|---|---|---|
| **S** | triangles only — rigid, simplex path | tetrahedra — rigid, simplex path |
| **E** | 3 triangles + the square (moduli → inscribed circle) | simplices + products (boxes, prisms) — **moduli story to be worked out** |
| **H** | Porti canonical polygon (port) | Andreev + Newton/LM (port), with **seedless initialization**: realize the dual graph as a convex Euclidean polyhedron (Tutte embedding + lifting, combinatorially verified), polarize, scale into the ball, convert to Lorentz normals; straight-line angle continuation as fallback; Roeder's Whitehead-move homotopy as the later guaranteed global initializer |

The graph-realization subroutine ("convex Euclidean polyhedron with a
prescribed 3-connected planar 1-skeleton") is **shared infrastructure**, not
buried in the H³ solver — the Euclidean cell and future UI want it too.

### The inference layer (deliberately later)

Abstract Coxeter matrix → spec: recognize finite/affine systems
(classification), infer FD combinatorics (2D: finite m_ij ⇔ adjacent walls,
already understood; 3D: dual graph from finite entries + Steinitz validation,
designed in COX_COMPUTE — "Route A"). Building this layer is its own phase,
after the solvers exist and are trusted. Until then, specs are written by
hand (fixtures, demos).

## 5. Phases

**Phase 0 — scaffold.** Vite + strict TS, `demos/<name>/main.ts` +
run-demo script, vitest, typecheck, CLAUDE.md, glossary. Design docs moved
in/adapted.

**Phase 1 — geometry substrate** (from homogeneous-spaces, re-derived +
trimmed). `math/`, `Geometry<P,I>` for the six cells, `Hyperplane`
(wall = covector, reflection per geometry), models with the straight
chart designated per geometry. Euclidean isometries as homogeneous matrices.

**Phase 2 — polytope engine** (from hyperbolic-polytopes, re-derived).
Hull in the straight chart, V/E/F lattice, `fromVertices`/`fromHalfspaces`,
transforms, views. Spherical hemisphere policy handled explicitly.

**Phase 3 — the seam + solvers.** `RealizationSpec`, `validate`, dispatch;
universal simplex solver; Porti (2D H); the small 2D E/S cases; 3D H with
seedless initialization (careful Roeder read happens here). 3D E deferred
until the moduli discussion. Postconditions everywhere.

**Phase 4 — group layer.** `CoxeterGroup` generic over the six cells, orbit
BFS with per-geometry dedup tolerances (spherical exhausts; Euclidean and
hyperbolic entries grow differently), Cayley graph, word images, tessellate.

**Phase 5 — geometric computations.** Areas via Gauss–Bonnet (2D);
elementary volumes (S³/E³); hulls of tile sets; H³ volume (Lobachevsky
functions) as its own research-flavored item.

**Phase 6 — schema, `render()`, bundle, Python.** As in
`coxeter-viz-DESIGN.md`: freeze schema v0 (group form = the Coxeter matrix),
single `render(container, scene)` entry, Vite library bundle, HTML exporter,
thin Python builder. The inference layer (§4) lands alongside so the Python
seam can be purely group-theoretic.

### Milestones cut vertically, not horizontally

**Milestone 1 (the proof of the unification): 2D end-to-end, all three
geometries.** Spec → simplex/Porti solvers → `CoxeterGroup` → tessellation +
Cayley graph, drawn correctly through at least two models per geometry, in
one demo. This stress-tests every risky unification decision (Euclidean
homogeneous matrices, covector walls, straight-chart hulls incl. the S²
hemisphere question, dedup tolerances) with minimum code on top.

**Milestone 2: 3D across S/E-simplex/H.** Port of the polytope engine at
full depth + the seedless H³ solver.

**Milestone 3: computations + word-list features** (hulls, areas/volumes,
tile/Cayley coloring by word lists).

**Milestone 4: the product layer** (schema, bundle, Python, inference).

## 6. Open questions (parking lot)

- **Euclidean 3D moduli**: which combinatorial types to admit (simplices,
  boxes, prisms, other products?) and what inscribed-sphere canonicality
  selects for each. Needs its own session.
- **Spherical hull policy**: hulls in the gnomonic chart need the point set
  in an open hemisphere — fine for chambers, false in general. Rotate to
  fit / detect and refuse / spherical-specific hull?
- **H³ volumes**: Lobachevsky-function formulas vs. numerical integration;
  how exact do we want to be?
- **Dedup for deep orbits**: per-geometry quantization now; a Coxeter
  automaton (Tits / ShortLex) is the eventual correct answer.
- **Non-compact (ideal/hyperideal) chambers**: detect and refuse with a good
  message in v1; drawing them is future work.
- **How much homogeneous-spaces generality survives the trim** (proposal:
  copy the interfaces and the six quadric fast-path geometries; leave
  NumericGeometry/capabilities behind until needed).
- **When the reactive Params/View harness comes in** (Phase 0 vs. with the
  schema layer).
- **Names**: repo, pip package, JS import (candidates: coxeter-viz, wythoff,
  kaleidoscope — check availability).
