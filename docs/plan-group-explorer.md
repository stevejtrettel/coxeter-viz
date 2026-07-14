# Plan — the interactive group explorer

**Status: PLANNED (discussed 2026-07-13), not built.** The active next build.
Cusps for triangles (`docs/PLAN.md` §9) is deferred behind this.

A new **viz mode**: an HTML page with an input field for the *group*, that
re-draws the tessellation live as you type — e.g. `2,3,7` → the (2,3,7)
triangle tiling, `2,2,2,2,2` → the right-angled pentagon tiling. For
experimentation.

## The idea, settled in discussion

- **A "parametric figure": the group is a live input with a DEFAULT.** The
  input edits the document's `group` field and re-renders; the engine
  realizes the new group (or surfaces a refusal as a value, as it already
  does). This is a small step on the existing machinery — the renderer
  already realizes group specs and re-renders (that's what resize does);
  we're wiring an input box to it.
- **Narrow scope first: only the GROUP is editable** (the polygon order
  sequence). General named parameters (depth, color, a word list) is the
  honest generalization — the same shape as `views`, a parameter with
  values — but it earns itself later.
- **Exports stay whole.** The input always has a value, so:
  - `.html` → the live explorer.
  - `.svg` / `.png` → render the **default** value (the in-page export
    button captures the *current* value, exactly like it already does for
    pan/zoom/view). A no-default "sandbox" that refuses static export is an
    explicit opt-in, deferred. So the "everyone gets every export"
    invariant holds — a static file is just a snapshot at the current value.
- **Viz-only.** The input drives the RENDERER (realize + tessellate), NOT
  the Python compute side (`WordSet` algebra, `ball`/`sphere` run in Python,
  not in the page). So the explorer is for the geometric rep / tessellation,
  not computed bags.
- **v1 is bare tessellation / walls.** The explorer's non-group layers are
  fixed; `tiles`/`hull` reference specific words that may not survive a
  group change, so leave them out of v1. Combining with `views` is deferred.

## Open questions (resolve at the owning increment)

1. **Python API shape**: `cx.explore([2,3,7])` (a `Figure` whose group is a
   live polygon input, default `[2,3,7]`; then `.tessellation(...)` etc. as
   usual) vs. `cx.figure(<input marker>)`. Lean `cx.explore(default)`.
2. **Input types**: polygon order sequence only for v1 (comma-separated
   ints)? (Matrix input, and `∞` once cusps land — later.)
3. **Schema representation** of "the group is an input" — e.g.
   `group: { input: "polygon", default: [2,3,7] }` — plus a version bump
   (`0.2` → `0.3`; back-compatible, additive).
4. **Camera on new input**: reset + refit (a different group is a different
   tiling) vs. preserve. Lean reset (like resize).
5. **Parsing / bad input**: `"2, 3, 7"` → `[2,3,7]`; empty/garbage → show
   the engine's refusal (problems-as-values), never a crash.

## Increments (each green-gated; README/plan-before-code)

1. **Schema + Python builder** (pure, no rendering): `group` may be an input
   (kind + default); `cx.explore(default)`; version bump; `checkFigure`
   validates the input group and applies the default; `document()`.
   Cross-language pins. Fully testable at the document level.
2. **Assemble / render wiring**: realize the default group; expose a way to
   re-render with a *new* group value on the existing layer stack — `render`
   already re-realizes from a document, so this is a `setGroup(spec)` /
   re-mount on the handle, at the same size.
3. **Template**: the input field (prefilled with the default), parse +
   re-render on change, refusal display in the page; static export renders
   the default. Headless-verified (type a value → tiling changes; a bad
   value → the refusal shows, no crash).
4. **Python export**: `.save('.png' / '.svg')` renders the default value;
   `.save('.html')` is the interactive explorer. Pins.

Start at **(1)** — it fixes the document contract with zero rendering risk,
and 2–4 build against it.

## Architectural note

This introduces a **"parametric figure"** concept — a figure with an open,
live parameter — which is the general case of which `views` (a discrete,
precomputed parameter) is a special case. Keep the door open to unifying
them later, but v1 is just "the group is a live input."
