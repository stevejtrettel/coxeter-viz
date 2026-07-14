"""Pins for CoxeterGroup / Element and the figure(g) bridge (PLAN §12.3, §12.5)."""

import pytest

import coxeter_groups as cx
from coxeter_groups import CoxeterGroup

S3 = [[1, 3], [3, 1]]                    # dihedral order 6 = S3
H3 = [[1, 2, 5], [2, 1, 3], [5, 3, 1]]   # (2,3,5)
A3 = [[1, 3, 2], [3, 1, 3], [2, 3, 1]]   # (2,3,3) = S4


def test_multiplication_is_concatenation():
    g = CoxeterGroup(A3)
    for u, v in [([0], [1]), ([0, 1], [2, 1]), ([], [1, 0, 2]), ([2, 0, 1], [])]:
        assert g.element(u) * g.element(v) == g.element(u + v)


def test_generators_are_involutions():
    g = CoxeterGroup(A3)
    e = g.identity()
    for s in g.generators:
        assert s * s == e
        assert s != e


def test_inverse():
    g = CoxeterGroup(H3)
    e = g.identity()
    a, b = g.element([0, 1, 2, 1]), g.element([2, 0, 1])
    assert a * a.inverse() == e
    assert a.inverse() * a == e
    assert (a * b).inverse() == b.inverse() * a.inverse()


def test_hash_dedup_by_element_not_spelling():
    g = CoxeterGroup(S3)
    assert g.element([0, 0]) == g.identity()          # s0² = e
    assert g.element([0, 1, 0]) == g.element([1, 0, 1])  # braid
    assert g.element([0, 1, 0, 1]) == g.element([1, 0])  # (s0s1)² = (s0s1)⁻¹
    # a set collapses all spellings of one element
    assert len({g.element([0, 0]), g.identity(), g.element([1, 1])}) == 1
    assert len({g.element([0, 1, 0]), g.element([1, 0, 1])}) == 1


def test_length():
    g = CoxeterGroup(S3)
    assert len(g.identity()) == 0
    assert all(len(s) == 1 for s in g.generators)
    assert len(g.element([0, 0])) == 0        # reduces to e
    assert len(g.element([0, 1, 0])) == 3     # the longest element of S3
    assert len(g.element([0, 1, 0, 1])) == 2  # = s1s0, length 2


def test_descents():
    g = CoxeterGroup(S3)
    assert g.identity().descents() == frozenset()
    assert g.element([0]).descents() == frozenset({0})
    assert g.element([1]).descents() == frozenset({1})
    assert g.element([0, 1, 0]).descents() == frozenset({0, 1})  # w0: full descent set


def test_index_and_matrix_validation():
    g = CoxeterGroup(S3)
    with pytest.raises(ValueError):
        g.element([2])                       # generator out of range
    with pytest.raises(ValueError):
        CoxeterGroup([[1, 2], [3, 1]])       # not symmetric
    with pytest.raises(ValueError):
        CoxeterGroup([[2, 3], [3, 1]])       # diagonal ≠ 1
    with pytest.raises(ValueError):
        CoxeterGroup([[1, 1], [1, 1]])       # off-diagonal < 2


def test_from_polygon():
    # a triangle polygon = the (2,3,7) triangle group
    assert CoxeterGroup.from_polygon([2, 3, 7]).coxeter_matrix == [[1, 2, 7], [2, 1, 3], [7, 3, 1]]
    # a hexagon: orders on the cyclic diagonal, ∞ (−1) for non-adjacent walls
    M = CoxeterGroup.from_polygon([2, 3, 2, 6, 4, 5]).coxeter_matrix
    assert M[0][1] == 2 and M[3][4] == 6 and M[5][0] == 5
    assert M[0][3] == -1 and M[1][4] == -1
    assert all(M[i][i] == 1 for i in range(6))
    # the polygon group is the group it expands to: [2,3,5] = H3, order 120
    assert len(CoxeterGroup.from_polygon([2, 3, 5]).ball(50)) == 120
    with pytest.raises(ValueError):
        CoxeterGroup.from_polygon([2, 3])  # a polygon has ≥ 3 sides


def test_figure_bridge_accepts_group():
    g = CoxeterGroup(A3)
    doc = cx.figure(g).tessellation().document()
    assert doc["group"] == {"coxeterMatrix": A3}
    # a raw matrix still works exactly as before
    assert cx.figure(A3).tessellation().document()["group"] == {"coxeterMatrix": A3}
