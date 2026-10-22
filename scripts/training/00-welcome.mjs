/**
 * Session 00 — Welcome. Screenshots for docs/training/00-welcome.md.
 *
 * Starts on the empty start screen, loads the bundled sample lot (the one every
 * lab uses), and photographs the screen layout: once with every area numbered,
 * then once per area with only that area outlined, so the deck can walk the
 * tour one area per slide. Run by scripts/training-shots.mjs.
 */

import { isVisible, hasText } from '../lib/checks.mjs';

// The numbered areas of the loaded screen, in tour order. Each entry is a
// callout: [selector, options]. The deck's tour slides follow this order.
const AREAS = [
  ['#drop-zone', { through: '#reset-btn' }],
  ['[data-wmap-gallery-meta]', {}],
  ['[data-wmap-toolbar="gallery"]', {}],
  ['[data-wmap-view-switch]', {}],
  ['[data-wmap-gallery-legend]', {}],
  ['.wmap-gallery-card', { nth: 0 }],
  ['[data-wmap-summary-close]', { closest: '[data-wmap-placement]' }],
  ['#log-toggle', {}],
];
const numbered = AREAS.map(([target, opts], i) => [target, { ...opts, badge: i + 1 }]);
const AREA_NAMES = ['toolbar', 'lot', 'map-toolbar', 'views', 'legend', 'wafer', 'summary', 'log'];

export const scenario = {
  session: '00',
  title: 'Welcome',
  theme: 'github-light',
  viewport: { width: 1280, height: 820 },
  deviceScaleFactor: 2,
  beats: [
    {
      id: '01-start-screen',
      title: 'The start screen, before anything is loaded',
      checks: [
        hasText('#map-container', 'Open a file to get started'),
        isVisible('button:has-text("Load sample data")'),
      ],
      shots: [
        { name: 'start-screen', callouts: [['button:has-text("Load sample data")', {}]] },
      ],
    },
    {
      id: '02-sample-lot',
      title: 'Load sample data: 13 wafers from five process corners',
      steps: [
        ['click', 'button:has-text("Load sample data")'],
        ['waitForWafers'],
        // Park the pointer where it opens no tooltip.
        ['hover', '#toolbar-title'],
      ],
      checks: [
        hasText('[data-wmap-gallery-meta]', 'PVT-LOT-05'),
        hasText('[data-wmap-gallery-legend]', 'Yield 79.0%'),
        {
          name: 'thirteen-wafers',
          describe: 'the gallery shows 13 wafer cards',
          get: (page) => page.locator('.wmap-gallery-card').count(),
          expect: (n) => n === 13,
        },
      ],
      shots: [
        { name: 'layout' },
        { name: 'layout-numbered', callouts: numbered },
        // One crop per area, with some of the screen round it for context.
        ...AREAS.map(([target, opts], i) => ({
          name: `area-${i + 1}-${AREA_NAMES[i]}`,
          callouts: [[target, { ...opts, badge: i + 1 }]],
          clip: { target, nth: opts.nth, closest: opts.closest, through: opts.through, pad: 60 },
        })),
        // The legend strip and the first wafer under it, for the recap slide: the legend says what each colour is.
        { name: 'wafer-legend', clip: { target: '[data-wmap-gallery-legend]', through: '.wmap-gallery-card >> nth=0', maxWidth: 800, pad: 8 } },
      ],
    },
    {
      id: '03-help-menu',
      title: 'The ? button opens the Help menu',
      steps: [
        ['click', '#help-btn'],
        ['wait', 300],
      ],
      checks: [
        isVisible('text="User guide"', 'the Help menu lists User guide'),
      ],
      shots: [
        { name: 'help-menu', callouts: [['#help-btn', { pad: 3 }], ['text="User guide"', { pad: 3 }]] },
      ],
    },
  ],
};
