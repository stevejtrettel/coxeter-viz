"""coxeter_groups: symbolic Coxeter-group computation, with visualization.

Two halves that meet only at plain data (PLAN §12):

- `compute/` — serious symbolic Coxeter computation (groups, elements,
  word lists). *(Being built; not yet present.)*
- `viz/` — a dumb renderer that turns a group specification + word lists
  into pictures, doing no symbolic math of its own.

The visualization surface is two constructors and one class:

    import coxeter_groups as cx

    # a 2D polygon by its vertex orders, in cyclic order (the default way):
    fig = cx.polygon([2, 3, 2, 6, 4, 5])
    fig.tessellation(ball=4.0, color="parity").walls()
    fig.save("hexagon.html")

    # or any group by its Coxeter matrix (representation discovered):
    fig = cx.figure([[1, 2, 7], [2, 1, 3], [7, 3, 1]])

All rendering mathematics lives in the vendored JavaScript engine
(`viz/_static/`); the Python `viz` layer only *describes* the figure.
"""

from importlib.metadata import PackageNotFoundError, version as _version

from .compute import CoxeterGroup, Element
from .viz import CoxeterVizError, Figure, figure, polygon

try:
    __version__ = _version("coxeter-groups")
except PackageNotFoundError:  # an uninstalled source tree
    __version__ = "0+unknown"

__all__ = [
    "CoxeterGroup",
    "Element",
    "figure",
    "polygon",
    "Figure",
    "CoxeterVizError",
    "__version__",
]
