import type { Vec3 } from '@/math/vec';
import type { Camera, ViewSize } from './types';

/**
 * The visible frame and the culling tests (see README, "Sampling, clipping,
 * culling"): the render-coords rectangle a screen surface sees, the
 * post-sampling `keepContours` safety net, and the V2 `preCulled`
 * pre-sampling test. Shared by the flat builder and sphereview's builder.
 */

/** The visible rectangle in render coordinates: V⁻¹ of the screen rect. */
export interface Frame {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function frameOf(camera: Camera, size: ViewSize): Frame {
  const s = camera.scalePx;
  const [cx, cy] = camera.centerPx;
  // screen x = cx + s·uₓ, screen y = cy − s·u_y (y flips).
  return {
    minX: (0 - cx) / s,
    maxX: (size.widthPx - cx) / s,
    minY: (cy - size.heightPx) / s,
    maxY: cy / s,
  };
}

export function expandFrame(f: Frame, m: number): Frame {
  return { minX: f.minX - m, minY: f.minY - m, maxX: f.maxX + m, maxY: f.maxY + m };
}

/** Distance (render units) from u to the frame rectangle; 0 inside. */
export function distToFrame(u: Vec3, f: Frame): number {
  const dx = Math.max(f.minX - u[0], 0, u[0] - f.maxX);
  const dy = Math.max(f.minY - u[1], 0, u[1] - f.maxY);
  return Math.hypot(dx, dy);
}

export function finite2(u: Vec3): boolean {
  return Number.isFinite(u[0]) && Number.isFinite(u[1]);
}

/**
 * Keep an item iff its contours are finite, intersect the frame, and exceed
 * cullPx. Shared with sphereview's builder.
 */
export function keepContours(
  contours: readonly Float64Array[],
  frame: Frame,
  scalePx: number,
  cullPx: number,
): boolean {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of contours) {
    for (let i = 0; i < c.length; i += 2) {
      const x = c[i];
      const y = c[i + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (minX > maxX) return false; // empty
  if (maxX < frame.minX || minX > frame.maxX || maxY < frame.minY || minY > frame.maxY) {
    return false;
  }
  return Math.max(maxX - minX, maxY - minY) * scalePx >= cullPx;
}

/**
 * V2 pre-sampling cull (README): a conservative screen bound from the item's
 * projected defining points, padded by intrinsicRadius × maxScale × 2, so
 * sampling can be skipped outright. Only the SOUND cases decide:
 *
 * - sub-pixel, all charts — the small-item regime: the chart's scale is
 *   near-constant across a screen-small item, and the factor 2 covers the
 *   variation;
 * - off-frame, only where the projected spine provably stays in the convex
 *   hull of the projected defining points (straight non-spherical charts:
 *   Klein, Cartesian — geodesics are chords there; conformal arcs bulge
 *   outside the hull, and gnomonic segments can cross the horizon).
 *
 * Non-finite projections are unboundable — keep and sample. `keepContours`
 * remains the post-sampling safety net either way, so the pre-cull can only
 * ever save work, never change the output.
 *
 * `pad` (render units, = intrinsicRadius × maxScale × 2) is LAZY: it only
 * ever expands the kept region, so an item whose bare bbox already
 * intersects the frame at super-cull size is kept without evaluating it —
 * the common full-view case pays for the projections and nothing else.
 */
export function preCulled(
  pts: readonly Vec3[],
  pad: () => number,
  offFrameEligible: boolean,
  frame: Frame,
  scalePx: number,
  cullPx: number,
): boolean {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const u of pts) {
    if (!finite2(u)) return false;
    if (u[0] < minX) minX = u[0];
    if (u[0] > maxX) maxX = u[0];
    if (u[1] < minY) minY = u[1];
    if (u[1] > maxY) maxY = u[1];
  }
  if (minX > maxX) return false;
  const bigEnough = Math.max(maxX - minX, maxY - minY) * scalePx >= cullPx;
  const onFrame = !(maxX < frame.minX || minX > frame.maxX || maxY < frame.minY || minY > frame.maxY);
  if (bigEnough && (onFrame || !offFrameEligible)) return false; // keep: pad can't shrink either verdict
  const m = pad();
  if ((Math.max(maxX - minX, maxY - minY) + 2 * m) * scalePx < cullPx) return true;
  return (
    offFrameEligible &&
    (maxX + m < frame.minX || minX - m > frame.maxX || maxY + m < frame.minY || minY - m > frame.maxY)
  );
}
