import { Matrix3, Matrix4, Vector3, Vector4 } from 'three';

/**
 * The shared ambient toolkit (see README): the κ-form J = diag(κ, 1, …, 1)
 * with coordinate 0 first, its dual map, and the uniform reflection matrix
 * R = I − 2 (Jc) cᵀ — implemented concretely for the two ambient sizes.
 */

export type Kappa = 1 | 0 | -1;

/** ⟨a,b⟩_J = κ a₀b₀ + a₁b₁ + a₂b₂ on ambient R³. */
export function form3(kappa: Kappa, a: Vector3, b: Vector3): number {
  return kappa * a.x * b.x + a.y * b.y + a.z * b.z;
}

/** ⟨a,b⟩_J = κ a₀b₀ + a₁b₁ + a₂b₂ + a₃b₃ on ambient R⁴. */
export function form4(kappa: Kappa, a: Vector4, b: Vector4): number {
  return kappa * a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

/** J·c on ambient R³. */
export function dual3(kappa: Kappa, c: Vector3): Vector3 {
  return new Vector3(kappa * c.x, c.y, c.z);
}

/** J·c on ambient R⁴. */
export function dual4(kappa: Kappa, c: Vector4): Vector4 {
  return new Vector4(kappa * c.x, c.y, c.z, c.w);
}

/** R = I − 2 (Jc) cᵀ for a unit covector (cᵀJc = 1), ambient R³. */
export function reflection3(kappa: Kappa, c: Vector3): Matrix3 {
  const p = dual3(kappa, c); // the pole
  // prettier-ignore
  return new Matrix3().set(
    1 - 2 * p.x * c.x,     - 2 * p.x * c.y,     - 2 * p.x * c.z,
        - 2 * p.y * c.x, 1 - 2 * p.y * c.y,     - 2 * p.y * c.z,
        - 2 * p.z * c.x,     - 2 * p.z * c.y, 1 - 2 * p.z * c.z,
  );
}

/** R = I − 2 (Jc) cᵀ for a unit covector (cᵀJc = 1), ambient R⁴. */
export function reflection4(kappa: Kappa, c: Vector4): Matrix4 {
  const p = dual4(kappa, c);
  // prettier-ignore
  return new Matrix4().set(
    1 - 2 * p.x * c.x,     - 2 * p.x * c.y,     - 2 * p.x * c.z,     - 2 * p.x * c.w,
        - 2 * p.y * c.x, 1 - 2 * p.y * c.y,     - 2 * p.y * c.z,     - 2 * p.y * c.w,
        - 2 * p.z * c.x,     - 2 * p.z * c.y, 1 - 2 * p.z * c.z,     - 2 * p.z * c.w,
        - 2 * p.w * c.x,     - 2 * p.w * c.y,     - 2 * p.w * c.z, 1 - 2 * p.w * c.w,
  );
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
