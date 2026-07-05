/**
 * Phase 0 smoke test: proves the vitest + TS wiring against the math layer.
 * (Originally exercised three.js; the core no longer imports it — §5.2b.)
 */

import { describe, expect, it } from 'vitest';
import { norm, vec3 } from '@/math/vec';

describe('toolchain smoke', () => {
  it('resolves the math layer and does arithmetic', () => {
    expect(norm(vec3(1, 2, 2))).toBeCloseTo(3, 12);
  });
});
