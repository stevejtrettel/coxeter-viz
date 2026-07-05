import { normSq, scale, type Vec3 } from '@/math/vec';
import { identity, matAdd, matScale, outer, type Mat3 } from '@/math/mat';

/**
 * The distortion jacobian of a rotationally-symmetric chart at image point u:
 * scale s_r along the radial direction û, s_t on its orthogonal complement
 * (including out-of-plane for flat charts):
 *
 *    J = s_t·I + (s_r − s_t)·û ûᵀ .
 */
export function radialJacobian(u: Vec3, sr: number, st: number): Mat3 {
  const r2 = normSq(u);
  if (r2 < 1e-30) return matScale(identity(3), st);
  const uhat = scale(u, 1 / Math.sqrt(r2));
  return matAdd(matScale(identity(3), st), matScale(outer(uhat, uhat), sr - st));
}
