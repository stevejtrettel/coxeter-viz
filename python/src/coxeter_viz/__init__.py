"""coxeter-viz: pictures of Coxeter groups from abstract group data.

The public surface is two constructors and one class:

    import coxeter_viz as cx

    # a 2D polygon by its vertex orders, in cyclic order (the default way):
    fig = cx.polygon([2, 3, 2, 6, 4, 5])
    fig.tessellation(ball=4.0, color="parity").walls()
    fig.save("hexagon.html")

    # or any group by its Coxeter matrix (representation discovered):
    fig = cx.figure([[1, 2, 7], [2, 1, 3], [7, 3, 1]])

All mathematics lives in the vendored JavaScript engine (`_static/`);
Python only *describes* the figure (PLAN §7.8: no geometry, no semantic
validation here — a refusal is the engine's answer, reported faithfully).
"""

from importlib.metadata import PackageNotFoundError, version as _version

from .figure import CoxeterVizError, Figure, figure, polygon

try:
    __version__ = _version("coxeter-viz")
except PackageNotFoundError:  # an uninstalled source tree
    __version__ = "0+unknown"

__all__ = ["figure", "polygon", "Figure", "CoxeterVizError", "__version__"]
