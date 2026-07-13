"""The reflection representation and the element key (see README).

The Tits reflection representation of a Coxeter group, in pure stdlib
floats, used to decide the word problem: two words are the same element iff
their (quantized) matrices agree. Faithful (Tits) => correct.

Float + tolerance for now (a deliberate, revisitable ruling — README);
exact arithmetic is the intended upgrade.
"""

from __future__ import annotations

import math
from typing import Sequence

# A matrix is a tuple of row tuples; a key is its flattened, rounded form.
Matrix = tuple[tuple[float, ...], ...]
Key = tuple[float, ...]

#: Decimal places the key rounds to. Element matrices for distinct elements
#: differ by O(1); equal ones agree to ~1e-14 (float noise over a BFS), so
#: rounding here separates the former and merges the latter.
DEFAULT_TOL_DIGITS = 9


def _b(m: int) -> float:
    """The bilinear-form entry −cos(π/m); −1 sentinel = ∞ ⇒ −1."""
    if m == -1:  # ∞ bond: π/∞ → 0, −cos 0 = −1
        return -1.0
    return -math.cos(math.pi / m)


def bilinear_form(coxeter_matrix: Sequence[Sequence[int]]) -> Matrix:
    """B[i][j] = −cos(π/M[i][j]); the diagonal (m=1) is −cos π = 1, uniformly."""
    return tuple(tuple(_b(m) for m in row) for row in coxeter_matrix)


def reflection_matrices(form: Matrix) -> list[Matrix]:
    """One reflection matrix per generator: identity but for row i, which is
    row_i[j] = δᵢⱼ − 2·B[i][j] (so σᵢ(αᵢ) = −αᵢ)."""
    n = len(form)
    mats: list[Matrix] = []
    for i in range(n):
        rows = []
        for r in range(n):
            if r == i:
                rows.append(tuple((1.0 if j == i else 0.0) - 2.0 * form[i][j] for j in range(n)))
            else:
                rows.append(tuple(1.0 if j == r else 0.0 for j in range(n)))
        mats.append(tuple(rows))
    return mats


def identity(n: int) -> Matrix:
    return tuple(tuple(1.0 if i == j else 0.0 for j in range(n)) for i in range(n))


def matmul(a: Matrix, b: Matrix) -> Matrix:
    n = len(a)
    return tuple(
        tuple(math.fsum(a[i][k] * b[k][j] for k in range(n)) for j in range(n))
        for i in range(n)
    )


class ReflectionRep:
    """The faithful representation of one Coxeter group, plus the key.

    Built once from a Coxeter matrix; `generators[i]` is σᵢ. `word_matrix`
    realizes a word (left-to-right, the renderer's convention), and `key`
    turns a matrix into the hashable identity that decides equality.
    """

    def __init__(self, coxeter_matrix: Sequence[Sequence[int]], *, tol_digits: int = DEFAULT_TOL_DIGITS):
        self.rank = len(coxeter_matrix)
        self.form = bilinear_form(coxeter_matrix)
        self.generators = reflection_matrices(self.form)
        self._digits = tol_digits

    def word_matrix(self, word: Sequence[int]) -> Matrix:
        """The matrix of a word: σ_{i_k}···σ_{i₀} (letter i₀ applied first)."""
        g = identity(self.rank)
        for i in word:
            g = matmul(self.generators[i], g)
        return g

    def key(self, matrix: Matrix) -> Key:
        """Quantize a matrix to its hashable identity (rounded, −0.0 → 0.0)."""
        d = self._digits
        return tuple(round(matrix[i][j], d) + 0.0 for i in range(self.rank) for j in range(self.rank))

    def key_of_word(self, word: Sequence[int]) -> Key:
        return self.key(self.word_matrix(word))
