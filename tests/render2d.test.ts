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
import { identity } from '@/math/mat';
import { Hyperplane } from '@/geometry/Hyperplane';
import {
  DEFAULT_TOLERANCES,
  type Camera,
  type RenderTolerances,
  type Scene,
  type StyleOverride,
  type StyleOverrides,
  type ViewSize,
} from '@/render2d/types';
import { buildPathList, frameOf, type BuildContext } from '@/render2d/scene';
import { paint } from '@/render2d/canvas';
import { sampleCircle, sampleCurve, sampleSegment, tangentFrame } from '@/render2d/sample';
import { strokeOutline } from '@/render2d/stroke';
import { markAxes, markEllipse } from '@/render2d/marks';
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
    expect(pp.length).toBe(1 + 3); // fill + one path per edge
    expect(pp[0].color).toBe('f');
    expect(pp.slice(1).every((p) => p.color === 'e')).toBe(true);
    expect(pp.every((p) => p.id === 'poly')).toBe(true);
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
