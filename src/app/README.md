# `app/` — render(), the exports, the page

The single public entry point: a checked **figure document** in, a living
picture (or a file) out. This is the ONLY layer that touches the DOM by
design; everything below it stays pure. Spec'd at P0 (PLAN.md §7.5–7.6,
signed off 2026-07-10); implementation lands across P3–P6.

Position: `math → … → viz2d → schema → app`; imports everything, is
imported only by demos and the bundle entry.

## The pipeline

```
figure JSON ─ checkFigure (schema/) ─ classifyCoxeterMatrix (coxeter/matrix)
  ─ realize (coxeter → group, via kit/) ─ assemble (kit/: Scene + TilingStyle + Camera)
  ─ paint (viz2d painters)                                ← one truth for screen and paper
```

Every stage that can fail fails as a **value** with a mathematical reason
(house ruling 2026-07-10); `render` surfaces it, it never throws on bad
input.

Small planned `kit/` addition at P3: `realizeSpec(spec)` — today
`kit/realize` enters at vertex orders (`realizePolygon`); the classified
matrix hands us a `RealizationSpec` directly, so the spec-shaped entry
composes `solvePolygon` + `groupFromPolygon` + `defaultModel` the same way.
(`kit/README.md` gains it then.)

## The paint convention (invisible to users)

Every op has a **paths** representation (the CPU scene → `buildPathList`) —
that is what SVG serializes. Three ops additionally have a **field**
representation (the GPU tiling shader): `tessellation` (parity/edge
layers), `cosets` (the coset program), `uniform` (the regions program).

One field per figure: the FIRST field-paintable layer in document order
takes the GPU; any later field-paintable layer renders as paths. (No
WebGL2 → the complete CPU scene, silently.) Extent bounds the ENUMERATED
picture; the field paints to pixel resolution at arbitrary depth.

| output | painter |
|---|---|
| live | field where it exists, paths on top (the demos' layer stack) |
| PNG | the same stack through the k× `RasterLayer` compositor — the camera is scaled, so the shader re-folds per pixel: genuinely sharper |
| SVG | paths only: exact tiles for `tessellation`, the §5.8 vector twin (`fieldScene` + adaptive `coverageRadius` + `mergeFieldPaths`) for `cosets`/`uniform` |

The document never mentions any of this. An expert override may exist but
must never be needed.

## Entry points

```ts
render(container: HTMLElement, figure: unknown): RenderResult
// value-typed: { ok: true, handle: RenderHandle } | { ok: false, problems: FigureProblem[] }

interface RenderHandle {
  svg(): string;                    // the same figure, serialized
  png(k: number): Promise<Blob>;    // k× resolution through the compositor
  diagnostics: RenderDiagnostics;   // inferred geometry, element/tile counts, hull areas (Gauss–Bonnet)
  dispose(): void;
}
```

- **`render`** (P3–P4): mounts the canvas/GPU layer stack (the
  `demos/shared` primitives), attaches pan/zoom (v0.1 live = pan/zoom
  only — user ruling; isometry navigation is parked), paints.
- **`figureToSvg(figure): string`** (P5): pure end to end — figure →
  `buildPathList` → `toSvg`, no DOM anywhere (usable headless as-is).
- **`figureToPng(figure, k): Promise<Blob>`** (P5): the `RasterLayer`
  stack; needs a real canvas/WebGL2 context by nature.
- **`selfContainedHtml(figure): string`** (P6): ONE file — the tree-shaken
  `viewer.js` bundle + the figure JSON inlined in a template. Opening it
  IS the instrument: full-viewport, live pan/zoom, the animation/
  illustration itself (user ruling). Whether it also carries download
  buttons is decided at P6 by taste — zero architectural weight.

The rendered page exposes one tiny global (`window.coxeterViz = { render,
figureToSvg, figureToPng }`) — the seam the headless (Playwright) driver
calls at P8, and the same mechanism as the house pixel-coincidence tests.

## Files

| file | role | increment |
|---|---|---|
| `assemble.ts` | checked figure → `{ scene, style, camera, realized }` via `kit/` — pure, unit-testable | P3–P4 |
| `render.ts` | `render(container, figure)` — the mount: layer stack, interaction, repaint | P3 |
| `export.ts` | `figureToSvg`, `figureToPng` | P5 |
| `html.ts` | `selfContainedHtml` + the page template | P6 |

A `figure` demo (P3) loads the fixture documents from
`tests/fixtures/figures/` and renders them through `render()` — the dev
harness for the whole product layer: hand-written JSON, no Python, per the
original design doc.

## Tests

- `assemble` output pinned against the shapes the demos emit today (the
  R4-kit convention-test pattern) — a figure document reproduces the
  known-good Milestone-1/§5.7 pictures;
- golden SVG fixtures: `figureToSvg` byte-stable on the fixture documents
  (P9);
- GPU/CPU pixel-coincidence on figure renders (headless Chrome, the house
  pattern) (P9);
- every failure path returns its value: `render` on a refused matrix
  reports the inference reason verbatim.
