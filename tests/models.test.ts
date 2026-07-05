import { describe, expect, it } from 'vitest';
import { cross, norm, scale, sub, vec3, type Vec } from '@/math/vec';
import { applyToVector } from '@/math/mat';
import type { Model } from '@/models/types';
import { Klein2, Klein3 } from '@/models/klein';
import { Poincare2, Poincare3 } from '@/models/poincare';
import { Gnomonic2, Gnomonic3 } from '@/models/gnomonic';
import { Stereographic2, Stereographic3 } from '@/models/stereographic';
import { Globe2 } from '@/models/globe';
import { Cartesian2, Cartesian3 } from '@/models/cartesian';
import { cells, expectVecClose, randomPoint, randomTangent, rng, type Cell } from './helpers';

interface ModelCase {
  model: Model<Vec>;
  cell: Cell;
  conformal: boolean;
}

const byName = (n: string) => cells.find((c) => c.name === n)!;

const cases: ModelCase[] = [
  { model: new Klein2(), cell: byName('H2'), conformal: false },
  { model: new Klein3(), cell: byName('H3'), conformal: false },
  { model: new Poincare2(), cell: byName('H2'), conformal: true },
  { model: new Poincare3(), cell: byName('H3'), conformal: true },
  { model: new Gnomonic2(), cell: byName('S2'), conformal: false },
  { model: new Gnomonic3(), cell: byName('S3'), conformal: false },
  { model: new Stereographic2(), cell: byName('S2'), conformal: true },
  { model: new Stereographic3(), cell: byName('S3'), conformal: true },
  { model: new Globe2(), cell: byName('S2'), conformal: true },
  { model: new Cartesian2(), cell: byName('E2'), conformal: true },
  { model: new Cartesian3(), cell: byName('E3'), conformal: true },
];

describe.each(cases)('$model.name ($cell.name)', ({ model, cell, conformal }) => {
  const { geom, comps } = cell;

  it('unproject inverts project', () => {
    const rand = rng(21);
    for (let k = 0; k < 20; k++) {
      const p = randomPoint(cell, rand);
      expectVecClose(comps, model.unproject(model.project(p)), p, 1e-9);
    }
  });

  it('conformal charts: scaleAt matches the numerical pushforward in every direction', () => {
    if (!conformal) return;
    const rand = rng(22);
    const h = 1e-6;
    for (let k = 0; k < 8; k++) {
      const p = randomPoint(cell, rand);
      const v = randomTangent(cell, p, rand, 1);
      const w = scale(sub(model.project(geom.exp(p, v, h)), model.project(p)), 1 / h);
      expect(norm(w)).toBeCloseTo(model.scaleAt(p), 4);
    }
  });

  it('straight charts render geodesics as straight lines', () => {
    if (!model.straight) return;
    const rand = rng(23);
    for (let k = 0; k < 10; k++) {
      const p = randomPoint(cell, rand);
      const q = randomPoint(cell, rand);
      const a = model.project(p);
      const b = model.project(q);
      const m = model.project(geom.geodesic(p, q)(0.5));
      expect(norm(cross(sub(m, a), sub(b, a)))).toBeLessThan(1e-8);
    }
  });
});

describe('non-conformal jacobians (radial/transverse scales)', () => {
  const flatCases = [
    { model: new Klein2() as Model<Vec>, cell: byName('H2'), sr: (r2: number) => 1 - r2 },
    { model: new Gnomonic2() as Model<Vec>, cell: byName('S2'), sr: (r2: number) => 1 + r2 },
  ];

  it.each(flatCases)('$model.name: numeric pushforward matches s_r and s_t', ({ model, cell, sr }) => {
    const { geom } = cell;
    const u = vec3(0.5, 0, 0);
    const p = model.unproject(u);
    const h = 1e-6;
    const push = (target: Vec) => {
      const v = geom.log(p, model.unproject(target));
      const vUnit = scale(v, 1 / Math.sqrt(geom.form(v, v)));
      return norm(scale(sub(model.project(geom.exp(p, vUnit, h)), model.project(p)), 1 / h));
    };
    const r2 = 0.25;
    expect(push(vec3(0.6, 0, 0))).toBeCloseTo(sr(r2), 4); // radial
    expect(push(vec3(0.5, 0.01, 0))).toBeCloseTo(Math.sqrt(sr(r2)), 3); // transverse
    // and the jacobian matrix agrees on the radial unit vector
    const J = model.jacobianAt(p);
    expect(norm(applyToVector(J, vec3(1, 0, 0)))).toBeCloseTo(sr(r2), 6);
  });
});

describe('Globe2', () => {
  it('renders onto the unit sphere isometrically', () => {
    const cell = byName('S2');
    const model = new Globe2();
    const rand = rng(24);
    for (let k = 0; k < 10; k++) {
      const p = randomPoint(cell, rand);
      expect(norm(model.project(p))).toBeCloseTo(1, 12);
    }
  });
});
