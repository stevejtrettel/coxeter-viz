# examples

Runnable reference scripts — they double as "run and see" instruments. Each
writes to `outputs/` at the repo root.

- **`wordset_to_png.py`** — a group + a set of words → a PNG.
- **`two_sets_html.py`** — an HTML page that swaps between a set and its inverses.

PNG/SVG output needs the export extra (`pip install "coxeter-groups[export]"`,
then `playwright install chromium`); HTML needs nothing.
