/**
 * Lesson 07 — Drilling into any population. Screenshots for docs/learn/07-drilling-down.md.
 *
 * The sample lot's gallery: the Filter… window (a condition on a wafer field, saved filters, the line that states
 * a filter), the same filter in Insights, then selecting dies on a card, right-clicking them for the menu of charts
 * and tables, and what each entry opens (value histogram, process capability, test statistics, dies). Also the
 * bin legend's right-click and a wafer's own Charts and tables button. Run by scripts/lesson-shots.mjs.
 */

import { isVisible, hasText } from '../lib/checks.mjs';

const GT = '[data-wmap-toolbar="gallery"]';
const CARD = '.wmap-gallery-card';
const DIALOG = '[role="dialog"]';
const PARK = ['hover', '#toolbar-title'];
const MENU = '[role="menu"]';
const FILTER = 'button:has-text("Filter…")';
const dlg = (sel) => `${DIALOG} ${sel}`;
const CHARTS_BTN = `${CARD} >> nth=0 >> button[aria-label^="Charts and tables for this wafer"]`;
const tickbox = (label) => dlg(`label:has-text("${label}") input`);
const hdr = { rect: { x: 0, y: 50, width: 1280, height: 570 } };

export const scenario = {
  session: '07',
  title: 'Drilling into any population',
  theme: 'github-light',
  viewport: { width: 1280, height: 820 },
  deviceScaleFactor: 2,
  beats: [
    {
      id: '01-gallery',
      title: 'The sample lot, with the Filter… button at the right of the toolbar row',
      steps: [['click', 'button:has-text("Load sample data")'], ['waitForWafers'], ['click', '[data-wmap-summary-close]'], ['wait', 800], PARK],
      checks: [isVisible(FILTER, 'the Filter… button is showing')],
      shots: [{
        name: 'filter-button',
        clip: { target: '[data-wmap-view-switch]', through: FILTER, pad: 40 },
        callouts: [[FILTER, { pad: 2 }]],
      }],
    },
    {
      id: '02-filter-window',
      title: 'Filter… opens a window where you add conditions',
      steps: [['click', FILTER], ['wait', 700]],
      checks: [isVisible(DIALOG, 'the Filter window is open')],
      shots: [{ name: 'filter-window', clip: { target: DIALOG, pad: 12, maxHeight: 420 } }],
    },
    {
      id: '03-fields',
      title: 'A condition starts with a field: a test, a die field or a wafer field',
      steps: [['click', dlg('button:has-text("Add a condition")')], ['wait', 400], ['click', dlg('button[aria-label="Condition field"]')], ['wait', 500]],
      checks: [isVisible('[role="option"]:has-text("Split")', 'Split is offered as a field')],
      shots: [{ name: 'filter-fields', clip: hdr }],
    },
    {
      id: '04-split-condition',
      title: 'Split is a wafer field: tick the values to keep',
      steps: [['click', '[role="option"]:has-text("Split")'], ['wait', 500]],
      checks: [hasText(DIALOG, 'Keeps 13 of 13 wafers')],
      shots: [{ name: 'filter-split', clip: { target: DIALOG, pad: 12, maxHeight: 470 } }],
    },
    {
      id: '05-keep-ss',
      title: 'Keep only SS: the window says what it would keep',
      steps: [...['FF', 'FS', 'SF', 'TT'].map((v) => ['click', tickbox(v)]), ['wait', 400]],
      checks: [hasText(DIALOG, 'Keeps 2 of 13 wafers')],
      shots: [{ name: 'filter-keeps', clip: { target: DIALOG, pad: 12, maxHeight: 470 }, callouts: [[`${DIALOG} >> text=/^Keeps /`, { pad: 2 }]] }],
    },
    {
      id: '06-save-filter',
      title: 'A filter can be saved under a name, to use again',
      steps: [['fillInput', dlg('input[type="text"]'), 'SS wafers'], ['click', dlg('button:text-is("Save")')], ['wait', 500], ['hover', `${DIALOG} >> text=Saved filters`], ['wait', 600]],
      checks: [hasText(DIALOG, 'SS wafers')],
      shots: [{ name: 'filter-saved', clip: { target: DIALOG, pad: 12, maxHeight: 520 } }],
    },
    {
      id: '07-apply',
      title: 'Apply: two cards remain, and a line above them states the filter',
      steps: [['click', dlg('button:text-is("Apply")')], ['wait', 1200], PARK],
      checks: [{
        name: 'two-cards',
        describe: 'the gallery shows 2 wafer cards',
        get: (page) => page.locator(`${CARD}:visible`).count(),
        expect: (n) => n === 2,
      }],
      shots: [{ name: 'filtered-gallery', clip: hdr }],
    },
    {
      id: '08-filter-line',
      title: 'The line above the view: switch the filter off and on, Edit… or Remove',
      steps: [PARK],
      checks: [hasText('#map-container', 'Filter on')],
      shots: [{
        name: 'filter-line',
        clip: { rect: { x: 0, y: 120, width: 1280, height: 70 } },
        callouts: [['button:text-is("Edit…")', { badge: 1, pad: 2 }], ['button:text-is("Remove")', { badge: 2, pad: 2 }]],
      }],
    },
    {
      id: '09-insights-filtered',
      title: 'The same filter narrows every Insights tab',
      steps: [['click', '[data-wmap-view="insights"]'], ['wait', 1500], PARK],
      checks: [hasText('#map-container', 'Filter on')],
      shots: [{ name: 'filter-insights', clip: hdr }],
    },
    {
      id: '10-remove-filter',
      title: 'Remove forgets the filter',
      steps: [['click', '[data-wmap-view="maps"]'], ['wait', 1000], ['click', 'button:text-is("Remove")'], ['wait', 1200], PARK],
      checks: [{
        name: 'thirteen-cards',
        describe: 'all 13 wafer cards are back',
        get: (page) => page.locator(`${CARD}:visible`).count(),
        expect: (n) => n === 13,
      }],
    },
    {
      id: '11-select-dies',
      title: 'Select dies: drag a box on one card; the rest of the dies fade',
      steps: [['drag', `${CARD} >> nth=1 >> canvas`, [0.25, 0.3], [0.6, 0.6]], ['wait', 600], PARK],
      shots: [{ name: 'selected-dies', clip: { target: `${CARD} >> nth=1`, pad: 8 } }],
    },
    {
      id: '12-right-click-menu',
      title: 'Right-click the selection: a menu of charts and tables for just those dies',
      steps: [['rightClick', `${CARD} >> nth=1 >> canvas`, [0.4, 0.45]]],
      checks: [isVisible(MENU, 'the menu of charts and tables is open')],
      shots: [{ name: 'context-menu', clip: { target: MENU, pad: 90 } }],
    },
    {
      id: '13-value-histogram',
      title: 'Value histogram: how one test is distributed over just those dies',
      steps: [['click', `${MENU} >> text=Value histogram`], ['wait', 1200], ['click', `${DIALOG} >> text=/dies selected on/ >> nth=0`], ['wait', 300]],
      checks: [isVisible(DIALOG, 'the chart has opened in a window')],
      shots: [{ name: 'dies-histogram', clip: { target: DIALOG, pad: 12 } }],
    },
    {
      id: '14-capability',
      title: 'Process capability over the same dies',
      steps: [['press', 'Escape'], ['wait', 500], ['rightClick', `${CARD} >> nth=1 >> canvas`, [0.4, 0.45]], ['click', `${MENU} >> text=Process capability`], ['wait', 1200], ['click', `${DIALOG} >> text=/dies selected on/ >> nth=0`], ['wait', 300]],
      checks: [isVisible(DIALOG, 'the chart has opened in a window')],
      shots: [{ name: 'dies-capability', clip: { target: DIALOG, pad: 12 } }],
    },
    {
      id: '15-statistics',
      title: 'Test statistics: the Test Values table for just those dies',
      steps: [['press', 'Escape'], ['wait', 500], ['rightClick', `${CARD} >> nth=1 >> canvas`, [0.4, 0.45]], ['click', `${MENU} >> text=Test statistics`], ['wait', 1200], ['click', `${DIALOG} >> text=/dies selected on/ >> nth=0`], ['wait', 300]],
      checks: [isVisible(DIALOG, 'the table has opened in a window')],
      shots: [{ name: 'dies-statistics', clip: { target: DIALOG, pad: 12 } }],
    },
    {
      id: '16-dies-table',
      title: 'Dies: one row per selected die',
      steps: [['press', 'Escape'], ['wait', 500], ['rightClick', `${CARD} >> nth=1 >> canvas`, [0.4, 0.45]], ['click', `${MENU} >> text=Dies`], ['wait', 1200], ['click', `${DIALOG} >> text=/dies selected on/ >> nth=0`], ['wait', 300]],
      checks: [isVisible(DIALOG, 'the table has opened in a window')],
      shots: [{ name: 'dies-table', clip: { target: DIALOG, pad: 12 } }],
    },
    {
      id: '17-legend-right-click',
      title: 'Right-click a bin in the legend: the menu opens on that bin\'s dies, across the lot',
      steps: [
        ['press', 'Escape'], ['wait', 500],
        // A click outside the wafer clears the selection, so the picture shows only what the legend opens.
        ['click', `${CARD} >> nth=1 >> canvas`, [0.03, 0.03]], ['wait', 400],
        ['rightClick', '[data-wmap-gallery-legend] [role="button"] >> nth=2'], ['wait', 400],
      ],
      checks: [isVisible(MENU, 'the menu is open')],
      shots: [{ name: 'legend-menu', clip: { rect: { x: 0, y: 50, width: 1280, height: 520 } } }],
    },
    {
      id: '18-wafer-button',
      title: 'Each card has a Charts and tables button for the whole wafer',
      steps: [['press', 'Escape'], ['wait', 500], ['scrollTop', '#map-container'], PARK],
      checks: [isVisible(CHARTS_BTN, 'the first card has a Charts and tables button')],
      shots: [{
        name: 'wafer-charts-button',
        clip: { target: `${CARD} >> nth=0`, pad: 8, maxHeight: 120 },
        callouts: [[CHARTS_BTN, { pad: 2 }]],
      }],
    },
    ],
};
