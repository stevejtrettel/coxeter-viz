import { vec3, type Vec3 } from '@/math/vec';
import type { Mat3 } from '@/math/mat';
import type { Point2 } from '@/geometry/types';
import { Spherical2 } from '@/geometry/Spherical';
import { tangentFrame, type Chart2 } from '@/viz2d/render/sample';
import type { ScreenUnprojector } from '@/viz2d/render/interact';

/**
 * The perspective projection of S² and its ribbon jacobian (see README).
 * Eye at distance d > 1 on the distinguished axis, image plane p₀ = 0:
 *
 *    P_d(p) = (p₁, p₂) · d/(d − p₀)
 *
 * Satisfies render2d's Chart2 (project + jacobianAt) — deliberately NOT a
 * Model: the map is 2:1 onto the visible disk and unproject needs a sheet
 * choice (deferred with hit-testing).
 */
export class SpherePerspective implements Chart2 {
  readonly eyeDistance: number;
  private readonly geom: Spherical2;

  constructor(eyeDistance: number) {
    if (!(eyeDistance > 1)) {
      throw new Error(`SpherePerspective: eye distance must exceed 1 (got ${eyeDistance}).`);
    }
    this.eyeDistance = eyeDistance;
    this.geom = new Spherical2();
  }

  project(p: Point2): Vec3 {
    const s = this.eyeDistance / (this.eyeDistance - p[0]);
    return vec3(s * p[1], s * p[2], 0);
  }

  /**
   * The ribbon distortion J(p) = √(M Mᵀ): M is dP_d on an orthonormal
   * tangent frame at p — with s = d/(d − p₀) and tangent v,
   *
   *    dP_d(v) = s·(v₁, v₂) + s²·(v₀/d)·(p₁, p₂)
   *
   * — and √(M Mᵀ) is the symmetric polar factor, frame-independent
   * (M ↦ M·O leaves M Mᵀ fixed). Its singular values are the ribbon's
   * width scales; the one along the view ray collapses at the silhouette.
   * The out-of-plane entry is unused by the 2D pipeline; it carries the
   * smaller in-plane scale.
   */
  jacobianAt(p: Point2): Mat3 {
    const d = this.eyeDistance;
    const s = d / (d - p[0]);
    const [e1, e2] = tangentFrame(this.geom, p);
    // Columns of M: dP_d(e1), dP_d(e2).
    const a = s * e1[1] + s * s * (e1[0] / d) * p[1];
    const c = s * e1[2] + s * s * (e1[0] / d) * p[2];
    const b = s * e2[1] + s * s * (e2[0] / d) * p[1];
    const e = s * e2[2] + s * s * (e2[0] / d) * p[2];
    // B = M Mᵀ; S = √B = (B + √(det B)·I) / √(tr B + 2√(det B)).
    const b00 = a * a + b * b;
    const b01 = a * c + b * e;
    const b11 = c * c + e * e;
    const det = Math.abs(a * e - b * c);
    const tr = b00 + b11;
    const denom = Math.sqrt(tr + 2 * det);
    if (!(denom > 1e-300)) {
      // M ≈ 0 cannot occur on the sphere (the along-silhouette scale is
      // always positive), but stay finite rather than divide by zero.
      return new Float64Array(9) as Mat3;
    }
    const j00 = (b00 + det) / denom;
    const j01 = b01 / denom;
    const j11 = (b11 + det) / denom;
    const sigmaMin = (2 * det) / (denom + Math.sqrt(Math.max(0, tr - 2 * det)));
    const J = new Float64Array(9) as Mat3;
    J[0] = j00;
    J[1] = j01;
    J[3] = j01;
    J[4] = j11;
    J[8] = sigmaMin;
    return J;
  }

  /** Signed sheet function h(p) = p₀ − 1/d: positive on the visible cap. */
  sheet(p: Point2): number {
    return p[0] - 1 / this.eyeDistance;
  }

  /**
   * The inverse of P_d once a sheet is named (README, stage 2a): with
   * k = |u|²/d², p₀ solves (1+k)p₀² − 2kd·p₀ + kd² − 1 = 0; the front sheet
   * is the root nearer the eye (+), the back the farther (−). Null outside
   * the silhouette (negative discriminant). Normalized against float drift.
   */
  unproject(u: Vec3, sheet: 'front' | 'back'): Point2 | null {
    const d = this.eyeDistance;
    const k = (u[0] * u[0] + u[1] * u[1]) / (d * d);
    const disc = 1 + k * (1 - d * d);
    if (disc < 0) return null;
    const sign = sheet === 'front' ? 1 : -1;
    const p0 = (k * d + sign * Math.sqrt(disc)) / (1 + k);
    const s = (d - p0) / d;
    return this.geom.normalize(vec3(p0, s * u[0], s * u[1]));
  }

  /** Render radius of the silhouette circle p₀ = 1/d: d/√(d² − 1). */
  silhouetteRadius(): number {
    const d = this.eyeDistance;
    return d / Math.sqrt(d * d - 1);
  }
}

/**
 * The globe's drag capability (README, stage 2a): grab the FRONT sheet —
 * what the cursor visually touches. Null outside the silhouette, which is
 * exactly the drag guard render2d's controller expects.
 */
export function sphereUnprojector(persp: SpherePerspective): ScreenUnprojector {
  return (camera, px) =>
    persp.unproject(
      vec3(
        (px[0] - camera.centerPx[0]) / camera.scalePx,
        (camera.centerPx[1] - px[1]) / camera.scalePx, // screen y is down
        0,
      ),
      'front',
    );
}

/** Roots below this amplitude ratio are treated as tangency (no crossing). */
const EPS_TRIG = 1e-12;

/**
 * The solutions of A·cos t + B·sin t + C = 0 in [0, 2π), ascending: none
 * (no crossing, or tangency), or two (a proper crossing pair; the double
 * root of exact tangency counts as none). Writing the left side as
 * R·cos(t − φ) + C with R = √(A² + B²), φ = atan2(B, A): t = φ ± acos(−C/R).
 */
export function trigRoots(A: number, B: number, C: number): number[] {
  const R = Math.hypot(A, B);
  if (R < EPS_TRIG) return [];
  const c = -C / R;
  if (c <= -1 + EPS_TRIG || c >= 1 - EPS_TRIG) return [];
  const phi = Math.atan2(B, A);
  const a = Math.acos(c);
  const tau = 2 * Math.PI;
  const r1 = ((phi - a) % tau + tau) % tau;
  const r2 = ((phi + a) % tau + tau) % tau;
  return r1 <= r2 ? [r1, r2] : [r2, r1];
}
