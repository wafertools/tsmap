/**
 * Session 02 — Reading a map and the toolbar. Screenshots for
 * docs/training/02-reading-a-map.md.
 *
 * The sample lot throughout: the gallery toolbar's menus one at a time (plot
 * mode, colour scheme, overlays, orientation, legend style, columns), a test
 * value map, a highlighted bin, then one wafer close up — its toolbar, zoom,
 * the die tooltip and the wafer's details. Run by scripts/training-shots.mjs.
 */

import { isVisible, hasText } from '../lib/checks.mjs';

const GT = '[data-wmap-toolbar="gallery"]';
const CARD = '.wmap-gallery-card';
const btn = (label) => `${GT} button[aria-label="${label}"]`;
const menu = (label) => `[role="menu"][aria-label="${label}"]`;
const row = (text) => `[role^="menuitem"]:has-text("${text}")`;
const cardBtn = (label) => `${CARD} >> nth=0 >> button[aria-label="${label}"]`;
const PARK = ['hover', '#toolbar-title'];

/** A shot of an open toolbar menu: the menu and its button, with room round them. */
const menuShot = (name, label) => ({
  name,
  clip: { target: menu(label), pad: 70 },
  callouts: [[btn(label), { pad: 2 }]],
});

export const scenario = {
  session: '02',
  title: 'Reading a map and the toolbar',
  theme: 'github-light',
  viewport: { width: 1280, height: 720 },
  beats: [
    {
      id: '01-sample-lot',
      title: 'The sample lot in Hard Bin mode, and the gallery toolbar',
      steps: [['click', 'button:has-text("Load sample data")'], ['waitForWafers'], PARK],
      checks: [hasText('[data-wmap-gallery-meta]', 'PVT-LOT-05'), hasText('[data-wmap-gallery-legend]', 'HARD BIN')],
      shots: [{ name: 'gallery-toolbar', clip: { target: GT, pad: 40 } }],
    },
    {
      id: '02-plot-mode-menu',
      title: 'Plot mode lists what a die can be coloured by',
      steps: [['click', btn('Plot mode')], ['wait', 300]],
      checks: [isVisible(menu('Plot mode'), 'the Plot mode menu is open')],
      shots: [menuShot('plot-mode-menu', 'Plot mode')],
    },
    {
      id: '03-soft-bin',
      title: 'Soft Bin colours each die by its failure category',
      steps: [['click', `${menu('Plot mode')} ${row('Soft Bin')}`], ['wait', 800], PARK],
      checks: [hasText('[data-wmap-gallery-legend]', 'SOFT BIN')],
      shots: [{ name: 'soft-bin', callouts: [['[data-wmap-gallery-legend]', {}]] }],
    },
    {
      id: '04-colour-scheme',
      title: 'Colour scheme: the default bin colours or a colour-blind safe set',
      steps: [
        ['click', btn('Plot mode')], ['wait', 300], ['click', `${menu('Plot mode')} ${row('Hard Bin')}`], ['wait', 600],
        ['click', btn('Colour scheme')], ['wait', 300],
      ],
      checks: [isVisible(menu('Colour scheme'), 'the Colour scheme menu is open')],
      shots: [menuShot('colour-scheme-menu', 'Colour scheme')],
    },
    {
      id: '05-test-value',
      title: 'Test Value ▶ fmax_MHz colours each die by its reading',
      steps: [
        ['press', 'Escape'],
        ['click', btn('Plot mode')], ['wait', 300],
        ['hover', `${menu('Plot mode')} ${row('Test Value')}`], ['wait', 400],
        ['click', '[role="menu"] >> nth=1 >> [role^="menuitem"]:has-text("fmax_MHz")'],
        ['wait', 1000], PARK,
      ],
      checks: [
        isVisible(`${GT} button[aria-label^="Colorbar range"]`, 'the Colorbar range button has appeared'),
        isVisible(`${GT} button[aria-label="Toggle log scale"]`, 'the Log scale button has appeared'),
      ],
      shots: [
        {
          name: 'test-value',
          callouts: [
            [`${GT} button[aria-label="Toggle log scale"]`, { badge: 1, pad: 2 }],
            [`${GT} button[aria-label^="Colorbar range"]`, { badge: 2, pad: 2 }],
          ],
        },
        { name: 'test-value-card', clip: { target: CARD, nth: 0, pad: 8 } },
      ],
    },
    {
      id: '06-highlight-bin',
      title: 'Back to Hard Bin; click a bin in the legend to highlight it',
      steps: [
        ['click', btn('Plot mode')], ['wait', 300], ['click', `${menu('Plot mode')} ${row('Hard Bin')}`], ['wait', 800],
        ['click', '[data-wmap-gallery-legend] [role="button"] >> nth=1'], ['wait', 600], PARK,
      ],
      checks: [{
        name: 'bin-2-pressed',
        describe: 'the bin 2 legend entry is pressed',
        get: (page) => page.locator('[data-wmap-gallery-legend] [role="button"]').nth(1).getAttribute('aria-pressed'),
        expect: (v) => v === 'true',
      }],
      shots: [{ name: 'highlight-bin', callouts: [['[data-wmap-gallery-legend] [role="button"] >> nth=1', { pad: 3 }]] }],
    },
    {
      id: '07-overlays-menu',
      title: 'Overlays: optional layers drawn over every map',
      steps: [
        ['click', '[data-wmap-gallery-legend] [role="button"] >> nth=1'], ['wait', 400],
        ['click', btn('Overlays')], ['wait', 300],
      ],
      checks: [isVisible(menu('Overlays'), 'the Overlays menu is open')],
      shots: [menuShot('overlays-menu', 'Overlays')],
    },
    {
      id: '08-overlays-on',
      title: 'Ring boundaries and quadrant lines on',
      steps: [
        ['click', `${menu('Overlays')} ${row('Ring boundaries')}`], ['wait', 300],
        ['click', `${menu('Overlays')} ${row('Quadrant lines')}`], ['wait', 300],
        ['press', 'Escape'], ['wait', 400], PARK,
      ],
      checks: [{
        name: 'clear-overlays-enabled',
        describe: 'Clear overlays is enabled: something is on',
        get: async (page) => {
          await page.click(btn('Overlays'));
          await page.waitForTimeout(300);
          const disabled = await page.locator(`${menu('Overlays')} ${row('Clear overlays')}`).getAttribute('aria-disabled');
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
          return disabled;
        },
        expect: (v) => v !== 'true',
      }],
      shots: [{ name: 'overlays-on', clip: { target: CARD, nth: 0, pad: 8 } }],
    },
    {
      id: '09-orientation',
      title: 'Orientation: rotate and flip how the wafer is drawn',
      steps: [
        ['click', btn('Overlays')], ['wait', 300], ['click', `${menu('Overlays')} ${row('Clear overlays')}`], ['wait', 300],
        ['press', 'Escape'], ['wait', 300],
        ['click', btn('Orientation')], ['wait', 300],
      ],
      checks: [isVisible(menu('Orientation'), 'the Orientation menu is open')],
      shots: [menuShot('orientation-menu', 'Orientation')],
    },
    {
      id: '10-rotated',
      title: 'Rotated 90°: the notch moves and the XY indicator comes on',
      steps: [['click', `${menu('Orientation')} ${row('Rotate 90° clockwise')}`], ['wait', 600], ['press', 'Escape'], ['wait', 300], PARK],
      shots: [{ name: 'rotated-card', clip: { target: CARD, nth: 0, pad: 8 } }],
    },
    {
      id: '11-legend-style',
      title: 'Legend style: a legend on each map, and where it sits',
      steps: [
        ['click', btn('Orientation')], ['wait', 300], ['click', `${menu('Orientation')} ${row('Reset orientation')}`], ['wait', 400],
        ['press', 'Escape'], ['wait', 300],
        // Reset orientation leaves the XY indicator on, by design; clear it for the shots that follow.
        ['click', btn('Overlays')], ['wait', 300], ['click', `${menu('Overlays')} ${row('Clear overlays')}`], ['wait', 300],
        ['press', 'Escape'], ['wait', 300],
        ['click', btn('Legend style')], ['wait', 300],
      ],
      checks: [isVisible(menu('Legend style'), 'the Legend style menu is open')],
      shots: [menuShot('legend-style-menu', 'Legend style')],
    },
    {
      id: '12-columns',
      title: 'Columns: how many cards share the width',
      steps: [['press', 'Escape'], ['wait', 300], ['click', btn('Columns')], ['wait', 300]],
      checks: [isVisible(menu('Columns'), 'the Columns menu is open')],
      shots: [menuShot('columns-menu', 'Columns')],
    },
    {
      id: '13-card-toolbar',
      title: "Each card's own toolbar",
      steps: [['press', 'Escape'], ['wait', 300], PARK],
      shots: [{
        name: 'card-toolbar',
        clip: { target: `${CARD} >> nth=0 >> [data-wmap-toolbar="single"]`, pad: 36 },
        callouts: [
          [cardBtn('Download PNG'), { badge: 1, pad: 2 }],
          [cardBtn('Zoom (drag to zoom region)'), { badge: 2, pad: 2, through: cardBtn('Reset zoom (double-click)') }],
          [cardBtn('Pan (drag to move)'), { badge: 3, pad: 2 }],
          [cardBtn('Select (drag to select dies)'), { badge: 4, pad: 2 }],
        ],
      }],
    },
    {
      id: '14-zoomed',
      title: 'Zoom in twice on the first wafer',
      steps: [['click', cardBtn('Zoom in')], ['wait', 300], ['click', cardBtn('Zoom in')], ['wait', 500], PARK],
      shots: [{ name: 'zoomed-card', clip: { target: CARD, nth: 0, pad: 8 } }],
    },
    {
      id: '15-die-tooltip',
      title: 'Hover a die for its position, bins and readings',
      steps: [['click', cardBtn('Reset zoom (double-click)')], ['wait', 400], ['hover', `${CARD} >> nth=0 >> canvas`], ['wait', 600]],
      shots: [{ name: 'die-tooltip', clip: { rect: { x: 0, y: 150, width: 640, height: 330 } } }],
    },
    {
      id: '16-wafer-info',
      title: "The ▾ beside a wafer's name shows its details",
      steps: [PARK, ['click', '[aria-label^="Wafer info for W01"]'], ['wait', 500], PARK],
      checks: [{
        name: 'wafer-info-expanded',
        describe: 'the W01 wafer info is expanded',
        get: (page) => page.getAttribute('[aria-label^="Wafer info for W01"]', 'aria-expanded'),
        expect: (v) => v === 'true',
      }],
      shots: [{ name: 'wafer-info', clip: { target: CARD, nth: 0, pad: 8 }, callouts: [['[aria-label^="Wafer info for W01"]', { pad: 3 }]] }],
    },
  ],
};
