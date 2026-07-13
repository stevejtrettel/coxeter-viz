"""Element — a rich, hashable group element (see README).

A word plus its group, with the matrix and quantized key cached. Hashable
by key, so Python sets/dicts dedup elements. Multiplication is word
concatenation: ``g.element(u + v) == g.element(u) * g.element(v)``.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Sequence

from .rep import Matrix, matmul

if TYPE_CHECKING:  # avoid a compute-internal import cycle (group imports Element)
    from .group import CoxeterGroup

#: Sign tolerance for a root coordinate (float+tolerance; README). A root is
#: negative iff every coordinate is ≤ 0; its nonzero coords are O(1), so this
#: separates negative from positive roots comfortably.
ROOT_EPS = 1e-9


class Element:
    __slots__ = ("_group", "_word", "_matrix", "_key")

    def __init__(self, group: "CoxeterGroup", word: Sequence[int], *, matrix: Matrix | None = None):
        self._group = group
        self._word = [int(i) for i in word]
        self._matrix = group.rep.word_matrix(self._word) if matrix is None else matrix
        self._key = group.rep.key(self._matrix)

    # ── identity ──────────────────────────────────────────────────────────
    @property
    def group(self) -> "CoxeterGroup":
        return self._group

    @property
    def word(self) -> list[int]:
        """The stored spelling (a copy). Non-canonical: one of many words."""
        return list(self._word)

    @property
    def key(self):
        return self._key

    def __eq__(self, other: object) -> bool:
        return isinstance(other, Element) and self._group is other._group and self._key == other._key

    def __hash__(self) -> int:
        return hash(self._key)

    def __repr__(self) -> str:
        return f"Element({self._word})"

    # ── group structure ───────────────────────────────────────────────────
    def __mul__(self, other: "Element") -> "Element":
        if not isinstance(other, Element):
            return NotImplemented
        if other._group is not self._group:
            raise ValueError("cannot multiply elements of different groups.")
        # word (u+v) ⇒ matrix word_matrix(v) @ word_matrix(u) = other @ self.
        return Element(self._group, self._word + other._word, matrix=matmul(other._matrix, self._matrix))

    def inverse(self) -> "Element":
        """The inverse element, spelled by the reversed word."""
        return Element(self._group, list(reversed(self._word)))

    # ── length and descents (from the reflection rep) ─────────────────────
    def descents(self) -> frozenset[int]:
        """The right descent set: generators i with a·αᵢ a negative root
        (column i of the matrix all ≤ 0), i.e. ℓ(a·sᵢ) < ℓ(a)."""
        m, n = self._matrix, self._group.rank
        return frozenset(i for i in range(n) if all(m[r][i] <= ROOT_EPS for r in range(n)))

    def __len__(self) -> int:
        """The word length ℓ(a): strip right descents until the identity."""
        m = self._matrix
        gens = self._group.rep.generators
        n = self._group.rank
        count = 0
        while True:
            d = next((i for i in range(n) if all(m[r][i] <= ROOT_EPS for r in range(n))), None)
            if d is None:
                return count
            m = matmul(m, gens[d])  # a ← a·s_d, one shorter
            count += 1
