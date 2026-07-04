import { describe, expect, it } from 'vitest';
import { symmetricEig } from '@/math/symmetricEig';
import { solveLinear } from '@/math/linearSolve';
import { rng } from './helpers';

describe('symmetricEig (cyclic Jacobi)', () => {
  it('diagonalizes a known 2×2', () => {
    const { values } = symmetricEig([
      [2, 1],
      [1, 2],
    ]);
    expect([...values].sort((a, b) => a - b)).toEqual([expect.closeTo(1, 12), expect.closeTo(3, 12)]);
  });

  it('finds the exact zero eigenvalue of a semidefinite (Euclidean-flavored) matrix', () => {
    const { values } = symmetricEig([
      [1, -1],
      [-1, 1],
    ]);
    const sorted = [...values].sort((a, b) => a - b);
    expect(sorted[0]).toBeCloseTo(0, 12);
    expect(sorted[1]).toBeCloseTo(2, 12);
  });

  it('reconstructs A = Σ λ v vᵀ with orthonormal eigenvectors (random symmetric 5×5)', () => {
    const rand = rng(42);
    const n = 5;
    const A = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let i = 0; i < n; i++)
      for (let j = i; j < n; j++) {
        A[i][j] = 2 * rand() - 1;
        A[j][i] = A[i][j];
      }
    const { values, vectors } = symmetricEig(A);

    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let a = 0; a < n; a++) s += values[a] * vectors[a][i] * vectors[a][j];
        expect(s).toBeCloseTo(A[i][j], 9);
      }
    for (let a = 0; a < n; a++)
      for (let b = 0; b < n; b++) {
        let dot = 0;
        for (let i = 0; i < n; i++) dot += vectors[a][i] * vectors[b][i];
        expect(dot).toBeCloseTo(a === b ? 1 : 0, 9);
      }
  });
});

describe('solveLinear (Gaussian elimination)', () => {
  it('recovers a known solution', () => {
    const rand = rng(7);
    const n = 4;
    const A = Array.from({ length: n }, () => Array.from({ length: n }, () => 2 * rand() - 1));
    const x0 = Array.from({ length: n }, () => 2 * rand() - 1);
    const b = A.map((row) => row.reduce((s, aij, j) => s + aij * x0[j], 0));
    const x = solveLinear(A, b);
    x.forEach((xi, i) => expect(xi).toBeCloseTo(x0[i], 9));
  });

  it('throws on a singular system', () => {
    expect(() =>
      solveLinear(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toThrow(/singular/);
  });
});
