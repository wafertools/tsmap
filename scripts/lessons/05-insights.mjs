/**
 * Lesson 05 — Insights. Screenshots for docs/learn/05-insights.md.
 *
 * The sample lot's Insights view: the Maps | Insights switch and the tabs, then the Overview (yield by wafer, bin
 * pareto, pass rate, What divides yield, PAT), Group by, a chart's Expand and Chart actions menu, the Distributions
 * charts and their shared controls, and the Data tables with their CSV buttons. Correlation and My plots have their
 * own sessions. Run by scripts/lesson-shots.mjs.
 */

import { isVisible, hasText } from '../lib/checks.mjs';

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
  session: '05',
  title: 'Insights',
  theme: 'github-light',
  viewport: { width: 1280, height: 820 },
  deviceScaleFactor: 2,
  beats: [
    {
      id: '01-open-insights',
      title: 'Insights on the sample lot: the switch, the tabs and the headline tiles',
      steps: [['click', 'button:has-text("Load sample data")'], ['waitForWafers'], ['click', '[data-wmap-view="insights"]'], ['wait', 1500], PARK],
      checks: [onCard('Yield by wafer')],
      shots: [
        { name: 'insights-overview', clip: { rect: { x: 0, y: 50, width: 1280, height: 770 } } },
        {
          name: 'switch-and-tabs',
          clip: { rect: { x: 0, y: 36, width: 1280, height: 160 } },
          callouts: [['[data-wmap-view-switch]', { badge: 1, pad: 2 }], [tab('Overview'), { badge: 2, pad: 4 }]],
        },
      ],
    },
    {
      id: '02-yield-by-wafer',
      title: 'Yield by wafer, sorted by wafer or by yield',
      steps: [PARK],
      checks: [radioOn('Yield by wafer', 'Sort: wafer')],
      shots: [{ name: 'yield-by-wafer', clip: cardClip('Yield by wafer'), callouts: [[radio('Yield by wafer', 'Sort: yield'), { pad: 2 }]] }],
    },
    {
      id: '03-sort-yield',
      title: 'Sort: yield puts the weakest wafers first',
      steps: [['click', radio('Yield by wafer', 'Sort: yield')], ['wait', 500], PARK],
      checks: [radioOn('Yield by wafer', 'Sort: yield')],
      shots: [{ name: 'yield-sorted', clip: cardClip('Yield by wafer') }],
    },
    {
      id: '04-pareto',
      title: 'Hard bin pareto, with Hard bins and Soft bins',
      steps: [['click', radio('Yield by wafer', 'Sort: wafer')], PARK],
      checks: [radioOn('bin pareto', 'Hard bins')],
      shots: [{ name: 'bin-pareto', clip: cardClip('bin pareto'), callouts: [[radio('bin pareto', 'Soft bins'), { pad: 2 }]] }],
    },
    {
      id: '05-pareto-soft',
      title: 'Soft bins',
      steps: [['click', radio('bin pareto', 'Soft bins')], ['wait', 500], PARK],
      checks: [radioOn('bin pareto', 'Soft bins')],
      shots: [{ name: 'bin-pareto-soft', clip: cardClip('bin pareto') }],
    },
    {
      id: '06-pass-rate',
      title: 'Parametric pass rate, judged by Test limits, Tester flag or Functional',
      steps: [['click', radio('bin pareto', 'Hard bins')], top(card('pass rate')), PARK],
      checks: [onCard('pass rate')],
      shots: [{
        name: 'pass-rate',
        clip: cardClip('pass rate'),
        callouts: [[`${card('pass rate')} [role="radiogroup"]`, { pad: 2 }]],
      }],
    },
    {
      id: '07-pass-rate-flag',
      title: 'Tester flag judges by the tester\'s own pass/fail flag',
      steps: [['click', radio('pass rate', 'Tester flag')], ['wait', 500], PARK],
      shots: [{ name: 'pass-rate-flag', clip: cardClip('pass rate') }],
    },
    {
      id: '08-pass-rate-functional',
      title: 'Functional judges the functional tests',
      steps: [['click', radio('pass rate', 'Functional')], ['wait', 500], PARK],
      shots: [{ name: 'pass-rate-functional', clip: cardClip('pass rate') }],
    },
    {
      id: '08b-worth-a-look',
      title: 'Worth a look: the same items as What stands out, each drawn as a chart, with Show on map',
      steps: [top('[data-wmap-chart-title="fmax_MHz by Split"]'), PARK],
      checks: [isVisible('[data-wmap-chart-title="fmax_MHz by Split"]', 'the Worth a look card for fmax_MHz is showing')],
      shots: [{
        name: 'worth-a-look',
        clip: { target: '[data-wmap-chart-title="fmax_MHz by Split"]', pad: 8 },
        callouts: [['[data-wmap-chart-title="fmax_MHz by Split"] button:has-text("Show on map")', { pad: 2 }]],
      }],
    },
    {
      id: '14-chart-actions',
      title: 'A card\'s ⋯ menu: Save as PNG, Edit as plot and About this chart',
      steps: [['click', `${card('Yield by')} button[aria-label="Chart actions"]`], ['wait', 300]],
      checks: [isVisible(MENU, 'the Chart actions menu is open')],
      shots: [{ name: 'chart-actions', clip: { target: MENU, pad: 90 }, callouts: [[`${card('Yield by')} button[aria-label="Chart actions"]`, { pad: 2 }]] }],
    },
    {
      id: '15-about',
      title: 'About this chart adds one line saying what the chart shows',
      steps: [['click', `${MENU} >> text=About this chart`], ['wait', 400], PARK],
      shots: [{ name: 'about-chart', clip: cardClip('Yield by', { maxHeight: 330 }) }],
    },
    {
      id: '16-expand',
      title: 'Expand opens one chart large',
      steps: [['click', `${card('Yield by')} button[aria-label="Expand"]`], ['wait', 1000]],
      checks: [isVisible('[role="dialog"]', 'the chart is open in its own window')],
      shots: [{ name: 'expanded-chart', clip: { target: '[role="dialog"]', pad: 8 } }],
    },
    {
      id: '09-what-divides-yield',
      title: 'What divides yield ranks the wafer fields by how clearly their groups differ',
      // A narrower window wraps the card's wide table, so it reads larger on the slide.
      steps: [['press', 'Escape'], ['wait', 500], ['click', radio('pass rate', 'Test limits')], ['setViewport', 880, 820], top(card('What divides yield')), PARK],
      checks: [onCard('What divides yield')],
      shots: [{ name: 'what-divides-yield', clip: cardClip('What divides yield') }],
    },
    {
      id: '10-pat',
      title: 'Part average testing: dies that pass every limit but sit far from their wafer\'s distribution',
      steps: [['setViewport', 1280, 820], top(card('Part average testing')), ['scrollTop', '#map-container', 99999], PARK],
      checks: [onCard('Part average testing')],
      shots: [{ name: 'pat-card', clip: cardClip('Part average testing', { maxWidth: 700 }), callouts: [[`${card('Part average testing')} button:has-text("Map the verdicts")`, { pad: 2 }]] }],
    },
    {
      id: '10b-data-tab-link',
      title: 'At the foot of the Overview, a link to the Data tab',
      steps: [['scrollTop', '#map-container', 99999], PARK],
      checks: [isVisible('button[data-wmap-open-data-tab]', 'the Data tab link is showing')],
      shots: [{
        name: 'data-tab-link',
        clip: { target: 'button[data-wmap-open-data-tab]', closest: 'div', pad: 24, maxWidth: 560 },
        callouts: [['button[data-wmap-open-data-tab]', { pad: 2 }]],
      }],
    },
    {
      id: '11-map-the-verdicts',
      title: 'Map the verdicts goes back to the maps in PAT verdict mode',
      steps: [['click', `${card('Part average testing')} button:has-text("Map the verdicts")`], ['wait', 1500], PARK],
      checks: [hasText('[data-wmap-gallery-legend]', 'PAT')],
      shots: [{ name: 'pat-map', clip: { rect: { x: 0, y: 50, width: 1280, height: 560 } } }],
    },
    {
      id: '12-group-by-menu',
      title: 'Back in Insights, Group by lists the wafer fields that vary',
      steps: [['click', '[data-wmap-view="insights"]'], ['wait', 1200], ['click', groupBy], ['wait', 300]],
      checks: [isVisible('[role="option"]:has-text("Split")', 'Split is offered by Group by')],
      shots: [{ name: 'group-by-menu', clip: { target: groupBy, through: '[role="option"]:has-text("Split")', pad: 60 } }],
    },
    {
      id: '13-grouped',
      title: 'Grouped by Split: yield and the bin pareto draw a bar per group',
      steps: [['click', '[role="option"]:has-text("Split")'], ['wait', 1000], ['scrollTop', '#map-container', 0], PARK],
      checks: [onCard('Yield by')],
      shots: [{ name: 'grouped-overview', clip: { rect: { x: 0, y: 50, width: 1280, height: 770 } } }],
    },
    {
      id: '17-distributions',
      title: 'Distributions: capability, the box plot, the histogram and the trend',
      steps: [['press', 'Escape'], ['wait', 500], ['click', groupBy], ['wait', 300], ['click', '[role="option"]:has-text("None")'], ['wait', 600], ['click', tab('Distributions')], ['wait', 1000], PARK],
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
    ],
};
