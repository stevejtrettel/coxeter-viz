"""Pins for word-length enumeration: ball/sphere (PLAN §12.4).

Counts must match known facts — |W| for the ball, and the Mahonian /
Poincaré coefficients (number of elements per length) for the spheres.
"""

from coxeter_groups import CoxeterGroup

S3 = [[1, 3], [3, 1]]                    # dihedral order 6 = S3
I2_4 = [[1, 4], [4, 1]]                  # dihedral order 8
A3 = [[1, 3, 2], [3, 1, 3], [2, 3, 1]]   # (2,3,3) = S4
H3 = [[1, 2, 5], [2, 1, 3], [5, 3, 1]]   # (2,3,5), order 120


def _sphere_sizes(M, upto):
    g = CoxeterGroup(M)
    return [len(g.sphere(k)) for k in range(upto + 1)]


def test_sphere0_is_the_identity():
    for M in (S3, A3, H3):
        s0 = CoxeterGroup(M).sphere(0)
        assert len(s0) == 1
        (only,) = s0
        assert len(only) == 0


def test_sphere1_is_the_generators():
    s1 = CoxeterGroup(A3).sphere(1)
    assert {tuple(e.word) for e in s1} == {(0,), (1,), (2,)}
    assert all(len(e) == 1 for e in s1)


def test_ball_recovers_group_order():
    assert len(CoxeterGroup(S3).ball(50)) == 6
    assert len(CoxeterGroup(I2_4).ball(50)) == 8
    assert len(CoxeterGroup(A3).ball(50)) == 24
    assert len(CoxeterGroup(H3).ball(50)) == 120


def test_mahonian_sphere_sizes():
    # elements-by-length are the Mahonian numbers (inversion counts)
    assert _sphere_sizes(S3, 3) == [1, 2, 2, 1]
    assert _sphere_sizes(I2_4, 4) == [1, 2, 2, 2, 1]       # dihedral I2(4)
    assert _sphere_sizes(A3, 6) == [1, 3, 5, 6, 5, 3, 1]   # S4 by inversions


def test_h3_diameter_and_unique_longest():
    g = CoxeterGroup(H3)
    sizes = [len(g.sphere(k)) for k in range(20)]
    assert sum(sizes) == 120
    nonempty = [k for k, s in enumerate(sizes) if s]
    assert max(nonempty) == 15  # diameter = #(positive roots) of H3
    assert sizes[15] == 1       # the unique longest element


def test_ball_is_length_filtered_and_distinct():
    g = CoxeterGroup(A3)
    assert {len(e) for e in g.ball(2)} == {0, 1, 2}
    assert all(len(e) <= 3 for e in g.ball(3))
    b = g.ball(4)
    assert len(set(b)) == len(b)  # every element distinct (hashable, deduped)
