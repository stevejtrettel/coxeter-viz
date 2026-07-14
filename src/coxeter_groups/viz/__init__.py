"""viz — the dumb renderer half of coxeter_groups.

Takes PLAIN DATA (a Coxeter matrix / polygon, and word lists) and turns it
into pictures through the vendored JavaScript engine (`_static/`). It does
NO symbolic group computation — no word reduction, no normal forms, no
cosets or descents (PLAN §12.1: that is the `compute/` side's job). The two
halves meet only at plain data; `viz` never imports `compute`.
"""

from .figure import CoxeterVizError, Figure, figure, polygon, unspecified

__all__ = ["figure", "polygon", "unspecified", "Figure", "CoxeterVizError"]
