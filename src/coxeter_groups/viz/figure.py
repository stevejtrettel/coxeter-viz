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


_UNSET = object()  # "no default given" — distinct from any real default value

#: A diagram has no camera or interaction story yet, so there is no live page.
_DIAGRAM_HTML = (
    "a diagram figure has no .html yet (it has no camera to pan or zoom).\n"
    "Save it as .svg or .png, and compose it beside the tiling yourself."
)


class _Variable:
    """The marker for a field left as a *variable* — a hole that becomes a live
    INPUT in the ``.html`` explorer (and is filled back in with ``.specify``).

    Field-agnostic by design: it carries no type of its own; the site it is
    dropped into stamps its kind and coerces its default
    (``cx.polygon(cx.variable)`` → a hole of kind ``"polygon"``,
    ``tessellation(depth=cx.variable)`` → kind ``"depth"``). So the same marker
    generalizes to any field we open — the group, a depth, later a color.

    Use the bare singleton ``cx.variable`` for a blank hole, or CALL it to
    carry a starting value: ``cx.variable([2, 3, 7])`` — the value the input is
    prefilled with, and what a static export (or ``.specify()`` with no
    argument) draws.
    """

    __slots__ = ("default",)

    def __init__(self, default: Any = _UNSET):
        self.default = default

    def __call__(self, default: Any) -> "_Variable":
        """A variable carrying a default (the input's starting value)."""
        return _Variable(default)

    def __repr__(self) -> str:
        return "cx.variable" if self.default is _UNSET else f"cx.variable({self.default!r})"


#: The singleton variable marker (see :class:`_Variable`).
variable = _Variable()


def _hole(marker: _Variable, kind: str, coerce: Any) -> dict[str, Any]:
    """A variable field, as it lands in the document: ``{"variable": kind}``,
    plus a ``"default"`` (coerced by the site, exactly like a concrete value)
    when the marker carries one. ``kind`` names how the page renders/parses the
    input and how the value is rebuilt into the document (see the engine's
    ``app/inputs``)."""
    hole: dict[str, Any] = {"variable": kind}
    if marker.default is not _UNSET:
        hole["default"] = coerce(marker.default)
    return hole


def _indices(values: Any, what: str) -> list[int]:
    """Generator indices: exact-integer coercion (floats refuse loudly)."""
    try:
        return [operator.index(v) for v in values]
    except TypeError as e:
        raise TypeError(f"{what}: generator indices must be integers ({e})") from None


def _words(words: Any) -> list[list[int]]:
    return [_indices(w, "a word") for w in words]


def _wordlist(words: Any) -> list[list[int]]:
    """Accept a compute ``WordSet`` (anything exposing a callable ``words()``)
    or a raw word list — duck-typed, so ``viz`` never imports ``compute``."""
    if callable(getattr(words, "words", None)):
        words = words.words()
    return _words(words)


def _extent(ball: Any, depth: Any) -> dict[str, Any] | None:
    if ball is not None and depth is not None:
        raise TypeError("give ball= (a metric radius) or depth= (a word length), not both")
    if isinstance(ball, _Variable):
        raise TypeError("a variable ball isn't supported yet; make depth the variable instead")
    if ball is not None:
        return {"ball": ball}
    if isinstance(depth, _Variable):  # depth left open — a live word-length input
        return {"depth": _hole(depth, "depth", operator.index)}
    if depth is not None:
        return {"depth": operator.index(depth)}
    return None  # omitted = the engine covers the frame


def _has_variable(obj: Any) -> bool:
    """Does this structure contain a variable field anywhere? (A document is
    *parametric* — version '0.3' — iff so.)"""
    if isinstance(obj, dict):
        return "variable" in obj or any(_has_variable(v) for v in obj.values())
    if isinstance(obj, list):
        return any(_has_variable(v) for v in obj)
    return False


def _color(color: str) -> dict[str, str]:
    """'parity' / 'hue' are the named maps; any other string is a constant."""
    return {"map": color} if color in _COLOR_MAPS else {"constant": color}


def _highlight(selection: Any) -> dict[str, Any] | None:
    """A selection, as it lands in the document: ``{"generators": [...],
    "color"?}``. Duck-typed on ``generators`` (and an optional inert
    ``color``), so ``viz`` never imports ``compute`` — a ``Parabolic`` passes,
    and so does a bare list of generator indices."""
    if selection is None:
        return None
    gens = getattr(selection, "generators", selection)
    out: dict[str, Any] = {"generators": _indices(gens, "highlight generators")}
    color = getattr(selection, "color", None)
    if color is not None:
        out["color"] = color
    return out


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

    Pass ``cx.variable`` (optionally ``cx.variable([2, 3, 7])`` to carry a
    default) in place of the orders to leave the GROUP open — a hole that
    becomes a live input in the ``.html`` explorer, filled back in with
    :meth:`Figure.specify`.
    """
    if isinstance(orders, _Variable):
        hole = _hole(orders, "polygon", lambda v: _indices(v, "polygon vertex orders"))
        return Figure(hole, title=title, model=model)
    return Figure({"polygon": _indices(orders, "polygon vertex orders")}, title=title, model=model)


def diagram(
    group: Any,
    *,
    style: str = "coxeter",
    highlight: Any = None,
    title: str | None = None,
) -> "Figure":
    """A new figure for the **Coxeter or Artin diagram** of a group.

    The diagram is a pure function of the Coxeter matrix — nodes are the
    generators, edges carry the orders — so it needs no geometric
    realization, and it draws for groups ``cx.figure`` refuses (rank ≥ 4,
    free products, non-compact chambers).

    ``style`` picks the convention:

    ===========  =============================  ============================
    pair         ``"coxeter"``                  ``"artin"``
    ===========  =============================  ============================
    m = 2        no edge                        edge labeled 2
    m = 3        unlabeled edge                 edge labeled 3
    m >= 4       edge labeled m                 edge labeled m
    m = infinity dashed edge                    no edge
    ===========  =============================  ============================

    ``group`` is a Coxeter matrix (a list of rows), a flat list of vertex
    orders (the polygon presentation, exactly as :func:`polygon` takes it),
    or anything exposing a ``coxeter_matrix`` (a ``compute.CoxeterGroup``) —
    duck-typed, so ``viz`` never imports ``compute``. The two list forms are
    told apart by nesting: a matrix row is a list, a vertex order is an int.

    ``cx.diagram([2, 2, 2, 2, 2], style="artin")`` draws the right-angled
    pentagon; the same group in ``"coxeter"`` style draws the pentagram.

    Node ``i`` is painted the same color wall ``i`` carries in a tiling, so a
    diagram and a tessellation read as the same data side by side.

    ``highlight`` takes a selection — ``g.parabolic(S)``, or a bare list of
    generator indices — and rings the nodes of ``S`` and thickens the edges
    *within* ``S``. Pass the same selection to ``tessellation(highlight=...)``
    or ``cayley(highlight=...)`` and the two pictures agree.
    """
    source = getattr(group, "coxeter_matrix", group)
    if not isinstance(source, (list, tuple)) or len(source) == 0:
        raise TypeError("a group is a Coxeter matrix, a list of vertex orders, or a CoxeterGroup.")
    if isinstance(source[0], (list, tuple)):
        presentation: dict[str, Any] = {
            "coxeterMatrix": [_indices(row, "a Coxeter-matrix row") for row in source]
        }
    else:
        presentation = {"polygon": _indices(source, "polygon vertex orders")}
    fig = Figure(presentation, title=title)
    fig._layers.append(_clean({"type": "diagram", "style": style, "highlight": _highlight(highlight)}))
    return fig


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
        depth: "int | _Variable | None" = None,
        color: str | None = None,
        opacity: float | None = None,
        edges: bool = False,
        edge_width: float | None = None,
        edge_colors: list[str] | None = None,
        highlight: Any = None,
    ) -> _Self:
        """The orbit of the chamber; one tile per element.

        color: 'parity' | 'hue' | any constant color string.

        ``depth`` may be ``cx.variable`` (optionally ``cx.variable(8)``) to
        leave the word-length depth open — a live integer input in the
        ``.html`` explorer, alongside (or instead of) a variable group.

        Set ``edges=True`` (or pass ``edge_width`` / ``edge_colors``) to stroke
        the tiling's edges, colored by PANEL TYPE — the generator index each
        edge is a translated mirror of. ``edge_colors[i]`` is generator i's
        color (defaults to the house wall colors); ``edge_width`` is intrinsic,
        × the inradius.

        ``highlight`` takes a selection — ``g.parabolic(S)``, or a bare list of
        generator indices — and paints the **W_S-orbit of the chamber**: the
        cell those walls bound. |S| = 1 is the chamber and its mirror; a meeting
        pair with order m is the 2m-gon around that vertex. W_S must be finite
        (the walls must meet), else the engine refuses with the reason.
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
                "highlight": _highlight(highlight),
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
        highlight: Any = None,
    ) -> _Self:
        """The Cayley graph: vertices at the incenter orbit, edges by generator.

        ``highlight`` takes a selection — ``g.parabolic(S)`` or a list of
        generator indices — and emphasizes the **W_S subgraph**: its nodes, and
        the edges labeled by S between them. W_S must be finite."""
        node = _clean({"size": node_size, "color": node_color})
        edge = _clean({"width": edge_width})
        return self._add(
            {
                "type": "cayley",
                "extent": _extent(ball, depth),
                "node": node or None,
                "edge": edge or None,
                "highlight": _highlight(highlight),
            }
        )

    def tiles(self: _Self, words: Any, *, fill: str | None = None) -> _Self:
        """The tiles a WordSet (or raw word list) names: word w ↦ THE TILE
        w·(chamber)."""
        return self._add({"type": "tiles", "words": _wordlist(words), "fill": fill})

    def hull(self: _Self, words: Any, *, fill: str | None = None, stroke: str | None = None) -> _Self:
        """The convex hull of the base-point images of a WordSet (or raw word
        list); area reported by the engine."""
        return self._add({"type": "hull", "words": _wordlist(words), "fill": fill, "stroke": stroke})

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
    to this view, which the viewer swaps in with a toggle/dropdown.

    Chainable back to the figure: ``.view(name)`` opens another view and
    ``.figure`` returns the figure — so a multi-view figure reads as one call:

        (cx.figure(g).tessellation(color="parity")
           .view("words").tiles(a.words(), fill="red")
           .view("inverses").tiles(a.invert().words(), fill="blue")
           .figure.save("x.html"))
    """

    def __init__(self, name: str, figure: "Figure"):
        if not isinstance(name, str) or not name:
            raise TypeError("a view name is a non-empty string.")
        self.name = name
        self._figure = figure
        self._layers: list[dict[str, Any]] = []

    @property
    def figure(self) -> "Figure":
        """The figure this view belongs to (to add a background layer, or save)."""
        return self._figure

    def view(self, name: str) -> "View":
        """Open another view on the same figure (chains view-to-view)."""
        return self._figure.view(name)


class Figure(_LayerBuilder):
    def __init__(self, group: dict[str, Any], *, title: str | None = None, model: str | None = None):
        self._group = group
        self._title = title
        self._model = model
        self._layers: list[dict[str, Any]] = []  # the background (shared by every view)
        self._views: list[View] = []

    def _is_diagram(self) -> bool:
        """A diagram figure: its layers are the abstract-group diagram, which
        has no camera and so (yet) no live page."""
        return bool(self._layers) and all(l.get("type") == "diagram" for l in self._layers)

    def view(self, name: str) -> View:
        """A named, swappable figure-description over the background. Its ops
        add to the view, not the background; the viewer swaps between views
        (a toggle for 2, a dropdown for 3+) at a fixed camera."""
        v = View(name, self)
        self._views.append(v)
        return v

    # ── the document and the outputs ──────────────────────────────────────

    def specify(self, *, group: Any = _UNSET) -> "Figure":
        """Fill a variable GROUP, recovering the ordinary figure.

        ``cx.polygon(cx.variable).….specify(group=orders)`` is identical to
        ``cx.polygon(orders)`` carrying the same layers/views — the hole is
        upstream, so nothing about the figure's construction changes. Omit
        ``group`` to use the variable's default (if it carries one). (This
        fills the group variable; the ``.html`` explorer fills any variable,
        the group or a layer's, through the engine's ``resolveFigure``.)
        """
        kind = self._group.get("variable")
        if kind is None:
            raise TypeError("this figure has no variable group to specify.")
        if group is _UNSET:
            if "default" not in self._group:
                raise TypeError("no value given and this variable group has no default.")
            group = self._group["default"]
        if kind == "polygon":
            filled = {"polygon": _indices(group, "polygon vertex orders")}
        else:  # pragma: no cover - only 'polygon' is wired up today
            raise TypeError(f"cannot specify a group variable of kind {kind!r}.")
        fig = Figure(filled, title=self._title, model=self._model)
        fig._layers = copy.deepcopy(self._layers)
        for v in self._views:
            fig.view(v.name)._layers = copy.deepcopy(v._layers)
        return fig

    def document(self) -> dict[str, Any]:
        """The figure document (fresh each call) — the exact JSON the engine
        reads. Any variable field ⇒ version '0.3' (parametric); else '0.2' iff
        there are views, else '0.1'."""
        parametric = _has_variable(self._group) or _has_variable(self._layers) or any(
            _has_variable(v._layers) for v in self._views
        )
        if parametric:
            version = "0.3"
        else:
            version = "0.2" if self._views else "0.1"
        doc: dict[str, Any] = {"version": version}
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
            if self._is_diagram():
                raise CoxeterVizError(_DIAGRAM_HTML)
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

        if self._is_diagram():
            raise CoxeterVizError(_DIAGRAM_HTML)
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
