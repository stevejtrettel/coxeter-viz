> **NOTE (2026-07-04):** This is the original design document, copied from
> `hyperbolic-polytopes/coxeter-viz-DESIGN.md` for reference. `PLAN.md` (repo root)
> supersedes it where they disagree — most notably: the Gram matrix is a
> *byproduct* of realization, not the system input.

# Coxeter-Viz — design doc

> **Working name: `coxeter-viz` (TBD — candidates: `wythoff`, `coxeter-viz`,
> `kaleidoscope`).** This document is written for the engineer/LLM who will
> build this repo from scratch. It is a *design* doc: it records what the system
> is, the decisions already made and why, and a phased plan. It is not yet
> implementation.

## 1. What this is

A **visualization layer for Coxeter-group computations** in the three classical
constant-curvature geometries — **spherical, Euclidean, and hyperbolic** — in
dimensions **2 and 3**.

The heavy group theory (enumerating groups, subgroups, cosets, words, orbits) is
done elsewhere, typically in **Python**. This system's job is to take that
abstract output and turn it into a **beautiful, interactive web visualization**
with almost no JS knowledge required of the user.

The author is a mathematician; correctness and clean, close-to-the-math
abstractions matter more than feature count.

### Lineage

This is a **ground-up rewrite** of an existing prototype,
[`hyperbolic-polytopes`](https://github.com/…), which already does the
hyperbolic 2D/3D case (TypeScript + three.js + Vite). The proven geometry engine
there (`math/`, `geometry/`, `models/`, `polytope/`, `coxeter/`) will be
**copied and rewritten by hand** into this repo as the foundation — *not*
imported as a dependency, and *not* ported automatically. The big new ideas
here are (a) generalizing from hyperbolic-only to all three geometries, and
(b) turning the prototype into a reusable, Python-drivable package.

## 2. The unifying idea — read this first

Everything keys off one object: the Coxeter system's **Gram (cosine) matrix**

```
B_ij = -cos(π / m_ij),   B_ii = 1
```

(with `-1` for `m = ∞`, and `-cosh ℓ` for ultraparallel mirrors at distance ℓ).
**The signature of B determines the geometry** — so we build *one* engine that
diagonalizes B, reads the signature, and dispatches:

| Gram signature (k generators) | group type | geometry | space |
|---|---|---|---|
| positive definite `(k, 0, 0)` | finite | **spherical** | S^{k-1} |
| pos. semidefinite, corank 1 `(k-1, 1, 0)` | affine | **Euclidean** | E^{k-1} |
| Lorentzian `(k-1, 0, 1)` | hyperbolic | **hyperbolic** | H^{k-1} |
| other indefinite | higher-rank | — | out of scope |

So `k = 3` generators → a 2D geometry (S², E², or H²); `k = 4` → a 3D geometry.
The realization pipeline (Jacobi-diagonalize the Gram matrix, read off the
mirror normals in the standard model of the indicated signature) is shared; only
the model/projection family differs per geometry. The hyperbolic prototype's
`realize.ts` already does exactly this for the `(n,1)` case — generalizing means
*also* accepting the definite and semidefinite cases.

Parallels that keep the abstraction uniform:
- **Klein (H)** ↔ **gnomonic/central projection (S)** ↔ **the plane itself (E)**:
  the chart in which geodesics are straight lines. Convex hulls / chamber
  combinatorics are plain Euclidean convex geometry in this chart for all three.
- **Poincaré (H)** ↔ **stereographic projection (S)**: the conformal chart.

## 3. Architecture (layers; each depends only on those above)

Mirror the prototype's clean layering, generalized over geometry. `Geometry<P>`
abstracts the ambient space and its form; the engine and render layer never
branch on the specific geometry except where genuinely necessary.

```
math/      forms + causal/definite classify, exp/log/distance per geometry, symmetric eig (Jacobi)
geometry/  Geometry<P> (Spherical / Euclidean / Hyperbolic, dims 2 & 3); Hyperplane<P> (mirror: pole/reflect/bisector)
models/    Model<P> per geometry:
             S: gnomonic (straight geodesics), stereographic (conformal), orthographic
             E: the plane/space directly (+ optional conformal disk)
             H: Klein, Poincaré, upper-half  (2D) / ball + upper-half-space (3D)
polytope/  Polytope<P> (V/E/F lattice), build (fromVertices / fromHalfspaces), PolytopeView
coxeter/   gram (Gram from a Coxeter diagram / angles / lengths),
           realize (diagonalize → signature → geometry + mirror normals),
           CoxeterGroup (mirrors, reflections, word/image/orbit/tessellate, fundamentalDomain, cayleyGraph),
           words (parse word lists), CayleyGraph + view
group/     orbit BFS over words in generators, geometric dedup
render/    App harness (theme + IBL), tubes, meshes, boundary
schema/    the JSON scene contract: parse + validate + version
app/       render(container, scene): the single public entry point that dispatches draw ops
```

**Generic over the canonical point type `P`** (e.g. Vector3 for 2D ambient,
Vector4 for 3D). Don't branch on dimension or geometry except where genuinely
necessary.

## 4. The contract: a JSON "scene description"

> **The schema is the product.** It is the stable, versioned boundary between
> the Python computation and the JS visualization. Design it as carefully as the
> math abstractions; change it slowly. Carries a `version`.

```
Python (group theory)  ──►  scene JSON (the contract)  ──►  render(container, scene)  ──►  HTML / live app
```

### Geometry lives in JS

Python sends **abstract** data — a Coxeter diagram / Gram matrix, generators,
word lists, coset reps — and the JS engine computes all the geometry (realize →
orbit → tessellate → hull). Python does essentially no geometry; it serializes
specs. Benefits: tiny files, one source of geometric truth, and switching
between many groups happens live in the browser. A low-level `raw` draw type
(explicit points/edges/polygons with coordinates) is the escape hatch for
anything the engine can't yet realize.

### Group specification (the canonical group form)

**v1: a group is given by its Coxeter matrix** — the symmetric integer matrix
`M` with `M_ii = 1` and `M_ij` = the order of `sᵢsⱼ`, using **`-1` for infinite
order** (no relation; real orders are ≥ 2, so `-1` is an unambiguous sentinel).
The row/column order **is** the generator indexing that word lists reference, so
it is load-bearing, not cosmetic.

The engine derives the **Gram matrix** from it — `B_ij = -cos(π / M_ij)`, with
`M_ij = -1` (∞) giving `B_ij = -cos 0 = -1` — then `realize` diagonalizes `B`,
reads the signature, and dispatches to S / E / H (see §2). The matrix is the
*group*; the Gram is the *geometry*.

```jsonc
{ "coxeterMatrix": [[ 1, 5, 2],
                    [ 5, 1, 3],
                    [ 2, 3, 1]] }   // [5,3]; a -1 entry would mean ∞
```

**Deferred — additive later, no engine change:**
- a friendlier input type (node list + labeled edges) that lowers to the same
  matrix;
- builder sugar (`schläfli`, `bracket`, Dynkin names, orbifold) that constructs it;
- **ultraparallel walls** (a real common-perpendicular *length* per edge, Gram
  `< -1`) — the integer matrix cannot express these, so they need the richer edge
  form; out of scope for v1.

### Scene = template + binding + style

Split the schema into three layers so one recipe can be iterated over many groups:

- **template** — the *how*: which geometry/model, which draw ops. Fixed across a batch.
- **binding** — the *what*: the variable data (the group, the word lists).
- **style** — the look. Usually fixed across a batch.

A template declares named `params` and references them with `$ref`:

```jsonc
// template.json — written once
{
  "version": "0.1",
  "model": "auto",                  // or a specific model; geometry is inferred from the Gram signature
  "params": ["group", "words"],
  "group": { "$ref": "group" },
  "draw": [
    { "type": "cayley", "radius": 5 },
    { "type": "tiles", "words": { "$ref": "words" } }   // draw the TILE each word represents
  ],
  "style": { /* fixed across the batch */ }
}
```

```jsonl
// bindings.jsonl — computed in Python, one record per line
{ "group": {"diagram": "..."}, "words": [[0,1],[1,2,1]] }
{ "group": {"gram": [[...]]},  "words": [[2,0,1]] }
// …one line per example group…
```

`scene = instantiate(template, binding)`. `.jsonl` is natural: the group-theory
code appends one record per example.

**References:**
- `{ "$ref": "name" }` — bind to a declared `param` at instantiation.
- `{ "$load": "file-or-url" }` — load at render time, so you can regenerate just
  the data and reload without rebuilding the scene (good for live experimenting).

**Draw ops** (each maps onto an engine capability):

| op | meaning |
|----|---------|
| `fundamentalDomain` | the chamber |
| `tiles` (word list) | the **tile each word represents** — the image of the fundamental domain under that word |
| `tessellate` (depth N) | the full orbit of the chamber to depth N |
| `cayley` (radius N) | the Cayley graph |
| `polytope` (vertices / halfspaces) | a convex polytope |
| `raw` (points/edges/polygons) | explicit geometry — the escape hatch |

> **Semantics rule:** any op that takes a word list must state what each word
> *maps to* before drawing. `tiles` → the image of the fundamental domain. A hull
> op would have to say it hulls the base-point images of the words, etc. Pin each
> op's word-semantics down precisely in the schema spec.

## 5. Packaging & distribution

**One monorepo. The JS bundle is a build artifact the Python package vendors —
not a separately published package** (unless JS-native consumers appear later).

```
coxeter-viz/                 (one git repo)
├── src/ …                   ← TS engine + render() (rewritten from hyperbolic-polytopes)
├── scripts/build-bundle.mjs ← Vite library mode → ONE self-contained viewer.js (tree-shaken)
└── python/
    └── <pkg>/
        ├── __init__.py      ← builder API + save()
        └── _static/viewer.js ← the compiled bundle, copied in at build time
```

Flow: `npm run build:bundle` → copy `viewer.js` into `python/<pkg>/_static/` →
`python -m build` produces a wheel **with the JS inside** → `pip install`. The
Python user never touches npm. (This is the Plotly pattern.) Version coupling is
automatic because both halves live and release together.

**Output format:** default to a **single self-contained HTML file** with the
bundle inlined (~0.5 MB tree-shaken, gzips to ~150 KB — fine to share/email).
A folder-with-shared-JS mode and a CDN mode are *later, optional* optimizations
— do not build them up front. For "iterate over N groups," prefer **one
interactive HTML** that embeds the template + all N (tiny) bindings and switches
between them live (geometry is computed in-browser, so no per-group round-trip),
rather than N separate files.

## 6. What it looks like to use

### Consumer (a research mathematician)

```python
pip install <pkg>
```

```python
import <pkg> as cx

# one visualization
G = cx.coxeter(diagram="*542")          # or gram=[[...]], or schläfli=(5,4)
scene = cx.Scene(model="auto")          # geometry inferred from the Gram signature
scene.tessellate(G, depth=6)
scene.save("542.html")

# iterate one recipe over many computed groups
template = cx.Template(model="auto")
template.cayley(radius=5)
template.tiles(words="$words")
gallery = cx.Gallery(template)
for g in my_research.enumerate_examples():
    gallery.add(group=g.gram, words=g.interesting_words)
gallery.save("examples.html")           # one interactive file with a selector
```

Consumers feed **plain data** (Gram matrices, word lists as lists of ints) — they
are not forced to adopt the package's group classes, so it composes with their
existing machinery.

### Author (you)

The interesting half is **all TypeScript**, where the geometry lives — implement
a draw op = geometry + rendering, your home turf. Test with hand-written
`scene.json` on a dev page (no Python needed) and freeze good ones as golden
fixtures.

The **Python half is thin** — every builder method appends one dict to a draw
list; `save()` inlines the bundle + JSON into an HTML template. No geometry, no
three.js. Adding a feature touches all three lightly and always the same way:
implement it in TS, add it to the schema, expose a one-line Python method, add a
fixture.

## 7. Phased build plan

1. **Port the engine.** Hand-copy + rewrite `math/ geometry/ models/ polytope/
   coxeter/` from `hyperbolic-polytopes`, generalizing the geometry abstraction
   to spherical / Euclidean / hyperbolic. Get the **hyperbolic** path working
   first (it already exists), then add spherical, then Euclidean — each is "a new
   signature case + a model family."
2. **Freeze schema v0** and build `render(container, scene)` as the single entry
   point dispatching draw ops. Test entirely with hand-written scene files.
3. **Standalone bundle** (Vite library mode, tree-shaken, one `.js`).
4. **HTML exporter** — template that inlines bundle + scene JSON. Still no Python.
5. **Python builder** — mirrors the schema, emits JSON, vendors the bundle,
   writes self-contained HTML.
6. **Iteration features** — template/binding instantiation, `Gallery` (one
   interactive file over N groups), `$load` external data.
7. **Later / optional** — live dev server (`serve()`), notebook widget
   (`anywidget`), output modes (directory/CDN), Wythoff uniform polytopes,
   Dirichlet domains, non-compact (ideal/hyperideal) cases.

## 8. Decisions log (the "why", for future maintainers)

- **Scope = Coxeter groups in S/E/H, dims 2 & 3.** Unified by the Gram-matrix
  signature, so it's one engine, not three. (Hyperbolic-only was the prototype.)
- **JS owns the geometry; Python emits abstract specs.** One source of geometric
  truth (the proven engine), tiny files, live in-browser group switching.
- **The JSON schema is the contract/product.** Versioned; template/binding/style
  split so one recipe iterates over many groups; `$ref`/`$load`; `raw` escape
  hatch.
- **v1 group input = the Coxeter matrix** (integers, `M_ii=1`, `-1` for ∞); JS
  builds the Gram (`-cos(π/M_ij)`). Simplest unambiguous form and what Python
  naturally has. Richer inputs (edge-list, Schläfli/name sugar, ultraparallel
  lengths) are additive later and don't touch the engine.
- **Monorepo; Python vendors the compiled JS bundle.** Not a separate npm
  publish (additive later if JS-native consumers appear). Automatic version
  coupling. Plotly pattern.
- **pip-first for consumers; default output is one self-contained HTML file.**
  Other output modes are later optimizations.
- **Engine comes from `hyperbolic-polytopes` by hand-copy + rewrite**, not
  dependency or auto-port — to keep one clean, owned codebase.
- **Convex hull / chamber combinatorics computed in the straight-geodesic chart**
  (Klein / gnomonic / the Euclidean plane) for all three geometries — plain
  Euclidean convex geometry there; incidence is model-free.

## 9. Open questions

- Exact `params` / `$ref` / `$load` resolution rules (precedence, missing values,
  nesting).
- Precise per-op word semantics for every word-driven draw op.
- 3D **spherical** visualization: S³ needs a projection to R³ (stereographic);
  decide the default and interactions.
- Final names: repo, pip package, JS import. (See working-name candidates above;
  check npm/pip availability.)
- Styling model: per-element control vs. theme presets; how much lives in the
  schema.
- ~~How a Coxeter group is specified in the schema~~ — **resolved for v1**: the
  Coxeter matrix (`-1` for ∞); JS builds the Gram. Richer/sugar forms are a later
  additive layer. (See §4 "Group specification".)
