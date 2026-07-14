# CLAUDE.md

Guidance for working in this repo. Read this first.

## What this is

**`coxeter_groups`** — a Python package for **computing with Coxeter groups
and drawing them**. It has two halves that meet only at plain data:

- **`compute/`** — serious *symbolic* Coxeter-group computation, in pure
  Python (no dependencies): the group, its elements, word lists.
- **`viz/`** — a *dumb renderer* that turns a group specification + word
  lists into pictures (live HTML, vector SVG, shader PNG). It does **no**
  symbolic group theory; it vendors a compiled TypeScript engine.

The user is a mathematician (professor) who does research in Python and
wants to visualize it. Correctness and clean, close-to-the-math
abstractions matter more than feature count.

## The load-bearing rule: the seam

**`compute/` never imports `viz/`; `viz/` never imports `compute/`.** They
communicate only through **plain data** — a Coxeter matrix / polygon, and
**word lists** (`list[list[int]]`). The top-level `__init__` composes them;
`cx.figure(group)` reads `group.coxeter_matrix` duck-typed. This keeps the
compute library usable with no renderer and the renderer usable with no
compute library.

- **Symbolic vs geometric.** Python owns *symbolic combinatorics* (the word
  problem / element equality, length, descents, and later Bruhat order,
  cosets, …). The renderer owns *geometric realization* (solving walls,
  tiling the visible frame, culling to the camera) — geometry, not symbolic
  math. The two meet at words.

## Repo layout (Bokeh-standard: a Python package + a JS engine subdir)

```
pyproject.toml            # the package (name: coxeter-groups)
Makefile                  # one command surface over both subprojects
src/coxeter_groups/
  compute/                # symbolic Coxeter computation (pure Python)
    rep.py element.py group.py wordset.py   (+ README = the spec)
  viz/                    # the dumb renderer
    figure.py _html.py _export.py _static/  (+ README)
tests/  examples/         # Python tests; runnable reference scripts
renderer/                 # the TS engine that BUILDS viz/_static (a build input)
  src/ demos/ tests/ scripts/  package.json  *.config.ts
docs/                     # design/history (PLAN build log lives here)
outputs/ scratch/         # gitignored: generated images / throwaway experiments
```

The renderer is the *source* of one committed, vendored asset
(`viz/_static/{viewer.js, template.html}`); the wheel ships those two files,
so end users never need node. The renderer is the renderer's internals —
**not** the research substrate.

## The API, briefly

**Compute** (`import coxeter_groups as cx`):
- `g = cx.CoxeterGroup(matrix)` or `cx.CoxeterGroup.from_polygon([2,3,7])`.
- `g.element(word)`, `g.generators`, `g.identity()`; `g.ball(n)` / `g.sphere(n)`
  (word-length enumeration); `g.words(words)`.
- `Element`: rich and hashable by its **key** (the quantized reflection
  matrix); `a*b` (= `element(u+v)`), `a.inverse()`, `len(a)` (ℓ),
  `a.descents()`. Two words are equal iff same key — the word problem, via
  the faithful reflection (Tits) representation.
- `WordSet` (`g.words(...)`, `ball`/`sphere`): `set`-backed; `.invert()`,
  `.shift(by)`, `|`/`&`/`-`; `.words()` is the plain-list accessor, but the
  drawing ops take a `WordSet` directly (`fig.tiles(ws)`).

**Viz**:
- `cx.figure(matrix_or_group)` / `cx.polygon(orders)` → a `Figure`.
- Ops: `domain`, `walls`, `tessellation` (+ `edges=`), `cayley`, `tiles`,
  `hull`, `cosets`, `uniform`.
- **Views** (background + swappable): `fig.view(name)` opens a named
  figure-description over the shared background; the viewer swaps them (a
  toggle for 2, a dropdown for 3+) at a fixed camera. Chainable
  (`.view(...)…`, `.figure`).
- `fig.save('x.html' | 'x.svg' | 'x.png')`; with views, `.svg`/`.png` write
  one file per view. `fig.show()` opens a temp HTML.

## Commands (root `Makefile`)

- `make setup` — build both dev environments (Python venv + editable/export/
  dev deps; `npm install`).
- `make test` — both suites · `make test-py` · `make test-js`.
- `make bundle` — build the renderer → `viz/_static/` (do this after any
  `renderer/` change).
- `make dev DEMO=<name>` (TS dev demos) · `make typecheck` (TS strict).
- Python runs from the repo root (`.venv`, uv-managed); TS from `renderer/`.
  Generated images/pages go to gitignored `outputs/`; throwaway to `scratch/`.

## Working norms

- **A rigorous written plan precedes nontrivial code.** Execute in small,
  reviewable increments; surface every interpretation of an ambiguous answer
  before acting; pause at checkpoints. Do not scaffold or "get ahead"
  without explicit agreement. Treat vision/context messages as
  read-and-absorb, not build triggers.
- **README-first.** Each `src/coxeter_groups/*` (and `renderer/src/*`) folder
  has a `README.md` stating its mathematics, written first as the spec.
- **Verify claims** with throwaway scripts / tests before asserting them.
- **After any change:** `make test` (or the relevant `test-py`/`test-js`);
  `make typecheck` for TS.
- **Don't create branches or commit unless asked.** Commit messages end with
  the `Co-Authored-By: Claude` line.

## Deliberate, revisitable decisions

- **Element equality is float + tolerance** (the reflection rep uses
  `cos`; the key is a rounded matrix). Correct in practice, a known
  long-term liability — the intended upgrade is **exact arithmetic**
  (integer matrices for crystallographic `m ∈ {2,3,4,6,∞}`; algebraic
  numbers in general). Flagged in `compute/rep.py`.
- **Compute is pure stdlib** (tiny matrices; zero deps) — revisit if exact
  arithmetic or profiling wants a numeric library.
- **Generator indexing is load-bearing** and identical everywhere (words,
  walls, Cayley edges, `polygon` position).

## Glossary (one vocabulary, used identically everywhere)

| term | meaning |
|---|---|
| **Coxeter matrix** | symmetric integer M, M_ii = 1, M_ij = order of s_i s_j (−1 = ∞). The abstract group. |
| **polygon presentation** | a cyclic list of vertex orders; entry k = order of s_k·s_{k+1 mod n}; non-adjacent walls never meet (∞). The default 2D input. Expands to a Coxeter matrix. |
| **word** | list of generator indices `[i₀,…,i_k]`, applied left to right (i₀ first). Non-unique: many words = one element. |
| **key** | an element's identity: its quantized matrix in the reflection rep. Equal words ⇒ equal key. |
| **element / word set** | a group element (hashable by key); a `WordSet` is a `set` of them. |
| **ball / sphere** | word-length enumeration: `ball(n)` = length ≤ n, `sphere(n)` = exactly n (distinct from the renderer's *geometric* metric ball). |
| **wall / mirror / chamber** | the mirror of a generating reflection; the fundamental chamber = the intersection of half-spaces (the tile the group carries around). |
| **background / view** | the shared drawing (the tiling); a view is a swappable figure-description over it. |
| **figure document** | the viz seam: a versioned JSON of pure abstract data (group + layers + views), no geometry. `renderer/src/schema/`. |

## Current work

The active next build is the **interactive group explorer** (an HTML mode
with a live input field for the group spec, re-drawing the tessellation as
you type) — plan in **`docs/plan-group-explorer.md`**. Cusps for triangle
groups (`docs/PLAN.md` §9, math already verified) is designed and deferred
behind it.

## History

The full increment-by-increment build record (Phases 0–13: the original
viz-only system, then the rename to `coxeter_groups` + the Bokeh reshape +
the compute side + the views grammar) lives in **`docs/PLAN.md`** — a
historical log, not the live plan. `renderer/src/*/README.md` are the
current specs for the engine's math substrate.
