import { checkFigure } from '@/schema/validate';
import type { FigureProblem } from '@/schema/types';
import { buildPathList } from '@/viz2d/render/scene';
import { toSvg } from '@/viz2d/render/svg';
import { renderPng, sceneLayer, type RasterLayer } from '@/viz2d/render/png';
import { tilingLayer } from '@/viz2d/shader/layer';
import { mergeFieldPaths } from '@/viz2d/shader/vector';
import type { Camera, ViewSize } from '@/viz2d/render/types';
import { assemble, type Assembled } from './assemble';

/**
 * The export surface (README, PLAN §7.5):
 *
 * - SVG — pure strings end to end (usable headless as-is): the COMPLETE
 *   CPU scene through the same path pipeline as the screen, with
 *   `mergeFieldPaths` coalescing the field programs' vector twins.
 * - PNG — the `RasterLayer` stack through the k× compositor (the CAMERA is
 *   scaled, never the pixels): the field re-folds per pixel, the vector
 *   layer re-samples through its px tolerances. Needs a real canvas/WebGL2
 *   by nature.
 *
 * Both take a RAW document (the Python seam) and return values — problems,
 * never throws. Exports assemble at the finer ε (1.5 px, the house export
 * convention) so omitted extents cover the frame at print depth.
 */

/** ε px for export coverage (the live canvas uses 3). */
export const EXPORT_EPSILON_PX = 1.5;

const DEFAULT_SIZE: ViewSize = { widthPx: 800, heightPx: 800 };

export interface ExportOptions {
  size?: ViewSize;
  /** A live camera (pan/zoom state); default = the auto-fit framing. */
  camera?: Camera;
  /** PNG only: a background color; default honestly transparent. */
  background?: string;
  /** Which view to overlay on the background (PLAN §13); omitted ⇒ background only. */
  view?: number;
}

export type ExportResult<T> = { ok: true; value: T } | { ok: false; problems: FigureProblem[] };

function assembleForExport(
  figure: unknown,
  opts?: ExportOptions,
): { ok: true; asm: Assembled; size: ViewSize } | { ok: false; problems: FigureProblem[] } {
  const checked = checkFigure(figure);
  if (!checked.ok) return { ok: false, problems: checked.problems };
  const size = opts?.size ?? DEFAULT_SIZE;
  try {
    return {
      ok: true,
      asm: assemble(checked.figure, size, { camera: opts?.camera, epsilonPx: EXPORT_EPSILON_PX }),
      size,
    };
  } catch (e) {
    return { ok: false, problems: [{ path: '', problem: e instanceof Error ? e.message : String(e) }] };
  }
}

/** The SVG of an already-assembled figure (the render handle's path); `view`
 * overlays that view on the background (PLAN §13). */
export function svgFromAssembled(asm: Assembled, size: ViewSize, view?: number): string {
  const { geom } = asm.realized.group;
  const scene =
    view !== undefined && asm.views[view] ? [...asm.scene, ...asm.views[view].scene] : asm.scene;
  const paths = buildPathList(scene, { geom, model: asm.realized.model, camera: asm.camera, size });
  return toSvg(mergeFieldPaths(paths), asm.camera, size);
}

/** The PNG of an already-assembled figure: field (if any) under the vector
 * overlay, at k×; `view` adds that view's items on top. */
export function pngFromAssembled(
  asm: Assembled,
  size: ViewSize,
  k: number,
  background?: string,
  view?: number,
): Promise<Blob> {
  const { geom } = asm.realized.group;
  const viewScene = view !== undefined && asm.views[view] ? asm.views[view].scene : [];
  const layers: RasterLayer[] =
    asm.field !== null && asm.overlay !== null
      ? [
          tilingLayer(asm.realized.poly, asm.realized.model, asm.field),
          sceneLayer([...asm.overlay, ...viewScene], geom, asm.realized.model),
        ]
      : [sceneLayer([...asm.scene, ...viewScene], geom, asm.realized.model)];
  return renderPng(layers, asm.camera, size, k, background);
}

/** Raw document → SVG string. Pure — no DOM anywhere. `opts.view` overlays a view. */
export function figureToSvg(figure: unknown, opts?: ExportOptions): ExportResult<string> {
  const r = assembleForExport(figure, opts);
  if (!r.ok) return r;
  return { ok: true, value: svgFromAssembled(r.asm, r.size, opts?.view) };
}

/** Raw document → PNG blob at k× resolution. Browser-only (canvas + WebGL2). */
export async function figureToPng(
  figure: unknown,
  k: number,
  opts?: ExportOptions,
): Promise<ExportResult<Blob>> {
  const r = assembleForExport(figure, opts);
  if (!r.ok) return r;
  try {
    return { ok: true, value: await pngFromAssembled(r.asm, r.size, k, opts?.background, opts?.view) };
  } catch (e) {
    return { ok: false, problems: [{ path: '', problem: e instanceof Error ? e.message : String(e) }] };
  }
}
