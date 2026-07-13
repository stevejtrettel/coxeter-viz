# coxeter-groups

**Pictures of Coxeter groups, from abstract group data.**

Give it a Coxeter group as pure combinatorial data — the Coxeter matrix —
and it produces geometric realizations in spherical, Euclidean, or
hyperbolic geometry (inferred, never declared), and everything downstream:
tessellations, Cayley graphs, coset colorings, uniform (Wythoff) tilings,
convex hulls with exact areas.

All mathematics runs in a vendored JavaScript engine; this package is a
thin builder that describes *what to draw* and writes the outputs. No
node, no npm — the engine is two static files inside the wheel.

```python
import coxeter_groups as cx

fig = cx.figure([[1, 2, 7],
                 [2, 1, 3],
                 [7, 3, 1]], title="the (2,3,7) tiling")
fig.tessellation(ball=4.0, color="parity")
fig.walls(width=0.05)

fig.save("237.html")   # a self-contained live illustration: pan, zoom, download
```

With the export extra —

```bash
pip install "coxeter-groups[export]"
playwright install chromium        # one-time
```

— `fig.save("237.png", scale=4)` renders through the GPU tiling shader at
4× resolution, and `fig.save("237.svg")` writes the exact vector picture.

Ops: `domain`, `walls`, `tessellation`, `cayley`, `tiles`, `hull`,
`cosets`, `uniform`. Words are lists of generator indices (the matrix row
order), applied left to right. A mathematically impossible request is
refused with its reason, never a crash.
