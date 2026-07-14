"""CoxeterGroup — the root object (see README).

Built from a Coxeter matrix; holds the reflection rep and is the factory for
elements. `ball`/`sphere` enumeration and `bag(…)` arrive in later
increments. `coxeter_matrix` is the seam handoff to `viz.figure`.
"""

from __future__ import annotations

from typing import Sequence

from .wordset import WordSet
from .element import Element
from .rep import DEFAULT_TOL_DIGITS, ReflectionRep


def _polygon_to_matrix(orders: Sequence[int]) -> list[list[int]]:
    """Expand a polygon presentation to its Coxeter matrix (PLAN §10): entry
    k is the order of s_k·s_{k+1 mod n} (the cyclic super/sub-diagonal);
    non-adjacent walls never meet, so their entry is −1 (∞)."""
    n = len(orders)
    if n < 3:
        raise ValueError("a polygon has at least 3 sides.")
    M = [[1 if i == j else -1 for j in range(n)] for i in range(n)]  # diagonal 1, ∞ elsewhere
    for k in range(n):
        m = int(orders[k])
        M[k][(k + 1) % n] = m
        M[(k + 1) % n][k] = m
    return M


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

    @classmethod
    def from_polygon(cls, orders: Sequence[int], *, tol_digits: int = DEFAULT_TOL_DIGITS) -> "CoxeterGroup":
        """A group from its polygon presentation (PLAN §10; the default 2D
        input): a cyclic list of vertex orders, entry k = the order of
        s_k·s_{k+1 mod n}; non-adjacent walls never meet (∞). The same group
        ``cx.polygon(orders)`` draws — e.g. ``from_polygon([2, 3, 7])`` is the
        (2,3,7) triangle group."""
        return cls(_polygon_to_matrix(orders), tol_digits=tol_digits)

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

    # ── enumeration by word length ────────────────────────────────────────
    def _spheres(self, max_len: int) -> list[list[Element]]:
        """Spheres 0…max_len (stopping early if the group is exhausted).

        BFS from the identity: multiply each element of the current sphere by
        every generator, keep what is new (deduped by key). A newly-seen
        element from sphere k has length k+1 exactly — anything of length k−1
        was already discovered — so no length recomputation is needed, and the
        spelling each element is first found by is a reduced word.
        """
        if max_len < 0:
            raise ValueError("length must be ≥ 0.")
        e = self.identity()
        gens = self.generators
        seen = {e.key}
        spheres = [[e]]
        frontier = [e]
        for _ in range(max_len):
            nxt: list[Element] = []
            for g in frontier:
                for s in gens:
                    cand = g * s
                    if cand.key not in seen:
                        seen.add(cand.key)
                        nxt.append(cand)
            if not nxt:
                break  # finite group, fully enumerated
            spheres.append(nxt)
            frontier = nxt
        return spheres

    def sphere(self, n: int) -> WordSet:
        """The elements of word length exactly `n` (empty past the diameter)."""
        spheres = self._spheres(n)
        return WordSet(self, spheres[n] if n < len(spheres) else [])

    def ball(self, n: int) -> WordSet:
        """The elements of word length ≤ `n` (spheres 0…n)."""
        return WordSet(self, (g for s in self._spheres(n) for g in s))

    def words(self, items=()) -> WordSet:
        """A WordSet of the given words or elements (deduped by element)."""
        return WordSet(self, items)

    def __repr__(self) -> str:
        return f"CoxeterGroup(rank={self.rank})"
