# CLAUDE.md

Guidance for working in this repo. Read this first, then `PLAN.md`.

## What this is

`coxeter-viz` (name TBD) turns **abstract Coxeter data** — generators and the
orders of pairwise products — into geometric realizations of the group in the
three constant-curvature geometries (S/E/H, dimensions 2 & 3), and everything
downstream: tessellations, Cayley graphs, word-list images, hulls,
areas/volumes, rendered through swappable coordinate models. TypeScript +
Vite, with our own linear algebra in the core (three.js appears only in
demos and the future 3D render layer — enforced by a test); a thin Python
package drives it through a pure group-theoretic seam.

The user is a mathematician (professor). Correctness and clean,
close-to-the-math abstractions matter more than feature count.

## Status: Phases 3a (2D solvers) and 1b (own linear algebra — PLAN.md §5.2b, retrofit 2026-07-04: three.js is out of src/, replaced by our flat Float64Array layer) complete. The 2D visualization system is PLANNED (PLAN.md §5.3.1, decided 2026-07-04: Canvas painter + SVG serializer over one path list; intrinsic-width filled-outline strokes; camera contains a view isometry; identity-carrying scene items). render2d V0 (the `src/render2d/` README spec + `types.ts`) is DONE and approved 2026-07-04, with amendments recorded at PLAN.md §5.3.1's V0 entry (adds a `circle` item kind; types fixed to Point2/Isometry2; path-list details provisional). render2d V1 (sample/stroke/marks/scene + Canvas painter + the success-criterion demo, `demos/render2d`) is DONE and approved 2026-07-05, with amendments at PLAN.md §5.3.1's V1 entry. The perspective sphere view stage 1 (`src/sphereview/`, PLAN.md §5.3.2: ribbons on a translucent globe, closed-form silhouette splits, two-pass paint, `demos/sphereview`) is DONE and approved 2026-07-05. Phase 4 (the 2D group layer, toward Milestone 1) is PLANNED (PLAN.md §5.4, decided 2026-07-05: consumes `RealizedPolygon`; immutable class `CoxeterGroup<P,I>` + the generic orbit BFS as a free function; element = {word, element}; the parent's quantized-matrix dedup with documented deep-H limits; depth = maxWord + maxCount, camera-free; word convention matched to the parent at every composition site; `wordId` with empty word "e"; emits its own tile/Cayley structures, Scene conversion downstream in the demo; increments G0–G4, G4 = the Milestone-1 demo). G0 (the `src/group/README.md` spec + type shapes) is DONE and approved 2026-07-05, with shape amendments recorded at PLAN.md §5.4's G0 entry. G1 (`orbit.ts` + `tests/group.test.ts`) is DONE 2026-07-05. G2 (the `CoxeterGroup` class + `groupFromPolygon` + convention/relation/exhaustion/dedup tests) is DONE 2026-07-05, with one shape amendment pending ratification at PLAN.md §5.4's G2 entry (`I extends Float64Array` on the class). G3 (`cayley.ts` + the `cayleyGraph` method + tests) is DONE 2026-07-05. G4 (the Milestone-1 demo, `demos/group`) is DONE and approved 2026-07-05 — **MILESTONE 1 COMPLETE** (details incl. the stereographic far-tile chrome note at PLAN.md §5.4's G4 entry). Next phase: render2d V2, PLANNED collaboratively 2026-07-05 (PLAN.md §5.3.1's V2 entry + the amended render2d README = the spec; V2.0). Sub-increments: V2.1 pre-sampling cull (safety property: only drops what post-cull would drop) · V2.2 the fifth scene-item kind `domain` (the model's `domain` field interpreted by the renderer; px-width rim, the one intrinsic-styling exception) · V2.3 wrap-around fill honesty (stereographic far tile; demo skip then removed) · V2.4 `svg.ts` string serializer + export button on demos/group. V2.0 approved and V2.1 (pre-sampling cull, lazy pad, output-identity safety test, ~7× zoomed-camera speedup) DONE 2026-07-05 — refinements recorded at the PLAN V2 entry. V2.2 (the `domain` item; demos shed chrome) DONE 2026-07-05 pending the user's visual pass of `npm run dev group` / `npm run dev render2d`. Next: V2.3 — wrap-around fill honesty (drop fills through the chart puncture; remove the group demo's far-tile skip). Dashed strokes stay parked in §6 (entry widened to flat charts). render2d V2 (tile fills, domain dressing, culling polish, SVG export) follows once real tessellations exist to drive it; SVG export can slot in anytime standalone.

`PLAN.md` is the working plan, edited collaboratively. In place: the
toolchain (see Commands) and the geometry substrate — `src/math/` (the
linear layer: `Vec`/`Covec` with the two matrix actions `applyToVector` /
`applyToCovector`, flat row-major matrices; plus the Jacobi
eigensolver, linear solve), `src/geometry/` (the six cells S/E/H × 2D/3D
behind one `Geometry<P,I>`, walls as covectors with the uniform reflection
I − 2(Jc)cᵀ), `src/models/` (straight + conformal charts per geometry,
Globe2), and `src/polytope/` (fromHalfspaces/fromVertices in all six cells
via the J-free cross-product vertex solve; contravariant wall transport;
the spherical hemisphere refusal), and `src/coxeter/` (the RealizationSpec
seam: `validatePolygon` with exact classification, and the κ-Porti
inscribed-circle solver realizing every compact 2D Coxeter polygon in
S/E/H with verified postconditions) — each folder specified by its README.
`demos/hello` and
`tests/smoke.test.ts` are Phase 0 throwaways, replaced when real work lands.
The parent systems being married (and cleaned up) in this rewrite:

- `/Users/strettel/Code/homogeneous-spaces` — geometry substrate (S/E/H
  geometries, models, metric-correct rendering)
- `/Users/strettel/Code/hyperbolic-polytopes` — Coxeter machinery (polytope
  engine, solvers, groups, Cayley); also holds `coxeter-viz-DESIGN.md` (the
  original product design) and `COX_COMPUTE/` (the seedless 3D solver
  pipeline, after Roeder)

## Commands

- `npm run dev <demo>` — run a demo (Vite; one server per demo, ports 5173+).
  Demos live in `demos/<name>/main.ts`; pages are synthesized (no index.html
  files on disk); the dev-server root `/` lists all demos.
- `npm run build <demo>` / `npm run preview <demo>` — build into `dist/<demo>`.
- `npm run typecheck` — `tsc --noEmit` (strict).
- `npm run test` / `npm run test:watch` — vitest (`tests/*.test.ts`).

## Working norms

- **A rigorous written plan precedes ANY code, every time.** Plan approval is
  not license to build a whole phase in one burst: execute in small
  reviewable increments, surface every interpretation of an ambiguous answer
  before acting on it, and pause at checkpoints. The user runs one work item
  per fresh session, inheriting the agreed plan via this file and PLAN.md.
- **Plan collaboratively.** Discuss before building; treat vision/context
  messages as read-and-absorb, not build triggers. Do not scaffold, create
  files, or "get ahead" without explicit agreement.
- **Verify geometry claims** with throwaway `node` scripts / vitest before
  asserting them.
- Copy nothing verbatim from the parents — re-derive (see PLAN.md §3, Rules
  of construction). Parents are references, not sources.
- Every `src/` folder gets a `README.md` stating its mathematics, written
  first as the module's spec.
- Dependency direction is law:
  math → geometry → models → polytope → coxeter → group → {2D viz | 3D viz} → app.
  The two visualization systems are TOTALLY SEPARATE: 2D has no three.js,
  3D is built on three.js. Neither exists yet; each gets its own plan
  (PLAN.md §5.3) before any code.
- Don't create branches or commit unless asked. Commit messages end with the
  `Co-Authored-By: Claude` line.

## Glossary (one vocabulary, used identically everywhere)

| term | meaning |
|---|---|
| **Coxeter matrix** | symmetric integer M, M_ii = 1, M_ij = order of s_i s_j (−1 sentinel for ∞). The *group*. The public input form. |
| **Gram matrix** | ⟨n_i, n_j⟩ of realized walls. A *byproduct* of realization; an input only internally, for simplices. |
| **wall / mirror** | the fixed hyperplane of a generating reflection; stored as a **covector** n, incidence via the pairing ⟨p, n⟩ |
| **pole** | the ambient vector representing a wall (spacelike unit in H, etc.) |
| **chamber / fundamental domain (FD)** | the intersection of the walls' half-spaces; the tile carried around by the group |
| **decoration** | data on a meeting wall-pair: `{ walls: [i,j], order: m }` ⇒ dihedral angle π/m |
| **undecorated pair** | walls that do NOT meet in the realized polytope; their distance is moduli the solver resolves canonically |
| **canonical representative** | where moduli exist, the chamber with an inscribed circle/sphere (= minimal perimeter; Porti in H²; the square in E²) |
| **RealizationSpec ("spec")** | the internal seam: geometry + dim + FD combinatorics + decorations. Exact side above, numeric side below. |
| **realization** | a solver's output: walls (covectors), interior point, diagnostics; provably realizes the spec's combinatorics |
| **straight(-geodesic) chart** | the model where geodesics are straight lines (Klein in H, gnomonic in S, the plane itself in E); all hulls/combinatorics are computed there |
| **generator indexing** | wall index = generator index everywhere (combinatorics, decorations, words, Cayley); load-bearing, never cosmetic |
| **word** | list of generator indices `[i₀,…,i_k]`, applied left to right (i₀ first) ⇒ element R_{i_k}···R_{i₀} |

## Conventions (inherited from the parents, to be kept)

- Strict TS (`noUnusedLocals/Parameters`, `erasableSyntaxOnly` → no parameter
  properties / enums), Vite, vitest, `npm run dev <demo>` with
  `demos/<name>/main.ts` and a synthesized HTML page.
- Generic over the canonical point type `P` (Vector3 in 2D ambient R³,
  Vector4 in 3D ambient R⁴) and isometry type `I`; never branch on
  geometry/dimension except where genuinely necessary — and prefer
  capability-style dispatch over `kind` switches.
- After any change: `npm run typecheck && npm run test`.
