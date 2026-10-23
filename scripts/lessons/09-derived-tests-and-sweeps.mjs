/**
 * Lesson 09 — Derived tests and sweeps. Screenshots for docs/learn/09-derived-tests-and-sweeps.md.
 *
 * RRAM-LOT-06, a resistive-memory characterisation lot: its definitions file loaded in the test selector (the † Derived
 * filter, the derived tests in Plot mode), its plots file imported on My plots (two sweep cards) and the sweep editor.
 * Run by scripts/lesson-shots.mjs.
 */

import { isVisible, hasText } from '../lib/checks.mjs';
import { SAMPLEDATA } from '../lib/paths.mjs';

const RRAM = `${SAMPLEDATA}/RRAM-LOT-06.stdf`;
const RRAM_DEFS = `${SAMPLEDATA}/RRAM-LOT-06_testdefs.csv`;
const RRAM_PLOTS = `${SAMPLEDATA}/RRAM-LOT-06_plots.json`;
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
const hdr = { rect: { x: 0, y: 50, width: 900, height: 560 } };

export const scenario = {
  session: '09',
  title: 'Derived tests and sweeps',
  theme: 'github-light',
  viewport: { width: 900, height: 700 },
  deviceScaleFactor: 2,
  beats: [
    {
      id: '01-load-rram',
      title: 'RRAM-LOT-06: six wafers of a resistive-memory characterisation lot',
      steps: [['loadFile', RRAM], ['waitForWafers'], ['click', '[data-wmap-summary-close]'], ['wait', 800], PARK],
      checks: [hasText('[data-wmap-gallery-meta]', 'RRAM-LOT-06')],
      shots: [],
    },
    {
      id: '02-load-definitions',
      title: 'Setup ▾ → Tests… and Load definitions: the file brings readable names and 7 derived tests',
      steps: [['openTestsDialog'], ['chooseFile', SEL_BTN('Load definitions'), RRAM_DEFS], ['wait', 600]],
      checks: [hasText(SELECTOR, '7 derived')],
      shots: [{ name: 'selector-loaded', clip: { target: SELECTOR, pad: 12 } }],
    },
    {
      id: '03-derived-filter',
      title: '† Derived shows only the derived tests; a † marks each one',
      steps: [['click', SEL_BTN('† Derived')], ['wait', 600]],
      checks: [hasText(SELECTOR, '900004')],
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
      shots: [{ name: 'plot-mode-derived', clip: { rect: { x: 640, y: 40, width: 640, height: 300 } } }],
    },
    {
      id: '06-derived-map',
      title: 'Choosing a derived test colours every die by its computed value',
      steps: [['click', 'text=Set plateau (uA)'], ['wait', 1500], PARK],
      checks: [isVisible(`${GT} button[aria-label="Toggle log scale"]`, 'the map is in Test Value mode')],
      shots: [{ name: 'derived-map', clip: { rect: { x: 0, y: 50, width: 900, height: 330 } } }],
    },
    {
      id: '07-my-plots-empty',
      title: 'Insights → My plots: no plots yet',
      steps: [['click', '[data-wmap-view="insights"]'], ['wait', 1500], ['click', tab('My plots')], ['wait', 1000], PARK],
      checks: [isVisible(plotBtn('Add examples'), 'the My plots buttons are showing')],
      shots: [{ name: 'my-plots-empty', clip: hdr }],
    },
    {
      id: '08-import-plots',
      title: 'Import plots… reads the sweeps file: two sweep cards',
      steps: [['chooseFile', plotBtn('Import plots…'), RRAM_PLOTS], ['wait', 2500], PARK],
      checks: [hasText('#map-container', 'Set / reset switching')],
      shots: [{ name: 'sweep-cards', clip: hdr }],
    },
    {
      id: '08b-sweep-measures',
      title: 'A sweep card reports its crossing and the width between its first two curves',
      steps: [PARK],
      checks: [hasText(card('Endurance'), 'Crossing')],
      shots: [{ name: 'sweep-measures', clip: cardClip(card('Endurance')) }],
    },
      {
      id: '09-sweep-editor',
      title: 'Edit opens the sweep beside a live copy of its curve',
      steps: [['click', `${card('Set / reset switching')} button:text-is("Edit")`], ['wait', 1500], ['click', '[role="dialog"] >> text="Edit plot"'], ['wait', 300]],
      checks: [isVisible('[role="dialog"]', 'the sweep editor is open')],
      shots: [{ name: 'sweep-editor', clip: { target: '[role="dialog"]', pad: 8 } }],
    },
    {
      id: '10-sweep-editor-name',
      title: 'Each series says where its X values come from: Test order, Values or From test name',
      steps: [['click', '[role="dialog"] button:text-is("Cancel")'], ['wait', 600], ['click', `${card('Endurance')} button:text-is("Edit")`], ['wait', 1500], ['click', '[role="dialog"] >> text="Edit plot"'], ['wait', 300]],
      checks: [isVisible('[role="dialog"]', 'the sweep editor is open')],
      shots: [{ name: 'sweep-editor-name', clip: { target: '[role="dialog"]', pad: 8 } }],
    },
    ],
};
