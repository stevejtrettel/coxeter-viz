import { describe, expect, it } from 'vitest';
import { exportSizeLabel } from '../demos/shared/controls';

/**
 * R5a — the demo harness's one pure helper (the DOM widgets are verified by
 * the demos running, R5b's hands-on pass).
 */
describe('demos/shared: exportSizeLabel', () => {
  it('formats "N × N px (M MP)", empty at size 0', () => {
    expect(exportSizeLabel(0, 2)).toBe('');
    expect(exportSizeLabel(760, 1)).toBe('760 × 760 px (0.6 MP)');
    expect(exportSizeLabel(760, 2)).toBe('1520 × 1520 px (2.3 MP)');
    expect(exportSizeLabel(760, 4)).toBe('3040 × 3040 px (9.2 MP)');
  });
});
