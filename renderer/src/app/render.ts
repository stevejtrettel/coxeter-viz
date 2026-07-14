import { checkFigure } from '@/schema/validate';
import type { FigureProblem } from '@/schema/types';
import { buildPathList } from '@/viz2d/render/scene';
import { paint } from '@/viz2d/render/canvas';
import { attachInteraction, modelUnprojector } from '@/viz2d/render/interact';
import { scaleCamera } from '@/viz2d/render/png';
import { TilingShader } from '@/viz2d/shader/TilingShader';
import type { Scene, ViewSize } from '@/viz2d/render/types';
import { assemble, type RenderDiagnostics } from './assemble';
import { EXPORT_EPSILON_PX, pngFromAssembled, svgFromAssembled } from './export';

/**
 * The single public entry point (README): a figure document in, a living
 * picture out. Validates (problems are VALUES — bad input never throws,
 * and a mathematical refusal downstream, e.g. a spherical hull beyond a
 * hemisphere, is caught and surfaced the same way), assembles once
 * (canonical content is camera-free), mounts the layer stack, paints, and
 * attaches the house pan/zoom. v0.1 live = pan/zoom only.
 *
 * The paint convention (P4): when the document has a field-paintable layer
 * a WebGL2 canvas paints it per pixel UNDER the vector canvas (arbitrary
 * depth, live); the CPU paints `overlay` on top. No WebGL2 → the complete
 * CPU scene, silently. Exports (`svg`, `png`) land at P5.
 */

export interface RenderHandle {
  diagnostics: RenderDiagnostics;
  /** View names, in document order ([] when the document has no views). */
  views: string[];
  /** The active view's index (−1 when there are no views). */
  activeView: number;
  /** Switch the active view — re-paints its overlay at the SAME camera (no re-fit). */
  setView(i: number): void;
  /** The picture AS PANNED/ZOOMED, re-assembled at export depth (ε 1.5 px). */
  svg(): string;
  /** k× resolution through the compositor: the field re-folds per pixel. */
  png(k: number, background?: string): Promise<Blob>;
  dispose(): void;
}

export type RenderResult =
  | { ok: true; handle: RenderHandle }
  | { ok: false; problems: FigureProblem[] };

export function render(container: HTMLElement, figure: unknown): RenderResult {
  const checked = checkFigure(figure);
  if (!checked.ok) return { ok: false, problems: checked.problems };

  const widthPx = container.clientWidth || 800;
  const heightPx = container.clientHeight || widthPx;
  const size: ViewSize = { widthPx, heightPx };

  let asm;
  try {
    asm = assemble(checked.figure, size);
  } catch (e) {
    // a mathematical refusal from the library (hemisphere hulls, …)
    return { ok: false, problems: [{ path: '', problem: e instanceof Error ? e.message : String(e) }] };
  }
  const { geom } = asm.realized.group;
  const dpr = window.devicePixelRatio || 1;

  const stack = document.createElement('div');
  stack.style.cssText = `position:relative;width:${widthPx}px;height:${heightPx}px`;
  container.appendChild(stack);

  const makeCanvas = (): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = Math.round(widthPx * dpr);
    c.height = Math.round(heightPx * dpr);
    c.style.cssText = `position:absolute;left:0;top:0;width:${widthPx}px;height:${heightPx}px`;
    stack.appendChild(c);
    return c;
  };

  // The GPU field, UNDER the vector canvas — created only when the document
  // asks for one AND WebGL2 exists; otherwise the CPU paints everything.
  let shader: TilingShader | null = null;
  if (asm.field !== null) {
    const glCanvas = makeCanvas();
    try {
      shader = new TilingShader(glCanvas);
      shader.setPolygon(asm.realized.poly);
      shader.setChart(asm.realized.model);
    } catch {
      shader = null;
      glCanvas.remove();
    }
  }
  const cpuScene: Scene = shader !== null && asm.overlay !== null ? asm.overlay : asm.scene;

  const canvas = makeCanvas();
  const g = canvas.getContext('2d');
  if (!g) {
    stack.remove();
    return { ok: false, problems: [{ path: '', problem: '2D canvas context unavailable.' }] };
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  let camera = asm.camera;
  // The active view (−1 = none): a per-view CPU overlay painted OVER the
  // background at the same camera. Swapping it re-paints only vectors.
  let activeView = asm.views.length > 0 ? 0 : -1;
  let raf = 0;
  const repaint = (): void => {
    raf = 0;
    if (shader !== null && asm.field !== null) shader.draw(scaleCamera(camera, dpr), asm.field);
    g.clearRect(0, 0, widthPx, heightPx);
    paint(g, buildPathList(cpuScene, { geom, model: asm.realized.model, camera, size }), camera);
    if (activeView >= 0) {
      paint(g, buildPathList(asm.views[activeView].scene, { geom, model: asm.realized.model, camera, size }), camera);
    }
  };
  const schedule = (): void => {
    if (raf === 0) raf = requestAnimationFrame(repaint);
  };

  const interaction = attachInteraction(canvas, {
    geom,
    unproject: modelUnprojector(asm.realized.model),
    camera,
    onCamera: (c) => {
      camera = c;
      schedule();
    },
  });
  repaint();

  // Exports re-assemble at the CURRENT camera and the export ε, so omitted
  // extents cover the panned/zoomed frame at print depth.
  const exportAssembled = (): typeof asm =>
    assemble(checked.figure, size, { camera, epsilonPx: EXPORT_EPSILON_PX });

  return {
    ok: true,
    handle: {
      diagnostics: asm.diagnostics,
      views: asm.views.map((v) => v.name),
      get activeView(): number {
        return activeView;
      },
      setView(i: number): void {
        if (i >= 0 && i < asm.views.length && i !== activeView) {
          activeView = i;
          schedule(); // same camera; only the overlay re-paints
        }
      },
      svg: () => svgFromAssembled(exportAssembled(), size, activeView >= 0 ? activeView : undefined),
      png: (k, background) =>
        pngFromAssembled(exportAssembled(), size, k, background, activeView >= 0 ? activeView : undefined),
      dispose(): void {
        if (raf !== 0) cancelAnimationFrame(raf);
        interaction.dispose();
        shader?.dispose();
        stack.remove();
      },
    },
  };
}
