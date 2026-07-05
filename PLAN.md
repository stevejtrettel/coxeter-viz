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
- **V3** — interaction: screen zoom/pan, isometry dragging, hover highlight.

**Tests pin the math**: outline half-width at a sample ≈ (w/2)·|J·n̂|
against numerical differentiation; mark-ellipse axes = jacobian singular
values; sampled-polyline deviation under tolerance; serializer path
geometry identical to the painter's input; cull thresholds.

**Questions for the 3D system's plan** (later, its own session): scope (S²
globe only, until the 3D solvers exist?), the tube stroke pipeline
(parents' proven mechanics), theme, and its relationship to the 2D system's
scene description (shared styling vocabulary?).

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
- **Perspective spherical view** (user, 2026-07-05, after approving render2d
  V1): project S² onto the plane as seen in 3D perspective — edge widths
  correct for the perspective view, back-hemisphere strokes dotted. A later
  project, its own session. Open questions when it comes up: it is a
  two-sheeted chart (front/back — occlusion enters, unlike every current
  `Model`), and dotted strokes are a new path-list style; whether it lives
  in the 2D system as a special chart or belongs near Globe2/the 3D system
  is part of the design.
- **Branded (compiler-enforced) Point/Covector types**: proposed by Claude
  mid-conversation during Phase 1b planning; no precedent in the user's
  repos; parked, default OUT. The Phase 1b aliases already mark the duality
  at every signature; if enforcement is ever wanted, alias → brand is a
  small mechanical upgrade evaluated on its own.
