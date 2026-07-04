# `coxeter/` — the seam and the solvers

From a **RealizationSpec** (the decorated combinatorial polytope — the
internal seam fixed in PLAN.md §4) to a **realized chamber**: walls as
covectors in canonical position, verified against the spec. Everything above
this folder's entry point is exact/combinatorial; everything below it is
numeric. Depends on `geometry/`, `polytope/`, `math/`.

Phase 3a implements the 2D pipeline. The 3D solvers (Gram simplex solver,
seedless LM polyhedron solver, E³ products) are Phase 3b.

## The spec and validation (`spec.ts`)

A 2D spec is a polygon: `cyclicOrder` lists the **generator indices** of the
walls in cyclic order (generator indexing is load-bearing everywhere), and
`decorations` put an integer order m ≥ 2 on each *meeting* pair — which, in
a polygon, is exactly the cyclically-adjacent pairs. Validation checks:

- `cyclicOrder` is a permutation of 0…n−1, n ≥ 3 (digons/lunes refused);
- every adjacent pair carries exactly one decoration, and **no non-adjacent
  pair is decorated** (non-adjacent polygon sides do not meet; decorating
  them contradicts the combinatorics);
- orders are finite integers ≥ 2 (m = ∞ means a non-compact polygon —
  refused in v1 with its own message);
- **classification**: with vertex angles βₖ = π/mₖ, compare Σβ against
  (n−2)π — done in exact integer arithmetic (Σ P/mₖ vs (n−2)P for
  P = Πmₖ, so the Euclidean equality case is decided exactly:
  spherical > , euclidean = , hyperbolic <. For n ≥ 4 spherical is
  impossible (angles ≤ π/2). The declared `geometry` must agree with the
  classification, or validation fails naming both — this is a first piece of
  the future inference layer, living where it belongs.

## The 2D solver: the inscribed-circle polygon (`polygon.ts`)

One construction realizes **every** compact 2D Coxeter polygon in all three
geometries (Porti's minimum-perimeter polygon, generalized over curvature).
Place the incenter at the origin and every wall tangent to the circle of
radius r, with outward normal at angle φₖ. The wall at angle φ, distance r:

| geometry | covector c(φ, r) | side(origin) |
|---|---|---|
| S | (−sin r,  cos r·cosφ,  cos r·sinφ) | −sin r |
| E | (−1,  cosφ,  sinφ)  (r ≡ 1: the scale modulus, fixed) | −1 |
| H | (−sinh r,  cosh r·cosφ,  cosh r·sinφ) | −sinh r |

Requiring walls k, k+1 to meet at interior angle βₖ (⟨nₖ,nₖ₊₁⟩ = −cos βₖ)
forces the angular gap

```
Δφₖ = 2·arcsin( cos(βₖ/2) / C(r) ),    C(r) = cos r | 1 | cosh r  (S | E | H)
```

and the polygon closes up iff Σ Δφₖ = 2π:

- **E**: C ≡ 1 gives Δφₖ = π − βₖ, and closure is *identically* the
  Euclidean angle condition Σβ = (n−2)π — no root solve; validation already
  guaranteed it.
- **H**: closure is strictly decreasing in r from Σ(π−β) − 2π > 0 down to
  −2π; bisect for the unique root.
- **S**: closure is strictly increasing in r on [0, β_min/2]; bisect. (A
  valid spherical triangle always closes; the solver still guards.)

Uniqueness and minimal perimeter for H are Porti's theorem (Geom. Dedicata
156 (2012)); for n = 3 the construction just finds *the* triangle (rigid,
and every triangle has an incircle); the E square/triangles and S triangles
are the same statement in their geometries.

Output: covectors indexed **by generator** (the cyclic position is unwound),
the Gram matrix ⟨nᵢ,nⱼ⟩ as a byproduct (for E this is the Gram of wall
*directions*; offsets are invisible to a degenerate form), the inradius, and
diagnostics.

## The entry point and postcondition (`solve.ts`)

`solvePolygon(spec)`: validate → construct → **verify**. The postcondition
re-derives the chamber with the polytope engine (`fromHalfspaces2`) and
checks it against the spec — n finite vertices, each wall carrying an edge,
and ⟨nᵢ,nⱼ⟩ = −cos(π/m) on every decorated pair — then returns the realized
bundle: geometry instance, walls (`Hyperplane`s), chamber (`Polytope`),
gram, inradius, diagnostics. The origin is a canonical interior point
(equidistant from all walls) — the natural Cayley-graph base point for
Phase 4.
