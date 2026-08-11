"""Pins for cx.diagram — the Coxeter / Artin diagram of the abstract group.

Increment 2–3 of docs/plan-diagrams-and-selection.md. The document-level tests
run everywhere; the ones that actually render are gated on the [export] extra.
"""

import struct

import pytest

import coxeter_groups as cx

T237 = [[1, 2, 7], [2, 1, 3], [7, 3, 1]]
#: rank 4, every order finite — `cx.figure` refuses this as `not-2d`.
B4 = [[1, 4, 2, 2], [4, 1, 3, 2], [2, 3, 1, 3], [2, 2, 3, 1]]


# ── the document ──────────────────────────────────────────────────────────
def test_one_diagram_layer_carrying_the_style():
    doc = cx.diagram(T237, style="artin").document()
    assert doc["layers"] == [{"type": "diagram", "style": "artin"}]
    assert doc["version"] == "0.1"
    assert cx.diagram(T237).document()["layers"][0]["style"] == "coxeter"  # the default


def test_presentations_are_told_apart_by_nesting():
    """A Coxeter-matrix row is a list; a polygon vertex order is an int."""
    assert cx.diagram(T237).document()["group"] == {"coxeterMatrix": T237}
    assert cx.diagram([2, 3, 7]).document()["group"] == {"polygon": [2, 3, 7]}


def test_accepts_a_compute_group_through_the_duck_typed_seam():
    g = cx.CoxeterGroup.from_polygon([2, 3, 7])
    assert cx.diagram(g).document()["group"] == {"coxeterMatrix": g.coxeter_matrix}


def test_refuses_a_non_group():
    for bad in (7, [], "237"):
        with pytest.raises(TypeError):
            cx.diagram(bad)


def test_title_rides_along():
    assert cx.diagram(T237, title="the (2,3,7) group").document()["title"] == "the (2,3,7) group"


def test_exported_at_the_top_level():
    assert cx.diagram is cx.viz.diagram


# ── html is not a diagram output (yet) ────────────────────────────────────
def test_html_refuses_with_a_reason(tmp_path):
    fig = cx.diagram(T237)
    with pytest.raises(cx.CoxeterVizError, match="no .html yet"):
        fig.save(tmp_path / "d.html")
    with pytest.raises(cx.CoxeterVizError, match="no .html yet"):
        fig.show()


def test_an_ordinary_figure_still_saves_html(tmp_path):
    p = cx.figure(T237).tessellation(ball=3.0).save(tmp_path / "t.html")
    assert p.exists() and p.read_text().startswith("<!")


# ── rendering (needs the [export] extra) ──────────────────────────────────
def _playwright() -> None:
    """Skip a rendering test when the optional export extra is absent."""
    pytest.importorskip("playwright.sync_api")


def test_svg_draws_a_group_that_cx_figure_refuses(tmp_path):
    """The load-bearing property: a diagram needs no realization."""
    _playwright()
    with pytest.raises(cx.CoxeterVizError, match="not-2d"):
        cx.figure(B4).walls().check()
    svg = cx.diagram(B4, style="artin").save(tmp_path / "b4.svg").read_text()
    assert svg.count("<line ") == 6  # every pair of 4 walls
    assert svg.count("<circle ") == 4


def test_the_pentagon_and_the_pentagram(tmp_path):
    """The two conventions are complementary: artin draws the right-angled
    pentagon, coxeter draws the pentagram (its ∞ pairs), dashed."""
    _playwright()
    artin = cx.diagram([2, 2, 2, 2, 2], style="artin").save(tmp_path / "a.svg").read_text()
    coxeter = cx.diagram([2, 2, 2, 2, 2], style="coxeter").save(tmp_path / "c.svg").read_text()
    assert artin.count("<line ") == coxeter.count("<line ") == 5
    assert artin.count("stroke-dasharray") == 0 and artin.count("<text ") == 5
    assert coxeter.count("stroke-dasharray") == 5 and coxeter.count("<text ") == 0


def test_png_renders_at_scale(tmp_path):
    _playwright()
    p = cx.diagram(T237).save(tmp_path / "d.png", scale=2, size=300)
    data = p.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    assert struct.unpack(">II", data[16:24]) == (600, 600)


def test_a_bad_style_is_the_engines_refusal(tmp_path):
    _playwright()
    with pytest.raises(cx.CoxeterVizError, match="diagram style"):
        cx.diagram(T237, style="dynkin").check()


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
