# `math/` — generic numerics and the linear-algebra layer

Dimension- and geometry-agnostic numerics. Nothing in this folder knows about
geometry, rendering, or Coxeter groups; everything under `src/` may depend on
it, it depends on nothing (three.js included — this repo's core has no
three.js; see PLAN.md §5.2b).

## `vec.ts` / `mat.ts` — the ambient linear algebra

Vectors in R³/R⁴ and 3×3/4×4 matrices as flat `Float64Array`s (matrices
row-major, dimension inferred from length so one kernel serves both sizes),
operated on by **immutable free functions**: `add`, `scale`, `addScaled`,
`dot`, `cross` (R³), `tripleCross` (R⁴, the orthogonal complement of three
vectors — the polytope vertex solve), `matMul`, `matVec`, `matTranspose`,
`matInverse` (Gauss–Jordan, partial pivoting), `outer` (u vᵀ — the reflection
formula's building block). Readable constructors `vec3/vec4/mat3/mat4` take
rows; everything downstream consumes the flat form. Coordinate 0 is the
distinguished (time-first / affine) coordinate: `v[0]` is p₀. The type
aliases are documentation — TypeScript is structural — and the sign
conventions are fixed by `dot(cross(a,b), x) = det[x;a;b]` and
`dot(tripleCross(a,b,c), x) = det[x;a;b;c]`.

**Vectors and covectors are the two fundamental types, and both live here**
(`Vec3/4`, `Covec3/4`): the two sides of the *linear* duality V / V*, paired
by `dot`, with **matrices acting on them differently** — `applyToVector(M,v)
= M·v` and `applyToCovector(M,c) = c·M` (the pair settled in limit-sets
`verify.ts`; transporting a wall by c ↦ c·g⁻¹ is what keeps half-space
membership isometry-invariant). A **point** does not live here: it is an
element of a geometry's nonlinear locus, a geometric concept; `Point2/3` is
aliased in `geometry/`, produced by `normalize`.

`dot`/`norm`/`normSq` here are the plain **Euclidean coordinate** operations
(chart/render-space lengths); the ambient J-forms live in `geometry/`.

## `symmetricEig.ts`

Eigendecomposition of a real **symmetric** matrix by the cyclic Jacobi
method: A = Q Λ Qᵀ with Q orthogonal. Jacobi is the right tool here — our
matrices are small (rank ≤ 4 Gram matrices) and symmetric, and Jacobi is
simple, unconditionally convergent on symmetric input, and accurate for
clustered/zero eigenvalues (which we meet constantly: semidefinite Gram
matrices of Euclidean groups have an exact zero eigenvalue).

Returns `{ values, vectors }` with `vectors[a]` the unit eigenvector for
`values[a]` (so A ≈ Σₐ λₐ vₐ vₐᵀ). No ordering is promised.

## `linearSolve.ts`

Solve A x = b by Gaussian elimination with partial pivoting. Throws on a
(numerically) singular system rather than returning garbage. Used for
small dense systems only (interior points, vertex solves).
