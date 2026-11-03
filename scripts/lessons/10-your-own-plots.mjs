/**
 * Lesson 10 — Your own plots. Screenshots for docs/learn/10-your-own-plots.md.
 *
 * The sample lot's My plots: Examples and Add all, + New plot, the chart types, the X, Y and Colour fields, Customise, a draft
 * from the right-click menu, and the plot buttons (Edit, Duplicate, Delete, Export, Import, Delete all).
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
  session: '10',
  title: 'Your own plots',
  theme: 'github-light',
  viewport: { width: 900, height: 700 },
  deviceScaleFactor: 2,
  beats: [
    {
      id: '13a-examples-view',
      title: 'Examples: one of each chart type this lot can show, marked as examples and not yet saved',
      steps: [['click', 'button:has-text("Load sample data")'], ['waitForWafers'], ['click', '[data-wmap-view="insights"]'], ['wait', 1500], ['click', tab('My plots')], ['wait', 800], ['click', '[data-wmap-plot-examples]'], ['wait', 2500], PARK],
      checks: [isVisible('[data-wmap-plot-examples-add-all]', 'Add all is showing')],
      shots: [{ name: 'examples-view', clip: hdr, callouts: [['[data-wmap-plot-views]', { pad: 4 }]] }],
    },
    {
      id: '13-sample-lot-examples',
      title: 'Add all keeps the examples you do not have and shows My plots, with an Undo',
      steps: [['click', '[data-wmap-plot-examples-add-all]'], ['wait', 4000], PARK],
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
      id: '15b-sweep-type',
      title: 'Sweep is a chart type too: choosing it shows the series form and the curve beside it',
      steps: [['click', `${DIALOG} label:text-is("Sweep")`], ['wait', 1200]],
      checks: [isVisible(`${DIALOG} label:text-is("Sweep")`, 'the Sweep type is offered')],
      shots: [{ name: 'sweep-type', clip: { target: DIALOG, pad: 8 }, callouts: [[`${DIALOG} label:text-is("Sweep")`, { pad: 2 }]] }],
    },
    {
      id: '15c-json-tab',
      title: 'The editor\'s JSON tab shows the plot as text, with suggestions for its keys',
      steps: [['click', `${DIALOG} label:text-is("Scatter")`], ['wait', 800], ['click', `${DIALOG} button:text-is("JSON")`], ['wait', 800]],
      checks: [isVisible(`${DIALOG} textarea, ${DIALOG} [contenteditable="true"]`, 'the JSON text is showing')],
      shots: [{ name: 'plot-json', clip: { target: DIALOG, pad: 8 }, callouts: [[`${DIALOG} button:text-is("JSON")`, { pad: 2 }]] }],
    },
    {
      id: '15d-back-to-setup',
      title: 'Back to Setup, as the later beats expect',
      steps: [['click', `${DIALOG} button:text-is("Setup")`], ['wait', 600], ['click', `${DIALOG} label:text-is("Histogram")`], ['wait', 800]],
      shots: [],
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
      id: '18b-reference-lines',
      title: 'Customise → Reference lines: a target and a band written as text, drawn on the chart',
      steps: [['fillInput', `${DIALOG} input[placeholder*="Target"], ${DIALOG} input[placeholder*="median"]`, '320 Target, 300..340 Window, median'], ['wait', 1200]],
      checks: [isVisible(`${DIALOG} >> text="Reference lines" >> nth=0`, 'the Reference lines field is showing')],
      shots: [{ name: 'reference-lines', clip: { target: DIALOG, pad: 8 } }],
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
      {
      id: '11-delete-all',
      title: 'Delete all plots… asks first, saying how many and that Export plots… keeps a copy',
      steps: [['click', `${DIALOG} button:text-is("Cancel")`], ['wait', 600], ['click', '[data-wmap-view="insights"]'], ['wait', 1200], ['click', tab('My plots')], ['wait', 800], ['click', plotBtn('Delete all plots…')], ['wait', 600]],
      checks: [isVisible('[role="dialog"]', 'a confirmation is showing')],
      shots: [{ name: 'delete-all', clip: { target: '[role="dialog"]', pad: 12 } }],
    },
      {
      id: '12-confirm-delete',
      title: 'Confirmed: the list is empty, and Undo brings it back for ten seconds',
      steps: [['click', '[role="dialog"] button:has-text("Delete ")'], ['wait', 800], PARK],
      checks: [isVisible(plotBtn('Undo'), 'Undo is offered')],
      shots: [{ name: 'plots-deleted', clip: { rect: { x: 0, y: 50, width: 900, height: 300 } }, callouts: [[plotBtn('Undo'), { pad: 2 }]] }],
    },
    ],
};
