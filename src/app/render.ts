import { checkFigure } from '@/schema/validate';
import type { FigureProblem } from '@/schema/types';
import { buildPathList } from '@/viz2d/render/scene';
import { paint } from '@/viz2d/render/canvas';
import { attachInteraction, modelUnprojector } from '@/viz2d/render/interact';
import type { ViewSize } from '@/viz2d/render/types';
import { assemble, type RenderDiagnostics } from './assemble';

/**
 * The single public entry point (README): a figure document in, a living
 * picture out. Validates (problems are VALUES, never throws on input),
 * assembles once (canonical content is camera-free), mounts a DPR-aware
 * canvas, paints, and attaches the house pan/zoom (drag = isometry drag,
 * wheel = zoom about the cursor). v0.1 live = pan/zoom only.
 *
 * P3: the vector painter only; the GPU field joins at P4, exports (`svg`,
 * `png`) at P5.
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
  const asm = assemble(checked.figure, size);
  const { geom } = asm.realized.group;

  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(widthPx * dpr);
  canvas.height = Math.round(heightPx * dpr);
  canvas.style.width = `${widthPx}px`;
  canvas.style.height = `${heightPx}px`;
  canvas.style.display = 'block';
  container.appendChild(canvas);
  const g = canvas.getContext('2d');
  if (!g) {
    canvas.remove();
    return { ok: false, problems: [{ path: '', problem: '2D canvas context unavailable.' }] };
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  let camera = asm.camera;
  let raf = 0;
  const repaint = (): void => {
    raf = 0;
    g.clearRect(0, 0, widthPx, heightPx);
    const paths = buildPathList(asm.scene, {
      geom,
      model: asm.realized.model,
      camera,
      size,
    });
    paint(g, paths, camera);
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
        canvas.remove();
      },
    },
  };
}
