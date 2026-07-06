# `geometry/` — the three constant-curvature geometries, one ambient picture

The six geometry cells (S/E/H × dims 2,3) presented through **one** linear-
algebraic setup, so everything downstream (walls, reflections, groups,
polytopes) is generic.

## The ambient picture

Ambient space is R^{n+1} for an n-dimensional geometry, with **coordinate 0
distinguished and written first**. `P = Point2` (a `Vec3`, ambient R³) for 2D,
`P = Point3` (a `Vec4`, ambient R⁴) for 3D — flat `Float64Array`s from `math/`,
coordinate 0 first (`p[0]` is p₀). The ambient bilinear form is

```
J = diag(κ, 1, …, 1),          κ = +1 (S),  0 (E),  −1 (H)
```

and the point locus and isometry group per geometry are

| geometry | points | isometries |
|---|---|---|
| Sⁿ | ⟨p,p⟩ = 1 | O(n+1) |
| Eⁿ | the affine slice p₀ = 1 | homogeneous matrices `[[1,0],[t,R]]` |
| Hⁿ | ⟨p,p⟩ = −1, p₀ > 0 (upper sheet) | O(n,1)⁺ |

The origin is `(1, 0, …, 0)` in all three. Isometries are plain
flat matrices (`Isometry2 = Mat3`, `Isometry3 = Mat4`); the Euclidean ones are automatically of homogeneous
shape because Euclidean reflections preserve the slice (see below).

Tangent vectors at p satisfy ⟨p,v⟩ = 0 (S/H) or v₀ = 0 (E); at the origin
these agree: coordinate 0 vanishes.

## Walls, poles, and the uniform reflection

A **wall** (mirror hyperplane) is fundamentally a **covector** c, normalized
so cᵀJc = 1; the wall is { p : c·p = 0 } (plain coordinate pairing) and the
associated half-space is { p : c·p ≤ 0 }. Its **pole** is the metric dual

```
pole = J c .
```

In S/H the covector and pole determine each other (J² = I). In E the covector
`(−d, a)` of the line/plane { a·x = d } carries the affine offset d that its
(degenerate) pole `(0, a)` cannot — this is *why* the covector is the
fundamental datum, and why `Hyperplane.fromPole` throws for Euclidean
geometry.

The reflection in a wall is **one formula in all three geometries**:

```
R = I − 2 (Jc) cᵀ        (= I − 2 · pole ⊗ covector)
```

For S/H this is the usual p ↦ p − 2⟨p,n⟩n. For E, with c = (−d, a), |a| = 1,
it is the affine reflection x ↦ x − 2(a·x − d)a in homogeneous form; row 0 of
R is e₀ᵀ because (Jc)₀ = 0, so the slice is preserved.

Under an isometry g, points move covariantly (p ↦ gp) but covectors
**contravariantly**: c ↦ (g⁻¹)ᵀc (`Geometry.applyDual`), so that side values
are equivariant, ((g⁻¹)ᵀc)·(gp) = c·p. In S/H this coincides with JgJ·c and
the distinction is invisible; with Euclidean homogeneous matrices it is real
(a translation moves a wall's offset entry, not its direction).

## Exponential map and distance (unit curvature)

With the κ-trig pair (cos/sin for S, identity for E, cosh/sinh for H) and a
tangent v at p of length ℓ = √⟨v,v⟩:

| | exp_p(tv) | distance(p,q) |
|---|---|---|
| S | cos(tℓ) p + sin(tℓ) v/ℓ | arccos ⟨p,q⟩ |
| E | p + t v | √⟨p−q, p−q⟩ |
| H | cosh(tℓ) p + sinh(tℓ) v/ℓ | arccosh(−⟨p,q⟩) |

(The Euclidean distance formula is the same J-form expression — the
degenerate J simply ignores the vanishing 0-component of p−q.)

`log(p,q)` inverts exp; on S it is undefined at the cut locus (antipode) and
callers must stay inside distance < π. `geodesic(p,q)` is the unit-domain
curve t ↦ exp_p(t·log_p q). `normalize` projects a drifted vector back onto
the locus (H: also onto the upper sheet; E: rescale to p₀ = 1).

## Bisectors, wall distance, isometry renormalization (V3 additions)

**Perpendicular bisector** — `Hyperplane.bisector(geom, p, q)`, p ≠ q: the
locus { x : d(x,p) = d(x,q) }, a wall. In S/H equidistance is ⟨x,p⟩ = ⟨x,q⟩
(cos / −cosh of distance, both monotone on the ranges we use), so the
covector is

```
c ∝ J(q − p)         side(p) = ⟨p,q⟩ − ⟨p,p⟩ < 0   (p's half-space is negative)
```

with q − p automatically spacelike (⟨q−p, q−p⟩ = 2(cosh d − 1) in H,
2(1 − cos d) in S). In E the same J kills the offset (as always), and the
covector is written directly: (−(|q_s|² − |p_s|²)/2, q_s − p_s), giving
side(p) = −|p_s − q_s|²/2 < 0. Normalized via `fromCovector`. The bisector
passes through the geodesic midpoint of p, q and is orthogonal to the
geodesic — pinned by tests, and the fact the drag machinery relies on
(viz2d/render V3): reflecting in two bisectors along a geodesic composes to the
pure translation along it. S degeneracies: antipodal p, q give the polar
equator (correct); p = q has no bisector (fromCovector throws on the zero
covector — callers guard).

**Wall distance** — `Hyperplane.distanceTo(geom, p)`: the side value of a
unit covector is the κ-sine of the signed distance, so distance is one
κ-trig row: arcsin |side| (S) · |side| (E) · arcsinh |side| (H).

**Isometry renormalization** — `Geometry.renormalizeIsometry(g)`: project a
float-drifted matrix back onto the isometry group (composing a drag isometry
into the camera 60×/s walks off O(n,1) hyperbolically). S/H: Gram–Schmidt on
columns with respect to J (H: column 0 normalized timelike onto the upper
sheet, the rest spacelike). E: row 0 reset to e₀ᵀ, the spatial block
Gram–Schmidt'd in the Euclidean dot, the translation column kept. Idempotent;
exactly J-orthogonal after; moves an O(ε)-drifted matrix by O(ε).

## Files

- `types.ts` — `Geometry<P,I>` (point ops + isometry ops in one interface),
  `GeometryKind`, the minimal `Vec<P>` constraint.
- `ambient.ts` — the shared toolkit: κ-forms, duals, the uniform reflection
  matrix — dimension-generic over the flat arrays (one implementation
  serves R³ and R⁴).
- `Spherical.ts`, `Euclidean.ts`, `Hyperbolic.ts` — `Spherical2/3`,
  `Euclidean2/3`, `Hyperbolic2/3`.
- `Hyperplane.ts` — wall = covector (+ cached pole); `fromCovector`,
  `fromPole` (S/H only), `side`; V3 adds `bisector`, `distanceTo`.
