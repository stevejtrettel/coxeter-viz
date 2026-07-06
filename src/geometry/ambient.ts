import type { Covec, Vec } from '@/math/vec';
import { identity, matScale, matSub, outer, type Mat } from '@/math/mat';

/**
 * The shared ambient toolkit (see README): the κ-form J = diag(κ, 1, …, 1)
 * with coordinate 0 first, its dual map, and the uniform reflection matrix
 * R = I − 2 (Jc) cᵀ — dimension-generic (the array length is the ambient
 * dimension), one implementation for R³ and R⁴.
 */

export type Kappa = 1 | 0 | -1;

/** ⟨a,b⟩_J = κ a₀b₀ + Σ_{i≥1} aᵢbᵢ. */
export function form(kappa: Kappa, a: Vec, b: Vec): number {
  let s = kappa * a[0] * b[0];
  for (let i = 1; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** J·c: the pole of a covector. */
export function dual(kappa: Kappa, c: Covec): Vec {
  const p = Float64Array.from(c);
  p[0] *= kappa;
  return p;
}

/** R = I − 2 (Jc) cᵀ for a unit covector (cᵀJc = 1). */
export function reflectionMat(kappa: Kappa, c: Covec): Mat {
  return matSub(identity(c.length), matScale(outer(dual(kappa, c), c), 2));
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Project a float-drifted matrix back onto the isometry group (README,
 * "isometry renormalization"). S/H (κ = ±1): Gram–Schmidt on COLUMNS with
 * respect to J — column k's target norm is ⟨c₀,c₀⟩ = κ, ⟨cₖ,cₖ⟩ = 1 for
 * k ≥ 1 (a Lorentz frame for H, an orthonormal one for S); H's column 0 is
 * g·e₀, a point, so it is flipped onto the upper sheet if needed. E (κ = 0):
 * row 0 is reset to e₀ᵀ, the spatial block is Gram–Schmidt'd in the ordinary
 * dot, and the translation column passes through untouched (any translation
 * is an isometry — there is nothing to correct). Idempotent; exact
 * J-orthogonality after; moves an O(ε)-drifted matrix by O(ε).
 */
export function renormalizeIsometryMat(kappa: Kappa, g: Mat): Mat {
  const n = Math.round(Math.sqrt(g.length));
  const R = Float64Array.from(g);
  const col = (k: number): Vec => {
    const v = new Float64Array(n);
    for (let r = 0; r < n; r++) v[r] = R[r * n + k];
    return v;
  };
  const setCol = (k: number, v: Vec): void => {
    for (let r = 0; r < n; r++) R[r * n + k] = v[r];
  };

  if (kappa === 0) {
    R[0] = 1;
    for (let c = 1; c < n; c++) R[c] = 0;
    for (let k = 1; k < n; k++) {
      const v = col(k);
      v[0] = 0;
      for (let j = 1; j < k; j++) {
        const cj = col(j);
        const coef = form(0, v, cj);
        for (let r = 1; r < n; r++) v[r] -= coef * cj[r];
      }
      const len = Math.sqrt(form(0, v, v));
      for (let r = 1; r < n; r++) v[r] /= len;
      setCol(k, v);
    }
    return R;
  }

  for (let k = 0; k < n; k++) {
    const v = col(k);
    for (let j = 0; j < k; j++) {
      const cj = col(j);
      const target = j === 0 ? kappa : 1;
      const coef = form(kappa, v, cj) / target;
      for (let r = 0; r < n; r++) v[r] -= coef * cj[r];
    }
    const target = k === 0 ? kappa : 1;
    let len = Math.sqrt(target * form(kappa, v, v)); // |⟨v,v⟩| via the sign we expect
    if (kappa === -1 && k === 0 && v[0] < 0) len = -len; // back to the upper sheet
    for (let r = 0; r < n; r++) v[r] /= len;
    setCol(k, v);
  }
  return R;
}
