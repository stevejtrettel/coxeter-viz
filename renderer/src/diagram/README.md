# `diagram/` — the Coxeter and Artin diagrams

The **abstract group, drawn as a graph**: nodes are generators, edges carry
the orders `m_ij`. Depends only on `coxeter/matrix` (for the presentation) and
the house palette. Plan: `docs/plan-diagrams-and-selection.md`.

## The load-bearing property: no realization

A diagram is a **pure function of the Coxeter matrix**. It needs no chamber,
no geometry, no camera — so it draws for exactly the groups the realization
layer *refuses*: rank ≥ 4, free products, non-compact chambers. That is the
point of the feature. Structurally invalid matrices (asymmetric, bad diagonal,
orders < 2) are still refused; only the *geometric* refusals are tolerated.

## The two conventions (`style`)

Complementary — each omits what the other draws:

| pair | `coxeter` | `artin` |
|---|---|---|
| m = 2 | no edge | edge labeled 2 |
| m = 3 | unlabeled edge | edge labeled 3 |
| m ≥ 4 | edge labeled m | edge labeled m |
| m = ∞ | dashed edge, unlabeled | no edge |

On the right-angled pentagon (adjacent 2, non-adjacent ∞) `artin` draws the
pentagon and `coxeter` draws the pentagram — the same group, two readings.

## Layout: the ring

Nodes sit on a circle in **generator-index order**, node k at angle
`−π/2 + 2πk/n` (index 0 at the top, increasing clockwise). For a polygon
presentation the cyclic order IS the wall cycle, so the Artin diagram draws
the polygon's combinatorics literally. It needs no graph-drawing solver and
degrades gracefully to any rank.

**Units.** The house intrinsic unit is r₀, the chamber inradius — and a
diagram has no chamber. So the diagram declares its own: **adjacent-node
spacing = 1**, i.e. ring radius `R = 1 / (2 sin(π/n))` (`R = 0` at n = 1).
Node radius, stroke width and label size are fixed multiples of it.

**Node color is the wall color.** Node i is painted `WALL_COLORS[i]` — the
same color wall i carries in a tiling. This is what makes a diagram and a
tiling read as the same data side by side, and it is the same
generator-indexing law used everywhere else.

## Why this module emits its own SVG

The rest of the engine renders through `viz2d`: scene items → `buildPathList`
→ filled paths → canvas or SVG. **Diagrams cannot use it, because the path
pipeline has no text** (`SceneItem` is point | geodesic | circle | polygon |
domain), and edge labels are not optional in either convention. Adding text to
the core scene vocabulary would break its "everything is a filled path"
invariant — the very thing that guarantees SVG and canvas agree.

So the module keeps that guarantee locally instead, with one layout and two
thin emitters:

```
matrix + style ──▶ DiagramDrawing ──┬──▶ svg.ts     (an <svg> string)
                    (layout.ts)     └──▶ canvas.ts  (a RasterLayer → PNG)
```

`DiagramDrawing` is plain data — node positions, edge endpoints, labels, dash
flags — and `fit()` (one shared function) maps it into the frame. Both
emitters consume the same drawing through the same fit, so the SVG and the
PNG agree by construction rather than by review.

PNG then reuses the engine's ordinary `renderPng`, which is generic over
`RasterLayer` and knows nothing about groups — so a diagram gets `.png` on the
existing path with no new rasterization machinery.

## Files

| file | exports |
|---|---|
| `layout.ts` | `DiagramStyle`, `DiagramDrawing`, `layoutDiagram(matrix, style)`, `fit(drawing, size)` |
| `svg.ts` | `diagramSvg(drawing, size)` |
| `canvas.ts` | `diagramLayer(drawing)` — a `RasterLayer` |
| `index.ts` | `diagramToSvg(figure, opts)`, `diagramToPng(figure, k, opts)`, `isDiagramFigure(figure)` |

## Not yet

`.html` (a live page) — the diagram has no camera or interaction story yet, so
`save('.html')` on a diagram figure refuses with a reason rather than
producing a blank page. Highlighting a selection (`docs/plan-…` increment 4)
is next.
