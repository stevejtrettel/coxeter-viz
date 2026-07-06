import { describe, expect, it } from 'vitest';
import type { Vec } from '@/math/vec';
import type { Point2 } from '@/geometry/types';
import { Spherical2 } from '@/geometry/Spherical';
import { DEFAULT_TOLERANCES } from '@/render2d/types';
import { sampleSegment, tangentFrame } from '@/render2d/sample';
import { strokeOutline } from '@/render2d/stroke';
import { markAxes } from '@/render2d/marks';
import { SpherePerspective, trigRoots } from '@/sphereview/projection';
import { buildSpherePathList, type SphereBuildContext } from '@/sphereview/scene';
import { sphereHitTest } from '@/sphereview/interact';
import type { SphereCamera } from '@/sphereview/types';
import type { Scene } from '@/render2d/types';
import { Hyperplane } from '@/geometry/Hyperplane';
import { identity } from '@/math/mat';
import { rng } from './helpers';

const S2 = new Spherical2();
const D = 5;
const SCALE_PX = 200;

function randomSpherePoint(rand: () => number, maxDist: number): Point2 {
  const theta = 2 * Math.PI * rand();
  const [e1, e2] = tangentFrame(S2, S2.origin());
  const v = Float64Array.from(e1.map((x, i) => Math.cos(theta) * x + Math.sin(theta) * e2[i]));
  return S2.exp(S2.origin(), v, maxDist * rand());
}

/** Central finite difference of s ↦ P(exp(p, ν, s)) at 0. */
function renderVelocity(persp: SpherePerspective, p: Point2, nu: Vec): [number, number] {
  const eps = 1e-5;
  const up = persp.project(S2.exp(p, nu, eps));
  const um = persp.project(S2.exp(p, nu, -eps));
  return [(up[0] - um[0]) / (2 * eps), (up[1] - um[1]) / (2 * eps)];
}

describe('sphereview/projection: P_d and its ribbon jacobian', () => {
  const persp = new SpherePerspective(D);

  it('rejects eye distances inside the sphere', () => {
    expect(() => new SpherePerspective(1)).toThrow();
    expect(() => new SpherePerspective(0.5)).toThrow();
  });

  it('projects the chart origin with scale d/(d−1) and J = s·I there', () => {
    const p = S2.origin();
    const u = persp.project(p);
    expect(u[0]).toBe(0);
    expect(u[1]).toBe(0);
    const s = D / (D - 1);
    const J = persp.jacobianAt(p);
    expect(J[0]).toBeCloseTo(s, 12);
    expect(J[4]).toBeCloseTo(s, 12);
    expect(J[1]).toBeCloseTo(0, 12);
    expect(J[3]).toBeCloseTo(0, 12);
  });

  it('J is symmetric everywhere', () => {
    const rand = rng(11);
    for (let k = 0; k < 30; k++) {
      const p = randomSpherePoint(rand, Math.PI * 0.95);
      const J = persp.jacobianAt(p);
      expect(J[1]).toBeCloseTo(J[3], 12);
    }
  });

  it('stroke offsets lie on the jacobian ellipse of P_d ∘ exp (ribbon semantics)', () => {
    const rand = rng(22);
    const WIDTH = 0.1;
    for (let k = 0; k < 5; k++) {
      const a = randomSpherePoint(rand, 1.0);
      const b = randomSpherePoint(rand, 1.0);
      const curve = sampleSegment(S2, persp, a, b, SCALE_PX, DEFAULT_TOLERANCES, WIDTH / 2);
      const [contour] = strokeOutline(curve, persp, WIDTH);
      const n = curve.samples.length;
      for (let i = 0; i < n; i++) {
        const s = curve.samples[i];
        const hx = (contour[2 * i] - s.u[0]) / (WIDTH / 2);
        const hy = (contour[2 * i + 1] - s.u[1]) / (WIDTH / 2);
        const [e1, e2] = tangentFrame(S2, s.p);
        const [a00, a10] = renderVelocity(persp, s.p, e1);
        const [a01, a11] = renderVelocity(persp, s.p, e2);
        const det = a00 * a11 - a01 * a10;
        const c1 = (hx * a11 - hy * a01) / det;
        const c2 = (hy * a00 - hx * a10) / det;
        expect(Math.hypot(c1, c2), `sample ${i}`).toBeCloseTo(1, 6);
      }
    }
  });

  it('the view-ray scale collapses exactly at the silhouette', () => {
    const p = Float64Array.of(1 / D, Math.sqrt(1 - 1 / (D * D)), 0);
    const [s1, s2] = markAxes(persp, p);
    expect(s1).toBeGreaterThan(0.5);
    expect(s2).toBeCloseTo(0, 9);
  });

  it('sheet signs and the silhouette radius', () => {
    const persp2 = new SpherePerspective(3);
    expect(persp2.sheet(S2.origin())).toBeGreaterThan(0);
    expect(persp2.sheet(Float64Array.of(-1, 0, 0))).toBeLessThan(0);
    const sil = Float64Array.of(1 / 3, Math.sqrt(1 - 1 / 9), 0);
    expect(persp2.sheet(sil)).toBeCloseTo(0, 12);
    const u = persp2.project(sil);
    expect(Math.hypot(u[0], u[1])).toBeCloseTo(persp2.silhouetteRadius(), 12);
    expect(persp2.silhouetteRadius()).toBeCloseTo(3 / Math.sqrt(8), 12);
  });
});

describe('sphereview/scene: buildSpherePathList', () => {
  const camera: SphereCamera = {
    view: identity(3),
    scalePx: SCALE_PX,
    centerPx: [230, 230],
    eyeDistance: D,
  };
  const size = { widthPx: 460, heightPx: 460 };
  const ctx = (extra?: Partial<SphereBuildContext>): SphereBuildContext => ({ camera, size, ...extra });
  const capRadius = Math.acos(1 / D); // angular radius of the visible cap

  it('splits a wall at the silhouette: back piece, globe, front piece — in that order', () => {
    const wall = Hyperplane.fromCovector(S2, Float64Array.of(0, 0, 1));
    const scene: Scene = [
      { id: 'w', kind: 'geodesic', source: { type: 'line', wall }, style: { color: 'k', width: 0.03 } },
    ];
    const paths = buildSpherePathList(scene, ctx());
    expect(paths.map((p) => p.id)).toEqual(['w', 'sphere', 'sphere:rim', 'w']);
  });

  it('skips flat-chart domain items in a shared scene (V2.2)', () => {
    const scene: Scene = [
      { id: 'domain', kind: 'domain', style: { fill: { color: '#eee' }, rim: { color: '#999', widthPx: 2 } } },
    ];
    const paths = buildSpherePathList(scene, ctx());
    // Only the globe's own dressing — nothing emitted for the domain item.
    expect(paths.map((p) => p.id)).toEqual(['sphere', 'sphere:rim']);
  });

  it('an equatorial wall (p₀ ≡ 0) is entirely back', () => {
    const wall = Hyperplane.fromCovector(S2, Float64Array.of(1, 0, 0));
    const scene: Scene = [
      { id: 'eq', kind: 'geodesic', source: { type: 'line', wall }, style: { color: 'k', width: 0.03 } },
    ];
    const paths = buildSpherePathList(scene, ctx());
    expect(paths.map((p) => p.id)).toEqual(['eq', 'sphere', 'sphere:rim']);
  });

  it('the globe disk has the silhouette radius and the rim is an annulus', () => {
    const paths = buildSpherePathList([], ctx());
    const disk = paths.find((p) => p.id === 'sphere');
    const rim = paths.find((p) => p.id === 'sphere:rim');
    expect(disk).toBeDefined();
    expect(rim?.contours.length).toBe(2);
    const R = new SpherePerspective(D).silhouetteRadius();
    const c = disk!.contours[0];
    for (let i = 0; i < c.length; i += 2) {
      expect(Math.hypot(c[i], c[i + 1])).toBeCloseTo(R, 9);
    }
    expect(buildSpherePathList([], ctx({ sphere: null }))).toEqual([]);
  });

  it('point marks classify by sheet; scene order is preserved within each pass', () => {
    const scene: Scene = [
      { id: 'front', kind: 'point', at: S2.origin(), style: { color: 'k', radius: 0.05 } },
      { id: 'back', kind: 'point', at: Float64Array.of(-1, 0, 0), style: { color: 'k', radius: 0.05 } },
    ];
    const paths = buildSpherePathList(scene, ctx());
    expect(paths.map((p) => p.id)).toEqual(['back', 'sphere', 'sphere:rim', 'front']);
  });

  it('a segment crossing the cap boundary splits into front and back pieces', () => {
    const far = S2.exp(S2.origin(), Float64Array.of(0, 1, 0), capRadius + 0.8);
    const scene: Scene = [
      {
        id: 's',
        kind: 'geodesic',
        source: { type: 'segment', a: S2.origin(), b: far },
        style: { color: 'k', width: 0.03 },
      },
    ];
    const paths = buildSpherePathList(scene, ctx());
    const ids = paths.map((p) => p.id);
    expect(ids.filter((i) => i === 's').length).toBe(2);
    expect(ids.indexOf('s')).toBeLessThan(ids.indexOf('sphere')); // one back piece
    expect(ids.lastIndexOf('s')).toBeGreaterThan(ids.indexOf('sphere')); // one front piece
  });

  it('single-sheet circles keep their fill; cap-wrapping latitude circles split ring + cap (P3)', () => {
    const style = { fill: { color: 'F' }, edge: { color: 'E', width: 0.02 } };
    const small: Scene = [
      { id: 'c', kind: 'circle', center: S2.origin(), radius: 0.5, style },
    ];
    const smallPaths = buildSpherePathList(small, ctx());
    expect(smallPaths.filter((p) => p.color === 'F').length).toBe(1);
    expect(smallPaths.filter((p) => p.color === 'E').length).toBe(1);
    expect(smallPaths.find((p) => p.color === 'E')?.contours.length).toBe(2); // annulus

    // A circle CENTERED on the view axis is a latitude circle (constant p₀):
    // it cannot straddle — beyond the cap its boundary is entirely back, but
    // the region SWALLOWS the whole silhouette (P3 cap-wrap): a back ring
    // [boundary, silhouette] plus the visible cap as a front disk.
    const latitude: Scene = [
      { id: 'c', kind: 'circle', center: S2.origin(), radius: capRadius + 0.3, style },
    ];
    const latPaths = buildSpherePathList(latitude, ctx());
    const latIds = latPaths.map((p) => p.id);
    const latFills = latPaths.filter((p) => p.color === 'F');
    expect(latFills.length).toBe(2);
    expect(latIds.indexOf('c')).toBeLessThan(latIds.indexOf('sphere')); // the ring, back pass
    expect(latIds.lastIndexOf('c')).toBeGreaterThan(latIds.indexOf('sphere')); // the cap, front pass
    expect(latFills[0].contours.length).toBe(2); // boundary + silhouette (even-odd ring)
    expect(latFills[1].contours.length).toBe(1); // the full silhouette disk
    const R = new SpherePerspective(D).silhouetteRadius();
    const disk = latFills[1].contours[0];
    for (let i = 0; i < disk.length; i += 2) {
      expect(Math.hypot(disk[i], disk[i + 1])).toBeCloseTo(R, 9);
    }
  });

  it('straddling fills split at the silhouette: front and back loops (P3)', () => {
    const style = { fill: { color: 'F' }, edge: { color: 'E', width: 0.02 } };
    const offAxis = S2.exp(S2.origin(), Float64Array.of(0, 1, 0), 1.0);
    const straddling: Scene = [
      { id: 'c', kind: 'circle', center: offAxis, radius: 0.8, style },
    ];
    const paths = buildSpherePathList(straddling, ctx());
    const ids = paths.map((p) => p.id);
    const fills = paths.filter((p) => p.color === 'F');
    expect(fills.length).toBe(2); // one loop per sheet
    expect(paths.filter((p) => p.color === 'E').length).toBe(2); // front + back arcs
    expect(ids.indexOf('c')).toBeLessThan(ids.indexOf('sphere'));
    expect(ids.lastIndexOf('c')).toBeGreaterThan(ids.indexOf('sphere'));

    // Both loops close along the silhouette: each contains points at exactly
    // the silhouette radius, and no point beyond it.
    const R = new SpherePerspective(D).silhouetteRadius();
    for (const fill of fills) {
      const c = fill.contours[0];
      let onSil = 0;
      for (let i = 0; i < c.length; i += 2) {
        const r = Math.hypot(c[i], c[i + 1]);
        expect(r).toBeLessThanOrEqual(R + 1e-9);
        if (Math.abs(r - R) < 1e-9) onSil++;
      }
      expect(onSil).toBeGreaterThan(1);
    }
  });

  it('single-sheet polygons fill; straddling polygons split fill and edges (P3)', () => {
    const v = (dir: [number, number], dist: number) =>
      S2.exp(S2.origin(), Float64Array.of(0, dir[0], dir[1]), dist);
    const style = { fill: { color: 'F' }, edge: { color: 'E', width: 0.02 } };
    const small: Scene = [
      {
        id: 'p',
        kind: 'polygon',
        vertices: [v([1, 0], 0.4), v([0, 1], 0.4), v([-0.7, -0.7], 0.4)],
        style,
      },
    ];
    const smallPaths = buildSpherePathList(small, ctx());
    expect(smallPaths.filter((p) => p.color === 'F').length).toBe(1);
    expect(smallPaths.filter((p) => p.color === 'E').length).toBe(3);

    const big: Scene = [
      {
        id: 'p',
        kind: 'polygon',
        vertices: [v([1, 0], 0.3), v([0, 1], capRadius + 0.9), v([-0.7, -0.7], 0.3)],
        style,
      },
    ];
    const bigPaths = buildSpherePathList(big, ctx());
    const ids = bigPaths.map((p) => p.id);
    expect(bigPaths.filter((p) => p.color === 'F').length).toBe(2); // split fill (P3)
    expect(bigPaths.filter((p) => p.color === 'E').length).toBeGreaterThan(3); // edges split
    expect(ids.indexOf('p')).toBeLessThan(ids.indexOf('sphere'));
    expect(ids.lastIndexOf('p')).toBeGreaterThan(ids.indexOf('sphere'));
  });

  it('backDash dashes back pieces only; an item dash wins on both sheets (P3)', () => {
    const wall = Hyperplane.fromCovector(S2, Float64Array.of(0, 0, 1));
    const scene: Scene = [
      { id: 'w', kind: 'geodesic', source: { type: 'line', wall }, style: { color: 'k', width: 0.03 } },
    ];
    const plain = buildSpherePathList(scene, ctx());
    const dashed = buildSpherePathList(scene, ctx({ backDash: { on: 0.2, off: 0.15 } }));
    const back = (paths: ReturnType<typeof buildSpherePathList>) => paths[paths.findIndex((p) => p.id === 'w')];
    const front = (paths: ReturnType<typeof buildSpherePathList>) =>
      paths[paths.map((p) => p.id).lastIndexOf('w')];
    expect(back(plain).contours.length).toBe(1);
    expect(back(dashed).contours.length).toBeGreaterThan(3); // dashes
    expect(front(dashed).contours.length).toBe(1); // front stays solid

    const itemDashed: Scene = [
      {
        id: 'w',
        kind: 'geodesic',
        source: { type: 'line', wall },
        style: { color: 'k', width: 0.03, dash: { on: 0.2, off: 0.15 } },
      },
    ];
    const both = buildSpherePathList(itemDashed, ctx());
    expect(back(both).contours.length).toBeGreaterThan(3);
    expect(front(both).contours.length).toBeGreaterThan(3);
  });

  it('sphereHitTest: front-sheet hover, null outside the silhouette (P3)', () => {
    const tri: Scene = [
      {
        id: 'tri',
        kind: 'polygon',
        vertices: [
          S2.exp(S2.origin(), Float64Array.of(0, 1, 0), 0.4),
          S2.exp(S2.origin(), Float64Array.of(0, -0.5, 0.8), 0.4),
          S2.exp(S2.origin(), Float64Array.of(0, -0.5, -0.8), 0.4),
        ],
        style: { fill: { color: 'F' } },
      },
    ];
    // The origin (front pole under the identity view) projects to centerPx.
    expect(sphereHitTest(tri, camera, [230, 230])).toBe('tri');
    // Well off the triangle but on the globe: miss.
    expect(sphereHitTest(tri, camera, [230 + 0.9 * SCALE_PX, 230])).toBeNull();
    // Outside the silhouette: null.
    const R = new SpherePerspective(D).silhouetteRadius();
    expect(sphereHitTest(tri, camera, [230 + (R + 0.1) * SCALE_PX, 230])).toBeNull();
  });
});

describe('sphereview/projection: trigRoots', () => {
  it('matches brute-force sign scanning', () => {
    const rand = rng(33);
    for (let k = 0; k < 200; k++) {
      const A = 2 * rand() - 1;
      const B = 2 * rand() - 1;
      const C = 3 * (2 * rand() - 1);
      const f = (t: number) => A * Math.cos(t) + B * Math.sin(t) + C;
      const roots = trigRoots(A, B, C);
      // Brute force: sign changes over a fine grid.
      const N = 20000;
      const brute: number[] = [];
      for (let i = 0; i < N; i++) {
        const t0 = (2 * Math.PI * i) / N;
        const t1 = (2 * Math.PI * (i + 1)) / N;
        if (f(t0) === 0 || f(t0) * f(t1) < 0) brute.push(t0);
      }
      expect(roots.length, `A=${A} B=${B} C=${C}`).toBe(brute.length);
      for (let i = 0; i < roots.length; i++) {
        expect(Math.abs(f(roots[i]))).toBeLessThan(1e-12);
        expect(Math.abs(roots[i] - brute[i])).toBeLessThan((2 * Math.PI) / N + 1e-9);
      }
    }
  });

  it('returns roots ascending in [0, 2π) and none for non-crossing data', () => {
    expect(trigRoots(0.1, 0, 5)).toEqual([]);
    expect(trigRoots(0, 0, 0.5)).toEqual([]);
    const roots = trigRoots(1, 0.3, -0.4);
    expect(roots.length).toBe(2);
    expect(roots[0]).toBeLessThan(roots[1]);
    expect(roots[0]).toBeGreaterThanOrEqual(0);
    expect(roots[1]).toBeLessThan(2 * Math.PI);
  });
});
