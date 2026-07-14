"""WordSet — a set of elements with convenience methods (see README).

A light wrapper over a ``frozenset[Element]`` plus its group. Immutable:
every operation returns a new set. Because ``Element`` is hashable by key,
membership / union / intersection / difference are exact — the operations
the word-list sugar could never do — and `.words()` hands the renderer the
plain word lists it draws (the drawing ops also accept the WordSet directly).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Iterable, Sequence, Union

from .element import Element

if TYPE_CHECKING:
    from .group import CoxeterGroup

Item = Union[Element, Sequence[int]]  # an Element, or a word to make one


class WordSet:
    __slots__ = ("_group", "_elements")

    def __init__(self, group: "CoxeterGroup", items: Iterable[Item] = ()):
        self._group = group
        elements = set()
        for item in items:
            e = item if isinstance(item, Element) else group.element(item)
            if e.group is not group:
                raise ValueError("element belongs to a different group.")
            elements.add(e)
        self._elements = frozenset(elements)

    # ── container protocol ────────────────────────────────────────────────
    @property
    def group(self) -> "CoxeterGroup":
        return self._group

    def __len__(self) -> int:
        return len(self._elements)

    def __iter__(self):
        return iter(self._elements)

    def __contains__(self, item: Item) -> bool:
        e = item if isinstance(item, Element) else self._group.element(item)
        return e in self._elements

    def __eq__(self, other: object) -> bool:
        return isinstance(other, WordSet) and self._group is other._group and self._elements == other._elements

    __hash__ = None  # mutable-semantics value; not a dict key

    def __repr__(self) -> str:
        return f"WordSet({len(self._elements)} elements)"

    # ── the seam accessor ─────────────────────────────────────────────────
    def words(self) -> list[list[int]]:
        """The plain word lists the renderer draws, in a deterministic order
        (by length then lexicographic). The drawing ops accept a WordSet
        directly, so you rarely call this yourself."""
        return [e.word for e in sorted(self._elements, key=lambda e: (len(e.word), e.word))]

    # ── the algebra (each returns a new word set) ─────────────────────────
    def invert(self) -> "WordSet":
        """The inverse set: {e⁻¹ : e ∈ self}."""
        return WordSet(self._group, (e.inverse() for e in self._elements))

    def shift(self, by: Item) -> "WordSet":
        """Translate the set by the element `by`: {e·by}. Geometrically the
        whole set moves rigidly by the isometry `by`."""
        b = by if isinstance(by, Element) else self._group.element(by)
        return WordSet(self._group, (e * b for e in self._elements))

    def _same_group(self, other: "WordSet") -> None:
        if not isinstance(other, WordSet) or other._group is not self._group:
            raise ValueError("word sets must belong to the same group.")

    def union(self, other: "WordSet") -> "WordSet":
        self._same_group(other)
        return WordSet(self._group, self._elements | other._elements)

    def intersection(self, other: "WordSet") -> "WordSet":
        self._same_group(other)
        return WordSet(self._group, self._elements & other._elements)

    def difference(self, other: "WordSet") -> "WordSet":
        self._same_group(other)
        return WordSet(self._group, self._elements - other._elements)

    __or__ = union
    __and__ = intersection
    __sub__ = difference
