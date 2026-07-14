# coxeter-groups

Compute with Coxeter groups in Python, and draw them.

Two halves that meet only at plain data (a group, and word lists):

- **compute** — symbolic Coxeter-group computation in pure Python: the
  group, its elements, and word lists. No dependencies.
- **viz** — a renderer that turns a group + word lists into pictures (live
  HTML, vector SVG, shader-rendered PNG). It does no group theory of its own;
  it ships a vendored engine, so drawing needs no JavaScript toolchain.

```python
import coxeter_groups as cx

# a group — from a Coxeter matrix, or a polygon (the default 2D input)
g = cx.CoxeterGroup.from_polygon([2, 3, 7])        # the (2,3,7) triangle group

# compute: elements are words, deduplicated by the element they name
shell = g.ball(4) - g.ball(2)                       # a WordSet: the length-3 & 4 shell
len(shell)                                          # 16

# draw: a group + a set of words → a PNG (tiles() takes the WordSet directly)
(cx.figure(g, model="poincare")
   .tessellation(ball=5.0, color="parity")
   .tiles(shell, fill="#d15954")
   .save("shell.png", scale=3))
```

## Views — swap between figure-descriptions

A figure has a shared **background** (the tiling) and any number of named
**views** over it. Saved to HTML, the viewer offers a toggle (2 views) or a
dropdown (3+) — the tiling and camera stay put as you flip. Saved to
SVG/PNG, you get one file per view.

```python
fig = cx.figure(g, model="poincare").tessellation(ball=5.0, color="parity")
fig.view("words").tiles(shell, fill="#d15954")
fig.view("inverses").tiles(shell.invert(), fill="#2f6fb7")
fig.save("two-sets.html")     # a toggle between the set and its inverses
```

A `WordSet` (from `g.words(...)`, `g.ball`, `g.sphere`) supports the real
algebra that `Element` equality makes possible: `.invert()`, `.shift(word)`,
and `|` / `&` / `-` (union / intersection / difference — e.g.
`ball(3) - ball(2) == sphere(3)`). The drawing ops accept it directly.

## Install

```
pip install coxeter-groups            # compute + HTML output
pip install "coxeter-groups[export]"  # + SVG/PNG (a headless browser)
playwright install chromium           # once, for the [export] extra
```

## Examples

Runnable reference scripts are in [`examples/`](examples/).

## Developing

This repo is a Python package (`src/coxeter_groups/`) plus the TypeScript
engine that builds its vendored renderer (`renderer/`). A root `Makefile`
drives both: `make setup`, `make test`, `make bundle`. See
[CLAUDE.md](CLAUDE.md) for the architecture.
