"""Mirrors of the engine's html.test.ts pins: the three replacements, the
escaping, the $-literalness — same guarantees, Python side."""

from pathlib import Path

import coxeter_viz as cx
from coxeter_viz import _html


def page_for(title: str | None = None) -> str:
    fig = cx.figure([[1, 2, 7], [2, 1, 3], [7, 3, 1]], title=title)
    fig.tessellation(ball=4.0, color="parity")
    return _html.page(fig.document())


def test_save_html_writes_the_instrument(tmp_path: Path):
    fig = cx.figure([[1, 2, 7], [2, 1, 3], [7, 3, 1]], title="the (2,3,7) tiling")
    out = fig.tessellation(ball=4.0).save(tmp_path / "237.html")
    html = out.read_text(encoding="utf-8")
    assert "<title>the (2,3,7) tiling</title>" in html
    assert '"coxeterMatrix"' in html
    assert "coxeterViz" in html  # the bundle is inlined
    for token in ("__COXETER_VIZ_TITLE__", "__COXETER_VIZ_FIGURE__", "__COXETER_VIZ_BUNDLE__"):
        assert token not in html


def test_hostile_title_cannot_break_out():
    html = page_for(title="</script><script>alert(1)//")
    # the JSON's < are <-escaped, the <title> entity-escaped: the only
    # </script> occurrences are the template's own two closes
    assert html.count("</script>") == 2
    assert "<script>alert" not in html


def test_dollar_stays_literal():
    html = page_for(title="a $& b $1 c")
    assert "a $& b $1 c" in html


def test_default_title():
    assert "<title>coxeter-viz</title>" in page_for()
