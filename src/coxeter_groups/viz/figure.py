"""The figure builder: one method per drawing op, each appending one dict.

Mirrors the figure-document schema (renderer/src/schema/README.md) exactly —
the cross-language tests pin the builder's output against the same fixture
documents the engine's tests use, so the two languages cannot drift. Python
does no mathematics and no semantic validation: structural coercion only
(`operator.index` for generator indices — numpy ints pass, floats refuse),
everything else is the engine's to judge.

A figure carries a shared **background** (its own layers) and optional named
**views** (`fig.view(name)`) — swappable figure-descriptions over that
background (PLAN §13). Views ⇒ document version "0.2"; else "0.1".
"""

from __future__ import annotations

import copy
import operator
import re
from pathlib import Path
from typing import Any, TypeVar

from . import _html


class CoxeterVizError(Exception):
    """A refusal from the engine (or a packaging fault), with its reasons."""

    def __init__(self, message: str, problems: list[dict[str, str]] | None = None):
        super().__init__(message)
        self.problems = problems or []


_COLOR_MAPS = ("parity", "hue")


def _indices(values: Any, what: str) -> list[int]:
    """Generator indices: exact-integer coercion (floats refuse loudly)."""
    try:
        return [operator.index(v) for v in values]
    except TypeError as e:
        raise TypeError(f"{what}: generator indices must be integers ({e})") from None


def _words(words: Any) -> list[list[int]]:
    return [_indices(w, "a word") for w in words]


def _extent(ball: float | None, depth: int | None) -> dict[str, Any] | None:
    if ball is not None and depth is not None:
        raise TypeError("give ball= (a metric radius) or depth= (a word length), not both")
    if ball is not None:
        return {"ball": ball}
    if depth is not None:
        return {"depth": operator.index(depth)}
    return None  # omitted = the engine covers the frame


def _color(color: str) -> dict[str, str]:
    """'parity' / 'hue' are the named maps; any other string is a constant."""
    return {"map": color} if color in _COLOR_MAPS else {"constant": color}


def _clean(layer: dict[str, Any]) -> dict[str, Any]:
    """Drop unset options — the document carries only what was said."""
    return {k: v for k, v in layer.items() if v is not None}


def figure(
    coxeter_matrix: Any,
    *,
    title: str | None = None,
    model: str | None = None,
) -> "Figure":
    """A new figure for the group presented by the Coxeter matrix.

    The matrix is the abstract group: symmetric, integer, diagonal 1,
    ``M[i][j]`` the order of ``s_i s_j``, with ``-1`` the sentinel for
    infinity. The geometry (spherical / Euclidean / hyperbolic) is
    inferred by the engine, never declared.

    Accepts either a raw matrix or a ``compute.CoxeterGroup`` (anything
    exposing a ``coxeter_matrix``) — the seam bridge (PLAN §12.5),
    duck-typed so ``viz`` never imports ``compute``.
    """
    source = getattr(coxeter_matrix, "coxeter_matrix", coxeter_matrix)
    matrix = [_indices(row, "a Coxeter-matrix row") for row in source]
    return Figure({"coxeterMatrix": matrix}, title=title, model=model)


def polygon(
    orders: Any,
    *,
    title: str | None = None,
    model: str | None = None,
) -> "Figure":
    """A new figure for the polygon with these vertex orders — the default
    way to specify a 2D group.

    ``orders`` lists the orders of consecutive generator pairs in cyclic
    order around the polygon: n entries = n generators = n walls, and
    entry ``k`` is the order of ``s_k s_{k+1 mod n}`` (the vertex where
    walls ``k`` and ``k+1`` meet has angle pi/m). Non-adjacent walls never
    meet. List position IS the generator index, verbatim — words, walls,
    and Cayley edges all use it.

    ``cx.polygon([2, 3, 2, 6, 4, 5])`` is the hyperbolic hexagon with
    right angles at vertices 0 and 2. The geometry is inferred by the
    engine, never declared.
    """
    return Figure({"polygon": _indices(orders, "polygon vertex orders")}, title=title, model=model)


_Self = TypeVar("_Self", bound="_LayerBuilder")


class _LayerBuilder:
    """The drawing ops, shared by the figure (its background) and each view.

    Each op appends one layer to ``self._layers`` and returns ``self`` so calls
    chain: the figure's ops add to the shared background; a view's ops add to
    that view (PLAN §13).
    """

    _layers: list[dict[str, Any]]

    def _add(self: _Self, layer: dict[str, Any]) -> _Self:
        self._layers.append(_clean(layer))
        return self

    def domain(self: _Self, *, fill: str | None = None) -> _Self:
        """The fundamental chamber."""
        return self._add({"type": "domain", "fill": fill})

    def walls(self: _Self, *, width: float | None = None, colors: list[str] | None = None) -> _Self:
        """The mirrors of the generators. width is intrinsic, × the inradius."""
        return self._add({"type": "walls", "width": width, "colors": colors})

    def tessellation(
        self: _Self,
        *,
        ball: float | None = None,
        depth: int | None = None,
        color: str | None = None,
        opacity: float | None = None,
        edges: bool = False,
        edge_width: float | None = None,
        edge_colors: list[str] | None = None,
    ) -> _Self:
        """The orbit of the chamber; one tile per element.

        color: 'parity' | 'hue' | any constant color string.

        Set ``edges=True`` (or pass ``edge_width`` / ``edge_colors``) to stroke
        the tiling's edges, colored by PANEL TYPE — the generator index each
        edge is a translated mirror of. ``edge_colors[i]`` is generator i's
        color (defaults to the house wall colors); ``edge_width`` is intrinsic,
        × the inradius.
        """
        edge = (
            _clean({"width": edge_width, "colors": edge_colors})
            if edges or edge_width is not None or edge_colors is not None
            else None
        )
        return self._add(
            {
                "type": "tessellation",
                "extent": _extent(ball, depth),
                "color": _color(color) if color is not None else None,
                "opacity": opacity,
                "edges": edge,
            }
        )

    def cayley(
        self: _Self,
        *,
        ball: float | None = None,
        depth: int | None = None,
        node_size: float | None = None,
        node_color: str | None = None,
        edge_width: float | None = None,
    ) -> _Self:
        """The Cayley graph: vertices at the incenter orbit, edges by generator."""
        node = _clean({"size": node_size, "color": node_color})
        edge = _clean({"width": edge_width})
        return self._add(
            {
                "type": "cayley",
                "extent": _extent(ball, depth),
                "node": node or None,
                "edge": edge or None,
            }
        )

    def tiles(self: _Self, words: Any, *, fill: str | None = None) -> _Self:
        """The tiles the word list names: word w ↦ THE TILE w·(chamber)."""
        return self._add({"type": "tiles", "words": _words(words), "fill": fill})

    def hull(self: _Self, words: Any, *, fill: str | None = None, stroke: str | None = None) -> _Self:
        """The convex hull of the words' base-point images (area reported by the engine)."""
        return self._add({"type": "hull", "words": _words(words), "fill": fill, "stroke": stroke})

    def cosets(
        self: _Self,
        subgroup: Any,
        *,
        ball: float | None = None,
        depth: int | None = None,
    ) -> _Self:
        """Left cosets of the parabolic on these generators, one color each.

        The coloring is the engine's shared hue law (CPU/SVG/GPU agree
        bit-exactly); the subgroup must admit a fixed anchor — empty, one
        generator, or a meeting pair — else the engine refuses with why.
        """
        return self._add(
            {
                "type": "cosets",
                "subgroup": _indices(subgroup, "subgroup"),
                "extent": _extent(ball, depth),
            }
        )

    def uniform(self: _Self, rings: Any, *, palette: list[str] | None = None) -> _Self:
        """The Wythoff uniform tiling of the ringed seed (triangle groups)."""
        return self._add({"type": "uniform", "rings": _indices(rings, "rings"), "palette": palette})


class View(_LayerBuilder):
    """One named figure-description over the background (PLAN §13): its ops add
    to this view, which the viewer swaps in with a toggle/dropdown."""

    def __init__(self, name: str):
        if not isinstance(name, str) or not name:
            raise TypeError("a view name is a non-empty string.")
        self.name = name
        self._layers: list[dict[str, Any]] = []


class Figure(_LayerBuilder):
    def __init__(self, group: dict[str, Any], *, title: str | None = None, model: str | None = None):
        self._group = group
        self._title = title
        self._model = model
        self._layers: list[dict[str, Any]] = []  # the background (shared by every view)
        self._views: list[View] = []

    def view(self, name: str) -> View:
        """A named, swappable figure-description over the background. Its ops
        add to the view, not the background; the viewer swaps between views
        (a toggle for 2, a dropdown for 3+) at a fixed camera."""
        v = View(name)
        self._views.append(v)
        return v

    # ── the document and the outputs ──────────────────────────────────────

    def document(self) -> dict[str, Any]:
        """The figure document (fresh each call) — the exact JSON the engine
        reads. version '0.2' iff there are views, else '0.1'."""
        doc: dict[str, Any] = {"version": "0.2" if self._views else "0.1"}
        if self._title is not None:
            doc["title"] = self._title
        doc["group"] = copy.deepcopy(self._group)
        if self._model is not None:
            doc["model"] = self._model
        doc["layers"] = copy.deepcopy(self._layers)
        if self._views:
            doc["views"] = [{"name": v.name, "layers": copy.deepcopy(v._layers)} for v in self._views]
        return doc

    def save(self, path: str | Path, **options: Any) -> Path | list[Path]:
        """Write the figure. The format is the extension:

        .html — a self-contained live illustration (no dependencies); with
                views, ONE interactive page whose toggle/dropdown swaps them.
        .png  — shader-rendered raster; options: scale (the k×, default 2),
                background (default: honestly transparent), size.  [export extra]
        .svg  — the exact vector picture; options: size.            [export extra]

        With views, .png/.svg write ONE FILE PER VIEW (``stem-<name>.ext``)
        and return the list of paths; otherwise a single file / one Path.
        """
        p = Path(path)
        suffix = p.suffix.lower()
        doc = self.document()
        if suffix == ".html":
            if options:
                raise TypeError(f"save('.html') takes no options; got {sorted(options)}")
            p.write_text(_html.page(doc), encoding="utf-8")
            return p
        if suffix in (".png", ".svg"):
            from . import _export  # deferred: needs the [export] extra

            if self._views:
                paths: list[Path] = []
                for i, v in enumerate(self._views):
                    safe = re.sub(r"[^a-z0-9]+", "-", v.name.lower()).strip("-") or f"view{i}"
                    vp = p.with_name(f"{p.stem}-{safe}{p.suffix}")
                    _export.save(doc, vp, suffix, view=i, **options)
                    paths.append(vp)
                return paths
            _export.save(doc, p, suffix, **options)
            return p
        raise ValueError(f"unknown output format {suffix!r}: use .html, .png, or .svg")

    def show(self) -> Path:
        """Open the live illustration in the default browser (a temp file).

        The quick development loop: describe, `.show()`, look — no file
        management. Returns the temp path (the OS cleans it eventually).
        """
        import tempfile
        import webbrowser

        with tempfile.NamedTemporaryFile(
            "w", suffix=".html", prefix="coxeter-groups-", delete=False, encoding="utf-8"
        ) as f:
            f.write(_html.page(self.document()))
        webbrowser.open(f"file://{f.name}")
        return Path(f.name)

    def check(self) -> None:
        """Validate against the engine (headless); raises CoxeterVizError on problems.

        Requires the [export] extra. save('.html') never needs this — a
        problematic document produces a page that displays its problems.
        """
        from . import _export

        _export.check(self.document())
