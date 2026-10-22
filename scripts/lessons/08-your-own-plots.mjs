/**
 * Lesson 08 — Your own plots, derived tests and sweeps. Screenshots for docs/learn/08-your-own-plots.md.
 *
 * Two lots. RRAM-LOT-06 (a resistive-memory characterisation lot) for derived tests and sweeps: its definitions file
 * loaded in the test selector (the † Derived filter, the derived tests in Plot mode), its plots file imported on
 * My plots (two sweep cards) and the sweep editor. Then the sample lot for the plot editor: Add examples, + New plot,
 * the chart types, the X, Y and Colour fields, Customise, and the plot buttons (Edit, Duplicate, Delete, Export,
 * Import, Delete all). Run by scripts/lesson-shots.mjs.
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
const hdr = { rect: { x: 0, y: 50, width: 1280, height: 770 } };

export const scenario = {
  session: '08',
  title: 'Your own plots, derived tests and sweeps',
  theme: 'github-light',
  viewport: { width: 1280, height: 820 },
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
      shots: [{ name: 'derived-map', clip: { rect: { x: 0, y: 50, width: 1280, height: 330 } } }],
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
      {
      id: '11-delete-all',
      title: 'Delete all plots… asks first, saying how many and that Export plots… keeps a copy',
      steps: [['click', '[role="dialog"] button:text-is("Cancel")'], ['wait', 600], ['click', plotBtn('Delete all plots…')], ['wait', 600]],
      checks: [isVisible('[role="dialog"]', 'a confirmation is showing')],
      shots: [{ name: 'delete-all', clip: { target: '[role="dialog"]', pad: 12 } }],
    },
      {
      id: '12-confirm-delete',
      title: 'Confirmed: the list is empty, and Undo brings it back for ten seconds',
      steps: [['click', '[role="dialog"] button:has-text("Delete 2 plots")'], ['wait', 800], PARK],
      checks: [isVisible(plotBtn('Undo'), 'Undo is offered')],
      shots: [{ name: 'plots-deleted', clip: { rect: { x: 0, y: 50, width: 1280, height: 300 } }, callouts: [[plotBtn('Undo'), { pad: 2 }]] }],
    },
    {
      id: '13-sample-lot-examples',
      title: 'The sample lot: Add examples draws one plot of each kind it can',
      steps: [['click', '#reset-btn'], ['wait', 800], ['click', 'button:has-text("Load sample data")'], ['waitForWafers'], ['click', '[data-wmap-view="insights"]'], ['wait', 1500], ['click', tab('My plots')], ['wait', 800], ['click', plotBtn('Add examples')], ['wait', 4000], PARK],
      checks: [isVisible(plotBtn('Delete all plots…'), 'plots now exist')],
      shots: [{ name: 'examples', clip: hdr }],
    },
    {
      id: '14-new-plot',
      title: '+ New plot opens the editor beside a large copy of its chart',
      steps: [['click', plotBtn('+ New plot')], ['wait', 2000], ['click', '[role="dialog"] >> text=/Edit plot|New plot/ >> nth=0'], ['wait', 300]],
      checks: [isVisible('[role="dialog"]', 'the plot editor is open')],
      shots: [{ name: 'plot-editor', clip: { target: '[role="dialog"]', pad: 8 } }],
    },
      {
      id: '15-chart-types',
      title: 'Chart type: nine kinds, each needing different fields',
      steps: [['click', `${DIALOG} label:text-is("Histogram")`], ['wait', 1000], ['click', `${DIALOG} >> text="Edit plot"`], ['wait', 300]],
      checks: [isVisible(`${DIALOG} label:text-is("Goal")`, 'the chart types are showing')],
      shots: [{
        name: 'chart-types',
        clip: { target: DIALOG, pad: 8 },
        callouts: [[`${DIALOG} label:text-is("Scatter")`, { through: `${DIALOG} label:text-is("Goal")`, pad: 4 }]],
      }],
    },
    {
      id: '16-x-axis-menu',
      title: 'X axis, Y axis and Colour each open a list of fields: tests, die fields, wafer fields',
      steps: [['click', `${DIALOG} label:text-is("Scatter")`], ['wait', 800], ['click', `${DIALOG} button[aria-label="Colour"]`], ['wait', 500]],
      checks: [isVisible('[role="option"]:has-text("Split")', 'Split is offered for Colour')],
      shots: [{ name: 'colour-menu', clip: { target: DIALOG, pad: 8 } }],
    },
    {
      id: '17-colour-by-split',
      title: 'Colour by Split: one colour per group',
      steps: [['click', '[role="option"]:has-text("Split") >> nth=0'], ['wait', 1000], ['click', `${DIALOG} >> text="Edit plot"`], ['wait', 300]],
      shots: [{ name: 'colour-split', clip: { target: DIALOG, pad: 8 } }],
    },
    {
      id: '18-customise',
      title: 'Customise: titles, axis scales, direction and which limits are drawn',
      steps: [['click', `${DIALOG} button:text-is("Customise")`], ['wait', 800]],
      checks: [isVisible(`${DIALOG} label:has-text("Reverse direction") >> nth=0`, 'Customise is showing')],
      shots: [{ name: 'customise', clip: { target: DIALOG, pad: 8 } }],
    },
    {
      id: '19-close-editor',
      title: 'Cancel puts the plot back as it was when you opened the editor',
      steps: [['click', `${DIALOG} button:text-is("Cancel")`], ['wait', 800], PARK],
      shots: [],
    },
      {
      id: '20-menu-new-plot',
      title: 'From a map, the right-click menu starts a draft plot or sweep over just those dies',
      steps: [['click', '[data-wmap-view="maps"]'], ['wait', 1200], ['click', '[data-wmap-summary-close]'], ['wait', 600], ['rightClick', '.wmap-gallery-card >> nth=1 >> canvas', [0.4, 0.45]],
        // With the examples added the menu lists every plot, taller than the window, so it scrolls.
        ['scrollIntoView', '[role="menu"] >> text=New plot…']],
      checks: [isVisible('[role="menu"]', 'the menu is open')],
      shots: [{ name: 'menu-new-plot', clip: { target: '[role="menu"]', pad: 90 }, callouts: [['[role="menu"] >> text=New plot…', { pad: 2 }], ['[role="menu"] >> text=New sweep…', { pad: 2 }]] }],
    },
    {
      id: '21-draft',
      title: 'A draft is kept only if you press Add to my plots',
      steps: [['click', '[role="menu"] >> text=New plot…'], ['wait', 2000], ['click', `${DIALOG} >> text=/dies selected|Edit plot|New plot/ >> nth=0`], ['wait', 300]],
      checks: [isVisible(`${DIALOG} button:has-text("Add to my plots")`, 'the draft offers Add to my plots')],
      shots: [{ name: 'draft-plot', clip: { target: DIALOG, pad: 8 }, callouts: [[`${DIALOG} button:has-text("Add to my plots")`, { pad: 2 }]] }],
    },
    ],
};
