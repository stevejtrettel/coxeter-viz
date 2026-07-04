# `math/` — generic numerics

Dimension- and geometry-agnostic numerical linear algebra on plain
`number[][]` matrices. Nothing in this folder knows about geometry, three.js,
or Coxeter groups; everything below `src/` may depend on it, it depends on
nothing.

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
