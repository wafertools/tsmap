/**
 * Session 04 — The lot view: gallery, stack and splits. Screenshots for docs/training/04-the-lot-view.md.
 *
 * EDGE-LOT-01, whose edge-ring defect stacks into a clear pattern, as a gallery and then stacked on the gallery
 * toolbar's Plot mode (hard bins, soft bins, test values and the aggregation method). Then the sample lot: the toggle
 * that selects the same dies on every wafer, and Setup ▾ → Splits…:
 * the dialog, split names in the map labels, and assigning a split to some wafers. Detaching a wafer into its own
 * window (Open full view, Reattach to gallery) opens a browser window the runner cannot capture yet, so the deck
 * teaches it without a picture. Run by scripts/training-shots.mjs.
 */

import { isVisible, hasText } from '../lib/checks.mjs';
import { SAMPLEDATA } from '../lib/paths.mjs';

const EDGE = `${SAMPLEDATA}/EDGE-LOT-01.stdf`;
const GT = '[data-wmap-toolbar="gallery"]';
const CARD = '.wmap-gallery-card';
const DIALOG = 'div[role="dialog"]';
const btn = (label) => `${GT} button[aria-label="${label}"]`;
const SAME = `${GT} button[aria-label^="Select the same dies"]`;
const menu = (label) => `[role="menu"][aria-label="${label}"]`;
const row = (text) => `[role^="menuitem"]:has-text("${text}")`;
const PARK = ['hover', '#toolbar-title'];
const dlg = (text) => `${DIALOG} ${text}`;
const rowBox = (wafer) => dlg(`label:has-text("${wafer}")`);

/** A shot of an open toolbar menu: the menu and its button, with room round them. */
const menuShot = (name, label, callouts = []) => ({
  name,
  clip: { target: menu(label), pad: 70 },
  callouts: [[btn(label), { pad: 2 }], ...callouts],
});

/** The header strip of the first three cards, where the split shows after the wafer ID. */
const HEADERS = { target: `${CARD} >> nth=0`, through: `${CARD} >> nth=2`, maxHeight: 56, pad: 8 };
const firstHeader = (describe, expect) => ({
  name: 'first-card-header',
  describe,
  get: (page) => page.locator(CARD).first().innerText(),
  expect,
});
const chooseMode = (name) => [['click', btn('Plot mode')], ['wait', 300], ['click', `${menu('Plot mode')} ${row(name)}`], ['wait', 1000], PARK];

export const scenario = {
  session: '04',
  title: 'The lot view: gallery, stack and splits',
  theme: 'github-light',
  viewport: { width: 1280, height: 820 },
  deviceScaleFactor: 2,
  beats: [
    {
      id: '01-gallery',
      title: 'EDGE-LOT-01 as a gallery, with the Summary panel closed to give the cards room',
      steps: [['loadFile', EDGE], ['waitForWafers'], ['click', '[data-wmap-summary-close]'], ['wait', 800], PARK],
      checks: [{
        name: 'eight-cards',
        describe: 'the gallery shows 8 wafer cards',
        get: (page) => page.locator(CARD).count(),
        expect: (n) => n === 8,
      }],
      // The header, the legend and the first row of cards: enough to show a gallery, and large on a slide.
      shots: [{ name: 'gallery', clip: { rect: { x: 0, y: 50, width: 1280, height: 570 } } }],
    },
    {
      id: '02-plot-mode-menu',
      title: 'Plot mode lists the stacked modes under Lot aggregation',
      steps: [['click', btn('Plot mode')], ['wait', 300]],
      checks: [isVisible(menu('Plot mode'), 'the Plot mode menu is open')],
      shots: [menuShot('plot-mode-stacked', 'Plot mode', [
        [`${menu('Plot mode')} ${row('Stacked Test Values')}`, { pad: 2 }],
        [`${menu('Plot mode')} ${row('Stacked Hard Bins')}`, { pad: 2 }],
        [`${menu('Plot mode')} ${row('Stacked Soft Bins')}`, { pad: 2 }],
      ])],
    },
    {
      id: '03-stack-hard',
      title: 'Stacked Hard Bins: one card per bin, coloured by how many wafers had it at each die position',
      steps: [['click', `${menu('Plot mode')} ${row('Stacked Hard Bins')}`], ['wait', 1000], PARK],
      checks: [hasText('[data-wmap-gallery-meta]', '8 wafers stacked')],
      shots: [{ name: 'stack-hard', clip: { rect: { x: 0, y: 0, width: 1280, height: 520 } }, callouts: [['[data-wmap-gallery-meta]', { pad: 2 }]] }],
    },
    {
      id: '04-stack-soft',
      title: 'Stacked Soft Bins: the same, for soft bins',
      steps: chooseMode('Stacked Soft Bins'),
      checks: [hasText('[data-wmap-gallery-meta]', '8 wafers stacked')],
      shots: [{ name: 'stack-soft', clip: { rect: { x: 0, y: 0, width: 1280, height: 520 } } }],
    },
    {
      id: '05-stack-values',
      title: 'Stacked Test Values: one card per test, with the values combined across wafers',
      steps: chooseMode('Stacked Test Values'),
      checks: [hasText('[data-wmap-gallery-meta]', '8 wafers stacked'), isVisible(btn('Aggregation method'), 'the Aggregation method button has appeared')],
      shots: [{ name: 'stack-values', clip: { rect: { x: 0, y: 50, width: 1280, height: 470 } }, callouts: [[btn('Aggregation method'), { pad: 2 }]] }],
    },
    {
      id: '06-aggregation',
      title: 'Aggregation method: how values from several wafers are combined at each die position',
      steps: [['click', btn('Aggregation method')], ['wait', 300]],
      checks: [isVisible(menu('Aggregation method'), 'the Aggregation method menu is open')],
      shots: [menuShot('aggregation-menu', 'Aggregation method')],
    },
    {
      id: '07-back-to-gallery',
      title: 'Back to Hard Bin: one card per wafer again',
      steps: [['press', 'Escape'], ['wait', 300], ...chooseMode('Hard Bin')],
      checks: [{
        name: 'eight-cards-again',
        describe: 'the gallery shows 8 wafer cards again',
        get: (page) => page.locator(CARD).count(),
        expect: (n) => n === 8,
      }],
    },
    {
      id: '07b-sample-lot',
      title: 'The sample lot for the rest of the session: its corners are already assigned as splits',
      steps: [['click', '#reset-btn'], ['wait', 800], ['click', 'button:has-text("Load sample data")'], ['waitForWafers'], ['click', '[data-wmap-summary-close]'], ['wait', 800], PARK],
      checks: [{
        name: 'thirteen-cards',
        describe: 'the gallery shows 13 wafer cards',
        get: (page) => page.locator(CARD).count(),
        expect: (n) => n === 13,
      }],
    },
    {
      id: '07c-open-full-view',
      title: "Each card's header carries the Open full view button",
      steps: [PARK],
      checks: [isVisible(`${CARD} >> nth=0 >> button[aria-label="Open full view"]`, 'the first card shows Open full view')],
      shots: [{
        name: 'open-full-view',
        clip: { target: `${CARD} >> nth=0 >> button[aria-label="Open full view"]`, closest: 'div:has(> button[aria-label="Open full view"])', pad: 8 },
        callouts: [[`${CARD} >> nth=0 >> button[aria-label="Open full view"]`, { pad: 2 }]],
      }],
    },
    {
      id: '07d-detached',
      title: 'Open full view detaches the wafer; its card becomes a placeholder with a Reattach button',
      steps: [['click', `${CARD} >> nth=0 >> button[aria-label="Open full view"]`], ['wait', 1500], PARK],
      checks: [isVisible('button[aria-label="Reattach to gallery"]', 'the placeholder shows Reattach to gallery')],
      shots: [{
        name: 'reattach',
        clip: { target: `${CARD} >> nth=0`, pad: 8, maxHeight: 200 },
        callouts: [['button[aria-label="Reattach to gallery"]', { pad: 2 }]],
      }],
    },
    {
      id: '07e-reattached',
      title: 'Reattach to gallery puts the wafer back',
      steps: [['click', 'button[aria-label="Reattach to gallery"]'], ['wait', 1000], PARK],
      checks: [{
        name: 'no-placeholder',
        describe: 'no Reattach button is left: the wafer is back in the gallery',
        get: (page) => page.locator('button[aria-label="Reattach to gallery"]').count(),
        expect: (n) => n === 0,
      }],
    },
    {
      id: '08-same-dies-off',
      title: 'Select the same dies on every wafer, off',
      steps: [PARK],
      checks: [{
        name: 'same-dies-off',
        describe: 'the toggle says it is off',
        get: (page) => page.locator(SAME).getAttribute('aria-label'),
        expect: (v) => v.includes(': off'),
      }],
      shots: [{ name: 'same-dies-toggle', clip: { target: GT, pad: 40 }, callouts: [[SAME, { pad: 2 }]] }],
    },
    {
      id: '09-same-dies-on',
      title: 'On, a box dragged on one wafer selects the same die positions on all of them',
      steps: [['click', SAME], ['wait', 400], ['drag', `${CARD} canvas`, [0.5, 0.4], [0.7, 0.6]], PARK],
      checks: [{
        name: 'positions-selected',
        describe: 'the toggle counts the selected die positions',
        get: (page) => page.locator(SAME).getAttribute('aria-label'),
        expect: (v) => v.includes('die positions selected'),
      }],
      shots: [{ name: 'same-dies-selected', clip: { rect: { x: 0, y: 50, width: 1280, height: 420 } }, callouts: [[SAME, { pad: 2 }]] }],
    },
    {
      id: '10-same-dies-clear',
      title: 'Clicking the button clears the selection; once more turns it off',
      steps: [['click', SAME], ['wait', 400], ['click', SAME], ['wait', 400], PARK],
      checks: [{
        name: 'same-dies-off-again',
        describe: 'the toggle is off again',
        get: (page) => page.locator(SAME).getAttribute('aria-label'),
        expect: (v) => v.includes(': off'),
      }],
    },
    {
      id: '11-setup-menu',
      title: 'Setup ▾ → Splits… opens the wafer splits dialog',
      steps: [['click', '#lot-btn'], ['wait', 300]],
      checks: [isVisible('button:has-text("Splits…")', 'the Splits… item is showing')],
      shots: [{
        name: 'setup-menu',
        clip: { rect: { x: 280, y: 10, width: 300, height: 290 } },
        callouts: [['button:has-text("Splits…")', { pad: 2 }]],
      }],
    },
    {
      id: '12-splits-dialog',
      title: 'The dialog, with the sample lot\'s corners already assigned',
      steps: [['press', 'Escape'], ['wait', 300], ['openSplitsDialog']],
      checks: [hasText(DIALOG, '5 splits assigned to 13 of 13 wafers')],
      shots: [{ name: 'splits-dialog', clip: { target: DIALOG, pad: 12 } }],
    },
    {
      id: '13-labels-on',
      title: 'With the box ticked, the split follows the wafer ID on every card',
      steps: [['closeSplitsDialog'], PARK],
      checks: [firstHeader('the first card reads W01 · TT', (t) => t.includes('W01 · TT'))],
      shots: [{ name: 'labels-on', clip: HEADERS }],
    },
    {
      id: '14-labels-off',
      title: 'Untick Show split in wafer map labels and the cards show the plain wafer ID',
      steps: [['openSplitsDialog'], ['click', dlg('label:has-text("Show split in wafer map labels")')], ['closeSplitsDialog'], PARK],
      checks: [firstHeader('the first card reads W01 with no split', (t) => t.includes('W01') && !t.includes('· TT'))],
      shots: [{ name: 'labels-off', clip: HEADERS }],
    },
    {
      id: '15-assign-ready',
      title: 'Clear all, tick the TT wafers and type the split name',
      steps: [
        ['openSplitsDialog'],
        ['click', dlg('label:has-text("Show split in wafer map labels")')],
        ['click', dlg('button:has-text("Clear all")')], ['wait', 500],
        ...['W01', 'W03', 'W05', 'W07', 'W09'].map((w) => ['click', rowBox(w)]),
        ['fillInput', dlg('input[placeholder^="Split name"]'), 'TT'],
        ['wait', 300],
      ],
      checks: [{
        name: 'assign-enabled',
        describe: 'Assign to selected is enabled',
        get: (page) => page.locator(dlg('button:has-text("Assign to")')).isEnabled(),
        expect: (v) => v === true,
      }],
      shots: [{
        name: 'splits-assign-ready',
        clip: { target: DIALOG, pad: 12 },
        callouts: [
          [dlg('input[placeholder^="Split name"]'), { badge: 1, pad: 2 }],
          [dlg('button:has-text("Assign to")'), { badge: 2, pad: 2 }],
          [dlg('button:has-text("Clear split")'), { badge: 3, pad: 2 }],
        ],
      }],
    },
    {
      id: '16-assigned',
      title: 'Assign to selected applies at once; the name now shows under In use',
      steps: [['click', dlg('button:has-text("Assign to")')], ['wait', 500]],
      checks: [hasText(DIALOG, '1 split assigned to 5 of 13 wafers')],
      shots: [
        { name: 'splits-assigned', clip: { target: DIALOG, pad: 12 } },
        {
          name: 'splits-save-load',
          clip: { target: DIALOG, pad: 12 },
          callouts: [
            [dlg('button:has-text("Save splits…")'), { badge: 1, pad: 2 }],
            [dlg('button:has-text("Load splits…")'), { badge: 2, pad: 2, nth: 1 }],
            [dlg('button:has-text("Done")'), { badge: 3, pad: 2 }],
          ],
        },
      ],
    },
    {
      id: '17-single-wafer',
      title: 'One wafer loaded: Expand (E) and the Map | Insights switch',
      steps: [['closeSplitsDialog'], ['click', '#reset-btn'], ['wait', 800], ['loadFile', `${SAMPLEDATA}/EDGE-LOT-01_W01.stdf`], ['wait', 3000], PARK],
      checks: [isVisible('button[aria-label="Expand (E)"]', 'the Expand (E) button is showing'), isVisible('[data-wmap-view-switch]', 'the Map | Insights switch is showing')],
      shots: [{
        name: 'single-wafer-buttons',
        clip: { rect: { x: 0, y: 30, width: 1280, height: 100 } },
        callouts: [
          ['button[aria-label="Expand (E)"]', { badge: 1, pad: 2 }],
          ['[data-wmap-view-switch]', { badge: 2, pad: 2 }],
        ],
      }],
    },
    ],
};
