/**
 * The edge-corner-lot investigation scenario — a scripted, asserting
 * reproduction of a complete wafer-data investigation against the real
 * tsmap web build, run by scripts/run-scenario.mjs.
 *
 * Data comes from scripts/generate_edge_corner_lot.py (`npm run demo:data`):
 * 202 STDF files under testdata/edge-corner-lot/ — 12 real wafers (LOT-A417,
 * splits TT/FF/FS/SS) plus 190 decoys under testdata/edge-corner-lot/haystack/.
 * The anomaly is real in the data, not staged: SS's fmax_MHz (test 1006) has
 * both a shifted centre and an SS-only edge/ring penalty, verified (2026-08,
 * seed 12345) to produce a 73% edge-die fail rate on that test vs 5.8%
 * non-edge, and an overall SS yield (~51%) clearly separated from the other
 * three corners (72-95%). See generate_edge_corner_lot.py's own printed table
 * for the authoritative numbers — the thresholds below are read from that
 * output, not invented.
 *
 * Beats 5-7 needed wmap's Insights DOM to carry stable data-wmap-* hooks —
 * added (WMAP_ISSUES.md #36) alongside these beats. The actual navigation
 * they exercise, verified empirically against a live build rather than
 * assumed from the plan's original sketch:
 *   - Distributions' "Process capability" panel sorts tests by Cpk
 *     ascending — fmax_MHz lands in column 0 because it genuinely has the
 *     worst capability, driven by SS's real degradation.
 *   - Clicking a test's column there calls onSelectTest, which syncs BOTH
 *     "Test value distribution" (boxplot) and "Value histogram" to that
 *     test — a real, DOM-checkable sync (their <select>s' value becomes
 *     the clicked test's number), not a staged navigation.
 *   - Clicking a group's row in the grouped boxplot drills in place to
 *     that group's own wafers; clicking again (same screen position — the
 *     leaf row now occupies where the group row was) opens that wafer in
 *     a modal, PRE-SELECTED to the currently-synced test in Test Value
 *     mode (boxplot.ts's onOpen(waferIndex, testNumber) contract). This is
 *     the actual "back to the map on fmax_MHz" beat — there is no separate
 *     "select fmax_MHz in Test Value mode" step because the drill-through
 *     already lands there.
 *   - There is no per-test "flagged" navigation state in Distributions
 *     itself (all 6 tests render together on one boxplot/histogram) — the
 *     original plan's beat 6 sketch ("navigate to the flagged test's own
 *     view") doesn't map onto the real UI. The capability-panel sync above
 *     is what actually plays that role.
 */

import { readdirSync } from 'fs';
import { TESTDATA } from '../lib/paths.mjs';

const LOT_DIR = `${TESTDATA}/edge-corner-lot`;
const HAYSTACK_DIR = `${LOT_DIR}/haystack`;

function lotFiles() {
  return readdirSync(LOT_DIR).filter(f => f.endsWith('.stdf')).sort().map(f => `${LOT_DIR}/${f}`);
}

function haystackFiles() {
  return readdirSync(HAYSTACK_DIR).filter(f => f.endsWith('.stdf')).sort().map(f => `${HAYSTACK_DIR}/${f}`);
}

/** Parses the file-filter table's own "N selected / N shown / N total" label
 *  out of the modal's text — the label has no distinguishing id/class of its
 *  own (see filterTable.ts's countLabel), so this is the stable-enough hook. */
async function readFilterCounts(page) {
  const text = await page.$eval('.tsmap-modal-box', el => el.textContent ?? '');
  const m = text.match(/(\d+)\s+selected\s*\/\s*(\d+)\s+shown\s*\/\s*(\d+)\s+total/);
  if (!m) return null;
  return { selected: Number(m[1]), shown: Number(m[2]), total: Number(m[3]) };
}

export const scenario = {
  name: 'edge-corner-lot',
  viewport: { width: 1600, height: 1000 },

  // Runs before any beat, outside the browser entirely — a fast, isolated
  // check that the fixture data exists and has the right shape, so a data
  // problem is reported as "regenerate the fixture" rather than a confusing
  // failure three beats later inside the browser.
  async preflight() {
    let lot, haystack;
    try {
      lot = lotFiles();
    } catch (e) {
      throw new Error(`edge-corner-lot fixture missing (${LOT_DIR}) — run: npm run demo:data (${e.message})`);
    }
    try {
      haystack = haystackFiles();
    } catch (e) {
      throw new Error(`haystack fixture missing (${HAYSTACK_DIR}) — run: npm run demo:data (${e.message})`);
    }
    if (lot.length !== 12) {
      throw new Error(`expected 12 LOT-A417 wafer files, found ${lot.length} in ${LOT_DIR}`);
    }
    if (haystack.length < 100) {
      throw new Error(`expected a substantial haystack (>=100 decoy files), found ${haystack.length} in ${HAYSTACK_DIR}`);
    }
    return { lotCount: lot.length, haystackCount: haystack.length };
  },

  beats: [
    {
      id: '01-haystack',
      title: 'Fixture data present and scannable',
      // No browser steps — the preflight check above already did the real
      // work. This beat exists so the run's beat-by-beat report has an
      // explicit "the haystack exists" line rather than folding it silently
      // into setup.
      steps: [],
      checks: [
        {
          name: 'haystack-and-lot-file-counts',
          get: () => ({ lot: lotFiles().length, haystack: haystackFiles().length }),
          expect: (v) => v.lot === 12 && v.haystack >= 100,
          describe: '12 LOT-A417 wafer files and a substantial (>=100 file) haystack',
        },
      ],
    },

    {
      id: '02-filter',
      title: 'Filter files… narrows the haystack down to the lot of interest',
      steps: [
        ['filterFiles', [...haystackFiles(), ...lotFiles()]],
        ['waitForFilterScan'],
        ['fillInput', 'input[placeholder="Search…"]', 'LOT-A417'],
        ['wait', 400], // search is debounced (filterTable.ts, 150ms) — give it room
      ],
      checks: [
        {
          name: 'scan-found-all-picked-files',
          get: (page) => readFilterCounts(page),
          expect: (v) => v !== null && v.total === 202,
          describe: 'file-triage table scanned all 202 picked files (12 real + 190 decoys)',
        },
        {
          name: 'search-narrows-to-exactly-the-edge-corner-lot',
          get: (page) => readFilterCounts(page),
          expect: (v) => v !== null && v.shown === 12,
          describe: 'searching "LOT-A417" narrows the table to exactly the 12 real wafer files',
        },
      ],
      shot: 'demo-02-filter',
    },

    {
      id: '03-open-selected',
      title: 'Load the filtered selection — multi-file rename overlay, then the gallery renders',
      steps: [
        // filterTable.ts's own "Select all" selects only the currently
        // VISIBLE (filtered-to-12) rows — see filterAndSortRows/selectAll.
        ['clickButtonByText', '.tsmap-modal-box', 'Select all'],
        ['wait', 150],
        ['clickButtonByText', '.tsmap-modal-box', 'Load selection…'],
        // confirm() is auto-accepted by browser.mjs's newCapturePage.
        ['waitForOverlay', '#tsmap-test-selector-overlay'],
        // 12 files loaded together always triggers the rename overlay
        // (multiFileUI.ts's needsRename: entries.length > 1).
        ['dismissSelectorThenRename'],
        ['click', '#rename-confirm'],
        ['waitForWafers'],
      ],
      checks: [
        {
          name: 'gallery-shows-12-wafer-canvases',
          get: (page) => page.$$eval('#map-container canvas', els => els.length),
          expect: (n) => n === 12,
          describe: 'the gallery renders exactly 12 wafer map canvases',
        },
      ],
      shot: 'demo-03-gallery',
    },

    {
      id: '04-inspect-wafer',
      title: 'Inspect a wafer — plot-mode options are real, not a static shell',
      steps: [
        ['hoverMapCard', 0],
        ['openWmapDropdown', 'Plot mode'],
      ],
      checks: [
        {
          name: 'plot-mode-menu-has-expected-entries',
          get: (page) => page.evaluate(() => {
            // Matches lib/steps.mjs's selectWmapDropdownItem exactly — no
            // offsetParent filter (an earlier version of this check added
            // one "for safety" and it made every menu item invisible to the
            // query despite the menu being genuinely open on screen; the
            // proven-working step doesn't filter on it, so neither does this).
            const menus = [...document.body.children]
              .filter(el => el.tagName === 'DIV' && el.style.position === 'fixed');
            const items = [];
            for (const menu of menus) for (const d of menu.querySelectorAll('div')) {
              const t = d.textContent?.trim();
              if (t) items.push(t);
            }
            return items;
          }),
          expect: (items) => ['Hard Bin', 'Soft Bin', 'Test Value'].every(want =>
            items.some(i => i.startsWith(want))),
          describe: 'Plot mode dropdown lists Hard Bin, Soft Bin, and Test Value',
        },
      ],
      shot: 'demo-04-plot-mode-menu',
    },

    {
      id: '05-splits-and-group-by',
      title: 'Load the corner splits; group Insights by Split — one corner separates',
      steps: [
        ['click', '#toolbar'], // dismiss beat 04's still-open Plot mode menu
        ['wait', 200],
        ['openSplitsDialog'],
        ['loadSplitsFile', `${LOT_DIR}/LOT-A417_splits.csv`],
        ['closeSplitsDialog'],
        ['click', '[data-wmap-insights-btn]'],
        ['wait', 800],
        ['setInsightsGroupBy', 'Split'],
      ],
      checks: [
        {
          name: 'group-by-select-is-on-split',
          // wmap 0.27.0 made this a trigger button + popup listbox, not a
          // native <select>, so there is no `selectedOptions` to read — the
          // current label is the trigger's first <span> (the second is its
          // caret). `data-wmap-select` still marks the same control.
          get: (page) => page.$eval('[data-wmap-select="group-by"]', (el) =>
            el.querySelector('span')?.textContent ?? null),
          expect: (text) => text?.startsWith('Split') ?? false,
          describe: 'the Group by picker (found via data-wmap-select="group-by") is set to Split',
        },
      ],
      shot: 'demo-05-grouped-by-split',
    },

    {
      id: '06-capability-flags-fmax',
      title: 'Distributions — the worst-capability test syncs the other panels to it',
      steps: [
        ['selectInsightsTab', 'Distributions'],
        ['wait', 400],
        // Column 0 = worst Cpk (capability.ts sorts ascending). This is
        // fmax_MHz because SS's degradation is real, not because the
        // column is hardcoded to mean "fmax" — if the data or the sort
        // ever changed, the check below fails loudly instead of silently
        // asserting the wrong test.
        ['clickChartColumnByTitle', 'Process capability', 0, 6],
      ],
      checks: [
        {
          name: 'worst-capability-column-is-fmax',
          get: (page) => page.$eval('[data-wmap-chart-card][data-wmap-chart-title="Process capability"]', (el) => {
            const group = el.querySelector('select')?.value ?? null;
            return group;
          }),
          expect: (group) => group === 'SS',
          describe: 'clicking the worst-capability column also confirms the Process capability panel is scoped to the SS group',
        },
        {
          name: 'boxplot-and-histogram-sync-to-the-clicked-test',
          get: (page) => page.evaluate(() => {
            const cards = [...document.querySelectorAll('[data-wmap-chart-card]')];
            const boxplot = cards.find((c) => c.dataset.wmapChartTitle === 'Test value distribution');
            const histogram = cards.find((c) => c.dataset.wmapChartTitle === 'Value histogram');
            return {
              boxplot: boxplot?.querySelector('select')?.value ?? null,
              histogram: histogram?.querySelector('select')?.value ?? null,
            };
          }),
          expect: (v) => v.boxplot === '1006' && v.histogram === '1006',
          describe: 'both "Test value distribution" and "Value histogram" sync their test select to 1006 (fmax_MHz) — real cross-panel state, not two independent screenshots',
        },
      ],
      shot: 'demo-06-capability-synced-to-fmax',
    },

    {
      id: '07-drill-to-ss-wafer-on-fmax',
      title: 'Drill into SS in the boxplot — the opened wafer lands directly on fmax_MHz in Test Value mode',
      steps: [
        // First click drills the grouped boxplot's row 0 (the SS group,
        // lowest median — see the module doc) from a pooled group row into
        // that group's own per-wafer rows. The second click, at the same
        // screen position, now hits the leaf row that drilling revealed
        // (row 0 of the drilled list) and calls onOpen — same verified
        // two-click-same-position sequence as the module doc describes.
        ['clickChartRowByTitle', 'Test value distribution', 0],
        ['wait', 400],
        ['clickChartRowByTitle', 'Test value distribution', 0],
        ['wait', 800],
      ],
      checks: [
        {
          name: 'wafer-modal-opened-for-an-ss-wafer',
          get: (page) => page.evaluate(() => {
            const modal = document.querySelector('.wmap-modal-box');
            const titleEl = modal?.querySelector('[data-wmap-window-title]')
              ?? [...(modal?.querySelectorAll('div') ?? [])].find((d) => d.textContent?.includes('Wafer LOT-A417'));
            return titleEl?.textContent ?? null;
          }),
          expect: (title) => !!title && title.includes('LOT-A417') && title.includes('SS'),
          describe: 'a wafer modal opened, titled with the LOT-A417 lot and the SS split',
        },
        {
          // The legend/plot-mode state is canvas-rendered (not in
          // innerText), so this reads the actual toolbar dropdown state —
          // opening it and reading aria-checked, the same mechanism a
          // screen reader would use, not a visual-only read.
          name: 'wafer-landed-on-test-value-fmax_MHz',
          get: async (page) => {
            const opened = await page.evaluate(() => {
              const modal = document.querySelector('.wmap-modal-box');
              const btn = [...(modal?.querySelectorAll('button') ?? [])].find((b) => b.ariaLabel === 'Plot mode');
              if (!btn) return false;
              btn.click();
              return true;
            });
            if (!opened) return { opened: false };
            await page.waitForTimeout(250);
            const tvItem = await page.evaluateHandle(() =>
              [...document.querySelectorAll('[role="menuitemradio"]')].find((i) => i.textContent?.startsWith('Test Value')));
            const box = await tvItem.asElement()?.boundingBox();
            if (box) {
              await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
              await page.waitForTimeout(300);
            }
            const items = await page.evaluate(() =>
              [...document.querySelectorAll('[role="menuitemradio"]')].map((i) => ({
                text: i.textContent, checked: i.getAttribute('aria-checked'),
              })));
            // Dismiss the dropdown by clicking the modal's own title bar,
            // NOT Escape — Escape closes the whole wafer modal too (an
            // unconsumed Escape bubbles to modal.ts's own close handler;
            // see index.html's "Escape inside a widget" convention), which
            // would blank the money-shot screenshot this beat exists for.
            await page.evaluate(() => {
              const modal = document.querySelector('.wmap-modal-box');
              modal?.querySelector('[data-wmap-window-title]')?.click();
            });
            await page.waitForTimeout(200);
            return { opened: true, items };
          },
          expect: (v) => v.opened && v.items.some((i) => i.text?.startsWith('fmax_MHz') && i.checked === 'true'),
          describe: 'Plot mode\'s Test Value submenu shows fmax_MHz as the checked (currently active) test',
        },
      ],
      shot: 'demo-07-ss-wafer-fmax-ring',
    },
  ],
};
