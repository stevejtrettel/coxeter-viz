"""coxeter_groups.compute — symbolic Coxeter computation (PLAN §12).

Pure group theory: no drawing, no import of `viz`. See the README.
"""

from .element import Element
from .group import CoxeterGroup
from .rep import ReflectionRep

__all__ = ["CoxeterGroup", "Element", "ReflectionRep"]
