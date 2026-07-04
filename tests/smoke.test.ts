/**
 * Phase 0 smoke test: proves the vitest + TS + three.js wiring. Replaced by
 * real behavior tests in Phase 1.
 */

import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';

describe('toolchain smoke', () => {
  it('resolves three.js and does arithmetic', () => {
    const v = new Vector3(1, 2, 2);
    expect(v.length()).toBeCloseTo(3, 12);
  });
});
