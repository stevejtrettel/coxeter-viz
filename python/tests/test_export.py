"""P8 integration tests: the headless engine driver. Skipped wholesale when
Playwright (the [export] extra) is absent; requires `playwright install
chromium` to have run once."""

import struct

import pytest

pytest.importorskip("playwright.sync_api")

import coxeter_viz as cx  # noqa: E402

M237 = [[1, 2, 7], [2, 1, 3], [7, 3, 1]]
IDEAL = [[1, 2, -1], [2, 1, 3], [-1, 3, 1]]  # an open chain — the engine refuses


def tiling() -> cx.Figure:
    return cx.figure(M237).tessellation(ball=4.0, color="parity").walls(width=0.05)


def png_dimensions(data: bytes) -> tuple[int, int]:
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    w, h = struct.unpack(">II", data[16:24])
    return w, h


def test_save_svg(tmp_path):
    out = tiling().save(tmp_path / "237.svg")
    svg = out.read_text(encoding="utf-8")
    assert svg.startswith("<svg")
    assert 'data-id="wall:0"' in svg
    assert 'data-id="tile:e"' in svg


def test_save_png_at_scale(tmp_path):
    out = tiling().save(tmp_path / "237.png", scale=2, size=400)
    w, h = png_dimensions(out.read_bytes())
    assert (w, h) == (800, 800)  # the CAMERA is scaled: 400 px frame at 2×


def test_png_background_option(tmp_path):
    out = tiling().save(tmp_path / "white.png", scale=1, size=200, background="#ffffff")
    assert png_dimensions(out.read_bytes()) == (200, 200)


def test_svg_refuses_scale():
    with pytest.raises(TypeError, match="vector"):
        tiling().save("x.svg", scale=4)


def test_refusal_raises_with_reasons(tmp_path):
    fig = cx.figure(IDEAL).tessellation()
    with pytest.raises(cx.CoxeterVizError, match="non-compact") as info:
        fig.save(tmp_path / "nope.svg")
    assert info.value.problems  # the structured reasons ride along


def test_check():
    tiling().check()  # fine
    with pytest.raises(cx.CoxeterVizError, match="open chain"):
        cx.figure(IDEAL).tessellation().check()
