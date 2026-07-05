import { norm } from '@/math/vec';
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
} from '@/render2d/types';
import { sampleCircle, sampleCurve, tangentFrame, type SampledCurve } from '@/render2d/sample';
import { strokeOutline } from '@/render2d/stroke';
import { markEllipse } from '@/render2d/marks';
import {
  frameOf,
  keepContours,
  resolvePoint,
  resolveRegion,
  resolveStroke,
  wallLine,
} from '@/render2d/scene';
import { SpherePerspective, trigRoots } from './projection';
import { DEFAULT_SPHERE_STYLE, type SphereCamera, type SphereStyle } from './types';

/**
 * Scene → path list for the perspective sphere view (see README): apply the
 * view isometry g, split every curve at the silhouette (closed form — each
 * stage-1 curve is a circle in R³, so the sheet function along it is
 * A·cos t + B·sin t + C), sample/stroke/mark each pure-sheet piece with the
 * V1 machinery against the perspective chart, and emit in two passes: back
 * pieces, the translucent globe, front pieces. Fills are drawn only for
 * single-sheet regions; a straddling region keeps its boundary but its fill
 * is skipped (README, "Fills" — region clipping is parked stage-2 work).
 */

export interface SphereBuildContext {
  readonly camera: SphereCamera;
  readonly size: ViewSize;
  readonly tolerances?: RenderTolerances;
  readonly overrides?: StyleOverrides;
  /** The globe between the passes; omit for the default, null to suppress. */
  readonly sphere?: SphereStyle | null;
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

  /** Sample the pieces of γ (angle-parametrized) and stroke each into its pass. */
  const strokePieces = (
    id: string,
    gamma: (t: number) => Point2,
    pieces: readonly ArcPiece[],
    width: number,
    color: string,
    opacity: number,
  ) => {
    for (const piece of pieces) {
      const curve = sampleCurve(gamma, piece.lo, piece.hi, persp, scalePx, tol, width / 2);
      emit(piece.front, id, strokeOutline(curve, persp, width), color, opacity);
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
          if (arc) strokePieces(item.id, arc.gamma, arc.pieces, sty.width, sty.color, sty.opacity);
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
          strokePieces(item.id, gamma, pieces, sty.width, sty.color, sty.opacity);
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
        if (pieces.length === 1) {
          const front = pieces[0].front;
          const halfWidth = sty.edge ? sty.edge.width / 2 : 0;
          const curve = sampleCircle(geom, persp, center, item.radius, scalePx, tol, halfWidth);
          if (sty.fill) emit(front, item.id, [spineContour(curve)], sty.fill.color, sty.fill.opacity);
          if (sty.edge) {
            emit(front, item.id, strokeOutline(curve, persp, sty.edge.width), sty.edge.color, sty.edge.opacity);
          }
        } else if (sty.edge) {
          // Straddles the silhouette: boundary split as usual, fill skipped.
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
          strokePieces(item.id, gamma, pieces, sty.edge.width, sty.edge.color, sty.edge.opacity);
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
        if (sty.fill && singleSheet) {
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
          emit(front, item.id, [contour], sty.fill.color, sty.fill.opacity);
        }
        if (sty.edge) {
          for (const arc of arcs) {
            strokePieces(item.id, arc.gamma, arc.pieces, sty.edge.width, sty.edge.color, sty.edge.opacity);
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
