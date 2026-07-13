"""Pins for the reflection representation and the element key (PLAN §12.2).

The key must decide the word problem: equal words -> equal key, distinct
elements -> distinct keys. We check the defining relations hold in the
matrices (faithfulness sanity) and that BFS-by-key recovers known finite
group orders (the key neither merges distinct elements nor splits equal
ones).
"""

import pytest

from coxeter_groups.compute.rep import ReflectionRep, identity, matmul


def _id_key(rep: ReflectionRep):
    return rep.key(identity(rep.rank))


# ── the defining relations hold in the matrices ──────────────────────────

@pytest.mark.parametrize(
    "M",
    [
        [[1, 3], [3, 1]],
        [[1, 2, 5], [2, 1, 3], [5, 3, 1]],  # (2,3,5) = H3
        [[1, 4, 2], [4, 1, 3], [2, 3, 1]],
        [[1, -1], [-1, 1]],  # an ∞ bond builds without error
    ],
)
def test_generators_are_involutions(M):
    rep = ReflectionRep(M)
    for i in range(rep.rank):
        assert rep.key_of_word([i, i]) == _id_key(rep)      # sᵢ² = e
        assert rep.key_of_word([i]) != _id_key(rep)         # ...but sᵢ ≠ e


def test_order_relations():
    # (sᵢsⱼ) has order exactly m_ij: the m-th power is e, lower powers are not.
    M = [[1, 2, 5], [2, 1, 3], [5, 3, 1]]
    rep = ReflectionRep(M)
    for i, j, m in [(0, 1, 2), (1, 2, 3), (0, 2, 5)]:
        for k in range(1, m):
            assert rep.key_of_word([i, j] * k) != _id_key(rep)
        assert rep.key_of_word([i, j] * m) == _id_key(rep)


def test_distinct_generators_distinct_keys():
    rep = ReflectionRep([[1, 3, 2], [3, 1, 3], [2, 3, 1]])
    keys = {rep.key_of_word([i]) for i in range(3)}
    assert len(keys) == 3


# ── BFS-by-key recovers known finite group orders ────────────────────────

def _group_order(M, cap=200_000):
    """|W| by breadth-first closure under left multiplication, deduped by key."""
    rep = ReflectionRep(M)
    start = identity(rep.rank)
    seen = {rep.key(start)}
    frontier = [start]
    while frontier:
        nxt = []
        for g in frontier:
            for s in rep.generators:
                h = matmul(s, g)
                k = rep.key(h)
                if k not in seen:
                    seen.add(k)
                    nxt.append(h)
                    if len(seen) > cap:
                        raise AssertionError("did not terminate — is the group infinite?")
        frontier = nxt
    return len(seen)


@pytest.mark.parametrize("m,order", [(2, 4), (3, 6), (4, 8), (5, 10), (6, 12)])
def test_dihedral_orders(m, order):
    # rank-2 group ⟨s₀,s₁ | (s₀s₁)^m⟩ is dihedral of order 2m.
    assert _group_order([[1, m], [m, 1]]) == order


@pytest.mark.parametrize(
    "M,order",
    [
        ([[1, 2, 3], [2, 1, 3], [3, 3, 1]], 24),   # (2,3,3) tetrahedral = A3 = S4
        ([[1, 2, 4], [2, 1, 3], [4, 3, 1]], 48),   # (2,3,4) octahedral = B3
        ([[1, 2, 5], [2, 1, 3], [5, 3, 1]], 120),  # (2,3,5) icosahedral = H3
    ],
)
def test_finite_triangle_group_orders(M, order):
    assert _group_order(M) == order
