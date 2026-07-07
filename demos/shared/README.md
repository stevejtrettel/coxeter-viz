# `demos/shared/` — the demo harness

Composable DOM/canvas/export **primitives** for the demos. This is **app glue,
not library**: it holds nothing mathematical and nothing reusable outside the
demos — the page shell, canvas sizing, the repaint scheduler, the GPU layer
stack, the file-download plumbing, and the control widgets that every demo
otherwise copies. A demo keeps its own control layout, rebuild loop, and
interaction/export wiring; it just calls these instead of re-deriving them.

Decided 2026-07-06 (PLAN.md §5.9, R5): **composable primitives only** (user
ruling) — no `mountFieldDemo`/`panelGrid` that owns the whole demo lifecycle.
Each helper does one small thing; the demo composes them. This keeps the
harness from becoming a leaky abstraction that fights a demo's bespoke needs.

## What it replaces (measured across the 9 demos)

| duplicated block | count | primitive |
|---|---|---|
| the house page shell (`document.body.style…` + `<h2>`) | 9 | `pageShell` |
| the rAF repaint scheduler (`let pending; requestAnimationFrame…`) | 8 | `rafScheduler` |
| DPR canvas sizing + `setTransform` | 9 | `canvas2d` |
| the GPU `glCanvas+canvas` stack | 4 | `layerStack` / `sizeStack` |
| `smallBtn` factory | 6 | `button` |
| the `1/2/4/8×` selector | 5 | `kSelect` |
| the download-anchor dance | 12 | `downloadBlob` / `downloadSvg` |

## Files

| file | exports |
|---|---|
| `page.ts` | `PAD` (20), `dpr()` (`devicePixelRatio` or 1), `pageShell(title): HTMLElement` — sets the house body style and appends the `<h2>`, returning it (demos measure `offsetHeight` for sizing); `PAGE_BG` |
| `canvas.ts` | `canvas2d(canvas, sizePx, dpr): CanvasRenderingContext2D` (sets width/height/style + the DPR transform, returns the 2D context) · `layerStack(): { stack, glCanvas, canvas }` (the positioned GPU-under-vector pair) · `sizeStack(stack, glCanvas, canvas, sizePx, dpr, showGl)` · `rafScheduler(draw: () => void): () => void` (returns the coalescing `schedule`) |
| `controls.ts` | `button(label)` · `checkbox(label, checked): { label, input }` · `textInput(value, widthPx)` · `kSelect(): HTMLSelectElement` (1/2/4/8×, default 2) · `statusText()` (the grey status span) · `downloadBlob(blob, filename)` · `downloadSvg(svg, filename)` · `exportSizeLabel(sizePx, k): string` (the "N × N px (M MP)" readout) |
| `index.ts` | barrel re-export |

Demos import via the barrel: `import { pageShell, button, rafScheduler, … } from '../shared'`.

## The line the harness does NOT cross

- It never builds a `Scene`, `Camera`, or `TilingStyle` — that is `kit/`.
- It never owns the rebuild loop, the `attachInteraction` call, or the export
  *content* — those stay in the demo (they vary too much to abstract without a
  callback soup). The harness provides the *scheduler* and the *download*, not
  the *what to draw*.
- Hover logic (hitTest → override → repaint) stays per-demo: it is three lines
  and every demo highlights a different id namespace.

## Purity and tests

The widgets and shell are DOM side-effecting, so they are verified by the
demos running (the R5 hands-on pass), not unit tests. The two **pure** helpers
— `exportSizeLabel` and the filename slug inside `downloadSvg`/`downloadBlob`
— get unit tests; everything else is exercised visually.

## Increments (PLAN.md §5.9)

- **R5a** — this README (approved first), then `demos/shared/` + the pure-helper
  tests. No demo changes. Gate: green.
- **R5b** — migrate the demos onto the harness, in batches (galleries:
  group/wordlists/render2d/sphereview · field demos:
  wordfile/tilings/cosets/uniform/tilingshader). Each demo ends at: choose
  data → assemble scene (kit) → wire controls + loop (shared) → interact +
  export. Gate per batch: green + hands-on visual pass (pictures unchanged).
