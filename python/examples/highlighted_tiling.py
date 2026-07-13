"""A tiling with highlighted triangles.

Describe the group by its Coxeter matrix, the tiling by an extent, and
the triangles to highlight by WORDS — each word is a list of generator
indices (matrix row order), applied left to right, and names the tile
that word carries the fundamental domain to. Any spelling of the same
element hits the same tile.

Run it:            python highlighted_tiling.py
It writes:         outputs/highlighted_tiling.png (4x shader) + .html (live)
                   (the repo's gitignored outputs/ — write wherever you like)
"""

from pathlib import Path

import coxeter_viz as cx

OUT = Path(__file__).resolve().parents[2] / "outputs"
OUT.mkdir(exist_ok=True)

# ── the group: the (2,3,7) triangle group ────────────────────────────────
# M[i][j] = order of s_i s_j; -1 means infinite. Geometry is inferred.
MATRIX = [
    [1, 2, 7],
    [2, 1, 3],
    [7, 3, 1],
]

# ── the triangles to highlight: a walk away from the fundamental domain ──
# successive prefixes of the word 0.1.2.0.1.2 — a path of tiles.
WORD = [0, 1, 2, 0, 1, 2]
HIGHLIGHT = [WORD[:k] for k in range(len(WORD) + 1)]  # [], [0], [0,1], …

fig = cx.figure(MATRIX, title="(2,3,7) with a walk of triangles")
fig.tessellation(ball=4.0, color="parity", opacity=0.9)  # the ambient tiling
fig.tiles(HIGHLIGHT, fill="#d03030")                     # the named triangles
fig.walls(width=0.05)                                    # the three mirrors

png = fig.save(OUT / "highlighted_tiling.png", scale=4, background="white")
html = fig.save(OUT / "highlighted_tiling.html")
print(f"wrote {png} and {html}")
