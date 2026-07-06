# shader — the GPU tiling field

**Status: SPEC (T0).** The second painter of the 2D system: a WebGL2 fragment
shader that draws the *whole* tessellation — tiles, edges, vertices — by
folding each pixel into the fundamental chamber. It renders the same picture
as render through the same camera, backward: where the vector layer pushes
canonical geometry forward through `view → chart → viewport`, the shader
pulls each pixel back through `viewport⁻¹ → chart⁻¹ → view⁻¹` and asks the
group what lives there.

**Identity is the knife** (PLAN §5.6): the GPU draws the GROUP — the
anonymous reflection-folding field, unlimited depth, antialiased. The CPU
draws NAMED elements (words, highlights, hulls, Cayley, hover) on top with
the existing render machinery, unmodified. This module knows no group
theory beyond the walls; the engine feeds it uniforms.

## The backward view formula

render's forward map (its README) is

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
**intrinsic** (the render stroke philosophy: metric-true dressing), so the
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
is `renderDim` 3 and rejected — the globe belongs to sphere.

Note the spherical honesty win: backward per-pixel mapping has no
wrap-around-fill problem — every pixel unprojects to exactly one sphere
point (stereographic) or one front-hemisphere point (gnomonic, matching the
chart's convention upstairs), so the far-tile fill question render V2.3
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

The field programs (§5.8) add: `uMode` (0 parity / 1 coset / 2 regions),
`uCosetAnchor` + `uCosetSL`; the star family `uNStar`, `uStarLine[]`,
`uStarWallC[]`, `uStarMin[]`, `uStarColor[]`, `uStarSin`, and the node
disk `uNodeP`/`uNodeColor`/`uNodeQ`; the region family `uSplit[3]`,
`uRegionColor[3]`, `uRegionSigns[3]`. All computed per draw from the
style's `coset`/`star`/`regions` by the pure helpers.

## Module shape

Raw WebGL2, zero dependencies; imports **types only** from its own layer
and below (`RealizedPolygon`, `Model`, `Camera` — render is a sibling in
the 2D-viz slot, sharing the camera type is the one-camera contract), plus
`CoxeterGroup` for the vector twin (group precedes 2D viz in the dependency
chain). No three.js (2D-system law).

| file | contents |
|---|---|
| `types.ts` | `TilingStyle`: the base layers (parity even/odd, edge bands, vertex disks — rgba, alpha 0 hides; widths/radii intrinsic; `maxFolds`) + the three optional FIELD PROGRAMS `coset` / `star` / `regions` (previous section) |
| `shader.ts` | the GLSL sources (bufferless fullscreen triangle; the fold + coloring fragment pipeline), `MAX_WALLS`/`MAX_VERTS` = 16 |
| `uniforms.ts` | the pure CPU side, all float64-tested: chart ids, κ-trig thresholds, packing, `foldPoint` (the float64 reference fold), `footOnWall`, `geodesicThrough`, `hashHue` (the shared coset-hue convention), `regionSignRows` |
| `TilingShader.ts` | the class: `setPolygon(RealizedPolygon)` · `setChart(Model)` (flat 2D charts only, throws otherwise) · `draw(camera, style)` (immediate mode, all uniforms every call; Camera in device px) · `dispose()` |
| `layer.ts` | `tilingLayer(poly, model, style)`: the field as a render `RasterLayer` for PNG export (fresh disposed shader per render; export-only seam) |
| `vector.ts` | the field's VECTOR TWIN for SVG (next section): `fieldScene`, `coverageRadius`, `mergeFieldPaths` |

The GPU output itself is verified visually against the cross-check
criterion below; everything CPU-side is unit-tested.

## Field programs (§5.8): cosets, Cayley, uniform tilings per pixel

The §5.7 content is CHAMBER-LOCAL after the fold, so the shader draws all
of it at arbitrary depth — live and in PNG — from a handful of uniforms.
`TilingStyle` gains three optional programs (SVG stays the CPU ball):

- **`coset`** (fill mode 1): the pixel's tile g·F has left coset g·W_S
  determined by the image g·v of the W_S-fixed anchor v (the chamber
  vertex for an adjacent pair, the perpendicular foot for one wall, x₀ for
  trivial W_S). The fold loop accumulates M⁻¹ (M⁻¹ ← M⁻¹·Rᵢ, one mat3
  multiply per reflection), so g·v = M⁻¹·v; its hash is the hue. The hash
  is a fixed convention — quantize the bounded coordinates
  (y, z)/(1 + |x|) at 4096, Wang-mix, take 16 bits — mirrored bit-exactly
  in float64 by `hashHue` (uniforms.ts), so CPU tiles, the SVG, and the
  field agree on every coset's color by construction. Float32 can split
  hues at extreme depth (documented; graceful speckle).
- **`star`** (bands over any fill): the Cayley edge net is the orbit of
  the half-segments [anchor, m_i] (m_i = normalize(anchor − ⟨anchor,cᵢ⟩·Jcᵢ),
  the perpendicular foot). Per band: |⟨q, Lᵢ⟩| < sin_κ(w) against the
  precomputed unit covector Lᵢ = cross(anchor, mᵢ) (the polytope engine's
  own two-point-geodesic convention), clamped to the segment by
  ⟨q, cᵢ⟩ ≥ ⟨anchor, cᵢ⟩; per-generator colors; a node disk
  Q(q − anchor) < Q_r caps the anchor end. Anchored at x₀ it is the Cayley
  graph; anchored at the Wythoff seed over the ringed walls it is the
  uniform tiling's edge net.
- **`regions`** (fill mode 2): within F the Wythoff faces partition the
  chamber into regions around its vertices, separated by the SPLITTERS
  cross(seed, m_k). A pixel's face type is the sign pattern of its
  splitter pairings; `regionSignRows` (uniforms.ts, pure) precomputes the
  expected signs at each surviving face's vertex, zeroing degenerate
  splitters (seed on the wall) and columns that separate no two surviving
  regions — which makes the one-surviving-type patterns (e.g. the
  dodecahedron's) an all-zero row that matches the whole chamber.

## The vector twin (SVG export)

SVG cannot rasterize a shader, so when a host has the field on, its SVG
export draws the field's **vector twin** (`vector.ts`): the same picture
regenerated as render scene items from the same `TilingStyle`, with every
convention matched to the GLSL by construction:

| layer | the GLSL | the twin |
|---|---|---|
| tiles | fold-count parity | word-length parity — both compute the sign character of the element carrying the tile to the chamber, so the two-colorings agree exactly |
| edges | band `\|⟨p,cᵢ⟩\| < sin_κ(w)` on every wall image — intrinsic half-width w each side | the wall-image ORBIT (`applyDual(g, cᵢ)` over the tile elements, dedup'd by quantized ±covector — ±c is one wall) drawn as full geodesic `line` items with stroke width **2w** (render offsets ±width/2) |
| vertices | `Q(p−v) < Q_r` disks | the vertex orbit (dedup'd by quantized point) as metric `circle` items of intrinsic radius r |
| compositing | tiles, then edges, then vertices | the same list order |
| hiding | alpha 0 disables a layer | alpha 0 / zero width / zero radius emits nothing |

Colors pass through the one `TilingStyle`; alpha becomes render `opacity`.
Edges are wall LINES, not per-tile polygon strokes — one item per mirror, so
translucent edge color composites once (a shared edge stroked per tile would
double its alpha and diverge from the GPU look).

**Coverage is ADAPTIVE (T6):** word depth is the wrong unit — its exchange
rate against intrinsic distance is group-dependent (a right-angled
pentagon reaches the boundary in far fewer letters than (2,3,7)). The twin
instead bounds enumeration by an intrinsic **coverage radius** computed
from the view by `coverageRadius(group, model, camera, size, εpx)`: sample
a coarse pixel grid over the frame, unproject the in-domain points, keep
those where a tile would still render at ≥ ε px WIDE
(`2·inradius(F) · model.scaleAt · scalePx ≥ ε` — width, not diameter:
chambers are slivers and the long axis overstates visibility), and take
the largest intrinsic distance from the origin to a kept point (in content
coordinates, through `view⁻¹`). ε defaults to 1.5 px and is the size/reach
dial. The group layer then enumerates that metric ball exactly —
`tessellateBall`, the radius-pruned BFS whose correctness argument lives
in the group README. One ε means the same visual completeness for every
group, chart, camera, and zoom; nothing is per-group tuned. In the
Poincaré disk this radius is ≈ ln(2·diam(F)·scalePx/ε); in E the frame
itself bounds it (tiles never shrink); in S it exhausts the group and the
SVG is EXACT.

**Remaining caveats (documented, by design):** the enumeration is still an
origin-centered ball, so a camera zoomed extremely toward the Poincaré
boundary sees a wedge no ball covers affordably — that regime belongs to
the GPU (which folds per pixel); `maxCount` is the backstop. The grid
sampling of the frame is a coarse relevance test, adequate for a
background field. A domain underlay in the `even` color quiets whatever
frontier remains.

## Verification criterion

The demo (`demos/tilingshader`) can overlay the CPU tessellation (render,
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
  (render/png.ts): `tilingLayer` (layer.ts) renders the field on a
  scratch canvas with a fresh, disposed TilingShader per export; the
  exporter scales the CAMERA, so k× is per-pixel re-evaluation, not
  upsampling. The screen path deliberately does not go through this seam.
