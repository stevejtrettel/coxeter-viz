import {
  classifyCoxeterMatrix,
  classifyPolygonOrders,
  type CoxeterMatrix,
  type MatrixClassification,
} from '@/coxeter/matrix';
import type { RealizationSpec } from '@/coxeter/spec';
import type { GeometryKind } from '@/geometry/types';
import type { FigureCheck, FigureProblem, GroupPresentation, Layer, ModelName } from './types';

/**
 * checkFigure (README): parse + validate a figure document, collecting every
 * problem (never fail-fast, never throw) and applying the document-level
 * default (model = 'auto'). Structural checks are local; the one semantic
 * check is the inference layer — a refused Coxeter matrix surfaces its
 * reason verbatim, so the caller (Python) can report WHY there is no
 * picture. Pictorial defaults (palettes, widths) are NOT applied here; they
 * belong to the assembly layer (`app/`), which owns the house look.
 */

const MODELS: readonly ModelName[] = ['auto', 'poincare', 'klein', 'cartesian', 'gnomonic', 'stereographic'];

const MODEL_GEOMETRY: Record<Exclude<ModelName, 'auto'>, GeometryKind> = {
  poincare: 'hyperbolic',
  klein: 'hyperbolic',
  cartesian: 'euclidean',
  gnomonic: 'spherical',
  stereographic: 'spherical',
};

/** Allowed fields per op, beyond "type". Unknown fields are problems (typos must not silently drop). */
const OP_FIELDS: Record<Layer['type'], readonly string[]> = {
  domain: ['fill'],
  walls: ['width', 'colors'],
  tessellation: ['extent', 'color', 'opacity'],
  cayley: ['extent', 'node', 'edge'],
  tiles: ['words', 'fill'],
  hull: ['words', 'fill', 'stroke'],
  cosets: ['subgroup', 'extent'],
  uniform: ['rings', 'palette'],
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The ONE presentation dispatch (PLAN §10) — checkFigure and app/assemble both route through it. */
export function classifyGroup(group: GroupPresentation): MatrixClassification {
  return 'coxeterMatrix' in group
    ? classifyCoxeterMatrix(group.coxeterMatrix)
    : classifyPolygonOrders(group.polygon);
}

export function checkFigure(raw: unknown): FigureCheck {
  const problems: FigureProblem[] = [];
  const bad = (path: string, problem: string): void => {
    problems.push({ path, problem });
  };

  if (!isRecord(raw)) {
    return { ok: false, problems: [{ path: '', problem: 'a figure document is a JSON object.' }] };
  }
  for (const key of Object.keys(raw)) {
    if (!['version', 'title', 'group', 'model', 'layers'].includes(key)) bad(key, 'unknown field.');
  }

  if (raw.version !== '0.1') {
    bad('version', `unknown version ${JSON.stringify(raw.version)}; this engine reads "0.1".`);
  }

  if (raw.title !== undefined && (typeof raw.title !== 'string' || raw.title.length === 0)) {
    bad('title', 'a title is a non-empty string.');
  }

  // — the group: exactly one presentation, through the inference layer —
  let rank = 0;
  let geometry: GeometryKind | undefined;
  let spec: RealizationSpec | undefined;
  const GROUP_REQUIRED =
    'required: { "coxeterMatrix": [[…]] } or { "polygon": [m₀,…] } (−1 the sentinel for ∞).';
  if (!isRecord(raw.group)) {
    bad('group', GROUP_REQUIRED);
  } else {
    for (const key of Object.keys(raw.group)) {
      if (key !== 'coxeterMatrix' && key !== 'polygon') bad(`group.${key}`, 'unknown field.');
    }
    const given = ['coxeterMatrix', 'polygon'].filter((k) => (raw.group as Record<string, unknown>)[k] !== undefined);
    if (given.length !== 1) {
      bad(
        'group',
        given.length === 0 ? GROUP_REQUIRED : 'give exactly one presentation: "coxeterMatrix" or "polygon", not both.',
      );
    } else {
      const [presentation] = given;
      const value = (raw.group as Record<string, unknown>)[presentation];
      if (Array.isArray(value)) rank = value.length;
      const cls =
        presentation === 'coxeterMatrix'
          ? classifyCoxeterMatrix(value as CoxeterMatrix)
          : classifyPolygonOrders(value as readonly number[]);
      if (cls.kind === 'refused') bad(`group.${presentation}`, `${cls.reason}: ${cls.detail}`);
      else {
        spec = cls.spec;
        geometry = spec.geometry;
      }
    }
  }

  // — the model —
  let model: ModelName = 'auto';
  if (raw.model !== undefined) {
    if (typeof raw.model !== 'string' || !MODELS.includes(raw.model as ModelName)) {
      bad('model', `unknown model ${JSON.stringify(raw.model)}; one of ${MODELS.join(', ')}.`);
    } else {
      model = raw.model as ModelName;
      if (model !== 'auto' && geometry !== undefined && MODEL_GEOMETRY[model] !== geometry) {
        bad('model', `${model} is a ${MODEL_GEOMETRY[model]} chart, but this group is ${geometry}.`);
      }
    }
  }

  // — shared field checkers —
  const checkColor = (v: unknown, path: string): void => {
    if (typeof v !== 'string' || v.length === 0) bad(path, 'a color is a non-empty string (hex or CSS).');
  };
  const checkLength = (v: unknown, path: string): void => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      bad(path, 'an intrinsic length: a positive number, in units of the inradius r₀.');
    }
  };
  const checkExtent = (v: unknown, path: string): void => {
    if (!isRecord(v)) return bad(path, 'extent is { "ball": r } or { "depth": n }.');
    const keys = Object.keys(v);
    if (keys.length !== 1 || (keys[0] !== 'ball' && keys[0] !== 'depth')) {
      return bad(path, 'extent has exactly one of "ball" (intrinsic metric radius) or "depth" (word length).');
    }
    if (keys[0] === 'ball' && (typeof v.ball !== 'number' || !Number.isFinite(v.ball) || v.ball <= 0)) {
      bad(`${path}.ball`, 'a positive intrinsic radius.');
    }
    if (keys[0] === 'depth' && (!Number.isInteger(v.depth) || (v.depth as number) < 1)) {
      bad(`${path}.depth`, 'a positive integer word length.');
    }
  };
  const checkWords = (v: unknown, path: string): void => {
    if (!Array.isArray(v)) return bad(path, 'a word list: an array of words, each an array of generator indices.');
    v.forEach((w, i) => {
      if (!Array.isArray(w)) return bad(`${path}[${i}]`, 'a word is an array of generator indices (empty = the identity).');
      w.forEach((g, j) => {
        if (!Number.isInteger(g) || g < 0 || (rank > 0 && g >= rank)) {
          bad(`${path}[${i}][${j}]`, `generator index ${g} is not in 0…${rank - 1}.`);
        }
      });
    });
  };
  const checkGeneratorSet = (v: unknown, path: string, what: string): void => {
    if (
      !Array.isArray(v) ||
      v.some((g) => !Number.isInteger(g) || g < 0 || (rank > 0 && g >= rank)) ||
      new Set(v).size !== v.length
    ) {
      bad(path, `${what}: distinct generator indices in 0…${rank - 1}.`);
    }
  };
  const checkStringArray = (v: unknown, path: string, what: string): void => {
    if (!Array.isArray(v) || v.some((c) => typeof c !== 'string' || c.length === 0)) {
      bad(path, `${what}: an array of color strings.`);
    }
  };
  const checkColorSpec = (v: unknown, path: string): void => {
    if (isRecord(v) && Object.keys(v).length === 1) {
      if ('map' in v) {
        if (v.map !== 'parity' && v.map !== 'hue') bad(`${path}.map`, 'a color map is "parity" or "hue".');
        return;
      }
      if ('constant' in v) return checkColor(v.constant, `${path}.constant`);
    }
    bad(path, 'a color spec is { "map": "parity" | "hue" } or { "constant": "#rrggbb" }.');
  };

  // — the layers —
  if (!Array.isArray(raw.layers)) {
    bad('layers', 'required: an array of layers, painted back to front.');
  } else {
    raw.layers.forEach((l, i) => {
      const p = `layers[${i}]`;
      if (!isRecord(l)) return bad(p, 'a layer is an object with a "type".');
      const t = l.type;
      if (typeof t !== 'string' || !(t in OP_FIELDS)) {
        return bad(`${p}.type`, `unknown op ${JSON.stringify(t)}; one of ${Object.keys(OP_FIELDS).join(', ')}.`);
      }
      const type = t as Layer['type'];
      for (const k of Object.keys(l)) {
        if (k !== 'type' && !OP_FIELDS[type].includes(k)) bad(`${p}.${k}`, `unknown field on "${type}".`);
      }
      switch (type) {
        case 'domain':
          if (l.fill !== undefined) checkColor(l.fill, `${p}.fill`);
          break;
        case 'walls':
          if (l.width !== undefined) checkLength(l.width, `${p}.width`);
          if (l.colors !== undefined) {
            checkStringArray(l.colors, `${p}.colors`, 'per-generator colors');
            if (Array.isArray(l.colors) && rank > 0 && l.colors.length !== rank) {
              bad(`${p}.colors`, `one color per generator: expected ${rank}, got ${l.colors.length}.`);
            }
          }
          break;
        case 'tessellation':
          if (l.extent !== undefined) checkExtent(l.extent, `${p}.extent`);
          if (l.color !== undefined) checkColorSpec(l.color, `${p}.color`);
          if (l.opacity !== undefined && (typeof l.opacity !== 'number' || !(l.opacity >= 0 && l.opacity <= 1))) {
            bad(`${p}.opacity`, 'opacity is a number in [0, 1].');
          }
          break;
        case 'cayley':
          if (l.extent !== undefined) checkExtent(l.extent, `${p}.extent`);
          if (l.node !== undefined) {
            if (!isRecord(l.node)) bad(`${p}.node`, 'node style is { "size"?, "color"? }.');
            else {
              if (l.node.size !== undefined) checkLength(l.node.size, `${p}.node.size`);
              if (l.node.color !== undefined) checkColor(l.node.color, `${p}.node.color`);
            }
          }
          if (l.edge !== undefined) {
            if (!isRecord(l.edge)) bad(`${p}.edge`, 'edge style is { "width"? }.');
            else if (l.edge.width !== undefined) checkLength(l.edge.width, `${p}.edge.width`);
          }
          break;
        case 'tiles':
          checkWords(l.words, `${p}.words`);
          if (l.fill !== undefined) checkColor(l.fill, `${p}.fill`);
          break;
        case 'hull':
          checkWords(l.words, `${p}.words`);
          if (l.fill !== undefined) checkColor(l.fill, `${p}.fill`);
          if (l.stroke !== undefined) checkColor(l.stroke, `${p}.stroke`);
          break;
        case 'cosets': {
          checkGeneratorSet(l.subgroup, `${p}.subgroup`, 'subgroup');
          if (l.extent !== undefined) checkExtent(l.extent, `${p}.extent`);
          // The coset coloring hangs on a W_S-fixed anchor: ∅ / one
          // generator / a MEETING pair (a chamber vertex). Anything else is
          // infinite or anchorless in 2D — refused with the reason.
          const S = l.subgroup;
          if (
            spec !== undefined &&
            Array.isArray(S) &&
            S.every((g) => Number.isInteger(g) && g >= 0 && g < rank) &&
            new Set(S).size === S.length
          ) {
            if (S.length > 2) {
              bad(
                `${p}.subgroup`,
                `the coset coloring needs a W_S-fixed anchor (S = ∅, one generator, or a meeting pair); |S| = ${S.length} has none.`,
              );
            } else if (S.length === 2) {
              const [a, b] = [Math.min(S[0], S[1]), Math.max(S[0], S[1])];
              const meets = spec.decorations.some(
                (d) => Math.min(d.walls[0], d.walls[1]) === a && Math.max(d.walls[0], d.walls[1]) === b,
              );
              if (!meets) {
                bad(
                  `${p}.subgroup`,
                  `walls ${a} and ${b} do not meet (order ∞): the parabolic ⟨s${a},s${b}⟩ is infinite — its cosets have no drawing.`,
                );
              }
            }
          }
          break;
        }
        case 'uniform':
          checkGeneratorSet(l.rings, `${p}.rings`, 'rings');
          if (l.palette !== undefined) checkStringArray(l.palette, `${p}.palette`, 'palette');
          if (spec !== undefined && rank !== 3) {
            bad(`${p}`, `the Wythoff construction needs a triangle chamber (rank 3); this group has rank ${rank}.`);
          }
          if (Array.isArray(l.rings) && l.rings.length === 0) {
            bad(`${p}.rings`, 'at least one ring (an unringed diagram pins the seed to nothing).');
          }
          break;
      }
    });
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    figure: {
      version: '0.1',
      ...(raw.title !== undefined ? { title: raw.title as string } : {}),
      group: raw.group as GroupPresentation,
      model,
      layers: raw.layers as Layer[],
    },
  };
}
