/**
 * Lesson 05 — Insights: where yield is lost. Screenshots for docs/learn/05-insights-yield.md.
 *
 * The sample lot's Insights view: the Maps | Insights switch and the tabs, then the Overview (yield by wafer, bin
 * pareto, pass rate, What divides yield, PAT), a chart's Expand and Chart actions menu, and Group by. Distributions and
 * the Data tables are lesson 06; Correlation and My plots have their own lessons. Run by scripts/lesson-shots.mjs.
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
  title: 'Insights: where yield is lost',
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
      id: '08c-ring-quadrant',
      title: 'Ring yield and Quadrant yield: two wafer diagrams, each region labelled with its yield',
      steps: [['scrollIntoView', card('Ring yield')], PARK],
      checks: [onCard('Ring yield'), onCard('Quadrant yield')],
      shots: [{ name: 'ring-yield', clip: cardClip('Ring yield') }],
    },
    {
      id: '08d-quadrant',
      title: 'Quadrant yield: each quadrant labelled with its yield',
      steps: [['scrollIntoView', card('Quadrant yield')], PARK],
      checks: [onCard('Quadrant yield')],
      shots: [{ name: 'quadrant-yield', clip: cardClip('Quadrant yield') }],
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
    ],
};
