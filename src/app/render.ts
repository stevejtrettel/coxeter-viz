import { checkFigure } from '@/schema/validate';
import type { FigureProblem } from '@/schema/types';
import { buildPathList } from '@/viz2d/render/scene';
import { paint } from '@/viz2d/render/canvas';
import { attachInteraction, modelUnprojector } from '@/viz2d/render/interact';
import { scaleCamera } from '@/viz2d/render/png';
import { TilingShader } from '@/viz2d/shader/TilingShader';
import type { Scene, ViewSize } from '@/viz2d/render/types';
import { assemble, type RenderDiagnostics } from './assemble';

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
  let raf = 0;
  const repaint = (): void => {
    raf = 0;
    if (shader !== null && asm.field !== null) shader.draw(scaleCamera(camera, dpr), asm.field);
    g.clearRect(0, 0, widthPx, heightPx);
    paint(g, buildPathList(cpuScene, { geom, model: asm.realized.model, camera, size }), camera);
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

  return {
    ok: true,
    handle: {
      diagnostics: asm.diagnostics,
      dispose(): void {
        if (raf !== 0) cancelAnimationFrame(raf);
        interaction.dispose();
        shader?.dispose();
        stack.remove();
      },
    },
  };
}
