/**
 * Lesson 03 — Findings. Screenshots for docs/learn/03-findings.md.
 *
 * The Summary panel on the sample lot, top to bottom: What stands out (the
 * headline, the ranked rows, the chips on the top item, the Chart link, Full
 * report), then the Findings list (severity groups, detail rows), then the
 * tables (Wafer Yield, Hard Bin Breakdown, Ring Yield, Test Values, Functional
 * Tests), and the Summary report and Data tables buttons. EDGE-LOT-01 shows a
 * spatial pattern with its supporting findings and bin chips. Run by
 * scripts/lesson-shots.mjs.
 */

import { isVisible, hasText } from '../lib/checks.mjs';
import { SAMPLEDATA } from '../lib/paths.mjs';

const S = (f) => `${SAMPLEDATA}/${f}`;
const RIGHT = '[data-wmap-placement]:has([data-wmap-summary-close])';
const PANEL = '[data-wmap-summary-close]';
const panelClip = (extra = {}) => ({ target: PANEL, closest: '[data-wmap-placement]', pad: 8, ...extra });
const CHIPS = `${RIGHT} [role="group"][aria-label="Show one part on the map"]`;
const LOG = '[data-wmap-toolbar="gallery"] button[aria-label="Toggle log scale"]';
const REPORT = '[role="dialog"]';
const radioOn = (label) => ({
  name: `radio-${label}`,
  describe: `the ${label} choice is selected`,
  get: (page) => page.locator(`${RIGHT} [role="radiogroup"] label:has-text("${label}")`).getAttribute('data-on'),
  expect: (v) => v === 'true',
});
const expanded = (name) => ({
  name: `expanded-${name}`,
  describe: `the ${name} section is open`,
  get: (page) => page.locator(section(name)).first().getAttribute('aria-expanded'),
  expect: (v) => v === 'true',
});
// A section's own box. Wafer Yield, Hard Bin Breakdown and Ring Yield keep their Slot/Yield-style switch in a header row,
// so their box is one level higher than the other sections'.
const sectionClip = (name, { row = false } = {}) => ({
  target: `${RIGHT} ` + (row ? `div:has(> div > [aria-expanded]:has-text("${name}"))` : `div:has(> [aria-expanded]:has-text("${name}"))`),
  pad: 8,
});
// From a section's header down to one element inside it: a tight crop that fills more of a slide than the whole panel.
const fromHeader = (name, through, extra = {}) => ({ target: section(name), through, pad: 8, ...extra });
const PARK = ['hover', '#toolbar-title'];
const TOP = ['scrollTop', '#map-container'];
const section = (name) => `${RIGHT} [aria-expanded]:has-text("${name}")`;

export const scenario = {
  session: '03',
  title: 'Findings',
  theme: 'github-light',
  viewport: { width: 1280, height: 820 },
  deviceScaleFactor: 2,
  beats: [
    {
      id: '01-summary-panel',
      title: 'The Summary panel beside the sample lot',
      steps: [['click', 'button:has-text("Load sample data")'], ['waitForWafers'], PARK],
      checks: [hasText(RIGHT, 'Lot PVT-LOT-05')],
      shots: [
        { name: 'summary-panel', clip: panelClip({ maxHeight: 330 }) },
        {
          name: 'summary-button',
          clip: { target: 'button[data-wmap-summary-toggle]:visible', through: '[data-wmap-view-switch]', pad: 40 },
          callouts: [['button[data-wmap-summary-toggle]:visible', { badge: 1, pad: 2 }]],
        },
      ],
    },
    {
      id: '02-top-item',
      title: 'What stands out: the headline and the top item with its chips',
      steps: [['scrollIntoView', section('What stands out')], PARK],
      checks: [hasText(RIGHT, 'differ by Split')],
      shots: [
        { name: 'what-stands-out', clip: fromHeader('What stands out', CHIPS) },
        {
          name: 'top-item-chips',
          clip: fromHeader('What stands out', CHIPS),
          callouts: [
            ['[role="group"][aria-label="Show one part on the map"]', { badge: 1, pad: 2 }],
          ],
        },
      ],
    },
    {
      id: '03-chip-on-map',
      title: 'A chip shows its one part on the map',
      steps: [['click', `${CHIPS} >> text=fmax_MHz`], ['wait', 800], PARK],
      checks: [isVisible(LOG, 'the map is in Test Value mode: the log scale button is showing')],
      shots: [{ name: 'chip-on-map', clip: { rect: { x: 0, y: 40, width: 1280, height: 600 } }, callouts: [[`${CHIPS} >> text=fmax_MHz`, { pad: 2 }]] }],
    },
    {
      id: '04-row-on-map',
      title: 'A ranked row shows its dies on the map',
      steps: [['click', `${CHIPS} >> text=fmax_MHz`], ['wait', 500], ['click', `${RIGHT} >> text=vth_n_mV: 176 dies`], ['wait', 800], PARK],
      shots: [{ name: 'row-on-map', callouts: [[`${RIGHT} >> text=vth_n_mV: 176 dies`, { closest: '[data-wmap-test]', pad: 2 }]] }],
    },
    {
      id: '05-chart-link',
      title: 'The Chart link on a row opens its card in Insights',
      steps: [['click', `${RIGHT} >> text=vth_n_mV: 176 dies`], ['wait', 500], PARK],
      shots: [{ name: 'chart-link', clip: fromHeader('What stands out', CHIPS), callouts: [[`${RIGHT} [aria-label^="Chart:"]`, { nth: 0, pad: 2 }]] }],
    },
      {
      id: '06-full-report',
      title: 'Full report ▸ at the foot of What stands out opens the report',
      steps: [['scrollIntoView', `${RIGHT} >> text=Full report`], ['click', `${RIGHT} >> text=Full report`], ['wait', 1000], ['click', `${REPORT} >> text="Summary report"`], ['wait', 400]],
      checks: [hasText(REPORT, 'Open as full page')],
      shots: [{ name: 'full-report' }],
    },
    {
      id: '07-findings',
      title: 'The Findings list: severity groups and detail rows',
      steps: [['press', 'Escape'], ['wait', 500], TOP, ['scrollIntoView', section('Findings')], PARK],
      checks: [hasText(RIGHT, 'Spatial pattern: edge')],
      shots: [{ name: 'findings-list', clip: fromHeader('Findings (', `${RIGHT} >> text=idsat_p_uA is 2.9 pp`) }],
    },
    {
      id: '08-finding-on-map',
      title: 'Click a finding to show it on the map',
      steps: [['click', `${RIGHT} [data-wmap-finding] >> nth=0`], ['wait', 800], TOP, PARK],
      shots: [],
    },
    {
      id: '09-wafer-yield',
      title: 'Wafer Yield: one bar per wafer, with a Slot / Yield switch',
      steps: [['scrollIntoView', section('Wafer Yield')], TOP, PARK],
      shots: [{ name: 'wafer-yield', clip: sectionClip('Wafer Yield', { row: true }) }],
    },
      {
      id: '10-wafer-yield-sorted',
      title: 'Yield re-sorts the wafers by yield',
      steps: [['click', `${RIGHT} [role="radiogroup"] label:has-text("Yield")`], ['wait', 500], ['scrollIntoView', section('Wafer Yield')], TOP, PARK],
      checks: [radioOn('Yield')],
      shots: [{ name: 'wafer-yield-sorted', clip: sectionClip('Wafer Yield', { row: true }), callouts: [[`${RIGHT} [role="radiogroup"] label:has-text("Yield")`, { pad: 2 }]] }],
    },
    {
      id: '11-hard-bin-breakdown',
      title: 'Hard Bin Breakdown, with Hard / Soft',
      steps: [['scrollIntoView', section('Bin Breakdown')], TOP, PARK],
      shots: [{ name: 'bin-breakdown', clip: sectionClip('Bin Breakdown', { row: true }) }],
    },
    {
      id: '12-soft-breakdown',
      title: 'Soft switches the breakdown to soft bins',
      steps: [['click', `${RIGHT} [role="radiogroup"] label:has-text("Soft")`], ['wait', 500], ['scrollIntoView', section('Bin Breakdown')], TOP, PARK],
      checks: [radioOn('Soft')],
      shots: [{ name: 'bin-breakdown-soft', clip: sectionClip('Bin Breakdown', { row: true }), callouts: [[`${RIGHT} [role="radiogroup"] label:has-text("Soft")`, { pad: 2 }]] }],
    },
    {
      id: '13-ring-yield',
      title: 'Ring Yield, with Ring / Quadrant',
      steps: [['click', `${RIGHT} [role="radiogroup"] label:has-text("Hard")`], ['click', section('Ring Yield')], ['wait', 400], ['scrollIntoView', section('Ring Yield')], TOP, PARK],
      checks: [expanded('Ring Yield')],
      shots: [{ name: 'ring-yield', clip: sectionClip('Ring Yield', { row: true }) }],
    },
    {
      id: '14-quadrant-yield',
      title: 'Quadrant splits the wafer N, S, E and W',
      steps: [['click', `${RIGHT} [role="radiogroup"] label:has-text("Quadrant")`], ['wait', 500], ['scrollIntoView', section('Quadrant Yield')], TOP, PARK],
      checks: [radioOn('Quadrant')],
      shots: [{ name: 'quadrant-yield', clip: sectionClip('Quadrant Yield', { row: true }), callouts: [[`${RIGHT} [role="radiogroup"] label:has-text("Quadrant")`, { pad: 2 }]] }],
    },
    {
      id: '15-test-values',
      title: 'Test Values: mean, Ppk and limit yield per test',
      // Open Functional Tests too, so the panel has room to scroll Test Values clear of the bottom.
      steps: [['click', section('Test Values')], ['click', section('Functional Tests')], ['wait', 400], ['scrollIntoView', section('Test Values')], TOP, PARK],
      checks: [expanded('Test Values')],
      shots: [{ name: 'test-values', clip: sectionClip('Test Values')}],
    },
    {
      id: '16-functional-tests',
      title: 'Functional Tests: pass rate per test',
      steps: [['scrollIntoView', section('Functional Tests')], ['scrollTop', '#map-container', 99999], PARK],
      checks: [expanded('Functional Tests')],
      shots: [{ name: 'functional-tests', clip: sectionClip('Functional Tests')}],
    },
    {
      id: '17-report-buttons',
      title: 'Summary report and Data tables sit at the top of the panel',
      steps: [TOP, ['scrollTop', RIGHT, 0], PARK],
      checks: [isVisible(`${RIGHT} button:has-text("Summary report")`), isVisible(`${RIGHT} button:has-text("Data tables")`)],
      shots: [{
        name: 'report-buttons',
        clip: { target: `${RIGHT} button:has-text("Summary report")`, through: `${RIGHT} button:has-text("Data tables")`, pad: 12 },
        callouts: [
          [`${RIGHT} button:has-text("Summary report")`, { badge: 1, pad: 2 }],
          [`${RIGHT} button:has-text("Data tables")`, { badge: 2, pad: 2 }],
        ],
      }],
    },
    {
      id: '18-data-tables',
      title: 'Data tables opens every number as a table',
      steps: [['setViewport', 900, 620], ['click', `${RIGHT} button:has-text("Data tables")`], ['wait', 1000], ['click', `${REPORT} >> text=/^Data tables — /`], ['wait', 400]],
      checks: [hasText(REPORT, 'Data tables')],
      shots: [{ name: 'data-tables', clip: { target: REPORT, pad: 12 } }],
    },
    {
      id: '19-edge-lot',
      title: 'EDGE-LOT-01: a spatial pattern and the bins behind it',
      steps: [['press', 'Escape'], ['wait', 500], ['setViewport', 1280, 820], ['click', '#reset-btn'], ['wait', 800], ['loadFile', S('EDGE-LOT-01.stdf')], ['waitForWafers'], TOP, PARK],
      checks: [hasText(RIGHT, 'Lot EDGE-LOT-01')],
      shots: [{ name: 'edge-top-item', clip: fromHeader('What stands out', CHIPS) }],
    },
    {
      id: '20-supporting',
      title: 'A spatial pattern has a Show N supporting findings line',
      steps: [['scrollIntoView', section('Findings')], PARK],
      checks: [hasText(RIGHT, 'Show 14 supporting findings')],
      shots: [{ name: 'supporting-closed', clip: fromHeader('Findings (', `${RIGHT} >> text=Show 14 supporting findings`), callouts: [[`${RIGHT} >> text=Show 14 supporting findings`, { pad: 2 }]] }],
    },
    {
      id: '20b-supporting-open',
      title: 'Opened, it lists the regional findings the pattern explains',
      steps: [['click', `${RIGHT} >> text=Show 14 supporting findings`], ['wait', 500], TOP, PARK],
      checks: [hasText(RIGHT, 'Hide 14 supporting findings')],
      shots: [{ name: 'supporting-findings', clip: fromHeader('Findings (', `${RIGHT} >> text=Hide 14 supporting findings`, { maxHeight: 420 }) }],
    },
    {
      id: '20c-same-dies',
      title: 'A finding that names two bins: the same dies counted in both bin types',
      steps: [['scrollIntoView', `${RIGHT} >> text=/same dies/ >> nth=0`], PARK],
      checks: [hasText(RIGHT, 'same dies')],
      shots: [{ name: 'same-dies', clip: { target: `${RIGHT} [data-wmap-finding]:has-text("same dies") >> nth=0`, pad: 3 } }],
    },
    {
      id: '21-edge-chip',
      title: 'A bin chip shows just those dies',
      steps: [['scrollTop', RIGHT, 0], ['click', `${CHIPS} >> text=Hard bin 3`], ['wait', 800], PARK],
      shots: [{ name: 'edge-bin-chip', callouts: [[`${CHIPS} >> text=Hard bin 3`, { pad: 2 }]] }],
    },
    {
      id: '22-nothing-stands-out',
      title: 'A healthy lot says so: Nothing stands out',
      steps: [['click', '#reset-btn'], ['wait', 800], ['loadFile', S('HY-LOT-04.stdf')], ['waitForWafers'], TOP, PARK],
      checks: [hasText(RIGHT, 'Nothing stands out')],
      shots: [{ name: 'nothing-stands-out', clip: fromHeader('What stands out', `${RIGHT} >> text=Full report`) }],
    },
    ],
};
