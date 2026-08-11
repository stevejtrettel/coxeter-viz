"""Pins for Parabolic — a subset of generators as an object.

Increment 1 of docs/plan-diagrams-and-selection.md. Pure compute: no viz.
"""

import pytest

import coxeter_groups as cx
from coxeter_groups import CoxeterGroup

H3 = [[1, 2, 5], [2, 1, 3], [5, 3, 1]]   # (2,3,5) spherical, |W| = 120
A3 = [[1, 3, 2], [3, 1, 3], [2, 3, 1]]   # (2,3,3) = S4, |W| = 24
E2 = [[1, 3, 3], [3, 1, 3], [3, 3, 1]]   # (3,3,3) Euclidean — the affine boundary
H2 = [[1, 2, 7], [2, 1, 3], [7, 3, 1]]   # (2,3,7) hyperbolic


def dihedral(m):
    return [[1, m], [m, 1]]


# ── the subset itself ─────────────────────────────────────────────────────
def test_generators_are_sorted_and_deduped():
    g = CoxeterGroup(H3)
    assert g.parabolic([2, 0, 2]).generators == (0, 2)
    assert g.parabolic([]).generators == ()


def test_out_of_range_refuses():
    g = CoxeterGroup(H3)
    for bad in ([3], [-1]):
        with pytest.raises(ValueError, match="not in 0"):
            g.parabolic(bad)


def test_coxeter_matrix_is_the_principal_submatrix():
    g = CoxeterGroup(H3)
    assert g.parabolic([0, 2]).coxeter_matrix == [[1, 5], [5, 1]]
    assert g.parabolic([1]).coxeter_matrix == [[1]]
    assert g.parabolic([]).coxeter_matrix == []
    assert g.parabolic([0, 1, 2]).coxeter_matrix == H3


def test_equality_and_hashing_by_group_and_subset():
    g, h = CoxeterGroup(H3), CoxeterGroup(H3)
    assert g.parabolic([0, 1]) == g.parabolic([1, 0])
    assert g.parabolic([0, 1]) != g.parabolic([0, 2])
    assert g.parabolic([0, 1]) != h.parabolic([0, 1])  # a different group object
    assert len({g.parabolic([0, 1]), g.parabolic([1, 0])}) == 1


# ── finiteness = positive definiteness of the restricted Tits form ────────
def test_rank_two_parabolics_of_a_triangle_group_are_dihedral():
    """Every PAIR of generators generates a finite dihedral group whenever the
    entry is finite — regardless of the ambient group's geometry."""
    for M in (H3, A3, E2, H2):
        g = CoxeterGroup(M)
        for i, j in [(0, 1), (0, 2), (1, 2)]:
            p = g.parabolic([i, j])
            assert p.is_finite()
            assert p.order() == 2 * M[i][j]


def test_the_whole_group_is_finite_exactly_when_spherical():
    assert CoxeterGroup(H3).parabolic([0, 1, 2]).is_finite()
    assert CoxeterGroup(A3).parabolic([0, 1, 2]).is_finite()
    assert not CoxeterGroup(E2).parabolic([0, 1, 2]).is_finite()   # affine: pivot is truly 0
    assert not CoxeterGroup(H2).parabolic([0, 1, 2]).is_finite()


def test_empty_and_singleton_subsets():
    g = CoxeterGroup(H2)
    empty = g.parabolic([])
    assert empty.is_finite() and empty.order() == 1 and empty.rank == 0
    for i in range(3):
        p = g.parabolic([i])
        assert p.is_finite() and p.order() == 2   # ⟨s⟩ ≅ Z/2


def test_infinite_pairs_are_infinite():
    """An ∞ entry: the walls never meet, so W_S is infinite (order refuses)."""
    g = CoxeterGroup.from_polygon([2, 2, 2, 2, 2])  # right-angled pentagon
    assert g.coxeter_matrix[0][2] == -1             # non-adjacent walls: ∞
    p = g.parabolic([0, 2])
    assert not p.is_finite()
    with pytest.raises(ValueError, match="infinite"):
        p.order()
    assert g.parabolic([0, 1]).is_finite()          # adjacent: m = 2


def test_large_dihedral_stays_finite_under_the_pivot_tolerance():
    """I2(m)'s smallest pivot is sin^2(pi/m); the README claims correctness to
    m ~ 1e6. Pin a large m (is_finite only — enumerating 2m is not the point)."""
    for m in (1000, 100_000):
        assert CoxeterGroup(dihedral(m)).parabolic([0, 1]).is_finite()
    assert not CoxeterGroup(dihedral(-1)).parabolic([0, 1]).is_finite()  # m = ∞


# ── order ─────────────────────────────────────────────────────────────────
def test_orders_of_the_finite_coxeter_groups():
    assert CoxeterGroup(H3).parabolic([0, 1, 2]).order() == 120   # H3
    assert CoxeterGroup(A3).parabolic([0, 1, 2]).order() == 24    # A3 = S4
    assert CoxeterGroup(dihedral(6)).parabolic([0, 1]).order() == 12


def test_order_refuses_when_infinite():
    with pytest.raises(ValueError, match="infinite"):
        CoxeterGroup(E2).parabolic([0, 1, 2]).order()


# ── the theorem: M_S really presents W_S ──────────────────────────────────
def test_the_submatrix_presents_the_subgroup():
    """W_S is itself a Coxeter group with matrix M_S (Bourbaki) — so the group
    built from the submatrix has the same order as the subgroup it names."""
    g = CoxeterGroup(H3)
    for S in ([0, 1], [0, 2], [1, 2], [0, 1, 2], [1]):
        p = g.parabolic(S)
        standalone = CoxeterGroup(p.coxeter_matrix)
        assert standalone.parabolic(range(standalone.rank)).order() == p.order()


def test_the_empty_subset_has_no_standalone_group():
    """S = ∅ is a legitimate selection (the schema's `cosets` allows it) and
    Parabolic handles it — but CoxeterGroup deliberately refuses rank 0, so
    the empty parabolic has no standalone presentation. A pinned asymmetry."""
    empty = CoxeterGroup(H3).parabolic([])
    assert empty.coxeter_matrix == [] and empty.order() == 1
    with pytest.raises(ValueError, match="at least one generator"):
        CoxeterGroup(empty.coxeter_matrix)


def test_parabolic_is_exported_at_the_top_level():
    assert cx.Parabolic is not None
    assert isinstance(CoxeterGroup(H3).parabolic([0]), cx.Parabolic)


# ── the selection as a drawing handoff ────────────────────────────────────
def test_elements_enumerates_W_S():
    g = CoxeterGroup(H2)
    assert len(g.parabolic([1, 2]).elements()) == 6   # dihedral, m(1,2) = 3
    assert len(g.parabolic([0, 2]).elements()) == 14  # m(0,2) = 7
    assert len(g.parabolic([]).elements()) == 1
    with pytest.raises(ValueError, match="infinite"):
        g.parabolic([0, 1, 2]).elements()


def test_color_is_an_inert_annotation():
    """compute never interprets it; it is plain data riding across the seam."""
    g = CoxeterGroup(H2)
    p = g.parabolic([0, 1], color="#123456")
    assert p.color == "#123456"
    assert g.parabolic([0, 1]).color is None
    assert p == g.parabolic([0, 1])  # identity is the SUBSET, not the color
