"""save('.png' / '.svg') and check(): the headless engine driver (P8).

Drives the vendored bundle's ``window.coxeterViz`` global in headless
Chromium via Playwright — the SAME code paths as the live page and the
repo's pixel-coincidence tests, so a Python-produced figure is
pixel-identical to the instrument by construction. Ships as the OPTIONAL
extra (``pip install "coxeter-groups[export]"``) so HTML-only users never
download a browser.

The browser is a lazy module-level singleton (closed at exit): a research
loop saving a hundred PNGs pays the ~second of launch once, not a hundred
times. The engine's refusals arrive as problem values and raise
``CoxeterVizError`` with every reason listed.
"""

from __future__ import annotations

import atexit
import base64
from pathlib import Path
from typing import Any

from . import _html
from .figure import CoxeterVizError

_INSTALL_HINT = (
    "PNG/SVG export runs the engine in headless Chromium. Install the extra:\n"
    "    pip install 'coxeter-groups[export]'\n"
    "    playwright install chromium"
)

_state: dict[str, Any] = {}


def _page() -> Any:
    """The lazy singleton: a headless page with the bundle loaded."""
    if "page" in _state:
        return _state["page"]
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise CoxeterVizError(_INSTALL_HINT) from None
    pw = sync_playwright().start()
    try:
        browser = pw.chromium.launch(headless=True)
    except Exception as e:
        pw.stop()
        raise CoxeterVizError(
            f"could not launch headless Chromium ({e}).\nIf the browser is not installed yet, run:\n"
            "    playwright install chromium"
        ) from None
    page = browser.new_page()
    page.set_content("<!doctype html><html><body></body></html>")
    # add_script_tag sets the JS as element TEXT — no HTML parsing of the bundle.
    page.add_script_tag(content=_html._static("viewer.js"))
    page.wait_for_function("() => typeof coxeterViz !== 'undefined'")
    _state.update(pw=pw, browser=browser, page=page)
    atexit.register(_close)
    return page


def _close() -> None:
    if "browser" in _state:
        _state["browser"].close()
        _state["pw"].stop()
        _state.clear()


def _raise_problems(problems: list[dict[str, str]]) -> None:
    lines = [f"{p.get('path') or '(document)'}: {p.get('problem', '')}" for p in problems]
    raise CoxeterVizError("the engine refused the figure:\n  " + "\n  ".join(lines), problems)


def _size_opt(size: Any) -> dict[str, int]:
    w, h = size if isinstance(size, (tuple, list)) else (size, size)
    return {"widthPx": int(w), "heightPx": int(h)}


def _svg(document: dict[str, Any], size: Any) -> str:
    result = _page().evaluate(
        "(a) => coxeterViz.figureToSvg(a.doc, a.opts)",
        {"doc": document, "opts": {"size": _size_opt(size)}},
    )
    if not result["ok"]:
        _raise_problems(result["problems"])
    return result["value"]


def _png(document: dict[str, Any], size: Any, scale: int, background: str | None) -> bytes:
    opts: dict[str, Any] = {"size": _size_opt(size)}
    if background is not None:
        opts["background"] = background
    result = _page().evaluate(
        """
        async (a) => {
          const r = await coxeterViz.figureToPng(a.doc, a.k, a.opts);
          if (!r.ok) return r;
          const dataUrl = await new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = () => reject(fr.error);
            fr.readAsDataURL(r.value);
          });
          return { ok: true, dataUrl };
        }
        """,
        {"doc": document, "k": scale, "opts": opts},
    )
    if not result["ok"]:
        _raise_problems(result["problems"])
    b64 = result["dataUrl"].split(",", 1)[1]
    return base64.b64decode(b64)


def save(
    document: dict[str, Any],
    path: Path,
    suffix: str,
    *,
    scale: int | None = None,
    background: str | None = None,
    size: Any = 800,
) -> None:
    """Write .svg (vector; no scale/background — honest at any size) or
    .png (shader-rendered at scale×; background default: transparent)."""
    if suffix == ".svg":
        if scale is not None or background is not None:
            raise TypeError("SVG export takes no scale/background (a vector is honest at any size)")
        path.write_text(_svg(document, size), encoding="utf-8")
        return
    path.write_bytes(_png(document, size, scale if scale is not None else 2, background))


def check(document: dict[str, Any]) -> None:
    """Validate against the engine; raises CoxeterVizError listing the problems.

    Runs the full pipeline (validation + realization) at a tiny frame, so
    runtime refusals (e.g. a spherical hull beyond a hemisphere) are
    caught too — not just document problems.
    """
    _svg(document, 64)
