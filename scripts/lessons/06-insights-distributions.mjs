/**
 * Lesson 06 — Insights: distributions and data. Screenshots for docs/learn/06-insights-distributions.md.
 *
 * The sample lot's Distributions tab (capability, the box plot, the histogram, the trend and their shared controls),
 * comparing groups of wafers under Group by, and the Data tables with their CSV buttons. Run by scripts/lesson-shots.mjs.
 */

import { isVisible, hasText } from '../lib/checks.mjs';
import { SAMPLEDATA } from '../lib/paths.mjs';

const RRAM = `${SAMPLEDATA}/RRAM-LOT-06.stdf`;
const SPEC_DEFS = `${SAMPLEDATA}/PVT-LOT-05_testdefs_spec.csv`;
const SELECTOR = '#tsmap-test-selector-overlay [role="dialog"]';
const SEL_BTN = (t) => `#tsmap-test-selector-overlay button:has-text("${t}")`;

const PARK = ['hover', '#toolbar-title'];
const card = (title) => `[data-wmap-chart-card][data-wmap-chart-title*="${title}"]`;
const tab = (name) => `button:text-is("${name}")`;
const within = (title, sel) => `${card(title)} ${sel}`;
const radio = (title, label) => `${card(title)} label:has-text("${label}")`;
const cardClip = (title, extra = {}) => ({ target: card(title), pad: 8, ...extra });
const groupBy = 'label:has-text("Group by:") button';
const onCard = (title) => ({
  name: `card-${title}`,
  describe: `the ${title} card is showing`,
  get: (page) => page.locator(card(title)).count(),
  expect: (n) => n >= 1,
});
const radioOn = (title, label) => ({
  name: `radio-${title}-${label}`,
  describe: `${label} is selected on ${title}`,
  get: (page) => page.locator(radio(title, label)).first().getAttribute('data-on'),
  expect: (v) => v === 'true',
});
const top = (sel) => ['scrollIntoView', sel];
const MENU = '[role="menu"], [role="listbox"]';

export const scenario = {
  session: '06',
  title: 'Insights: distributions and data',
  theme: 'github-light',
  viewport: { width: 1280, height: 820 },
  deviceScaleFactor: 2,
  beats: [
    {
      id: '01-open-insights',
      title: 'Insights on the sample lot: at the foot of the Overview, a link to the Data tab',
      steps: [['click', 'button:has-text("Load sample data")'], ['waitForWafers'], ['click', '[data-wmap-view="insights"]'], ['wait', 1500], ['scrollTop', '#map-container', 99999], PARK],
      checks: [isVisible('button[data-wmap-open-data-tab]', 'the Data tab link is showing')],
      shots: [{
        name: 'data-tab-link',
        clip: { target: 'button[data-wmap-open-data-tab]', closest: 'div', pad: 24, maxWidth: 560 },
        callouts: [['button[data-wmap-open-data-tab]', { pad: 2 }]],
      }],
    },
    {
      id: '02-open-distributions',
      title: 'Distributions tab: capability, the box plot, the histogram and the trend',
      steps: [['scrollTop', '#map-container', 0], ['click', tab('Distributions')], ['wait', 1000], PARK],
      checks: [onCard('Process capability')],
      shots: [{ name: 'distributions', clip: { rect: { x: 0, y: 50, width: 1280, height: 770 } } }],
    },
    {
      id: '18-capability',
      title: 'Process capability: every test against its own limits, worst Ppk first',
      steps: [PARK],
      shots: [{ name: 'capability', clip: cardClip('Process capability') }],
    },
    {
      id: '19-test-menu',
      title: 'The Test menu picks the test for the box plot, histogram and trend together',
      steps: [['click', `${card('Test value distribution')} button[aria-label="Test"]`], ['wait', 300]],
      checks: [isVisible(MENU, 'the Test menu is open')],
      shots: [{ name: 'test-menu', clip: { rect: { x: 640, y: 130, width: 640, height: 360 } } }],
    },
    {
      id: '20-box-controls',
      title: 'Axis includes limits, Clip outliers and Log scale',
      steps: [['click', `${MENU} >> text=ioff_nA`], ['wait', 700], PARK],
      shots: [{
        name: 'box-controls',
        clip: cardClip('Test value distribution'),
        callouts: [
          [`${card('Test value distribution')} label:has-text("Axis includes limits")`, { badge: 1, pad: 2 }],
          [`${card('Test value distribution')} label:has-text("Clip outliers")`, { badge: 2, pad: 2 }],
          [`${card('Test value distribution')} label:has-text("Log scale")`, { badge: 3, pad: 2 }],
        ],
      }],
    },
    {
      id: '21-clipped',
      title: 'Clip outliers narrows the axis; the statistics still use every value',
      steps: [['click', `${card('Test value distribution')} label:has-text("Clip outliers")`], ['wait', 700], PARK],
      shots: [{ name: 'box-clipped', clip: cardClip('Test value distribution') }],
    },
    {
      id: '22-histogram-wafer',
      title: 'The histogram has its own Wafer menu: all wafers pooled, or one wafer',
      steps: [['scrollIntoView', card('Value histogram')], ['click', `${card('Value histogram')} button[aria-label="Wafer"]`], ['wait', 300]],
      checks: [isVisible(MENU, 'the Wafer menu is open')],
      shots: [{ name: 'wafer-menu', clip: cardClip('Value histogram', { maxHeight: 520 }) }],
    },
    {
      id: '23-trend',
      title: 'The wafer-to-wafer trend keeps slot order, with a band of one standard deviation',
      steps: [['press', 'Escape'], ['wait', 300], ['scrollIntoView', card('Wafer-to-wafer trend')], PARK],
      shots: [{ name: 'trend', clip: cardClip('Wafer-to-wafer trend') }],
    },
    {
      id: '24-comparing',
      title: 'With Group by on, Distributions opens with Comparing groups of wafers',
      steps: [['scrollTop', '#map-container', 0], ['click', groupBy], ['wait', 300], ['click', '[role="option"]:has-text("Split")'], ['wait', 1200], PARK],
      checks: [hasText('#map-container', 'Comparing')],
      shots: [{ name: 'comparing-groups', clip: cardClip('Comparison by') }, { name: 'difference-map', clip: cardClip('Difference map') }],
    },
    {
      id: '24b-grouped-histogram',
      title: 'Grouped, the histogram draws each split as a share of its own dies',
      steps: [['scrollIntoView', card('Value histogram'), 70], PARK],
      checks: [radioOn('Value histogram', 'Share of')],
      shots: [{ name: 'histogram-share', clip: cardClip('Value histogram'), callouts: [[radio('Value histogram', 'Counts'), { pad: 2 }]] }],
    },
    {
      id: '24c-box-nested',
      title: 'Grouped, the box plot offers each split with its wafers inside it',
      steps: [['scrollIntoView', card('Test value distribution'), 70], ['click', radio('Test value distribution', ', then wafer')], ['wait', 600], PARK],
      checks: [radioOn('Test value distribution', ', then wafer')],
      shots: [{ name: 'box-nested', clip: cardClip('Test value distribution') }],
    },
    {
      id: '24d-trend-control',
      title: 'The trend offers a control chart of the same wafers',
      steps: [['scrollIntoView', card('Wafer-to-wafer'), 70], ['click', radio('Wafer-to-wafer', 'Control chart')], ['wait', 600], PARK],
      checks: [radioOn('Wafer-to-wafer', 'Control chart')],
      shots: [{ name: 'trend-control', clip: cardClip('Wafer-to-wafer') }],
    },
    {
      id: '25-data-statistics',
      title: 'Data: Statistics, the numbers behind the charts, with CSV buttons',
      steps: [['click', groupBy], ['wait', 300], ['click', '[role="option"]:has-text("None")'], ['wait', 500], ['click', tab('Data')], ['wait', 800], PARK],
      checks: [hasText('#map-container', 'Test values CSV')],
      shots: [{
        name: 'data-statistics',
        clip: { rect: { x: 0, y: 50, width: 1280, height: 470 } },
        callouts: [['button:has-text("Test values CSV")', { badge: 1, pad: 2 }], ['button:has-text("Functional CSV")', { badge: 2, pad: 2 }]],
      }],
    },
    {
      id: '26-data-wafers',
      title: 'Wafers: one row per wafer, with its fields and yield',
      steps: [['click', '[role="radiogroup"][aria-label="Table"] button:text-is("Wafers")'], ['wait', 800], PARK],
      shots: [{ name: 'data-wafers', clip: { rect: { x: 0, y: 50, width: 1280, height: 470 } } }],
    },
    {
      id: '27-data-dies',
      title: 'Dies: one row per die, with Export CSV, Copy and the Wide or Long layout',
      steps: [['click', '[role="radiogroup"][aria-label="Table"] button:text-is("Dies")'], ['wait', 1200], PARK],
      shots: [{ name: 'data-dies', clip: { rect: { x: 0, y: 50, width: 1280, height: 470 } } }],
    },
    {
      id: '28-limits-choice',
      title: 'With a definitions file that adds spec limits, a Limits choice appears on the box plot',
      steps: [
        ['click', '#reset-btn'], ['wait', 800], ['click', 'button:has-text("Load sample data")'], ['waitForWafers'],
        ['openTestsDialog'], ['chooseFile', SEL_BTN('Load definitions'), SPEC_DEFS], ['wait', 600],
        ['click', SEL_BTN('All')], ['wait', 300], ['click', `${SELECTOR} button:has-text("Apply to")`], ['wait', 2500],
        ['click', '[data-wmap-view="insights"]'], ['wait', 1500], ['click', tab('Distributions')], ['wait', 1200], PARK,
      ],
      checks: [isVisible(`${card('Test value distribution')} label:has-text("Limits:") button`, 'the Limits choice is showing')],
      shots: [{ name: 'limits-choice', clip: cardClip('Test value distribution'), callouts: [[`${card('Test value distribution')} label:has-text("Limits:") button`, { pad: 2 }]] }],
    },
    {
      id: '29-no-limits',
      title: 'RRAM-LOT-06: tests without limits are drawn muted and dashed on their own range',
      steps: [
        ['click', '#reset-btn'], ['wait', 800], ['loadFile', RRAM], ['waitForWafers'],
        ['click', '[data-wmap-view="insights"]'], ['wait', 1500], ['click', tab('Distributions')], ['wait', 1500], PARK,
      ],
      checks: [onCard('Process capability')],
      shots: [{ name: 'no-limits', clip: cardClip('Process capability') }],
    },
    ],
};
