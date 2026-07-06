# `sphere/` — the perspective sphere view (stage 1)

Draws S² scene content as a translucent globe seen in 3D perspective — the
third consumer of the render path list: the **same `Scene` items** and the
**same painters**, through a perspective projection instead of a flat chart.
S²-only; no three.js. Planned at PLAN.md §5.3.2 (decided 2026-07-05); this
README is the spec, written before the code.

## The view formula

```
screen = V ∘ P_d ∘ apply(g, ·)          g = camera.view ∈ O(3)
P_d(p) = (p₁, p₂) · d / (d − p₀)
```

The eye sits on the distinguished axis at distance `d > 1` (canonical
coordinates — coordinate 0 points at the viewer), the image plane is
p₀ = 0, and `V` is render's affine viewport unchanged. `SphereCamera` is
render's `Camera` plus `eyeDistance`; the view isometry is the same group
element as everywhere.

## Width law: ribbons (surface ink)

Strokes are ink on the sphere, exactly as in every flat chart — this is a
2D view. The distortion at p is

```
J(p) = √(M Mᵀ),   M = dP_d on an orthonormal tangent frame at p
```

— the symmetric polar factor of the perspective derivative. The frame
choice drops out (M ↦ M·O leaves MMᵀ fixed), J is symmetric, and it plugs
into the V1 sampler/stroker/marks as just another `jacobianAt`: offsets
±(w/2)·J·n̂ land on the jacobian ellipse {dP_d(ν) : |ν| = 1}, the same
contract the V1 tests pin. Consequences, intended: widths taper to a
hairline where a curve meets the silhouette (ink seen edge-on; cut ends
feather), and point marks become slivers near the horizon — honest
edge-on disks. Fills never use J. (The isotropic tube law d/(d−p₀) was
considered and not chosen — PLAN.md §5.3.2.)

For the derivative, with s = d/(d − p₀) and tangent v at p:

```
dP_d(v) = s·(v₁, v₂) + s²·(v₀/d)·(p₁, p₂)
```

## Visibility: two sheets, closed-form splits

The visible cap is ⟨p, ê⟩ = p₀ > 1/d. The silhouette p₀ = 1/d projects to
the circle of radius **d/√(d² − 1)** (larger than the equator's image —
correct perspective). Every stage-1 curve is a circle in R³, so along any
of them the sheet function is

```
h(t) = p₀(t) − 1/d = A·cos t + B·sin t + C
```

and the splits are the roots of one trig equation (`trigRoots`) — no
root-finding. Curves are cut at the crossings; each piece is pure-sheet.
A great circle always has a back part (min p₀ = −√(p₀²+w₀²) ≤ 0 < 1/d);
one with amplitude below 1/d is entirely back.

## Two-pass paint

Occlusion on a sphere is only front-over-back: back pieces are emitted
first, then the silhouette disk as an ordinary translucent filled path
(`SphereStyle` — back content dims by its opacity, for free), then front
pieces. Within each pass, scene order is preserved. The disk may carry a
px-width rim ring: view dressing, not scene content — the one deliberate
exception to intrinsic sizing.

## Fills

A single-sheet fill draws whole (back fills simply dim under the disk),
with one caveat resolved in P3: a boundary entirely on one sheet may still
**swallow the whole silhouette** (a large region around the view axis) —
convexity makes a one-point test sufficient, and the region then emits a
ring `[boundary, silhouette]` on its boundary's sheet plus the far cap as a
full silhouette disk on the other.

**Straddling fills split at the silhouette (P3, `clippedFillLoops`)**. The
boundary's pure-sheet pieces (their endpoints are `splitArc`'s trig roots,
exactly p₀ = 1/d) merge into cyclic runs alternating front/back; each
same-sheet loop closes along arcs of the SILHOUETTE CIRCLE — which projects
angle-preservingly to the render circle of silhouette radius — choosing,
per gap, whichever arc lies inside the region (a containment test; both
cannot be inside, else there would be no crossings). One loop per sheet for
CONVEX regions — the standing convexity assumption shared with fill honesty
and hitTest. Front loop fills in the front pass, back loop in the back
pass.

## Back-side dashing and hover (P3)

`SphereBuildContext.backDash = { on, off }` dashes all BACK stroke pieces
with an intrinsic pattern (the hidden-line convention) via render's P1
dash machinery — sphere arcs are unit-speed (circles: sin r), so dashing is
parameter arithmetic. An item's own `StrokeStyle.dash` applies to both
sheets and wins. `sphereHitTest` (interact.ts) is front-sheet hover: the
stage-2a unproject pulled back by the view, feeding render's chart-free
`hitTestCanonical`; back content is not hoverable — it is behind the globe.

## Not a Model

`P_d` is 2:1 onto the visible disk — `unproject` needs a sheet choice, so
this view does not implement `Model`. It consumes render's minimal chart
interface (`Chart2`: project + jacobianAt), which `Model` also satisfies;
hit-testing with a front-sheet preference is deferred with interaction.

## Unproject with a sheet choice — globe rotation (stage 2a)

The inverse IS available once the sheet is named. For u with r² = |u|²,
substituting p₁,₂ = u₁,₂·(d − p₀)/d into ⟨p,p⟩ = 1 gives the quadratic
(1 + k)p₀² − 2kd·p₀ + kd² − 1 = 0 with k = r²/d², whose discriminant
1 + k(1 − d²) is nonnegative exactly inside the silhouette
(r ≤ d/√(d² − 1)):

```
p₀ = (kd ± √(1 + k(1 − d²))) / (1 + k)      + : front (nearer the eye),  − : back
```

`SpherePerspective.unproject(u, sheet)` returns the normalized point, or
null outside the silhouette. **Globe rotation** is then the flat charts'
drag verbatim: grab the FRONT sheet under the cursor, build the S²
double-bisector translation (a rotation), compose into `camera.view`,
renormalize every RENORM_EVERY — all render V3 machinery. The controller
takes a pluggable `ScreenUnprojector` capability, so one controller serves
Models and this view; `SphereCamera.eyeDistance` survives the pure camera
transforms because they spread the input camera. Sphere hit-testing stays
deferred (§6).

## Files

| file | responsibility |
|---|---|
| `types.ts` | `SphereCamera`, `SphereStyle` |
| `projection.ts` | `SpherePerspective` (P_d, jacobian, sheet, silhouette, stage-2a `unproject`), `trigRoots`, `sphereUnprojector` |
| `scene.ts` | `buildSpherePathList`: apply g, split at the silhouette, sample/stroke/mark via the V1 machinery, two-pass emission, cull, style overrides, P3 clipped fills + back dashing |
| `interact.ts` | `sphereHitTest`: front-sheet hover over render's canonical hit test |

Depends on math → geometry → render. Demo: `demos/sphereview` — the V1
(2,3,5) chamber scene UNCHANGED, viewed from an angle that wraps the
walls' far arcs behind the globe.

## Tests pin the math

- stroke offsets lie on the jacobian ellipse of P_d ∘ exp (the V1
  numerical-differentiation harness, unchanged);
- J symmetric; identical for different tangent frames;
- `trigRoots` against brute-force sign scans;
- split pieces are pure-sheet and split points satisfy p₀ = 1/d;
- emission order: back pieces, disk, front pieces;
- silhouette disk radius d/√(d² − 1);
- straddling fills are skipped, single-sheet fills are not.
