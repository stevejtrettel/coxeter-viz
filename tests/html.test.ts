import { describe, expect, it } from 'vitest';
import { selfContainedHtml } from '@/app/html';

const FIG = {
  version: '0.1',
  title: 'the (2,3,7) tiling',
  group: { coxeterMatrix: [[1, 2, 7], [2, 1, 3], [7, 3, 1]] },
  layers: [{ type: 'tessellation' }],
};

describe('the self-contained HTML exporter (P6)', () => {
  it('inlines the bundle, the figure, and the title', () => {
    const html = selfContainedHtml(FIG, 'window.__BUNDLE_MARKER__=1;');
    expect(html).toContain('window.__BUNDLE_MARKER__=1;');
    expect(html).toContain('<title>the (2,3,7) tiling</title>');
    expect(html).toContain('"coxeterMatrix"');
    expect(html).not.toContain('__COXETER_VIZ_FIGURE__');
    expect(html).not.toContain('__COXETER_VIZ_BUNDLE__');
    expect(html).not.toContain('__COXETER_VIZ_TITLE__');
  });

  it('a hostile title cannot break out of the title or the script element', () => {
    const evil = { ...FIG, title: '</script><script>alert(1)//' };
    const html = selfContainedHtml(evil, ';');
    // the JSON's `<` are <-escaped and the <title> is entity-escaped,
    // so the ONLY </script> occurrences are the template's own two closes
    expect(html.split('</script>')).toHaveLength(3);
    expect(html).not.toContain('<script>alert');
  });

  it('a `$&` in the bundle or figure stays literal (function-form replacement)', () => {
    const html = selfContainedHtml({ ...FIG, title: 'a $& b' }, "var s = '$&';");
    expect(html).toContain("var s = '$&';");
    expect(html).toContain('a $& b');
  });

  it('falls back to the default title', () => {
    const html = selfContainedHtml({ version: '0.1' }, ';');
    expect(html).toContain('<title>coxeter-viz</title>');
  });
});
