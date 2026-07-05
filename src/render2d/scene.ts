import { addScaled, cross, normSq, scale, vec3, type Vec, type Vec3 } from '@/math/vec';
import type { Geometry, Isometry2, Point2 } from '@/geometry/types';
import { Hyperplane } from '@/geometry/Hyperplane';
import type { Model } from '@/models/types';
import {
  DEFAULT_TOLERANCES,
  type Camera,
  type FillStyle,
  type PathList,
  type PointStyle,
  type RegionStyle,
  type RenderPath,
  type RenderTolerances,
  type Scene,
  type StrokeStyle,
  type StyleOverride,
  type StyleOverrides,
  type ViewSize,
} from './types';
import { sampleCircle, sampleCurve, sampleSegment, type SampledCurve } from './sample';
import { strokeOutline } from './stroke';
import { markEllipse } from './marks';

/**
 * Scene → path list (see README, "The pipeline"): apply the camera's view
 * isometry g to each item's canonical data, project through the model,
 * sample/stroke/mark, clip full-line walls to the frame (plus a margin) and
 * — implicitly, since geodesics live on the locus — to the domain, cull
 * sub-pixel and off-frame items, and resolve per-frame style overrides.
 * Immediate mode: callers rebuild the whole list on every change.
 */

/** Frame margin for wall clipping, px. Provisional (PLAN.md §5.3.1 V0 note). */
const MARGIN_PX = 40;
/** Doubling steps when extending a wall line's parameter range. */
const EXTEND_MAX_ITERS = 60;
/** Bisection steps when shrinking an overshot wall endpoint back to the frame. */
const SHRINK_ITERS = 40;
/** A wall-line step below this px length counts as boundary accumulation. */
const ACCUMULATION_PX = 0.25;

export interface BuildContext {
  readonly geom: Geometry<Point2, Isometry2>;
  readonly model: Model<Point2>;
  readonly camera: Camera;
  readonly size: ViewSize;
  readonly tolerances?: RenderTolerances;
  readonly overrides?: StyleOverrides;
}

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

function expandFrame(f: Frame, m: number): Frame {
  return { minX: f.minX - m, minY: f.minY - m, maxX: f.maxX + m, maxY: f.maxY + m };
}

/** Distance (render units) from u to the frame rectangle; 0 inside. */
function distToFrame(u: Vec3, f: Frame): number {
  const dx = Math.max(f.minX - u[0], 0, u[0] - f.maxX);
  const dy = Math.max(f.minY - u[1], 0, u[1] - f.maxY);
  return Math.hypot(dx, dy);
}

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

function finite2(u: Vec3): boolean {
  return Number.isFinite(u[0]) && Number.isFinite(u[1]);
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

// ── Style resolution ────────────────────────────────────────────────────────

function resolvedOpacity(base: number | undefined, ov?: StyleOverride): number {
  return ov?.opacity ?? base ?? 1;
}

export function resolveStroke(sty: StrokeStyle, ov?: StyleOverride): StrokeStyle & { opacity: number } {
  return {
    color: ov?.color ?? sty.color,
    width: ov?.width ?? sty.width,
    opacity: resolvedOpacity(sty.opacity, ov),
  };
}

export function resolvePoint(sty: PointStyle, ov?: StyleOverride): PointStyle & { opacity: number } {
  return {
    color: ov?.color ?? sty.color,
    radius: ov?.radius ?? sty.radius,
    opacity: resolvedOpacity(sty.opacity, ov),
  };
}

export interface ResolvedRegion {
  fill?: FillStyle & { opacity: number };
  edge?: StrokeStyle & { opacity: number };
}

/**
 * Region merge: `null` on an override's fill/edge suppresses that part; a
 * provided FillStyle/StrokeStyle replaces it; the flat color/opacity/width
 * fields then recolor/resize whatever parts remain.
 */
export function resolveRegion(sty: RegionStyle, ov?: StyleOverride): ResolvedRegion {
  const fillBase = ov?.fill === null ? undefined : (ov?.fill ?? sty.fill);
  const edgeBase = ov?.edge === null ? undefined : (ov?.edge ?? sty.edge);
  const out: ResolvedRegion = {};
  if (fillBase) {
    out.fill = {
      color: ov?.color ?? fillBase.color,
      opacity: resolvedOpacity(fillBase.opacity, ov),
    };
  }
  if (edgeBase) {
    out.edge = {
      color: ov?.color ?? edgeBase.color,
      width: ov?.width ?? edgeBase.width,
      opacity: resolvedOpacity(edgeBase.opacity, ov),
    };
  }
  return out;
}

// ── Culling ─────────────────────────────────────────────────────────────────

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

// ── The builder ─────────────────────────────────────────────────────────────

export function buildPathList(scene: Scene, ctx: BuildContext): PathList {
  const { geom, model, camera, size } = ctx;
  const tol = ctx.tolerances ?? DEFAULT_TOLERANCES;
  const scalePx = camera.scalePx;
  const frame = frameOf(camera, size);
  const marginRender = MARGIN_PX / scalePx;
  const frameM = expandFrame(frame, marginRender);
  const g = camera.view;

  const paths: RenderPath[] = [];
  const emit = (id: string, contours: readonly Float64Array[], color: string, opacity: number) => {
    if (keepContours(contours, frame, scalePx, tol.cullPx)) {
      paths.push({ id, contours, color, opacity });
    }
  };

  for (const item of scene) {
    const ov = ctx.overrides?.get(item.id);
    switch (item.kind) {
      case 'point': {
        const sty = resolvePoint(item.style, ov);
        if (sty.radius <= 0) break;
        const p = geom.apply(g, item.at);
        emit(item.id, [markEllipse(model, p, sty.radius, scalePx, tol)], sty.color, sty.opacity);
        break;
      }

      case 'geodesic': {
        const sty = resolveStroke(item.style, ov);
        if (sty.width <= 0) break;
        let curve: SampledCurve | null = null;
        if (item.source.type === 'segment') {
          const a = geom.apply(g, item.source.a);
          const b = geom.apply(g, item.source.b);
          if (geom.distance(a, b) < 1e-12) break;
          curve = sampleSegment(geom, model, a, b, scalePx, tol, sty.width / 2);
        } else {
          curve = sampleWall(geom, model, item.source.wall, g, frameM, marginRender, scalePx, tol, sty.width / 2);
        }
        if (curve) emit(item.id, strokeOutline(curve, model, sty.width), sty.color, sty.opacity);
        break;
      }

      case 'circle': {
        const sty = resolveRegion(item.style, ov);
        if ((!sty.fill && !sty.edge) || item.radius <= 0) break;
        const center = geom.apply(g, item.center);
        const halfWidth = sty.edge ? sty.edge.width / 2 : 0;
        const curve = sampleCircle(geom, model, center, item.radius, scalePx, tol, halfWidth);
        if (sty.fill) {
          emit(item.id, [contourOf(curve)], sty.fill.color, sty.fill.opacity);
        }
        if (sty.edge) {
          emit(item.id, strokeOutline(curve, model, sty.edge.width), sty.edge.color, sty.edge.opacity);
        }
        break;
      }

      case 'polygon': {
        const sty = resolveRegion(item.style, ov);
        if ((!sty.fill && !sty.edge) || item.vertices.length < 3) break;
        const verts = item.vertices.map((v) => geom.apply(g, v));
        const halfWidth = sty.edge ? sty.edge.width / 2 : 0;
        const edges: SampledCurve[] = [];
        for (let i = 0; i < verts.length; i++) {
          const a = verts[i];
          const b = verts[(i + 1) % verts.length];
          if (geom.distance(a, b) < 1e-12) continue;
          edges.push(sampleSegment(geom, model, a, b, scalePx, tol, halfWidth));
        }
        if (edges.length < 2) break;
        if (sty.fill) {
          // Boundary loop: each edge's samples minus its endpoint (the next
          // edge's start), so every vertex appears once.
          let count = 0;
          for (const e of edges) count += e.samples.length - 1;
          const contour = new Float64Array(2 * count);
          let k = 0;
          for (const e of edges) {
            for (let i = 0; i + 1 < e.samples.length; i++) {
              contour[k++] = e.samples[i].u[0];
              contour[k++] = e.samples[i].u[1];
            }
          }
          emit(item.id, [contour], sty.fill.color, sty.fill.opacity);
        }
        if (sty.edge) {
          // One path per edge: overlapping butt-capped outlines in a single
          // even-odd path would cancel at the corners.
          for (const e of edges) {
            emit(item.id, strokeOutline(e, model, sty.edge.width), sty.edge.color, sty.edge.opacity);
          }
        }
        break;
      }
    }
  }
  return paths;
}

/** The closed spine contour of a sampled closed curve. */
function contourOf(curve: SampledCurve): Float64Array {
  const n = curve.samples.length;
  const contour = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    contour[2 * i] = curve.samples[i].u[0];
    contour[2 * i + 1] = curve.samples[i].u[1];
  }
  return contour;
}

/** Transform a wall by g, clip its line to the frame, and sample it. */
function sampleWall(
  geom: Geometry<Point2, Isometry2>,
  model: Model<Point2>,
  wall: Hyperplane,
  g: Isometry2,
  frameM: Frame,
  marginRender: number,
  scalePx: number,
  tol: RenderTolerances,
  halfWidth: number,
): SampledCurve | null {
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
  return sampleCurve(gamma, sMin, sMax, model, scalePx, tol, halfWidth);
}
