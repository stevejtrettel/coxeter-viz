# `render2d/` — the 2D visualization system

Draws the flat (renderDim-2) charts — Klein, Poincaré, gnomonic,
stereographic, Cartesian — with **all styling intrinsic to the geometry**.
Canvas is the instrument; SVG is the export. No three.js anywhere (the 3D
system is a separate, later plan). Depends only on
`math` → `geometry` → `models` → `polytope`.

Decided collaboratively 2026-07-04 (PLAN.md §5.3.1); this README is the spec,
written before the code.

## The pipeline

One backend-agnostic **path list** is the seam:

```
scene (canonical data, identity-carrying)
  │  apply camera.view g  →  model.project  →  sample / stroke / mark
  │  clip to frame & domain  →  cull sub-pixel items
  ▼
PathList: styled FILLED paths in render coords     (scene.ts)
  ├─ Canvas painter — immediate mode, every frame   (canvas.ts)
  └─ SVG serializer — paper figures                 (svg.ts)
```

Both backends consume the same path list through the same affine viewport,
so the exported figure is geometrically identical to the screen **by
construction**. There is no retained scene graph and no SVG interactive
backend: every change (drag, highlight, model switch) rebuilds the path list
and repaints; sub-pixel items are culled, so deep-tessellation tiles shrink
toward the boundary and drop out.

## The view formula

```
screen = V ∘ model.project ∘ geom.apply(g, ·)          g = camera.view
```

- `g` is a **group element** (an `Isometry2`). Isometry dragging composes
  into `g` — the translation q₀ → q₁ is the product of two
  perpendicular-bisector reflections, built from the existing
  `Hyperplane` / `geom.reflection` machinery. Content's canonical
  coordinates never change.
- `V` is the affine viewport: with `s = camera.scalePx` px per render unit
  and `(cx, cy) = camera.centerPx` the screen position of the render-space
  origin,

  ```
  sx = cx + s·uₓ        sy = cy − s·u_y        (y flips: screen y is down)
  ```

The visible **frame** (the render-coords rectangle seen by a
`widthPx × heightPx` surface) is `V⁻¹` of the screen rectangle; clipping and
culling use it, and disk-domain charts additionally clip to `model.domain`.

## Scene items carry identity

A scene is a list of items `{ id, kind, canonical data, style }`:

| kind | canonical data | style | drawn as |
|---|---|---|---|
| `point` | `at: Point2` | color, intrinsic **radius** | jacobian-image ellipse |
| `geodesic` | segment `{a, b}` **or** line `{wall: Hyperplane}` | color, intrinsic **width** | filled outline |
| `circle` | `center: Point2`, intrinsic `radius` | optional fill + outline stroke | honestly-sampled metric circle |
| `polygon` | `vertices: Point2[]` (cyclic) | optional fill + edge stroke | geodesic-edged region |

- **Ids are load-bearing**: a wall item's id encodes its generator index,
  exactly as everywhere else (combinatorics, decorations, words, Cayley).
- **Highlighting is a per-frame style override by id**
  (`StyleOverrides`), never a scene mutation.
- **Hit-testing is mathematical** (V3): `model.unproject` the pointer,
  `geom.apply(g⁻¹, ·)` back to canonical coordinates, side-test against
  walls with `Hyperplane.side` — exact, no pixel picking.

## Intrinsic styling — the mathematics

All sizes (`width`, `radius`) are **intrinsic lengths** in the geometry.
Nothing is ever a constant screen width; there is no "diagram mode".

**Strokes are filled outlines.** Sample the geodesic in canonical
coordinates, project each sample to `u(t)`; let `n̂(t)` be the render-space
unit normal to the projected curve and `J = model.jacobianAt(γ(t))`. The
outline is the closed contour through

```
u(t) ± (w/2) · J·n̂(t)
```

— the two offset curves joined at the ends. The half-width vector
`(w/2)·J·n̂` is a point of the jacobian ellipse of intrinsic radius `w/2`, so
the stroke has intrinsic width `w` at every sample: width varies along the
stroke and is anisotropic where the chart is (thinner radially in Klein).

**Points are jacobian-image ellipses.** A point of intrinsic radius `r` at
`p` renders as the ellipse `project(p) + r·J·(unit circle)` — the image of
the infinitesimal intrinsic disk, valid because point radii are small. Its
axes are `r` times the singular values of `J` restricted to the chart plane.

**Circles are honest** (finite intrinsic radius — incircles are the first
customer, and `RealizedPolygon.inradius` is not small): sample

```
θ ↦ geom.exp(c, r·(cos θ·E₁ + sin θ·E₂))
```

with `E₁, E₂` an orthonormal tangent frame at the center `c`, project, and
treat the result as a closed curve — fillable, and strokable with the same
filled-outline machinery. A jacobian ellipse would be wrong at finite
radius.

**Polygon boundaries follow geodesics.** The fill contour is the
concatenation of the sampled geodesic edges between consecutive vertices
(curved in conformal charts, straight in straight charts); edges may
additionally be stroked on top. Chamber polygons come straight from
`Polytope.vertices` (cyclically ordered in 2D).

## Sampling, clipping, culling

- **Adaptive sampling everywhere**, tolerances in px (so the camera scale
  participates): recursive bisection of the canonical parameter until both
  the **flatness** deviation (projected midpoint vs. chord) and the
  **width variation** between adjacent samples are under tolerance, with a
  recursion cap. Even straight charts sample: the chord is straight but the
  width still varies along it.
- **Full-line walls** are clipped to the frame (plus a margin) and, in disk
  models, to the domain; in the gnomonic chart a wall may project to two
  branches — the sampler follows the chart, not the wish.
- **Culling**: an item whose screen extent falls below `cullPx` is dropped
  before path construction.

Defaults: `flatnessPx = 0.25`, `widthPx = 0.25`, `cullPx = 0.5`,
`maxDepth = 12` (per curve, so ≤ 2¹² segments).

## Scope decision: fixed to 2D

This system draws 2D geometries through renderDim-2 charts, so its types fix
`P = Point2`, `I = Isometry2` (the ball/globe/space charts belong to the 3D
system). The layer-law generics stop here deliberately: there is no second
instantiation for these types to serve.

## Files

| file | responsibility | increment |
|---|---|---|
| `types.ts` | `SceneItem`, styles, `Camera`, `PathList`, tolerances — the vocabulary (this V0) | V0 |
| `sample.ts` | adaptive sampling of projected curves: geodesics, metric circles; tangent frames | V1 |
| `stroke.ts` | filled-outline construction: offsets `±(w/2)·J·n̂`, end joins | V1 |
| `marks.ts` | jacobian-image point ellipses | V1 |
| `scene.ts` | scene → path list: apply `g`, project, clip walls to frame/domain, cull, resolve style overrides | V1 |
| `canvas.ts` | the Canvas2D painter (immediate mode) | V1 |
| `svg.ts` | one-file path-list → SVG serializer | V2 |
| `interact.ts` | screen zoom/pan, isometry dragging, hover highlight (composing into `camera.view`) | V3 |

Increments (PLAN.md §5.3.1): **V0** this README + `types.ts`, approved before
further code · **V1** sample/stroke/marks/scene + Canvas painter + the
success-criterion demo — the solved (2,3,7) H, (2,4,4) E, (2,3,5) S chambers
with walls and incircles through straight AND conformal charts, static
camera · **V2** tile fills, domain dressing, culling polish, SVG export ·
**V3** interaction.

## Tests pin the math

- outline half-width at a sample ≈ `(w/2)·|J·n̂|`, checked against numerical
  differentiation of `project ∘ exp` in the normal direction;
- mark-ellipse axes = `r ×` the in-plane singular values of `jacobianAt`;
- sampled-polyline deviation from dense reference sampling ≤ tolerance;
- metric-circle samples at exact intrinsic distance `r` from the center;
- serializer path geometry identical to the painter's input;
- cull thresholds drop/keep items on either side of `cullPx`.
