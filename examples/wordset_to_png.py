"""A group + a set of words → a PNG.

    python examples/wordset_to_png.py     # writes outputs/shell.png

Needs the export extra:  pip install "coxeter-groups[export]"  (then
`playwright install chromium`).
"""

from pathlib import Path

import coxeter_groups as cx

out = Path("outputs")
out.mkdir(exist_ok=True)

# A group — here from its polygon (the (2,3,7) triangle group).
g = cx.CoxeterGroup.from_polygon([2, 3, 7])

# A WordSet, built by real set algebra: every element of word length 3 or 4.
shell = g.ball(4) - g.ball(2)
print(f"{len(shell)} elements in the shell")

# Draw it: the tessellation as context, the set highlighted on top.
# tiles() takes the WordSet directly.
fig = (
    cx.figure(g, model="poincare", title="a word set over (2,3,7)")
    .tessellation(ball=5.0, color="parity")
    .tiles(shell, fill="#d15954")
)
print("wrote", fig.save(out / "shell.png", scale=3))
