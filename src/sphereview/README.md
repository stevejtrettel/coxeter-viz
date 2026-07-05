# `sphereview/` — the perspective sphere view (stage 1)

Draws S² scene content as a translucent globe seen in 3D perspective — the
third consumer of the render2d path list: the **same `Scene` items** and the
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
p₀ = 0, and `V` is render2d's affine viewport unchanged. `SphereCamera` is
render2d's `Camera` plus `eyeDistance`; the view isometry is the same group
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

A fill is drawn when its whole region lies on one sheet (back fills simply
dim under the disk). A region straddling the silhouette gets its boundary
drawn split as usual but its **fill skipped** — a documented refusal
(region clipping against the cap is parked stage-2 work; PLAN.md §6). No
per-frame logging: this builder runs in immediate mode.

## Not a Model

`P_d` is 2:1 onto the visible disk — `unproject` needs a sheet choice, so
this view does not implement `Model`. It consumes render2d's minimal chart
interface (`Chart2`: project + jacobianAt), which `Model` also satisfies;
hit-testing with a front-sheet preference is deferred with interaction.

## Files

| file | responsibility |
|---|---|
| `types.ts` | `SphereCamera`, `SphereStyle` |
| `projection.ts` | `SpherePerspective` (P_d, jacobian, sheet, silhouette), `trigRoots` |
| `scene.ts` | `buildSpherePathList`: apply g, split at the silhouette, sample/stroke/mark via the V1 machinery, two-pass emission, cull, style overrides |

Depends on math → geometry → render2d. Demo: `demos/sphereview` — the V1
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
