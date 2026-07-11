# `schema/` — the figure document

The versioned JSON contract between *describing* a picture (Python, a
fixture file, a notebook) and *making* it (the engine). A **figure
document** is pure abstract data — a Coxeter matrix, layer descriptions,
word lists — with **no geometry anywhere**: the engine infers the geometry,
realizes the chamber, and draws. This folder owns the document's types,
parsing, validation, and versioning. Pure data + checks: no DOM, no
rendering, no group theory (semantic checks delegate to the inference
layer, `coxeter/matrix`).

Spec'd at P0 (PLAN.md §7.4/§7.6, signed off 2026-07-10); implementation is
P2. **v0.1 is deliberately the as-built vocabulary and will evolve; the
`version` field is the honesty mechanism.** Named *figure*, not *scene* —
`viz2d` owns `Scene` (the item list), and that collision would be
permanent.

Position in the dependency law:
`math → … → coxeter → group → viz2d → schema → app`.

## The document

```jsonc
{
  "version": "0.1",
  "group": { "coxeterMatrix": [[1,2,7],[2,1,3],[7,3,1]] },  // geometry INFERRED, never declared
  "model": "auto",             // optional; auto = the conformal chart of the inferred geometry
  "layers": [
    { "type": "tessellation", "extent": { "ball": 4.0 },
      "color": { "map": "parity" } },
    { "type": "walls", "width": 0.05 },
    { "type": "cayley", "extent": { "ball": 3.0 } }
  ]
}
```

- **`title`** — optional display title: the saved page's browser-tab title
  and export filenames (user ruling 2026-07-10).
- **`group.coxeterMatrix`** — the symmetric integer matrix, `M_ii = 1`,
  `M_ij` = the order of `sᵢsⱼ`, **−1 the sentinel for ∞** (JSON has no
  `Infinity`). Row/column order IS the generator indexing — load-bearing,
  shared with every word list and generator reference in the document.
- **`model`** — `"auto"` (default) | `"poincare"` | `"klein"` |
  `"cartesian"` | `"gnomonic"` | `"stereographic"`. `auto` = conformal:
  Poincaré (H), the plane (E), stereographic (S). A model incompatible
  with the inferred geometry is a validation problem. (The perspective
  globe is not a v0.1 model; parked.)
- **`layers`** — painted back to front.

## The ops (v0.1)

Every word-driven op states what a word *maps to* (the semantics rule).
Words are lists of generator indices applied **left to right** (`[i₀,…,i_k]`
⇒ `R_{i_k}···R_{i₀}` — the glossary law, unchanged).

| op | arguments (all optional unless marked) | semantics |
|---|---|---|
| `domain` | `fill` | the fundamental chamber |
| `walls` | `width`, `colors` (per generator) | the mirrors of the generators |
| `tessellation` | `extent`, `color`, `opacity` | the orbit of the chamber; one tile per element |
| `cayley` | `extent`, `node {size, color}`, `edge {width}` | the dual graph: vertices = the orbit of the incenter, edges `{g, g·Rᵢ}` colored by generator |
| `tiles` | **`words`**, `fill` | word w ↦ THE TILE w·(FD) — any spelling of an element hits its one tile |
| `hull` | **`words`**, `fill`, `stroke` | the convex hull of the base-point images w·x₀ (straight chart); its Gauss–Bonnet area is reported in render diagnostics |
| `cosets` | **`subgroup`** (generator indices), `extent` | left cosets of the parabolic W_S, one color per coset through the shared `hashHue` law (CPU/SVG/GPU agree bit-exactly; no palette knob, by design). S must admit a W_S-fixed anchor — ∅, one generator, or a MEETING pair — else W_S is infinite/anchorless and validation refuses. |
| `uniform` | **`rings`** (≥ 1 generator indices), `palette` | the Wythoff tiling of the ringed seed; faces colored by dihedral-orbit type, edged by the seed-star net. Triangle chambers (rank 3) only. |

## Pinned conventions

- **extent** = `{ "ball": r }` (an intrinsic metric radius — the default
  form) or `{ "depth": n }` (word length — the expert knob). **Omitted ⇒
  cover the frame**: the intrinsic radius that fills the auto-fit view
  (the existing `coverageRadius` machinery); spherical groups are finite
  and simply exhaust.
- **The intrinsic unit is r₀, the chamber inradius.** Every length in a
  document (`width: 0.05`, `node.size`, …) is `value × r₀` in the
  geometry — so a document is group-independent and the house
  intrinsic-width styling applies unchanged.
- **color maps** v0.1: `{ "map": "parity" }`, `{ "map": "hue" }`, or a
  constant `{ "constant": "#rrggbb" }`. Colors are hex strings; omitted
  colors fall back to the house palette (`kit/palette`). Explicit per-word
  colors are additive later.
- **The document is camera-free.** v0.1 renders with the `kit/camera`
  auto-fit; live pan/zoom mutates the view only, never the document. An
  explicit camera field is additive later.
- **How things get painted is not in the document.** Shader for live/PNG,
  vector compute for SVG — an engine convention (`app/`), invisible here.

## Validation is a value, never a throw

```ts
type FigureCheck =
  | { ok: true; figure: Figure }              // the checked, defaulted form
  | { ok: false; problems: FigureProblem[] }; // each with a mathematical reason
```

Two stages, one result: **structural** (shape, version known, indices in
range — every generator reference and word letter is `0 ≤ i < rank`,
`rings`/`subgroup` are sets of generator indices) and **semantic** — the
matrix goes through `classifyCoxeterMatrix` (`coxeter/matrix`), and a
refusal there (`free-product`, `not-2d`, …) surfaces as a problem verbatim,
so Python can report *why* the group has no picture. Unknown `version` is
itself a problem, not a crash.

## Files (P2)

| file | exports |
|---|---|
| `types.ts` | `Figure`, `Layer` (the eight op interfaces), `Extent`, `ColorSpec`, `ModelName`, `FigureCheck`, `FigureProblem` |
| `validate.ts` | `checkFigure(raw: unknown): FigureCheck` — parse + structural + semantic, applying defaults |

Hand-written fixture documents covering all eight ops (plus each failure
class) live in `tests/fixtures/figures/` and double as the dev harness's
menu (P3) and the golden-export inputs (P9).

## Tests pin the contract

- every fixture round-trips `checkFigure` unchanged (defaults applied
  exactly once);
- each structural failure class produces its problem (bad version, index
  out of range, unknown op, wrong extent shape);
- each inference refusal surfaces as a problem carrying the
  `coxeter/matrix` reason;
- generator indexing: a document's word lists validate against the
  matrix rank, never against anything geometric.
