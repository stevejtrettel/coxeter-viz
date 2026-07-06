import { describe, expect, it } from 'vitest';
import type { Vec } from '@/math/vec';
import type { Geometry, Isometry2, Point2 } from '@/geometry/types';
import { Hyperbolic2 } from '@/geometry/Hyperbolic';
import { Euclidean2 } from '@/geometry/Euclidean';
import { Spherical2 } from '@/geometry/Spherical';
import type { Model } from '@/models/types';
import { Klein2 } from '@/models/klein';
import { Poincare2 } from '@/models/poincare';
import { Cartesian2 } from '@/models/cartesian';
import { Gnomonic2 } from '@/models/gnomonic';
import { Stereographic2 } from '@/models/stereographic';
import { identity, mat3, matMul } from '@/math/mat';
import { Hyperplane } from '@/geometry/Hyperplane';
import {
  DEFAULT_TOLERANCES,
  type Camera,
  type RenderTolerances,
  type Scene,
  type StyleOverride,
  type StyleOverrides,
  type ViewSize,
} from '@/viz2d/render/types';
import { buildPathList, type BuildContext } from '@/viz2d/render/scene';
import { dashRanges } from '@/viz2d/render/dash';
import { frameOf, preCulled, type Frame } from '@/viz2d/render/cull';
import { toSvg } from '@/viz2d/render/svg';
import type { PathList } from '@/viz2d/render/types';
import { draggedCamera, hitTest, modelUnprojector, pannedCamera, unprojectScreen, zoomedCamera, RENORM_EVERY } from '@/viz2d/render/interact';
import { SpherePerspective, sphereUnprojector } from '@/viz2d/sphere/projection';
import type { SphereCamera } from '@/viz2d/sphere/types';
import { isometryResidual } from './helpers';
import type { GeometryKind } from '@/geometry/types';
import type { RealizationSpec } from '@/coxeter/spec';
import { solvePolygon } from '@/coxeter/solve';
import { groupFromPolygon, wordId } from '@/group/CoxeterGroup';
import { paint } from '@/viz2d/render/canvas';
import { scaleCamera } from '@/viz2d/render/png';
import { sampleCircle, sampleCurve, sampleSegment, tangentFrame } from '@/viz2d/render/sample';
import { strokeOutline } from '@/viz2d/render/stroke';
import { markAxes, markEllipse } from '@/viz2d/render/marks';
import { rng } from './helpers';

type Geom2 = Geometry<Point2, Isometry2>;

const H2 = new Hyperbolic2();
const E2 = new Euclidean2();
const S2 = new Spherical2();

/** Every 2D geometry with each of its flat charts. */
const charts: { name: string; geom: Geom2; model: Model<Point2> }[] = [
  { name: 'H2/klein', geom: H2, model: new Klein2() },
  { name: 'H2/poincare', geom: H2, model: new Poincare2() },
  { name: 'E2/cartesian', geom: E2, model: new Cartesian2() },
  { name: 'S2/gnomonic', geom: S2, model: new Gnomonic2() },
  { name: 'S2/stereographic', geom: S2, model: new Stereographic2() },
];

const SCALE_PX = 200;

/** A point at distance ≤ maxDist from the origin (inside every chart). */
function randomPoint(geom: Geom2, rand: () => number, maxDist: number): Point2 {
  const theta = 2 * Math.PI * rand();
  const [e1, e2] = tangentFrame(geom, geom.origin());
  const v = Float64Array.from(e1.map((x, i) => Math.cos(theta) * x + Math.sin(theta) * e2[i]));
  return geom.exp(geom.origin(), v, maxDist * rand());
}

function pointSegmentDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

describe('render2d/sample: tangentFrame', () => {
  const geoms: { name: string; geom: Geom2 }[] = [
    { name: 'S2', geom: S2 },
    { name: 'E2', geom: E2 },
    { name: 'H2', geom: H2 },
  ];

  it('is orthonormal for the form and tangent to the locus', () => {
    const rand = rng(101);
    for (const { name, geom } of geoms) {
      for (let k = 0; k < 20; k++) {
        const p = randomPoint(geom, rand, 1.2);
        const [e1, e2] = tangentFrame(geom, p);
        expect(geom.form(e1, e1), `${name} |E1|`).toBeCloseTo(1, 12);
        expect(geom.form(e2, e2), `${name} |E2|`).toBeCloseTo(1, 12);
        expect(geom.form(e1, e2), `${name} E1·E2`).toBeCloseTo(0, 12);
        if (geom.kind === 'euclidean') {
          // Euclidean tangents live in the affine directions: zero 0-coordinate.
          expect(e1[0], `${name} E1[0]`).toBe(0);
          expect(e2[0], `${name} E2[0]`).toBe(0);
        } else {
          expect(geom.form(e1, p as Vec), `${name} E1⊥p`).toBeCloseTo(0, 12);
          expect(geom.form(e2, p as Vec), `${name} E2⊥p`).toBeCloseTo(0, 12);
        }
      }
    }
  });

  it('survives spherical points with p₀ = 0 (candidate parallel to p)', () => {
    for (const p of [
      Float64Array.of(0, 1, 0),
      Float64Array.of(0, 0, 1),
      Float64Array.of(0, Math.SQRT1_2, Math.SQRT1_2),
    ]) {
      const [e1, e2] = tangentFrame(S2, p);
      expect(S2.form(e1, e1)).toBeCloseTo(1, 12);
      expect(S2.form(e2, e2)).toBeCloseTo(1, 12);
      expect(S2.form(e1, e2)).toBeCloseTo(0, 12);
      expect(S2.form(e1, p)).toBeCloseTo(0, 12);
      expect(S2.form(e2, p)).toBeCloseTo(0, 12);
    }
  });
});

describe('render2d/sample: segments', () => {
  it('accepted segments satisfy the flatness contract (projected midpoint within tolerance of the chord)', () => {
    const rand = rng(202);
    for (const { name, geom, model } of charts) {
      for (let k = 0; k < 10; k++) {
        const a = randomPoint(geom, rand, 1.2);
        const b = randomPoint(geom, rand, 1.2);
        const gamma = geom.geodesic(a, b);
        const { samples } = sampleSegment(geom, model, a, b, SCALE_PX, DEFAULT_TOLERANCES);
        expect(samples.length).toBeGreaterThanOrEqual(3);
        for (let i = 0; i + 1 < samples.length; i++) {
          const s = samples[i];
          const t = samples[i + 1];
          const m = model.project(gamma(0.5 * (s.t + t.t)));
          const dev =
            SCALE_PX * pointSegmentDist(m[0], m[1], s.u[0], s.u[1], t.u[0], t.u[1]);
          expect(dev, `${name} segment ${i}`).toBeLessThanOrEqual(DEFAULT_TOLERANCES.flatnessPx);
        }
      }
    }
  });

  it('polyline stays within a small multiple of the flatness tolerance of dense reference sampling', () => {
    const rand = rng(303);
    for (const { name, geom, model } of charts) {
      for (let k = 0; k < 5; k++) {
        const a = randomPoint(geom, rand, 1.2);
        const b = randomPoint(geom, rand, 1.2);
        const gamma = geom.geodesic(a, b);
        const { samples } = sampleSegment(geom, model, a, b, SCALE_PX, DEFAULT_TOLERANCES);
        let maxDev = 0;
        for (let j = 0; j <= 512; j++) {
          const u = model.project(gamma(j / 512));
          let d = Infinity;
          for (let i = 0; i + 1 < samples.length; i++) {
            d = Math.min(
              d,
              pointSegmentDist(
                u[0],
                u[1],
                samples[i].u[0],
                samples[i].u[1],
                samples[i + 1].u[0],
                samples[i + 1].u[1],
              ),
            );
          }
          maxDev = Math.max(maxDev, d);
        }
        expect(SCALE_PX * maxDev, name).toBeLessThanOrEqual(3 * DEFAULT_TOLERANCES.flatnessPx);
      }
    }
  });

  it('straight charts keep straight chords minimal when width is off', () => {
    const rand = rng(404);
    for (const { name, geom, model } of charts.filter((c) => c.model.straight)) {
      const a = randomPoint(geom, rand, 1.0);
      const b = randomPoint(geom, rand, 1.0);
      const { samples } = sampleSegment(geom, model, a, b, SCALE_PX, DEFAULT_TOLERANCES);
      // Forced initial split gives 3 points; flatness never triggers more.
      expect(samples.length, name).toBe(3);
      for (const s of samples) {
        const dev = pointSegmentDist(
          s.u[0],
          s.u[1],
          samples[0].u[0],
          samples[0].u[1],
          samples[samples.length - 1].u[0],
          samples[samples.length - 1].u[1],
        );
        expect(SCALE_PX * dev, `${name} collinear`).toBeLessThanOrEqual(1e-6);
      }
    }
  });

  it('width variation criterion refines straight Klein chords and holds at accepted segments', () => {
    const geom = H2;
    const model = new Klein2();
    const a = geom.origin();
    const b = geom.exp(a, Float64Array.of(0, 1, 0), 3.0); // deep toward the boundary
    const halfWidth = 0.05;
    const { samples } = sampleSegment(geom, model, a, b, SCALE_PX, DEFAULT_TOLERANCES, halfWidth);
    expect(samples.length).toBeGreaterThan(3); // flatness alone would stop at 3
    for (let i = 0; i + 1 < samples.length; i++) {
      const s = samples[i];
      const t = samples[i + 1];
      const dx = t.u[0] - s.u[0];
      const dy = t.u[1] - s.u[1];
      const len = Math.hypot(dx, dy);
      if (len < 1e-12) continue;
      const scaleA = model.scaleAt(s.p);
      const scaleB = model.scaleAt(t.p);
      // Transverse scale changes slowly on accepted segments; the true bound
      // is on |J·n̂| differences — this chord is radial, so n̂ is transverse
      // and J·n̂ = scaleAt·n̂ exactly.
      const variation = SCALE_PX * halfWidth * Math.abs(scaleA - scaleB);
      expect(variation, `segment ${i}`).toBeLessThanOrEqual(DEFAULT_TOLERANCES.widthPx + 1e-9);
    }
  });

  it('respects the recursion cap', () => {
    const tight: RenderTolerances = { ...DEFAULT_TOLERANCES, flatnessPx: 1e-9, maxDepth: 6 };
    // Off-center endpoints: a Poincaré geodesic through the origin would be a
    // straight diameter and never refine at all.
    const a = H2.exp(H2.origin(), Float64Array.of(0, 1, 0), 1.0);
    const b = H2.exp(H2.origin(), Float64Array.of(0, 0, 1), 1.0);
    const { samples } = sampleSegment(H2, new Poincare2(), a, b, SCALE_PX, tight);
    // Every segment fails the impossible tolerance, so bisection runs to the
    // cap exactly: 2^6 segments, 2^6 + 1 points.
    expect(samples.length).toBe(2 ** 6 + 1);
  });
});

describe('render2d/sample: metric circles', () => {
  it('samples lie at exact intrinsic distance r from the center, in every geometry and chart', () => {
    const rand = rng(505);
    for (const { name, geom, model } of charts) {
      for (let k = 0; k < 5; k++) {
        const center = randomPoint(geom, rand, 0.5);
        const radius = 0.2 + 0.4 * rand();
        const { closed, samples } = sampleCircle(
          geom,
          model,
          center,
          radius,
          SCALE_PX,
          DEFAULT_TOLERANCES,
        );
        expect(closed).toBe(true);
        expect(samples.length).toBeGreaterThanOrEqual(8);
        for (const s of samples) {
          expect(geom.distance(center, s.p), `${name} r`).toBeCloseTo(radius, 10);
          const u = model.project(s.p);
          expect(s.u[0]).toBeCloseTo(u[0], 12);
          expect(s.u[1]).toBeCloseTo(u[1], 12);
        }
      }
    }
  });

  it('closed circles do not duplicate the seam point', () => {
    const { samples } = sampleCircle(E2, new Cartesian2(), E2.origin(), 1, SCALE_PX, DEFAULT_TOLERANCES);
    const first = samples[0];
    const last = samples[samples.length - 1];
    const gap = Math.hypot(first.u[0] - last.u[0], first.u[1] - last.u[1]);
    expect(gap).toBeGreaterThan(1e-6);
  });

  it('flatness contract holds on accepted circle arcs', () => {
    const geom = S2;
    const model = new Stereographic2();
    const center = geom.origin();
    const radius = 0.8;
    const [e1, e2] = tangentFrame(geom, center);
    const gamma = (theta: number): Point2 => {
      const v = Float64Array.from(e1.map((x, i) => Math.cos(theta) * x + Math.sin(theta) * e2[i]));
      return geom.exp(center, v, radius);
    };
    const { samples } = sampleCircle(geom, model, center, radius, SCALE_PX, DEFAULT_TOLERANCES);
    for (let i = 0; i + 1 < samples.length; i++) {
      const s = samples[i];
      const t = samples[i + 1];
      const m = model.project(gamma(0.5 * (s.t + t.t)));
      const dev = SCALE_PX * pointSegmentDist(m[0], m[1], s.u[0], s.u[1], t.u[0], t.u[1]);
      expect(dev, `arc ${i}`).toBeLessThanOrEqual(DEFAULT_TOLERANCES.flatnessPx);
    }
  });
});

/**
 * Central finite difference of s ↦ project(exp(p, ν, s)) at s = 0: the render
 * velocity of a unit intrinsic step in tangent direction ν.
 */
function renderVelocity(
  geom: Geom2,
  model: Model<Point2>,
  p: Point2,
  nu: Vec,
): [number, number] {
  const eps = 1e-5;
  const up = model.project(geom.exp(p, nu, eps));
  const um = model.project(geom.exp(p, nu, -eps));
  return [(up[0] - um[0]) / (2 * eps), (up[1] - um[1]) / (2 * eps)];
}

describe('render2d/stroke', () => {
  const WIDTH = 0.1;

  it('offsets lie on the jacobian ellipse: numerical differentiation of project ∘ exp', () => {
    // The jacobian ellipse at p is {D(ν) : |ν| = 1} with D the render velocity
    // above (linear in ν: D = A·c for ν = c₁E₁ + c₂E₂). The half-width vector
    // h = (w/2)·J·n̂ claims to be a point of the ellipse of radius w/2, i.e.
    // |A⁻¹·(h/(w/2))| = 1.
    const rand = rng(606);
    for (const { name, geom, model } of charts) {
      const a = randomPoint(geom, rand, 1.0);
      const b = randomPoint(geom, rand, 1.0);
      const curve = sampleSegment(geom, model, a, b, SCALE_PX, DEFAULT_TOLERANCES, WIDTH / 2);
      const [contour] = strokeOutline(curve, model, WIDTH);
      const n = curve.samples.length;
      expect(contour.length).toBe(4 * n);
      for (let i = 0; i < n; i++) {
        const s = curve.samples[i];
        const hx = (contour[2 * i] - s.u[0]) / (WIDTH / 2);
        const hy = (contour[2 * i + 1] - s.u[1]) / (WIDTH / 2);
        const [e1, e2] = tangentFrame(geom, s.p);
        const [a00, a10] = renderVelocity(geom, model, s.p, e1);
        const [a01, a11] = renderVelocity(geom, model, s.p, e2);
        const det = a00 * a11 - a01 * a10;
        const c1 = (hx * a11 - hy * a01) / det;
        const c2 = (hy * a00 - hx * a10) / det;
        expect(Math.hypot(c1, c2), `${name} sample ${i}`).toBeCloseTo(1, 6);
      }
    }
  });

  it('conformal charts: offset length is (w/2)·scaleAt in every direction', () => {
    const rand = rng(707);
    const conformal = charts.filter((c) => c.name.includes('poincare') || c.name.includes('stereographic') || c.name.includes('cartesian'));
    for (const { name, geom, model } of conformal) {
      const a = randomPoint(geom, rand, 1.0);
      const b = randomPoint(geom, rand, 1.0);
      const curve = sampleSegment(geom, model, a, b, SCALE_PX, DEFAULT_TOLERANCES, WIDTH / 2);
      const [contour] = strokeOutline(curve, model, WIDTH);
      curve.samples.forEach((s, i) => {
        const len = Math.hypot(contour[2 * i] - s.u[0], contour[2 * i + 1] - s.u[1]);
        expect(len, `${name} sample ${i}`).toBeCloseTo((WIDTH / 2) * model.scaleAt(s.p), 10);
      });
    }
  });

  it('Klein radial chord: normals are transverse, so offsets shrink as √(1−r²)', () => {
    const model = new Klein2();
    const a = H2.origin();
    const b = H2.exp(a, Float64Array.of(0, 1, 0), 2.5);
    const curve = sampleSegment(H2, model, a, b, SCALE_PX, DEFAULT_TOLERANCES, WIDTH / 2);
    const [contour] = strokeOutline(curve, model, WIDTH);
    curve.samples.forEach((s, i) => {
      const len = Math.hypot(contour[2 * i] - s.u[0], contour[2 * i + 1] - s.u[1]);
      // Klein's scaleAt IS the transverse scale √(1−r²).
      expect(len, `sample ${i}`).toBeCloseTo((WIDTH / 2) * model.scaleAt(s.p), 10);
    });
  });

  it('open strokes: one contour, symmetric about the spine, butt-capped', () => {
    const curve = sampleSegment(
      H2,
      new Poincare2(),
      H2.exp(H2.origin(), Float64Array.of(0, 1, 0), 1.0),
      H2.exp(H2.origin(), Float64Array.of(0, 0, 1), 1.0),
      SCALE_PX,
      DEFAULT_TOLERANCES,
      WIDTH / 2,
    );
    const contours = strokeOutline(curve, new Poincare2(), WIDTH);
    expect(contours.length).toBe(1);
    const n = curve.samples.length;
    const c = contours[0];
    for (let i = 0; i < n; i++) {
      // right side is stored reversed: sample i sits at position 2n − 1 − i.
      const j = 2 * n - 1 - i;
      expect(0.5 * (c[2 * i] + c[2 * j])).toBeCloseTo(curve.samples[i].u[0], 12);
      expect(0.5 * (c[2 * i + 1] + c[2 * j + 1])).toBeCloseTo(curve.samples[i].u[1], 12);
    }
  });

  it('closed strokes: two offset loops (an annulus under even-odd)', () => {
    const curve = sampleCircle(S2, new Stereographic2(), S2.origin(), 0.7, SCALE_PX, DEFAULT_TOLERANCES, WIDTH / 2);
    const contours = strokeOutline(curve, new Stereographic2(), WIDTH);
    expect(contours.length).toBe(2);
    const n = curve.samples.length;
    expect(contours[0].length).toBe(2 * n);
    expect(contours[1].length).toBe(2 * n);
    // Loops are symmetric about the spine sample-by-sample.
    for (let i = 0; i < n; i++) {
      expect(0.5 * (contours[0][2 * i] + contours[1][2 * i])).toBeCloseTo(curve.samples[i].u[0], 12);
      expect(0.5 * (contours[0][2 * i + 1] + contours[1][2 * i + 1])).toBeCloseTo(
        curve.samples[i].u[1],
        12,
      );
    }
  });

  it('degenerate inputs produce no contours', () => {
    const a = E2.origin();
    const b = E2.exp(a, Float64Array.of(0, 1, 0), 1);
    const curve = sampleSegment(E2, new Cartesian2(), a, b, SCALE_PX, DEFAULT_TOLERANCES);
    expect(strokeOutline(curve, new Cartesian2(), 0)).toEqual([]);
    expect(strokeOutline({ closed: false, samples: [curve.samples[0]] }, new Cartesian2(), WIDTH)).toEqual([]);
  });
});

describe('render2d/marks', () => {
  const RADIUS = 0.04;

  it('axes are r × the in-plane singular values of jacobianAt, per numerical differentiation', () => {
    const rand = rng(808);
    for (const { name, geom, model } of charts) {
      for (let k = 0; k < 5; k++) {
        const p = randomPoint(geom, rand, 1.0);
        const [s1, s2] = markAxes(model, p);
        const [e1, e2] = tangentFrame(geom, p);
        const [a00, a10] = renderVelocity(geom, model, p, e1);
        const [a01, a11] = renderVelocity(geom, model, p, e2);
        // Same closed form applied to the numerical derivative matrix.
        const s = Math.hypot(a00 + a11, a01 - a10);
        const t = Math.hypot(a00 - a11, a01 + a10);
        expect(s1, `${name} σ₁`).toBeCloseTo((s + t) / 2, 6);
        expect(s2, `${name} σ₂`).toBeCloseTo(Math.abs(s - t) / 2, 6);
      }
    }
  });

  it('ellipse vertices lie on the jacobian ellipse of radius r', () => {
    const rand = rng(909);
    for (const { name, geom, model } of charts) {
      const p = randomPoint(geom, rand, 1.0);
      const u = model.project(p);
      const contour = markEllipse(model, p, RADIUS, SCALE_PX, DEFAULT_TOLERANCES);
      const [e1, e2] = tangentFrame(geom, p);
      const [a00, a10] = renderVelocity(geom, model, p, e1);
      const [a01, a11] = renderVelocity(geom, model, p, e2);
      const det = a00 * a11 - a01 * a10;
      for (let j = 0; j < contour.length / 2; j++) {
        const hx = (contour[2 * j] - u[0]) / RADIUS;
        const hy = (contour[2 * j + 1] - u[1]) / RADIUS;
        const c1 = (hx * a11 - hy * a01) / det;
        const c2 = (hy * a00 - hx * a10) / det;
        expect(Math.hypot(c1, c2), `${name} vertex ${j}`).toBeCloseTo(1, 6);
      }
    }
  });

  it('Klein marks are anisotropic: radial axis 1−r², transverse √(1−r²)', () => {
    const model = new Klein2();
    const p = H2.exp(H2.origin(), Float64Array.of(0, 1, 0), 1.5);
    const r2 = p[1] / p[0]; // chart radius along x
    const rr = r2 * r2;
    const [s1, s2] = markAxes(model, p);
    expect(s1).toBeCloseTo(Math.sqrt(1 - rr), 12); // transverse (larger)
    expect(s2).toBeCloseTo(1 - rr, 12); // radial (smaller)
  });

  it('conformal marks are round: both axes equal scaleAt', () => {
    const rand = rng(111);
    const p = randomPoint(H2, rand, 1.0);
    const model = new Poincare2();
    const [s1, s2] = markAxes(model, p);
    expect(s1).toBeCloseTo(model.scaleAt(p), 12);
    expect(s2).toBeCloseTo(model.scaleAt(p), 12);
  });

  it('vertex count adapts to the mark px size within [8, 64]', () => {
    const p = E2.origin();
    const model = new Cartesian2();
    const tiny = markEllipse(model, p, 0.001, SCALE_PX, DEFAULT_TOLERANCES);
    const huge = markEllipse(model, p, 2, SCALE_PX, DEFAULT_TOLERANCES);
    expect(tiny.length / 2).toBe(8);
    expect(huge.length / 2).toBeGreaterThan(16);
    expect(huge.length / 2).toBeLessThanOrEqual(64);
  });
});

describe('render2d/scene', () => {
  const camera: Camera = { view: identity(3), scalePx: SCALE_PX, centerPx: [480, 360] };
  const size: ViewSize = { widthPx: 960, heightPx: 720 };

  function ctx(geom: Geom2, model: Model<Point2>, extra?: Partial<BuildContext>): BuildContext {
    return { geom, model, camera, size, ...extra };
  }

  it('frameOf inverts the viewport', () => {
    const f = frameOf(camera, size);
    expect(f.minX).toBeCloseTo(-2.4, 12);
    expect(f.maxX).toBeCloseTo(2.4, 12);
    expect(f.minY).toBeCloseTo(-1.8, 12);
    expect(f.maxY).toBeCloseTo(1.8, 12);
  });

  it('points render as ellipses centered at project(apply(g, at)), honoring the view isometry', () => {
    const at = H2.exp(H2.origin(), Float64Array.of(0, 1, 0), 0.8);
    const scene: Scene = [
      { id: 'p', kind: 'point', at, style: { color: '#123456', radius: 0.05 } },
    ];
    // View g = reflection in the y-wall (x ↦ −x in the chart).
    const wallY = Hyperplane.fromCovector(H2, Float64Array.of(0, 1, 0));
    const g = H2.reflection(wallY);
    const model = new Poincare2();
    const paths = buildPathList(scene, ctx(H2, model, { camera: { ...camera, view: g } }));
    expect(paths.length).toBe(1);
    expect(paths[0].id).toBe('p');
    expect(paths[0].color).toBe('#123456');
    expect(paths[0].opacity).toBe(1);
    const c = paths[0].contours[0];
    let mx = 0;
    let my = 0;
    for (let i = 0; i < c.length; i += 2) {
      mx += c[i];
      my += c[i + 1];
    }
    mx /= c.length / 2;
    my /= c.length / 2;
    const expected = model.project(H2.apply(g, at));
    expect(mx).toBeCloseTo(expected[0], 6);
    expect(my).toBeCloseTo(expected[1], 6);
  });

  it('wall lines lie on the wall and span the visible chart (H2/Klein)', () => {
    // The x-axis wall {p₂ = 0}.
    const wall = Hyperplane.fromCovector(H2, Float64Array.of(0, 0, 1));
    const scene: Scene = [
      { id: 'w0', kind: 'geodesic', source: { type: 'line', wall }, style: { color: 'k', width: 0.04 } },
    ];
    const paths = buildPathList(scene, ctx(H2, new Klein2()));
    expect(paths.length).toBe(1);
    const c = paths[0].contours[0];
    let maxAbsX = 0;
    for (let i = 0; i < c.length; i += 2) {
      expect(Math.abs(c[i + 1])).toBeLessThan(0.05); // outline hugs the x-axis
      maxAbsX = Math.max(maxAbsX, Math.abs(c[i]));
      expect(Math.hypot(c[i], c[i + 1])).toBeLessThanOrEqual(1 + 1e-9); // inside the disk
    }
    expect(maxAbsX).toBeGreaterThan(0.98); // reaches the boundary to sub-pixel
  });

  it('wall lines clip to the frame plus margin (E2)', () => {
    // The vertical line {x = 1}: covector (−1, 1, 0).
    const wall = Hyperplane.fromCovector(E2, Float64Array.of(-1, 1, 0));
    const scene: Scene = [
      { id: 'w', kind: 'geodesic', source: { type: 'line', wall }, style: { color: 'k', width: 0.03 } },
    ];
    const paths = buildPathList(scene, ctx(E2, new Cartesian2()));
    expect(paths.length).toBe(1);
    const c = paths[0].contours[0];
    let maxAbsY = 0;
    for (let i = 0; i < c.length; i += 2) {
      expect(c[i]).toBeCloseTo(1, 1); // near x = 1 (± half width)
      maxAbsY = Math.max(maxAbsY, Math.abs(c[i + 1]));
    }
    expect(maxAbsY).toBeGreaterThanOrEqual(1.8); // covers the frame
    expect(maxAbsY).toBeLessThanOrEqual(1.8 + 3 * (40 / SCALE_PX)); // …but not far past the margin
  });

  it('spherical walls in the gnomonic chart stay on the visible branch (p₀ > 0, finite)', () => {
    // A wall not through the chart origin: {−0.3·p₀ + p₂ = 0} → the line y = 0.3.
    const wall = Hyperplane.fromCovector(S2, Float64Array.of(-0.3, 0, 1));
    const scene: Scene = [
      { id: 'w', kind: 'geodesic', source: { type: 'line', wall }, style: { color: 'k', width: 0.03 } },
    ];
    const paths = buildPathList(scene, ctx(S2, new Gnomonic2()));
    expect(paths.length).toBe(1);
    const c = paths[0].contours[0];
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < c.length; i += 2) {
      expect(Number.isFinite(c[i])).toBe(true);
      expect(Number.isFinite(c[i + 1])).toBe(true);
      expect(c[i + 1]).toBeCloseTo(0.3, 1);
      minX = Math.min(minX, c[i]);
      maxX = Math.max(maxX, c[i]);
    }
    expect(minX).toBeLessThanOrEqual(-2.4);
    expect(maxX).toBeGreaterThanOrEqual(2.4);
  });

  it('spherical walls in the stereographic chart sample the whole great circle on-wall', () => {
    const wall = Hyperplane.fromCovector(S2, Float64Array.of(-0.3, 0, 1));
    const scene: Scene = [
      { id: 'w', kind: 'geodesic', source: { type: 'line', wall }, style: { color: 'k', width: 0.03 } },
    ];
    const paths = buildPathList(scene, ctx(S2, new Stereographic2()));
    expect(paths.length).toBe(1);
    for (const c of paths[0].contours) {
      for (let i = 0; i < c.length; i += 2) {
        expect(Number.isFinite(c[i])).toBe(true);
        // The outline stays within half a width of the wall.
        const p = S2.apply(identity(3), new Stereographic2().unproject(Float64Array.of(c[i], c[i + 1], 0)));
        expect(Math.abs(wall.side(p))).toBeLessThan(0.05);
      }
    }
  });

  it('culls sub-pixel and off-frame items', () => {
    const scene: Scene = [
      { id: 'tiny', kind: 'point', at: E2.origin(), style: { color: 'k', radius: 0.0005 } },
      {
        id: 'far',
        kind: 'point',
        at: Float64Array.of(1, 50, 50),
        style: { color: 'k', radius: 0.1 },
      },
      { id: 'seen', kind: 'point', at: E2.origin(), style: { color: 'k', radius: 0.05 } },
    ];
    const paths = buildPathList(scene, ctx(E2, new Cartesian2()));
    expect(paths.map((p) => p.id)).toEqual(['seen']);
  });

  it('circles emit fill then annulus edge; polygons emit fill then per-edge strokes', () => {
    const circleScene: Scene = [
      {
        id: 'c',
        kind: 'circle',
        center: E2.origin(),
        radius: 0.5,
        style: { fill: { color: 'f' }, edge: { color: 'e', width: 0.03 } },
      },
    ];
    const cp = buildPathList(circleScene, ctx(E2, new Cartesian2()));
    expect(cp.length).toBe(2);
    expect(cp[0].color).toBe('f');
    expect(cp[0].contours.length).toBe(1);
    expect(cp[1].color).toBe('e');
    expect(cp[1].contours.length).toBe(2); // annulus

    const v = (x: number, y: number) => Float64Array.of(1, x, y);
    const polyScene: Scene = [
      {
        id: 'poly',
        kind: 'polygon',
        vertices: [v(0, 0), v(1, 0), v(0.5, 0.8)],
        style: { fill: { color: 'f' }, edge: { color: 'e', width: 0.03 } },
      },
    ];
    const pp = buildPathList(polyScene, ctx(E2, new Cartesian2()));
    expect(pp.length).toBe(1 + 3 + 1); // fill + one path per edge + the P2 join disks
    expect(pp[0].color).toBe('f');
    expect(pp.slice(1).every((p) => p.color === 'e')).toBe(true);
    expect(pp.every((p) => p.id === 'poly')).toBe(true);
    expect(pp[4].contours).toHaveLength(3); // one join disk per vertex
  });

  it('style overrides replace fields per id without touching the scene', () => {
    const scene: Scene = [
      { id: 'a', kind: 'point', at: E2.origin(), style: { color: 'base', radius: 0.05 } },
      {
        id: 'b',
        kind: 'circle',
        center: E2.origin(),
        radius: 0.4,
        style: { fill: { color: 'f' }, edge: { color: 'e', width: 0.02 } },
      },
    ];
    const overrides: StyleOverrides = new Map<string, StyleOverride>([
      ['a', { color: 'hot', opacity: 0.5 }],
      ['b', { fill: null, width: 0.04 }],
    ]);
    const paths = buildPathList(scene, ctx(E2, new Cartesian2(), { overrides }));
    expect(paths.length).toBe(2); // b's fill suppressed
    expect(paths[0].id).toBe('a');
    expect(paths[0].color).toBe('hot');
    expect(paths[0].opacity).toBe(0.5);
    expect(paths[1].id).toBe('b');
    expect(paths[1].color).toBe('e');
    expect(paths[1].contours.length).toBe(2);
  });
});

describe('render2d/canvas', () => {
  it('paints each contour through the affine viewport with even-odd fills', () => {
    const ops: string[] = [];
    const mock = {
      fillStyle: '',
      globalAlpha: 1,
      beginPath: () => ops.push('begin'),
      moveTo: (x: number, y: number) => ops.push(`M${x},${y}`),
      lineTo: (x: number, y: number) => ops.push(`L${x},${y}`),
      closePath: () => ops.push('Z'),
      fill: (rule: string) => ops.push(`fill:${rule}:${mock.fillStyle}:${mock.globalAlpha}`),
    };
    const cam: Camera = { view: identity(3), scalePx: 100, centerPx: [200, 150] };
    const paths = [
      {
        id: 'x',
        contours: [Float64Array.of(0, 0, 1, 0, 0, 1)],
        color: 'red',
        opacity: 0.5,
      },
    ];
    paint(mock as unknown as CanvasRenderingContext2D, paths, cam);
    // V: sx = 200 + 100·uₓ, sy = 150 − 100·u_y.
    expect(ops).toEqual([
      'begin',
      'M200,150',
      'L300,150',
      'L200,50',
      'Z',
      'fill:evenodd:red:0.5',
    ]);
    expect(mock.globalAlpha).toBe(1); // restored
  });
});

describe('render2d/sample: sampleCurve core', () => {
  it('always splits at least once (symmetric-curve guard)', () => {
    // A straight Euclidean segment: flatness is identically zero, yet the
    // forced initial split must still yield the midpoint.
    const a = E2.origin();
    const b = E2.exp(a, Float64Array.of(0, 1, 0), 2);
    const { samples } = sampleCurve(E2.geodesic(a, b), 0, 1, new Cartesian2(), SCALE_PX, DEFAULT_TOLERANCES);
    expect(samples.length).toBe(3);
    expect(samples[1].t).toBeCloseTo(0.5, 12);
  });
});

// ── V2.2: the domain item ───────────────────────────────────────────────────

describe('render2d/scene: the domain item (V2.2)', () => {
  const size: ViewSize = { widthPx: 400, heightPx: 400 };
  const cam: Camera = { view: identity(3), scalePx: 150, centerPx: [200, 200] };
  const domainScene: Scene = [
    {
      id: 'domain',
      kind: 'domain',
      style: { fill: { color: '#eee' }, rim: { color: '#999', widthPx: 2 } },
    },
  ];

  function contourRadii(contour: Float64Array): number[] {
    const radii: number[] = [];
    for (let i = 0; i < contour.length; i += 2) radii.push(Math.hypot(contour[i], contour[i + 1]));
    return radii;
  }

  it('disk charts: the fill circle at the domain radius, the rim annulus at px width', () => {
    const model = new Poincare2();
    const paths = buildPathList(domainScene, { geom: H2, model, camera: cam, size });
    expect(paths).toHaveLength(2);

    const [fill, rim] = paths;
    expect(fill.contours).toHaveLength(1);
    for (const r of contourRadii(fill.contours[0])) expect(r).toBeCloseTo(1, 12);

    expect(rim.contours).toHaveLength(2);
    const w = 2 / cam.scalePx;
    const radiiA = contourRadii(rim.contours[0]);
    const radiiB = contourRadii(rim.contours[1]);
    for (const r of radiiA) expect(r).toBeCloseTo(1 + w / 2, 12);
    for (const r of radiiB) expect(r).toBeCloseTo(1 - w / 2, 12);
  });

  it('the fill polygon is flat to tolerance (sagitta under flatnessPx)', () => {
    const model = new Klein2();
    const paths = buildPathList(domainScene, { geom: H2, model, camera: cam, size });
    const c = paths[0].contours[0];
    const n = c.length / 2;
    // Sagitta of one segment of the inscribed n-gon, in px.
    const sagittaPx = 1 * (1 - Math.cos(Math.PI / n)) * cam.scalePx;
    expect(sagittaPx).toBeLessThanOrEqual(DEFAULT_TOLERANCES.flatnessPx + 1e-9);
  });

  it('plane charts: the fill is the visible frame; no rim emitted', () => {
    const model = new Cartesian2();
    const paths = buildPathList(domainScene, { geom: E2, model, camera: cam, size });
    expect(paths).toHaveLength(1);
    const rect = paths[0].contours[0];
    expect(rect.length).toBe(8);
    const f = frameOf(cam, size);
    const xs = [rect[0], rect[2], rect[4], rect[6]];
    const ys = [rect[1], rect[3], rect[5], rect[7]];
    expect(Math.min(...xs)).toBeCloseTo(f.minX, 12);
    expect(Math.max(...xs)).toBeCloseTo(f.maxX, 12);
    expect(Math.min(...ys)).toBeCloseTo(f.minY, 12);
    expect(Math.max(...ys)).toBeCloseTo(f.maxY, 12);
  });

  it('ignores style overrides (view dressing, not scene content)', () => {
    const model = new Poincare2();
    const overrides: StyleOverrides = new Map<string, StyleOverride>([
      ['domain', { color: '#f00', opacity: 0.1, fill: null }],
    ]);
    const plain = buildPathList(domainScene, { geom: H2, model, camera: cam, size });
    const overridden = buildPathList(domainScene, { geom: H2, model, camera: cam, size, overrides });
    expect(overridden).toEqual(plain);
  });
});

// ── V3.2: pure camera transforms and the hit test ───────────────────────────

describe('render2d/interact: camera transforms (V3.2)', () => {
  const cam: Camera = { view: identity(3), scalePx: 100, centerPx: [200, 220] };

  it('zoom fixes the render point under the cursor and composes multiplicatively', () => {
    const cursor: [number, number] = [260, 180];
    const before = [(cursor[0] - cam.centerPx[0]) / cam.scalePx, (cam.centerPx[1] - cursor[1]) / cam.scalePx];
    const z = zoomedCamera(cam, cursor, 1.7);
    expect((cursor[0] - z.centerPx[0]) / z.scalePx).toBeCloseTo(before[0], 12);
    expect((z.centerPx[1] - cursor[1]) / z.scalePx).toBeCloseTo(before[1], 12);
    const zz = zoomedCamera(z, cursor, 2);
    const direct = zoomedCamera(cam, cursor, 3.4);
    expect(zz.scalePx).toBeCloseTo(direct.scalePx, 12);
    expect(zz.centerPx[0]).toBeCloseTo(direct.centerPx[0], 10);
    expect(zz.centerPx[1]).toBeCloseTo(direct.centerPx[1], 10);
  });

  it('pan shifts the center only', () => {
    const p = pannedCamera(cam, 15, -8);
    expect(p.centerPx).toEqual([215, 212]);
    expect(p.scalePx).toBe(cam.scalePx);
    expect(p.view).toBe(cam.view);
  });

  const dragCharts: { name: string; geom: Geom2; model: Model<Point2> }[] = [
    { name: 'H2/klein', geom: H2, model: new Klein2() },
    { name: 'H2/poincare', geom: H2, model: new Poincare2() },
    { name: 'E2/cartesian', geom: E2, model: new Cartesian2() },
    { name: 'S2/stereographic', geom: S2, model: new Stereographic2() },
  ];

  it.each(dragCharts.map((c) => [c.name, c] as const))(
    '%s: the grabbed content point lands under the cursor, view stays an isometry',
    (_name, { geom, model }) => {
      const scalePx = model.domain.kind === 'disk' ? 180 : 60;
      let camera: Camera = { view: identity(3), scalePx, centerPx: [200, 200] };
      const fromPx: [number, number] = [230, 190];
      const toPx: [number, number] = [180, 240];

      // The canonical content point grabbed at fromPx.
      const x0 = geom.apply(geom.inverse(camera.view), unprojectScreen(model, camera, fromPx)!);
      const dragged = draggedCamera(geom, modelUnprojector(model), camera, fromPx, toPx);
      expect(dragged).not.toBeNull();
      camera = dragged!;

      const u = model.project(geom.apply(camera.view, x0));
      expect(camera.centerPx[0] + camera.scalePx * u[0]).toBeCloseTo(toPx[0], 8);
      expect(camera.centerPx[1] - camera.scalePx * u[1]).toBeCloseTo(toPx[1], 8);
      expect(isometryResidual(geom, camera.view)).toBeLessThan(1e-12);
    },
  );

  it('drag guards: outside the disk domain, vanishing steps', () => {
    const camera: Camera = { view: identity(3), scalePx: 100, centerPx: [200, 200] };
    const model = new Klein2();
    expect(draggedCamera(H2, modelUnprojector(model), camera, [350, 200], [340, 200])).toBeNull(); // |u| > 1
    expect(draggedCamera(H2, modelUnprojector(model), camera, [230, 190], [230, 190])).toBeNull(); // no move
    expect(unprojectScreen(model, camera, [301, 200])).toBeNull();
  });

  it('a simulated drag session stays on the isometry group (RENORM_EVERY)', () => {
    const model = new Poincare2();
    let camera: Camera = { view: identity(3), scalePx: 180, centerPx: [200, 200] };
    const rand = rng(36);
    let steps = 0;
    for (let k = 0; k < 600; k++) {
      const from: [number, number] = [150 + 100 * rand(), 150 + 100 * rand()];
      const to: [number, number] = [from[0] + 8 * (rand() - 0.5), from[1] + 8 * (rand() - 0.5)];
      const next = draggedCamera(H2, modelUnprojector(model), camera, from, to);
      if (!next) continue;
      camera = next;
      if (++steps % RENORM_EVERY === 0) {
        camera = { ...camera, view: H2.renormalizeIsometry(camera.view) };
      }
    }
    camera = { ...camera, view: H2.renormalizeIsometry(camera.view) };
    expect(steps).toBeGreaterThan(500); // the session really dragged
    expect(isometryResidual(H2, camera.view)).toBeLessThan(1e-12);
  });
});

describe('sphereview: front-sheet unproject and globe rotation (stage 2a)', () => {
  const D = 5;
  const persp = new SpherePerspective(D);

  it('unproject ∘ project = id on each sheet; null outside the silhouette', () => {
    const rand = rng(37);
    for (let k = 0; k < 20; k++) {
      // A random point, pushed onto a definite sheet by its p₀ sign.
      const theta = 2 * Math.PI * rand();
      const z = 2 * rand() - 1;
      const p = Float64Array.of(z, Math.sqrt(1 - z * z) * Math.cos(theta), Math.sqrt(1 - z * z) * Math.sin(theta));
      if (Math.abs(persp.sheet(p)) < 1e-3) continue; // skip near-silhouette
      const sheet = persp.sheet(p) > 0 ? 'front' : 'back';
      const back = persp.unproject(persp.project(p), sheet)!;
      for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(p[i], 10);
    }
    const R = persp.silhouetteRadius();
    expect(persp.unproject(Float64Array.of(R * 1.01, 0, 0), 'front')).toBeNull();
    // project ∘ unproject = id inside.
    const u = Float64Array.of(0.4, -0.7, 0);
    for (const sheet of ['front', 'back'] as const) {
      const p = persp.unproject(u, sheet)!;
      expect(persp.project(p)[0]).toBeCloseTo(u[0], 10);
      expect(persp.project(p)[1]).toBeCloseTo(u[1], 10);
      expect(persp.sheet(p) > 0).toBe(sheet === 'front');
    }
  });

  it('globe drag: the grabbed front-sheet point lands under the cursor, eyeDistance survives', () => {
    const unproject = sphereUnprojector(persp);
    let camera: SphereCamera = { view: identity(3), scalePx: 150, centerPx: [200, 200], eyeDistance: D };
    const fromPx: [number, number] = [230, 190];
    const toPx: [number, number] = [190, 230];

    const x0 = S2.apply(S2.inverse(camera.view), unproject(camera, fromPx)!);
    const next = draggedCamera(S2, unproject, camera, fromPx, toPx);
    expect(next).not.toBeNull();
    camera = next!;

    expect(camera.eyeDistance).toBe(D); // the spread preserves the subtype
    const u = persp.project(S2.apply(camera.view, x0));
    expect(camera.centerPx[0] + camera.scalePx * u[0]).toBeCloseTo(toPx[0], 8);
    expect(camera.centerPx[1] - camera.scalePx * u[1]).toBeCloseTo(toPx[1], 8);
    expect(isometryResidual(S2, camera.view)).toBeLessThan(1e-12);

    // Outside the silhouette: the guard.
    expect(draggedCamera(S2, unproject, camera, [395, 200], [390, 200])).toBeNull();
  });

  it('zoom and pan preserve camera subtypes', () => {
    const camera: SphereCamera = { view: identity(3), scalePx: 150, centerPx: [200, 200], eyeDistance: D };
    expect(zoomedCamera(camera, [220, 210], 1.5).eyeDistance).toBe(D);
    expect(pannedCamera(camera, 5, 5).eyeDistance).toBe(D);
  });
});

describe('render2d/interact: hitTest (V3.2)', () => {
  // E²/Cartesian: screen ↔ canonical arithmetic is exact and hand-checkable.
  const camera: Camera = { view: identity(3), scalePx: 50, centerPx: [200, 200] };
  const size: ViewSize = { widthPx: 400, heightPx: 400 };
  const ctx: BuildContext = { geom: E2, model: new Cartesian2(), camera, size };
  const px = (x: number, y: number): [number, number] => [200 + 50 * x, 200 - 50 * y];
  const P = (x: number, y: number) => Float64Array.of(1, x, y);

  const scene: Scene = [
    { id: 'domain', kind: 'domain', style: { fill: { color: '#eee' } } },
    {
      id: 'tile',
      kind: 'polygon',
      vertices: [P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)],
      style: { fill: { color: '#fda' } },
    },
    { id: 'node', kind: 'point', at: P(0, 0), style: { color: '#111', radius: 0.1 } },
    { id: 'ring', kind: 'circle', center: P(3, 0), radius: 0.5, style: { edge: { color: '#28c', width: 0.05 } } },
    { id: 'wall', kind: 'geodesic', source: { type: 'line', wall: Hyperplane.fromCovector(E2, Float64Array.of(-3, 0, 1)) }, style: { color: '#c33', width: 0.1 } },
    { id: 'edge', kind: 'geodesic', source: { type: 'segment', a: P(-3, -2), b: P(-1, -2) }, style: { color: '#2a2', width: 0.1 } },
  ];

  it('topmost wins: the point over the tile, the tile elsewhere', () => {
    expect(hitTest(scene, ctx, px(0, 0))).toBe('node');
    expect(hitTest(scene, ctx, px(0.6, 0.6))).toBe('tile');
  });

  it('the domain is never hit; empty space misses', () => {
    expect(hitTest(scene, ctx, px(2, 2))).toBeNull();
  });

  it('circle edge: hit on the ring, miss in the unfilled interior', () => {
    expect(hitTest(scene, ctx, px(3.5, 0))).toBe('ring');
    expect(hitTest(scene, ctx, px(3, 0))).toBeNull();
  });

  it('wall line { y = 3 } hits within half-width + slop', () => {
    expect(hitTest(scene, ctx, px(1.7, 3.02))).toBe('wall');
    expect(hitTest(scene, ctx, px(1.7, 3.5))).toBeNull();
  });

  it('segments respect their endpoints (slop-sized overhang only)', () => {
    expect(hitTest(scene, ctx, px(-2, -2.03))).toBe('edge');
    expect(hitTest(scene, ctx, px(-4, -2))).toBeNull(); // on the line, beyond the cap
  });

  it('the px slop maps through the chart scale', () => {
    // radius 0.1 + slop 4px/50 = 0.08 ⇒ hits to 0.18, misses at 0.2.
    expect(hitTest(scene, ctx, px(0.17, 0))).toBe('node');
    expect(hitTest(scene, ctx, px(0.2, 0))).toBe('tile'); // past the mark, still on the tile
  });

  it('convex containment works on the sphere too', () => {
    const sctx: BuildContext = { geom: S2, model: new Stereographic2(), camera, size };
    const tri: Scene = [
      {
        id: 'tri',
        kind: 'polygon',
        vertices: [
          S2.exp(S2.origin(), Float64Array.of(0, 1, 0), 0.4),
          S2.exp(S2.origin(), Float64Array.of(0, -0.5, 0.8), 0.4),
          S2.exp(S2.origin(), Float64Array.of(0, -0.5, -0.8), 0.4),
        ],
        style: { fill: { color: '#fda' } },
      },
    ];
    expect(hitTest(tri, sctx, [200, 200])).toBe('tri'); // the origin projects to the center
    expect(hitTest(tri, sctx, px(1, 1))).toBeNull();
  });
});

// ── P1: intrinsic dashed strokes ────────────────────────────────────────────

describe('render2d/scene: dashRanges (P1)', () => {
  it('chops a length-10 curve with on=2, off=1 into the hand-checked ranges', () => {
    // Parameter [0, 5] at speed 2 ⇒ intrinsic length 10.
    const r = dashRanges(0, 5, 2, { on: 2, off: 1 });
    expect(r).toEqual([
      [0, 1],
      [1.5, 2.5],
      [3, 4],
      [4.5, 5],
    ]);
  });

  it('phase slides the pattern; degenerate patterns fall back to solid', () => {
    const r = dashRanges(0, 1, 6, { on: 2, off: 1, phase: 1 });
    expect(r[0]).toEqual([0, 1 / 6]); // the first dash arrives already half-spent
    expect(dashRanges(0, 1, 6, { on: 0, off: 1 })).toEqual([[0, 1]]);
    expect(dashRanges(0, 1, 6, { on: 1, off: 0 })).toEqual([[0, 1]]);
    expect(dashRanges(0, 1, 0, { on: 1, off: 1 })).toEqual([[0, 1]]);
  });

  it('denser than MAX_DASHES falls back to solid', () => {
    expect(dashRanges(0, 1, 1e6, { on: 0.1, off: 0.1 })).toEqual([[0, 1]]);
  });
});

describe('render2d/scene: dashed strokes through the pipeline (P1)', () => {
  const size: ViewSize = { widthPx: 400, heightPx: 400 };
  const camera: Camera = { view: identity(3), scalePx: 50, centerPx: [200, 200] };

  it('a Euclidean segment of length 4 with on=off=0.5 yields 4 dash contours in one path', () => {
    const scene: Scene = [
      {
        id: 'seg',
        kind: 'geodesic',
        source: { type: 'segment', a: Float64Array.of(1, -2, 0), b: Float64Array.of(1, 2, 0) },
        style: { color: '#c33', width: 0.05, dash: { on: 0.5, off: 0.5 } },
      },
    ];
    const paths = buildPathList(scene, { geom: E2, model: new Cartesian2(), camera, size });
    expect(paths).toHaveLength(1);
    expect(paths[0].contours).toHaveLength(4); // ON at [0,.5],[1,1.5],[2,2.5],[3,3.5]
    // Each dash's spine spans 0.5 render units: bbox width ≈ 0.5 + stroke ends.
    for (const c of paths[0].contours) {
      let minX = Infinity;
      let maxX = -Infinity;
      for (let i = 0; i < c.length; i += 2) {
        minX = Math.min(minX, c[i]);
        maxX = Math.max(maxX, c[i]);
      }
      expect(maxX - minX).toBeCloseTo(0.5, 6);
    }
  });

  it('dashes are intrinsic: equal-length dashes shrink toward the Poincaré boundary', () => {
    const a = H2.origin();
    const b = H2.exp(a, Float64Array.of(0, 1, 0), 4); // far toward the boundary
    const scene: Scene = [
      {
        id: 'seg',
        kind: 'geodesic',
        source: { type: 'segment', a, b },
        style: { color: '#c33', width: 0.05, dash: { on: 0.5, off: 0.5 } },
      },
    ];
    const paths = buildPathList(scene, { geom: H2, model: new Poincare2(), camera: { ...camera, scalePx: 180 }, size });
    const spans = paths[0].contours.map((c) => {
      let minX = Infinity;
      let maxX = -Infinity;
      for (let i = 0; i < c.length; i += 2) {
        minX = Math.min(minX, c[i]);
        maxX = Math.max(maxX, c[i]);
      }
      return maxX - minX;
    });
    expect(spans).toHaveLength(4); // intrinsic length 4, on = off = 0.5
    for (let i = 1; i < spans.length; i++) expect(spans[i]).toBeLessThan(spans[i - 1]); // shrinking
    expect(spans[3]).toBeLessThan(spans[0] / 3); // and dramatically so
  });

  it('a dashed circle edge closes its pattern around the circumference', () => {
    const r = 0.6;
    const circumference = 2 * Math.PI * r; // E²
    const on = 0.3;
    const off = 0.2;
    const scene: Scene = [
      {
        id: 'ring',
        kind: 'circle',
        center: E2.origin(),
        radius: r,
        style: { edge: { color: '#28c', width: 0.04, dash: { on, off } } },
      },
    ];
    const paths = buildPathList(scene, { geom: E2, model: new Cartesian2(), camera, size });
    expect(paths).toHaveLength(1);
    expect(paths[0].contours.length).toBe(Math.ceil(circumference / (on + off)));
  });

  it('dashed polygon edges: per-edge patterns, one path per edge', () => {
    const scene: Scene = [
      {
        id: 'poly',
        kind: 'polygon',
        vertices: [Float64Array.of(1, 0, 0), Float64Array.of(1, 2, 0), Float64Array.of(1, 0, 2)],
        style: { edge: { color: '#a52', width: 0.04, dash: { on: 0.4, off: 0.2 } } },
      },
    ];
    const paths = buildPathList(scene, { geom: E2, model: new Cartesian2(), camera, size });
    expect(paths).toHaveLength(4); // one per edge + the P2 join disks
    // Edge lengths 2, 2√2, 2 ⇒ dash counts ⌈len/0.6⌉ = 4, 5, 4; then 3 joins.
    expect(paths.map((p) => p.contours.length)).toEqual([4, 5, 4, 3]);
  });

  it('undashed output is unchanged by the refactor (spot check: a wall stroke)', () => {
    const wall = Hyperplane.fromCovector(E2, Float64Array.of(0, 0, 1));
    const scene: Scene = [
      { id: 'w', kind: 'geodesic', source: { type: 'line', wall }, style: { color: '#c33', width: 0.1 } },
    ];
    const paths = buildPathList(scene, { geom: E2, model: new Cartesian2(), camera, size });
    expect(paths).toHaveLength(1);
    expect(paths[0].contours).toHaveLength(1); // one solid outline
  });
});

// ── P2: corner joins ────────────────────────────────────────────────────────

describe('render2d/scene: polygon corner joins (P2)', () => {
  const size: ViewSize = { widthPx: 400, heightPx: 400 };
  const camera: Camera = { view: identity(3), scalePx: 50, centerPx: [200, 200] };

  it('a stroked square emits 4 edge paths + 1 join path of 4 disks at the vertices', () => {
    const w = 0.1;
    const verts = [Float64Array.of(1, -1, -1), Float64Array.of(1, 1, -1), Float64Array.of(1, 1, 1), Float64Array.of(1, -1, 1)];
    const scene: Scene = [
      { id: 'sq', kind: 'polygon', vertices: verts, style: { edge: { color: '#a52', width: w } } },
    ];
    const paths = buildPathList(scene, { geom: E2, model: new Cartesian2(), camera, size });
    expect(paths).toHaveLength(5);
    const joins = paths[4];
    expect(joins.contours).toHaveLength(4);
    // Each join is the w/2 disk at its vertex (E²/Cartesian: an exact circle).
    joins.contours.forEach((c, k) => {
      const vx = verts[k][1];
      const vy = verts[k][2];
      for (let i = 0; i < c.length; i += 2) {
        expect(Math.hypot(c[i] - vx, c[i + 1] - vy)).toBeCloseTo(w / 2, 9);
      }
    });
  });

  it('fill-only polygons emit no join path', () => {
    const scene: Scene = [
      {
        id: 'p',
        kind: 'polygon',
        vertices: [Float64Array.of(1, 0, 0), Float64Array.of(1, 1, 0), Float64Array.of(1, 0, 1)],
        style: { fill: { color: '#fda' } },
      },
    ];
    const paths = buildPathList(scene, { geom: E2, model: new Cartesian2(), camera, size });
    expect(paths).toHaveLength(1); // the fill alone
  });
});

// ── V2.4: the SVG serializer ────────────────────────────────────────────────

describe('render2d/svg: the serializer (V2.4)', () => {
  const camera: Camera = { view: identity(3), scalePx: 150, centerPx: [200, 220] };
  const size: ViewSize = { widthPx: 400, heightPx: 440 };

  it('applies the painter’s viewport exactly (synthetic list, hand-checked)', () => {
    const paths: PathList = [
      { id: 'a', contours: [Float64Array.of(0, 0, 1, 0, 0, 1)], color: '#123456', opacity: 1 },
      {
        id: 'b',
        contours: [Float64Array.of(0, 0, 1, 0, 1, 1, 0, 1), Float64Array.of(0.2, 0.2, 0.8, 0.2, 0.5, 0.8)],
        color: 'red',
        opacity: 0.5,
      },
      { id: 'skip', contours: [Float64Array.of(0, 0)], color: 'blue', opacity: 1 }, // degenerate: omitted
    ];
    const svg = toSvg(paths, camera, size);

    expect(svg).toContain('width="400" height="440" viewBox="0 0 400 440"');
    // (0,0) → (200,220); (1,0) → (350,220); (0,1) → (200,70): the y-flip.
    expect(svg).toContain('data-id="a" fill="#123456" fill-rule="evenodd" d="M200 220L350 220L200 70Z"');
    expect(svg).toContain('fill-opacity="0.5"');
    expect((svg.match(/<path /g) ?? []).length).toBe(2); // 'skip' emitted nothing
    // b's two contours live in ONE d (filled together, even-odd — the annulus rule).
    const b = svg.match(/data-id="b"[^>]*d="([^"]*)"/)![1];
    expect((b.match(/M/g) ?? []).length).toBe(2);
    expect((b.match(/Z/g) ?? []).length).toBe(2);
  });

  it('a real scene round-trips: parsed coordinates = viewport(contours) to 2 decimals', () => {
    const scene: Scene = [
      { id: 'domain', kind: 'domain', style: { fill: { color: '#eee' }, rim: { color: '#999', widthPx: 2 } } },
      {
        id: 'circle',
        kind: 'circle',
        center: H2.origin(),
        radius: 0.4,
        style: { fill: { color: '#8cf', opacity: 0.3 }, edge: { color: '#28c', width: 0.05 } },
      },
      {
        id: 'poly',
        kind: 'polygon',
        vertices: [0, 1, 2].map((k) =>
          H2.exp(H2.origin(), Float64Array.of(0, Math.cos((2 * k * Math.PI) / 3), Math.sin((2 * k * Math.PI) / 3)), 0.8),
        ),
        style: { fill: { color: '#fda' }, edge: { color: '#a52', width: 0.04 } },
      },
    ];
    const paths = buildPathList(scene, { geom: H2, model: new Poincare2(), camera, size });
    const svg = toSvg(paths, camera, size);

    const els = [...svg.matchAll(/<path data-id="([^"]*)"[^>]*d="([^"]*)"/g)];
    expect(els.length).toBe(paths.length);
    const [cx, cy] = camera.centerPx;
    els.forEach((el, k) => {
      expect(el[1]).toBe(paths[k].id);
      const nums = [...el[2].matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
      let i = 0;
      for (const contour of paths[k].contours) {
        for (let j = 0; j < contour.length; j += 2, i++) {
          expect(Math.abs(nums[i][0] - (cx + camera.scalePx * contour[j]))).toBeLessThanOrEqual(0.005 + 1e-9);
          expect(Math.abs(nums[i][1] - (cy - camera.scalePx * contour[j + 1]))).toBeLessThanOrEqual(0.005 + 1e-9);
        }
      }
      expect(nums.length).toBe(i);
    });
  });

  it('escapes attribute text', () => {
    const paths: PathList = [
      { id: 'a"<&b', contours: [Float64Array.of(0, 0, 1, 0, 0, 1)], color: '#000', opacity: 1 },
    ];
    const svg = toSvg(paths, camera, size);
    expect(svg).toContain('data-id="a&quot;&lt;&amp;b"');
  });
});

// ── V2.3: fill honesty ──────────────────────────────────────────────────────

describe('render2d/scene: fill honesty (V2.3)', () => {
  const model = new Stereographic2();
  const size: ViewSize = { widthPx: 400, heightPx: 400 };
  const cam = (view: Isometry2): Camera => ({ view, scalePx: 60, centerPx: [200, 200] });

  /** Rotation by angle a in the (i, j) coordinate plane of ambient R³. */
  function rot(i: number, j: number, a: number): Isometry2 {
    const rows = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    rows[i][i] = Math.cos(a);
    rows[j][j] = Math.cos(a);
    rows[i][j] = -Math.sin(a);
    rows[j][i] = Math.sin(a);
    return mat3(rows);
  }

  it('the real (2,3,5) far tile: exactly its fill is dropped, its neighbors kept', () => {
    const spec: RealizationSpec = {
      geometry: 'spherical',
      dim: 2,
      combinatorics: { kind: 'polygon', cyclicOrder: [0, 1, 2] },
      decorations: [
        { walls: [0, 1], order: 2 },
        { walls: [1, 2], order: 3 },
        { walls: [2, 0], order: 5 },
      ],
    };
    const group = groupFromPolygon(solvePolygon(spec));
    const tiles = group.tessellate(20);
    expect(tiles).toHaveLength(120);

    // Tip the view generically; the puncture preimage then sits in one tile.
    const tip = matMul(rot(0, 1, 0.55), rot(0, 2, 0.35));
    const anti = S2.apply(S2.inverse(tip), Float64Array.of(-1, 0, 0));
    const farIds = tiles
      .filter((t) => t.polytope.facets.every((f) => f.side(anti) <= 1e-9))
      .map((t) => `tile:${wordId(t.word)}`);
    expect(farIds).toHaveLength(1);

    const scene: Scene = tiles.map((t) => ({
      id: `tile:${wordId(t.word)}`,
      kind: 'polygon' as const,
      vertices: t.polytope.vertices,
      style: { fill: { color: '#eee', opacity: 0.9 } },
    }));
    const paths = buildPathList(scene, { geom: S2, model, camera: cam(tip), size });
    const emitted = new Set(paths.map((p) => p.id));

    expect(emitted.has(farIds[0])).toBe(false); // the wrap, dropped
    expect(emitted.has('tile:e')).toBe(true); // the identity chamber, kept
    expect(emitted.size).toBeGreaterThan(100); // only far-cap tiles fall off-frame
  });

  it('drops a circle fill that wraps the puncture, keeps honest ones', () => {
    const near = 0.1;
    const scene: Scene = [
      // Honest: a small circle at the chart center.
      { id: 'honest', kind: 'circle', center: Float64Array.of(1, 0, 0), radius: 0.3, style: { fill: { color: '#8cf' } } },
      // Wrapped: centered near the puncture, radius covering it — the loop
      // is bounded and finite, only the ray cast can catch it.
      {
        id: 'wrapped',
        kind: 'circle',
        center: Float64Array.of(-Math.cos(near), Math.sin(near), 0),
        radius: 0.3,
        style: { fill: { color: '#8cf' } },
      },
      // Degenerate: centered exactly at the puncture — non-finite center.
      { id: 'at-pole', kind: 'circle', center: Float64Array.of(-1, 0, 0), radius: 0.3, style: { fill: { color: '#8cf' } } },
    ];
    const emitted = new Set(buildPathList(scene, { geom: S2, model, camera: cam(identity(3)), size }).map((p) => p.id));
    expect(emitted.has('honest')).toBe(true);
    expect(emitted.has('wrapped')).toBe(false);
    expect(emitted.has('at-pole')).toBe(false);
  });

  it('never drops in H or E — embeddings cannot wrap', () => {
    // A near-boundary Poincaré polygon: kept without even computing the test.
    const verts = [0, 1, 2, 3].map((k) =>
      H2.exp(H2.origin(), Float64Array.of(0, Math.cos((k * Math.PI) / 2), Math.sin((k * Math.PI) / 2)), 3),
    );
    const scene: Scene = [{ id: 'poly', kind: 'polygon', vertices: verts, style: { fill: { color: '#eee' } } }];
    const paths = buildPathList(scene, { geom: H2, model: new Poincare2(), camera: cam(identity(3)), size });
    expect(paths.map((p) => p.id)).toEqual(['poly']);
  });
});

// ── V2.1: the pre-sampling cull ─────────────────────────────────────────────

describe('render2d/scene: preCulled (V2.1)', () => {
  const frame: Frame = { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  const u = (x: number, y: number) => Float64Array.of(x, y, 0);
  const pad = (m: number) => () => 2 * m; // intrinsicRadius × scale × 2, pre-multiplied

  it('drops sub-pixel items in any chart', () => {
    expect(preCulled([u(0.5, 0.5)], pad(1e-4), false, frame, 100, 0.5)).toBe(true);
  });

  it('keeps items whose padded extent clears cullPx', () => {
    expect(preCulled([u(0.5, 0.5)], pad(0.1), false, frame, 100, 0.5)).toBe(false);
  });

  it('drops off-frame items only when the chart is eligible', () => {
    const far = [u(5, 5), u(6, 5)];
    expect(preCulled(far, pad(0.1), true, frame, 100, 0.5)).toBe(true);
    expect(preCulled(far, pad(0.1), false, frame, 100, 0.5)).toBe(false);
  });

  it('the pad rescues an item hugging the frame from outside', () => {
    expect(preCulled([u(1.05, 0)], pad(0.05), true, frame, 100, 0.5)).toBe(false);
  });

  it('keeps anything with a non-finite projection (unboundable)', () => {
    expect(preCulled([u(Infinity, 0)], pad(1e-9), true, frame, 100, 0.5)).toBe(false);
    expect(preCulled([], pad(1), true, frame, 100, 0.5)).toBe(false);
  });

  it('never evaluates the pad for an on-frame, super-cull item', () => {
    let evaluated = false;
    const spy = () => {
      evaluated = true;
      return 1;
    };
    expect(preCulled([u(-0.5, 0), u(0.5, 0)], spy, true, frame, 100, 0.5)).toBe(false);
    expect(evaluated).toBe(false);
  });
});

describe('pre-cull safety on the Milestone-1 scenes (V2.1)', () => {
  /** A compact stand-in for the demo's group scene: tiles + incircles + Cayley. */
  function groupScene(kind: GeometryKind, orders: [number, number, number], maxWord: number) {
    const spec: RealizationSpec = {
      geometry: kind,
      dim: 2,
      combinatorics: { kind: 'polygon', cyclicOrder: [0, 1, 2] },
      decorations: [
        { walls: [0, 1], order: orders[0] },
        { walls: [1, 2], order: orders[1] },
        { walls: [2, 0], order: orders[2] },
      ],
    };
    const realized = solvePolygon(spec);
    const group = groupFromPolygon(realized);
    const r0 = realized.inradius;
    const tiles = group.tessellate(maxWord);
    const graph = group.cayleyGraph(maxWord);
    const points = graph.nodes.map((n) => group.geom.apply(n.element, group.basePoint));
    const scene: Scene = [
      ...tiles.map((t) => ({
        id: `tile:${wordId(t.word)}`,
        kind: 'polygon' as const,
        vertices: t.polytope.vertices,
        style: {
          fill: { color: '#eee', opacity: 0.9 },
          edge: { color: '#333', width: 0.03 * r0 },
        },
      })),
      ...tiles.map((t) => ({
        id: `incircle:${wordId(t.word)}`,
        kind: 'circle' as const,
        center: group.geom.apply(t.element, group.basePoint),
        radius: r0,
        style: { fill: { color: '#8cf', opacity: 0.2 }, edge: { color: '#28c', width: 0.05 * r0 } },
      })),
      ...graph.edges.map((e) => ({
        id: `cayedge:${wordId(graph.nodes[e.a].word)}:${e.generator}`,
        kind: 'geodesic' as const,
        source: { type: 'segment' as const, a: points[e.a], b: points[e.b] },
        style: { color: '#c33', width: 0.06 * r0 },
      })),
      ...graph.nodes.map((n, k) => ({
        id: `cay:${wordId(n.word)}`,
        kind: 'point' as const,
        at: points[k],
        style: { color: '#111', radius: 0.11 * r0 },
      })),
    ];
    return { geom: group.geom, scene };
  }

  const sizePx = 400;
  const camera = (scalePx: number): Camera => ({
    view: identity(3),
    scalePx,
    centerPx: [sizePx / 2, sizePx / 2],
  });

  const panels: { name: string; kind: GeometryKind; orders: [number, number, number]; maxWord: number; model: Model<Point2>; cam: Camera; expectCulls: boolean }[] = [
    // Disk charts framing the whole domain, plus a zoomed Klein camera to
    // exercise the off-frame branch on straight-chart chords. Only the zoomed
    // cameras are guaranteed to cull; the others pin pure output equality.
    { name: 'H/klein', kind: 'hyperbolic', orders: [2, 3, 7], maxWord: 12, model: new Klein2(), cam: camera(185), expectCulls: false },
    { name: 'H/klein zoomed', kind: 'hyperbolic', orders: [2, 3, 7], maxWord: 12, model: new Klein2(), cam: camera(900), expectCulls: true },
    { name: 'H/poincare', kind: 'hyperbolic', orders: [2, 3, 7], maxWord: 12, model: new Poincare2(), cam: camera(185), expectCulls: false },
    { name: 'E/cartesian fit', kind: 'euclidean', orders: [2, 4, 4], maxWord: 10, model: new Cartesian2(), cam: camera(18), expectCulls: false },
    { name: 'E/cartesian detail', kind: 'euclidean', orders: [2, 4, 4], maxWord: 10, model: new Cartesian2(), cam: camera(70), expectCulls: true },
    { name: 'S/stereographic', kind: 'spherical', orders: [2, 3, 5], maxWord: 20, model: new Stereographic2(), cam: camera(60), expectCulls: false },
  ];

  it.each(panels.map((p) => [p.name, p] as const))(
    '%s: the path list is IDENTICAL with the pre-cull on and off',
    (_name, p) => {
      const { geom, scene } = groupScene(p.kind, p.orders, p.maxWord);
      const ctx: BuildContext = { geom, model: p.model, camera: p.cam, size: { widthPx: sizePx, heightPx: sizePx } };
      const fast = buildPathList(scene, ctx);
      const slow = buildPathList(scene, { ...ctx, preCull: false });

      expect(fast.length).toBe(slow.length);
      let mismatches = 0;
      for (let i = 0; i < fast.length; i++) {
        const a = fast[i];
        const b = slow[i];
        if (a.id !== b.id || a.color !== b.color || a.opacity !== b.opacity) mismatches++;
        else if (a.contours.length !== b.contours.length) mismatches++;
        else {
          for (let c = 0; c < a.contours.length && mismatches === 0; c++) {
            const ca = a.contours[c];
            const cb = b.contours[c];
            if (ca.length !== cb.length) mismatches++;
            else for (let k = 0; k < ca.length; k++) if (ca[k] !== cb[k]) mismatches++;
          }
        }
      }
      expect(mismatches).toBe(0);
      if (p.expectCulls) {
        // Not vacuous there: the zoomed frame drops whole items.
        const emittedIds = new Set(fast.map((path) => path.id));
        expect(emittedIds.size).toBeLessThan(scene.length);
      }
    },
  );
});

describe('render2d/png: scaleCamera (§5.6 T3)', () => {
  it('scales the viewport, never the view', () => {
    const view = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const camera = { view, scalePx: 120, centerPx: [300, 250] as const };
    const scaled = scaleCamera(camera, 4);
    expect(scaled.scalePx).toBe(480);
    expect(scaled.centerPx).toEqual([1200, 1000]);
    expect(scaled.view).toBe(view); // same reference: content coordinates untouched
  });

  it('k = 1 is the identity on the numbers', () => {
    const camera = { view: new Float64Array(9), scalePx: 77.5, centerPx: [13, 17] as const };
    const scaled = scaleCamera(camera, 1);
    expect(scaled.scalePx).toBe(77.5);
    expect(scaled.centerPx).toEqual([13, 17]);
  });
});
