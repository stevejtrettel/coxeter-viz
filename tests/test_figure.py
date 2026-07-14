"""The cross-language pin (PLAN §7.8): the Python builder reproduces every
fixture document EXACTLY — the same JSONs the engine's own tests consume —
so the two languages cannot drift on the contract."""

import json
from pathlib import Path

import pytest

import coxeter_groups as cx

# The cross-language fixtures live with the renderer's own tests (the same
# JSONs the TS engine consumes): repo/renderer/tests/fixtures/figures.
FIXTURES = Path(__file__).resolve().parents[1] / "renderer" / "tests" / "fixtures" / "figures"

M237 = [[1, 2, 7], [2, 1, 3], [7, 3, 1]]
PENTAGON = [
    [1, 2, -1, -1, 2],
    [2, 1, 2, -1, -1],
    [-1, 2, 1, 2, -1],
    [-1, -1, 2, 1, 2],
    [2, -1, -1, 2, 1],
]


def fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_domain_walls_fixture():
    fig = cx.figure(M237).domain(fill="#f8f8f4").walls(width=0.05)
    assert fig.document() == fixture("domain-walls.json")


def test_tessellation_fixture():
    fig = cx.figure(M237).tessellation(ball=4.0, color="parity", opacity=0.9).walls(width=0.05)
    assert fig.document() == fixture("tessellation.json")


def test_cayley_fixture():
    fig = (
        cx.figure([[1, 2, 4], [2, 1, 4], [4, 4, 1]])
        .tessellation(ball=8.0, color="parity", opacity=0.35)
        .cayley(ball=8.0, node_size=0.11, edge_width=0.06)
    )
    assert fig.document() == fixture("cayley.json")


def test_tiles_hull_fixture():
    fig = (
        cx.figure(M237, model="poincare")
        .tessellation(depth=10, color="parity", opacity=0.3)
        .tiles([[], [0], [0, 1], [1, 2, 1]], fill="#d03030")
        .hull([[], [1], [2], [1, 2], [2, 1], [1, 2, 1]], fill="#3060d0", stroke="#103080")
    )
    assert fig.document() == fixture("tiles-hull.json")


def test_cosets_fixture():
    fig = cx.figure(PENTAGON).cosets([1, 2], ball=4.0).walls(width=0.04)
    assert fig.document() == fixture("cosets-pentagon.json")


def test_uniform_fixture():
    fig = (
        cx.figure([[1, 2, 5], [2, 1, 3], [5, 3, 1]])
        .uniform([0])
        .walls(width=0.03, colors=["#c03030", "#30a030", "#3030c0"])
    )
    assert fig.document() == fixture("uniform.json")


def test_polygon_hexagon_fixture():
    fig = cx.polygon([2, 3, 2, 6, 4, 5]).tessellation(ball=4.0, color="hue", opacity=0.85).walls(width=0.05)
    assert fig.document() == fixture("polygon-hexagon.json")


def test_every_fixture_is_pinned_above():
    covered = {
        "domain-walls.json",
        "tessellation.json",
        "cayley.json",
        "tiles-hull.json",
        "cosets-pentagon.json",
        "uniform.json",
        "polygon-hexagon.json",
    }
    on_disk = {p.name for p in FIXTURES.glob("*.json")}
    assert on_disk == covered, "a fixture exists without a cross-language pin (add a test)"


# ── builder conventions ─────────────────────────────────────────────────


def test_title_and_chaining():
    fig = cx.figure(M237, title="my tiling")
    assert fig.tessellation() is fig  # chainable
    doc = fig.document()
    assert doc["title"] == "my tiling"
    assert doc["layers"] == [{"type": "tessellation"}]  # omitted extent stays omitted


def test_ball_xor_depth():
    with pytest.raises(TypeError, match="not both"):
        cx.figure(M237).tessellation(ball=4.0, depth=10)


def test_indices_are_exact_integers():
    with pytest.raises(TypeError):
        cx.figure(M237).tiles([[0.5]])
    with pytest.raises(TypeError):
        cx.figure([[1.0, 2.5], [2.5, 1.0]])
    with pytest.raises(TypeError):
        cx.polygon([2.0, 3.5, 7.0])


def test_polygon_carries_the_list_verbatim():
    doc = cx.polygon([2, 3, 2, 6, 4, 5], title="hexagon").document()
    assert doc["group"] == {"polygon": [2, 3, 2, 6, 4, 5]}
    assert doc["title"] == "hexagon"


def test_tessellation_edges():
    # edges=True with no options → the defaulted empty object
    doc = cx.figure(M237).tessellation(edges=True).document()
    assert doc["layers"][0]["edges"] == {}
    # edge_width / edge_colors imply edges even without edges=True
    doc = cx.figure(M237).tessellation(edge_width=0.03, edge_colors=["#111", "#222", "#333"]).document()
    assert doc["layers"][0]["edges"] == {"width": 0.03, "colors": ["#111", "#222", "#333"]}
    # omitted by default
    assert "edges" not in cx.figure(M237).tessellation().document()["layers"][0]


def test_constant_color_vs_map():
    doc = cx.figure(M237).tessellation(color="#abcdef").tessellation(color="hue").document()
    assert doc["layers"][0]["color"] == {"constant": "#abcdef"}
    assert doc["layers"][1]["color"] == {"map": "hue"}


def test_document_is_a_copy():
    fig = cx.figure(M237).walls()
    doc = fig.document()
    doc["layers"].append({"type": "domain"})
    assert fig.document()["layers"] == [{"type": "walls"}]


def test_unknown_save_format():
    with pytest.raises(ValueError, match="unknown output format"):
        cx.figure(M237).save("x.pdf")


# ── views: background + swappable figure-descriptions (PLAN §13) ─────────


def test_views_document_structure():
    fig = cx.figure(M237, model="poincare")
    fig.tessellation(ball=4.0, color="parity")            # the background
    fig.view("words").tiles([[0, 1]], fill="#d15954")
    fig.view("inverses").tiles([[1, 0]], fill="#2f6fb7")
    doc = fig.document()
    assert doc["version"] == "0.2"                         # views ⇒ v0.2
    assert doc["layers"] == [
        {"type": "tessellation", "extent": {"ball": 4.0}, "color": {"map": "parity"}}
    ]
    assert doc["views"] == [
        {"name": "words", "layers": [{"type": "tiles", "words": [[0, 1]], "fill": "#d15954"}]},
        {"name": "inverses", "layers": [{"type": "tiles", "words": [[1, 0]], "fill": "#2f6fb7"}]},
    ]


def test_no_views_stays_v01():
    doc = cx.figure(M237).tessellation().document()
    assert doc["version"] == "0.1"
    assert "views" not in doc


def test_view_ops_chain_into_the_view():
    fig = cx.figure(M237)
    v = fig.view("v")
    assert v.tiles([[0]]).walls() is v          # view ops return the view
    assert fig.tessellation() is fig            # figure ops return the figure
    doc = fig.document()
    assert doc["layers"] == [{"type": "tessellation"}]                       # background
    assert doc["views"][0]["layers"] == [{"type": "tiles", "words": [[0]]}, {"type": "walls"}]


def test_view_name_must_be_nonempty_string():
    with pytest.raises(TypeError):
        cx.figure(M237).view("")


def test_views_chain_fluently():
    fig = (
        cx.figure(M237)
        .tessellation()
        .view("a").tiles([[0]])
        .view("b").tiles([[1]])
        .figure
    )
    doc = fig.document()
    assert [v["name"] for v in doc["views"]] == ["a", "b"]
    assert doc["layers"] == [{"type": "tessellation"}]  # background from the figure op
    assert doc["views"][0]["layers"] == [{"type": "tiles", "words": [[0]]}]
    assert doc["views"][1]["layers"] == [{"type": "tiles", "words": [[1]]}]
