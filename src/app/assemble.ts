import type { GeometryKind, Point2 } from '@/geometry/types';
import type { Model } from '@/models/types';
import { Poincare2 } from '@/models/poincare';
import { Klein2 } from '@/models/klein';
import { Cartesian2 } from '@/models/cartesian';
import { Gnomonic2 } from '@/models/gnomonic';
import { Stereographic2 } from '@/models/stereographic';
import { classifyCoxeterMatrix } from '@/coxeter/matrix';
import type { Tile } from '@/group/CoxeterGroup';
import type { Isometry2 } from '@/geometry/types';
import type { Camera, RegionStyle, Scene, SceneItem, ViewSize } from '@/viz2d/render/types';
import { coverageRadius } from '@/viz2d/shader/vector';
import { hashHue } from '@/viz2d/shader/uniforms';
import { defaultModel, realizeSpec, type RealizedGroup } from '@/viz2d/kit/realize';
import { cayleyScene, domainItem, hueColor, parityColor, tilesToScene, wallItems } from '@/viz2d/kit/scene';
import { fitToDomain } from '@/viz2d/kit/camera';
import { TILE, WALL_COLORS } from '@/viz2d/kit/palette';
import type { ColorSpec, Extent, Figure, Layer, ModelName } from '@/schema/types';

/**
 * Assembly (README): a CHECKED figure document → the realized group, the
 * CPU `Scene`, and the auto-fit `Camera` — pure (no DOM), unit-testable,
 * the shared front half of `render`, `figureToSvg`, and `figureToPng`.
 * This layer owns the PICTORIAL defaults (house palette, widths, the
 * cover-the-frame extent); everything mathematical arrives already
 * computed from the library.
 *
 * P3 wires domain / walls / tessellation / cayley; the remaining ops
 * (tiles, hull, cosets, uniform) are collected in `pending` until P4 —
 * assembly never throws on a checked document.
 */

/** The safety cap on any single enumeration (the demos' shared constant). */
const MAX_TILES = 20_000;

/** ε px for the cover-the-frame default extent (the live convention). */
const COVER_EPSILON_PX = 3;

export interface RenderDiagnostics {
  geometry: GeometryKind;
  tileCount: number;
  cayleyNodeCount: number;
  /** Ops in the document not yet implemented at this increment. */
  pending: Layer['type'][];
}

export interface Assembled {
  realized: RealizedGroup;
  scene: Scene;
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

export function assemble(figure: Figure, size: ViewSize): Assembled {
  const cls = classifyCoxeterMatrix(figure.group.coxeterMatrix);
  if (cls.kind === 'refused') {
    // checkFigure guarantees acceptance; reaching this is a bug, not bad input.
    throw new Error(`assemble: unchecked document (${cls.reason}: ${cls.detail})`);
  }
  const rg = realizeSpec(cls.spec, { model: modelFor(figure.model, cls.spec.geometry) });
  const geom = rg.group.geom;

  const camera: Camera = {
    view: geom.identity(),
    scalePx: fitToDomain(rg.model, rg.kind, rg.r0, Math.min(size.widthPx, size.heightPx)),
    centerPx: [size.widthPx / 2, size.heightPx / 2],
  };

  /** The omitted-extent default: cover the frame (spherical simply exhausts). */
  let frameRadius: number | undefined;
  const coverRadius = (): number => {
    frameRadius ??=
      rg.kind === 'spherical' ? Math.PI : coverageRadius(rg.group, rg.model, camera, size, COVER_EPSILON_PX);
    return frameRadius;
  };
  const tilesFor = (extent?: Extent): Tile<Point2, Isometry2>[] =>
    extent && 'depth' in extent
      ? rg.group.tessellate(extent.depth, MAX_TILES)
      : rg.group.tessellateBall(extent && 'ball' in extent ? extent.ball : coverRadius(), MAX_TILES);

  const tileColor = (spec: ColorSpec | undefined): ((t: Tile<Point2, Isometry2>) => string) => {
    if (spec && 'constant' in spec) return () => spec.constant;
    if (spec && spec.map === 'hue') {
      // hue per ELEMENT: hashHue of the base-point image — the shared §5.8
      // convention (= the coset program with the trivial parabolic W_∅).
      return (t) => hueColor(hashHue(geom.apply(t.element, rg.group.basePoint)));
    }
    return (t) => parityColor(t.word, TILE);
  };

  const items: SceneItem[] = [];
  const pending: Layer['type'][] = [];
  let tileCount = 0;
  let cayleyNodeCount = 0;

  for (const layer of figure.layers) {
    switch (layer.type) {
      case 'domain':
        items.push(domainItem(true, layer.fill));
        break;
      case 'walls':
        items.push(
          ...wallItems(rg.poly.walls, (i) => ({
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
        items.push(...tilesToScene(tiles, styleOf));
        break;
      }
      case 'cayley': {
        const graph =
          layer.extent && 'depth' in layer.extent
            ? rg.group.cayleyGraph(layer.extent.depth, MAX_TILES)
            : rg.group.cayleyBall(
                layer.extent && 'ball' in layer.extent ? layer.extent.ball : coverRadius(),
                MAX_TILES,
              );
        cayleyNodeCount += graph.nodes.length;
        items.push(
          ...cayleyScene(rg.group, graph, {
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
      default:
        pending.push(layer.type);
    }
  }

  return {
    realized: rg,
    scene: items,
    camera,
    diagnostics: { geometry: rg.kind, tileCount, cayleyNodeCount, pending },
  };
}
