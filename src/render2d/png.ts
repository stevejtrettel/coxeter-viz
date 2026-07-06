import type { Camera, RenderTolerances, Scene, ViewSize } from './types';
import type { Geometry, Isometry2, Point2 } from '@/geometry/types';
import type { Model } from '@/models/types';
import { buildPathList } from './scene';
import { paint } from './canvas';

/**
 * PNG export (PLAN §5.6 T3): compose any stack of PAINTERS into one raster
 * at k× resolution. The one abstraction is `RasterLayer` — the house camera
 * contract (screen = V ∘ project ∘ apply(view, ·)) as an interface: paint
 * this camera into this many device pixels. The exporter never tells layers
 * about k; it scales the CAMERA (k·scalePx, k·centerPx at k·size pixels) and
 * each layer renders it 1:1 — so a shader field re-evaluates per pixel and a
 * vector layer re-samples through its px tolerances: genuinely sharper, not
 * upsampled. SVG stays vector-only (svg.ts); PNG is where mixed GPU/vector
 * pictures live.
 */
export interface RasterLayer {
  /** Paint this camera into `size` device pixels; return the image. */
  render(camera: Camera, size: ViewSize): CanvasImageSource;
}

/** The pure export transform: same view, k× viewport. */
export function scaleCamera(camera: Camera, k: number): Camera {
  return {
    view: camera.view,
    scalePx: camera.scalePx * k,
    centerPx: [camera.centerPx[0] * k, camera.centerPx[1] * k],
  };
}

/** Browser canvases cap out near 16384 px a side; tiled rendering is deferred. */
const MAX_DIM = 16384;

/**
 * Render `layers` (back to front) at k× the given screen frame and encode a
 * PNG. `camera`/`size` are the SCREEN values; `k` is the exact resolution
 * multiplier (no implicit devicePixelRatio). Composition happens on one 2D
 * assembly canvas — WebGL layers render on their own canvas and are
 * drawImage'd over, which is why the seam is CanvasImageSource. Transparent
 * background unless `background` is given (disk charts export an honestly
 * transparent exterior).
 */
export function renderPng(
  layers: readonly RasterLayer[],
  camera: Camera,
  size: ViewSize,
  k: number,
  background?: string,
): Promise<Blob> {
  const w = Math.round(size.widthPx * k);
  const h = Math.round(size.heightPx * k);
  if (!(w >= 1 && h >= 1)) throw new Error(`renderPng: empty target (${w}×${h})`);
  if (w > MAX_DIM || h > MAX_DIM) {
    throw new Error(`renderPng: ${w}×${h} exceeds the canvas cap ${MAX_DIM}; lower k`);
  }
  const target: ViewSize = { widthPx: w, heightPx: h };
  const cam = scaleCamera(camera, k);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('renderPng: no 2d context');
  if (background) {
    g.fillStyle = background;
    g.fillRect(0, 0, w, h);
  }
  for (const layer of layers) g.drawImage(layer.render(cam, target), 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('renderPng: toBlob failed'))), 'image/png'),
  );
}

/** The vector painter as a layer: path-list build + paint on a scratch canvas. */
export function sceneLayer(
  scene: Scene,
  geom: Geometry<Point2, Isometry2>,
  model: Model<Point2>,
  tolerances?: RenderTolerances,
): RasterLayer {
  return {
    render(camera, size) {
      const canvas = document.createElement('canvas');
      canvas.width = size.widthPx;
      canvas.height = size.heightPx;
      const g = canvas.getContext('2d');
      if (!g) throw new Error('sceneLayer: no 2d context');
      paint(g, buildPathList(scene, { geom, model, camera, size, tolerances }), camera);
      return canvas;
    },
  };
}
