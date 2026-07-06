import { cross, norm } from '@/math/vec';
import type { Isometry2, Point2 } from '@/geometry/types';
import { Hyperplane } from '@/geometry/Hyperplane';
import { Spherical2 } from '@/geometry/Spherical';
import {
  DEFAULT_TOLERANCES,
  type PathList,
  type RenderPath,
  type RenderTolerances,
  type Scene,
  type StyleOverrides,
  type ViewSize,
} from '@/viz2d/render/types';
import { sampleCircle, sampleCurve, tangentFrame, type SampledCurve } from '@/viz2d/render/sample';
import { strokeOutline } from '@/viz2d/render/stroke';
import { markEllipse } from '@/viz2d/render/marks';
import type { StrokeStyle } from '@/viz2d/render/types';
import { dashRanges } from '@/viz2d/render/dash';
import { frameOf, keepContours } from '@/viz2d/render/cull';
import { resolvePoint, resolveRegion, resolveStroke } from '@/viz2d/render/style';
import { wallLine } from '@/viz2d/render/wallclip';
import { SpherePerspective, trigRoots } from './projection';
import { DEFAULT_SPHERE_STYLE, type SphereCamera, type SphereStyle } from './types';

/**
 * Scene → path list for the perspective sphere view (see README): apply the
 * view isometry g, split every curve at the silhouette (closed form — each
 * stage-1 curve is a circle in R³, so the sheet function along it is
 * A·cos t + B·sin t + C), sample/stroke/mark each pure-sheet piece with the
 * V1 machinery against the perspective chart, and emit in two passes: back
 * pieces, the translucent globe, front pieces. Straddling fills split at the
 * silhouette (P3, `clippedFillLoops`): the front part fills in the front
 * pass, the back part in the back pass; a single-sheet region that swallows
 * the whole silhouette (the cap-wrap case) emits a ring + the far cap. Back
 * strokes optionally dash (`backDash`, the hidden-line convention).
 */

export interface SphereBuildContext {
  readonly camera: SphereCamera;
  readonly size: ViewSize;
  readonly tolerances?: RenderTolerances;
  readonly overrides?: StyleOverrides;
  /** The globe between the passes; omit for the default, null to suppress. */
  readonly sphere?: SphereStyle | null;
  /**
   * P3: dash BACK-side stroke pieces with this intrinsic pattern (the
   * hidden-line convention), unless an item carries its own StrokeStyle
   * dash — item dashes apply to both sheets and win.
   */
  readonly backDash?: { readonly on: number; readonly off: number; readonly phase?: number };
}

/** Sub-interval of a curve's angle parameter lying on one sheet. */
interface ArcPiece {
  readonly lo: number;
  readonly hi: number;
  readonly front: boolean;
}

/** Intervals shorter than this angle are dropped as slivers. */
const EPS_ARC = 1e-9;
/** Vertex cap for the silhouette disk / rim contours. */
const MAX_DISK_VERTICES = 256;
const MIN_DISK_VERTICES = 32;

/**
 * Split [lo, hi] at the roots of h(t) = A·cos t + B·sin t + C, classifying
 * each sub-interval by the sign of h at its midpoint. For a closed curve
 * (hi − lo = 2π) with two roots, the pieces are [r₁, r₂] and [r₂, r₁ + 2π]
 * — no artificial cut at the parameter seam.
 */
function splitArc(
  A: number,
  B: number,
  C: number,
  lo: number,
  hi: number,
  closed: boolean,
): ArcPiece[] {
  const h = (t: number) => A * Math.cos(t) + B * Math.sin(t) + C;
  const roots = trigRoots(A, B, C);
  if (closed && roots.length === 2) {
    const [r1, r2] = roots;
    return [
      { lo: r1, hi: r2, front: h(0.5 * (r1 + r2)) > 0 },
      { lo: r2, hi: r1 + 2 * Math.PI, front: h(0.5 * (r2 + r1 + 2 * Math.PI)) > 0 },
    ];
  }
  const cuts: number[] = [lo];
  for (const r of roots) {
    for (const shift of [-2 * Math.PI, 0, 2 * Math.PI]) {
      const t = r + shift;
      if (t > lo + EPS_ARC && t < hi - EPS_ARC) cuts.push(t);
    }
  }
  cuts.sort((a, b) => a - b);
  cuts.push(hi);
  const pieces: ArcPiece[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    if (cuts[i + 1] - cuts[i] < EPS_ARC) continue;
    pieces.push({ lo: cuts[i], hi: cuts[i + 1], front: h(0.5 * (cuts[i] + cuts[i + 1])) > 0 });
  }
  return pieces;
}

/**
 * P3 cap-clipped fills (README, "Fills"): a region straddling the silhouette
 * splits into a front part and a back part, each a single loop for CONVEX
 * regions (the only fills the pipeline emits — tiles and metric circles; the
 * same convexity assumption as fill honesty and hitTest). The boundary's
 * pure-sheet pieces alternate with arcs OF THE SILHOUETTE CIRCLE: crossings
 * are exact (they are splitArc's trig roots, p₀ = 1/d), the silhouette
 * projects to the render circle of silhouette radius angle-preservingly, and
 * each gap closes along whichever silhouette arc lies INSIDE the region
 * (`contains` decides; both cannot, else there would be no crossings).
 */
function clippedFillLoops(
  arcs: readonly { gamma: (t: number) => Point2; pieces: readonly ArcPiece[] }[],
  contains: (q: Point2) => boolean,
  persp: SpherePerspective,
  invD: number,
  scalePx: number,
  tol: RenderTolerances,
): { front: Float64Array | null; back: Float64Array | null } {
  interface Piece {
    gamma: (t: number) => Point2;
    lo: number;
    hi: number;
    front: boolean;
  }
  const pieces: Piece[] = [];
  for (const a of arcs) {
    for (const p of a.pieces) pieces.push({ gamma: a.gamma, lo: p.lo, hi: p.hi, front: p.front });
  }
  const n = pieces.length;

  // Start at a sheet change, then merge cyclically-adjacent same-sheet
  // pieces (runs continue across arc joints — vertices are not crossings).
  let start = 0;
  while (start < n && pieces[(start + n - 1) % n].front === pieces[start].front) start++;
  if (start === n) return { front: null, back: null }; // single-sheet: caller's case

  interface Run {
    front: boolean;
    pieces: Piece[];
  }
  const runs: Run[] = [];
  for (let i = 0; i < n; i++) {
    const p = pieces[(start + i) % n];
    const last = runs[runs.length - 1];
    if (last && last.front === p.front) last.pieces.push(p);
    else runs.push({ front: p.front, pieces: [p] });
  }

  const rho = Math.sqrt(1 - invD * invD);
  const R = persp.silhouetteRadius();
  const silPoint = (phi: number): Point2 => Float64Array.of(invD, rho * Math.cos(phi), rho * Math.sin(phi));

  // Render points of the silhouette arc from pFrom to pTo through the
  // region's interior — including the start point, excluding the end (the
  // next run's first sample provides it).
  const silArc = (pFrom: Point2, pTo: Point2): number[] => {
    const a = Math.atan2(pFrom[2], pFrom[1]);
    const b = Math.atan2(pTo[2], pTo[1]);
    const tau = 2 * Math.PI;
    const ccw = (((b - a) % tau) + tau) % tau;
    const delta = contains(silPoint(a + ccw / 2)) ? ccw : ccw - tau;
    const stepMax = 2 * Math.acos(Math.max(-1, 1 - tol.flatnessPx / Math.max(R * scalePx, tol.flatnessPx)));
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / stepMax));
    const out: number[] = [];
    for (let k = 0; k < steps; k++) {
      const phi = a + (delta * k) / steps;
      out.push(R * Math.cos(phi), R * Math.sin(phi));
    }
    return out;
  };

  const buildLoop = (wantFront: boolean): Float64Array | null => {
    const sel = runs.filter((r) => r.front === wantFront);
    if (sel.length === 0) return null;
    const out: number[] = [];
    for (let i = 0; i < sel.length; i++) {
      const run = sel[i];
      for (const p of run.pieces) {
        const curve = sampleCurve(p.gamma, p.lo, p.hi, persp, scalePx, tol);
        // Drop each piece's last sample: the next piece starts there, or the
        // silhouette arc starts at the exit crossing.
        for (let s = 0; s + 1 < curve.samples.length; s++) {
          out.push(curve.samples[s].u[0], curve.samples[s].u[1]);
        }
      }
      const lastPiece = run.pieces[run.pieces.length - 1];
      const next = sel[(i + 1) % sel.length];
      out.push(...silArc(lastPiece.gamma(lastPiece.hi), next.pieces[0].gamma(next.pieces[0].lo)));
    }
    return Float64Array.from(out);
  };

  return { front: buildLoop(true), back: buildLoop(false) };
}

/** A regular closed circle contour of the given render radius about 0. */
function circleContour(radius: number, scalePx: number, tol: RenderTolerances): Float64Array {
  const rPx = radius * scalePx;
  let k = MIN_DISK_VERTICES;
  if (rPx > tol.flatnessPx) {
    k = Math.ceil(Math.PI / Math.acos(1 - tol.flatnessPx / rPx));
    k = Math.min(MAX_DISK_VERTICES, Math.max(MIN_DISK_VERTICES, k));
  }
  const c = new Float64Array(2 * k);
  for (let j = 0; j < k; j++) {
    const t = (2 * Math.PI * j) / k;
    c[2 * j] = radius * Math.cos(t);
    c[2 * j + 1] = radius * Math.sin(t);
  }
  return c;
}

export function buildSpherePathList(scene: Scene, ctx: SphereBuildContext): PathList {
  const geom = new Spherical2();
  const { camera, size } = ctx;
  const persp = new SpherePerspective(camera.eyeDistance);
  const tol = ctx.tolerances ?? DEFAULT_TOLERANCES;
  const scalePx = camera.scalePx;
  const frame = frameOf(camera, size);
  const invD = 1 / camera.eyeDistance;
  const g: Isometry2 = camera.view;

  const backPaths: RenderPath[] = [];
  const frontPaths: RenderPath[] = [];
  const emit = (
    front: boolean,
    id: string,
    contours: readonly Float64Array[],
    color: string,
    opacity: number,
  ) => {
    if (keepContours(contours, frame, scalePx, tol.cullPx)) {
      (front ? frontPaths : backPaths).push({ id, contours, color, opacity });
    }
  };

  /**
   * Sample the pieces of γ and stroke each into its pass. `speed` is the
   * curve's constant intrinsic speed in its parameter (segments/walls: 1,
   * circles: sin r), so dashing is exact parameter arithmetic (P1). Back
   * pieces fall back to ctx.backDash when the item has no dash of its own.
   */
  const strokePieces = (
    id: string,
    gamma: (t: number) => Point2,
    pieces: readonly ArcPiece[],
    sty: StrokeStyle & { opacity: number },
    speed: number,
  ) => {
    for (const piece of pieces) {
      const dash = sty.dash ?? (piece.front ? undefined : ctx.backDash);
      const ranges = dash
        ? dashRanges(piece.lo, piece.hi, speed, dash)
        : [[piece.lo, piece.hi] as [number, number]];
      const contours: Float64Array[] = [];
      for (const [a, b] of ranges) {
        const curve = sampleCurve(gamma, a, b, persp, scalePx, tol, sty.width / 2);
        contours.push(...strokeOutline(curve, persp, sty.width));
      }
      if (contours.length > 0) emit(piece.front, id, contours, sty.color, sty.opacity);
    }
  };

  /**
   * A single-sheet region's fill, with the cap-wrap check (P3): a boundary
   * entirely on one sheet may still contain the whole silhouette circle (a
   * large region around the view axis) — the region's other-sheet part is
   * then exactly the far cap. Emit [boundary, silhouette] on the boundary's
   * sheet (an even-odd ring) and the full silhouette disk on the other.
   * Convexity makes the one-point test sufficient: with no crossings the
   * silhouette is entirely inside or entirely outside.
   */
  const emitSingleSheetFill = (
    id: string,
    front: boolean,
    boundary: Float64Array,
    contains: (q: Point2) => boolean,
    color: string,
    opacity: number,
  ) => {
    const rho = Math.sqrt(1 - invD * invD);
    if (contains(Float64Array.of(invD, rho, 0))) {
      const silC = circleContour(persp.silhouetteRadius(), scalePx, tol);
      emit(front, id, [boundary, silC], color, opacity);
      emit(!front, id, [silC], color, opacity);
    } else {
      emit(front, id, [boundary], color, opacity);
    }
  };

  /** A geodesic segment's angle parametrization and sheet pieces. */
  const segmentArc = (a: Point2, b: Point2) => {
    const v = geom.log(a, b);
    const L = norm(v); // spherical form = coordinate dot on tangents
    if (L < 1e-12) return null;
    return {
      L,
      gamma: (s: number) => geom.exp(a, v, s / L),
      pieces: splitArc(a[0], v[0] / L, -invD, 0, L, false),
    };
  };

  for (const item of scene) {
    const ov = ctx.overrides?.get(item.id);
    switch (item.kind) {
      case 'domain':
        // The globe draws its own dressing (disk + rim); a flat-chart domain
        // item in a shared scene is meaningless here and skipped.
        break;

      case 'point': {
        const sty = resolvePoint(item.style, ov);
        if (sty.radius <= 0) break;
        const p = geom.apply(g, item.at);
        // Marks are small: classified whole by their center.
        emit(persp.sheet(p) > 0, item.id, [markEllipse(persp, p, sty.radius, scalePx, tol)], sty.color, sty.opacity);
        break;
      }

      case 'geodesic': {
        const sty = resolveStroke(item.style, ov);
        if (sty.width <= 0) break;
        if (item.source.type === 'segment') {
          const arc = segmentArc(geom.apply(g, item.source.a), geom.apply(g, item.source.b));
          if (arc) strokePieces(item.id, arc.gamma, arc.pieces, sty, 1);
        } else {
          const moved = Hyperplane.fromCovector(geom, geom.applyDual(g, item.source.wall.covector));
          // Any anchor off the wall's pole works; retry like render2d's sampleWall.
          const line =
            wallLine(geom, moved, geom.origin()) ??
            wallLine(geom, moved, geom.exp(geom.origin(), Float64Array.of(0, 1, 0), 1)) ??
            wallLine(geom, moved, geom.exp(geom.origin(), Float64Array.of(0, 0, 1), 1));
          if (!line) break;
          const { p0, tangent } = line;
          const gamma = (s: number) => geom.exp(p0, tangent, s);
          const pieces = splitArc(p0[0], tangent[0], -invD, 0, 2 * Math.PI, true);
          strokePieces(item.id, gamma, pieces, sty, 1);
        }
        break;
      }

      case 'circle': {
        const sty = resolveRegion(item.style, ov);
        if ((!sty.fill && !sty.edge) || item.radius <= 0) break;
        const center = geom.apply(g, item.center);
        const [e1, e2] = tangentFrame(geom, center); // same frame sampleCircle uses
        const sinR = Math.sin(item.radius);
        const A = sinR * e1[0];
        const B = sinR * e2[0];
        const C = Math.cos(item.radius) * center[0] - invD;
        const pieces = splitArc(A, B, C, 0, 2 * Math.PI, true);
        const gamma = (t: number) =>
          geom.exp(
            center,
            Float64Array.of(
              Math.cos(t) * e1[0] + Math.sin(t) * e2[0],
              Math.cos(t) * e1[1] + Math.sin(t) * e2[1],
              Math.cos(t) * e1[2] + Math.sin(t) * e2[2],
            ),
            item.radius,
          );
        const contains = (q: Point2) => geom.distance(center, q) <= item.radius;

        if (sty.fill) {
          if (pieces.length === 1) {
            const front = pieces[0].front;
            const boundary = spineContour(sampleCircle(geom, persp, center, item.radius, scalePx, tol));
            emitSingleSheetFill(item.id, front, boundary, contains, sty.fill.color, sty.fill.opacity);
          } else {
            const loops = clippedFillLoops([{ gamma, pieces }], contains, persp, invD, scalePx, tol);
            if (loops.front) emit(true, item.id, [loops.front], sty.fill.color, sty.fill.opacity);
            if (loops.back) emit(false, item.id, [loops.back], sty.fill.color, sty.fill.opacity);
          }
        }
        if (sty.edge) {
          const backDashed = ctx.backDash && !(pieces.length === 1 && pieces[0].front);
          if (pieces.length === 1 && !sty.edge.dash && !backDashed) {
            // Pure-sheet undashed ring: the closed annulus (no butt seam).
            const curve = sampleCircle(geom, persp, center, item.radius, scalePx, tol, sty.edge.width / 2);
            emit(pieces[0].front, item.id, strokeOutline(curve, persp, sty.edge.width), sty.edge.color, sty.edge.opacity);
          } else {
            strokePieces(item.id, gamma, pieces, sty.edge, sinR);
          }
        }
        break;
      }

      case 'polygon': {
        const sty = resolveRegion(item.style, ov);
        if ((!sty.fill && !sty.edge) || item.vertices.length < 3) break;
        const verts = item.vertices.map((v) => geom.apply(g, v));
        const arcs: NonNullable<ReturnType<typeof segmentArc>>[] = [];
        for (let i = 0; i < verts.length; i++) {
          const arc = segmentArc(verts[i], verts[(i + 1) % verts.length]);
          if (arc) arcs.push(arc);
        }
        if (arcs.length < 2) break;
        const singleSheet =
          arcs.every((a) => a.pieces.length === 1) &&
          arcs.every((a) => a.pieces[0].front === arcs[0].pieces[0].front);
        if (sty.fill) {
          // Convex containment (the standing assumption): edge covectors
          // sign-matched against the vertex mean.
          const mean = Float64Array.of(0, 0, 0);
          for (const v of verts) {
            mean[0] += v[0];
            mean[1] += v[1];
            mean[2] += v[2];
          }
          const covs = verts.map((v, i) => cross(v, verts[(i + 1) % verts.length]));
          const signs = covs.map((c) => c[0] * mean[0] + c[1] * mean[1] + c[2] * mean[2]);
          const contains = (q: Point2) =>
            covs.every((c, i) => (c[0] * q[0] + c[1] * q[1] + c[2] * q[2]) * signs[i] >= -1e-12);

          if (singleSheet) {
            const front = arcs[0].pieces[0].front;
            const parts = arcs.map((a) => sampleCurve(a.gamma, 0, a.L, persp, scalePx, tol));
            let count = 0;
            for (const part of parts) count += part.samples.length - 1;
            const contour = new Float64Array(2 * count);
            let k = 0;
            for (const part of parts) {
              for (let i = 0; i + 1 < part.samples.length; i++) {
                contour[k++] = part.samples[i].u[0];
                contour[k++] = part.samples[i].u[1];
              }
            }
            emitSingleSheetFill(item.id, front, contour, contains, sty.fill.color, sty.fill.opacity);
          } else {
            const loops = clippedFillLoops(arcs, contains, persp, invD, scalePx, tol);
            if (loops.front) emit(true, item.id, [loops.front], sty.fill.color, sty.fill.opacity);
            if (loops.back) emit(false, item.id, [loops.back], sty.fill.color, sty.fill.opacity);
          }
        }
        if (sty.edge) {
          for (const arc of arcs) {
            strokePieces(item.id, arc.gamma, arc.pieces, sty.edge, 1);
          }
        }
        break;
      }
    }
  }

  // The globe between the passes.
  const spherePaths: RenderPath[] = [];
  if (ctx.sphere !== null) {
    const sphere = ctx.sphere ?? DEFAULT_SPHERE_STYLE;
    const R = persp.silhouetteRadius();
    if (sphere.fill) {
      spherePaths.push({
        id: 'sphere',
        contours: [circleContour(R, scalePx, tol)],
        color: sphere.fill.color,
        opacity: sphere.fill.opacity ?? 1,
      });
    }
    if (sphere.rim) {
      const half = sphere.rim.widthPx / (2 * scalePx);
      spherePaths.push({
        id: 'sphere:rim',
        contours: [circleContour(R + half, scalePx, tol), circleContour(R - half, scalePx, tol)],
        color: sphere.rim.color,
        opacity: sphere.rim.opacity ?? 1,
      });
    }
  }

  return [...backPaths, ...spherePaths, ...frontPaths];
}

/** The closed spine contour of a sampled closed curve. */
function spineContour(curve: SampledCurve): Float64Array {
  const n = curve.samples.length;
  const contour = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    contour[2 * i] = curve.samples[i].u[0];
    contour[2 * i + 1] = curve.samples[i].u[1];
  }
  return contour;
}
