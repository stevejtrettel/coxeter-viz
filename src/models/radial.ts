import { Matrix3, Vector3 } from 'three';

/**
 * The distortion jacobian of a rotationally-symmetric chart at image point u:
 * scale s_r along the radial direction û, s_t on its orthogonal complement
 * (including out-of-plane for flat charts):
 *
 *    J = s_t·I + (s_r − s_t)·û ûᵀ .
 */
export function radialJacobian(u: Vector3, sr: number, st: number): Matrix3 {
  const r = u.length();
  if (r < 1e-15) return new Matrix3().multiplyScalar(st);
  const { x, y, z } = new Vector3().copy(u).multiplyScalar(1 / r);
  const d = sr - st;
  // prettier-ignore
  return new Matrix3().set(
    st + d * x * x,      d * x * y,      d * x * z,
         d * y * x, st + d * y * y,      d * y * z,
         d * z * x,      d * z * y, st + d * z * z,
  );
}
