# coxeter-viz — build plan

> Status: **building** — Phases 0–2, 3a, and 1b (own linear algebra,
> retrofit; §5.2b) complete (see CLAUDE.md for the current state); this
> document remains the collaboratively-edited plan.
> Companion: `docs/DESIGN-original.md` (the original product design), which
> this plan supersedes where they disagree (notably: the role of the Gram
> matrix).

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

### The solver collection

**(Revised during Phase 3a scoping — the Gram path is 3D-only.)**

| solver | covers | notes |
|---|---|---|
| **inscribed-circle polygon** (κ-Porti) | *all of 2D*: S/E/H, simplex and non-simplex alike | Porti's construction is not hyperbolic-specific: walls tangent to an incircle of radius r about the origin, normal gaps Δφᵢ = 2·arcsin(cos(βᵢ/2)/C(r)) with C = cos r (S), 1 (E — closes with **no root solve**, exactly when the data is Euclidean), cosh r (H). Triangles are the n = 3 case (0 moduli; every triangle has an incircle). One 2D solver, **no Gram/diagonalization anywhere in 2D**, every chamber in canonical position (incenter = origin — the natural Cayley base point). |
| **Gram simplex solver** (diagonalize) | all 3D simplices: S³, E³ (+ offsets-=-1 insphere step), H³ Lannér | The Gram path earns its keep only in 3D: Andreev's theorem excludes tetrahedra (they have their own existence theory — for simplices it IS the Gram signature), S³/E³ have no numeric solver, and diagonalization is exact and closed-form. |
| **LM polyhedron solver** (seedless) | H³, ≥ 5 walls | Andreev-gated Newton/LM with **seedless initialization**: realize the dual graph as a convex Euclidean polyhedron (Tutte embedding + lifting, combinatorially verified), polarize, scale into the ball, convert to Lorentz normals; straight-line angle continuation as fallback; Roeder's Whitehead-move homotopy as the later guaranteed global initializer. Phase 3b, with the careful Roeder read. |
| **E³ product solver** | box, prisms | after the E³ enumeration/moduli discussion. S³ non-simplices don't exist (chambers of finite reflection groups are simplices). |

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

**Phase 0 — scaffold.** Detailed plan in §5.1 below.

**Phase 1 — geometry substrate** (from homogeneous-spaces, re-derived +
trimmed). `math/`, `Geometry<P,I>` for the six cells, `Hyperplane`
(wall = covector, reflection per geometry), models with the straight
chart designated per geometry. Euclidean isometries as homogeneous matrices.
**Decided:** only the quadratic-form fast-path geometries (Sⁿ/Eⁿ/Hⁿ) come
over; `NumericGeometry` and the capability system stay behind.

**Phase 1b — own the linear algebra** (decided 2026-07-04, retrofit; detail
in §5.2b). Replace the three.js value types — an *inherited, never-decided*
assumption from the parents — with our own flat `Float64Array` layer in
`src/math/`; three.js exits `src/` entirely (mechanically enforced by a
permanent test) and remains only a demo / future-render3d dependency.

**Phase 2 — polytope engine** (from hyperbolic-polytopes, re-derived).
Hull in the straight chart, V/E/F lattice, `fromVertices`/`fromHalfspaces`,
transforms, views. Spherical hemisphere policy handled explicitly.

**Phase 3 — the seam + solvers.** Split: **3a** = the seam (`RealizationSpec`
+ `validate` with classification cross-check) and the single κ-Porti 2D
solver with postconditions — everything Milestone 1 needs. **3b** (after
Milestone 1) = the 3D solvers: Gram simplex solver, seedless H³ LM pipeline
(careful Roeder read first), E³ products after the moduli discussion.

**Phase 4 — group layer.** `CoxeterGroup` generic over the six cells, orbit
BFS with per-geometry dedup tolerances (spherical exhausts; Euclidean and
hyperbolic entries grow differently), Cayley graph, word images, tessellate.

**NEXT (chosen 2026-07-05, after both render systems shipped): the 2D
group layer, toward Milestone 1.** PLANNED — the planning session ran
2026-07-05; its agenda (kept below for the record) is settled in §5.4:

- **The seam**: the layer sits after `coxeter` — presumably it consumes a
  `RealizedPolygon` (walls → generators via `geom.reflection`) plus the
  spec's exact data; what exactly does a group element carry (word, matrix,
  length, parity)?
- **Enumeration & dedup**: BFS over words with per-geometry quantization
  (spherical exhausts — check against known orders; H matrix entries grow
  exponentially — dedup on the orbit of an interior point instead?); the
  Tits/ShortLex automaton stays the eventual correct answer (§6).
- **Depth policy**: fixed word-length cap vs geometric cutoff (stop when a
  tile's screen extent would cull — but canonical data is camera-free, so
  a geometric cutoff needs an intrinsic proxy; decide honestly).
- **Identity**: tile id = the word (shared indexing law); Cayley vertices =
  orbit of the incenter, edges labeled by generator index — fix the id
  scheme once, here.
- **Output vocabulary**: the layer emits Scene items (polygons for tiles,
  points/segments for Cayley) or its own structures the demo converts?
  Immediate mode says canonical data is built once and re-rendered freely.
- **Success criterion (Milestone 1)**: (2,3,7), (2,4,4), (2,3,5)
  tessellations + Cayley graphs, drawn through at least two models per
  geometry — including the (2,3,5) on the perspective globe.

**Phase 5 — geometric computations.** Areas via Gauss–Bonnet (2D);
elementary volumes (S³/E³); hulls of tile sets; H³ volume (Lobachevsky
functions) as its own research-flavored item.

**Phase 6 — schema, `render()`, bundle, Python.** As in
`coxeter-viz-DESIGN.md`: freeze schema v0 (group form = the Coxeter matrix),
single `render(container, scene)` entry, Vite library bundle, HTML exporter,
thin Python builder. The inference layer (§4) lands alongside so the Python
seam can be purely group-theoretic.

### 5.1 Phase 0 in detail — scaffold

Tooling is infrastructure, not mathematics: the "re-derive everything" rule
targets math code. For tooling we adapt the proven setup from
`hyperbolic-polytopes` (the leaner, newer parent) with understanding, keeping
its two good ideas: **no `index.html` files on disk** (a Vite plugin
synthesizes each demo page and a clickable index at `/`), and **one dev
server per demo** on consecutive free ports.

Deliverables:

| file | contents / provenance |
|---|---|
| `package.json` | name `coxeter-viz` (placeholder, private — final name is an open question), `type: module`; scripts `dev`/`build`/`preview` (via run-demo), `typecheck`, `test`, `test:watch`; deps: `three` ^0.184; devDeps: `@types/three`, `typescript` ~5.9, `vite` ^7, `vitest` ^4. No `lil-gui` yet — it enters with the Params-harness decision. |
| `tsconfig.json` | the parents' strict config verbatim-in-spirit: ES2022, bundler resolution, `strict`, `noUnusedLocals/Parameters`, `erasableSyntaxOnly` (no parameter properties / enums), `@/*` → `src/*` |
| `vite.config.ts` | `base: './'`, `@` alias, the `demoPages()` plugin (adapted; drop the parent's demo-specific middleware) |
| `vitest.config.ts` | `tests/**/*.test.ts` |
| `scripts/run-demo.mjs` | adapted: multi-demo dev servers, per-demo `dist/<name>` builds via a throwaway root `index.html` |
| `.gitignore` | `node_modules/`, `dist/` |
| `docs/DESIGN-original.md` | `coxeter-viz-DESIGN.md` copied in for reference, with a header noting PLAN.md supersedes it where they disagree |
| `demos/hello/main.ts` | a minimal three.js scene (nothing mathematical) proving the whole chain; **deleted when the first real demo lands** |
| `tests/smoke.test.ts` | one trivial test proving vitest wiring; replaced by real tests in Phase 1 |

No `src/` folders in Phase 0: per rule 3, each layer folder is created
together with its `README.md` spec when its phase begins — empty folders
with placeholder READMEs would invert that.

Acceptance (all must pass before Phase 0 is done):

- `npm install` clean;
- `npm run dev hello` serves the demo; `/` lists demos;
- `npm run build hello` emits `dist/hello/`;
- `npm run typecheck` and `npm run test` pass;
- CLAUDE.md and PLAN.md agree with what was actually built.

### 5.2 Phase 1 in detail — geometry substrate

The mathematical conventions, fixed here once:

- **Coordinate 0 is distinguished and comes first** (the parents' time-first
  convention, extended): ambient R^{n+1} with form **J = diag(κ, 1, …, 1)**,
  κ = +1 (S), 0 (E), −1 (H). Points: ⟨p,p⟩ = 1 (sphere), the slice p₀ = 1
  (Euclidean), ⟨p,p⟩ = −1 with p₀ > 0 (hyperboloid). The origin is
  (1, 0, …, 0) in all three. Unit curvature throughout v1.
- **A wall is fundamentally a covector c** (normalized cᵀJc = 1); its **pole
  is p = Jc**; incidence/side is the plain pairing c·p; and the reflection is
  the **uniform formula R = I − 2 (Jc) cᵀ** in all three geometries. In E the
  covector (−d, a) carries the affine offset that the (degenerate) pole
  (0, a) cannot — so `fromPole` exists for S/H and *throws* for E with a
  mathematical explanation.
- exp/log/distance via the κ-trig pair (cos/sin, identity, cosh/sinh); the
  Euclidean cell is exact affine arithmetic, not a limit.
- Isometries: `Matrix3`/`Matrix4`; Euclidean elements are automatically
  homogeneous ([[1,0],[t,R]] shape) because reflections preserve the slice.

Files (each `src/` folder README written first, as the spec):

| file | contents |
|---|---|
| `src/math/README.md`, `symmetricEig.ts`, `linearSolve.ts` | generic numerics: cyclic Jacobi eigensolver for symmetric matrices; Gaussian elimination with partial pivoting |
| `src/geometry/README.md`, `types.ts` | `Geometry<P,I>`: kind, dim, `form`, `pairing`, `dual` (J·), `origin`, `normalize`, `distance`, `exp`, `log`, `geodesic`, `identity`, `apply`, `compose`, `inverse`, `reflection(wall)` |
| `src/geometry/ambient.ts` | the shared ambient toolkit: κ-forms, duals, the uniform reflection matrix, for Vector3/Matrix3 and Vector4/Matrix4 |
| `src/geometry/Spherical.ts`, `Euclidean.ts`, `Hyperbolic.ts` | the six cells: `Spherical2/3`, `Euclidean2/3`, `Hyperbolic2/3` |
| `src/geometry/Hyperplane.ts` | wall = covector + pole; `fromCovector` / `fromPole`; `side` |
| `src/models/README.md`, `types.ts` | `Model<P>`: project/unproject, `scaleAt`/`jacobianAt`, `renderDim`, `domain`, and the **`straight` flag** designating the computational chart |
| `src/models/klein.ts`, `gnomonic.ts`, `cartesian.ts` | the straight charts: Klein disk/ball (H), gnomonic (S, hemisphere domain), the plane/space itself (E) |
| `src/models/poincare.ts`, `stereographic.ts` | the conformal charts (H, S) |
| `src/models/globe.ts` | `Globe2`: S² drawn as the round sphere in R³ (isometric) |
| `src/models/radial.ts` | shared helper for rotationally-symmetric charts: jacobian from radial/transverse scales |
| `tests/math.test.ts`, `geometry.test.ts`, `reflections.test.ts`, `models.test.ts` | see below |

Tests pin the mathematics:

- exp/log round-trips, distance checks against closed forms, normalize
  idempotence — per geometry;
- reflections: R² = I, form preservation, wall fixed pointwise, sides swap;
- **the Coxeter-flavored invariant**: two walls meeting at angle π/m have
  (R₁R₂)^m = 1 — verified in all three geometries;
- models: project∘unproject = id, straight charts send geodesics to straight
  lines, conformal `scaleAt` matches numerical differentiation of
  project∘exp, Globe2 isometric;
- eigensolver reconstructs QΛQᵀ; linear solver on random systems.

Acceptance: `typecheck` + `test` green; every new folder has its README-spec;
no downward imports (math ← geometry ← models); `hello` still builds.

### 5.2b Phase 1b in detail — own the linear algebra

**Decision record (2026-07-04).** The core's use of three.js
`Vector3`/`Matrix3`/`Vector4`/`Matrix4` was inherited from
homogeneous-spaces and never surfaced as a decision (a process failure —
inherited elements must be flagged as forks, per the working norms).
Decided: own the types. Every design element below traces to the user's own
repos (limit-sets `src/core/matrix.ts`, `verify.ts`) or an explicit ruling
in the planning conversation. **Semantics freeze:** types and idioms change;
no algorithm, tolerance, or convention changes.

**The layer** (`src/math/vec.ts`, `mat.ts`):

- Vectors and matrices are flat `Float64Array`s (matrices row-major, n
  inferred from length, so one kernel serves 3×3 and 4×4 alike).
- **Immutable free functions** — every op returns a fresh array; reads like
  the mathematics (`pairing(c, p)`, not method chains).
- Readable constructors `vec3/vec4/mat3/mat4` (rows in, flat out).
- **Indexed components** `v[0]` — coordinate 0 is the distinguished one;
  kills the three.js confusion where `.x` denoted the time/affine coordinate.
- **Documentation aliases, placed by which world the object lives in**
  (the limit-sets `verify.ts` pattern — names and stampers do the work;
  compiler-enforced brands are parked, §6). `Covec3/4` live in `math/`
  beside `Vec3/4`: vector and covector are both *linear* objects (V and
  V*), and their pairing needs no geometry. `Point2/3` is *geometry's*
  concept — an element of the nonlinear locus, not a linear object — so its
  alias lives in `geometry/types.ts`, produced by `normalize` (the stamper),
  with wall constructors and `applyDual` stamping covectors.

**Translation table** (from the call-site grep: 16 src + 5 test files):
`a.clone().multiplyScalar(s)` → `scale(a,s)`; `.addScaledVector` →
`addScaled(a,b,s)`; `.add/.sub/.dot` → `add/sub/dot(a,b)`;
`.length/.lengthSq` → `norm/normSq` (Euclidean render/chart norms; ambient
J-forms stay in `geometry.form`); `new Vector3` / `Matrix3().set` →
`vec3(…)` / `mat3(rows)`; `.applyMatrix3/4` → `applyToVector(M,v)` on
vectors, `applyToCovector(M,c)` (= c·M) on covectors — the two actions are
different, per limit-sets `verify.ts`, and wall transport is
`applyToCovector(matInverse(g), c)`;
`.invert/.transpose` → `matInverse/matTranspose`; `crossVectors` →
`cross(a,b)` (the 4D triple cross moves into `math/` from the polytope
engine); `.toArray/.getComponent(i)` → the array itself / `v[i]`.

**Increments** (each ends `typecheck` + `test` green; checkpoint between):

- **I1 — the layer** (purely additive): `vec.ts`, `mat.ts`, kernel tests
  (inverse·M = I, transpose involution, cross/tripleCross orthogonality,
  outer-product identity), README update.
- **I2 — the sweep**: capture `solvePolygon` snapshots (walls, gram,
  inradius, vertices; all three geometries) *before*, then migrate
  geometry → models → polytope → coxeter → tests in one mechanical pass
  guided by the table; snapshots must match to 1e-12. One increment, not
  per-layer shims: the types thread through every generic signature, and
  temporary adapters would cost more review than they de-risk.
- **I3 — enforcement + docs**: permanent test failing on any `from 'three'`
  under `src/`; README/PLAN/CLAUDE updates. `three` stays in package.json
  (demos/hello now, render3d later).

**Acceptance:** all green; zero three.js imports in `src/` (enforced);
snapshots ≤ 1e-12; READMEs agree with code.

### 5.3 The visualization architecture — DECIDED: two separate systems

**(Decided 2026-07-04, after the rejected R1 attempt.)** Visualization is
**two totally separate systems**, each with its own rigorous plan (written
and approved before any code, in its own session):

1. **The 2D system — NO three.js.** Draws the flat charts (Klein, Poincaré,
   gnomonic, stereographic, Cartesian). Rendering technology (SVG /
   Canvas2D / other) is the first thing its plan must decide.
2. **The 3D system — built on three.js.** Draws renderDim-3 content: the S²
   globe now; H³/S³/E³ in the 3D era. Planned separately, later.

History: an earlier R1 attempt (one three.js render layer with dual
tube/ribbon stroke backends) was built in one burst on 2026-07-04 and
rejected + deleted — both for how it was built (see CLAUDE.md working
norms: plan before code, small increments) and because it blurred exactly
this 2D/3D boundary.

**Questions the 2D system's plan must settle** (first session's agenda):

- **The "no three.js" boundary — RESOLVED by Phase 1b (§5.2b).** The core
  now owns its linear algebra (flat `Float64Array` vectors/covectors/
  matrices); nothing under `src/` imports three.js, and a permanent test
  enforces it. "No three.js in the 2D system" is literal: its inputs are
  the core's own types, no adapter needed.
- Rendering target: SVG (crisp, vector-exportable, DOM events, slower for
  thousands of tiles) vs Canvas2D (fast, raster) vs both behind one scene
  description. Note the eventual product exports self-contained HTML — SVG
  export is a natural fit for *paper figures*, a stated user interest.
- The stroke model: geometric widths (intrinsic width × `model.scaleAt`,
  varying along a stroke — the parents' signature look, needs paths built
  as filled outlines) vs constant-width strokes (native SVG/Canvas strokes,
  simpler, diagram-like). Possibly both, but that choice burned R1 — ask,
  don't assume.
- Viewport/framing policy per chart (disk models are naturally framed;
  plane charts need a fit policy), pan/zoom, and export.
- Module decomposition + naming (e.g. `render2d/`; the layer law's `render`
  slot splits in two). The deleted R1's ideas — sample geodesic in canonical
  coords → project → per-point widths; jacobian-shaped vertex marks
  (ellipses in Klein); renormalized-barycentric fills; domain dressing;
  dispose-and-rebuild — are renderer-agnostic mathematics and remain
  *candidates* for the plan, not defaults.
- Demo/consumer surface: what a demo writes; the hand-rolled UI kit (no
  lil-gui — user finds it ugly) can be re-derived from the deleted R1's
  design if wanted.

#### 5.3.1 The 2D system — PLAN (decided 2026-07-04, collaboratively)

**Decisions:**

- **Canvas-first, SVG as export.** One backend-agnostic **path list** (styled
  filled paths in render coords) produced by the geometry pipeline; consumed
  by (a) the Canvas painter — immediate mode, the instrument — and (b) a
  one-file SVG serializer for paper figures. The exported figure is
  geometrically identical to the screen by construction. No SVG interactive
  backend, ever needed.
- **All styling is intrinsic** (the user's requirement, = the parents'
  signature look): strokes are FILLED OUTLINES — sample the canonical
  geodesic, project, offset ±(w/2)·J·n̂ per sample from `jacobianAt` (width
  varies along a stroke; anisotropic in Klein) — native constant-width
  strokes are unusable and unused. Points are jacobian-image ellipses of
  intrinsic radius. Geodesics are adaptively sampled (flatness +
  width-variation tolerances in px) even in straight charts (width still
  varies along a chord). No screen-width "diagram mode" in v1 — not built,
  not designed for.
- **The camera contains a group element**: view = affine viewport ∘
  `model.project` ∘ `apply(g, ·)`. Isometry dragging composes into g — the
  translation q₀ → q₁ is a product of two perpendicular-bisector
  reflections, built from the existing `Hyperplane`/`reflection` machinery.
  Content's canonical coordinates never change.
- **Scene items carry identity** ({id, kind, canonical data, style}; wall id
  = generator index, load-bearing as everywhere). Highlighting is a
  per-frame style override by id, never a scene mutation. Hit-testing is
  mathematical: `unproject` the pointer, side-test against walls — exact.
- **Immediate mode throughout**: every change (drag, highlight, model
  switch) rebuilds the path list and repaints; sub-pixel items are culled
  (deep-tessellation tiles shrink toward the boundary and drop out). No
  retained scene graph — the R1 trap.

**Module: `src/render2d/`** (README written first, as the spec): `types.ts`
(SceneItem / Style / Camera / path list), `sample.ts`, `stroke.ts`,
`marks.ts`, `scene.ts` (scene → path list: apply g, project, clip walls to
frame, cull), `canvas.ts`, `svg.ts`, `interact.ts`. Depends only on
math/geometry/models/polytope.

**Success criterion — the milestone that matters (V1): solid Point,
Geodesic, and Polygon primitives drawing correctly in multiple models per
geometry.** Concretely: the solved (2,3,7) H, (2,4,4) E, (2,3,5) S chambers
with their walls and incircles, each through its straight AND conformal
chart, in one demo, static camera.

**Increments** (small, checkpointed, `typecheck`+`test` green):

- **V0** — README spec + types; approved before any further code. **DONE,
  approved 2026-07-04** (`src/render2d/README.md` + `types.ts`), with three
  approved amendments: a fourth item kind `circle` (finite intrinsic radius,
  honestly sampled via exp — incircles need it, a jacobian ellipse is wrong
  at finite radius); types fixed to `Point2`/`Isometry2` (the 2D system is
  all this layer will ever be — no generics with a single instantiation);
  path-list representation details (interleaved `Float64Array` contours,
  even-odd fill, list order = paint order, flat `StyleOverride` bag, default
  tolerances) accepted PROVISIONALLY — revisit when V1 shows pictures.
- **V1** — sample/stroke/marks/scene + Canvas painter + the success-criterion
  demo above. **DONE, approved 2026-07-05** (`demos/render2d`; 22 tests pin
  the math), with amendments: the flatness criterion reads "projected
  midpoint vs. chord" as distance to the chord as a SEGMENT
  (parameterization-insensitive — a straight Klein chord's canonical
  midpoint lands on the chord but away from its center, so the
  chord-midpoint reading over-refines straight charts); gnomonic walls are
  clipped to the visible branch in closed form (p₀(s) = A·cos(s−φ) ⇒ branch
  = (φ−π/2, φ+π/2), bisected back to the frame), other spherical walls cap
  at |s| ≤ π; polygon edge strokes are one path per edge (overlapping
  butt-capped outlines in a single even-odd path cancel at corners) with
  butt-joined corners — proper joins are V2 polish if wanted; provisional
  constants pending pictures-driven review: wall-clip margin 40 px,
  boundary-accumulation threshold 0.25 px; the disk-chart domain circle in
  the demo is demo chrome — domain dressing proper is V2.
- **V2** — tile fills, domain dressing, culling polish, SVG export.
  **PLANNED 2026-07-05** (collaboratively; Milestone 1's `demos/group` is
  the driving data). Decisions:
  - **Cull before sampling** (user ruling: yes, if *clean code*): one
    conservative pre-test per item — the bbox of the projected defining
    points (vertices / center / endpoints), padded by the item's intrinsic
    radius × the max vertex `scaleAt` × a safety factor 2 (scale variation
    across a screen-small item is bounded; the factor covers conformal
    bulge) — skips sampling when off-frame or sub-cullPx. **Safety
    property, tested**: pre-cull may only drop items the existing
    post-sampling cull would also drop (checked by brute force against the
    full Milestone-1 scenes). Walls skip the pre-test (they are
    frame-clipped by construction). `keepContours` stays as the safety net.
  - **The geometry itself is drawable** (user ruling: "models should come
    with their own rendering command… shaded in, even for the sphere;
    boundary for the hyperbolic models"). Interpretation on record: `Model`
    stays pure math — its `domain` field IS the drawing instruction; the
    renderer interprets it via a **fifth scene-item kind `domain`**
    (canonical data: none — the model supplies it). Style: a fill (disk
    domains shade the disk; plane domains — Cartesian, stereographic,
    gnomonic — shade the whole frame, the chart's image being the plane)
    plus a **px-width rim** for disk boundaries. The rim is the ONE
    render2d exception to intrinsic styling, same as sphereview's globe
    rim and for the same reason: the disk boundary is at infinity (H) or
    is chart apparatus (Klein/Poincaré circle), so no intrinsic width
    exists. Emitted as an annulus fill through the same path list, so SVG
    export inherits it by construction.
  - **Fill honesty (robust regions)**: a polygon or circle whose image
    wraps through the chart's puncture (the stereographic far tile) bounds
    the COMPLEMENT of its projected loop; an even-odd fill would paint the
    wrong region. The layer detects and drops such fills: at full
    subdivision depth an adjacent-sample jump exceeding the expanded-frame
    diagonal marks the wrap (verify against the actual (2,3,5) far tile
    before trusting — an increment gate). Strokes need no new handling:
    wrapped edges produce finite off-frame outlines, and non-finite
    samples are already dropped by `keepContours`. `demos/group` then
    sheds its far-tile skip.
  - **SVG export**: `svg.ts`, a one-file string builder (no DOM), applying
    exactly the painter's viewport formula — the exported figure is
    geometrically identical to the canvas by construction (the V0 test
    hook). One `<path>` per RenderPath, `fill-rule="evenodd"`,
    `fill-opacity`, the item id as `data-id` (not `id`: one item emits
    several paths), coordinates at 2 decimals in px. A download button on
    `demos/group` (demo chrome).
  - **Dashed strokes stay parked** (asked 2026-07-05): already in §6 under
    sphereview stage 2; entry widened to cover the flat charts; evaluated
    after V2, not in it.
  - Sub-increments, each `typecheck`+`test` green: **V2.0** this plan +
    README amendments, approved before code — **DONE, approved
    2026-07-05** · **V2.1** pre-sampling cull + the safety-property test +
    a perf sanity check on the Milestone-1 scenes — **DONE 2026-07-05**,
    refinements: off-frame pre-culling restricted to straight
    NON-spherical charts (chords stay in the projected-point hull; conformal
    arcs bulge outside it, gnomonic segments can cross the horizon) and to
    segments/polygons (a circle reaches r from its one defining point);
    the pad is LAZY (it only expands the kept region, so on-frame
    super-cull items keep without evaluating distances/scaleAt — the
    full-view overhead vanishes); the safety test pins output IDENTITY
    (with vs without pre-cull) on six Milestone-1 panels incl. zoomed
    cameras. Measured: ~7× on zoomed Klein (23.5 → 3.3 ms/frame), ~2.7× on
    the E detail panel, no regression on full views ·
    **V2.2** the `domain` item + demos shed hand-drawn chrome — **DONE
    2026-07-05, pending the user's visual pass** (`DomainItem` in types;
    the builder emits the disk fill + px rim annulus or the frame
    rectangle for plane charts; render-space circles sampled to the
    flatness tolerance, no geodesic machinery; overrides ignored — view
    dressing, matching sphereview's globe precedent; sphereview's builder
    explicitly skips domain items in shared scenes; `demos/render2d` and
    `demos/group` shed their hand-drawn circles) ·
    **V2.3** wrap-around fill honesty + the demo's far-tile skip removed —
    **DONE 2026-07-05**, with the planned criterion REPLACED at its
    verification gate: the adjacent-sample-jump test cannot detect the far
    tile (its boundary stays away from the puncture — bounded, well-sampled
    loop, no jumps; the dishonesty is containment, not proximity). The
    shipped criterion is an interior-point winding test (circle center
    exactly / polygon normalized vertex mean, interior for geodesically
    convex loops; undecidable mean ⇒ keep), gated to spherical geometry by
    the compactness argument (every flat chart of S² is punctured or
    branched; H/E flat charts are embeddings, never tested). Pinned against
    the real (2,3,5) far tile under the tipped view, wrapped/at-pole/honest
    circles, and an H near-boundary polygon ·
    **V2.4** `svg.ts` + serializer tests + the export button — **DONE
    2026-07-05** (`toSvg(paths, camera, size)`: a pure string builder, the
    painter's viewport verbatim incl. the y-flip; one `<path>` per
    RenderPath with all contours in one `d` — the even-odd annulus rule
    survives export; `data-id`, `fill-opacity` only when ≠ 1, 2-decimal px,
    attribute escaping; degenerate contours skipped, empty paths omitted.
    Tests: a hand-checked synthetic list with exact `d` strings, a real
    Poincaré scene round-trip parsing coordinates back to ≤ 0.005 px, and
    escaping. `demos/group` panels now build one path list consumed by BOTH
    the painter and a per-panel SVG download button — the figure is the
    screen by construction, globe panel included). **V2 code complete;
    closes on the user's visual pass + a downloaded figure.**
- **V3** — interaction: screen zoom/pan, isometry dragging, hover highlight.
  **PLANNED 2026-07-05** (collaboratively; user rulings in). Decisions:
  - **Gestures**: wheel = zoom about the cursor (affine); drag = isometry
    drag (below); shift/middle drag = screen pan (affine). Interaction only
    produces new cameras + per-frame overrides; content never moves.
  - **Isometry drag = the double-bisector translation** (as decided at the
    §5.3.1 top): unproject prev/current cursor to view-space points a₀, a₁;
    T = R_bis(m,a₁)·R_bis(a₀,m) with m the geodesic midpoint; view ← T·view.
    Guards: outside-domain cursors, a₀ ≈ a₁, near-antipodal (S).
  - **`Hyperplane.bisector(geom, p, q)` lives in `geometry/`** (user
    ruling): covector ∝ J(q−p) in S/H (q−p automatically spacelike), the
    E covector written with its affine offset; side(p) < 0 fixed. It is the
    Dirichlet-domain primitive of Milestone 3+, not interaction-private.
    `Hyperplane.distanceTo(geom, p)` (κ-arcsin of the side value) joins it.
  - **Drift renormalization every 64 compositions** (user ruling; constant
    provisional): new `Geometry.renormalizeIsometry(g)` — J-Gram–Schmidt on
    columns for S/H (H: column 0 timelike, upper sheet), E: row-0 reset +
    spatial Gram–Schmidt + translation kept. Idempotent, exact
    J-orthogonality, O(ε) move on O(ε) drift.
  - **Hover highlight as an optional ability** (user ruling): `hitTest`
    (topmost, reverse paint order; convex-polygon containment via
    cross-covectors sign-matched to the vertex mean — V2.3's assumption and
    mean; circles/points by intrinsic distance, walls by `distanceTo`, px
    slop through `scaleAt`; `domain` never hit) → a `StyleOverrides` entry +
    repaint. Demos may use or ignore it.
  - **The globe stays static in V3** (user ruling), and sphere-view
    interactivity equal to the flat charts is a recorded WANT — see the §6
    sphereview entry (blocked on unproject + the sheet choice, not on this
    plan).
  - **Pure-function core, thin DOM shell**: camera transforms and hitTest
    are pure and unit-tested (vitest has no DOM); the controller adapter
    owns events and callbacks (`onCamera`, `onHover`); demos own the
    rAF-throttled rebuild loop (financed by V2.1).
  - Sub-increments, `typecheck`+`test` green: **V3.0** this entry + README
    amendments (render2d + geometry) — **DONE, approved 2026-07-05** ·
    **V3.1** the geometry primitives + tests — **DONE 2026-07-05**
    (`Hyperplane.bisector` / `distanceTo`, `Geometry.renormalizeIsometry`
    via `renormalizeIsometryMat` in ambient.ts; 30 tests across all six
    cells: reflection-in-bisector SWAPS p and q; the double-bisector
    translation maps p → q with J-orthogonality < 1e-12 and advances the
    midpoint to parameter 1.5; distanceTo inverts exp along the pole;
    renormalization is an exact projection, O(ε) move, idempotent to
    relative float noise, E translation column untouched; a 1000-step
    composition chain renormalized every 64 stays on the group) ·
    **V3.2** pure camera transforms + `hitTest` + tests — **DONE
    2026-07-05** (`interact.ts`: `zoomedCamera` / `pannedCamera` /
    `draggedCamera` / `unprojectScreen` / `hitTest`, `RENORM_EVERY = 64`;
    the caller owns the composition counter. Pinned: zoom fixes the cursor
    point and composes multiplicatively; the drag lands the grabbed
    content point under the cursor to 1e-8 px in Klein/Poincaré/Cartesian/
    stereographic with the view an exact isometry; guards return null; a
    600-step simulated Poincaré drag session with RENORM_EVERY stays on
    the group; hitTest pins topmost-wins, domain-never-hit, circle
    edge-vs-interior, wall half-width + slop, segment caps with slop-sized
    overhang, slop-through-scaleAt, and spherical convex containment) ·
    **V3.3** the DOM controller + `demos/group` live — **BUILT 2026-07-05,
    pending the user's hands-on pass** (`attachInteraction`: pointer/wheel
    adapter over the pure functions, owns the current camera and the
    RENORM_EVERY counter, `onPointer` hover feed ready for V3.4, grab
    cursors; `demos/group` flat panels are live — drag / shift- or
    middle-drag pan / wheel zoom — with per-panel rAF-throttled rebuilds,
    dragged-into views surviving resize (affine re-derived), and the SVG
    button exporting the CURRENT view; the globe panel is titled static
    per the ruling) · **V3.4** hover highlight in the demo — **BUILT
    2026-07-05, pending the user's hands-on pass** (the hovered TILE gets a
    per-frame fill override via the controller's onPointer feed + hitTest;
    the SVG export deliberately omits hover — transient UI state, not the
    figure). **Stage 2a addendum (globe rotation), user-directed
    2026-07-05, BUILT same day, pending the hands-on pass**: the sphere
    ruling ("static for now") was superseded by the user's request; §6's
    unproject-with-sheet-choice WANT is now RESOLVED —
    `SpherePerspective.unproject(u, sheet)` (the closed-form quadratic;
    front = root nearer the eye; null outside the silhouette; spec at the
    sphereview README stage-2a section), the controller generalized to a
    pluggable `ScreenUnprojector` (Model-backed for flat charts;
    front-sheet for the globe), camera transforms spread their input so
    SphereCamera.eyeDistance survives, and the demo's globe panel is live
    with the same double-bisector drag (an S² translation IS a rotation).
    Sphere hit-testing/hover stays parked in §6. **V3 CLOSED — hands-on
    approved 2026-07-05** ("works great": drag/pan/zoom on all flat
    panels, tile hover, globe rotation). **V2 closed with it** (the same
    sessions exercised domain dressing, fill honesty, and the SVG
    buttons).

- **P — the 2D polish sprint** (user-directed 2026-07-05, after V3
  closed). Retires the parked small items; plan decided here:
  - **P1 — dashed strokes.** `StrokeStyle.dash?: { on, off, phase? }` in
    INTRINSIC lengths (decided: dashes are content and size like every
    other stroke dimension — they shorten toward the Poincaré boundary; a
    screen-px dash would be a diagram-mode exception with no customer).
    Mechanics: all three curve generators are CONSTANT-SPEED in their
    parameter (segments: d(a,b); walls: unit; circles: sin_κ(r)), so dash
    chopping is exact parameter arithmetic (`dashRanges`, pure + tested);
    each ON range samples adaptively as its own open curve; all dash
    outlines are contours of ONE RenderPath (SVG inherits by
    construction, as §6 predicted). Polygon edges dash per-edge, phase
    restarting at each vertex (documented). > MAX_DASHES (1024) falls
    back to solid.
  - **P2 — stroke joins.** Poly­gon corners are butt-capped per edge (V1
    note): fill the corner with the JOIN DISK — the jacobian ellipse of
    intrinsic radius w/2 at the vertex (the markEllipse machinery),
    emitted as separate same-id paths (same-path contours would even-odd
    cancel against the edges). Documented tradeoff: translucent edges
    darken slightly at corners (formerly: notches).
  - **P3 — sphereview polish**: back-piece dashing (consumes P1; S² arcs
    are unit-speed), sphere hover (front-sheet hitTest), and
    straddling-fill cap clipping (the §6 stage-2 item; the heavy one,
    last). **DONE 2026-07-06**: `SphereBuildContext.backDash` (hidden-line
    convention; item dash wins on both sheets); `sphereHitTest`
    (interact.ts) over the extracted chart-free `hitTestCanonical`;
    **cap-clipped fills** (`clippedFillLoops`): pure-sheet boundary runs
    alternate with silhouette-circle arcs (crossings = the trig roots,
    p₀ = 1/d exactly; the silhouette projects angle-preservingly to the
    render circle; per gap, the contained arc — convexity gives one loop
    per sheet), plus the cap-wrap case (single-sheet boundary swallowing
    the silhouette ⇒ ring + far cap). SEMANTICS CHANGE, recorded: the
    stage-1 pins "straddling fills skipped" and "beyond-cap latitude
    circle's fill intact" are superseded — straddling regions now fill in
    both passes, and the latitude circle emits a back ring + the visible
    cap as a front disk (the old single back fill wrongly dimmed the whole
    region). The demo globe gets backDash + tile hover. Addendum
    2026-07-06 (user): `demos/sphereview` upgraded to the full instrument —
    drag rotation, wheel zoom, SVG export of the current view, dashed
    hidden lines (its single-chamber scene is where the hidden-line look
    actually reads; the group demo's full tessellation hides its own far
    side behind ~opaque front tiles — expected, not a bug).
  **SPRINT CLOSED — approved 2026-07-06** ("this is excellent"; the smooth
  silhouette-crossing tiles and the upgraded sphereview instrument both
  seen). Increments P1 → P2 → P3, each `typecheck`+`test` green, closing
  on the user's eyes. **P1 DONE 2026-07-05** (dashRanges + strokeContours; the
  wall sampler refactored to expose its unit-speed parameter range;
  resolveRegion carries dash — a passthrough the pipeline tests caught;
  pinned: hand-checked ranges/phase/fallbacks, a Poincaré geodesic whose
  equal intrinsic dashes shrink monotonically ~3× toward the boundary,
  circle-edge dash counts from sin_κ(r)·2π, per-edge polygon patterns,
  undashed output unchanged). **P2 DONE 2026-07-05** (join disks =
  markEllipse(w/2) per vertex, one extra same-id path per stroked
  polygon; exact w/2 circles pinned in E²; fill-only polygons emit no
  join path).

**Tests pin the math**: outline half-width at a sample ≈ (w/2)·|J·n̂|
against numerical differentiation; mark-ellipse axes = jacobian singular
values; sampled-polyline deviation under tolerance; serializer path
geometry identical to the painter's input; cull thresholds.

**Questions for the 3D system's plan** (later, its own session): scope (S²
globe only, until the 3D solvers exist?), the tube stroke pipeline
(parents' proven mechanics), theme, and its relationship to the 2D system's
scene description (shared styling vocabulary?).

#### 5.3.2 The perspective sphere view — stage 1 PLAN (decided 2026-07-05)

**Provenance**: user idea 2026-07-05 (parking lot), staged by the user the
same day (stage 1: translucent sphere, no dashing); width law decided by the
user 2026-07-05: **round tubes**.

**What it is**: a third consumer of the render2d path list — the SAME Scene
items and the SAME painters, through a perspective projection of S² instead
of a flat chart. S²-only; it is NOT a `Model` (two-sheeted: `unproject`
needs a sheet choice, deferred with hit-testing to the interaction stage).

**The view formula**: screen = V ∘ P_d ∘ apply(g, ·), with the eye on the
distinguished axis at distance d > 1 (canonical coordinates, so g ∈ O(3) is
the same view isometry as everywhere) and the image plane p₀ = 0:

    P_d(p) = (p₁, p₂) · d/(d − p₀)

`SphereCamera` = render2d `Camera` + `eyeDistance`.

**Width law (ribbons — user 2026-07-05, revising an initial tubes ruling
the same day: "it's a 2D view!")**: strokes are surface ink, exactly as in
every flat chart. J(p) = √(MMᵀ), the symmetric polar factor of the
perspective derivative M on an orthonormal tangent frame at p — the
frame-choice drops out (M ↦ MO leaves MMᵀ fixed), and J generalizes
`jacobianAt` verbatim: the V1 ellipse-membership tests apply unchanged.
Widths taper to a hairline where a curve meets the silhouette (ink seen
edge-on; cut ends feather rather than ending blunt); marks become slivers
near the horizon — honest edge-on disks. The tube alternative (isotropic
d/(d − p₀), full-bodied at the cut) stays a small variant if ever wanted.

**Visibility**: the visible cap is ⟨p, ê⟩ = p₀ > 1/d; the silhouette
p₀ = 1/d projects to the circle of radius d/√(d² − 1) (larger than the
equator's image — correct for perspective). Every stage-1 curve is a circle
in R³, so the sheet function h = p₀ − 1/d along any of them is
A·cos t + B·sin t + C: **splits are closed-form** (one trig-root helper),
no root-finding.

**Two-pass paint** (occlusion on a sphere is only front-over-back): back
pieces first, then the silhouette disk as an ordinary translucent filled
path (`SphereStyle`; a px-width rim allowed as view dressing — it is not
scene content), then front pieces. Back content dims by the disk's opacity,
for free.

**Fills**: drawn when the whole region lies on one sheet (back fills simply
dim under the disk); a region straddling the silhouette gets its boundary
drawn split as usual but its FILL SKIPPED — a loud refusal; proper region
clipping against the cap is stage-2 work if wanted.

**Enabling refactor in render2d** (type-only, no behavior change):
`sample`/`stroke`/`marks` accept a minimal `{project, jacobianAt}` chart
interface that `Model` satisfies structurally; the culling helper is shared.

**Module `src/sphereview/`** (README written first, as the spec):
`types.ts` (SphereCamera, SphereStyle), `projection.ts` (P_d, jacobian,
silhouette, trig splits), `scene.ts` (buildSpherePathList, two-pass).
Depends on math/geometry/render2d; no three.js.

**Tests pin the math**: stroke offsets lie on the jacobian ellipse of
P_d ∘ exp via numerical differentiation (the V1 harness, unchanged —
that test IS the ribbon semantics); J symmetric and frame-independent;
split points satisfy p₀ = 1/d exactly and pieces are pure-sheet;
back-disk-front emission order; disk radius d/√(d² − 1);
straddling-fill skip.

**Increments**: **P0** this plan + README spec + types + the render2d
chart-interface refactor · **P1** projection + splits + tests · **P2** the
builder + tests · **P3** demo — the V1 (2,3,5) chamber scene UNCHANGED,
viewed from an angle that wraps the walls' far arcs behind the sphere:
front arcs vivid, back arcs dimmed, widths shrinking with depth; screenshot
verified.

**Stage 1 DONE, approved 2026-07-05** (`src/sphereview/`,
`demos/sphereview`; 16 tests), with notes: a circle centered on the view
axis is a latitude circle (constant p₀) and can never straddle — beyond
the cap it is entirely back, fill intact (pinned by test after a wrong
test scenario assumed otherwise); point marks are classified whole by
their center; rootless closed curves are sampled open with coincident
endpoints (a butt-cap seam, invisible under dimming); the globe
disk/rim ignore style overrides (view dressing, not scene content).
Stage 2 (dashed back arcs) and the rest stay parked in §6.

### 5.4 Phase 4 in detail — the 2D group layer (decided 2026-07-05)

**Decision record.** Parent references: hyperbolic-polytopes
`coxeter/CoxeterGroup.ts`, `group/orbit.ts`, `CayleyGraph.ts`,
`CoxeterPolytope.ts` — re-derived, not copied, per the rules.

- **The seam**: the layer consumes a `RealizedPolygon`. It already carries
  everything the parent's constructor assembled by hand — the geometry
  instance, walls by generator index, the verified chamber, and the incenter
  at the origin (the canonical Cayley base point). The group derives
  `reflections[i] = geom.reflection(walls[i])` and verifies nothing else:
  the solver's postconditions already proved the realization.
- **An element is `{word, element}`** — the word (generator indices, applied
  left to right) and the isometry matrix. Depth (= `word.length`) and parity
  are derived, never stored.
- **A class** (user ruling; also the repo's own pattern — mathematical
  objects with construction invariants are classes, like `Hyperplane` and
  `Polytope`; the invariant here is walls/reflections aligned by generator
  index). Immutable, no lazy state — the parent memoized its fundamental
  domain, ours arrives pre-built. The generic orbit BFS stays a **free
  function** (`orbit.ts`): it needs only identity/compose/key, nothing
  Coxeter. Generic `CoxeterGroup<P, I>` with the 2D factory from
  `RealizedPolygon` — the phase header says "generic over the six cells"
  and Milestone 2 instantiates the 3D types, so this is not a
  single-instantiation generic (the render2d V0 objection doesn't apply);
  veto point if unwanted.
- **Word convention = the parent's = the glossary's**, matched at every
  composition site (user ruling: "make sure the ORDER matches the parent"):
  `word([i₀,…,i_k])` is the matrix R_{i_k}···R_{i₀} (i₀ applied first); BFS
  appends a letter by composing on the LEFT; the neighbor across wall i of
  tile g·F is g·R_i, word `[i, …w]` (prepending = composing on the RIGHT);
  Cayley edges join g to g·R_i. After dedup, an element's word is the first
  BFS word that reached it (shortest; ties broken by generator order);
  Cayley edges are found by matrix-key lookup, never word surgery.
- **Dedup**: the parent's quantized-matrix-entry key (quantum 1e-5 and
  maxCount default 5000 are inherited constants, kept for now). Documented
  limitation: H matrix entries grow like cosh(distance), so absolute
  quantization can split deep elements — fine at Milestone-1 depths; the
  Tits/ShortLex automaton stays the parked correct answer (§6).
- **Depth policy**: `maxWord` + `maxCount`, camera-free. No geometric
  cutoff: tiles are isometric copies (nothing intrinsic shrinks — only
  chart images do), and the camera-dependent cut lives where the camera
  lives: render2d already culls sub-pixel items per frame. Generate
  generously; the renderer culls.
- **Identity** (the id scheme, fixed once, here): a word serializes with
  `.` separators, the empty word as `"e"` (so `[0,1,2]` → `"0.1.2"`),
  provided by one helper (`wordId`) in the group layer. Downstream scene
  ids: `tile:<word>`, `cay:<word>`, `cayedge:<word>:<i>`.
- **Output vocabulary**: the layer emits **its own structures** (user
  ruling; the dependency law forces the direction anyway — group precedes
  the viz systems and cannot import them). A tile is
  `{word, element, polytope}` (the chamber carried by `transformPolytope`);
  the Cayley graph is combinatorial — nodes are elements, undirected edges
  {g, g·R_i} labelled by generator, each once — with geometric placement
  (node g at g·basePoint) immediate downstream. Conversion to render2d
  Scene items lives in the demo for Milestone 1, promotable to an adapter
  module if demos repeat themselves. No `CayleyGraphView` equivalent.
- **Left out deliberately** (parent features Milestone 1 doesn't need):
  `subgroup` enumeration, Wythoff. They return in later phases.

**Module: `src/group/`** (README written first, as the spec): `orbit.ts`
(the generic BFS engine: `GroupOps<I>`, `orbit`, the quantized matrix key),
`CoxeterGroup.ts` (the class, the tile type, `wordId`), `cayley.ts` (the
combinatorial graph types; the builder is a class method). Depends on
math/geometry/polytope/coxeter.

**Tests pin the mathematics**:

- convention pins: `word([i,j])` = the matrix product R_j·R_i (not
  R_i·R_j); `neighbor(tile, i)` has element g·R_i and word `[i, …w]`, and
  its polytope shares wall-i's image with the tile;
- relations: `word([i,j] repeated m_ij times)` = identity, per decorated
  pair, all three geometries;
- **spherical exhaustion against known orders**: (2,3,3) → 24, (2,3,4) →
  48, (2,3,5) → 120 — the BFS frontier empties at the right count with
  maxWord generous, pinning that dedup neither splits nor merges;
- dedup honesty in E/H: orbit-of-base-point pairwise distinct at
  Milestone-1 depths; element count = tile count;
- Cayley: node degree ≤ rank, every edge's endpoints differ by R_i
  (matrix check), each undirected edge once.

**Increments** (small, checkpointed, `typecheck` + `test` green):

- **G0** — `src/group/README.md` spec + type shapes; approved before
  further code. **DONE, approved 2026-07-05**, with shape choices ratified:
  the 2D factory is a free function `groupFromPolygon(r)`; `OrbitElement`
  and `CayleyNode` are bare `{word, element}` (no stored depth/key);
  `matrixKey` takes the flat `Float64Array` directly; `neighbor`'s word
  `[i, …w]` is documented as the adjacency word, not necessarily the
  element's stored shortest word.
- **G1** — `orbit.ts` + tests. **DONE 2026-07-05** (engine pinned on the
  free monoid — the left-composition convention — plus C₅/I₂(3) exhaustion,
  shell sizes, tie-break to `[0,1,0]`, maxWord/maxCount stops, and
  `matrixKey` quantization).
- **G2** — the `CoxeterGroup` class: factory from `RealizedPolygon`,
  `word`, `basePoint`, orbit wiring, `tessellate`, `neighbor` + the
  convention/order/relation tests. **DONE 2026-07-05**, one shape amendment
  pending ratification: the class is `CoxeterGroup<P extends Vec, I extends
  Float64Array>` (the G0 shape left `I` bare) — the constraint states the
  real requirement that geometric dedup keys on matrix entries, and both
  Isometry2/Isometry3 satisfy it; the alternative is an internal cast.
  Tests add: spherical exhaustion 24/48/120 with frontier-emptied
  idempotence; neighbor's shared wall pinned as the same hyperplane with
  the covector sign flipped; E/H base-point orbits pairwise distinct at
  maxWord 6.
- **G3** — the Cayley graph + tests. **DONE 2026-07-05** (`cayley.ts`
  types + the `cayleyGraph` class method, matrix-key edge lookup, a < b
  emission). Tests add: the full (2,3,5) graph is 3-regular, 120 nodes /
  180 edges, connected; every edge matrix-checked as {g, g·R_i}, each once;
  the truncated (2,3,7) ball is the connected induced subgraph (dropping a
  word's FIRST letter is a g·R_i step down in length, so right-edge
  connectivity of the ball holds — noted in the test). The left-BFS /
  right-edge pairing and why it is the standard, forced structure is
  written up in the README ("Why left and right both appear").
- **G4** — **the Milestone-1 demo**: (2,3,7) H, (2,4,4) E, (2,3,5) S
  tessellations + Cayley graphs through at least two models per geometry,
  including (2,3,5) on the perspective globe. **DONE, approved 2026-07-05
  — MILESTONE 1 COMPLETE** (`demos/group`, `npm run dev group`): 3 × 2
  grid — Klein + Poincaré (H, maxWord 16 = 540 tiles), Cartesian fit +
  detail (E, maxWord 12 = 209 tiles; straight = conformal, so the two E
  panels vary scale), stereographic + perspective globe (S, exhausted =
  120 tiles; spherical shells verified palindromic 1,3,…,3,1 with top
  degree 15 — the H₃ Poincaré polynomial). Scene conversion lives in the
  demo per the plan: parity-colored tiles (identity emphasized), Cayley
  nodes at g·basePoint, edges colored by generator; ids tile:/cay:/cayedge:
  via wordId. Demo chrome: in the stereographic chart the tile containing
  the projection antipode has an unbounded image (its fill would paint the
  frame) — the view is tipped off-axis and that one tile's fill is omitted,
  noted in the panel title.

### 5.5 Milestone 3 in detail — 2D computations & word-list features (decided 2026-07-06)

**User rulings, all four in**: (1) word lists are input **in the abstract
group** and converted to ELEMENTS for all semantics (membership by matrix
key, never literal word syntax); (2) `subgroup` enumeration returns (its
deferred phase is here); (3) the demo gets **interactive word entry** (type
words, matching tiles/nodes light up live); (4) circle measures included
for consistency (no consumer yet — noted).

**Modules**: `polytope/measure.ts` (Gauss–Bonnet / shoelace polygon area,
perimeter, κ-trig circle measures — spec at the polytope README);
`group/` grows `elements` / `tilesFor` / `subgroup` methods +
`wordlists.ts` (`cosetIndex` by minimal-key left-coset orbits,
`hullOfWords` = hull of base-point images via `fromVertices2`, hemisphere
refusal propagating) — spec at the group README's "Word lists" section,
honoring the design doc's rule that every word-list op states what a word
maps to.

**Tests pin the mathematics**: chamber areas exactly π/42 (2,3,7) and
4π/120 (2,3,5); the 120 spherical tile areas sum to 4π (Gauss–Bonnet
audits the group order); E square area = shoelace; perimeter = edge sums;
circle rows against closed forms; |⟨R_i,R_j⟩| = 2m_ij; spherical coset
counts = |G|/|H|; two spellings of one element are one member; the
dihedral-orbit hull is a regular 2m-gon of the right area.

**Increments**: **M3.0** this plan + README amendments — DONE with this
entry · **M3.1** `measure.ts` + tests — **DONE 2026-07-06** (π/42 and
4π/120 exact; the 120 spherical tiles sum to 4π and every transported
tile's area is invariant to 1e-9, H to 1e-8 at depth 8; unit square by
shoelace; circle circumference cross-checked against a 4096-chord sum
— chords undershoot by the expected O(1/n²); S/H disk areas match πr²
to fourth order and bracket it at finite radius) · **M3.2** the group word-list
methods + `cosetIndex` + tests — **DONE 2026-07-06** (`elements` /
`tilesFor` / `subgroup` on the class, `cosetIndex` in wordlists.ts by
minimal-key left-coset orbits; pinned: spelling dedup with the first
spelling kept; parabolic orders 2m on all three (2,3,5) pairs; the full
generator set regenerates 48; a rotation's cyclic ⟨R₂R₁⟩ = 3; the
(2,3,7) Coxeter element hits the maxCount stop; 120/6 = 20 cosets of
size 6 exactly; left-coset membership spot-checked incl. the commuting
order-2 pair being coset-mates both ways) ·
**M3.3** `hullOfWords` + tests — **DONE 2026-07-06** (hull of base-point
images via `fromVertices2`; the ⟨R₁,R₂⟩ orbit hulls to a regular 2m-gon
in all three geometries — equal edges to 1e-9, vertices equidistant
from the parabolic's fixed chamber corner; duplicate spellings collapse;
the hemisphere refusal fires on a whole-sphere word list) · **M3.4**
the demo: coset coloring (tiles + Cayley nodes), a drawn word-list hull,
exact area readouts, and the interactive word-entry box — **BUILT
2026-07-06, pending the user's eyes** (`demos/wordlists`, `npm run dev
wordlists`): three interactive panels (Poincaré / Cartesian /
stereographic) colored by left coset of ⟨R₁,R₂⟩ with matching Cayley-node
colors over thin gray edges; the dihedral orbit's hull drawn bold; a
stats line per panel (π/42 and 4π/120 called out exactly; the spherical
ball totals 4π); one shared word-entry box parsing `e, 0, 0.1, 1.2.1`
style input, highlighting elementwise across all three panels at once
(any spelling hits its one tile + node); full V3 interaction + SVG
export per panel. **APPROVED 2026-07-06 ("things look great!") — Milestone 3's 2D scope is
CLOSED.** Note: the group→Scene conversion is now duplicated across demos
— promotion to an adapter module is the foreseen follow-up, not done
unilaterally. **M3.5 addendum (user-directed 2026-07-06)**: `demos/wordfile`
— a tiling from a WORD-LIST FILE, the product shape in miniature: orders
(p, q, r) typed with the geometry INFERRED by the exact classifier (the
design doc's "model: auto", first exercised here), a file picker accepting
the design doc's JSON form (`[[0,1],…]` or `{words: [...]}`) or plain dot
text, `tilesFor` drawing exactly the listed tiles (parity-colored, walls
overlaid), tile-count/area stats, full interaction + SVG, a built-in
sample, and `demos/wordfile/example-words.json` (the (2,3,7) alternating
subgroup patch to depth 7) as a real file to load. Amended same day
(user): the example AUTO-LOADS on startup (imported `?raw` through the
same parser a picked file uses), and a faint ambient tessellation
(depth 12/12/20 per geometry) draws underneath so the word list reads as
a HIGHLIGHTED PATCH within the tiling. **APPROVED 2026-07-06 — M3.5
closed.** Same-day addenda (user): the CENTERS hull (`hullOfWords`) drawn
in the wordfile demo with area in the stats line; then **`hullOfTiles`**
(`wordlists.ts`) — the hull of the TILE IMAGES (= hull of their vertices,
tiles being convex; deduplicated across shared edges; same hemisphere
refusal), pinned by the dihedral-flower identity area(tile hull) = 2m ×
chamber area exactly, in all three geometries — with both hulls as demo
CHECKBOXES (purple tiles hull, blue centers hull). Next: further 2D
development, direction to be specified by the user (explicitly ahead of
Milestone 2 / 3D).

### 5.6 — the GPU tiling shader (finalized 2026-07-06 with user rulings; spec = this entry + src/tilingshader/README.md)

**Status: T0 APPROVED, T1 + T2 DONE and APPROVED HANDS-ON 2026-07-06
("the cpu overlay matches"). Next: T3.** T1 = `src/tilingshader/` (types/shader/uniforms/
TilingShader; 15 tests incl. the parity pin: fold count parity = word-length
parity, word images fold back to the incenter, all three geometries). T2 =
`demos/tilingshader`, verified headless (Chrome + software GL) against the
pixel-coincidence criterion in ALL FIVE charts — the CPU overlay's strokes
sit exactly on the GPU edge bands (screenshots: poincare/klein (2,3,7),
cartesian (2,4,4), stereographic/gnomonic (2,3,5)). One finding, not a
shader defect: in GNOMONIC the CPU overlay itself adds hairline artifacts
for tiles crossing the equator (forward projection through infinity — the
known chart limitation); the GPU field, mapping backward per pixel, is
clean there. Remaining: user hands-on (drag/pan/zoom, style sliders), then
T3. Direction set by
the user; the reference shader arrived as `shader.glsl` (repo root,
untracked): Shadertoy-dialect, upper-half-plane, hardcoded (2,3,7) —
fold-into-chamber loop, parity fill, edge bands, vertex disks. Nothing
survives verbatim (UHP structs, disk→UHP Möbius, per-wall-type reflections
all dissolve); what carries is the *idea*: per-pixel folding + the three
coloring layers. The re-derivation folds in CANONICAL ambient coordinates
with covector walls — `p ← p − 2⟨p,c⟩·Jc`, J = diag(κ,1,1) — one
geometry-branch-free loop for S/E/H, with edge/vertex tests reduced to
pairings against CPU-precomputed κ-trig thresholds (no per-pixel inverse
trig). Details in the README.

**User rulings (2026-07-06):** (1) STANDALONE demo first
(`demos/tilingshader`), host integration later; (2) tiles + edges +
vertices all built in from the start and shown in the test; (3) the shader
implements EVERY flat 2D chart the system has (poincare-disk, klein-disk,
cartesian, stereographic, gnomonic — Globe2 is renderDim 3, rejected).

**Increments:**
- **T0** — this entry + `src/tilingshader/README.md` (backward view
  formula, folding + convergence, coloring layers, chart table, uniforms
  contract, limits, provisional API).
- **T1** — the module: WebGL2 harness + the fragment shader (n-gon folding,
  MAX_WALLS 16; parity/edges/vertices; all five charts), `TilingShader`
  class + pure helpers (uniform packing, thresholds, chart ids) with
  vitest coverage of the pure side.
- **T2** — `demos/tilingshader`: (p,q,r) input with geometry inferred
  (classifyPolygon, as wordfile), chart selector, style controls, full
  interaction via the existing controller. **Success criterion**: optional
  CPU-tessellation overlay (render2d, same camera) — edges coincide to the
  pixel in every geometry × chart cell under drag/pan/zoom. Hands-on gate.
- **T3** — PNG k× export button (offscreen re-render of both layers,
  composite). **DONE 2026-07-06**, designed collaboratively as a MODULAR
  COMPONENT (user direction): `render2d/png.ts` — `RasterLayer` (the camera
  contract as an interface: paint this camera into this many device
  pixels), pure `scaleCamera` (the exporter scales the CAMERA, never tells
  layers about k ⇒ per-pixel re-evaluation, not upsampling), `renderPng`
  (2D assembly canvas, layers drawImage'd back to front, transparent
  default background, throws past the ~16384 px canvas cap — tiled
  rendering deferred), `sceneLayer` (the vector painter as a layer); plus
  `tilingshader/layer.ts` — `tilingLayer` (fresh disposed TilingShader on
  a scratch canvas per export; export-only seam, the screen path stays
  immediate-mode). Demo: PNG button + k selector (1/2/4/8×) with a LIVE
  PIXEL READOUT (user amendment: exact dimensions + MP, e.g. "3040 × 3040
  px (9.2 MP)"); k is exact against the CSS frame, no implicit dpr.
  Verified headless: 4× export decodes to exactly 3040×3040 with both
  layers composited and coincident at 1:1 crop. +2 tests (scaleCamera).
- **T4** — host integration (wordfile or successor): WebGL canvas under
  the transparent Canvas2D, one controller; shader-on drops the CPU domain
  fill + ambient background tiles. **DONE 2026-07-06** (user: "time to
  fully incorporate things") in `demos/wordfile`: layer stack (GPU field
  under the transparent named canvas, one controller on top, white bg on
  the stack div); a "GPU field" checkbox (default ON) — on ⇒ the scene's
  domain item goes RIM-ONLY and the depth-capped `bg:` ambient tessellation
  is skipped, the shader draws the anonymous group at unlimited depth in a
  quiet cream/white parity with faint intrinsic edges (`fieldStyle`,
  matched to the house ambient palette; vertex layer off); off ⇒ the
  original CPU picture, unchanged. wordfile also gains the T3 PNG button
  (k selector + live pixel readout, white background, field composited
  when on; SVG stays vector-only as documented). Verified headless:
  hyperbolic (2,3,7) patch + hulls + walls over the infinite field;
  spherical (2,3,5) — the field covers the WHOLE sphere, beyond any CPU
  ambient depth; GPU-off regression identical in structure. Named
  machinery (hover, hulls, SVG, interaction) untouched — identity is the
  knife, realized.
- **T5** — the field's VECTOR TWIN for SVG export (user-directed 2026-07-06:
  option 2 of {omit the field, regen on CPU} chosen; "conventions must
  match the GLSL so the look is the same"). **DONE 2026-07-06.**
  `tilingshader/vector.ts` `fieldScene(group, style, maxWord, maxCount)`:
  the field regenerated as render2d items from the SAME TilingStyle —
  parity fills by word-length parity (= fold parity = the sign character),
  edge bands as the WALL-IMAGE ORBIT (applyDual over tile elements,
  dedup'd by quantized ±covector — one item per mirror so translucent
  edges composite once, where per-tile strokes would double alpha),
  vertex disks as the vertex orbit's metric circles, GPU compositing
  order, alpha-0/zero-size hiding; a domain underlay in `even` quiets the
  truncation frontier. Convention table in the tilingshader README ("The
  vector twin"). Coverage: EXACT for spherical (ball exhausts); E/H
  ball-truncated at the frontier, documented (no origin-centered ball
  covers a hard-zoomed frame — the reason the GPU folds per pixel).
  wordfile's SVG button prepends the twin when the field is on, at
  EXPORT_DEPTH (28/16/20, cap 20000 — a one-shot export affords a much
  deeper ball than the live ambience). The frontier question was settled
  by the user 2026-07-06: a proposed opacity fade into a base color was
  floated and withdrawn in favor of "just draw more tiles" — the frontier
  speckles exactly as the GPU field does (which also never fades), so
  deep-draw is both simpler AND more convention-faithful. No fade code
  exists. The user then flagged FILE SIZE (raw depth 28 ≈ 1.1 MB; the
  bytes were measured to be dominated by per-path attributes and
  word-length data-ids, not coordinates — tolerance knobs bought ~3%).
  Resolution: `mergeFieldPaths` (vector.ts) — tiles are pairwise DISJOINT,
  so same-style `field:tile:` paths merge into ONE multi-contour even-odd
  path with identical pixels; the domain underlay must NOT merge (it
  contains the tiles — they'd become holes) and wall outlines must not
  (they cross — even-odd cancels at crossings). Wired into wordfile's SVG
  export; EXPORT_DEPTH settled at 24 (≈ 0.97 of the disk, 2762 → 569
  paths, 314 KB raw / 97 KB gzipped; depth 28 ≈ 0.985 at 579 KB — the
  constant is the documented size/reach dial). +2 tests (merge grouping /
  contour conservation / pass-through; identity off-field). Merged output
  verified pixel-identical by render. Tests
  (+4): the (2,3,5) exact pins — 120 tiles split 60/60 by the sign
  character, 15 icosahedral mirrors, 62 vertex-orbit points — plus GPU
  ordering, 2w stroke widths, layer hiding. Verified headless
  side-by-side (GPU live vs the twin SVG rendered as an <img>): spherical
  essentially identical; hyperbolic identical in the interior with the
  documented frontier fade. (One false alarm during verification — a
  stray arc — was the temp verify block leaking an <img> per rebuild, not
  a rendering defect; the minimal node repro was clean.)
- **T6** — ADAPTIVE coverage for the twin (user-directed 2026-07-06:
  "different tiles will need different depths … how can we choose
  adaptively?"). Bound enumeration by INTRINSIC RADIUS, not word depth —
  the letters↔distance exchange rate is group-dependent (right-angled
  pentagon vs (2,3,7)). Two pieces: (1) `orbit` gains an optional
  `admit(element)` prune (spec + correctness argument amended into the
  group README: the metric ball with a diam(F) margin is connected in the
  left Cayley graph, via inversion + minimal galleries along geodesic
  segments; pruned-BFS words stay parity-correct), and
  `CoxeterGroup.tessellateBall(radius, maxCount?)`; (2)
  `coverageRadius(group, model, camera, size, εpx)` in the twin module —
  frame-grid sampling of "would a tile here render ≥ ε px", max intrinsic
  distance through view⁻¹ — so ONE pixel threshold replaces every
  per-group depth constant; EXPORT_DEPTH dies. The camera→radius
  conversion lives with the camera (group layer stays camera-free).
  Remaining limits documented: origin-centered ball vs extreme boundary
  zooms (GPU territory), maxCount backstop, coarse grid. **DONE
  2026-07-06.** Refinements found in verification: (a) relevance tests
  tile WIDTH (2·inradius), not diameter — chambers are slivers; ε = "min
  tile width in px", default 1.5, the size/reach dial
  (`EXPORT_EPSILON_PX` in wordfile; EXPORT_DEPTH deleted); (b) the diam(F)
  traversal margin is INTERNAL — results filter back to the radius (in H
  the margin shell tripled the output); (c) a wrong test expectation
  exposed correct two-way adaptivity: zooming in AT THE CENTER shrinks the
  ball to the frame bound 2·atanh(|u|corner) — fewer tiles, not more.
  Measured, ε = 1.5, default camera: (2,3,7) radius 4.56, 3931 tiles, max
  word 30, 536 KB (162 gz); right-angled PENTAGON radius 5.68, 561 tiles,
  **max word 7**, 264 KB (72 gz) — the user's motivating example,
  quantified. +4 tests (ball completeness/exactness vs deep enumeration in
  all three geometries; pentagon≪triangle letters pin; radius-π (2,3,5)
  exact pins; coverageRadius E-frame / H-log-law / zoom-in-shrinks pins).
- **T7** — `demos/tilings`, the general-polygon EXPORT demo (user-directed
  2026-07-06: "we don't need wordfile to be our export demo … all sorts of
  different tilings (triangle quad pentagon hexagon) and the option to
  color some set of tiles"). **DONE 2026-07-06.** Any compact 2D Coxeter
  polygon: n vertex orders in (n ≥ 3), geometry inferred; preset buttons
  triangle (2,3,7) / quad (2,2,2,2 — Euclidean grid) / pentagon
  (2,2,2,2,2) / hexagon (2,2,2,2,2,2); GPU field default-on (first
  exercise of the shader's n-gon capability: 4/5/6 walls verified);
  word-list text entry (dot-words, letters < n) colors a tile set;
  styling per user ruling — the FUNDAMENTAL DOMAIN is ALWAYS highlighted
  (#f6d9a0, id `fd`), the word list draws in red (#d15954) OVER everything
  incl. the fd; sample button fills the neighbors ball (e excluded — the
  fd shows on its own). Exports: adaptive SVG (coverageRadius at the
  current camera + mergeFieldPaths) and k× PNG with the pixel readout. NO
  depth constants anywhere: the CPU-off live ambience is the vector twin
  at a coarse ε (3 px) — T6 made the old BG_DEPTH pattern obsolete.
  wordfile is unchanged (stays the file-driven M3.5 artifact). Verified
  headless: pentagon/quad/hexagon renders, red-over-orange layering.
  **§5.6 (T0–T7) IS COMPLETE pending the user's hands-on pass.**

Strategy agreed in the original discussion (unchanged):

- **One camera, two painters.** Both layers render the SAME view formula —
  the vector layer forward, the shader backward per pixel
  (V⁻¹ → chart unproject → apply(view⁻¹) → canonical point → fold →
  color). Shader inputs are uniforms only: viewport (scalePx, centerPx),
  view⁻¹ as mat3, the chart inverse (per-chart GLSL; Poincaré first), the
  three wall covectors from `RealizedPolygon` + κ — the engine feeds the
  shader, no group theory duplicated in TS. Interaction is UNCHANGED: the
  existing controller owns the one camera; onCamera repaints two canvases.
- **Layer stack**: WebGL canvas under the Canvas2D overlay (transparent
  background), one controller on the top canvas. Shader on ⇒ the CPU scene
  drops its `domain` fill + ambient background tiles.
- **Identity is the knife**: the GPU draws the GROUP (reflection-folding:
  parity, fold depth, wall distance — unlimited depth, antialiased,
  anonymous); the CPU draws NAMED elements (ids, words, highlights, hulls,
  Cayley, hover, coset colors for selected lists) — the existing machinery,
  unmodified, on top.
- **Exports**: SVG stays vector-only (documented — a shader field has no
  vector form). PNG at arbitrary resolution: re-render both layers
  offscreen at k× (the vector layer is already resolution-independent via
  the camera), composite; tiled rendering later if outputs exceed canvas
  caps.
- **Module**: a new sibling `src/` module (working name `tilingshader/`),
  raw WebGL2, zero dependencies, README written first. render2d untouched.
- **Recorded limits**: GPU float32 (hyperbolic folding softens near the
  boundary; iteration cap; overlays stay float64-exact), charts arrive
  incrementally.
- **Formerly open, now resolved (2026-07-06)**: shader conventions — the
  reference's UHP machinery is replaced by canonical-coordinate folding
  (README); first demo — STANDALONE, not wordfile (user ruling; host
  integration = T4, parked); coloring vocabulary — parity + edge bands +
  vertex disks from the start (user ruling), palette a demo style control
  (defaults at T2); charts — ALL five flat 2D charts (user ruling); PNG
  export — simple k× button (T3).

### 5.7 — the 2D content sprint (user-directed 2026-07-06)

**Status: C1 + C2 + C3 DONE 2026-07-06, closing on the user's hands-on
pass** (`npm run dev cosets` / `tilings` / `uniform`). Results: C1 —
(2,3,7) with S = {0,1} shows 508 four-tile flowers, each its own
golden-angle hue, the GPU field continuing past the ball; C2 — the
generator-colored dual graph over the field, ε = 12 px picking the depth;
C3 — `wythoff.ts` + 5 tests all passing first run (the seed's ring
conditions pinned against wall side values in all three geometries;
omnitruncated (2,3,5) = 30+20+12 faces with V−E+F = 120−180+62 = 2; rings
(1,0,0) = the 12-pentagon dodecahedron; all-ringed (2,3,7) edge lengths
equal to 1e-9), `orbitBall` extracted from tessellateBall, and
`demos/uniform` rendering the omnitruncated {7,3} (squares/hexagons/
14-gons by type) and the spherical dodecahedron (far face honestly
unfilled — the pre-existing V2.3 stereographic behavior). 389 tests.
Three user directives on top of the finished §5.6 system: (C1) a parabolic-subgroup coset-coloring demo; (C2) the Cayley
graph as an option in the GPU-field demo; (C3) uniform tilings (Wythoff) —
the parent repo checked as REFERENCE (hyperbolic-polytopes
`src/coxeter/wythoff.ts`): ringed-node convention, seed from the linear
Gram solve (⟨p,nᵢ⟩ = −1 ringed / 0 unringed), faces = seed orbits under
maximal parabolics hulled, carried over the group with centroid dedup,
SIMPLEX chambers only. Re-derivation in our vocabulary: the seed solves
the 3×3 linear system `cᵢ·p = tᵢ` (t = −1 ringed / 0 unringed) directly in
ambient coordinates — κ-uniform, no Gram inversion — then
`geom.normalize`; 2D faces = seed orbits under the three vertex DIHEDRALS
(`group.subgroup`), hulled by `fromVertices2`, carried over the adaptive
metric ball (`tessellateBall`), deduplicated by quantized centroid.

- **C1** — `demos/cosets`: generator checkboxes choose S; W_S =
  `subgroup(reflections in S)` (guarded: |W_S| > 400 ⇒ treated as
  infinite, warn); tiles of the adaptive ball colored by `cosetIndex`
  with golden-angle hues; GPU field beneath (the anonymous group continues
  past the colored ball); walls + rim; adaptive SVG (coset tiles merge
  per color) + k× PNG.
- **C2** — `demos/tilings` gains a "cayley" checkbox: nodes at
  g·basePoint, generator-colored edges by matrix-key right-multiplication
  lookup over the adaptive ball (the cayley.ts recipe at ball scope),
  drawn over the field; ε = 12 px picks the legible depth automatically;
  included in both exports.
- **C3** — `src/group/wythoff.ts` (group README amended first):
  `wythoffPoint(poly, rings)` + `uniformCells(group, poly, rings, radius,
  maxCount)` → `{ type, polytope }[]` (type = the vertex-dihedral index;
  degenerate faces — seed fixed by the dihedral — skipped); triangle
  chambers only (throws otherwise); `orbitBall` exposed on CoxeterGroup
  (tessellateBall refactored over it). `demos/uniform`: (p,q,r) + three
  ring toggles, faces colored by type, adaptive coverage + both exports.
  Pins: omnitruncated (2,3,5) = 30 squares + 20 hexagons + 12 decagons
  (V−E+F = 120−180+62 = 2); ringed edges all the same intrinsic length;
  degenerate-face skip.

### 5.8 — FIELD PROGRAMS: the §5.7 content in the shader (user-directed 2026-07-06)

**Status: D1 + D2 + D3 DONE 2026-07-06, closing on the user's hands-on
pass.** Results: coset hues verified pixel-identical GPU-vs-CPU-overlay
(the shared hashHue convention holds); the Cayley star runs to the
boundary matching the CPU graph (note for the pass: the fd tile now draws
OVER the central star at 0.92 opacity — the identity-knife layering);
uniform regions verified on the omnitruncated {7,3} (one classifier fix
found by the visual: a region is bounded by its OWN two splitter
segments — the third splitter's full geodesic re-enters, so rows
constrain only on the decoration's walls, and only where the region
across survives), and the GPU dodecahedron FILLS THE POLE FACE the CPU
painter leaves honest-blank (backward per-pixel mapping has no far-tile
problem). +3 pure tests (foot ⊥ pins in all geometries, hashHue
determinism/spread, region classification + dodecahedron collapse); 392
total. "The same capabilities in the shader for PNG exports
of arbitrary depth." The insight making all three §5.7 features
GPU-foldable is that each one's data is CHAMBER-LOCAL, evaluable after the
fold with a handful of uniforms:

- **Coset coloring (mode 1)**: the left coset g·W_S of the pixel's tile is
  determined by the image g·v of the W_S-fixed point v (the chamber vertex
  for a wall pair, the perpendicular foot for a single wall). The fold
  loop accumulates the INVERSE product M⁻¹ (one mat3 multiply per
  reflection, M⁻¹ ← M⁻¹·Rᵢ), giving g·v = M⁻¹·v per pixel; hash it —
  quantized in the bounded coordinates (y,z)/(1+|x|) — to a hue. The SAME
  hash rule runs in float64 on the CPU (`hashHue`), so CPU tiles, SVG
  exports, and the GPU field all agree on every coset's color by
  construction. Float32 wobble can split hues at extreme depth
  (documented; graceful).
- **Cayley graph (star bands)**: the edge net is the orbit of the three
  half-segments [x₀, mᵢ] (mᵢ = the perpendicular foot of x₀ on wall i), so
  per pixel: band test |⟨q, Lᵢ⟩| < sin_κ(w) against the CPU-computed
  covector Lᵢ = cross(x₀, mᵢ) of the perpendicular geodesic, clamped to
  the segment by ⟨q, cᵢ⟩ ≥ ⟨x₀, cᵢ⟩; node disks are Q(q − x₀) < Q_r.
  Per-generator band colors.
- **Uniform tilings (mode 2)**: within F the Wythoff faces partition the
  chamber into ≤ 3 regions around its vertices, separated by the SPLITTER
  geodesics cross(seed, foot_k); a pixel's face type = the sign pattern of
  its three splitter pairings (expected signs precomputed at each region's
  vertex; degenerate splitters — seed on the wall — get zero rows).
  Uniform EDGES are the star bands anchored at the seed over the ringed
  walls; seed disks reuse the node test.

Foot of perpendicular: m = normalize(p − ⟨p,c⟩·Jc), κ-uniform. Geodesic
through two points: the cross-product covector (the polytope engine's own
convention). All CPU-side helpers pure and tested; the star/splitter/
anchor data ride in `TilingStyle` extensions, so `tilingLayer`/`renderPng`
give ARBITRARY-DEPTH PNG for all three demos with no API change. SVG
stays the CPU ball (vector, documented). Per the user's amendment ("and for live views where it's cheap!") the GPU
modes are the LIVE renderer wherever they exist — arbitrary depth AND
cheaper than re-enumerating balls — with the CPU ball retained only for
the vector SVG and as the verification overlay. Increments: **D1** coset
mode; demos/cosets draws it live + PNG, CPU tiles recolored by the shared
`hashHue` for SVG/verify · **D2** star bands + nodes; the tilings demo's
cayley checkbox drawn by the GPU live + PNG (CPU items retained for SVG)
· **D3** region mode; demos/uniform live + PNG on the GPU (CPU cells for
SVG). Verification per increment: headless GPU-vs-CPU coincidence.

### 5.9 — the 2D consolidation reorg (user-directed 2026-07-06)

**Status: R0 (spec) UNDERWAY.** The 2D program (§5.3.1 render2d V0–V3 +
polish, §5.3.2 sphereview, §5.6 tilingshader, §5.7–5.8 field programs) is
feature-complete but has accreted three seams the user wants cleaned so the
2D code is "modular, clean, and close to the math." A review (2026-07-06)
found the architecture sound — the layering law holds, every folder is a
README-spec, the `Chart2` seam (`{project, jacobianAt}`) is right, and
`sample`/`stroke`/`marks` are already generic over it — but with three
consolidation opportunities, and the user chose the FULL PASS with an
explicit `src/viz2d/` umbrella and the scene adapter as a first-class src
module:

1. **`render2d/scene.ts` (781 lines) wears six hats and has become an
   undeclared shared library** — sphereview reaches into it for seven
   helpers (`frameOf`, `keepContours`, `resolve{Stroke,Point,Region}`,
   `wallLine`, `dashRanges`). Extract the pure/shared concerns into named
   siblings: `style.ts` (resolve*), `cull.ts` (Frame/frameOf/distToFrame/
   keepContours/preCulled), `wallclip.ts` (wallLine/extendWallRange/
   shrinkOutside/wallParamRange), `dash.ts` (dashRanges/strokeContours/
   circleSpeed), `honesty.ts` (honestFill/insideContour/polygonInterior);
   `scene.ts` keeps only `buildPathList`.
2. **The flat (`buildPathList`) and sphere (`buildSpherePathList`) builders
   fork the per-item logic** — polygon-fill concat, circle fill/stroke,
   wall-line param — differing ONLY in chart (already `Chart2`) and
   visibility policy (flat single-pass frame/domain clip vs sphere two-pass
   silhouette split). Factor the shared per-item contour builders into
   `render/item.ts` called by both. **Design ruling: shared helpers, NOT a
   single unified `buildPathList`** — the sphere's silhouette-split/two-pass
   is genuinely different; forcing one function would be cleverness, not
   clarity.
3. **The demos carry a whole second application layer.** A survey found the
   duplication far larger than the "four-times-duplicated group→Scene" note:
   split cleanly into (a) a SCENE ADAPTER — the `realize` preamble (spec →
   `solvePolygon` → `groupFromPolygon` → model-by-kind, ×4), `cayleyToScene`
   (×3, identical magic constants `width:0.06·r0`/`radius:0.11·r0`),
   `tilesToScene(colorizer)`, `wallItems`, `domainItem`, palette/`fieldStyle`
   — first-class in `src/viz2d/adapters/`, conventions pinned once by tests;
   and (b) an app HARNESS (page shell, DPR canvas sizing, rAF `schedule`,
   `attachInteraction`+hover, GPU layer-stack, SVG/PNG/k× export, parsers)
   → `demos/shared/` (app glue, not src).

Target structure: `src/viz2d/{render (←render2d), sphere (←sphereview),
shader (←tilingshader), adapters (new)}` + `src/viz2d/README.md` (umbrella
spec). The `render2d` NAME goes away in code + folder READMEs; PLAN.md's
historical §5.3.1/render2d references stay as-is (history is appended to,
not rewritten). The `@/` alias rename touches ~20 import sites through one
line each in tsconfig/vite/vitest.

Increments, each a green-gated reviewable session (392 tests + typecheck the
floor throughout): **R0** `viz2d/README.md` + this entry (spec, no code) ·
**R1** the move (rename the three folders under `viz2d/`, update imports +
folder READMEs; pure rename, zero logic change; gate: green + demos launch)
· **R2** split `render/scene.ts` per #1, re-point sphere at the named
modules (gate: green — existing tests pin the extracted behavior) · **R3**
share the per-item builders per #2 (gate: green + a before/after path-list
snapshot on the Milestone-1 scenes proves byte-identical output) · **R4**
the scene adapter per #3a + convention tests, migrate the 6 group-consuming
demos (gate: green + hands-on visual pass) · **R5** the demo harness per #3b,
migrate demos (gate: green + hands-on). Milestone 2 (3D) stays queued after.

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
- **When the reactive Params/View harness comes in**, and what the demo UI
  is — likely our own (lil-gui judged ugly; it was deliberately left out of
  the dependencies).
- **Names**: repo, pip package, JS import (candidates: coxeter-viz, wythoff,
  kaleidoscope — check availability).
- **Perspective sphere view — stage 2 and beyond** (stage 1 is planned and
  in flight: §5.3.2). Remaining, parked:
  - *Dashed back-side strokes*: a StrokeStyle dash field (types amendment) +
    chopping outlines into dash contours (keeps SVG export identical by
    construction). Dash parametrization (screen vs intrinsic arclength)
    decided here. Widened 2026-07-05 (user, during V2 planning): wanted for
    the flat charts too, not just the sphere view; evaluate as its own
    small increment after render2d V2.
  - *Region clipping against the cap* — **RESOLVED 2026-07-06** (P3,
    `clippedFillLoops`; see §5.3.1's P entry).
  - *Hit-testing / unproject with a sheet choice* (it is not a `Model`).
    Upgraded from open question to WANT 2026-07-05 (user, V3 planning);
    **unproject + globe DRAGGING resolved 2026-07-05** (stage 2a, recorded
    at §5.3.1's V3 entry): `SpherePerspective.unproject(u, sheet)` +
    `sphereUnprojector` through the generalized controller. Sphere
    HIT-TESTING (hover on the globe) remains parked.
  - Whether it generalizes to a 3D-objects → 2D vector renderer seamed at
    renderDim-3 models with chain-rule jacobians (a Claude suggestion,
    unvalidated — would serve H³/S³ ball paper figures in the 3D era;
    general hidden-line removal stays out of scope regardless).
- **Branded (compiler-enforced) Point/Covector types**: proposed by Claude
  mid-conversation during Phase 1b planning; no precedent in the user's
  repos; parked, default OUT. The Phase 1b aliases already mark the duality
  at every signature; if enforcement is ever wanted, alias → brand is a
  small mechanical upgrade evaluated on its own.
