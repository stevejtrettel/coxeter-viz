# `viz2d/kit/` — the picturing toolkit

Turns **already-computed group data** (realized polytopes, tessellations,
Cayley graphs, cosets, Wythoff cells) into `Scene` items, `Camera`s, and
`TilingStyle`s, with the house conventions and the load-bearing id scheme
pinned **once** and unit-tested. It is the last thin layer before a demo.

**The rule this module enforces:** *no mathematics in the demos.* A demo
chooses data, chooses colors, and lays out the page — nothing else. But the
converse rule is just as strong: **`kit/` contains no group theory either.**
Every genuinely mathematical operation — the Cayley graph on a metric ball,
the words of a parabolic, the fixed point of a parabolic, the perpendicular
foot on a wall, word-list parsing — lives in the **library core**
(`src/group`, `src/geometry`), where a non-viz caller (the future Python
driver) gets it too. `kit/` only *assembles pictures* from what the library
computes: apply an element to a base point, map a coset ordinal to a hue,
frame a camera, pack a `TilingStyle`.

Decided 2026-07-06 (PLAN.md §5.9, R4); this README is the spec, written before
the code. Depends on `math → geometry → models → coxeter → group` and the
painters `render` / `shader`.

## The three-way split

| layer | owns | example |
|---|---|---|
| **library core** (`src/group`, `src/geometry`) | all group theory & geometry | `cayleyBall`, `dihedralWords`, `parabolicFixedPoint`, `Hyperplane.foot`, `parseWordList` |
| **`viz2d/kit`** | picture assembly: Scene / Camera / TilingStyle, ids, color-mapping | `tilesToScene`, `cayleyScene`, `fitToDomain`, `fieldStyle`, `parityColor` |
| **demo** (`demos/*` + `demos/shared`) | data choice, color choice, page layout | "(2,3,7), parity palette, GPU on" |

The dividing line: the library owns what could be **mathematically wrong**;
`kit/` owns what could be **pictorially wrong** (an id, a fill rule, a frame);
the demo owns **taste** (a hex value, a margin).

## Library additions this toolkit assumes (built first, in R4-lib)

These are **library** work, each tested in its own layer's suite — `kit/`
merely consumes them:

**`src/geometry`** — `Hyperplane.foot(geom, p): Point2`, the perpendicular
foot of `p` on the wall (`normalize(p − ⟨p,c⟩·Jc)`, κ-uniform). Moved here
from `shader/uniforms` (`footOnWall`), which re-exports it; it is a pure
geometry primitive, not shader-specific.

**`src/group/cayley.ts`** — `cayleyBall(group, radius, maxCount?):
CayleyGraph<I>`, the induced Cayley graph on the metric ball (matrix-key
adjacency at ball scope: each edge once, far ends outside the ball dropped).
Companion to the existing depth-bounded `cayleyGraph`.

**`src/group/wordlists.ts`** — `dihedralWords(m): number[][]` (the ⟨R₁,R₂⟩
parabolic as words); `parabolicFixedPoint(group, poly, S): Point2 | null` (the
W_S-fixed point: base point for ∅, `Hyperplane.foot` for one wall, the shared
chamber vertex for a pair, null otherwise); `parseWordList(text, rank):
{words, bad}` and `parseWordFile(text): {words, errors}` (dot format + the
Python-friendly JSON `[[…]]` / `{words}` — the word format is library input).

## Files (~5 cohesive)

| file | exports |
|---|---|
| `realize.ts` | `defaultModel(kind)` (Poincaré/Cartesian/Stereographic by geometry) · `polygonSpec(orders, geometry?)` (geometry defaults to `classifyPolygon`) · `realizePolygon(orders, opts?) → RealizedGroup{kind,poly,group,model,r0}` (composes `solvePolygon`+`groupFromPolygon`+`defaultModel`) |
| `scene.ts` | the id scheme — `tileId(word)`,`cayId(word)`,`cayEdgeId(word,gen)`,`wallId(i)`,`fieldTileId(word)` (empty word → `"e"`); the item builders — `domainItem({filled})`, `tilesToScene(tiles, styleOf)`, `wallItems(walls, styleOf)`, `cayleyScene(group, cayley, {edge,node})` (turns a `CayleyGraph` into node/edge items, points = `apply(element, basePoint)`), `polygonItem(polytope, style, id)`, `highlightElements(group, words, idsOf, styles)`; the color maps — `parityColor(word, tri)`, `cosetColor(i)` (golden-angle), `hueColor(h)` (the shared §5.8 `hashHue` → hsl) |
| `camera.ts` | `fitToDomain(model, kind, r0, sizePx, margin?)` (disk frames the domain, E fits ~16 inradii, S a fixed span — the ternary the field demos copy) · `fitToPoints(model, view, points, sizePx, margin?)` (project a set, fit its extent) · `planeRotation(i,j,angle)` / `tippedView(a,b)` (the generic S² view isometry) |
| `field.ts` | `fieldStyle(r0): TilingStyle` (house ambience) · `blankStyle()` (all layers off, for a pure field program) · `rgba(hex,a): Rgba` · `starBands(walls, colorOf)` · `cosetField(base, anchor)` · `starField(base, star)` · `regionsField(base, seed, colors)` — assemble a `TilingStyle` from library-computed anchors/seeds + the demo's colors |
| `palette.ts` | the house constants: `GEN_COLORS`, `WALL_COLORS`, `TILE{identity,even,odd}`, `COSET_COLORS`, `TYPE_COLORS`, `HOVER`, `HULL`, `ENTRY`, the domain/edge greys |

`styleOf` arguments are plain functions the demo supplies (`(tile) =>
RegionStyle`, `(i) => StrokeStyle`, `{edge,node}`) — `kit/` owns the **shape
and id**, the demo owns the **style values**. No config-object surface that
doesn't actually dedup.

```ts
interface RealizedGroup {
  kind: GeometryKind; poly: RealizedPolygon;
  group: CoxeterGroup<Point2, Isometry2>; model: Model<Point2>;
  r0: number;                       // = poly.inradius, the intrinsic styling unit
}
```

## A demo, after (the transparency standard)

Every migrated demo reads as **data → scene → mount**, no math:

```ts
const rg = realizePolygon([2, 3, 7]);                     // library, via kit
const tiles = rg.group.tessellate(depth, cap);            // library
const scene = [
  domainItem({ filled: !gpu }),
  ...tilesToScene(tiles, t => ({ fill: { color: parityColor(t.word, TILE), opacity: 0.9 } })),
  ...wallItems(rg.poly.walls, i => ({ color: GEN_COLORS[i], width: 0.05 * rg.r0 })),
];
mountFieldDemo({ realized: rg, cpuScene: scene, gpuStyle: fieldStyle(rg.r0), title: '…' });
```

The DOM/canvas/rAF/export half is the `demos/shared` harness (R5), specced
separately.

## Layering and purity

`kit/` imports the group layer and the painters; demos import `kit/` and
`demos/shared`. Everything here is a **pure function of its inputs** — no DOM,
no canvas, no rAF, no `Date.now`. Purity is what makes it unit-testable and
keeps the harness (impure) cleanly separate.

## Tests pin the conventions

- ids round-trip the scheme (empty word → `"e"`); a highlight addresses the
  right item;
- `realizePolygon`: (2,3,7)→H, (2,4,4)→E, (2,3,5)→S; `r0 = inradius`;
- item builders emit the exact shapes (kind, id, geometry) the demos emit
  today — pinned against a captured Milestone-1 scene, so R4b migration is
  provably shape-identical;
- `parityColor` = sign character; `hueColor` matches the GLSL `hashHue`;
- `fitToDomain`/`fitToPoints`: the framed extent lands inside the frame at the
  given margin;
- `cayleyScene` node points = `apply(element, basePoint)`.

(The library additions are pinned in their own layers' suites: `cayleyBall`
counts on (2,3,5); `dihedralWords(m)` = the 2m elements; `parabolicFixedPoint`
fixed by S; `Hyperplane.foot` ⊥ in all geometries.)

## Increments (PLAN.md §5.9)

- **R4-lib** — the library additions above (`Hyperplane.foot` + `shader`
  re-export; `cayleyBall`; `dihedralWords`/`parabolicFixedPoint`/word parsing)
  + tests in each layer + README updates. No viz/demo changes. Gate: green.
- **R4-kit** — `kit/` (these 5 files) + tests. No demo changes. Gate: green.
- **R4b** — migrate the six group demos onto `kit/`, in batches (group+wordlists
  · wordfile+tilings · cosets+uniform); gallery demos adopt `realize`/`palette`.
  Gate per batch: green + hands-on visual pass (pictures unchanged).
- **R5** — `demos/shared` harness (own README spec, approved first) + migrate;
  demos end at data → scene → mount. Gate: green + hands-on.
