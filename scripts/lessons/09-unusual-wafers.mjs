/**
 * Lesson 09 — Unusual wafers. Screenshots for docs/learn/09-unusual-wafers.md.
 *
 * Multi-project wafer MPW-LOT-08 (Overlays: Compact layout and Layout diagnostics), COORDLESS-LOT-01 (a lot with fully
 * positioned, mixed and positionless wafers), RETEST-LOT-07 (dies probed more than once) and the Retests… dialog, the Reticle…
 * dialog and the field grid,
 * Diameter & edge exclusion…, and Exclude values outside limits… on VALID-LOT-09. Run by scripts/lesson-shots.mjs.
 */

import { isVisible, hasText } from '../lib/checks.mjs';
import { SAMPLEDATA } from '../lib/paths.mjs';

const S = (f) => `${SAMPLEDATA}/${f}`;
const GT = '[data-wmap-toolbar="gallery"]';
const SINGLE = '[data-wmap-toolbar="single"]';
const DIALOG = '[role="dialog"]';
const PARK = ['hover', '#toolbar-title'];
const menu = (label) => `[role="menu"][aria-label="${label}"]`;
const row = (text) => `[role^="menuitem"]:has-text("${text}")`;
const OV = `${GT} button[aria-label="Overlays"]`;
const hdr = { rect: { x: 0, y: 50, width: 1280, height: 770 } };
// The lot's yield strip and its three wafers, above the log.
const RETEST_CLIP = { rect: { x: 0, y: 50, width: 1280, height: 430 } };
const loadCsv = (file) => [['loadFile', S(file)], ['waitForOverlay', '.mapping-panel'], ['click', '#map-render'], ['wait', 2500]];

export const scenario = {
  session: '09',
  title: 'Unusual wafers',
  theme: 'github-light',
  viewport: { width: 1280, height: 820 },
  deviceScaleFactor: 2,
  beats: [
    {
      id: '01-mpw',
      title: 'A multi-project wafer: each reticle holds a few dies, so the map is mostly empty',
      steps: [...loadCsv('MPW-LOT-08.csv'), ['click', '[data-wmap-summary-close]'], ['wait', 800], PARK],
      checks: [hasText('#map-container', 'MPW-LOT-08')],
      shots: [{ name: 'mpw-wafer', clip: hdr }],
    },
    {
      id: '02-overlays-menu',
      title: 'Overlays offers Compact layout and Layout diagnostics at the top',
      steps: [['click', OV], ['wait', 400]],
      checks: [isVisible(menu('Overlays'), 'the Overlays menu is open')],
      shots: [{ name: 'overlays-compact', clip: { target: menu('Overlays'), pad: 70 } }],
    },
    {
      id: '03-compact',
      title: 'Compact layout removes the empty rows and columns and outlines each group of dies',
      steps: [['click', `${menu('Overlays')} ${row('Compact layout')}`], ['wait', 1500], ['press', 'Escape'], ['wait', 800], PARK],
      shots: [{ name: 'mpw-compact', clip: hdr }],
    },
    {
      id: '04-diagnostics',
      title: 'Layout diagnostics: counts and scores only, to report why a layout was or was not recognised',
      steps: [['click', OV], ['wait', 400], ['click', `${menu('Overlays')} ${row('Layout diagnostics')}`], ['wait', 800], ['hover', `${DIALOG} >> text=This is everything`], ['wait', 400]],
      checks: [isVisible(DIALOG, 'the diagnostics window is open')],
      shots: [{ name: 'layout-diagnostics', clip: { target: DIALOG, pad: 12 } }],
    },
    {
      id: '05-coordless',
      title: 'COORDLESS-LOT-01: one positioned wafer, one mixed, one with no positions at all',
      steps: [['press', 'Escape'], ['wait', 400], ['click', '#reset-btn'], ['wait', 800], ['loadFile', S('COORDLESS-LOT-01.stdf')], ['wait', 3000], ['click', '[data-wmap-summary-close]'], ['wait', 800], PARK],
      checks: [hasText('#map-container', 'No die position data for this wafer')],
      shots: [{ name: 'coordless-lot', clip: { rect: { x: 0, y: 50, width: 1280, height: 480 } } }],
    },
      {
      id: '06-positionless-card',
      title: 'A wafer with no positions never draws a map: it shows a summary, with View die list',
      steps: [PARK],
      checks: [isVisible('text=View die list', 'View die list is showing')],
      shots: [{ name: 'positionless-card', clip: { target: '.wmap-gallery-card >> nth=2', pad: 8, maxHeight: 220 }, callouts: [['button:has-text("View die list")', { pad: 2 }]] }],
    },
    {
      id: '07-die-list',
      title: 'View die list switches to every die as a table, with its own CSV export',
      steps: [['click', 'button:has-text("View die list")'], ['wait', 800], PARK],
      shots: [{ name: 'die-list', clip: { target: '.wmap-gallery-card >> nth=2', pad: 8 } }],
    },
    {
      id: '08-mixed-footer',
      title: 'A mixed wafer draws its positioned dies and keeps the rest in a footer',
      // A click in a card's empty corner leaves the die list behind without selecting a die.
      steps: [['click', '.wmap-gallery-card >> nth=1 >> canvas', [0.03, 0.03]], ['scrollTop', '#map-container', 0], PARK],
      checks: [isVisible('text=/dies without position data/', 'the footer is showing')],
      shots: [{ name: 'mixed-footer', clip: { target: '.wmap-gallery-card >> nth=1', pad: 8 }, callouts: [['text=/dies without position data/', { pad: 2 }]] }],
    },
      {
      id: '09-retest-lot',
      title: 'RETEST-LOT-07: dies probed more than once; by default the map keeps the last result for each position',
      steps: [['click', '#reset-btn'], ['wait', 800], ...loadCsv('RETEST-LOT-07.csv'), ['click', '[data-wmap-summary-close]'], ['wait', 600], ['hover', '.wmap-gallery-card canvas, #map-container canvas >> nth=0'], ['wait', 300]],
      shots: [],
    },
    {
      id: '10-retest-tooltip',
      title: 'A retested die\'s tooltip says how many times it was probed',
      steps: [['hover', '#map-container canvas >> nth=0'], ['wait', 600]],
      shots: [],
    },
    {
      id: '10b-retests-dialog',
      title: 'Setup ▾ → Retests…: which result counts for a die probed more than once',
      steps: [PARK, ['click', '#lot-btn'], ['wait', 300], ['click', 'button:has-text("Retests…")'], ['wait', 800]],
      checks: [isVisible(DIALOG, 'the Retests window is open')],
      shots: [{ name: 'retests-dialog', clip: { target: DIALOG, pad: 12 } }],
    },
    {
      id: '10c-retests-best',
      title: 'Best result: each die keeps its passing probe, and the lot\'s yield rises',
      steps: [['click', `${DIALOG} label:has-text("Best result")`], ['click', `${DIALOG} button:text-is("Apply")`], ['wait', 2500], PARK],
      checks: [hasText('#map-container', 'RETEST-LOT-07')],
      shots: [{ name: 'retests-best', clip: RETEST_CLIP }],
    },
    {
      id: '10d-retests-clear',
      title: 'Clear returns to the last result, so the beats after this one see the default',
      steps: [['click', '#lot-btn'], ['wait', 300], ['click', 'button:has-text("Retests…")'], ['wait', 800], ['click', `${DIALOG} button:text-is("Clear")`], ['wait', 2500], PARK],
      shots: [],
    },
    {
      id: '11-reticle-dialog',
      title: 'Setup ▾ → Reticle…: the stepper field size in dies',
      steps: [['click', '#lot-btn'], ['wait', 300], ['click', 'button:has-text("Reticle…")'], ['wait', 800]],
      checks: [isVisible(DIALOG, 'the Reticle window is open')],
      shots: [{ name: 'reticle-dialog', clip: { target: DIALOG, pad: 12 } }],
    },
    {
      id: '12-reticle-fill',
      title: 'A field 4 dies wide and 3 high; Corner die X and Y are optional',
      steps: [['fillInput', `${DIALOG} input >> nth=0`, '4'], ['fillInput', `${DIALOG} input >> nth=1`, '3'], ['wait', 300]],
      shots: [{ name: 'reticle-filled', clip: { target: DIALOG, pad: 12 } }],
    },
    {
      id: '13-reticle-apply',
      title: 'Apply draws the field grid on every map and adds reticle findings',
      steps: [['click', `${DIALOG} button:text-is("Apply")`], ['wait', 1500], PARK],
      shots: [{ name: 'reticle-grid', clip: { rect: { x: 0, y: 130, width: 1280, height: 400 } } }],
    },
    {
      id: '14-reticle-overlay',
      title: 'Overlays ▾ → Reticle grid hides or shows the grid',
      steps: [['click', OV], ['wait', 400], ['hover', `${menu('Overlays')} ${row('Ring boundaries')}`], ['wait', 500]],
      checks: [isVisible(menu('Overlays'), 'the Overlays menu is open')],
      shots: [{ name: 'overlays-reticle', clip: { target: menu('Overlays'), pad: 70 } }],
    },
    {
      id: '15-diameter',
      title: 'Setup ▾ → Diameter & edge exclusion…',
      steps: [['press', 'Escape'], ['wait', 300], ['click', '#lot-btn'], ['wait', 300], ['click', 'button:has-text("Reticle…")'], ['wait', 800], ['click', `${DIALOG} button:text-is("Clear")`], ['wait', 1000], ['click', '#lot-btn'], ['wait', 300], ['click', 'button:has-text("Diameter & edge exclusion")'], ['wait', 800]],
      checks: [isVisible(DIALOG, 'the Diameter window is open')],
      shots: [{ name: 'diameter-dialog', clip: { target: DIALOG, pad: 12 } }],
    },
    {
      id: '16-diameter-apply',
      title: 'A 300 mm wafer with a 10 mm edge exclusion band',
      steps: [['fillInput', `${DIALOG} input >> nth=0`, '300'], ['fillInput', `${DIALOG} input >> nth=1`, '10'], ['click', `${DIALOG} button:text-is("Apply")`], ['wait', 1500], PARK],
      shots: [{ name: 'edge-exclusion', clip: { rect: { x: 0, y: 130, width: 1280, height: 400 } } }],
    },
    {
      id: '17-exclude-values',
      title: 'Setup ▾ → Exclude values outside limits…',
      steps: [['click', '#lot-btn'], ['wait', 300], ['click', 'button:has-text("Exclude values outside limits")'], ['wait', 800]],
      checks: [isVisible(DIALOG, 'the window is open')],
      shots: [{ name: 'exclude-values', clip: { target: DIALOG, pad: 12 } }],
    },
    ],
};
