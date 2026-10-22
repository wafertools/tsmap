/**
 * Session 01 — Getting data in. Screenshots for docs/training/01-getting-data-in.md.
 *
 * One continuous run through the ways data reaches tsmap: the start screen and
 * the Open files menu, a folder scan narrowed in the file filter, a lot built
 * from one file per wafer and then extended with Add files, the test selector
 * (with a rename) on the sample lot, column mapping for a wide and a long CSV
 * (with a saved mapping in between), the colour theme and the log panel.
 * Uses only committed synthetic samples: sample_data/ and docs/samples/.
 * Run by scripts/training-shots.mjs.
 */

import { isVisible, hasText } from '../lib/checks.mjs';
import { SAMPLEDATA, DOCSAMPLES } from '../lib/paths.mjs';

const S = (f) => `${SAMPLEDATA}/${f}`;
const SCAN = [
  'EDGE-LOT-01_W01.stdf', 'EDGE-LOT-01_W02.stdf',
  'HY-LOT-04_W01.stdf', 'HY-LOT-04_W02.stdf', 'PARAM-LOT-02_W01.stdf', 'CLUST-LOT-03_W01.stdf',
].map(S);
const WIDE_CSV = `${DOCSAMPLES}/tsmap-sample.csv`;
const LONG_CSV = S('TESTNUM-LONG-01.csv');

const MODAL = '.tsmap-modal-box';
const SELECTOR = '#tsmap-test-selector-overlay [role="dialog"]';
const cardCount = (n) => ({
  name: `cards-${n}`,
  describe: `the gallery shows ${n} wafer cards`,
  get: (page) => page.locator('.wmap-gallery-card').count(),
  expect: (c) => c === n,
});

export const scenario = {
  session: '01',
  title: 'Getting data in',
  theme: 'github-light',
  viewport: { width: 1280, height: 820 },
  deviceScaleFactor: 2,
  beats: [
    {
      id: '01-start-screen',
      title: 'The start screen offers sample data, a folder scan and drag and drop',
      checks: [hasText('#map-container', 'Supports STDF, ATDF, CSV, JSON and Parquet')],
      shots: [
        { name: 'load-sample', callouts: [['button:has-text("Load sample data")', {}]] },
        {
          name: 'drop-anywhere',
          callouts: [['#drop-hint', { badge: 1, badgeAt: 'bl' }], ['text=or drag files anywhere in this window', { badge: 2 }]],
        },
      ],
    },
    {
      id: '02-open-menu',
      title: 'The ▾ beside Open files: Choose files… or Scan a folder…',
      steps: [['click', '#open-more-btn'], ['wait', 300]],
      checks: [isVisible('text="Choose files…"', 'the menu offers Choose files…')],
      shots: [
        {
          name: 'open-menu',
          clip: { rect: { x: 0, y: 0, width: 560, height: 200 } },
          callouts: [['#open-more-btn', { pad: 3 }]],
        },
      ],
    },
    {
      id: '03-scan-folder',
      title: 'Scan a folder of six files: one row per file, a column per field',
      steps: [['press', 'Escape'], ['filterFiles', SCAN], ['waitForFilterScan']],
      checks: [hasText(MODAL, '0 selected / 6 shown / 6 total')],
      shots: [
        {
          name: 'file-filter',
          clip: { target: MODAL, pad: 8 },
          callouts: [
            [`${MODAL} input[placeholder="Search…"]`, { badge: 1 }],
            ['[aria-label="Filter by Lot"]', { badge: 2, pad: 3 }],
            [`${MODAL} button:has-text("Load selected…")`, { badge: 3, badgeAt: 'tr' }],
          ],
        },
      ],
    },
    {
      id: '04-filter-and-select',
      title: 'Search narrows the table; Select all ticks what is shown',
      steps: [
        ['fillInput', `${MODAL} input[placeholder="Search…"]`, 'EDGE'],
        ['wait', 400],
        ['clickButtonByText', MODAL, 'Select all'],
        ['wait', 300],
      ],
      checks: [hasText(MODAL, '2 selected / 2 shown / 6 total')],
      shots: [
        {
          name: 'file-filter-selected',
          clip: { target: MODAL, pad: 8 },
          callouts: [[`${MODAL} button:has-text("Load selected…")`, { pad: 3 }]],
        },
      ],
    },
    {
      id: '05-load-selected',
      title: 'Load selected… loads the two files as one lot',
      steps: [
        ['clickButtonByText', MODAL, 'Load selected…'],
        ['waitForOverlay', '#tsmap-rename-overlay'],
        ['click', '#rename-confirm'],
        ['waitForWafers'],
        ['hover', '#toolbar-title'],
      ],
      checks: [cardCount(2), hasText('[data-wmap-gallery-meta]', 'EDGE-LOT-01')],
      shots: [{ name: 'scanned-lot' }],
    },
    {
      id: '06-add-files',
      title: 'Add files appends another wafer, after a confirmation',
      steps: [['addFiles', S('EDGE-LOT-01_W03.stdf')], ['waitForOverlay', MODAL]],
      checks: [hasText(MODAL, 'Add 1 wafer to gallery'), hasText(MODAL, 'No structural mismatches detected')],
      shots: [
        {
          name: 'add-confirm',
          clip: { target: MODAL, pad: 8 },
          callouts: [[`${MODAL} button:has-text("Add to gallery")`, { pad: 3 }]],
        },
      ],
    },
    {
      id: '07-merged-lot',
      title: 'The wafer from the third file joins the same lot',
      steps: [
        ['clickButtonByText', MODAL, 'Add to gallery'],
        ['wait', 1500],
        ['waitForWafers'],
        // Three columns, so the whole lot is in the picture (Auto picks two at this size).
        ['selectWmapMenuItem', 'Columns', '3 columns'],
        ['wait', 600],
        ['hover', '#toolbar-title'],
      ],
      checks: [cardCount(3)],
      shots: [{ name: 'merged-lot', callouts: [['.wmap-gallery-card', { nth: 2 }]] }],
    },
    {
      id: '08-test-selector',
      title: 'Setup ▾ → Tests… opens the test selector on the sample lot',
      steps: [
        ['selectWmapMenuItem', 'Columns', 'Auto'],
        ['click', '#reset-btn'],
        ['wait', 500],
        ['click', 'button:has-text("Load sample data")'],
        ['waitForWafers'],
        ['openTestsDialog'],
      ],
      checks: [hasText(SELECTOR, '7 found'), hasText(SELECTOR, '7 of 7 tests selected')],
      shots: [
        {
          name: 'test-selector',
          clip: { target: SELECTOR, pad: 8 },
          callouts: [
            [`${SELECTOR} input[type="search"]`, { badge: 1 }],
            [`${SELECTOR} [role="group"][aria-label="Test type"]`, { badge: 2, badgeAt: 'tr' }],
            [`${SELECTOR} input[aria-label^="Select a range"]`, { badge: 3 }],
            [`${SELECTOR} button:has-text("Save definitions")`, { badge: 4, badgeAt: 'bl' }],
            [`${SELECTOR} button:has-text("Load definitions")`, { badge: 5, badgeAt: 'br' }],
          ],
        },
      ],
    },
    {
      id: '09-rename-test',
      title: 'Click into a test name to rename it',
      steps: [
        ['fillInput', `${SELECTOR} input[aria-label^="Display name for test 1006"]`, 'Max frequency'],
        ['press', 'Enter'],
      ],
      checks: [{
        name: 'renamed',
        describe: 'test 1006 now reads "Max frequency"',
        get: (page) => page.inputValue(`${SELECTOR} input[aria-label^="Display name for test 1006"]`),
        expect: (v) => v === 'Max frequency',
      }],
      shots: [
        {
          name: 'test-rename',
          clip: { target: SELECTOR, pad: 8 },
          callouts: [[`${SELECTOR} input[aria-label^="Display name for test 1006"]`, { pad: 3 }]],
        },
      ],
    },
    {
      id: '10-mapping-wide',
      title: 'A CSV opens the column mapping: one column per test (wide format)',
      steps: [
        ['click', `${SELECTOR} button.btn-primary`],
        ['wait', 1000],
        ['loadFile', WIDE_CSV],
        ['waitForOverlay', '.mapping-panel'],
      ],
      checks: [hasText('.mapping-panel', '25 columns'), isVisible('#map-render', 'the Continue button is showing')],
      shots: [
        {
          name: 'mapping-wide',
          callouts: [
            ['.mapping-table tbody tr:has-text("test_000")', { badge: 1, pad: 2 }],
            ['.pass-bin-group', { badge: 2, pad: 3, badgeAt: 'tr' }],
            ['#map-render', { badge: 3, pad: 3, badgeAt: 'tr' }],
          ],
        },
        {
          name: 'mapping-pass-bins',
          clip: { target: '.mapping-footer', pad: 0, maxWidth: 760 },
          callouts: [['.pass-bin-group', { pad: 3 }]],
        },
        {
          name: 'mapping-bulk',
          clip: { rect: { x: 0, y: 0, width: 1280, height: 200 } },
          callouts: [
            ['#map-filter', { badge: 1, pad: 3 }],
            ['#map-bulk-test', { badge: 2, pad: 3, badgeAt: 'tr' }],
            ['#map-bulk-ignore', { badge: 3, pad: 3, badgeAt: 'tr' }],
          ],
        },
      ],
    },
    {
      id: '11-mapping-confirmed',
      title: 'Change one role, then Continue: the mapping is remembered for these columns',
      steps: [
        ['selectOption', '.mapping-table tbody tr:has-text("test_019") select', '— ignore —'],
        ['click', '#map-render'],
        ['waitForWafers'],
        ['hover', '#toolbar-title'],
      ],
      checks: [cardCount(3)],
    },
    {
      id: '12-mapping-saved',
      title: 'The same columns again: the saved mapping is applied',
      steps: [['loadFile', WIDE_CSV], ['waitForOverlay', '.mapping-panel']],
      checks: [hasText('.mapping-panel', 'Using the mapping you saved for these columns.')],
      shots: [
        {
          name: 'mapping-saved',
          clip: { rect: { x: 0, y: 0, width: 1280, height: 150 } },
          callouts: [['text=Using the mapping you saved for these columns.', { badge: 1, pad: 3, badgeAt: 'br' }], ['#map-redetect', { badge: 2, pad: 3, badgeAt: 'bl' }]],
        },
      ],
    },
    {
      id: '13-mapping-long',
      title: 'A long-format CSV: one row per die per test',
      steps: [['click', '#map-cancel'], ['wait', 500], ['loadFile', LONG_CSV], ['waitForOverlay', '.mapping-panel']],
      checks: [{
        name: 'long-roles',
        describe: 'test_num and test_val are detected as the long-format test number and result',
        get: (page) => page.evaluate(() => [...document.querySelectorAll('.mapping-table tbody tr')]
          .filter((tr) => /^test_(num|val)/.test(tr.textContent?.trim() ?? ''))
          .map((tr) => tr.querySelector('select')?.selectedOptions[0]?.textContent ?? '')),
        expect: (roles) => roles.length === 2 && roles[0] === 'Test number (long format)' && roles[1] === 'Test result (long format)',
      }],
      shots: [
        {
          name: 'mapping-long',
          clip: { rect: { x: 0, y: 0, width: 1280, height: 420 } },
          callouts: [
            ['.mapping-table tbody tr:has-text("test_num")', { badge: 1, pad: 2 }],
            ['.mapping-table tbody tr:has-text("test_val")', { badge: 2, pad: 2, badgeAt: 'bl' }],
          ],
        },
      ],
    },
    {
      id: '14-theme-menu',
      title: 'The colour theme picker',
      steps: [['click', '#map-cancel'], ['wait', 500], ['click', '#theme-select'], ['wait', 300]],
      checks: [isVisible('[role="listbox"][aria-label="Colour theme"]', 'the theme list is open')],
      shots: [
        {
          name: 'theme-menu',
          clip: { rect: { x: 900, y: 0, width: 380, height: 720 } },
          callouts: [['#theme-select', { pad: 3, badgeAt: 'tl' }]],
        },
      ],
    },
    {
      id: '15-theme-dark',
      title: 'Dark applies to the whole app, maps and charts included',
      steps: [['click', '[role="option"]:text-is("Dark")'], ['wait', 600], ['hover', '#toolbar-title']],
      checks: [hasText('#theme-select', 'Dark')],
      shots: [{ name: 'theme-dark' }],
    },
    {
      id: '16-log-panel',
      title: 'The log panel lists what each load did',
      steps: [
        ['click', '#theme-select'],
        ['wait', 300],
        ['click', '[role="option"]:text-is("GitHub Light")'],
        ['wait', 400],
        ['click', '#log-toggle'],
        ['wait', 500],
      ],
      checks: [isVisible('#log-panel', 'the log panel is open'), hasText('#log-list', 'tsmap-sample.csv')],
      shots: [{ name: 'log-panel', callouts: [['#log-panel', { badgeAt: 'tr' }]] }],
    },
  ],
};
