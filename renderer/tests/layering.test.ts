import { describe, expect, it } from 'vitest';

/**
 * The layer law, mechanically enforced (PLAN.md §5.2b): the core has no
 * three.js. Rendering libraries may appear only in the future render layers
 * and in demos — never under `src/`.
 */

const sources = import.meta.glob('../src/**/*.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

describe('layer law', () => {
  it('sweeps a non-empty source tree', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(15);
  });

  it('nothing under src/ imports three.js', () => {
    const offenders = Object.entries(sources)
      .filter(([, code]) => /from\s+['"]three['"]/.test(code) || /import\s*\(\s*['"]three['"]/.test(code))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
