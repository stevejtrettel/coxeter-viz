/**
 * Canvas plumbing (`demos/shared`): DPR-correct sizing, the GPU layer stack,
 * and the rAF repaint scheduler. App glue — the harness owns the SCHEDULER,
 * never the what-to-draw (that is `kit` + the demo's rebuild).
 */

/**
 * Size a standalone 2D canvas for `sizePx` CSS px at `dpr` backing scale and
 * return its context with the DPR transform applied (so the demo draws in CSS
 * px). Background/border are the demo's to set.
 */
export function canvas2d(canvas: HTMLCanvasElement, sizePx: number, dpr: number): CanvasRenderingContext2D {
  canvas.width = sizePx * dpr;
  canvas.height = sizePx * dpr;
  canvas.style.width = `${sizePx}px`;
  canvas.style.height = `${sizePx}px`;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('demos/shared: 2D canvas context unavailable');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return g;
}

export interface LayerStack {
  stack: HTMLDivElement;
  /** The GPU field canvas, UNDER the vector canvas. */
  glCanvas: HTMLCanvasElement;
  /** The transparent Canvas2D that carries the named elements, ON TOP. */
  canvas: HTMLCanvasElement;
}

/** The GPU-under-vector layer stack (the four field demos): both canvases fill the stack. */
export function layerStack(): LayerStack {
  const stack = document.createElement('div');
  stack.style.cssText = 'position:relative;background:#fff;border-radius:4px';
  const glCanvas = document.createElement('canvas');
  glCanvas.style.cssText = 'position:absolute;inset:0';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0';
  stack.append(glCanvas, canvas);
  return { stack, glCanvas, canvas };
}

/**
 * Size a `LayerStack` for `sizePx` at `dpr`, show/hide the GPU layer, and
 * return the vector canvas's DPR-transformed 2D context.
 */
export function sizeStack(
  s: LayerStack,
  sizePx: number,
  dpr: number,
  showGl: boolean,
): CanvasRenderingContext2D {
  for (const c of [s.glCanvas, s.canvas]) {
    c.width = sizePx * dpr;
    c.height = sizePx * dpr;
    c.style.width = `${sizePx}px`;
    c.style.height = `${sizePx}px`;
  }
  s.stack.style.width = `${sizePx}px`;
  s.stack.style.height = `${sizePx}px`;
  s.glCanvas.style.display = showGl ? 'block' : 'none';
  const g = s.canvas.getContext('2d');
  if (!g) throw new Error('demos/shared: 2D canvas context unavailable');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return g;
}

/**
 * A coalescing repaint scheduler: returns `schedule`, which runs `draw` once
 * on the next animation frame no matter how many times it is called first.
 */
export function rafScheduler(draw: () => void): () => void {
  let pending = false;
  return () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      draw();
    });
  };
}
