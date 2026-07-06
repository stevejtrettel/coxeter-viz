import type { Geometry, Isometry2, Point2 } from '@/geometry/types';
import type { Model } from '@/models/types';
import {
  DEFAULT_TOLERANCES,
  type Camera,
  type PathList,
  type RenderPath,
  type RenderTolerances,
  type Scene,
  type StyleOverrides,
  type ViewSize,
} from './types';
import { circleGamma, sampleCircle, sampleSegment, type SampledCurve } from './sample';
import { strokeOutline } from './stroke';
import { markEllipse } from './marks';
import { resolvePoint, resolveRegion, resolveStroke } from './style';
import { expandFrame, frameOf, keepContours, preCulled } from './cull';
import { wallParamRange } from './wallclip';
import { circleSpeed, strokeContours } from './dash';
import { honestFill, polygonInterior } from './honesty';

/**
 * Scene → path list (see README, "The pipeline"): apply the camera's view
 * isometry g to each item's canonical data, project through the model,
 * sample/stroke/mark, clip full-line walls to the frame (plus a margin) and
 * — implicitly, since geodesics live on the locus — to the domain, cull
 * sub-pixel and off-frame items, and resolve per-frame style overrides.
 * Immediate mode: callers rebuild the whole list on every change.
 *
 * The reusable pieces live in sibling modules — style resolution (`style`),
 * frame + culling (`cull`), wall-line clipping (`wallclip`), dash arithmetic
 * (`dash`), fill honesty (`honesty`) — several shared with sphereview's
 * builder; this file is just the per-kind dispatch.
 */

/** Frame margin for wall clipping, px. Provisional (PLAN.md §5.3.1 V0 note). */
const MARGIN_PX = 40;

export interface BuildContext {
  readonly geom: Geometry<Point2, Isometry2>;
  readonly model: Model<Point2>;
  readonly camera: Camera;
  readonly size: ViewSize;
  readonly tolerances?: RenderTolerances;
  readonly overrides?: StyleOverrides;
  /**
   * Diagnostic escape hatch: `false` disables the V2 pre-sampling cull.
   * The output must be IDENTICAL either way (the safety-property test pins
   * it); the flag exists so tests can compare and consumers can diagnose.
   */
  readonly preCull?: boolean;
}

export function buildPathList(scene: Scene, ctx: BuildContext): PathList {
  const { geom, model, camera, size } = ctx;
  const tol = ctx.tolerances ?? DEFAULT_TOLERANCES;
  const scalePx = camera.scalePx;
  const frame = frameOf(camera, size);
  const marginRender = MARGIN_PX / scalePx;
  const frameM = expandFrame(frame, marginRender);
  const g = camera.view;
  const preCullOn = ctx.preCull !== false;
  // Off-frame pre-culling is sound only where projected geodesics are chords.
  const offFrameEligible = model.straight && geom.kind !== 'spherical';

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
        let contours: Float64Array[] = [];
        if (item.source.type === 'segment') {
          const a = geom.apply(g, item.source.a);
          const b = geom.apply(g, item.source.b);
          const d = geom.distance(a, b);
          if (d < 1e-12) break;
          if (
            preCullOn &&
            preCulled(
              [model.project(a), model.project(b)],
              () => (d / 2 + sty.width / 2) * Math.max(model.scaleAt(a), model.scaleAt(b)) * 2,
              offFrameEligible,
              frame,
              scalePx,
              tol.cullPx,
            )
          ) {
            break;
          }
          contours = strokeContours(geom.geodesic(a, b), 0, 1, d, sty, model, scalePx, tol);
        } else {
          const line = wallParamRange(geom, model, item.source.wall, g, frameM, marginRender, scalePx);
          if (line) contours = strokeContours(line.gamma, line.sMin, line.sMax, 1, sty, model, scalePx, tol);
        }
        if (contours.length > 0) emit(item.id, contours, sty.color, sty.opacity);
        break;
      }

      case 'circle': {
        const sty = resolveRegion(item.style, ov);
        if ((!sty.fill && !sty.edge) || item.radius <= 0) break;
        const center = geom.apply(g, item.center);
        const halfWidth = sty.edge ? sty.edge.width / 2 : 0;
        if (
          preCullOn &&
          // Sub-pixel only: a circle reaches intrinsic radius r from its one
          // defining point, where the chord-hull argument gives nothing.
          preCulled(
            [model.project(center)],
            () => (item.radius + halfWidth) * model.scaleAt(center) * 2,
            false,
            frame,
            scalePx,
            tol.cullPx,
          )
        ) {
          break;
        }
        if (sty.fill || (sty.edge && !sty.edge.dash)) {
          const curve = sampleCircle(geom, model, center, item.radius, scalePx, tol, halfWidth);
          if (sty.fill) {
            const contour = contourOf(curve);
            if (honestFill(geom, model, center, contour)) {
              emit(item.id, [contour], sty.fill.color, sty.fill.opacity);
            }
          }
          if (sty.edge && !sty.edge.dash) {
            emit(item.id, strokeOutline(curve, model, sty.edge.width), sty.edge.color, sty.edge.opacity);
          }
        }
        if (sty.edge?.dash) {
          const contours = strokeContours(
            circleGamma(geom, center, item.radius),
            0,
            2 * Math.PI,
            circleSpeed(geom, item.radius),
            sty.edge,
            model,
            scalePx,
            tol,
          );
          if (contours.length > 0) emit(item.id, contours, sty.edge.color, sty.edge.opacity);
        }
        break;
      }

      case 'domain': {
        // View dressing (README): the model's `domain` field supplies the
        // geometry, StyleOverrides are deliberately ignored, and the camera's
        // view isometry does not apply — the domain lives in render coords.
        const sty = item.style;
        const flatnessRender = tol.flatnessPx / scalePx;
        if (model.domain.kind === 'disk') {
          const R = model.domain.radius;
          if (sty.fill) {
            emit(item.id, [renderCircleContour(R, flatnessRender)], sty.fill.color, sty.fill.opacity ?? 1);
          }
          if (sty.rim && sty.rim.widthPx > 0) {
            const w = sty.rim.widthPx / scalePx;
            emit(
              item.id,
              [renderCircleContour(R + w / 2, flatnessRender), renderCircleContour(R - w / 2, flatnessRender)],
              sty.rim.color,
              sty.rim.opacity ?? 1,
            );
          }
        } else if (model.domain.kind === 'plane' && sty.fill) {
          // The chart's image is the whole plane: shade the visible frame.
          const rect = Float64Array.of(
            frame.minX, frame.minY,
            frame.maxX, frame.minY,
            frame.maxX, frame.maxY,
            frame.minX, frame.maxY,
          );
          emit(item.id, [rect], sty.fill.color, sty.fill.opacity ?? 1);
        }
        break;
      }

      case 'polygon': {
        const sty = resolveRegion(item.style, ov);
        if ((!sty.fill && !sty.edge) || item.vertices.length < 3) break;
        const verts = item.vertices.map((v) => geom.apply(g, v));
        const halfWidth = sty.edge ? sty.edge.width / 2 : 0;
        if (preCullOn) {
          const pad = () => {
            let maxEdge = 0;
            let maxScale = 0;
            for (let i = 0; i < verts.length; i++) {
              maxEdge = Math.max(maxEdge, geom.distance(verts[i], verts[(i + 1) % verts.length]));
              maxScale = Math.max(maxScale, model.scaleAt(verts[i]));
            }
            return (maxEdge / 2 + halfWidth) * maxScale * 2;
          };
          const projected = verts.map((v) => model.project(v));
          if (preCulled(projected, pad, offFrameEligible, frame, scalePx, tol.cullPx)) break;
        }
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
          if (honestFill(geom, model, polygonInterior(geom, verts), contour)) {
            emit(item.id, [contour], sty.fill.color, sty.fill.opacity);
          }
        }
        if (sty.edge) {
          // One path per edge: overlapping butt-capped outlines in a single
          // even-odd path would cancel at the corners. Dashed edges resample
          // per ON range, the phase restarting at each vertex.
          if (sty.edge.dash) {
            for (let i = 0; i < verts.length; i++) {
              const a = verts[i];
              const b = verts[(i + 1) % verts.length];
              const dEdge = geom.distance(a, b);
              if (dEdge < 1e-12) continue;
              const contours = strokeContours(geom.geodesic(a, b), 0, 1, dEdge, sty.edge, model, scalePx, tol);
              if (contours.length > 0) emit(item.id, contours, sty.edge.color, sty.edge.opacity);
            }
          } else {
            for (const e of edges) {
              emit(item.id, strokeOutline(e, model, sty.edge.width), sty.edge.color, sty.edge.opacity);
            }
          }
          // P2: corner joins — the jacobian ellipse of radius w/2 at each
          // vertex fills the butt-cap notch. One extra path (its contours
          // are pairwise disjoint; it OVERLAPS the edges, so it cannot share
          // their even-odd path). Translucent edges darken slightly at
          // corners — the documented tradeoff (formerly: notches).
          const joins = verts.map((v) => markEllipse(model, v, sty.edge!.width / 2, scalePx, tol));
          emit(item.id, joins, sty.edge.color, sty.edge.opacity);
        }
        break;
      }
    }
  }
  return paths;
}

/**
 * A render-space circle about the origin as a closed contour, segment count
 * chosen so the sagitta stays under the flatness tolerance (the domain
 * boundary is chart apparatus in render coords — no geodesic sampling).
 */
function renderCircleContour(radius: number, flatnessRender: number): Float64Array {
  const t = Math.min(Math.max(flatnessRender / radius, 1e-6), 1);
  const n = Math.min(4096, Math.max(16, Math.ceil(Math.PI / Math.acos(1 - t))));
  const contour = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    contour[2 * i] = radius * Math.cos(a);
    contour[2 * i + 1] = radius * Math.sin(a);
  }
  return contour;
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
