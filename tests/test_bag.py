"""Pins for Bag: the algebra, set-ops, and the end-to-end draw (PLAN §12.3, §12.5)."""

from functools import reduce

import coxeter_groups as cx
from coxeter_groups import CoxeterGroup
from coxeter_groups.viz import _html

S3 = [[1, 3], [3, 1]]
A3 = [[1, 3, 2], [3, 1, 3], [2, 3, 1]]   # S4, diameter 6


def test_bag_dedups_by_element():
    g = CoxeterGroup(S3)
    bag = g.bag([[0, 0], [], [0, 1, 0], [1, 0, 1]])  # s0²=e, and the braid
    assert len(bag) == 2                              # {e, w0}
    assert g.identity() in bag
    assert [0, 1, 0] in bag                           # membership by word
    assert [1] not in bag


def test_invert_is_an_involution():
    g = CoxeterGroup(A3)
    bag = g.bag([[0, 1], [0, 1, 2], [2, 1, 0]])
    inv = bag.invert()
    assert len(inv) == len(bag)
    assert set(inv) == {e.inverse() for e in bag}
    assert bag.invert().invert() == bag


def test_shift_is_a_bijection():
    g = CoxeterGroup(A3)
    assert g.bag([[]]).shift([0, 1]) == g.bag([[0, 1]])
    bag = g.ball(1)                                   # {e, s0, s1, s2}
    shifted = bag.shift([0])
    assert len(shifted) == len(bag)
    assert set(shifted) == {e * g.element([0]) for e in bag}


def test_set_ops():
    g = CoxeterGroup(A3)
    b3, b2 = g.ball(3), g.ball(2)
    assert b3 - b2 == g.sphere(3)                     # ball(3) − ball(2) = sphere(3)
    assert (b2 & b3) == b2                            # b2 ⊆ b3
    assert (b2 | g.sphere(3)) == b3
    spheres = [g.sphere(k) for k in range(7)]         # A3 diameter 6
    assert reduce(lambda a, b: a | b, spheres) == g.ball(6)


def test_words_is_plain_and_deterministic():
    g = CoxeterGroup(S3)
    ws = g.bag([[1, 0, 1], [0], []]).words()
    assert ws == sorted(ws, key=lambda w: (len(w), w))
    assert all(isinstance(w, list) and all(isinstance(i, int) for i in w) for w in ws)


def test_end_to_end_draw_through_viz():
    g = CoxeterGroup(A3)
    bag = g.ball(2)
    fig = cx.figure(g).tessellation().tiles(bag.words())
    doc = fig.document()
    (tiles,) = [L for L in doc["layers"] if L["type"] == "tiles"]
    assert tiles["words"] == bag.words()             # the seam: bag → figure document
    html = _html.page(doc)                            # the dumb renderer builds the page
    assert "coxeterViz" in html and len(html) > 1000
