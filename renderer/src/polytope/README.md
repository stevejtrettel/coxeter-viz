# `polytope/` — the polytope-from-data engine

Build a convex polytope's full vertex/edge/face lattice from either its
bounding **walls** (`fromHalfspaces`) or its **vertices** (`fromVertices`),
in any of the six geometry cells, and carry it by isometries. Pure data — no
rendering. Depends on `geometry/` and `math/`.

## The mathematics

**Combinatorics is computed projectively and is model-free.** Convexity and
incidence live in the straight-geodesic chart (Klein / gnomonic / the plane),
where they are ordinary Euclidean convex geometry. We compute the face
lattice once, on canonical ambient coordinates, and any model can draw it.

**The vertex solve is a plain cross product.** A vertex incident to d walls
satisfies cᵢ·v = 0 (the plain pairing — no J). So the candidate vertex of
walls i,j (2D) or i,j,k (3D) is the ordinary orthogonal complement:
`v = cᵢ × cⱼ` (3D ambient) or the 4D triple cross of the covectors. This is
one J-free formula for all three geometries — the payoff of making the
covector the fundamental wall datum. Dually, the wall through d points is
the same cross product *of the points* (incidence is symmetric).

**Brute-force facet enumeration, deliberately.** `fromHalfspaces` tries every
d-subset of walls, keeps a candidate iff it is a *finite point of the
geometry* (see below) lying weakly inside every half-space, and dedupes by
quantized ambient coordinates. This is O(N^d)-crude and degeneracy-robust —
the symmetric polytopes we build are maximally degenerate, and robustness
beats asymptotics at our sizes. Edges join vertices sharing ≥ d−1 walls
(adequate for our polytopes; exotic degeneracies would need a genuine 1-face
test — documented caveat). A facet's 2-face is its vertex loop, cyclically
ordered in a planar chart of the facet.

**Finite-vertex test per geometry** (the raw cross-product vector v):
- S: any v ≠ 0 normalizes to a point — but to *two* antipodal ones; the
  half-space test selects the sign (or rejects both).
- E: finite iff v₀ ≠ 0 (v₀ = 0 is the intersection at infinity of parallel
  walls) — skipped.
- H: finite iff ⟨v,v⟩ < 0 (timelike); lightlike/spacelike candidates are
  ideal/hyperideal vertices — skipped in v1, hook preserved via `VertexKind`.

**`fromVertices` is the dual pass**: every d-subset of points proposes a
supporting wall (their cross product); it survives iff all points lie weakly
on one side (then oriented outward); the surviving walls feed
`fromHalfspaces`.

**The spherical hemisphere policy** (decided in PLAN.md): all planar-ordering
charts for S are gnomonic charts **centered on the vertex centroid**
(rotate-to-fit); if any vertex is ≥ 90° from the centroid direction — e.g. a
lune's antipodal vertices, or a vertex set spanning a hemisphere — we
**throw** a hemisphere error rather than return wrong combinatorics.
`fromVertices` additionally pre-checks its input points the same way
(conservative: a point set may fit some hemisphere yet fail the centroid
check; v1 accepts the false refusal, documented here).

**Isometry transport** (`transform.ts`): an isometry g carries a polytope to
its image with the *same* face lattice, so we never re-hull: vertices map by
v ↦ g·v and wall covectors **contravariantly** by c ↦ (g⁻¹)ᵀc
(`geometry.applyDual`), which keeps side values equivariant. In the
hyperbolic-only parent this distinction was invisible (O(n,1) preserves the
form); with Euclidean homogeneous matrices it is real and tested.

## Measures (M3.1)

2D measures, exact through the geometry — no numerical integration:

- **Polygon area** (geodesically convex vertex loops): S/H by **Gauss–Bonnet**
  — the area IS the angle excess/defect, |Σθᵢ − (n−2)π|, with interior angles
  from `log` at each vertex (cos θ = ⟨u,w⟩/(|u||w|) on the tangent pair); E by
  the **shoelace** in the affine slice (Gauss–Bonnet degenerates to 0 = 0
  there). The classical pins are the tests: the (2,3,7) chamber is exactly
  π/42, the (2,3,5) chamber 4π/120, and the 120 spherical tiles sum to 4π —
  the tessellation audits its own group order.
- **Polygon perimeter**: the edge-distance sum.
- **Circle measures**, the κ-trig closed forms: circumference 2π·sin_κ(r)
  (sin r · r · sinh r) and area 2π(1 − cos r) · πr² · 2π(cosh r − 1) — one
  row, consistent with the rest (adopted 2026-07-06; no consumer yet).

## Contents

| file | contents |
|---|---|
| `Polytope.ts` | the `Polytope<P>` value: canonical vertices + `VertexKind`s, edges, 2-face loops, wall `Hyperplane`s |
| `build.ts` | `fromHalfspaces2/3`, `fromVertices2/3`; the cross-product vertex solve; the hemisphere-checked planar ordering |
| `transform.ts` | `transformPolytope`: the isometry image (O(V+F), exact) |
| `measure.ts` | M3.1: `polygonArea`, `polygonPerimeter`, `circleCircumference`, `circleArea` |

## Used by

`coxeter/` (a chamber is `fromHalfspaces(mirrors)`; tessellation transports
the chamber by orbit elements), and later the hull-of-tiles ops (Phase 5).
