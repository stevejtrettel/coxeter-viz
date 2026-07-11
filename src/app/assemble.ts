import type { GeometryKind, Isometry2, Point2 } from '@/geometry/types';
import type { Model } from '@/models/types';
import { Poincare2 } from '@/models/poincare';
import { Klein2 } from '@/models/klein';
import { Cartesian2 } from '@/models/cartesian';
import { Gnomonic2 } from '@/models/gnomonic';
import { Stereographic2 } from '@/models/stereographic';
import { classifyCoxeterMatrix } from '@/coxeter/matrix';
import type { Tile } from '@/group/CoxeterGroup';
import { wordId } from '@/group/CoxeterGroup';
import { hullOfWords, parabolicFixedPoint } from '@/group/wordlists';
import { uniformCells, wythoffPoint } from '@/group/wythoff';
import { polygonArea } from '@/polytope/measure';
import type { Camera, RegionStyle, Scene, SceneItem, ViewSize } from '@/viz2d/render/types';
import { coverageRadius } from '@/viz2d/shader/vector';
import { hashHue } from '@/viz2d/shader/uniforms';
import type { TilingStyle } from '@/viz2d/shader/types';
import { defaultModel, realizeSpec, type RealizedGroup } from '@/viz2d/kit/realize';
import {
  cayleyScene,
  domainItem,
  fieldTileId,
  hueColor,
  parityColor,
  polygonItem,
  tilesToScene,
  wallItems,
} from '@/viz2d/kit/scene';
import { blankStyle, cosetField, fieldStyle, regionsField, rgba, starBands, starField } from '@/viz2d/kit/field';
import { fitToDomain } from '@/viz2d/kit/camera';
import { HULL, LIST, TILE, TYPE_COLORS, WALL_COLORS } from '@/viz2d/kit/palette';
import type { ColorSpec, Extent, Figure, Layer, ModelName } from '@/schema/types';

/**
 * Assembly (README): a CHECKED figure document → the realized group, the
 * CPU `Scene`(s), the auto-fit `Camera`, and — when the document carries a
 * field-paintable layer — the GPU `TilingStyle`. Pure (no DOM),
 * unit-testable, the shared front half of `render`, `figureToSvg`, and
 * `figureToPng`. This layer owns the PICTORIAL defaults; everything
 * mathematical arrives already computed from the library.
 *
 * The paint convention (P4): tessellation / cosets / uniform have a FIELD
 * representation. The FIRST such layer in the document is painted by the
 * GPU live (and in PNG); `overlay` is the CPU scene with that layer's
 * items removed (domain rim-only) for painting on top. `scene` is always
 * the complete CPU picture — the SVG story and the no-WebGL fallback.
 * Extent bounds the ENUMERATED (CPU/vector) picture; the field paints to
 * pixel resolution at arbitrary depth — that is its point.
 */

/** The safety cap on any single enumeration (the demos' shared constant). */
const MAX_TILES = 20_000;

/** ε px for the cover-the-frame default extent (the live convention). */
const COVER_EPSILON_PX = 3;

/** The uniform tiling's edge-net brown (the house §5.8 D3 dressing). */
const UNIFORM_EDGE = '#5a4f3f';

export interface RenderDiagnostics {
  geometry: GeometryKind;
  tileCount: number;
  cayleyNodeCount: number;
  uniformCellCount: number;
  /** Gauss–Bonnet areas of the document's hull layers, in document order. */
  hullAreas: number[];
  /** Whether the document has a field-paintable layer (GPU when available). */
  field: boolean;
  /** True when an enumeration hit the safety cap: the picture is incomplete (no silent caps). */
  truncated: boolean;
}

export interface Assembled {
  realized: RealizedGroup;
  /** The complete CPU scene: SVG export and the no-WebGL fallback. */
  scene: Scene;
  /** The CPU items painted OVER the field (null when no field layer). */
  overlay: Scene | null;
  /** The GPU program for the first field-paintable layer (null when none). */
  field: TilingStyle | null;
  camera: Camera;
  diagnostics: RenderDiagnostics;
}

function modelFor(name: ModelName, kind: GeometryKind): Model<Point2> {
  switch (name) {
    case 'auto':
      return defaultModel(kind);
    case 'poincare':
      return new Poincare2();
    case 'klein':
      return new Klein2();
    case 'cartesian':
      return new Cartesian2();
    case 'gnomonic':
      return new Gnomonic2();
    case 'stereographic':
      return new Stereographic2();
  }
}

export interface AssembleOptions {
  /** Use this camera (a live pan/zoom state) instead of the auto-fit one. */
  camera?: Camera;
  /** Coverage ε px for omitted extents: 3 live (default), 1.5 for exports. */
  epsilonPx?: number;
}

export function assemble(figure: Figure, size: ViewSize, opts?: AssembleOptions): Assembled {
  const cls = classifyCoxeterMatrix(figure.group.coxeterMatrix);
  if (cls.kind === 'refused') {
    // checkFigure guarantees acceptance; reaching this is a bug, not bad input.
    throw new Error(`assemble: unchecked document (${cls.reason}: ${cls.detail})`);
  }
  const rg = realizeSpec(cls.spec, { model: modelFor(figure.model, cls.spec.geometry) });
  const geom = rg.group.geom;

  const camera: Camera = opts?.camera ?? {
    view: geom.identity(),
    scalePx: fitToDomain(rg.model, rg.kind, rg.r0, Math.min(size.widthPx, size.heightPx)),
    centerPx: [size.widthPx / 2, size.heightPx / 2],
  };

  /** The omitted-extent default: cover the frame (spherical simply exhausts). */
  let frameRadius: number | undefined;
  const coverRadius = (): number => {
    frameRadius ??=
      rg.kind === 'spherical'
        ? Math.PI
        : coverageRadius(rg.group, rg.model, camera, size, opts?.epsilonPx ?? COVER_EPSILON_PX);
    return frameRadius;
  };
  let truncated = false;
  /** No silent caps: an enumeration at MAX_TILES means the picture is incomplete. */
  const noteCap = (count: number): void => {
    if (count >= MAX_TILES) truncated = true;
  };
  /** Resolve an extent: word depth, metric ball, or omitted = cover the frame. */
  const byExtent = <T>(extent: Extent | undefined, byDepth: (n: number) => T, byBall: (r: number) => T): T =>
    extent && 'depth' in extent
      ? byDepth(extent.depth)
      : byBall(extent && 'ball' in extent ? extent.ball : coverRadius());
  const tilesFor = (extent?: Extent): Tile<Point2, Isometry2>[] => {
    const tiles = byExtent(
      extent,
      (n) => rg.group.tessellate(n, MAX_TILES),
      (r) => rg.group.tessellateBall(r, MAX_TILES),
    );
    noteCap(tiles.length);
    return tiles;
  };

  const tileColor = (spec: ColorSpec | undefined): ((t: Tile<Point2, Isometry2>) => string) => {
    if (spec && 'constant' in spec) return () => spec.constant;
    if (spec && spec.map === 'hue') {
      // hue per ELEMENT: hashHue of the base-point image — the shared §5.8
      // convention (= the coset program with the trivial parabolic W_∅).
      return (t) => hueColor(hashHue(geom.apply(t.element, rg.group.basePoint)));
    }
    return (t) => parityColor(t.word, TILE);
  };

  /** The field program for a field-paintable layer (the paint convention). */
  const fieldFor = (layer: Layer): TilingStyle | null => {
    switch (layer.type) {
      case 'tessellation': {
        const a = layer.opacity ?? 0.9;
        if (layer.color && 'constant' in layer.color) {
          const c = rgba(layer.color.constant, a);
          return { ...blankStyle(), even: c, odd: c };
        }
        if (layer.color && layer.color.map === 'hue') {
          return cosetField(blankStyle(), rg.group.basePoint);
        }
        return { ...blankStyle(), even: rgba(TILE.even, a), odd: rgba(TILE.odd, a) };
      }
      case 'cosets':
        return cosetField(fieldStyle(rg.r0), parabolicFixedPoint(rg.group, layer.subgroup)!);
      case 'uniform': {
        // The house §5.8 D3 assembly: region fills + the seed-anchored star
        // (the tiling's edge net) — without the star, a one-type tiling
        // reads as a constant field.
        const colors = layer.palette ?? [...TYPE_COLORS];
        const rings = [0, 1, 2].map((i) => layer.rings.includes(i));
        const seed = wythoffPoint(rg.poly, rings);
        return regionsField(
          starField(blankStyle(), {
            anchor: seed,
            halfWidth: 0.01 * rg.r0,
            bands: starBands(rg.poly.walls, () => rgba(UNIFORM_EDGE, 0.75)),
          }),
          seed,
          colors.map((c) => rgba(c, 1)),
        );
      }
      default:
        return null;
    }
  };

  const scene: SceneItem[] = [];
  const overlayItems: SceneItem[] = [];
  let field: TilingStyle | null = null;
  let tileCount = 0;
  let cayleyNodeCount = 0;
  let uniformCellCount = 0;
  const hullAreas: number[] = [];

  figure.layers.forEach((layer, li) => {
    // The first field-paintable layer becomes THE field; its CPU items stay
    // in `scene` (SVG/fallback) but leave the overlay.
    const layerField = field === null ? fieldFor(layer) : null;
    if (layerField !== null) field = layerField;
    const fieldPaintsThisLayer = layerField !== null;
    const push = (items: SceneItem[]): void => {
      scene.push(...items);
      if (!fieldPaintsThisLayer) overlayItems.push(...items);
    };

    switch (layer.type) {
      case 'domain':
        scene.push(domainItem(true, layer.fill));
        overlayItems.push(domainItem(false)); // the field paints the fill beneath
        break;
      case 'walls':
        push(
          wallItems(rg.poly.walls, (i) => ({
            color: layer.colors?.[i] ?? WALL_COLORS[i % WALL_COLORS.length],
            width: (layer.width ?? 0.05) * rg.r0,
          })),
        );
        break;
      case 'tessellation': {
        const tiles = tilesFor(layer.extent);
        tileCount += tiles.length;
        const colorOf = tileColor(layer.color);
        const opacity = layer.opacity ?? 0.9;
        const styleOf = (t: Tile<Point2, Isometry2>): RegionStyle => ({
          fill: { color: colorOf(t), opacity },
        });
        push(tilesToScene(tiles, styleOf));
        // GPU parity cannot single out the identity; keep the fd tile honest
        // on top (the house "fd always orange" ruling).
        if (fieldPaintsThisLayer && !(layer.color && ('constant' in layer.color || layer.color.map === 'hue'))) {
          overlayItems.push(
            polygonItem(rg.poly.chamber, { fill: { color: TILE.identity, opacity } }, 'tile:e'),
          );
        }
        break;
      }
      case 'cayley': {
        const graph = byExtent(
          layer.extent,
          (n) => rg.group.cayleyGraph(n, MAX_TILES),
          (r) => rg.group.cayleyBall(r, MAX_TILES),
        );
        noteCap(graph.nodes.length);
        cayleyNodeCount += graph.nodes.length;
        push(
          cayleyScene(rg.group, graph, {
            edge: (g) => ({
              color: WALL_COLORS[g % WALL_COLORS.length],
              width: (layer.edge?.width ?? 0.06) * rg.r0,
            }),
            node: () => ({
              color: layer.node?.color ?? '#333333',
              radius: (layer.node?.size ?? 0.11) * rg.r0,
            }),
          }),
        );
        break;
      }
      case 'tiles': {
        const tiles = rg.group.tilesFor(layer.words);
        push(
          tilesToScene(
            tiles,
            () => ({ fill: { color: layer.fill ?? LIST } }),
            (w) => `list:${li}:${wordId(w)}`,
          ),
        );
        break;
      }
      case 'hull': {
        // The design-doc semantics: the hull of the BASE-POINT images w·x₀.
        // Spherical hulls beyond a hemisphere throw (the house refusal);
        // render() surfaces that as a problem value.
        const hull = hullOfWords(rg.group, layer.words);
        hullAreas.push(polygonArea(geom, hull.vertices));
        push([
          polygonItem(
            hull,
            {
              fill: { color: layer.fill ?? HULL, opacity: layer.fill ? 0.85 : 0.35 },
              edge: layer.stroke ? { color: layer.stroke, width: 0.03 * rg.r0 } : undefined,
            },
            `hull:${li}`,
          ),
        ]);
        break;
      }
      case 'cosets': {
        // Validation guarantees the anchor exists (∅ / one / a meeting pair).
        // The tiles are the FIELD's vector twin, so they carry `field:tile:`
        // ids — mergeFieldPaths coalesces same-hue cosets in the SVG.
        const anchor = parabolicFixedPoint(rg.group, layer.subgroup)!;
        const tiles = tilesFor(layer.extent);
        tileCount += tiles.length;
        push(
          tilesToScene(
            tiles,
            (t) => ({ fill: { color: hueColor(hashHue(geom.apply(t.element, anchor))) } }),
            fieldTileId,
          ),
        );
        break;
      }
      case 'uniform': {
        const colors = layer.palette ?? [...TYPE_COLORS];
        const rings = [0, 1, 2].map((i) => layer.rings.includes(i));
        const cells = uniformCells(rg.group, rg.poly, rings, coverRadius(), MAX_TILES);
        noteCap(cells.length);
        uniformCellCount += cells.length;
        push(
          cells.map((c, k) =>
            polygonItem(
              c.polytope,
              {
                fill: { color: colors[c.type % colors.length] },
                edge: { color: UNIFORM_EDGE, width: 0.02 * rg.r0, opacity: 0.75 },
              },
              `field:tile:${c.type}:${k}`, // the field's vector twin (house id)
            ),
          ),
        );
        break;
      }
    }
  });

  return {
    realized: rg,
    scene,
    overlay: field !== null ? overlayItems : null,
    field,
    camera,
    diagnostics: {
      geometry: rg.kind,
      tileCount,
      cayleyNodeCount,
      uniformCellCount,
      hullAreas,
      field: field !== null,
      truncated,
    },
  };
}
