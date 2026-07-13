import template from './template.html?raw';

/**
 * The self-contained HTML exporter (README, PLAN §7.5): ONE file — the
 * compiled bundle + the figure JSON inlined into the template. Opening it
 * IS the instrument: full-viewport, live pan/zoom, debounced re-fit on
 * resize, hover-corner SVG / 4× PNG downloads (user rulings 2026-07-10).
 *
 * The template (`template.html`) is the single source of truth for the
 * page: the Python side vendors THE SAME FILE and performs THE SAME three
 * replacements — title text, the quoted figure token, the bundle comment
 * token. Replacements use function form (a `$` in the bundle or the JSON
 * must stay literal), and every `<` in the JSON is escaped to `\u003c`
 * so a title like `</script>…` can never break out of the script element.
 */

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function selfContainedHtml(figure: unknown, viewerJs: string): string {
  const title =
    typeof figure === 'object' &&
    figure !== null &&
    'title' in figure &&
    typeof (figure as { title: unknown }).title === 'string'
      ? (figure as { title: string }).title
      : 'coxeter-viz';
  const json = (JSON.stringify(figure) ?? 'null').replace(/</g, '\\u003c');
  return template
    .replace('__COXETER_VIZ_TITLE__', () => escapeHtml(title))
    .replace('"__COXETER_VIZ_FIGURE__"', () => json)
    .replace('/*__COXETER_VIZ_BUNDLE__*/', () => viewerJs);
}
