# `render/` — the flat-chart core of `viz2d/`

The reference painter of the 2D visualization system (`../README.md` is the
umbrella spec) and the home of the shared seams — `Scene`, `Camera`,
`Chart2`, `PathList`, `RasterLayer` — that the sibling painters (`sphere/`,
`shader/`) consume. Draws the flat (renderDim-2) charts — Klein, Poincaré,
gnomonic, stereographic, Cartesian — with **all styling intrinsic to the
geometry**. Canvas is the instrument; SVG is the export. No three.js
anywhere (the 3D system is a separate, later plan). Depends only on
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
  ├─ SVG serializer — paper figures                 (svg.ts)
  └─ PNG compositor — k× raster of painter stacks   (png.ts)
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
| `domain` (V2) | none — the model's `domain` IS the data | optional fill + **px-width rim** | the chart's image region: disk domains shade the disk and rim its boundary circle; plane domains shade the whole frame |

The `domain` item draws **the geometry itself** through the chart. Its rim
is the ONE exception to intrinsic styling (same exception, same reason as
sphere's globe rim): the disk boundary is at infinity in H, or is chart
apparatus — no intrinsic width exists. The rim is emitted as an annulus fill
through the ordinary path list, so both backends and the SVG export inherit
it by construction. `Model` stays pure math; the renderer interprets its
`domain` field.

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

**Dashes are intrinsic (P1).** `StrokeStyle.dash = { on, off, phase? }` in
intrinsic lengths — dashes are content and size like every other stroke
dimension, shortening toward the Poincaré boundary (a screen-px dash would
be a diagram-mode exception with no customer). All three curve generators
are constant-speed in their parameter (segments: d(a,b) · walls: 1 ·
circles: sin_κ(r)), so the ON ranges are exact parameter arithmetic
(`dashRanges`); each ON range samples adaptively as its own open curve
(butt-capped dash ends), and every dash outline is a contour of ONE
RenderPath — the SVG export inherits dashing by construction. Polygon
edges dash per-edge, the phase restarting at each vertex; patterns denser
than 1024 dashes per curve fall back to solid.

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

**Corner joins (P2).** Edge strokes are one butt-capped outline per edge
(overlapping outlines in a single even-odd path would cancel), which leaves
notches at corners; each vertex therefore gets a JOIN DISK — the jacobian
ellipse of intrinsic radius w/2, the same shape as a point mark — emitted
as one extra same-id path per polygon (contours pairwise disjoint in the
small-width regime; the path overlaps the edges, so it cannot share theirs).
Tradeoff, documented: translucent edges darken slightly where the join
overlaps them — formerly, those corners were notched.

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
- **Pre-sampling cull (V2)**: before any sampling, one conservative test
  per item — the bbox of the projected defining points (vertices / center /
  endpoints), padded by the item's intrinsic radius × the max defining-point
  `scaleAt` × a safety factor 2 — skips off-frame and sub-`cullPx` items.
  Scale variation across a screen-small item is bounded, and the factor
  covers conformal edge bulge; walls skip the pre-test (frame-clipped by
  construction). **Safety property**: the pre-cull may only drop items the
  post-sampling cull would also drop — pinned by test against the full
  Milestone-1 scenes.
- **Fill honesty (V2)**: a polygon or circle whose region contains the
  chart's puncture (the stereographic antipode) bounds the COMPLEMENT of
  its projected loop, so an even-odd fill would paint the wrong region.
  Only spherical flat charts can wrap: S² is compact, so every flat chart
  of it is punctured or branched, while the H/E charts are embeddings and
  always honest. Detection is an **interior-point winding test**: a
  canonical interior point (a circle's center exactly; a polygon's
  normalized vertex mean, interior for the geodesically convex loops the
  polytope layer emits) must project inside the sampled loop — a wrapped
  region puts it outside, or at the puncture itself (non-finite). Fails →
  the fill is dropped. (The originally planned adjacent-sample-jump
  criterion failed its verification gate: the far tile's boundary stays
  away from the puncture, so its loop is bounded and well-sampled — the
  dishonesty is containment, not proximity.) Strokes need no new handling:
  wrapped edges give finite off-frame outlines, and non-finite samples are
  already dropped.

Defaults: `flatnessPx = 0.25`, `widthPx = 0.25`, `cullPx = 0.5`,
`maxDepth = 12` (per curve, so ≤ 2¹² segments).

## Interaction (V3)

Interaction only ever produces **new cameras and per-frame overrides**;
canonical content never moves, and every camera update is a **pure
function** — the DOM controller in `interact.ts` is a thin adapter that owns
pointer/wheel events and invokes `onCamera` / `onPointer` callbacks, while
the demo owns the rebuild-and-repaint loop (rAF-throttled; V2.1's pre-cull
is what makes a full rebuild per frame affordable). The drag machinery's
screen→canonical step is a pluggable **`ScreenUnprojector`** capability —
`modelUnprojector(model)` for the flat charts, sphere's front-sheet
unprojector for the globe (its perspective is not a `Model`) — so one
controller serves both; the camera transforms spread their input, so camera
subtypes (`SphereCamera.eyeDistance`) pass through intact.

Gestures:

- **wheel — zoom about the cursor**: `scalePx` scales multiplicatively,
  `centerPx` shifts so the point under the cursor is fixed. Pure affine.
- **drag — isometry drag**: unproject the previous and current cursor
  positions to view-space canonical points a₀, a₁; the translation taking
  a₀ → a₁ is the double bisector reflection

  ```
  T = R_bis(m, a₁) · R_bis(a₀, m),      m = geodesic midpoint(a₀, a₁)
  ```

  (both walls ⊥ the geodesic a₀a₁, so T is the pure translation along it,
  and T·a₀ = a₁ exactly); compose `view ← T·view`. Dragging therefore does
  the *geometrically right* thing per model: content slides along
  geodesics, the disk boundary stays fixed. Guards: cursor outside the
  chart's domain, or a₀ ≈ a₁ (and, on S, near-antipodal pairs) — skip the
  move.
- **shift/middle drag — screen pan**: `centerPx` only, for moving the
  picture rather than the geometry.

**Drift**: composing T into `view` at 60 Hz walks the matrix off the
isometry group (hyperbolically fast in H), so the drag transform counts
compositions and applies `geometry.renormalizeIsometry` every 64 (the
constant is provisional).

**Hit-testing is mathematical** (the V0 promise): `unproject` the pointer,
pull back by `view⁻¹`, test canonical data — never pixels. `hitTest(scene,
ctx, screenPx, slopPx)` returns the topmost hit (reverse paint order):
polygons by convex containment (edge covectors `cross(vᵢ, vᵢ₊₁)` sign-matched
against the vertex mean — the same convexity assumption, and the same mean,
as V2.3 fill honesty); circles and point marks by intrinsic distance with
the px slop mapped through `scaleAt`; geodesics by `Hyperplane.distanceTo`
under the same slop; `domain` items are never hit. Hover highlighting is
then the existing machinery — a `StyleOverrides` entry and a repaint,
no scene mutation.

**The globe stays static in V3**: sphere has no `unproject` (the sheet
choice is parked in §6), and a screen-space trackball would cut against the
house style. Sphere-view interactivity equal to the flat charts is a
recorded WANT (§6), unlocked by that parked work.

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
| `style.ts` | style resolution: merge a `StyleOverride` over an item's style (pure, no geometry) | R2 |
| `cull.ts` | the visible `Frame`, `keepContours` (post-sampling), `preCulled` (V2 pre-sampling); shared with `sphere/` | R2 |
| `wallclip.ts` | `wallLine` (a wall as a unit-speed curve, shared with `sphere/`) + `wallParamRange` (clip its line to the frame) | R2 |
| `dash.ts` | intrinsic dash arithmetic: `dashRanges` / `strokeContours` / `circleSpeed`; shared with `sphere/` | R2 |
| `honesty.ts` | V2.3 fill honesty: the interior-point winding test (`honestFill`, `polygonInterior`) | R2 |
| `scene.ts` | scene → path list: the per-kind dispatch, composing the modules above (apply `g`, project, clip walls to frame/domain, cull, resolve style overrides) | V1 / R2 |
| `canvas.ts` | the Canvas2D painter (immediate mode) | V1 |
| `svg.ts` | one-file path-list → SVG string builder (no DOM): the painter's viewport formula verbatim, one `<path>` per RenderPath, `fill-rule="evenodd"`, `fill-opacity`, item id as `data-id` (one item emits several paths, so not `id`), 2-decimal px coordinates | V2 |
| `interact.ts` | pure camera transforms (zoom / pan / double-bisector drag with drift renormalization), `hitTest`, and the thin DOM controller | V3 |
| `png.ts` | PNG export of PAINTER STACKS at k× resolution: `RasterLayer` (the camera contract as an interface — paint this camera into this many device pixels), the pure `scaleCamera` (k·scalePx, k·centerPx — layers never see k, so a GPU field re-evaluates per pixel and vector layers re-sample through their px tolerances: sharper, not upsampled), `renderPng` (one 2D assembly canvas, layers `drawImage`'d back to front, transparent unless `background`; throws past the ~16384 px canvas cap, tiled rendering deferred), `sceneLayer` (the vector painter as a layer). GPU layers implement `RasterLayer` in their own module (`shader/layer.ts`); SVG stays vector-only. | §5.6 T3 |

Increments (PLAN.md §5.3.1): **V0** this README + `types.ts`, approved before
further code · **V1** sample/stroke/marks/scene + Canvas painter + the
success-criterion demo — the solved (2,3,7) H, (2,4,4) E, (2,3,5) S chambers
with walls and incircles through straight AND conformal charts, static
camera · **V2** (plan at §5.3.1's V2 entry) **V2.1** pre-sampling cull ·
**V2.2** the `domain` item, demos shed hand-drawn chrome · **V2.3**
wrap-around fill honesty · **V2.4** `svg.ts` + the export button on
`demos/group` · **V3** (plan at §5.3.1's V3 entry) **V3.0** the plan +
README amendments here and in `geometry/` · **V3.1** the geometry
primitives (`bisector`, `distanceTo`, `renormalizeIsometry`) + tests ·
**V3.2** pure camera transforms + `hitTest` + tests · **V3.3** the DOM
controller, `demos/group` live (drag/zoom/pan) · **V3.4** hover highlight
in the demo.

## Tests pin the math

- outline half-width at a sample ≈ `(w/2)·|J·n̂|`, checked against numerical
  differentiation of `project ∘ exp` in the normal direction;
- mark-ellipse axes = `r ×` the in-plane singular values of `jacobianAt`;
- sampled-polyline deviation from dense reference sampling ≤ tolerance;
- metric-circle samples at exact intrinsic distance `r` from the center;
- serializer path geometry identical to the painter's input;
- cull thresholds drop/keep items on either side of `cullPx`;
- (V2) pre-cull safety: on the full Milestone-1 scenes, everything the
  pre-cull drops, the post-sampling cull also drops;
- (V2) domain geometry: the disk fill at the domain radius, the rim annulus
  at px width / scalePx;
- (V2) fill honesty: the actual (2,3,5) stereographic far tile's fill is
  dropped, its neighbors' kept;
- (V2) SVG: parsed path coordinates identical to the painter's screen
  points; `data-id`, `fill-rule`, `fill-opacity` present.
- (V3) drag: `T·a₀ = a₁` exactly, T is J-orthogonal, and the dragged
  camera holds the grabbed content point under the cursor
  (`project(view'·x₀) = u₁`) in all three geometries and both chart
  families;
- (V3) zoom: the cursor point is fixed, scales compose multiplicatively;
- (V3) a long simulated drag (hundreds of moves) keeps `view` on the
  isometry group (J-orthogonality residual bounded — the renormalization
  pin);
- (V3) hitTest: containment in/out per kind, topmost-wins ordering, slop
  respected through `scaleAt`, domain never hit.
