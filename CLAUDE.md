# CLAUDE.md

Guidance for working in this repo. Read this first, then `PLAN.md`.

## What this is

`coxeter-viz` (name TBD) turns **abstract Coxeter data** — generators and the
orders of pairwise products — into geometric realizations of the group in the
three constant-curvature geometries (S/E/H, dimensions 2 & 3), and everything
downstream: tessellations, Cayley graphs, word-list images, hulls,
areas/volumes, rendered through swappable coordinate models. TypeScript +
three.js + Vite; a thin Python package drives it through a pure
group-theoretic seam.

The user is a mathematician (professor). Correctness and clean,
close-to-the-math abstractions matter more than feature count.

## Status: Phase 3a complete (2D solvers). Next: the 2D visualization system — plan first, no code (see PLAN.md §5.3: visualization is TWO separate systems, 2D without three.js and 3D with three.js; the first three.js-based attempt was rejected and deleted).

`PLAN.md` is the working plan, edited collaboratively. In place: the
toolchain (see Commands) and the geometry substrate — `src/math/` (Jacobi
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
