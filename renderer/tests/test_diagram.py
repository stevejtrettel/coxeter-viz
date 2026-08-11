

# ── highlighting a selection ──────────────────────────────────────────────
def test_highlight_rides_the_document_from_a_parabolic():
    g = cx.CoxeterGroup(T237)
    sel = g.parabolic([1, 2], color="#123456")
    layer = cx.diagram(g, highlight=sel).document()["layers"][0]
    assert layer["highlight"] == {"generators": [1, 2], "color": "#123456"}
    # a bare list of indices works too (duck-typed, no color)
    assert cx.diagram(g, highlight=[0, 1]).document()["layers"][0]["highlight"] == {
        "generators": [0, 1]
    }
    assert "highlight" not in cx.diagram(g).document()["layers"][0]


def test_highlight_on_tessellation_and_cayley():
    g = cx.CoxeterGroup(T237)
    sel = g.parabolic([1, 2], color="#123456")
    doc = cx.figure(g).tessellation(ball=2.0, highlight=sel).cayley(ball=2.0, highlight=sel).document()
    for layer in doc["layers"]:
        assert layer["highlight"] == {"generators": [1, 2], "color": "#123456"}


def test_the_same_selection_draws_in_all_three(tmp_path):
    """One selection, three pictures — the point of the feature."""
    _playwright()
    g = cx.CoxeterGroup.from_polygon([2, 3, 7])
    sel = g.parabolic([1, 2], color="#123456")
    d = cx.diagram(g, style="artin", highlight=sel).save(tmp_path / "d.svg").read_text()
    assert d.count("#123456") >= 3  # the edge 1-2, and a ring on each of nodes 1, 2
    for fig in (
        cx.figure(g).tessellation(ball=2.0, highlight=sel),
        cx.figure(g).tessellation(ball=2.0).cayley(ball=2.0, highlight=sel),
    ):
        assert "#123456" in fig.save(tmp_path / "f.svg").read_text()


def test_an_infinite_parabolic_is_refused_by_the_geometry_but_not_the_diagram(tmp_path):
    """Diagram-highlightable is strictly wider than tiling-highlightable."""
    _playwright()
    pent = cx.CoxeterGroup.from_polygon([2, 2, 2, 2, 2])
    infinite = pent.parabolic([0, 2])
    assert not infinite.is_finite()
    # the diagram needs no geometry, so it draws the selection happily
    cx.diagram(pent, highlight=infinite).save(tmp_path / "d.svg")
    # the tiling refuses, naming the reason
    with pytest.raises(cx.CoxeterVizError, match="infinite"):
        cx.figure(pent).tessellation(ball=2.0, highlight=infinite).check()
