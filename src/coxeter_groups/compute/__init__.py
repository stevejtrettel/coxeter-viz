"""coxeter_groups.compute — symbolic Coxeter computation (PLAN §12).

Pure group theory: no drawing, no import of `viz`. See the README.
"""

from .rep import ReflectionRep
from .element import Element
from .bag import Bag
from .group import CoxeterGroup

__all__ = ["CoxeterGroup", "Element", "Bag", "ReflectionRep"]
