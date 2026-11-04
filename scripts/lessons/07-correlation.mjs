/**
 * Lesson 07 — Correlation. Screenshots for docs/learn/07-correlation.md.
 *
 * The Correlation tab on the sample lot: the matrix and the scatter, Max tests, Correlation CSV, a matrix cell
 * driving the scatter, the bin buttons that show or hide dies, the Wafer and Group by choices that make the
 * comparison like for like (the Mixed Split warning), and a box dragged over the scatter. Run by
 * scripts/lesson-shots.mjs.
 */

import { isVisible, hasText } from '../lib/checks.mjs';

const PARK = ['hover', '#toolbar-title'];
const card = (title) => `[data-wmap-chart-card][data-wmap-chart-title*="${title}"]`;
const MATRIX = card('correlation matrix');
const SCATTER = card('Test scatter');
const MENU = '[role="menu"], [role="listbox"]';
const groupBy = 'label:has-text("Group by:") button';
const showScope = 'label:has-text("Show:") button';
const tab = (name) => `button:text-is("${name}")`;
const cardClip = (sel, extra = {}) => ({ target: sel, pad: 8, ...extra });

export const scenario = {
  session: '07',
  title: 'Correlation',
  theme: 'github-light',
  viewport: { width: 1280, height: 820 },
  deviceScaleFactor: 2,
  beats: [
    {
      id: '01-open-correlation',
      title: 'The Correlation tab: a matrix of every pair of tests and a scatter of one pair',
      steps: [
        ['click', 'button:has-text("Load sample data")'], ['waitForWafers'],
        ['click', '[data-wmap-view="insights"]'], ['wait', 1200], ['click', tab('Correlation')], ['wait', 1200], PARK,
      ],
      checks: [isVisible(MATRIX, 'the correlation matrix is showing'), isVisible(SCATTER, 'the test scatter is showing')],
      shots: [{ name: 'correlation-tab', clip: { rect: { x: 0, y: 50, width: 1280, height: 660 } }, callouts: [[tab('Correlation'), { pad: 4 }]] }],
    },
    {
      id: '02-matrix',
      title: 'The matrix: Max tests, the Wafer picker and Correlation CSV',
      steps: [PARK],
      shots: [{
        name: 'matrix',
        clip: cardClip(MATRIX),
        callouts: [
          [`${MATRIX} input[type="number"]`, { badge: 1, pad: 2 }],
          [`${MATRIX} button:has-text("Correlation CSV")`, { badge: 2, pad: 2 }],
        ],
      }],
    },
    {
      id: '03-pick-pair',
      title: 'Click a cell and the scatter shows that pair',
      // The matrix's order follows the lot's data, so a cell is clicked for the gesture and the lesson's pair is then named in X and Y.
      steps: [
        ['drag', `${MATRIX} canvas`, [0.668, 0.506], [0.668, 0.506]], ['wait', 500],
        ['click', `${SCATTER} label:has-text("X:") button`], ['wait', 300], ['click', `${MENU} >> text=vth_p_mV`], ['wait', 800],
        ['click', `${SCATTER} label:has-text("Y:") button`], ['wait', 300], ['click', `${MENU} >> text=idsat_p_uA`], ['wait', 1000], PARK,
      ],
      checks: [hasText(SCATTER, 'idsat_p_uA'), hasText(SCATTER, 'vth_p_mV')],
      shots: [{ name: 'scatter-pair', clip: cardClip(SCATTER) }],
    },
    {
      id: '04-bin-buttons',
      title: 'The bin buttons show or hide the dies of one bin',
      steps: [['click', `${SCATTER} button:has-text("Bin 1")`], ['wait', 700], PARK],
      shots: [{ name: 'scatter-bins', clip: cardClip(SCATTER), callouts: [[`${SCATTER} button:has-text("Bin 1")`, { pad: 2 }]] }],
    },
    {
      id: '05-simpson',
      title: 'The Mixed Split warning: pooled groups can invent a trend',
      steps: [['click', `${SCATTER} button:has-text("Bin 1")`], ['wait', 500], PARK],
      checks: [hasText(MATRIX, 'Mixed')],
      shots: [{ name: 'mixed-warning', clip: cardClip(MATRIX, { maxHeight: 250 }) }],
    },
    {
      id: '06-wafer-picker',
      title: 'The Wafer picker narrows the comparison to one wafer',
      steps: [['click', `${SCATTER} button[aria-label="Wafer"]`], ['wait', 400]],
      checks: [isVisible(MENU, 'the Wafer menu is open')],
      shots: [{ name: 'wafer-picker', clip: cardClip(SCATTER) }],
    },
    {
      id: '07-one-wafer',
      title: 'On one wafer there is nothing mixed to warn about',
      steps: [['click', `${MENU} >> text=W07 · TT`], ['wait', 800], PARK],
      shots: [{ name: 'one-wafer', clip: cardClip(SCATTER) }],
    },
    {
      id: '08a-grouped-fit',
      title: 'With Group by on, the scatter draws a fitted line for each group',
      steps: [
        ['click', `${SCATTER} button[aria-label="Wafer"]`], ['wait', 300], ['click', `${MENU} >> text=All wafers`], ['wait', 500],
        ['click', groupBy], ['wait', 300], ['click', '[role="option"]:has-text("Split")'], ['wait', 1200], PARK,
      ],
      shots: [{ name: 'scatter-fit', clip: cardClip(SCATTER) }],
    },
    {
      id: '08-grouped',
      title: 'With Group by on, Show picks one group: the matrix and scatter use only its dies',
      steps: [
        ['click', showScope], ['wait', 300], ['click', `${MENU} >> text=TT`], ['wait', 1200],
        // The scatter returns to the strongest pair; ask for the lesson's pair again so r can be compared with the pooled figure.
        ['click', `${SCATTER} label:has-text("X:") button`], ['wait', 300], ['click', `${MENU} >> text=vth_p_mV`], ['wait', 800],
        ['click', `${SCATTER} label:has-text("Y:") button`], ['wait', 300], ['click', `${MENU} >> text=idsat_p_uA`], ['wait', 1000], PARK,
      ],
      checks: [hasText(showScope, 'TT'), hasText(SCATTER, 'r = ')],
      shots: [{ name: 'grouped', clip: { rect: { x: 0, y: 50, width: 1280, height: 660 } }, callouts: [[showScope, { pad: 2 }]] }],
    },
    {
      id: '09-max-tests',
      title: 'Max tests limits how many tests the matrix draws',
      steps: [['click', groupBy], ['wait', 300], ['click', '[role="option"]:has-text("None")'], ['wait', 800], ['fillInput', `${MATRIX} input[type="number"]`, '3'], ['press', 'Enter'], ['wait', 900], PARK],
      shots: [{ name: 'max-tests', clip: cardClip(MATRIX), callouts: [[`${MATRIX} input[type="number"]`, { pad: 2 }]] }],
    },
    {
      id: '10-drag-box',
      title: 'Drag a box over the scatter to chart just those dies',
      steps: [['fillInput', `${MATRIX} input[type="number"]`, '20'], ['press', 'Enter'], ['wait', 900], ['drag', `${SCATTER} canvas`, [0.55, 0.35], [0.8, 0.6]], ['wait', 800]],
      checks: [isVisible(MENU, 'a menu of charts and tables has opened on the dies')],
      shots: [{ name: 'drag-box', clip: { rect: { x: 640, y: 130, width: 640, height: 690 } } }],
    },
    {
      id: '11-fails-together',
      title: 'Fails together: the matrix of which tests fail on the same dies',
      steps: [['press', 'Escape'], ['wait', 400], ['click', `${MATRIX} label:has-text("Fails together")`], ['wait', 900], PARK],
      checks: [{ name: 'fails-on', describe: 'Fails together is selected on the matrix', get: (page) => page.locator(`${MATRIX} label:has-text("Fails together")`).first().getAttribute('data-on'), expect: (v) => v === 'true' }],
      shots: [{ name: 'fails-together', clip: cardClip(MATRIX), callouts: [[`${MATRIX} label:has-text("Fails together")`, { pad: 2 }]] }],
    },
    {
      id: '12-log-axes',
      title: 'The scatter has Log X and Log Y, once every value on that axis is positive',
      steps: [['click', `${SCATTER} label:has-text("Log X")`], ['wait', 500], ['click', `${SCATTER} label:has-text("Log Y")`], ['wait', 700], PARK],
      checks: [isVisible(`${SCATTER} label:has-text("Log X")`, 'Log X is showing')],
      shots: [{ name: 'scatter-log', clip: cardClip(SCATTER), callouts: [[`${SCATTER} label:has-text("Log X")`, { badge: 1, pad: 2 }], [`${SCATTER} label:has-text("Log Y")`, { badge: 2, pad: 2 }]] }],
    },
    {
      id: '13-within-groups',
      title: 'With Group by on, the matrix can take each group\'s own mean off first: Within Split',
      steps: [
        ['click', `${SCATTER} label:has-text("Log X")`], ['click', `${SCATTER} label:has-text("Log Y")`],
        ['click', groupBy], ['wait', 300], ['click', '[role="option"]:has-text("Split")'], ['wait', 1200],
        ['click', `${MATRIX} label:has-text("Values")`], ['wait', 600],
        ['click', `${MATRIX} label:has-text("Within")`], ['wait', 900], PARK,
      ],
      checks: [{ name: 'within-on', describe: 'Within is selected on the matrix', get: (page) => page.locator(`${MATRIX} label:has-text("Within")`).first().getAttribute('data-on'), expect: (v) => v === 'true' }],
      shots: [{ name: 'within-groups', clip: cardClip(MATRIX), callouts: [[`${MATRIX} label:has-text("Within")`, { pad: 2 }]] }],
    },
  ],
};
