# `viz2d/` — the 2D visualization system

Turns a **`Scene`** — canonical, identity-carrying geometry in one of the
three 2D geometries (S/E/H) — into pictures, through three interchangeable
painters and one adapter layer. **No three.js anywhere** (the 3D system is a
separate, later slot). Depends only on
`math → geometry → models → polytope → group`.

This is the umbrella spec for the slot. Each painter keeps its own README as
its detailed spec; this file states what they SHARE and how they fit
together. Consolidated 2026-07-06 (PLAN.md §5.9) from the three folders that
grew independently — `render2d/`, `sphereview/`, `tilingshader/` — once it
was clear they are one system with one vocabulary.

## One `Scene`, three painters

The whole slot turns on a single insight: a `Scene` is **canonical data with
identity** (points on the locus, walls as `Hyperplane`s, polygons as vertex
loops — never render coordinates), and picturing it is a pure function of a
`Camera`. Everything downstream is a painter that consumes the same `Scene`
and the same `Camera`:

```
Scene (canonical, identity-carrying)  +  Camera  ─┬─▶  render/  flat charts        → PathList → Canvas / SVG / PNG
                                                  ├─▶  sphere/  perspective globe   → PathList → Canvas / SVG / PNG
                                                  └─▶  shader/  GPU per-pixel field → WebGL2 canvas (+ vector twin → SVG)
```

Because the vector painters emit the **same `PathList`** (styled filled paths
in render coordinates) through the **same affine viewport**, the SVG and PNG
exports are geometrically identical to the screen *by construction*. The GPU
painter draws the anonymous group backward per pixel; its SVG twin
regenerates the identical picture as `Scene` items so exports stay vector.

## The shared vocabulary (the seams)

Four types are the contract every painter honors. They live in `render/`
because the flat painter is the reference implementation, but they belong to
the slot, not to `render/`:

| seam | where | what it is |
|---|---|---|
| `Scene` / `SceneItem` | `render/types.ts` | the input: `point` / `geodesic` / `circle` / `polygon` / `domain`, canonical data + intrinsic style, each with a load-bearing `id` |
| `Camera` | `render/types.ts` | `view` (a group element) + affine viewport (`scalePx`, `centerPx`); interaction produces new cameras, content never moves |
| `Chart2` | `render/sample.ts` | the minimal chart the samplers need — `{ project, jacobianAt }`. `Model` (flat charts) and `SpherePerspective` (globe) both satisfy it; this is why one sampler/stroker/marker serves all painters |
| `PathList` / `RenderPath` | `render/types.ts` | the backend-agnostic output: closed contours in render coords, even-odd filled; outlines already baked, so every path is a plain fill |
| `RasterLayer` | `render/png.ts` | the PNG contract — "paint this camera into this many device pixels"; a vector painter and the GPU field both implement it, so PNG composites them |

**Intrinsic styling is slot-wide law**: every `width`/`radius` is an
intrinsic length in the geometry, never a screen constant; strokes are filled
outlines offset `±(w/2)·J·n̂`, points are jacobian-image ellipses, circles
are honestly sampled. The GPU field precomputes the same κ-trig thresholds in
float64, so it agrees with the vector strokes stylistically by construction.
The two documented exceptions (disk/globe rims in px) are chart apparatus,
not content.

## Visibility policy — the one axis on which painters differ

Sampling, stroking, marking, and intrinsic styling are **identical** across
painters (they run through `Chart2`). The painters differ on exactly one
thing: how a canonical curve becomes visible paths.

- **`render/` (flat):** single pass. Clip full-line walls to the frame
  (+margin) and, in disk charts, to `model.domain`; cull sub-pixel and
  off-frame items. Spherical flat charts add the fill-honesty winding test
  (a region containing the chart's puncture bounds the complement of its
  loop).
- **`sphere/` (perspective globe):** two passes. Split every curve at the
  silhouette in closed form (each stage-1 curve is a circle in R³, so the
  sheet function is `A·cos t + B·sin t + C`), emit back pieces, the
  translucent globe, then front pieces; straddling fills close along
  silhouette arcs.
- **`shader/` (GPU):** no forward paths at all — invert the view formula per
  pixel and fold into the fundamental chamber (`p ← p − 2⟨p,cᵢ⟩·Jc`), color
  by fold parity + edge bands + vertex disks. Backward mapping means the
  spherical far-tile problem never arises. Its `vector.ts` twin regenerates
  the field as a `render/` `Scene` for SVG.

The shared per-item contour builders (polygon-fill concat, circle
fill/stroke, wall-line parametrization) live in `render/item.ts` and are
called by both vector builders; the visibility policy is what each builder
wraps around them. (Deliberately NOT a single unified `buildPathList` —
PLAN.md §5.9: the sphere's two-pass split is different enough that one
function would be cleverness, not clarity.)

## The adapter layer — group data → `Scene`

`adapters/` sits ABOVE the painters and BELOW the app: it turns the group
layer's output (`CoxeterGroup` tessellations, Cayley graphs, Wythoff cells,
word lists) into `Scene` items with the house conventions pinned **once**,
so the demos are thin and every demo colors a tile or draws a Cayley edge the
same way. It is the group→viz seam expressed as testable code, not copied
magic constants.

- the `realize` preamble: `RealizationSpec` → `solvePolygon` →
  `groupFromPolygon` → model-by-geometry-kind;
- `tilesToScene(colorizer)` — parity/coset/highlight fills over a tessellation;
- `cayleyToScene` — nodes at `g·basePoint`, generator-colored geodesic edges;
- `wallItems` / `domainItem` — the chamber's mirrors and the chart dressing;
- the shared palette and `fieldStyle` (the GPU-field ambience).

The GPU field programs (coset / star / regions, §5.8) have their CPU twins in
`shader/vector.ts`; the adapter chooses between the vector twin (SVG) and the
live GPU field (screen/PNG) — the demos just say which.

## Layering within the slot

```
render/  (core: types, Chart2, sample/stroke/marks, the vector builder, canvas/svg/png, interact)
   ├── sphere/    (perspective builder over render's Chart2 + machinery)
   ├── shader/    (GPU field + vector twin; imports render TYPES + png only)
   └── adapters/  (group data → Scene; imports render + shader)
          └── demos/  (app: demos/shared harness + per-demo shells)
```

`render/` knows nothing above it; `sphere/` and `shader/` know only
`render/`; `adapters/` knows the painters and the group layer; the app knows
the adapters. The `Camera` type is shared by all three painters (the
one-camera contract: one interaction controller repaints every layer).

## Folders

| folder | responsibility | detailed spec |
|---|---|---|
| `render/` | the flat-chart core + the shared seams, samplers, stroker, marker, vector builder, Canvas/SVG/PNG backends, interaction | `render/README.md` |
| `sphere/` | the perspective sphere view (translucent globe, silhouette splits, two-pass paint) | `sphere/README.md` |
| `shader/` | the WebGL2 tiling field (backward per-pixel fold) + its SVG vector twin + field programs | `shader/README.md` |
| `adapters/` | group/tiling/Cayley/Wythoff data → `Scene`; the pinned house conventions | this file (until it earns its own) |

## Provenance and status

Feature-complete as three separate folders (PLAN.md §5.3.1/§5.3.2/§5.6–5.8);
being consolidated under this umbrella per §5.9 in green-gated increments R0
(this spec) → R1 (the move) → R2 (split `render/scene.ts`) → R3 (share the
per-item builders) → R4 (the adapter layer) → R5 (the demo harness). The
392-test suite + strict typecheck are the floor at every gate. No behavior
changes in R1–R3 (pure structure); R4–R5 close on a hands-on visual pass.
