import { describe, expect, it } from 'vitest';
import { checkFigure } from '@/schema/validate';
import type { Figure } from '@/schema/types';

const fixtureModules = import.meta.glob('./fixtures/figures/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;
const fixtures: [string, unknown][] = Object.entries(fixtureModules).map(([path, doc]) => [
  path.split('/').pop()!,
  doc,
]);

const accepted = (raw: unknown): Figure => {
  const r = checkFigure(raw);
  if (!r.ok) throw new Error(`expected ok, got problems: ${JSON.stringify(r.problems)}`);
  return r.figure;
};
const problemsOf = (raw: unknown): string[] => {
  const r = checkFigure(raw);
  expect(r.ok).toBe(false);
  return r.ok ? [] : r.problems.map((p) => `${p.path}: ${p.problem}`);
};

/** A minimal valid document to perturb. */
const base = (): Record<string, unknown> => ({
  version: '0.1',
  group: { coxeterMatrix: [[1, 2, 7], [2, 1, 3], [7, 3, 1]] },
  layers: [{ type: 'tessellation', extent: { ball: 4.0 } }],
});

describe('the figure document (schema/, PLAN §7.4)', () => {
  it('has fixtures on disk covering the ops', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(6);
    const ops = new Set(
      fixtures.flatMap(([, doc]) => ((doc as Figure).layers ?? []).map((l) => l.type)),
    );
    for (const op of ['domain', 'walls', 'tessellation', 'cayley', 'tiles', 'hull', 'cosets', 'uniform']) {
      expect(ops, `an op fixture for "${op}"`).toContain(op);
    }
  });

  it.each(fixtures.map(([name, doc]) => [name, doc] as const))(
    '%s validates, and re-checking round-trips (defaults applied exactly once)',
    (_name, doc) => {
      const fig = accepted(doc);
      expect(fig.version).toBe('0.1');
      expect(fig.model).toBeDefined(); // 'auto' when the document omits it
      expect(accepted(fig)).toEqual(fig);
    },
  );

  it('defaults the model to auto', () => {
    expect(accepted(base()).model).toBe('auto');
  });

  it('carries an optional title through (and refuses a non-string one)', () => {
    const fig = accepted({ ...base(), title: 'my tiling' });
    expect(fig.title).toBe('my tiling');
    expect(accepted(fig)).toEqual(fig); // round-trips
    expect(accepted(base()).title).toBeUndefined();
    expect(problemsOf({ ...base(), title: 7 }).join('\n')).toMatch(/title/);
  });

  it('refuses an unknown version as a problem, not a crash', () => {
    const doc = { ...base(), version: '9.9' };
    expect(problemsOf(doc).join('\n')).toMatch(/version/);
  });

  it('surfaces an inference refusal verbatim (the reason travels to Python)', () => {
    const doc = { ...base(), group: { coxeterMatrix: [[1, 2, -1], [2, 1, 3], [-1, 3, 1]] } };
    const all = problemsOf(doc).join('\n');
    expect(all).toMatch(/group\.coxeterMatrix/);
    expect(all).toMatch(/non-compact/);
    expect(all).toMatch(/chain/);
  });

  it('checks generator indices everywhere against the matrix rank', () => {
    const words = { ...base(), layers: [{ type: 'tiles', words: [[0, 3]] }] };
    expect(problemsOf(words).join('\n')).toMatch(/layers\[0\]\.words\[0\]\[1\].*3/);

    const sub = { ...base(), layers: [{ type: 'cosets', subgroup: [1, 1] }] };
    expect(problemsOf(sub).join('\n')).toMatch(/distinct generator indices/);

    const rings = { ...base(), layers: [{ type: 'uniform', rings: [5] }] };
    expect(problemsOf(rings).join('\n')).toMatch(/layers\[0\]\.rings/);
  });

  it('checks extent shape, model compatibility, unknown ops, unknown fields', () => {
    const both = { ...base(), layers: [{ type: 'tessellation', extent: { ball: 2, depth: 4 } }] };
    expect(problemsOf(both).join('\n')).toMatch(/exactly one/);

    const wrongChart = { ...base(), model: 'gnomonic' }; // a spherical chart on a hyperbolic group
    expect(problemsOf(wrongChart).join('\n')).toMatch(/gnomonic.*spherical.*hyperbolic/);

    const badOp = { ...base(), layers: [{ type: 'tesselation' }] }; // the classic misspelling
    expect(problemsOf(badOp).join('\n')).toMatch(/unknown op/);

    const typo = { ...base(), layers: [{ type: 'domain', colour: '#fff' }] };
    expect(problemsOf(typo).join('\n')).toMatch(/layers\[0\]\.colour.*unknown field/);
  });

  it('collects every problem in one pass (validation never fail-fasts)', () => {
    const doc = {
      version: '0.2',
      group: { coxeterMatrix: [[1, -1], [-1, 1]] },
      layers: [{ type: 'walls', width: -1 }],
    };
    const all = problemsOf(doc);
    expect(all.length).toBeGreaterThanOrEqual(3); // version + rank-too-small + width
  });

  it('walls colors must be one per generator', () => {
    const doc = { ...base(), layers: [{ type: 'walls', colors: ['#fff'] }] };
    expect(problemsOf(doc).join('\n')).toMatch(/expected 3, got 1/);
  });

  it('cosets: the parabolic must admit a W_S-fixed anchor', () => {
    // the right-angled pentagon: walls 0 and 2 do not meet — ⟨s₀,s₂⟩ is infinite
    const pentagon = [
      [1, 2, -1, -1, 2],
      [2, 1, 2, -1, -1],
      [-1, 2, 1, 2, -1],
      [-1, -1, 2, 1, 2],
      [2, -1, -1, 2, 1],
    ];
    const nonMeeting = { version: '0.1', group: { coxeterMatrix: pentagon }, layers: [{ type: 'cosets', subgroup: [0, 2] }] };
    expect(problemsOf(nonMeeting).join('\n')).toMatch(/do not meet.*infinite/);

    const tooMany = { ...base(), layers: [{ type: 'cosets', subgroup: [0, 1, 2] }] };
    expect(problemsOf(tooMany).join('\n')).toMatch(/anchor/);

    const meeting = { version: '0.1', group: { coxeterMatrix: pentagon }, layers: [{ type: 'cosets', subgroup: [1, 2] }] };
    expect(checkFigure(meeting).ok).toBe(true);
  });

  it('uniform: triangle chambers only, and at least one ring', () => {
    const pentagon = [
      [1, 2, -1, -1, 2],
      [2, 1, 2, -1, -1],
      [-1, 2, 1, 2, -1],
      [-1, -1, 2, 1, 2],
      [2, -1, -1, 2, 1],
    ];
    const wrongRank = { version: '0.1', group: { coxeterMatrix: pentagon }, layers: [{ type: 'uniform', rings: [0] }] };
    expect(problemsOf(wrongRank).join('\n')).toMatch(/triangle chamber.*rank 5/);

    const noRings = { ...base(), layers: [{ type: 'uniform', rings: [] }] };
    expect(problemsOf(noRings).join('\n')).toMatch(/at least one ring/);
  });
});
