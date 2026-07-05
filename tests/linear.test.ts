import { describe, expect, it } from 'vitest';
import {
  add,
  addScaled,
  clone,
  cross,
  dot,
  norm,
  normSq,
  scale,
  sub,
  tripleCross,
  vec3,
  vec4,
} from '@/math/vec';
import {
  applyToCovector,
  applyToVector,
  identity,
  mat3,
  mat4,
  matInverse,
  matMul,
  matScale,
  matSub,
  matTranspose,
  outer,
} from '@/math/mat';
import type { Vec } from '@/math/vec';
import type { Mat } from '@/math/mat';

const close = (a: number, b: number, eps = 1e-12) => expect(Math.abs(a - b)).toBeLessThan(eps);
const closeVec = (a: Vec | Mat, b: Vec | Mat, eps = 1e-12) => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) close(a[i], b[i], eps);
};

// Fixed, non-symmetric test data (no randomness: failures must reproduce).
const a3 = vec3(1.5, -2, 0.25);
const b3 = vec3(-0.5, 3, 1);
const c3 = vec3(2, 0.5, -1.5);
const A3 = mat3([
  [2, -1, 0.5],
  [1, 3, -2],
  [0.5, 0, 1],
]);
const B3 = mat3([
  [1, 0.5, -1],
  [-2, 1, 0],
  [0, 3, 2],
]);
const A4 = mat4([
  [2, -1, 0, 0.5],
  [1, 3, -2, 0],
  [0.5, 0, 1, -1],
  [0, 2, 0.5, 3],
]);

describe('vec', () => {
  it('constructors store coordinate 0 first, indexed access', () => {
    const v = vec4(7, 1, 2, 3);
    expect(v[0]).toBe(7);
    expect(v[3]).toBe(3);
    expect(v.length).toBe(4);
  });

  it('operations are immutable (inputs untouched, fresh outputs)', () => {
    const before = clone(a3);
    const r = addScaled(a3, b3, 2);
    closeVec(a3, before);
    expect(r).not.toBe(a3);
    closeVec(r, vec3(0.5, 4, 2.25));
  });

  it('vector-space algebra: add/sub/scale/addScaled agree', () => {
    closeVec(add(a3, b3), vec3(1, 1, 1.25));
    closeVec(sub(add(a3, b3), b3), a3);
    closeVec(addScaled(a3, b3, -3), sub(a3, scale(b3, 3)));
  });

  it('dot is symmetric and bilinear; normSq(v) = dot(v,v)', () => {
    close(dot(a3, b3), dot(b3, a3));
    close(dot(scale(a3, 2), b3), 2 * dot(a3, b3));
    close(dot(add(a3, c3), b3), dot(a3, b3) + dot(c3, b3));
    close(normSq(a3), dot(a3, a3));
    close(norm(vec3(3, 4, 0)), 5);
  });

  it('dimension mismatch throws', () => {
    expect(() => add(a3, vec4(1, 2, 3, 4))).toThrow(/mismatch/);
  });

  it('cross: orthogonal to both factors, antisymmetric, right-handed', () => {
    const x = cross(a3, b3);
    close(dot(x, a3), 0);
    close(dot(x, b3), 0);
    closeVec(cross(b3, a3), scale(x, -1));
    closeVec(cross(vec3(1, 0, 0), vec3(0, 1, 0)), vec3(0, 0, 1));
  });

  it('tripleCross: orthogonal to all three factors, alternating', () => {
    const p = vec4(1, 0.5, -2, 1);
    const q = vec4(0, 2, 1, -1);
    const r = vec4(3, -1, 0, 2);
    const x = tripleCross(p, q, r);
    close(dot(x, p), 0);
    close(dot(x, q), 0);
    close(dot(x, r), 0);
    closeVec(tripleCross(q, p, r), scale(x, -1));
    // dot(tripleCross(e1,e2,e3), e0) = det(I) = 1.
    closeVec(
      tripleCross(vec4(0, 1, 0, 0), vec4(0, 0, 1, 0), vec4(0, 0, 0, 1)),
      vec4(1, 0, 0, 0),
    );
  });
});

describe('mat', () => {
  it('mat3/mat4 store row-major; matVec against a hand computation', () => {
    // Row 0 of A3 is (2, -1, 0.5): (A3·a3)[0] = 2·1.5 + (-1)·(-2) + 0.5·0.25.
    const r = applyToVector(A3, a3);
    close(r[0], 2 * 1.5 + -1 * -2 + 0.5 * 0.25);
    close(r[1], 1 * 1.5 + 3 * -2 + -2 * 0.25);
    close(r[2], 0.5 * 1.5 + 0 * -2 + 1 * 0.25);
  });

  it('identity is neutral for matMul and matVec', () => {
    closeVec(matMul(identity(3), A3), A3);
    closeVec(matMul(A3, identity(3)), A3);
    closeVec(applyToVector(identity(4), A4.subarray(0, 4)), A4.subarray(0, 4));
  });

  it('matMul is associative and matches matVec composition', () => {
    closeVec(matMul(matMul(A3, B3), A3), matMul(A3, matMul(B3, A3)));
    closeVec(applyToVector(matMul(A3, B3), a3), applyToVector(A3, applyToVector(B3, a3)));
  });

  it('transpose: involution, (AB)ᵀ = BᵀAᵀ, ⟨Av, w⟩ = ⟨v, Aᵀw⟩', () => {
    closeVec(matTranspose(matTranspose(A3)), A3);
    closeVec(matTranspose(matMul(A3, B3)), matMul(matTranspose(B3), matTranspose(A3)));
    close(dot(applyToVector(A3, a3), b3), dot(a3, applyToVector(matTranspose(A3), b3)));
  });

  it('matInverse: M⁻¹M = MM⁻¹ = I in both dimensions; singular throws', () => {
    closeVec(matMul(matInverse(A3), A3), identity(3));
    closeVec(matMul(A3, matInverse(A3)), identity(3));
    closeVec(matMul(matInverse(A4), A4), identity(4));
    const singular = mat3([
      [1, 2, 3],
      [2, 4, 6],
      [0, 1, 1],
    ]);
    expect(() => matInverse(singular)).toThrow(/singular/);
  });

  it('outer: applyToVector(outer(u,v), w) = dot(v,w)·u; scale/sub entrywise', () => {
    closeVec(applyToVector(outer(a3, b3), c3), scale(a3, dot(b3, c3)));
    closeVec(matSub(matScale(A3, 2), A3), A3);
  });

  it('the two actions: pairing invariance under dual transport', () => {
    // Transport the covector by c ↦ c·g⁻¹ and the vector by v ↦ g·v:
    // the pairing — hence half-space membership — is unchanged.
    close(
      dot(applyToCovector(matInverse(A3), a3), applyToVector(A3, b3)),
      dot(a3, b3),
    );
    // The covector action composes in reverse: c·(AB) = (c·A)·B.
    closeVec(
      applyToCovector(matMul(A3, B3), c3),
      applyToCovector(B3, applyToCovector(A3, c3)),
    );
    // And it is the transpose of the vector action.
    closeVec(applyToCovector(A3, c3), applyToVector(matTranspose(A3), c3));
  });

  it('the reflection shape I − 2(Jc)cᵀ is an involution (built from this layer)', () => {
    // Minkowski J = diag(-1, 1, 1); c a unit spacelike covector ⇒ R² = I.
    const J = mat3([
      [-1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    const c = vec3(0, Math.cos(0.7), Math.sin(0.7)); // cᵀJc = 1
    const R = matSub(identity(3), matScale(outer(applyToVector(J, c), c), 2));
    closeVec(matMul(R, R), identity(3));
  });
});
