import { describe, expect, it } from 'vitest';
import { figureInputs, resolveFigure } from '@/app/inputs';
import { checkFigure } from '@/schema/validate';

// An open GROUP (top-level hole).
const OPEN_GROUP = {
  version: '0.3',
  title: 'explorer',
  group: { variable: 'polygon', default: [2, 3, 7] },
  layers: [{ type: 'tessellation', color: { map: 'parity' } }, { type: 'walls' }],
};

// An open DEPTH (a hole nested inside a layer's extent) — a concrete group.
const OPEN_DEPTH = {
  version: '0.3',
  group: { polygon: [2, 3, 7] },
  layers: [{ type: 'tessellation', extent: { depth: { variable: 'depth', default: 8 } } }],
};

// Both open at once — proves the walk is not group-shaped.
const OPEN_BOTH = {
  version: '0.3',
  group: { variable: 'polygon', default: [2, 3, 7] },
  layers: [{ type: 'tessellation', extent: { depth: { variable: 'depth', default: 8 } } }],
};

describe('app/inputs — variable fields resolve upstream of the render path', () => {
  it('figureInputs reports the open group with its kind, label, default', () => {
    expect(figureInputs(OPEN_GROUP)).toEqual([{ id: 'group', kind: 'polygon', label: 'polygon', default: [2, 3, 7] }]);
  });

  it('figureInputs finds a hole nested in a layer, by dotted-path id', () => {
    expect(figureInputs(OPEN_DEPTH)).toEqual([
      { id: 'layers.0.extent.depth', kind: 'depth', label: 'depth', default: 8 },
    ]);
  });

  it('figureInputs reports several holes in document order', () => {
    expect(figureInputs(OPEN_BOTH).map((f) => f.id)).toEqual(['group', 'layers.0.extent.depth']);
  });

  it('an ordinary (fully specified) figure has no open fields', () => {
    const concrete = { version: '0.1', group: { polygon: [2, 3, 7] }, layers: [] };
    expect(figureInputs(concrete)).toEqual([]);
  });

  it('resolveFigure fills the group (value wrapped as a presentation), version drops', () => {
    const c = resolveFigure(OPEN_GROUP, { group: [2, 2, 2, 2, 2] }) as Record<string, unknown>;
    expect(c.group).toEqual({ polygon: [2, 2, 2, 2, 2] });
    expect(c.version).toBe('0.1');
  });

  it('resolveFigure fills a nested depth (value placed as-is)', () => {
    const c = resolveFigure(OPEN_DEPTH, { 'layers.0.extent.depth': 12 }) as { layers: { extent: unknown }[] };
    expect(c.layers[0].extent).toEqual({ depth: 12 });
  });

  it('resolveFigure fills every hole, from values or defaults, and validates', () => {
    const c = resolveFigure(OPEN_BOTH, { group: [3, 3, 4] }); // depth from its default
    expect((c as { layers: { extent: unknown }[] }).layers[0].extent).toEqual({ depth: 8 });
    expect((c as { group: unknown }).group).toEqual({ polygon: [3, 3, 4] });
    expect(checkFigure(c).ok).toBe(true);
    expect(OPEN_BOTH.group).toEqual({ variable: 'polygon', default: [2, 3, 7] }); // input not mutated
  });

  it('a hole left open (no value, no default) keeps 0.3 and the render path refuses it', () => {
    const blank = { version: '0.3', group: { variable: 'polygon' }, layers: [] };
    const still = resolveFigure(blank, {});
    expect(still).toEqual(blank);
    expect(checkFigure(still).ok).toBe(false);
  });

  it('an ordinary figure passes through resolveFigure unchanged', () => {
    const concrete = { version: '0.1', group: { polygon: [2, 3, 7] }, layers: [] };
    expect(resolveFigure(concrete, { group: [9, 9] })).toEqual(concrete);
  });
});
