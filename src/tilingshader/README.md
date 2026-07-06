# tilingshader — the GPU tiling field

**Status: SPEC (T0).** The second painter of the 2D system: a WebGL2 fragment
shader that draws the *whole* tessellation — tiles, edges, vertices — by
folding each pixel into the fundamental chamber. It renders the same picture
as render2d through the same camera, backward: where the vector layer pushes
canonical geometry forward through `view → chart → viewport`, the shader
pulls each pixel back through `viewport⁻¹ → chart⁻¹ → view⁻¹` and asks the
group what lives there.

**Identity is the knife** (PLAN §5.6): the GPU draws the GROUP — the
anonymous reflection-folding field, unlimited depth, antialiased. The CPU
draws NAMED elements (words, highlights, hulls, Cayley, hover) on top with
the existing render2d machinery, unmodified. This module knows no group
theory beyond the walls; the engine feeds it uniforms.

## The backward view formula

render2d's forward map (its README) is

    screen = V ∘ model.project ∘ geom.apply(view, ·),
    V(u) = (cx + s·u₀, cy − s·u₁)          — s = scalePx, (cx,cy) = centerPx,
                                              screen y down.

Per pixel the shader inverts it, stage by stage:

1. **V⁻¹**: `u = ((px − cx)/s, (cy − py)/s)` in canvas pixel coordinates
   (the same space `Camera` lives in; the implementation flips
   `gl_FragCoord.y`, which is bottom-up, and accounts for any backing-store
   scale so both painters address identical pixels).
2. **Domain mask**: if `u` is outside the chart's domain (Poincaré/Klein:
   `|u| ≥ 1`), the fragment is transparent — the page background shows
   through, exactly where the vector layer draws nothing.
3. **chart⁻¹**: the model's `unproject` (table below) gives a canonical
   point on the quadric.
4. **view⁻¹**: one `mat3` uniform, `geom.inverse(camera.view)` computed
   float64 on the CPU each frame. Now `p` is in canonical content
   coordinates — the space the walls live in.
5. **Fold** (next section), then color.

Both painters consume the *same* `Camera` object; interaction is untouched —
the existing controller repaints two canvases from one camera.

## Folding into the chamber

The chamber is `{ p : ⟨p, cᵢ⟩ ≤ 0 for all walls }` (`RealizedPolygon.walls`,
generator-indexed). With `J = diag(κ, 1, 1)` the reflection in wall `c` is
the engine's uniform `I − 2(Jc)cᵀ`, which acts on points as

    p ← p − 2 ⟨p, c⟩ · Jc .

The fold loop sweeps the walls in generator order: whenever `⟨p, cᵢ⟩ > 0`
(wrong side), reflect and increment the fold count; repeat sweeps until a
full sweep makes no reflection or the iteration cap is hit. **One loop, no
geometry branch**: κ enters only through `Jc`, computed in-shader from the
single uniform `uKappa`.

*Convergence.* Every accepted reflection is across a wall image separating
`p` from the chamber, so it strictly decreases the distance from `p` to the
incenter (the origin). Discreteness puts finitely many chamber images inside
any ball, so the loop terminates — at depth roughly linear in intrinsic
distance from the origin (E), logarithmic in coordinate size (H), bounded by
the tile count (S). The cap `uMaxFolds` truncates the far field only.

*Parity.* The fold count's parity is the sign character of the group element
carrying the pixel's tile to the chamber — well-defined independent of the
folding path, so the two-coloring is honest.

*Renormalization.* Float32 drift off the quadric compounds under folding;
after each sweep the shader renormalizes (`p /= √|Q(p)|` for κ ≠ 0,
`p /= p₀` for κ = 0), mirroring `Geometry.renormalizeIsometry`'s practice
upstairs. `Q` is the κ-quadratic form below.

## The three coloring layers

All thresholds are precomputed on the CPU in float64 and compared per pixel
against plain pairings — no per-pixel inverse trig. All widths/radii are
**intrinsic** (the render2d stroke philosophy: metric-true dressing), so the
GPU field and the CPU vector strokes agree stylistically by construction.
Each layer antialiases by smoothstep over `fwidth` of its test value.

- **Tiles**: fold parity ⇒ `even`/`odd` fill colors. (Fold depth is also
  available in the shader should a depth ramp ever be wanted; not part of
  the V1 style.)
- **Edges**: the tiling's edge net is exactly the union of wall images, and
  after folding, `|⟨p, cᵢ⟩| = sin_κ(dist(pixel point, nearest image of wall
  i))` for normalized `p` and the solver's unit covectors. An edge band of
  intrinsic half-width `w` is the test `|⟨p, cᵢ⟩| < sin_κ(w)` — threshold
  precomputed, monotone in all three geometries (sinh, id, sin).
- **Vertices**: disks of intrinsic radius `r` about the chamber's vertices
  (`RealizedPolygon.chamber.vertices`, uploaded as canonical points).
  Distance compares uniformly through the κ-quadratic form of the
  difference,

      Q(v) = κ v₀² + v₁² + v₂² ,
      Q(p − q) = 2(cosh d − 1)  (H) · d²  (E) · 2(1 − cos d)  (S),

  each monotone in d (on [0, π] for S), so `Q(p − q) < Q_r` with `Q_r`
  precomputed per geometry draws a metrically round disk — again κ-branch
  free.

Layer order back to front: tiles, edges, vertices (the reference shader's
convention).

## Chart inverses

The shader implements every flat 2D chart the system has — the GLSL ports of
the models' `unproject`, selected by a chart-id uniform keyed off
`Model.name`:

| id | model | `unproject(u)` | domain mask |
|---|---|---|---|
| 0 | `poincare-disk` | `((1+r²), 2u₀, 2u₁)/(1−r²)` | `r < 1` |
| 1 | `klein-disk` | `(1, u₀, u₁)/√(1−r²)` | `r < 1` |
| 2 | `cartesian` | `(1, u₀, u₁)` | all |
| 3 | `stereographic` | `((1−r²), 2u₀, 2u₁)/(1+r²)` | all |
| 4 | `gnomonic` | `(1, u₀, u₁)/√(1+r²)` | all |

(`r² = u₀² + u₁²`.) Charts arrive as data, not branches-per-feature: the
fold loop and coloring are chart-agnostic; only step 3 dispatches. `Globe2`
is `renderDim` 3 and rejected — the globe belongs to sphereview.

Note the spherical honesty win: backward per-pixel mapping has no
wrap-around-fill problem — every pixel unprojects to exactly one sphere
point (stereographic) or one front-hemisphere point (gnomonic, matching the
chart's convention upstairs), so the far-tile fill question render2d V2.3
fought never arises here.

## Uniforms contract

The engine feeds the shader; nothing group-theoretic is duplicated in TS.

| uniform | type | source |
|---|---|---|
| `uResolution` | vec2 | canvas backing size |
| `uScalePx`, `uCenterPx` | float, vec2 | `Camera` |
| `uViewInv` | mat3 | `geom.inverse(camera.view)` (column-major upload) |
| `uChart` | int | `Model.name` → id table |
| `uKappa` | float | `RealizedPolygon` geometry kind |
| `uNWalls`, `uWalls[MAX_WALLS]` | int, vec3[] | `RealizedPolygon.walls` covectors, generator order |
| `uNVerts`, `uVerts[MAX_VERTS]` | int, vec3[] | `chamber.vertices` |
| `uEdgeSin`, `uVertQ` | float | `sin_κ(edgeHalfWidth)`, `Q_r(vertexRadius)` |
| `uColorEven/Odd/Edge/Vertex` | vec4 | style (alpha 0 disables a layer) |
| `uMaxFolds` | int | style (default 200) |

`MAX_WALLS = MAX_VERTS = 16` (compile-time; any compact 2D Coxeter polygon
the Porti solver realizes fits — this module is n-gon-capable from the
start, not triangle-only).

## Module shape

Raw WebGL2, zero dependencies; imports **types only** from its own layer and
below (`RealizedPolygon`, `Model`, `Camera` — render2d is a sibling in the
2D-viz slot, sharing the camera type is the one-camera contract). No
three.js (2D-system law). Provisional API, final shapes at T1:

```ts
export interface TilingStyle {
  even: Color; odd: Color; edge: Color; vertex: Color;  // rgba, a=0 hides
  edgeHalfWidth: number;   // intrinsic
  vertexRadius: number;    // intrinsic
  maxFolds?: number;
}

export class TilingShader {
  constructor(canvas: HTMLCanvasElement);
  setPolygon(poly: RealizedPolygon): void;  // κ, walls, vertices, thresholds
  setChart(model: Model<Point2>): void;     // renderDim-2 charts only; throws otherwise
  draw(camera: Camera, style: TilingStyle): void;
  dispose(): void;
}
```

CPU-side pure helpers (uniform packing, chart-id mapping, threshold
precomputation, shader-source assembly) are exported for vitest; the GPU
output itself is verified visually against the cross-check criterion below.

## Verification criterion

The demo (`demos/tilingshader`) can overlay the CPU tessellation (render2d,
same `RealizedPolygon`, same `Camera`) on the shader field: **edges must
coincide to the pixel** in every geometry × chart cell, under drag/pan/zoom.
One camera, two painters, one picture.

## Recorded limits

- **Float32**: hyperbolic canonical coordinates grow like cosh(distance);
  deep tiles lose precision and edge bands soften near the disk boundary —
  where tiles are sub-pixel anyway. Named overlays stay float64-exact on
  the CPU layer.
- **Iteration cap**: `uMaxFolds` truncates the far field (relevant mostly in
  E, where fold depth grows linearly with distance).
- **Exports**: SVG stays vector-only — a shader field has no vector form
  (documented, by design). PNG export is the `RasterLayer` compositor
  (render2d/png.ts): `tilingLayer` (layer.ts) renders the field on a
  scratch canvas with a fresh, disposed TilingShader per export; the
  exporter scales the CAMERA, so k× is per-pixel re-evaluation, not
  upsampling. The screen path deliberately does not go through this seam.
