"""save('.png' / '.svg') and check(): the headless engine driver (P8).

Drives the vendored bundle's ``window.coxeterViz`` global in headless
Chromium via Playwright — the same code paths as the live page and the
repo's pixel-coincidence tests. Ships as the OPTIONAL extra so HTML-only
users never download a browser.

P7a stub: the functions exist and explain the install; the implementation
is increment P8 (PLAN §7.8).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

_INSTALL_HINT = (
    "PNG/SVG export runs the engine in headless Chromium. Install the extra:\n"
    "    pip install 'coxeter-viz[export]'\n"
    "    playwright install chromium"
)


def _require_playwright() -> Any:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        from .figure import CoxeterVizError

        raise CoxeterVizError(_INSTALL_HINT) from None
    return sync_playwright


def save(document: dict[str, Any], path: Path, suffix: str, **options: Any) -> None:
    _require_playwright()
    raise NotImplementedError("save('.png'/'.svg') is increment P8 — landing next.")


def check(document: dict[str, Any]) -> None:
    _require_playwright()
    raise NotImplementedError("check() is increment P8 — landing next.")
