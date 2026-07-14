"""An HTML page that swaps between a word set and its inverses.

    python examples/two_sets_html.py     # writes outputs/two_sets.html

Open the file and hover the bottom-left for the toggle. Needs nothing beyond
the base install (HTML is self-contained).
"""

from pathlib import Path

import coxeter_groups as cx

out = Path("outputs")
out.mkdir(exist_ok=True)

g = cx.CoxeterGroup.from_polygon([2, 3, 7])
shell = g.ball(3) - g.ball(1)  # a WordSet

# One shared background (the tiling); two views over it, swapped in the page.
# View ops chain back via `.view(...)` and `.figure`.
fig = (
    cx.figure(g, model="poincare", title="a set and its inverses")
    .tessellation(ball=5.0, color="parity")
    .view("words").tiles(shell, fill="#d15954")
    .view("inverses").tiles(shell.invert(), fill="#2f6fb7")
    .figure
)
print("wrote", fig.save(out / "two_sets.html"))
