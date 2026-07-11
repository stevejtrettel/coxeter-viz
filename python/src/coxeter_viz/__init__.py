"""coxeter-viz: pictures of Coxeter groups from abstract group data.

The public surface is one constructor and one class:

    import coxeter_viz as cx
    fig = cx.figure([[1, 2, 7], [2, 1, 3], [7, 3, 1]])
    fig.tessellation(ball=4.0, color="parity").walls()
    fig.save("237.html")

All mathematics lives in the vendored JavaScript engine (`_static/`);
Python only *describes* the figure (PLAN §7.8: no geometry, no semantic
validation here — a refusal is the engine's answer, reported faithfully).
"""

from .figure import CoxeterVizError, Figure, figure

__all__ = ["figure", "Figure", "CoxeterVizError"]
