# coxeter-viz

**Pictures of Coxeter groups, from abstract group-theoretic data.**

Give it a Coxeter group as pure combinatorial data — generators and the orders
of their pairwise products — and it produces *geometric realizations* of the
group in the three constant-curvature geometries (spherical, Euclidean,
hyperbolic), and everything downstream: tessellations, Cayley graphs, coset
colorings, uniform (Wythoff) tilings, convex hulls, exact areas — rendered
through swappable coordinate models with metric-true styling.

TypeScript + Vite, with its own linear-algebra core (no external math or
geometry libraries; three.js is reserved for the future 3D layer and is
absent from the entire 2D system, enforced by a test). Correctness and
close-to-the-mathematics abstractions are the design priority.

The 2D program is complete and instrument-grade. The 3D program is planned.

---

## Contents

- [The mathematics](#the-mathematics)
  - [1. The input: abstract Coxeter data](#1-the-input-abstract-coxeter-data)
  - [2. One ambient picture for S, E, and H](#2-one-ambient-picture-for-s-e-and-h)
  - [3. Walls, reflections, chambers](#3-walls-reflections-chambers)
  - [4. Realization: solving for the geometry](#4-realization-solving-for-the-geometry)
  - [5. The group: orbits, tessellations, Cayley graphs](#5-the-group-orbits-tessellations-cayley-graphs)
  - [6. Charts: drawing curved space flat](#6-charts-drawing-curved-space-flat)
  - [7. Rendering: intrinsic styling](#7-rendering-intrinsic-styling)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Using from Python](#using-from-python)
- [Using the library](#using-the-library)
- [Testing and conventions](#testing-and-conventions)
- [Status and roadmap](#status-and-roadmap)
- [Repository map](#repository-map)

---

## The mathematics

The whole pipeline is one arrow:

```
abstract Coxeter data  ──▶  realized chamber  ──▶  the group  ──▶  a picture
   (a Coxeter matrix)       (walls in S/E/H)      (tessellation,      (through
                                                   Cayley, cosets…)    a chart)
```

Each stage is a folder of `src/`, specified by its own `README.md`. This
section is the mathematical tour; the folder READMEs are the precise specs.

### 1. The input: abstract Coxeter data

A **Coxeter group** is presented by a symmetric integer matrix `M`: generators
`s₀, …, s_{n-1}` are involutions (`M_ii = 1`), and `M_ij` is the order of the
product `s_i s_j`. This is the *only* required input — the group as an abstract
object. In 2D the current entry point is the **cyclic polygon**: `n` vertex
orders `[m₀, …, m_{n-1}]`, the order `m_k` of the dihedral group at vertex `k`
(the product of the two walls meeting there).

Crucially, the **geometry is inferred, not assumed.** With vertex angles
`β_k = π/m_k`, the sign of `Σβ − (n−2)π` — computed in exact integer arithmetic
— decides it: `>` spherical, `=` Euclidean, `<` hyperbolic (`coxeter/spec.ts`).
A `(2,3,7)` triangle is hyperbolic, `(2,4,4)` Euclidean, `(2,3,5)` spherical,
and the code knows this before it draws anything.

### 2. One ambient picture for S, E, and H

The three geometries are handled by **one** linear-algebraic setup, so
everything above the geometry layer is generic in the curvature (`geometry/`).
Ambient space is `R^{n+1}` with coordinate 0 distinguished, carrying the
bilinear form

```
J = diag(κ, 1, …, 1),        κ = +1 (S),  0 (E),  −1 (H).
```

| geometry | point locus | isometries |
|---|---|---|
| Sⁿ | `⟨p,p⟩ = 1` | `O(n+1)` |
| Eⁿ | the affine slice `p₀ = 1` | homogeneous matrices |
| Hⁿ | `⟨p,p⟩ = −1`, `p₀ > 0` (upper sheet) | `O(n,1)⁺` |

The origin is `(1, 0, …, 0)` in all three; isometries are plain flat matrices.
Because `κ` enters only through `J`, the same reflection formula, the same
exponential map, the same distance function serve all three geometries — the
code branches on curvature only where the mathematics genuinely does.

### 3. Walls, reflections, chambers

A **wall** (mirror) is fundamentally a **covector** `c`, normalized so
`cᵀJc = 1`; the wall is `{ p : c·p = 0 }` and its half-space is `{ p : c·p ≤ 0 }`.
Its **pole** is the metric dual `Jc`. (The covector — not the pole — is the
fundamental datum: in E the covector `(−d, a)` of the line `{a·x = d}` carries
the affine offset `d` that the degenerate pole `(0, a)` cannot.) The reflection
in a wall is the single uniform formula

```
R_c = I − 2 (Jc) cᵀ,        p ↦ p − 2⟨p,c⟩·Jc,
```

correct in every geometry. A **chamber** (fundamental domain) is the
intersection of the walls' half-spaces — the tile the group carries around.

### 4. Realization: solving for the geometry

Turning the abstract spec into actual walls is the **solver** (`coxeter/`). One
construction realizes **every** compact 2D Coxeter polygon in all three
geometries — Porti's minimum-perimeter (inscribed-circle) polygon, generalized
over curvature: place the incenter at the origin and every wall tangent to a
circle of radius `r`, then require adjacent walls to meet at the prescribed
angle. Closure `Σ Δφ_k = 2π` becomes:

- **E** — closure *is* the Euclidean angle condition `Σβ = (n−2)π`; no root
  solve (the scale is a modulus, fixed by `r ≡ 1`);
- **H** — closure is strictly monotone in `r`; bisect for the unique root
  (Porti's theorem gives uniqueness and minimal perimeter);
- **S** — likewise strictly monotone; bisect.

`solvePolygon(spec)` runs **validate → construct → verify**: the postcondition
re-derives the chamber with the polytope engine and checks it against the spec
(vertex count, every wall carrying an edge, `⟨n_i,n_j⟩ = −cos(π/m)` on every
decorated pair). The output is a `RealizedPolygon`: the geometry instance, the
walls, the verified chamber, the Gram matrix, and the inradius. The origin is
the canonical interior point — the Cayley-graph base point.

### 5. The group: orbits, tessellations, Cayley graphs

With walls in hand the group acts by the reflections `R_i` (`group/`). A
generic breadth-first **orbit engine**, deduplicating elements by their
quantized matrix entries, produces:

- **tessellations** — one tile per group element, the chamber carried by each
  element (`tessellate` to a word length, or `tessellateBall` to an intrinsic
  metric radius — group-independent coverage where a word-length bound is not);
- **Cayley graphs** — the dual graph of the tessellation: one node per tile,
  edges `{g, g·R_i}` found by matrix-key lookup (`cayleyGraph` by depth,
  `cayleyBall` by metric radius);
- **word lists** — a list of words *denotes a set of elements* (any spelling of
  an element hits its one tile), the basis for coset colorings, highlighting,
  and convex hulls with exact Gauss–Bonnet areas;
- **cosets** — left cosets of a parabolic subgroup `W_S`, colored so each
  coset (e.g. the "flowers" around a vertex) reads as one color;
- **uniform tilings** — the Wythoff construction: a ringed seed inside the
  chamber, its faces the dihedral orbits, colored by type.

### 6. Charts: drawing curved space flat

A **model** (`models/`) maps canonical ambient points to a picture and reports
the metric distortion there (`jacobianAt`, `scaleAt`). Per geometry there is
one **straight** chart (geodesics → straight lines — where all convex-hull and
incidence combinatorics are computed) and conformal charts (angle-preserving):

| geometry | straight | conformal |
|---|---|---|
| H | Klein disk | Poincaré disk |
| E | the plane itself | (already conformal) |
| S | gnomonic (a hemisphere) | stereographic |

plus `Globe2`, which draws S² as the honest round sphere in R³. One central-
projection formula covers all three straight charts; `κ` flips one sign for the
conformal ones.

### 7. Rendering: intrinsic styling

Every size is an **intrinsic length in the geometry** — never a screen
constant. Strokes are filled outlines offset by the jacobian ellipse, so a
line's width shortens toward the Poincaré boundary exactly as a real ruler
would; point marks are jacobian-image ellipses; metric circles are honestly
sampled. A backend-agnostic **path list** is the seam, consumed identically by
the Canvas painter, the SVG exporter, and the PNG compositor, so a paper figure
is geometrically identical to the screen by construction.

There are **three painters** of the same scene (`src/viz2d/`):

- **`render/`** — the flat charts (Klein, Poincaré, gnomonic, stereographic,
  Cartesian), with adaptive sampling, wall-to-frame clipping, culling, and
  spherical fill-honesty;
- **`sphere/`** — the perspective globe: the same scene as a translucent sphere
  in 3D, with closed-form silhouette splitting and hidden-line dashing;
- **`shader/`** — a WebGL2 field that draws the *whole* tessellation per pixel
  by folding each fragment into the fundamental chamber (`p ← p − 2⟨p,c⟩·Jc`),
  unlimited depth, antialiased — with a vector twin so SVG export still works.

---

## Architecture

**Dependency direction is law**, and enforced by tests:

```
math → geometry → models → polytope → coxeter → group → viz2d → schema → app → demos
```

| layer | what it owns |
|---|---|
| [`math/`](src/math) | own linear algebra: flat `Float64Array` vectors/covectors/matrices, the two matrix actions (`applyToVector`/`applyToCovector`), Jacobi eigensolver, linear solve |
| [`geometry/`](src/geometry) | the six S/E/H × 2D/3D cells behind one `Geometry<P,I>`; walls as covectors; the uniform reflection; `Hyperplane` (`side`, `distanceTo`, `bisector`, `foot`) |
| [`models/`](src/models) | the coordinate charts: `project`/`unproject`/`jacobianAt`, the `straight` flag |
| [`polytope/`](src/polytope) | the polytope engine: `fromHalfspaces`/`fromVertices` in all six cells, contravariant wall transport, measures |
| [`coxeter/`](src/coxeter) | the `RealizationSpec` seam: `validatePolygon` (exact classification) + the inscribed-circle solver |
| [`group/`](src/group) | the orbit engine, `CoxeterGroup` (tessellate, Cayley, cosets, subgroups), word lists, Wythoff uniform tilings |
| [`viz2d/`](src/viz2d) | the 2D visualization system (below) |
| [`schema/`](src/schema) | the **figure document** — the versioned JSON contract (a Coxeter matrix + layers); validation collects every problem as a value, never a throw |
| [`app/`](src/app) | the product entry: `render(container, figure)`, `figureToSvg`/`figureToPng`, the self-contained HTML exporter; compiled into one `viewer.js` bundle |

The 2D system is one umbrella (`src/viz2d/`, its own [README](src/viz2d/README.md)):

| module | role |
|---|---|
| [`render/`](src/viz2d/render) | the flat-chart core + the shared seams (`Scene`, `Camera`, `Chart2`, `PathList`, `RasterLayer`) and machinery (sample/stroke/marks, cull, clip, dash, honesty) |
| [`sphere/`](src/viz2d/sphere) | the perspective globe painter |
| [`shader/`](src/viz2d/shader) | the GPU tiling field + its SVG vector twin |
| [`kit/`](src/viz2d/kit) | the **picturing toolkit** — group data → `Scene`/`Camera`/`TilingStyle`, the load-bearing id scheme, the house palette. **No mathematics.** |

The line the code draws: the **library core** owns everything that could be
mathematically wrong (a projection, an adjacency, an anchor); **`kit/`** owns
what could be pictorially wrong (an id, a fill rule, a frame); the **demos** own
only taste — which data, which colors, which layout. Demos are thin
(`demos/*` + the [`demos/shared`](demos/shared) harness): each reads as
*data → scene → mount*, with no mathematics inline.

---

## Getting started

```bash
npm install
npm run dev group        # open a demo (Vite dev server, one per demo)
npm run typecheck        # tsc --noEmit (strict)
npm run test             # vitest (478 tests / 20 files)
npm run build:bundle     # the viewer.js bundle (+ vendored into the Python package)
npm run build <demo>     # build into dist/<demo>
```

`npm run dev` with no argument lists every demo. Demos live in
`demos/<name>/main.ts`; the HTML page is synthesized (no `index.html` on disk).

### The demos

| demo | what it shows |
|---|---|
| `group` | Milestone 1 — the three geometries' tessellations + Cayley graphs, two charts each + the perspective globe; drag / zoom / hover |
| `wordlists` | coset colorings, base-point hulls, exact areas, interactive word-entry highlighting |
| `wordfile` | a tiling from a word-list file (JSON or dot format); GPU field, hulls, SVG/PNG export |
| `tilings` | any compact Coxeter polygon (geometry inferred); GPU field, fundamental domain, word-list patch, Cayley toggle, adaptive SVG + k× PNG |
| `cosets` | parabolic coset coloring as a GPU field program, with a CPU verification overlay |
| `uniform` | Wythoff uniform tilings; ring toggles pick the seed, faces colored by type (the dodecahedron is `(2,3,5)` with one ring) |
| `figure` | the product dev harness: figure documents (JSON) through the one `render()` entry point, with SVG/PNG export |
| `render2d`, `sphereview`, `tilingshader` | system demos: the solved chambers through every chart, the perspective globe, the GPU field vs. CPU overlay |

---

## Using from Python

The Python package is a thin builder over the engine — no node, no npm:
the JavaScript ships as two static files inside the wheel.

```bash
pip install "coxeter-viz @ git+https://github.com/stevejtrettel/coxeter-viz.git#subdirectory=python"
pip install "coxeter-viz[export]"    # optional: .png/.svg (then: playwright install chromium)
```

```python
import coxeter_viz as cx

fig = cx.figure([[1, 2, 7],
                 [2, 1, 3],
                 [7, 3, 1]], title="the (2,3,7) tiling")   # geometry inferred
fig.tessellation(ball=4.0, color="parity")
fig.tiles([[0], [0, 1], [0, 1, 2]], fill="#d03030")         # highlight named tiles
fig.walls(width=0.05)

fig.save("237.html")                 # a self-contained live illustration
fig.save("237.png", scale=4)         # shader-rendered, genuinely sharper at 4×
fig.save("237.svg")                  # the exact vector picture
```

A mathematically impossible request is refused with its reason (a value,
never a crash): saved HTML displays the problems; `.png`/`.svg` raise
`CoxeterVizError` listing them. See [`python/`](python/) and
[`python/examples/`](python/examples/).

## Using the library

The picturing toolkit (`kit/`) makes the common path a few lines. Realize a
group, tessellate it, assemble a scene, and paint it:

```ts
import { realizePolygon } from '@/viz2d/kit/realize';
import { domainItem, tilesToScene, wallItems, parityColor } from '@/viz2d/kit/scene';
import { TILE, GEN_COLORS } from '@/viz2d/kit/palette';
import { buildPathList } from '@/viz2d/render/scene';
import { paint } from '@/viz2d/render/canvas';

const rg = realizePolygon([2, 3, 7]);              // geometry inferred: hyperbolic
const tiles = rg.group.tessellate(12, 20_000);     // tessellation to word length 12

const scene = [
  domainItem(true),                                 // the Poincaré disk itself
  ...tilesToScene(tiles, (t) => ({                  // tiles colored by word parity
    fill: { color: parityColor(t.word, TILE), opacity: 0.9 },
  })),
  ...wallItems(rg.poly.walls, (i) => ({             // the chamber's mirrors
    color: GEN_COLORS[i], width: 0.05 * rg.r0,
  })),
];

const camera = { view: rg.group.geom.identity(), scalePx: 400, centerPx: [400, 400] };
const paths = buildPathList(scene, {
  geom: rg.group.geom, model: rg.model, camera,
  size: { widthPx: 800, heightPx: 800 },
});
paint(ctx, paths, camera);                          // ctx: a CanvasRenderingContext2D
```

The pure group theory needs no rendering at all:

```ts
import { realizePolygon } from '@/viz2d/kit/realize';
import { cosetIndex, dihedralWords, hullOfWords } from '@/group/wordlists';

const { group, poly } = realizePolygon([2, 3, 7]);
group.tessellate(10);                     // the tiles
group.cayleyGraph(8);                     // the Cayley graph
group.orbitBall(4.0);                     // the metric ball of elements

const H = group.subgroup([group.reflections[1], group.reflections[2]]);  // a parabolic ⟨R₁,R₂⟩
cosetIndex(group, H, group.tessellate(6)); // each element's left coset
hullOfWords(group, dihedralWords(1, 2, 3)); // the convex hull of a dihedral word list
```

(`@/` is the repo's alias for `src/`.) See each folder's `README.md` for the
full API and the mathematics it pins.

---

## Testing and conventions

- **Strict TypeScript** (`noUnusedLocals`/`noUnusedParameters`, no enums/param
  properties), Vite, Vitest. Run `npm run typecheck && npm run test` after any
  change.
- **Every `src/` folder has a `README.md`** stating its mathematics, written as
  the module's spec.
- Geometry claims are **verified numerically** (throwaway scripts / tests)
  before being asserted; the house verification pattern is exact spherical
  pins (orders, Euler counts) plus headless-Chrome pixel-coincidence
  screenshots between the GPU field and the CPU painter.
- Generic over the canonical point type `P` (`Vector3` in 2D, `Vector4` in 3D)
  and isometry type `I`; the code branches on geometry/dimension only where the
  mathematics genuinely differs.

---

## Status and roadmap

**The 2D program and the product layer are complete** — realization, groups,
all three painters, the picturing toolkit, the figure-document contract, the
single-file HTML/SVG/PNG exports, and the Python package driving it all
through a pure group-theoretic seam. 478 vitest + 26 pytest, strict
typecheck.

**Next:** the 3D program (S/E/H in three dimensions — the polytope engine at
full depth and the seedless H³ solver), in its own visualization system,
planned before any code.

The full increment-by-increment history and the working plan live in
[`PLAN.md`](PLAN.md); working guidance for contributors is in
[`CLAUDE.md`](CLAUDE.md).

---

## Repository map

```
src/
  math/        geometry/     models/      polytope/    coxeter/     group/
  viz2d/
    render/  sphere/  shader/  kit/
  schema/      app/
python/
  src/coxeter_viz/   (the pip package; _static/ vendors the compiled engine)
  examples/          tests/
demos/
  figure/ group/ wordlists/ wordfile/ tilings/ cosets/ uniform/
  render2d/ sphereview/ tilingshader/    shared/   (the harness)
tests/         PLAN.md        CLAUDE.md        docs/
```

Each `src/` subfolder and `src/viz2d/` and `demos/shared/` carries a `README.md`
that is the authoritative spec for its contents.
