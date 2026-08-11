"""Parabolic — a subset of generators as an object (see README).

The standard parabolic W_S = ⟨s_i : i ∈ S⟩. It is itself a Coxeter group
(presented by the principal submatrix M_S), and it is finite exactly when the
Tits form restricted to span(α_i : i ∈ S) — the principal submatrix B_S — is
positive definite.

This is the object a *selection* names: choosing diagram nodes, chamber
walls, or Cayley edge labels are all the same act, choosing S.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING, Iterable, Sequence

from .rep import Matrix, bilinear_form
from .wordset import WordSet

if TYPE_CHECKING:  # avoid a compute-internal import cycle (group imports Parabolic)
    from .group import CoxeterGroup

#: Pivot floor for the positive-definiteness test (float+tolerance; README).
#: The tight case is I₂(m), whose smallest pivot is sin²(π/m): correct up to
#: m ~ 1e6. The affine boundary (a true pivot of 0) lands at float noise
#: ~1e-16 and is separated comfortably.
PD_EPS = 1e-12


def _positive_definite(A: Matrix, eps: float = PD_EPS) -> bool:
    """Is the symmetric matrix positive definite? Cholesky: a pivot that is
    not comfortably positive means the form is not definite. A 0×0 matrix is
    vacuously definite (the trivial group is finite)."""
    n = len(A)
    L = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1):
            s = A[i][j] - math.fsum(L[i][k] * L[j][k] for k in range(j))
            if i == j:
                if s <= eps:
                    return False
                L[i][i] = math.sqrt(s)
            else:
                L[i][j] = s / L[j][j]
    return True


class Parabolic:
    """The standard parabolic subgroup W_S of a Coxeter group."""

    __slots__ = ("_group", "_generators", "coxeter_matrix", "color")

    def __init__(self, group: "CoxeterGroup", generators: Iterable[int], *, color: str | None = None):
        S = sorted({int(i) for i in generators})
        for i in S:
            if not (0 <= i < group.rank):
                raise ValueError(f"generator index {i} is not in 0…{group.rank - 1}.")
        self._group = group
        #: The selected generator indices, sorted — the seam datum.
        self._generators: tuple[int, ...] = tuple(S)
        #: M_S, the principal submatrix; indexed by position in `generators`.
        self.coxeter_matrix: list[list[int]] = [[group.coxeter_matrix[i][j] for j in S] for i in S]
        #: An INERT annotation: the color this selection is drawn in, so the
        #: same parabolic reads as the same data in a diagram and a tiling side
        #: by side. `compute` never interprets it — it is plain data that rides
        #: across the seam, exactly like a word list, so nothing here depends
        #: on `viz`. None = let the renderer use the house accent.
        self.color = color

    @property
    def group(self) -> "CoxeterGroup":
        """The ambient group W (not W_S)."""
        return self._group

    @property
    def generators(self) -> tuple[int, ...]:
        return self._generators

    @property
    def rank(self) -> int:
        return len(self._generators)

    def is_finite(self) -> bool:
        """Is W_S finite? Equivalently: is the Tits form restricted to the
        selected simple roots positive definite? (Equivalently again: do the
        selected walls meet — does W_S fix a point?)"""
        return _positive_definite(bilinear_form(self.coxeter_matrix))

    def elements(self) -> "WordSet":
        """The elements of W_S, as a WordSet — BFS over the S-generators only
        (deduped by key, exactly as ball/sphere do). Raises when W_S is
        infinite rather than looping forever.

        This is the drawing handoff too: `W_S` is what a highlight shows, and a
        WordSet is what the drawing ops take."""
        if not self.is_finite():
            raise ValueError(
                f"W_S is infinite for S = {list(self._generators)}. "
                "(The selected walls do not all meet, so they bound no cell.)"
            )
        g = self._group
        gens = [g.element([i]) for i in self._generators]
        found = [g.identity()]
        seen = {found[0].key}
        frontier = list(found)
        while frontier:
            nxt = []
            for a in frontier:
                for s in gens:
                    c = a * s
                    if c.key not in seen:
                        seen.add(c.key)
                        found.append(c)
                        nxt.append(c)
            frontier = nxt
        return g.words(found)

    def order(self) -> int:
        """|W_S| — the number of elements (raises when W_S is infinite)."""
        return len(self.elements())

    # ── identity ──────────────────────────────────────────────────────────
    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, Parabolic)
            and self._group is other._group
            and self._generators == other._generators
        )

    def __hash__(self) -> int:
        return hash((id(self._group), self._generators))

    def __repr__(self) -> str:
        return f"Parabolic({list(self._generators)})"
