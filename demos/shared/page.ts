/**
 * The house page shell (`demos/shared`): the body style and heading every demo
 * opens with. App glue — no math, no library concern.
 */

/** The page inset, px. */
export const PAD = 20;
/** The house background. */
export const PAGE_BG = '#f7f5f0';

/** Device pixel ratio, defaulting to 1 where unavailable. */
export function dpr(): number {
  return window.devicePixelRatio || 1;
}

/**
 * Set the house body style and append the page `<h2>`; returns it so a demo
 * can measure `offsetHeight` for panel sizing (galleries do) or tweak its
 * margin.
 */
export function pageShell(title: string): HTMLElement {
  document.body.style.cssText = `margin:0;padding:${PAD}px;background:${PAGE_BG};font-family:system-ui,sans-serif;color:#222`;
  const heading = document.createElement('h2');
  heading.textContent = title;
  heading.style.cssText = 'font-weight:600;font-size:16px;margin:0 0 8px';
  document.body.appendChild(heading);
  return heading;
}
