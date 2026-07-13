# `coxeter_groups.viz` — the dumb renderer

Turns a **group specification** (a Coxeter matrix or polygon) plus **word
lists** into pictures — live HTML, vector SVG, shader-rendered PNG — through
the vendored JavaScript engine in `_static/`.

**It does no symbolic group computation.** No word reduction, no normal
forms, no cosets, no descents (PLAN §12.1 — that is the `compute/` side's
job). Everything that crosses into `viz` is plain data: integers, lists of
integers, and the figure document. `viz` never imports `compute`.

The renderer's own engine (`_static/viewer.js`) does the *geometric*
realization — solving walls, tiling the visible frame, culling to the
camera — which is not symbolic combinatorics and is inherently
camera-dependent, so it stays here.

## Contents

- `figure.py` — the `Figure` builder: one method per drawing op, each
  appending to the figure document (the plain-JSON contract). `figure()` /
  `polygon()` constructors. `save()` / `show()` / `check()`.
- `_html.py` — the self-contained HTML page (bundle + figure inlined).
- `_export.py` — PNG / SVG / `check` via a headless browser (the `[export]`
  extra).
- `_static/` — the vendored engine: `viewer.js` + `template.html` (built by
  `npm run build:bundle`).
