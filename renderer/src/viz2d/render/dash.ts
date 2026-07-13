import type { Geometry, Isometry2, Point2 } from '@/geometry/types';
import type { Model } from '@/models/types';
import { sampleCurve } from './sample';
import { strokeOutline } from './stroke';
import type { RenderTolerances, StrokeStyle } from './types';

/**
 * Intrinsic dashing (P1, see README). All three curve generators are
 * constant-speed in their parameter (segments at d(a,b), walls at 1, circles
 * at sin_κ(r)), so a dash pattern of intrinsic lengths is exact parameter
 * arithmetic — no arclength integration. Shared by the flat builder and
 * sphereview's builder.
 */

/** Above this many dashes on one curve, fall back to a solid stroke. */
const MAX_DASHES = 1024;

/**
 * The ON parameter ranges of an intrinsic dash pattern along a
 * CONSTANT-SPEED curve. Degenerate patterns (or > MAX_DASHES) return the
 * whole range: solid is the safe fallback.
 */
export function dashRanges(
  t0: number,
  t1: number,
  speed: number,
  dash: { on: number; off: number; phase?: number },
): [number, number][] {
  const period = dash.on + dash.off;
  const L = (t1 - t0) * speed;
  if (!(speed > 0) || !(dash.on > 0) || !(dash.off > 0) || L / period > MAX_DASHES) {
    return [[t0, t1]];
  }
  const phase = ((dash.phase ?? 0) % period + period) % period;
  const ranges: [number, number][] = [];
  for (let s = -phase; s < L; s += period) {
    const a = Math.max(0, s);
    const b = Math.min(L, s + dash.on);
    if (b - a > 1e-12) ranges.push([t0 + a / speed, t0 + b / speed]);
  }
  return ranges;
}

/**
 * Outline contours for a (possibly dashed) stroke along a constant-speed
 * curve: each ON range is adaptively sampled as its own open curve (dash
 * ends are butt caps), and all dash outlines become contours of ONE
 * RenderPath — the SVG export inherits dashing by construction.
 */
export function strokeContours(
  gamma: (t: number) => Point2,
  t0: number,
  t1: number,
  speed: number,
  sty: StrokeStyle,
  model: Model<Point2>,
  scalePx: number,
  tol: RenderTolerances,
): Float64Array[] {
  const ranges = sty.dash ? dashRanges(t0, t1, speed, sty.dash) : [[t0, t1] as [number, number]];
  const out: Float64Array[] = [];
  for (const [a, b] of ranges) {
    const curve = sampleCurve(gamma, a, b, model, scalePx, tol, sty.width / 2);
    out.push(...strokeOutline(curve, model, sty.width));
  }
  return out;
}

/** sin_κ(r): the constant speed of the circle parametrization θ ↦ exp_c(r·v(θ)). */
export function circleSpeed(geom: Geometry<Point2, Isometry2>, r: number): number {
  switch (geom.kind) {
    case 'spherical':
      return Math.sin(r);
    case 'euclidean':
      return r;
    case 'hyperbolic':
      return Math.sinh(r);
  }
}
