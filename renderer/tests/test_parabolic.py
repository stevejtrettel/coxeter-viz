

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
