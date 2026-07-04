/**
 * Eigendecomposition of a real symmetric matrix by the cyclic Jacobi method.
 *
 * Each Jacobi rotation zeroes one off-diagonal pair (p,q) by rotating in the
 * (p,q)-plane; sweeping all pairs repeatedly drives the off-diagonal mass to
 * zero quadratically. We accumulate the rotations in V, so at convergence
 * A = V diag(values) Vᵀ with V orthogonal.
 */

export interface EigResult {
  values: number[];
  /** vectors[a] is the unit eigenvector belonging to values[a]. */
  vectors: number[][];
}

export function symmetricEig(A: number[][], maxSweeps = 50): EigResult {
  const n = A.length;
  const a = A.map((row) => row.slice());
  // V starts as the identity; columns become the eigenvectors.
  const V: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );

  const offNorm = () => {
    let s = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) s += a[p][q] * a[p][q];
    return Math.sqrt(s);
  };
  const scale = Math.max(1e-300, ...A.map((row) => row.map(Math.abs)).flat());

  for (let sweep = 0; sweep < maxSweeps && offNorm() > 1e-15 * scale * n; sweep++) {
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) <= 1e-300) continue;
        // The rotation angle θ solving tan(2θ) = 2a_pq / (a_qq − a_pp),
        // via the stable tangent formula t = sign(τ) / (|τ| + √(1+τ²)).
        const tau = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;

        const apq = a[p][q];
        a[p][p] -= t * apq;
        a[q][q] += t * apq;
        a[p][q] = 0;
        a[q][p] = 0;
        for (let k = 0; k < n; k++) {
          if (k !== p && k !== q) {
            const akp = a[k][p];
            const akq = a[k][q];
            a[k][p] = c * akp - s * akq;
            a[p][k] = a[k][p];
            a[k][q] = s * akp + c * akq;
            a[q][k] = a[k][q];
          }
          const vkp = V[k][p];
          const vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }

  const values = Array.from({ length: n }, (_, i) => a[i][i]);
  const vectors = Array.from({ length: n }, (_, col) => V.map((row) => row[col]));
  return { values, vectors };
}
