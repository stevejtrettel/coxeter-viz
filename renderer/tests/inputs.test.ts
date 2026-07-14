import { describe, expect, it } from 'vitest';
import { figureInputs, resolveFigure } from '@/app/inputs';
import { checkFigure } from '@/schema/validate';

const OPEN = {
  version: '0.3',
  title: 'explorer',
  group: { unspecified: 'polygon', default: [2, 3, 7] },
  layers: [{ type: 'tessellation', color: { map: 'parity' } }, { type: 'walls' }],
};

describe('app/inputs — open fields resolve upstream of the render path', () => {
  it('figureInputs reports the open group with its kind and default', () => {
    expect(figureInputs(OPEN)).toEqual([{ id: 'group', kind: 'polygon', label: 'polygon', default: [2, 3, 7] }]);
  });

  it('an ordinary (fully specified) figure has no open fields', () => {
    const concrete = { version: '0.1', group: { polygon: [2, 3, 7] }, layers: [] };
    expect(figureInputs(concrete)).toEqual([]);
  });

  it('a hole with no default reports default: undefined', () => {
    const blank = { version: '0.3', group: { unspecified: 'polygon' }, layers: [] };
    expect(figureInputs(blank)).toEqual([{ id: 'group', kind: 'polygon', label: 'polygon', default: undefined }]);
  });

  it('resolveFigure fills the group and drops the version to a concrete one', () => {
    const concrete = resolveFigure(OPEN, { group: [2, 2, 2, 2, 2] }) as Record<string, unknown>;
    expect(concrete.group).toEqual({ polygon: [2, 2, 2, 2, 2] });
    expect(concrete.version).toBe('0.1');
    expect(concrete.layers).toBe(OPEN.layers); // layers carried through unchanged
  });

  it('resolveFigure falls back to the hole default when no value is given', () => {
    const concrete = resolveFigure(OPEN, {}) as Record<string, unknown>;
    expect(concrete.group).toEqual({ polygon: [2, 3, 7] });
  });

  it('the resolved document is concrete and checkFigure-valid; the input is untouched', () => {
    const concrete = resolveFigure(OPEN, { group: [3, 3, 4] });
    const checked = checkFigure(concrete);
    expect(checked.ok).toBe(true);
    expect(OPEN.group).toEqual({ unspecified: 'polygon', default: [2, 3, 7] }); // not mutated
  });

  it('a still-open document (no value, no default) stays open and is refused by the render path', () => {
    const blank = { version: '0.3', group: { unspecified: 'polygon' }, layers: [] };
    const still = resolveFigure(blank, {});
    expect(still).toEqual(blank); // nothing to fill → unchanged
    expect(checkFigure(still).ok).toBe(false); // the engine refuses an open group
  });

  it('an ordinary figure passes through resolveFigure unchanged', () => {
    const concrete = { version: '0.1', group: { polygon: [2, 3, 7] }, layers: [] };
    expect(resolveFigure(concrete, { group: [9, 9] })).toEqual(concrete);
  });
});
