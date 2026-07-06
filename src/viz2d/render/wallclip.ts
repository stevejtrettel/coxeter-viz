import { addScaled, cross, normSq, scale, vec3, type Vec } from '@/math/vec';
import type { Geometry, Isometry2, Point2 } from '@/geometry/types';
import { Hyperplane } from '@/geometry/Hyperplane';
import type { Model } from '@/models/types';
import { distToFrame, finite2, type Frame } from './cull';

/**
 * Wall-line geometry and its clipping to the frame (see README, "Full-line
 * walls"): a wall's geodesic as a unit-speed curve, and the visible
 * parameter range found by marching out until the projection leaves the
 * margin-expanded frame. `wallLine` is shared with sphereview's builder.
 */

/** Doubling steps when extending a wall line's parameter range. */
const EXTEND_MAX_ITERS = 60;
/** Bisection steps when shrinking an overshot wall endpoint back to the frame. */
const SHRINK_ITERS = 40;
/** A wall-line step below this px length counts as boundary accumulation. */
const ACCUMULATION_PX = 0.25;

/**
 * A wall's geodesic line as a unit-speed curve: the foot of the perpendicular
 * from `anchor` and the unit tangent along the wall.
 *
 * Foot: p₀ = normalize(q − (c·q)·Jc) — subtracting the pole component lands
 * in the wall (c·p = 0) in all three geometries, and stays on the correct
 * side of the locus (for H the residual is timelike: ⟨v,v⟩ = −1 − (c·q)²).
 * Degenerate only on S, when the anchor IS the wall's pole — the caller
 * retries with a different anchor.
 *
 * Tangent: w = c × n_p with n_p the conormal of the tangent space at p₀
 * (J·p₀ for S/H, e₀ for E — the affine slice's conormal), so c·w = 0 (along
 * the wall) and n_p·w = 0 (tangent), normalized by the form.
 */
export function wallLine(
  geom: Geometry<Point2, Isometry2>,
  wall: Hyperplane,
  anchor: Point2,
): { p0: Point2; tangent: Vec } | null {
  const side = wall.side(anchor);
  const v = addScaled(anchor, wall.pole, -side);
  if (normSq(v) < 1e-16) return null; // spherical anchor at the pole
  const p0 = geom.normalize(v);
  const np = geom.kind === 'euclidean' ? vec3(1, 0, 0) : geom.dual(p0);
  const w = cross(wall.covector, np);
  const len = Math.sqrt(geom.form(w, w));
  return { p0, tangent: scale(w, 1 / len) };
}

/** The anchor for wall clipping: the frame center, clamped into the domain. */
function frameAnchor(model: Model<Point2>, frame: Frame): Point2 {
  let ux = 0.5 * (frame.minX + frame.maxX);
  let uy = 0.5 * (frame.minY + frame.maxY);
  if (model.domain.kind === 'disk') {
    const r = Math.hypot(ux, uy);
    const rMax = 0.9 * model.domain.radius;
    if (r > rMax) {
      ux *= rMax / r;
      uy *= rMax / r;
    }
  }
  return model.unproject(vec3(ux, uy, 0));
}

/**
 * Extend a wall line's parameter in one direction (±1) by doubling from s0
 * until the projection is outside the margin-expanded frame and receding
 * (then bisect back until just outside), or steps fall sub-pixel (H-boundary
 * accumulation), or — on S, where the line closes up with period 2π — |s|
 * reaches π (the half-period that already covers the great circle once).
 */
function extendWallRange(
  gamma: (s: number) => Point2,
  model: Model<Point2>,
  dir: 1 | -1,
  s0: number,
  frameM: Frame,
  marginRender: number,
  scalePx: number,
  spherical: boolean,
): number {
  let sPrev = 0;
  let uPrev = model.project(gamma(0));
  let dPrev = distToFrame(uPrev, frameM);
  let mag = s0;
  for (let i = 0; i < EXTEND_MAX_ITERS; i++) {
    if (spherical && mag > Math.PI) mag = Math.PI;
    const s = dir * mag;
    const u = model.project(gamma(s));
    if (!finite2(u)) {
      return shrinkOutside(gamma, model, sPrev, s, frameM, marginRender);
    }
    const d = distToFrame(u, frameM);
    if (d > 0) {
      if (dPrev === 0) {
        // Crossed the frame boundary this step: stop at the crossing.
        return d <= marginRender ? s : shrinkOutside(gamma, model, sPrev, s, frameM, marginRender);
      }
      if (d >= dPrev) {
        // Outside and receding (never entered): give up on this direction.
        return shrinkOutside(gamma, model, sPrev, s, frameM, marginRender);
      }
      // Outside but approaching: keep marching toward the frame.
    }
    if (Math.hypot(u[0] - uPrev[0], u[1] - uPrev[1]) * scalePx < ACCUMULATION_PX) {
      return s;
    }
    if (spherical && mag >= Math.PI) return s;
    sPrev = s;
    uPrev = u;
    dPrev = d;
    mag *= 2;
  }
  return sPrev;
}

/**
 * Bisect between an acceptable parameter and an overshot one until the
 * endpoint sits just outside the margin frame (but not far outside — keeps
 * the gnomonic two-branch blowup out of the sampled range).
 */
function shrinkOutside(
  gamma: (s: number) => Point2,
  model: Model<Point2>,
  sIn: number,
  sOut: number,
  frameM: Frame,
  marginRender: number,
): number {
  let lo = sIn;
  let hi = sOut;
  for (let i = 0; i < SHRINK_ITERS; i++) {
    const u = model.project(gamma(hi));
    if (finite2(u)) {
      const d = distToFrame(u, frameM);
      if (d > 0 && d <= marginRender) return hi;
    }
    const mid = 0.5 * (lo + hi);
    const um = model.project(gamma(mid));
    if (finite2(um) && distToFrame(um, frameM) === 0) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return hi;
}

/**
 * Transform a wall by g and clip its line to the frame, returning the
 * unit-speed parametrization and its visible range (P1 refactor: dashing
 * needs the range, not a pre-sampled curve).
 */
export function wallParamRange(
  geom: Geometry<Point2, Isometry2>,
  model: Model<Point2>,
  wall: Hyperplane,
  g: Isometry2,
  frameM: Frame,
  marginRender: number,
  scalePx: number,
): { gamma: (s: number) => Point2; sMin: number; sMax: number } | null {
  const moved = Hyperplane.fromCovector(geom, geom.applyDual(g, wall.covector));
  let line = wallLine(geom, moved, frameAnchor(model, frameM));
  if (!line) {
    // Spherical anchor at the pole: any other point works.
    line = wallLine(geom, moved, geom.exp(geom.origin(), vec3(0, 1, 0), 1));
    if (!line) line = wallLine(geom, moved, geom.exp(geom.origin(), vec3(0, 0, 1), 1));
    if (!line) return null;
  }
  const { p0, tangent } = line;
  const gamma = (s: number): Point2 => geom.exp(p0, tangent, s);
  const spherical = geom.kind === 'spherical';

  let sMin: number;
  let sMax: number;
  if (spherical && model.straight) {
    // Gnomonic: the great circle projects in TWO branches (the sampler
    // follows the chart, not the wish — README); p₀(s) = cos(s)·p0₀ +
    // sin(s)·w₀ = A·cos(s − φ) vanishes at φ ± π/2, so the visible branch
    // (p₀ > 0, which already covers the projected line completely) is
    // exactly that open interval, shrunk back to the frame from the
    // blowups. γ(φ) is the wall's closest point to the chart origin.
    const phi = Math.atan2(tangent[0], p0[0]);
    sMax = shrinkOutside(gamma, model, phi, phi + Math.PI / 2 - 1e-9, frameM, marginRender);
    sMin = shrinkOutside(gamma, model, phi, phi - Math.PI / 2 + 1e-9, frameM, marginRender);
  } else {
    // First step ≈ 1/8 of the frame diagonal in render terms.
    const diag = Math.hypot(frameM.maxX - frameM.minX, frameM.maxY - frameM.minY);
    const s0 = diag / (8 * Math.max(model.scaleAt(p0), 1e-9));
    sMax = extendWallRange(gamma, model, 1, s0, frameM, marginRender, scalePx, spherical);
    sMin = extendWallRange(gamma, model, -1, s0, frameM, marginRender, scalePx, spherical);
  }
  if (sMax - sMin < 1e-12) return null;
  return { gamma, sMin, sMax };
}
