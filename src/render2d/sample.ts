import { addScaled, scale, vec3, type Vec, type Vec3 } from '@/math/vec';
import { applyToVector, type Mat3 } from '@/math/mat';
import type { Geometry, Isometry2, Point2 } from '@/geometry/types';
import type { RenderTolerances } from './types';

/**
 * The minimal chart capability the sampling/stroking/marking machinery
 * needs: a projection and its distortion. Every `Model<Point2>` satisfies
 * it structurally; so does the sphere view's two-sheeted perspective
 * projection (which is deliberately NOT a Model — no unproject).
 */
export interface Chart2 {
  project(p: Point2): Vec3;
  jacobianAt(p: Point2): Mat3;
}

/**
 * Adaptive sampling of projected curves (see README, "Sampling, clipping,
 * culling"): recursive bisection of the canonical parameter until both the
 * FLATNESS deviation (distance of the projected midpoint from the chord, in
 * px — from the chord as a SEGMENT, not its midpoint: the canonical
 * parametrization is not affine in the chart, so a straight Klein chord's
 * midpoint lands on the chord but away from its center) and the WIDTH
 * VARIATION between adjacent samples (change of the half-width vector
 * (w/2)·J·n̂, in px) are under tolerance, with a recursion cap. Even straight
 * charts sample: the chord is straight but the width still varies along it.
 *
 * Precondition: the curve stays inside the model's domain over the sampled
 * range — clipping walls to the frame/domain happens upstream (scene.ts).
 */

/** One sample: canonical parameter, canonical point, projected render point. */
export interface CurveSample {
  readonly t: number;
  readonly p: Point2;
  /** model.project(p) — render coordinates, V not yet applied. */
  readonly u: Vec3;
}

export interface SampledCurve {
  /** Closed: last sample connects back to the first (no duplicate point). */
  readonly closed: boolean;
  readonly samples: readonly CurveSample[];
}

/** Below this render-space chord length a segment is too short to test width. */
const EPS_CHORD = 1e-12;
/** Below this form-norm² a frame candidate is rejected as degenerate. */
const EPS_FRAME = 1e-16;

/**
 * An orthonormal tangent frame [E₁, E₂] at p, with respect to the geometry's
 * metric (= the ambient form restricted to the tangent space). Candidates
 * with zero 0-coordinate are exact Euclidean tangents already; for S/H they
 * are made ⟨·,p⟩-orthogonal first (same construction as tests/helpers.ts
 * randomTangent), then Gram–Schmidt against the frame. The third candidate
 * covers spherical points with p₀ = 0, where a coordinate candidate can be
 * parallel to p.
 */
export function tangentFrame(geom: Geometry<Point2, Isometry2>, p: Point2): [Vec, Vec] {
  const candidates = [vec3(0, 1, 0), vec3(0, 0, 1), vec3(1, 0, 0)];
  const frame: Vec[] = [];
  for (const e of candidates) {
    if (frame.length === 2) break;
    let v: Vec = e;
    if (geom.kind !== 'euclidean') {
      v = addScaled(v, p, -geom.form(v, p) / geom.form(p, p));
    }
    for (const b of frame) v = addScaled(v, b, -geom.form(v, b));
    const n2 = geom.form(v, v);
    if (n2 > EPS_FRAME) frame.push(scale(v, 1 / Math.sqrt(n2)));
  }
  if (frame.length < 2) {
    throw new Error('tangentFrame: no nondegenerate frame at p — not a valid point?');
  }
  return [frame[0], frame[1]];
}

/**
 * Sample γ over [t0, t1] (open curve). `halfWidth` is the intrinsic stroke
 * half-width w/2; 0 disables the width-variation criterion (fill-only
 * curves). The whole curve is always split at least once, so a symmetric
 * curve whose projected midpoint happens to sit on the chord midpoint cannot
 * be accepted as a single straight segment.
 */
export function sampleCurve(
  gamma: (t: number) => Point2,
  t0: number,
  t1: number,
  model: Chart2,
  scalePx: number,
  tol: RenderTolerances,
  halfWidth = 0,
): SampledCurve {
  const samples: CurveSample[] = [];
  const a = sampleAt(gamma, model, t0);
  samples.push(a);
  const m = sampleAt(gamma, model, 0.5 * (t0 + t1));
  const b = sampleAt(gamma, model, t1);
  subdivide(gamma, model, scalePx, tol, halfWidth, a, m, 1, samples);
  subdivide(gamma, model, scalePx, tol, halfWidth, m, b, 1, samples);
  return { closed: false, samples };
}

/** Sample the geodesic segment a → b. */
export function sampleSegment(
  geom: Geometry<Point2, Isometry2>,
  model: Chart2,
  a: Point2,
  b: Point2,
  scalePx: number,
  tol: RenderTolerances,
  halfWidth = 0,
): SampledCurve {
  return sampleCurve(geom.geodesic(a, b), 0, 1, model, scalePx, tol, halfWidth);
}

/** Seed arcs for closed metric circles: 8 = 2³, so seeds enter at depth 3. */
const CIRCLE_SEEDS = 8;
const CIRCLE_SEED_DEPTH = 3;

/**
 * The metric circle's parametrization θ ↦ exp(c, r·(cos θ·E₁ + sin θ·E₂)) —
 * constant speed sin_κ(r) in θ (P1 dashing relies on this).
 */
export function circleGamma(
  geom: Geometry<Point2, Isometry2>,
  center: Point2,
  radius: number,
): (theta: number) => Point2 {
  const [e1, e2] = tangentFrame(geom, center);
  return (theta) => geom.exp(center, addScaled(scale(e1, Math.cos(theta)), e2, Math.sin(theta)), radius);
}

/**
 * Sample the metric circle of intrinsic radius r at center c — honestly, via
 * `circleGamma` (README: a jacobian ellipse would be wrong at finite
 * radius). Closed: the θ = 2π sample is dropped.
 */
export function sampleCircle(
  geom: Geometry<Point2, Isometry2>,
  model: Chart2,
  center: Point2,
  radius: number,
  scalePx: number,
  tol: RenderTolerances,
  halfWidth = 0,
): SampledCurve {
  const gamma = circleGamma(geom, center, radius);
  const samples: CurveSample[] = [];
  let prev = sampleAt(gamma, model, 0);
  samples.push(prev);
  for (let k = 1; k <= CIRCLE_SEEDS; k++) {
    const next = sampleAt(gamma, model, (2 * Math.PI * k) / CIRCLE_SEEDS);
    subdivide(gamma, model, scalePx, tol, halfWidth, prev, next, CIRCLE_SEED_DEPTH, samples);
    prev = next;
  }
  samples.pop(); // θ = 2π duplicates θ = 0
  return { closed: true, samples };
}

function sampleAt(gamma: (t: number) => Point2, model: Chart2, t: number): CurveSample {
  const p = gamma(t);
  return { t, p, u: model.project(p) };
}

/**
 * Refine (a, b] and append every accepted sample after `a`, ending with `b`.
 * `depth` counts bisections of the whole curve, so segments number ≤ 2^maxDepth.
 */
function subdivide(
  gamma: (t: number) => Point2,
  model: Chart2,
  scalePx: number,
  tol: RenderTolerances,
  halfWidth: number,
  a: CurveSample,
  b: CurveSample,
  depth: number,
  out: CurveSample[],
): void {
  const m = sampleAt(gamma, model, 0.5 * (a.t + b.t));
  const flatPx = scalePx * chordDistance(m.u, a.u, b.u);
  if (
    depth >= tol.maxDepth ||
    (flatPx <= tol.flatnessPx &&
      (halfWidth === 0 || widthVariationPx(model, scalePx, halfWidth, a, b) <= tol.widthPx))
  ) {
    out.push(b);
    return;
  }
  subdivide(gamma, model, scalePx, tol, halfWidth, a, m, depth + 1, out);
  subdivide(gamma, model, scalePx, tol, halfWidth, m, b, depth + 1, out);
}

/** Distance (render units) from u to the chord segment a–b, in the chart plane. */
function chordDistance(u: Vec3, a: Vec3, b: Vec3): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 < EPS_CHORD * EPS_CHORD ? 0 : Math.min(1, Math.max(0, ((u[0] - a[0]) * dx + (u[1] - a[1]) * dy) / l2));
  return Math.hypot(u[0] - (a[0] + t * dx), u[1] - (a[1] + t * dy));
}

/**
 * The px distance between the half-width vectors (w/2)·J·n̂ at the segment's
 * two ends, n̂ the unit normal of the render-space chord. This is what the
 * stroke offsets by (stroke.ts), so bounding its change per segment bounds
 * the outline's polygonal error.
 */
function widthVariationPx(
  model: Chart2,
  scalePx: number,
  halfWidth: number,
  a: CurveSample,
  b: CurveSample,
): number {
  const dx = b.u[0] - a.u[0];
  const dy = b.u[1] - a.u[1];
  const len = Math.hypot(dx, dy);
  if (len < EPS_CHORD) return 0;
  const n = vec3(-dy / len, dx / len, 0);
  const ha = applyToVector(model.jacobianAt(a.p), n);
  const hb = applyToVector(model.jacobianAt(b.p), n);
  return scalePx * halfWidth * Math.hypot(ha[0] - hb[0], ha[1] - hb[1]);
}
