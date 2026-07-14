/**
 * The bundle entry (README, PLAN §7.6 P6): compiled by
 * `scripts/build-bundle.mjs` (Vite library mode, IIFE) into ONE
 * `dist/lib/viewer.js` whose exports land on `window.coxeterViz` — the
 * global the saved page's script and the headless (Playwright) driver
 * both call.
 */

export { render, type RenderHandle, type RenderResult } from './render';
export { figureToSvg, figureToPng, type ExportOptions, type ExportResult } from './export';
export { figureInputs, resolveFigure, type InputField } from './inputs';
