# `models/` — coordinate charts

A **model** maps canonical ambient points into a concrete picture and reports
how the intrinsic metric is distorted there. Geometry computes; models draw.
Every model implements `Model<P>` (`types.ts`): `project`/`unproject`,
`scaleAt`/`jacobianAt`, `renderDim`, `domain`, and the **`straight` flag**.

## The straight chart (the computational chart)

Per geometry, exactly one chart family renders **geodesics as straight
lines** — so convex-hull and incidence computations done there are plain
Euclidean convex geometry, and the results (being combinatorial) are valid in
every model:

| geometry | straight chart | image of the space |
|---|---|---|
| H | Klein disk/ball, `u = spatial/p₀` | open unit disk/ball |
| S | gnomonic, `u = spatial/p₀` | all of Rⁿ — but only the **open hemisphere p₀ > 0** |
| E | the plane/space itself, `u = spatial` | Rⁿ |

The formula is literally the same central projection in all three — only the
domain caveat differs (the sphere's gnomonic chart sees half the space; the
hemisphere policy for hulls is an open question tracked in PLAN.md).

## The conformal charts

| geometry | conformal chart | scale (render per unit intrinsic) |
|---|---|---|
| H | Poincaré, `u = spatial/(1+p₀)` | (1 − \|u\|²)/2 |
| S | stereographic, `u = spatial/(1+p₀)` | (1 + \|u\|²)/2 |
| E | (the identity chart is already conformal) | 1 |

Again one formula — projection from the antipode/mirror-image of the origin —
with κ flipping the sign in the conformal factor.

Additionally `Globe2` draws S² as the round unit sphere in R³ (`renderDim`
3, isometric, the honest picture).

## Distortion reporting

- `scaleAt(p)` — isotropic render-length per unit intrinsic length. **Exact
  for conformal charts**; for the non-conformal straight charts we return the
  transverse scale (see below), documented as an approximation.
- `jacobianAt(p)` — the full distortion as a `Matrix3` on render-space
  tangents (a round intrinsic disk renders as an ellipse: this is how Klein
  models draw correctly-sized objects).

For the rotationally-symmetric charts the jacobian is `s_t·I + (s_r − s_t)ûûᵀ`
with radial/transverse scales (r = |u| the chart radius):

| chart | s_r | s_t |
|---|---|---|
| Klein | 1 − r² | √(1 − r²) |
| gnomonic | 1 + r² | √(1 + r²) |
| Poincaré / stereographic | (1 ∓ r²)/2 | = s_r (conformal) |

Derivation: in the Klein chart ds² = dr²/(1−r²)² + r²dθ²/(1−r²), so a unit
intrinsic radial step renders at length 1−r² and a unit transverse step at
√(1−r²); the gnomonic case is the κ = +1 mirror (r = tan θ). The out-of-plane
axis of a flat (renderDim 2) chart gets s_t, matching how a ball of intrinsic
radius ε at p should render in thickness.

## Files

- `types.ts` — `Model<P>`, `Domain`.
- `radial.ts` — the shared jacobian helper for rotationally-symmetric charts.
- `klein.ts` (`Klein2/3`), `gnomonic.ts` (`Gnomonic2/3`), `cartesian.ts`
  (`Cartesian2/3`) — the straight charts.
- `poincare.ts` (`Poincare2/3`), `stereographic.ts` (`Stereographic2/3`) —
  the conformal charts.
- `globe.ts` (`Globe2`) — S² as the round sphere in R³.
