"""CoxeterGroup — the root object (see README).

Built from a Coxeter matrix; holds the reflection rep and is the factory for
elements. `ball`/`sphere` enumeration and `bag(…)` arrive in later
increments. `coxeter_matrix` is the seam handoff to `viz.figure`.
"""

from __future__ import annotations

from typing import Sequence

from .element import Element
from .rep import DEFAULT_TOL_DIGITS, ReflectionRep


def _validate(M: list[list[int]]) -> None:
    n = len(M)
    if n == 0:
        raise ValueError("a Coxeter matrix has at least one generator.")
    for i, row in enumerate(M):
        if len(row) != n:
            raise ValueError(f"the Coxeter matrix must be square; row {i} has {len(row)}, expected {n}.")
    for i in range(n):
        if M[i][i] != 1:
            raise ValueError(f"diagonal entry M[{i}][{i}] must be 1 (got {M[i][i]}).")
        for j in range(n):
            if M[i][j] != M[j][i]:
                raise ValueError(f"the Coxeter matrix must be symmetric; M[{i}][{j}] ≠ M[{j}][{i}].")
            if i != j and not (M[i][j] == -1 or M[i][j] >= 2):
                raise ValueError(f"off-diagonal M[{i}][{j}] must be ≥ 2 or −1 (∞); got {M[i][j]}.")


class CoxeterGroup:
    """A Coxeter group, presented by its Coxeter matrix."""

    def __init__(self, coxeter_matrix: Sequence[Sequence[int]], *, tol_digits: int = DEFAULT_TOL_DIGITS):
        M = [[int(x) for x in row] for row in coxeter_matrix]
        _validate(M)
        #: The presentation — also the seam handoff read by `viz.figure(g)`.
        self.coxeter_matrix = M
        self.rank = len(M)
        self.rep = ReflectionRep(M, tol_digits=tol_digits)

    def element(self, word: Sequence[int]) -> Element:
        for i in word:
            if not (0 <= i < self.rank):
                raise ValueError(f"generator index {i} is not in 0…{self.rank - 1}.")
        return Element(self, word)

    def identity(self) -> Element:
        return Element(self, [])

    @property
    def generators(self) -> list[Element]:
        return [Element(self, [i]) for i in range(self.rank)]

    def __repr__(self) -> str:
        return f"CoxeterGroup(rank={self.rank})"
