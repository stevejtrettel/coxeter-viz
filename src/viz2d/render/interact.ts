import { cross, vec3 } from '@/math/vec';
import type { Geometry, Isometry2, Point2 } from '@/geometry/types';
import { Hyperplane } from '@/geometry/Hyperplane';
import type { Model } from '@/models/types';
import type { Camera, ItemId, Scene } from './types';
import type { BuildContext } from './scene';
import { convexContainment } from './item';

/**
 * Interaction (README, "Interaction (V3)"): pure camera transforms and the
 * mathematical hit test. Interaction only ever produces NEW cameras — content
 * canonical coordinates never move. The DOM controller (V3.3) is a thin
 * adapter over these functions; everything here is unit-testable without a
 * browser.
 */

/** Renormalize the view isometry after this many drag compositions (provisional). */
export const RENORM_EVERY = 64;

/** Skip drag steps shorter than this (canonical distance). */
const DRAG_MIN = 1e-12;
/** Skip near-antipodal spherical drags (the midpoint degenerates). */
const DRAG_MAX_S = Math.PI - 0.05;

/**
 * Zoom about a cursor: `scalePx` scales by `factor`, `centerPx` shifts so the
 * render point under the cursor is fixed. Pure affine — no geometry moves.
 * (All camera transforms SPREAD the input, so camera subtypes — sphereview's
 * SphereCamera with its eyeDistance — pass through intact.)
 */
export function zoomedCamera<C extends Camera>(camera: C, cursorPx: readonly [number, number], factor: number): C {
  return {
    ...camera,
    scalePx: camera.scalePx * factor,
    centerPx: [
      cursorPx[0] + factor * (camera.centerPx[0] - cursorPx[0]),
      cursorPx[1] + factor * (camera.centerPx[1] - cursorPx[1]),
    ],
  };
}

/** Screen pan: move the picture, not the geometry. */
export function pannedCamera<C extends Camera>(camera: C, dxPx: number, dyPx: number): C {
  return { ...camera, centerPx: [camera.centerPx[0] + dxPx, camera.centerPx[1] + dyPx] };
}

/**
 * Screen pixel → view-space canonical point, or null where the view has no
 * content (outside a disk domain / the globe silhouette). The capability the
 * drag machinery needs — Models provide it via `modelUnprojector`;
 * sphereview provides a front-sheet one (its perspective is not a Model).
 */
export type ScreenUnprojector = (camera: Camera, px: readonly [number, number]) => Point2 | null;

/**
 * Screen pixel → view-space canonical point through a Model (V⁻¹ then
 * unproject); null outside a disk domain. "View-space" = content AFTER the
 * camera's view isometry — pull back by view⁻¹ for canonical identity.
 */
export function unprojectScreen(
  model: Model<Point2>,
  camera: Camera,
  px: readonly [number, number],
): Point2 | null {
  const ux = (px[0] - camera.centerPx[0]) / camera.scalePx;
  const uy = (camera.centerPx[1] - px[1]) / camera.scalePx; // screen y is down
  if (model.domain.kind === 'disk' && Math.hypot(ux, uy) >= model.domain.radius * (1 - 1e-9)) {
    return null;
  }
  return model.unproject(vec3(ux, uy, 0));
}

/** The Model-backed ScreenUnprojector. */
export function modelUnprojector(model: Model<Point2>): ScreenUnprojector {
  return (camera, px) => unprojectScreen(model, camera, px);
}

/**
 * Isometry drag (README): the content point under `fromPx` follows the
 * cursor to `toPx`. Unproject both to view-space points a₀, a₁ and compose
 * the double-bisector translation T = R_bis(m,a₁)·R_bis(a₀,m) into the view:
 * view ← T·view. Null when the drag is undefined (a cursor outside the
 * domain, a vanishing step, a near-antipodal spherical pair) — the caller
 * keeps the old camera. The caller also owns the composition counter and
 * calls `geom.renormalizeIsometry` every RENORM_EVERY steps (drift walks off
 * the group hyperbolically fast in H).
 */
export function draggedCamera<C extends Camera>(
  geom: Geometry<Point2, Isometry2>,
  unproject: ScreenUnprojector,
  camera: C,
  fromPx: readonly [number, number],
  toPx: readonly [number, number],
): C | null {
  const a0 = unproject(camera, fromPx);
  const a1 = unproject(camera, toPx);
  if (!a0 || !a1) return null;
  const d = geom.distance(a0, a1);
  if (d < DRAG_MIN || (geom.kind === 'spherical' && d > DRAG_MAX_S)) return null;

  const m = geom.geodesic(a0, a1)(0.5);
  const T = geom.compose(
    geom.reflection(Hyperplane.bisector(geom, m, a1)),
    geom.reflection(Hyperplane.bisector(geom, a0, m)), // applied first
  );
  return { ...camera, view: geom.compose(T, camera.view) };
}

export interface InteractionOptions {
  readonly geom: Geometry<Point2, Isometry2>;
  /** Screen → view-space capability: `modelUnprojector(model)`, or sphereview's. */
  readonly unproject: ScreenUnprojector;
  /** The initial camera; the controller owns the current one from here on. */
  readonly camera: Camera;
  /** Fired with every new camera (drag, pan, zoom). Repaint here (rAF-throttle). */
  onCamera(camera: Camera): void;
  /**
   * Pointer position when NOT dragging (null on leave) — the hover feed;
   * consumers run `hitTest` and build their own StyleOverrides.
   */
  onPointer?(px: readonly [number, number] | null): void;
  /** Wheel zoom speed (factor = exp(−speed·ΔY)); default 0.0015. */
  readonly wheelSpeed?: number;
}

export interface InteractionHandle {
  dispose(): void;
}

/**
 * The thin DOM adapter (README): all mathematics lives in the pure functions
 * above; this owns pointer/wheel events and the current camera. Gestures:
 * drag = isometry drag, shift- or middle-drag = screen pan, wheel = zoom
 * about the cursor. Renormalizes the view every RENORM_EVERY drag
 * compositions. Removing the canvas from the DOM releases everything;
 * `dispose` exists for explicit teardown.
 */
export function attachInteraction(canvas: HTMLCanvasElement, opts: InteractionOptions): InteractionHandle {
  let camera = opts.camera;
  let dragging = false;
  let mode: 'drag' | 'pan' = 'drag';
  let last: readonly [number, number] | null = null;
  let composeCount = 0;

  const pos = (e: PointerEvent | WheelEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const down = (e: PointerEvent): void => {
    if (e.button !== 0 && e.button !== 1) return;
    dragging = true;
    mode = e.shiftKey || e.button === 1 ? 'pan' : 'drag';
    last = pos(e);
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
  };

  const move = (e: PointerEvent): void => {
    const p = pos(e);
    if (!dragging) {
      opts.onPointer?.(p);
      return;
    }
    const from = last;
    last = p;
    if (!from) return;
    if (mode === 'pan') {
      camera = pannedCamera(camera, p[0] - from[0], p[1] - from[1]);
      opts.onCamera(camera);
      return;
    }
    const next = draggedCamera(opts.geom, opts.unproject, camera, from, p);
    if (!next) return; // guarded step (outside domain, vanishing) — keep the camera
    camera = next;
    if (++composeCount % RENORM_EVERY === 0) {
      camera = { ...camera, view: opts.geom.renormalizeIsometry(camera.view) };
    }
    opts.onCamera(camera);
  };

  const up = (): void => {
    dragging = false;
    last = null;
    canvas.style.cursor = 'grab';
  };

  const leave = (): void => {
    opts.onPointer?.(null);
  };

  const wheel = (e: WheelEvent): void => {
    e.preventDefault();
    camera = zoomedCamera(camera, pos(e), Math.exp(-(opts.wheelSpeed ?? 0.0015) * e.deltaY));
    opts.onCamera(camera);
  };

  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', leave);
  canvas.addEventListener('wheel', wheel, { passive: false });
  return {
    dispose(): void {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('wheel', wheel);
    },
  };
}

/**
 * The mathematical hit test (README): unproject the pointer, pull back by
 * view⁻¹, and test CANONICAL data — never pixels. Returns the topmost hit
 * (reverse paint order). The px slop maps to an intrinsic length through the
 * chart scale at the pointer. Polygons use convex containment (edge
 * covectors cross(vᵢ, vᵢ₊₁) sign-matched against the vertex mean — the same
 * convexity assumption as fill honesty); `domain` items are view dressing
 * and never hit.
 */
export function hitTest(scene: Scene, ctx: BuildContext, px: readonly [number, number], slopPx = 4): ItemId | null {
  const { geom, model, camera } = ctx;
  const a = unprojectScreen(model, camera, px);
  if (!a) return null;
  const q = geom.apply(geom.inverse(camera.view), a);
  return hitTestCanonical(scene, geom, q, slopPx / (camera.scalePx * model.scaleAt(a)));
}

/**
 * The chart-free core of the hit test: canonical point against canonical
 * data. Exported so other views (sphereview's front-sheet hover) can reuse
 * it with their own unproject + slop conversion.
 */
export function hitTestCanonical(
  scene: Scene,
  geom: Geometry<Point2, Isometry2>,
  q: Point2,
  slop: number,
): ItemId | null {
  for (let i = scene.length - 1; i >= 0; i--) {
    const item = scene[i];
    switch (item.kind) {
      case 'point':
        if (geom.distance(item.at, q) <= item.style.radius + slop) return item.id;
        break;

      case 'circle': {
        const d = geom.distance(item.center, q);
        const edgeHalf = item.style.edge ? item.style.edge.width / 2 : 0;
        if (item.style.fill && d <= item.radius + slop) return item.id;
        if (item.style.edge && Math.abs(d - item.radius) <= edgeHalf + slop) return item.id;
        break;
      }

      case 'geodesic': {
        const half = item.style.width / 2 + slop;
        if (item.source.type === 'line') {
          if (item.source.wall.distanceTo(geom, q) <= half) return item.id;
        } else {
          const { a: pa, b: pb } = item.source;
          const span = cross(pa, pb);
          if (geom.pairing(span, geom.dual(span)) <= 1e-20) break; // degenerate
          const line = Hyperplane.fromCovector(geom, span);
          const d = geom.distance(pa, pb);
          // On the line AND between the endpoints (slop-sized overhang at the caps).
          if (line.distanceTo(geom, q) <= half && geom.distance(pa, q) <= d + slop && geom.distance(pb, q) <= d + slop) {
            return item.id;
          }
        }
        break;
      }

      case 'polygon':
        // Convex containment (the standing convexity assumption, shared with
        // fill honesty and the sphere fills); exact hit test ⇒ zero slop.
        if (convexContainment(item.vertices)(q)) return item.id;
        break;

      case 'domain':
        break; // view dressing, never hit
    }
  }
  return null;
}
