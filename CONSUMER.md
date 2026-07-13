# Setting up a consumer repo for `coxeter-viz`

A recipe for a second repository that *uses* the Python package the way a
stranger would — the real test of the product seam. Nothing here touches
this repo; the consumer repo is plain Python and never sees TypeScript,
node, or npm.

## Prerequisites

- `uv` installed (the consumer repo will be uv-managed, like `python/`).
- Python ≥ 3.10 — your system python3 is 3.9, so let uv provide one
  (it downloads interpreters on demand; nothing global changes).

## 1. Create the repo

```bash
mkdir ~/Code/coxeter-pictures && cd ~/Code/coxeter-pictures
git init
uv init --python 3.12
```

## 2. Install the package — two modes

**Editable (day-to-day)** — points at the source tree, so a
`npm run build:bundle` in coxeter-viz flows into the consumer instantly
(the engine is the two committed files in `_static/`):

```bash
uv add --editable ~/Code/coxeter-viz/python
```

**Wheel (dress rehearsal for PyPI)** — builds the actual artifact and
installs that; this is the mode that catches packaging bugs (e.g.
`_static/` missing from the wheel):

```bash
cd ~/Code/coxeter-viz/python && uv build       # → dist/coxeter_viz-0.1.0-py3-none-any.whl
cd ~/Code/coxeter-pictures
uv remove coxeter-viz                          # if switching from editable
uv add ~/Code/coxeter-viz/python/dist/coxeter_viz-0.1.0-py3-none-any.whl
```

Once published, both are replaced by `uv add "coxeter-viz[export]"`.

## 3. Exports (PNG / SVG / check) need the browser

```bash
uv add playwright
uv run playwright install chromium    # one-time download
```

HTML output needs none of this — it's pure stdlib.

## 4. First picture

`first.py`:

```python
import coxeter_viz as cx

fig = cx.figure([[1, 2, 7],
                 [2, 1, 3],
                 [7, 3, 1]], title="the (2,3,7) tiling")
fig.tessellation(ball=4.0, color="parity")
fig.walls(width=0.05)

fig.save("237.html")            # self-contained live page: pan, zoom
fig.save("237.png", scale=4)    # GPU shader render at 4×
fig.save("237.svg")             # exact vector picture
fig.check()                     # raises CoxeterVizError on a refusal
```

```bash
uv run python first.py
```

## 5. What to verify (the point of the exercise)

- `237.html` opens from the filesystem with no network, pans and zooms.
- The PNG is genuinely 4× (shader re-render, not upscaling) and the SVG
  is vector all the way down.
- Refusals surface properly: try `cx.figure([[1, -1], [-1, 1]])` and
  confirm you get a `CoxeterVizError` naming the reason, not a crash or
  a blank page.
- The wheel mode works with the coxeter-viz repo *renamed or absent* —
  proof the wheel is self-contained.

Ops available on a figure: `domain`, `walls`, `tessellation`, `cayley`,
`tiles`, `hull`, `cosets`, `uniform`; words are lists of generator
indices in matrix row order, applied left to right. See
`python/README.md` and `python/examples/` in the coxeter-viz repo.
