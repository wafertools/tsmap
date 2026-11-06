/**
 * Lesson 09 — Derived tests. Screenshots for docs/learn/09-derived-tests.md.
 *
 * SWEEP-LOT-06, a two-state switching lot: the Derived tests… editor (add a test, the Check and Reads columns, a mistake,
 * Apply), then its definitions file loaded in the test selector (the † Derived filter, the derived tests in Plot mode).
 * The lot's sweeps are taught in lesson 10. Run by scripts/lesson-shots.mjs.
 */

import { isVisible, hasText } from '../lib/checks.mjs';
import { SAMPLEDATA } from '../lib/paths.mjs';

const SWEEP = `${SAMPLEDATA}/SWEEP-LOT-06.zip`;
const SWEEP_DEFS = `${SAMPLEDATA}/SWEEP-LOT-06_testdefs.csv`;
const GT = '[data-wmap-toolbar="gallery"]';
const SELECTOR = '#tsmap-test-selector-overlay [role="dialog"]';
const SEL_BTN = (t) => `#tsmap-test-selector-overlay button:has-text("${t}")`;
const PARK = ['hover', '#toolbar-title'];
const MENU = '[role="menu"]';
const tab = (name) => `button:text-is("${name}")`;
const plotBtn = (t) => `button:has-text("${t}")`;
const card = (title) => `[data-wmap-chart-card][data-wmap-chart-title*="${title}"]`;
const cardClip = (sel, extra = {}) => ({ target: sel, pad: 8, ...extra });
const DIALOG = '[role="dialog"]';
const EDITOR = '[role="dialog"]:has(p:has-text("A derived test is computed"))';
const hdr = { rect: { x: 0, y: 50, width: 900, height: 560 } };

export const scenario = {
  session: '09',
  title: 'Derived tests',
  theme: 'github-light',
  viewport: { width: 900, height: 700 },
  deviceScaleFactor: 2,
  beats: [
    {
      id: '01-load-sweep',
      title: 'SWEEP-LOT-06: six wafers of a two-state switching lot',
      steps: [['loadFile', SWEEP], ['waitForWafers'], ['click', '[data-wmap-summary-close]'], ['wait', 800], PARK],
      checks: [hasText('[data-wmap-gallery-meta]', 'SWEEP-LOT-06')],
      shots: [],
    },
    {
      id: '01b-derived-editor',
      title: 'Setup ▾ → Tests… → Derived tests…: a table of the derived tests, empty until you add one',
      steps: [['openTestsDialog'], ['click', SEL_BTN('Derived tests…')], ['wait', 800]],
      checks: [isVisible(EDITOR, 'the Derived tests editor is open')],
      shots: [{ name: 'editor-empty', clip: { target: EDITOR, pad: 12 }, callouts: [[`${EDITOR} button:text-is("Add derived test")`, { pad: 2 }]] }],
    },
    {
      id: '01c-derived-add',
      title: 'Add derived test: a row on the next free number, with the cursor in its expression',
      steps: [
        ['click', `${EDITOR} button:text-is("Add derived test")`], ['wait', 400],
        ['fillInput', `${EDITOR} input[aria-label^="Name of"]`, 'Up plateau'], ['press', 'Tab'], ['wait', 250],
        ['fillInput', `${EDITOR} input[aria-label^="Expression of"]`, 'mean(t[5116..5120])'], ['press', 'Tab'], ['wait', 250],
        ['fillInput', `${EDITOR} input[aria-label^="Units of"]`, 'uA'], ['press', 'Tab'], ['wait', 250],
        ['wait', 600],
      ],
      checks: [hasText(EDITOR, '✓')],
      shots: [{ name: 'editor-add', clip: { target: EDITOR, pad: 12 }, callouts: [
        [`${EDITOR} input[aria-label^="Expression of"]`, { badge: 1, pad: 2 }],
        [`${EDITOR} [aria-label^="Test of"]`, { badge: 2, pad: 2 }],
      ] }],
    },
    {
      id: '01d-derived-error',
      title: 'A mistake shows at once: ✗, the reason and where',
      steps: [['fillInput', `${EDITOR} input[aria-label^="Expression of"]`, 'mean(t[5116..5120]'], ['press', 'Tab'], ['wait', 250], ['wait', 600]],
      checks: [hasText(EDITOR, '✗')],
      shots: [{ name: 'editor-error', clip: { target: EDITOR, pad: 12 } }],
    },
    {
      id: '01e-derived-apply',
      title: 'Apply puts the test in the selector, where the footer counts it; it is computed on import',
      steps: [
        ['fillInput', `${EDITOR} input[aria-label^="Expression of"]`, 'mean(t[5116..5120])'], ['press', 'Tab'], ['wait', 250], ['wait', 400],
        ['click', `${EDITOR} button:text-is("Apply")`], ['wait', 800],
      ],
      checks: [hasText(SELECTOR, '1 derived')],
      shots: [{ name: 'selector-applied', clip: { target: SELECTOR, pad: 12 } }],
    },
    {
      id: '01f-close-selector',
      title: 'Close the selector without importing: the definitions file loaded next replaces this test',
      steps: [['click', `${SELECTOR} button[aria-label="Close"]`], ['wait', 800], PARK],
      shots: [],
    },
    {
      id: '02-load-definitions',
      title: 'Setup ▾ → Tests… and Load definitions: the file brings readable names and 7 derived tests',
      steps: [['openTestsDialog'], ['chooseFile', SEL_BTN('Load definitions'), SWEEP_DEFS], ['wait', 600]],
      checks: [hasText(SELECTOR, '7 derived')],
      shots: [{ name: 'selector-loaded', clip: { target: SELECTOR, pad: 12 } }],
    },
    {
      id: '03-derived-filter',
      title: '† Derived shows only the derived tests; a † marks each one',
      steps: [['click', SEL_BTN('† Derived')], ['wait', 600]],
      checks: [hasText(SELECTOR, '910004')],
      shots: [{ name: 'selector-derived', clip: { target: SELECTOR, pad: 12 }, callouts: [[SEL_BTN('† Derived'), { pad: 2 }]] }],
    },
    {
      id: '04-apply',
      title: 'Apply: the derived tests are computed die by die',
      steps: [['click', SEL_BTN('All')], ['wait', 300], ['click', `${SELECTOR} button:has-text("Apply to")`], ['wait', 2500], PARK],
      shots: [],
    },
    {
      id: '05-plot-mode',
      title: 'A derived test is an ordinary test: it is in Plot mode, marked †',
      steps: [['click', `${GT} button[aria-label="Plot mode"]`], ['wait', 400], ['hover', `[role="menu"][aria-label="Plot mode"] [role^="menuitem"]:has-text("Test Value")`], ['wait', 500], ['fillInput', 'input[placeholder^="Filter tests"]', 'plateau'], ['wait', 500]],
      checks: [isVisible('[role="menu"][aria-label="Plot mode"]', 'the Plot mode menu is open')],
      shots: [{ name: 'plot-mode-derived', clip: { rect: { x: 380, y: 40, width: 700, height: 320 } } }],
    },
    {
      id: '06-derived-map',
      title: 'Choosing a derived test colours every die by its computed value',
      steps: [['click', 'text=Up plateau (uA)'], ['wait', 1500], PARK],
      checks: [isVisible(`${GT} button[aria-label="Toggle log scale"]`, 'the map is in Test Value mode')],
      shots: [{ name: 'derived-map', clip: { rect: { x: 0, y: 50, width: 900, height: 330 } } }],
    },
  ],
};
