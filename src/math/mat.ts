/**
 * Small dense matrices for the ambient spaces: 3×3 and 4×4, stored flat
 * ROW-MAJOR in a `Float64Array` (entry (r,c) at index r·n + c), operated on
 * by IMMUTABLE free functions. The dimension n is inferred from the length
 * (n = √length), so every kernel here serves both sizes with one
 * implementation.
 *
 * Human-authored matrices go through `mat3`/`mat4` (readable rows in, flat
 * out); everything downstream consumes the flat form. The aliases are
 * documentation, not enforcement — names and conventions do the work.
 */

import type { Covec, Vec } from './vec';

/** A 3×3 matrix: 9 entries, row-major. */
export type Mat3 = Float64Array;
/** A 4×4 matrix: 16 entries, row-major. */
export type Mat4 = Float64Array;
/** Either matrix; n = √length. */
export type Mat = Float64Array;

/** Below this |pivot| a matrix is treated as singular. */
const EPS_SINGULAR = 1e-15;

/** Side length n of a flat n×n matrix; throws if the length is not square. */
export function matDim(M: Mat): number {
  const n = Math.round(Math.sqrt(M.length));
  if (n * n !== M.length) {
    throw new Error(`mat: length ${M.length} is not a perfect square`);
  }
  return n;
}

function fromRows(rows: readonly (readonly number[])[], n: number): Mat {
  if (rows.length !== n) {
    throw new Error(`mat: expected ${n} rows, got ${rows.length}`);
  }
  const M = new Float64Array(n * n);
  for (let r = 0; r < n; r++) {
    if (rows[r].length !== n) {
      throw new Error(`mat: row ${r} has length ${rows[r].length}, expected ${n}`);
    }
    for (let c = 0; c < n; c++) M[r * n + c] = rows[r][c];
  }
  return M;
}

/** Build a 3×3 matrix from readable rows: mat3([[1,0,0],[0,1,0],[0,0,1]]). */
export function mat3(rows: readonly (readonly number[])[]): Mat3 {
  return fromRows(rows, 3);
}

/** Build a 4×4 matrix from readable rows. */
export function mat4(rows: readonly (readonly number[])[]): Mat4 {
  return fromRows(rows, 4);
}

/** The n×n identity. */
export function identity(n: number): Mat {
  const M = new Float64Array(n * n);
  for (let i = 0; i < n; i++) M[i * n + i] = 1;
  return M;
}

/** The product A·B. */
export function matMul(A: Mat, B: Mat): Mat {
  const n = matDim(A);
  if (matDim(B) !== n) throw new Error('matMul: dimension mismatch');
  const R = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      const a = A[i * n + k];
      if (a === 0) continue;
      for (let j = 0; j < n; j++) R[i * n + j] += a * B[k * n + j];
    }
  }
  return R;
}

/**
 * The action on VECTORS: the left product M·v. Vectors and covectors are the
 * two fundamental types, and matrices act on them DIFFERENTLY — this action
 * and `applyToCovector` are the pair (names as settled in limit-sets
 * verify.ts).
 */
export function applyToVector(M: Mat, v: Vec): Vec {
  const n = matDim(M);
  if (v.length !== n) throw new Error('applyToVector: dimension mismatch');
  const r = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += M[i * n + j] * v[j];
    r[i] = s;
  }
  return r;
}

/**
 * The action on COVECTORS: the right product c·M (entry j is c · column j;
 * equivalently Mᵀ·c). Transporting a wall by an isometry g uses c ↦ c·g⁻¹,
 * which keeps the pairing — and hence half-space membership — invariant:
 *   dot(applyToCovector(matInverse(g), c), applyToVector(g, v)) = dot(c, v).
 * Composition is order-reversing: c·(AB) = (c·A)·B.
 */
export function applyToCovector(M: Mat, c: Covec): Covec {
  const n = matDim(M);
  if (c.length !== n) throw new Error('applyToCovector: dimension mismatch');
  const r = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += c[i] * M[i * n + j];
    r[j] = s;
  }
  return r;
}

/** Mᵀ. */
export function matTranspose(M: Mat): Mat {
  const n = matDim(M);
  const R = new Float64Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) R[c * n + r] = M[r * n + c];
  }
  return R;
}

/** s·M, entrywise. */
export function matScale(M: Mat, s: number): Mat {
  const R = new Float64Array(M.length);
  for (let i = 0; i < M.length; i++) R[i] = s * M[i];
  return R;
}

/** A + B, entrywise. */
export function matAdd(A: Mat, B: Mat): Mat {
  if (A.length !== B.length) throw new Error('matAdd: dimension mismatch');
  const R = new Float64Array(A.length);
  for (let i = 0; i < A.length; i++) R[i] = A[i] + B[i];
  return R;
}

/** A − B, entrywise. */
export function matSub(A: Mat, B: Mat): Mat {
  if (A.length !== B.length) throw new Error('matSub: dimension mismatch');
  const R = new Float64Array(A.length);
  for (let i = 0; i < A.length; i++) R[i] = A[i] - B[i];
  return R;
}

/** The outer product u vᵀ, so applyToVector(outer(u,v), w) = dot(v,w)·u. */
export function outer(u: Vec, v: Vec): Mat {
  const n = u.length;
  if (v.length !== n) throw new Error('outer: dimension mismatch');
  const R = new Float64Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) R[r * n + c] = u[r] * v[c];
  }
  return R;
}

/** M⁻¹ by Gauss–Jordan elimination with partial pivoting; throws if singular. */
export function matInverse(M: Mat): Mat {
  const n = matDim(M);
  const A = Float64Array.from(M);
  const I = identity(n as 3 | 4);
  for (let col = 0; col < n; col++) {
    let piv = col;
    let max = Math.abs(A[col * n + col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(A[r * n + col]);
      if (v > max) {
        max = v;
        piv = r;
      }
    }
    if (max < EPS_SINGULAR) throw new Error('matInverse: singular matrix');
    if (piv !== col) {
      for (let j = 0; j < n; j++) {
        let t = A[col * n + j];
        A[col * n + j] = A[piv * n + j];
        A[piv * n + j] = t;
        t = I[col * n + j];
        I[col * n + j] = I[piv * n + j];
        I[piv * n + j] = t;
      }
    }
    const invPivot = 1 / A[col * n + col];
    for (let j = 0; j < n; j++) {
      A[col * n + j] *= invPivot;
      I[col * n + j] *= invPivot;
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r * n + col];
      if (f === 0) continue;
      for (let j = 0; j < n; j++) {
        A[r * n + j] -= f * A[col * n + j];
        I[r * n + j] -= f * I[col * n + j];
      }
    }
  }
  return I;
}
