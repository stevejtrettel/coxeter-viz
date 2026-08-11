# Plan — Coxeter/Artin diagrams, and selection as a parabolic

**Status: BUILT (2026-08-11).** All five increments done; suites green at
530 (TS) / 119 (Python). Runnable examples live in `../coxeter-viz-test`
(`example_diagrams.py`, `example_highlight.py`). The group explorer
(`docs/plan-group-explorer.md`) remains unbuilt.

Two features that share one primitive, so they are planned together:

1. **Diagrams** — draw the Coxeter or Artin diagram of a group as a
   standalone SVG figure.
2. **Selection** — `g.parabolic(S)`, a subset of generators as a first-class
   object, highlightable in the diagram *and* in the tiling / Cayley graph,
   so a side-by-side pair shows the same data.

The primitive both rest on: **a selection is a subset S of generator indices,
and the object it names is the standard parabolic subgroup W_S.** Diagram
nodes are |S| = 1; diagram edges (= polygon vertices) are |S| = 2. Nothing
else is needed. The schema already speaks this language — `cosets` takes
exactly a `subgroup` of generator indices.

## Rulings settled in discussion (2026-08-11)

- **Both conventions**, chosen by a `style=` argument (not two ops).
- **Standalone figures only.** No overlay/inset — side-by-side composition is
  the user's, done outside the library. This deliberately leaves the
  renderer's "there is no diagram mode" ruling
  (`renderer/src/viz2d/render/README.md`) intact and untouched.
- **SVG**, like the rest.
- **Vertices = generators = diagram nodes.** (Polygon vertices are reachable
  as |S| = 2, so nothing is lost.)
- **Selection is a first-class object**, `g.parabolic(S)`, passed to both
  figures — not a per-op list of indices.

## Part A — diagrams

### The conventions

Complementary: each omits what the other draws.

| pair | Coxeter | Artin |
|---|---|---|
| m = 2 | no edge | edge labeled 2 |
| m = 3 | unlabeled edge | edge labeled 3 |
| m ≥ 4 | edge labeled m | edge labeled m |
| m = ∞ | dashed edge | no edge |

On the right-angled pentagon (adjacent 2, non-adjacent ∞): Artin draws the
pentagon, Coxeter draws the pentagram.

### The load-bearing property

**A diagram needs no geometric realization.** It is a pure function of the
Coxeter matrix. So `cx.diagram(...)` must draw for exactly the groups
`cx.figure(...)` refuses — `not-2d`, `free-product`, `non-compact`,
rank ≥ 4. This is the point of the feature, and it has a direct architectural
consequence (below).

### Architecture

**The semantic check must become conditional.** Today `checkFigure` runs
every document's group through `classifyGroup`
(`renderer/src/schema/README.md`, "Validation is a value"), and a refusal
becomes a problem. A diagram document must **skip** that: it needs the matrix
to be a valid Coxeter matrix (structural — symmetric, diagonal 1, entries ≥ 2
or the −1 sentinel) but must not require a realization. Proposal: run the
semantic classification only when the document contains a layer that needs a
realized chamber. Additive, and it makes an existing implicit assumption
explicit.

**The diagram emits its own SVG** (`renderer/src/diagram/`, README first).

An intermediate draft of this plan proposed routing the diagram through
`viz2d` as an ordinary `Scene` in E²/cartesian, so `buildPathList` → `toSvg` /
`sceneLayer` would carry it for free. **Building it proved that impossible:**
the path pipeline is filled-paths-only — `SceneItem` is point | geodesic |
circle | polygon | domain, with **no text** — and edge labels are mandatory in
both conventions. Adding text to the core scene vocabulary would break the
"everything is a filled path" invariant, which is the very thing that makes
SVG and canvas agree.

So the module keeps that guarantee *locally*: one layout, one shared `fit`,
two thin emitters.

```
matrix + style ──▶ DiagramDrawing ──┬──▶ svg.ts     (an <svg> string)
                    (layout.ts)     └──▶ canvas.ts  (a RasterLayer → PNG)
```

PNG needs nothing new either way: `renderPng` is generic over `RasterLayer`
and knows nothing about groups.

This does not reopen the "there is no diagram mode" ruling: that ruling is
about mixing screen-fixed content into a *hyperbolic* scene. A diagram is its
own figure, and validation refuses mixing it with the realized ops.

**One convention to state:** the house intrinsic unit is r₀, the chamber
inradius — and a diagram has no chamber. So the diagram declares its own:
**adjacent-node spacing = 1**.

**Layout: a ring.** Nodes on a circle in generator-index order. For a polygon
presentation the cyclic order *is* the wall cycle, so the Artin diagram draws
the polygon's combinatorics literally; and it degrades gracefully to any rank
with no graph-drawing solver. A linear layout for classical types is a later,
additive option.

### Python surface

```python
cx.diagram(group_or_matrix, *, style="coxeter", title=None, select=None)
```

returns a figure with `.save('d.svg')`. Accepts a raw matrix or anything
exposing `coxeter_matrix` (the existing duck-typed seam bridge).

## Part B — selection

### The object (compute side)

`g.parabolic(S)` → a `Parabolic`, living in `compute/` (pure stdlib, no viz).
A standard parabolic of a Coxeter group *is* a Coxeter group whose Coxeter
matrix is the principal submatrix M_S (Bourbaki), which makes the surface
almost free:

| member | meaning |
|---|---|
| `.generators` | the sorted index tuple — the seam datum |
| `.coxeter_matrix` | the principal submatrix M_S |
| `.is_finite()` | W_S is finite ⟺ the Tits form restricted to span(αᵢ : i ∈ S) is positive definite |
| `.order()` | \|W_S\| when finite (enumerate with the existing ball/sphere BFS) |

`.is_finite()` is the one piece needing new mathematics: positive-definiteness
of a principal submatrix of the Tits form. That is the cheap corner of the
signature/realization discussion (2026-08-11) — **the rest of that discussion
is deliberately NOT in this plan**; only the positive-definite test is pulled
in, because `.is_finite()` cannot be written without it.

### What S means in each picture

| S | diagram | tiling | Cayley graph |
|---|---|---|---|
| {i} | node i | wall i and its orbit | the edges labeled i |
| {i, j}, m_ij = m finite | the edge i–j with its label | the polygon vertex where walls i, j meet, and its orbit — the 2m-gon cell | the 2m-cycles (the faces) |
| general S | the induced subgraph | the W_S-orbit of the chamber | the cosets of W_S |

### The honest constraint

**Diagram-selectable ⊋ tiling-highlightable.** A pair with m_ij = ∞ is a
perfectly good diagram selection (it is even a drawn, dashed edge in the
Coxeter style) but bounds no cell: W_S is infinite and anchorless. The schema
already refuses this for `cosets` ("walls a and b do not meet (order ∞): the
parabolic is infinite — its cosets have no drawing"). Highlighting must reuse
that refusal verbatim rather than silently drawing nothing.

### There is already a substrate for this

`viz2d/render/types.ts` on `ItemId`: *"Load-bearing, not cosmetic: a wall
item's id encodes its generator index (the indexing shared by combinatorics,
decorations, words, Cayley); **highlighting** and hit-testing address items by
id."* So scene items are already addressable by generator index, and the
diagram's nodes will be too (same law). Highlighting may be substantially
closer to existing machinery than a new layer option — increment 5 should
start by reading how far that gets before adding anything.

### Schema

Cross-figure sharing happens in **Python**, between two separate documents —
so each document simply carries its own highlight spec, and no new
document-level concept is needed. A layer-level optional
`highlight: { generators: [...], color: "#rrggbb" }`, additive, version bump.

## Open decisions (resolve at the owning increment)

1. **Where the color lives.** `Parabolic.color` as an **inert annotation** is
   literally seam-compliant — compute never imports viz, and a hex string is
   plain data — but it does put a rendering word in a pure-math class. The
   purist alternative is a viz-side `Selection` wrapping a compute
   `Parabolic`. Lean the inert attribute, documented as inert; flagging it
   because it is the kind of thing that is annoying to undo later.
2. **Layout**: ring only for v1?
3. **Does `Parabolic` subclass `CoxeterGroup`** (it mathematically is one), or
   merely expose `.coxeter_matrix`? Subclassing is tempting and may over-couple.

### Resolved

- **`highlight`** is the word, everywhere (user ruling 2026-08-11).
- **PNG needs nothing new** (checked 2026-08-11). PNG is *not* a shader path:
  `pngFromAssembled` composites a shader field only when one exists
  (`asm.field !== null && asm.overlay !== null`) and otherwise takes the
  plain `sceneLayer` — vector → canvas → `toBlob`. `renderPng` is generic
  over `RasterLayer` and knows nothing about groups. Export already runs in
  headless Chromium (`viz/_export.py`), so a canvas is always at hand. A
  diagram that emits a `Scene` gets `.svg`, `.png` and `.html` on the
  existing paths, and the "everyone gets every export" invariant holds
  unbroken.

## Increments (each green-gated; README-first, plan before code)

1. ~~**`compute/parabolic.py` + README**~~ — **DONE 2026-08-11.**
   `g.parabolic(S)`, the submatrix, `.is_finite()` (Cholesky positive-definite
   test), `.order()`. Pure Python, no viz. 14 pins in `tests/test_parabolic.py`;
   suite green at 101.
   *Noted while building:* `Parabolic` accepts `S = ∅` (the schema's `cosets`
   allows it) but `CoxeterGroup` refuses rank 0, so the empty parabolic has no
   standalone presentation. Pinned as a test rather than papered over.
2. ~~**Diagram document + Python builder**~~ — **DONE 2026-08-11.** The
   `diagram` layer in `schema/{types,validate}.ts`, `cx.diagram(...)` (either
   presentation, told apart by nesting), and the conditional semantic check:
   a diagram-only document tolerates the *geometric* refusals and still
   refuses the structural ones. Mixing diagram + realized layers, and views on
   a diagram, are refused with reasons.
3. ~~**`renderer/src/diagram/` + README**~~ — **DONE 2026-08-11.** Ring
   layout, both styles, SVG + PNG. 15 TS pins, 12 Python pins; suites green at
   525 / 113.
   *Correction to this plan, found by building it:* the "emit a `viz2d`
   `Scene` and reuse the render stack" route (above) is **not possible** — the
   path pipeline is filled-paths-only and has **no text**, while edge labels
   are mandatory in both conventions. Adding text to `SceneItem` would break
   the "everything is a filled path" invariant that makes SVG and canvas agree.
   So the module keeps that guarantee locally instead: one `layoutDiagram` +
   one shared `fit`, feeding two thin emitters (`svg.ts`, `canvas.ts`). PNG
   still needs nothing new — `renderPng` is generic over `RasterLayer`.
   *Also found:* at even rank the n/2 diameter edges share a midpoint exactly,
   so labels must slide off it (`DIAMETER_SHIFT`), not just off the line.
   *Deferred:* `.html` for a diagram (no camera / interaction story yet) —
   `save('.html')` and `show()` refuse with a reason rather than emitting a
   blank page.
4. ~~**Highlight in the diagram**~~ — **DONE 2026-08-11.** Nodes of S wear a
   ring in the selection's color (keeping their own wall color); edges *within*
   S thicken and recolor.
5. ~~**Highlight in tiling / Cayley**~~ — **DONE 2026-08-11.** `highlight` on
   the `tessellation` and `cayley` layers. The tessellation paints the
   **W_S-orbit of the chamber** (the cell those walls bound); the Cayley graph
   emphasizes the W_S nodes and the S-labeled edges between them. New engine
   helper `parabolicWords` returns null when W_S is infinite, and assembly
   throws the reason — surfaced as a problem value, like the spherical hull.
   *Note:* the existing `ItemId` route was NOT used. Ids address items for
   per-frame `StyleOverride` in a live view; a static export has no override
   pass, so the highlight is emitted as extra scene items instead.
   *Open decision 1 resolved:* `Parabolic.color` is an inert annotation, as
   leaned. Compute never reads it; a hex string is plain data across the seam.

Gate each on `make test` (plus `make typecheck` for 3–5).
