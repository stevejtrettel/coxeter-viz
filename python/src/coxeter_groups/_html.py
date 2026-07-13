"""save('.html'): the three template replacements, mirroring the engine.

The vendored ``_static/template.html`` is the single source of truth for
the page; this module performs the SAME three replacements as the
TypeScript ``selfContainedHtml`` (src/app/html.ts) and the repo's
``scripts/make-samples.mjs``: the title text, the quoted figure token,
the bundle comment token. Every ``<`` in the JSON becomes ``\\u003c`` so
a hostile title can never break out of the script element. Python's
``str.replace`` has no ``$`` semantics, so the bundle text passes through
literally by construction (pinned by test anyway).
"""

from __future__ import annotations

import json
from importlib import resources
from typing import Any


def _static(name: str) -> str:
    ref = resources.files("coxeter_groups") / "_static" / name
    if not ref.is_file():
        from .figure import CoxeterVizError

        raise CoxeterVizError(
            f"the vendored engine file _static/{name} is missing — this is a development "
            "install without the bundle; run `npm run build:bundle` in the repo root."
        )
    return ref.read_text(encoding="utf-8")


def _escape_html(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def page(document: dict[str, Any]) -> str:
    """The self-contained HTML page: template + bundle + inlined figure JSON."""
    template = _static("template.html")
    viewer = _static("viewer.js")
    title = document.get("title") or "coxeter-groups"
    figure_json = json.dumps(document).replace("<", "\\u003c")
    return (
        template.replace("__COXETER_VIZ_TITLE__", _escape_html(title))
        .replace('"__COXETER_VIZ_FIGURE__"', figure_json)
        .replace("/*__COXETER_VIZ_BUNDLE__*/", viewer)
    )
