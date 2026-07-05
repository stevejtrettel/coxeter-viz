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
