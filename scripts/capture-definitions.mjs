/**
 * Capture definitions for the tsmap user guide screenshots.
 *
 * NOT shared with ../wafermap/scripts/capture-definitions.mjs, and never should
 * be: this file is data, not logic — the list of overlays and UI states to shoot
 * for *this* app. The same-named file over there describes wmap's demo pages.
 * Only their harness (capture-screenshots.mjs) has anything in common.
 *
 * All demo data files live in testdata/ — no generation needed.
 *
 * File → what it's used for:
 *   testdata/small.stdf         3 wafers, 20 PTR tests — general loading / map flow
 *   testdata/medium.stdf        10 wafers, 100 PTR tests — gallery view
 *   testdata/correlated.stdf    5 wafers, 30 correlated PTR tests — charts
 *   testdata/many_tests.stdf    5 wafers, 250 PTR tests — test selector with nothing
 *                               pre-ticked (over the tests×dies auto-select budget; the
 *                               overlay itself appears for every STDF/ATDF, any size)
 *   testdata/small.csv          wide-format CSV — column mapping overlay
 *   testdata/correlated_long.csv  long-format CSV — long-format column mapping
 *
 * Each entry:
 *   file         — output filename in docs/images/ (no extension)
 *   group        — logical group name (for --only <group> filtering)
 *   description  — shown in --list output
 *   selector     — CSS selector to screenshot (omit for full viewport)
 *   viewport     — { width, height } override (default 1280×800)
 *   wait         — extra ms after networkidle, before setup runs
 *   setup        — declarative step array; see capture-screenshots.mjs for reference
 *   screenshotFn — async (page, outFile) => {} for fully custom capture logic
 */

import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { injectFile } from './lib/inject.mjs';
import { waitForSelector, dismissSelector, pinWmapToolbar } from './lib/steps.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../');
// TD() returns an absolute path — the capture runner maps /testdata/<name> on the
// server. testdata/ is gitignored, generated fixtures (`npm run screenshots:data`).
const TD   = (f) => `${ROOT}/testdata/${f}`;
// SD() is the same for sample_data/ — small, git-committed fixtures (Rust parser
// tests also read from here). Used for anything the generic testdata/ suite
// doesn't cover, e.g. the corner-lot wafer-splits demo.
const SD   = (f) => `${ROOT}/sample_data/${f}`;

// ─── Captures ─────────────────────────────────────────────────────────────────

export const CAPTURES = [

  // ── §2 Empty-state toolbar ────────────────────────────────────────────────
  // Replaces the hand-authored toolbar mockup — real empty-state screenshot,
  // no data loaded. (Re-added 2026-07-12: the guide's in-app modal used to
  // strip all images and rely on mockups instead; that constraint is gone now that the guide bundles real image files.)
  {
    file: 'empty-toolbar',
    group: 'ui',
    description: 'Empty-state toolbar — Open files / Filter files / Add files / Recent / theme / help',
    selector: '#toolbar',
  },

  // ── §2 Add files → append-confirm dialog ──────────────────────────────────
  {
    file: 'append-confirm',
    group: 'ui',
    description: 'Append-confirm dialog — die-count mismatch warning (small.stdf + medium.stdf)',
    setup: [
      ['loadFile', TD('small.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
      ['dismissSelector'],
      ['addFiles', TD('medium.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
      ['dismissSelector'],
      ['waitForOverlay', '.tsmap-modal-backdrop'],
    ],
    // The whole modal box, not just the `.tsmap-modal` content block: this
    // dialog was rehomed onto the shared openModal (Aug 2026) and now carries
    // openModal's title bar, which the old `.tsmap-modal` selector would crop
    // out of the guide image.
    selector: '.tsmap-modal-box',
  },

  // ── §2.1 Wafer rename overlay ──────────────────────────────────────────────
  {
    file: 'wafer-rename',
    group: 'ui',
    description: 'Wafer rename overlay — loading small.stdf + medium.stdf together',
    setup: [
      ['loadFiles', [TD('small.stdf'), TD('medium.stdf')]],
      ['dismissSelectorThenRename'],
      ['shrinkPanelToContent'],
    ],
    selector: '.mapping-panel',
  },

  // ── §3 Column mapping overlay ──────────────────────────────────────────────
  {
    file: 'column-mapping',
    group: 'ui',
    description: 'Column mapping overlay — small_long.csv (long-format, 10 columns)',
    setup: [
      ['loadFile', TD('small_long.csv')],
      ['waitForOverlay', '#tsmap-mapping-overlay'],
      ['shrinkPanelToContent'],
    ],
    selector: '.mapping-panel',
  },

  // ── §4 Test selector overlay ────────────────────────────────────────────────
  {
    file: 'test-selector',
    group: 'ui',
    description: 'Test selector overlay — many_tests.stdf (250 tests)',
    setup: [
      ['loadFile', TD('many_tests.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
    ],
    selector: '#tsmap-test-selector-overlay div[role="dialog"]',
  },

  // ── §2 Filter files dialog ────────────────────────────────────────────────
  // Four STDFs so the table has enough rows for the sort/filter affordances
  // (per-column ▾, Columns ▾, the selection count) to read at a glance.
  {
    file: 'file-filter',
    group: 'ui',
    description: 'Filter files dialog — four scanned STDFs with metadata columns',
    // Wide viewport so the full metadata column set fits rather than being
    // sliced mid-header; shrunk vertically so four rows don't sit in a
    // dialog-sized expanse of empty space.
    viewport: { width: 1900, height: 900 },
    setup: [
      ['filterFiles', [TD('small.stdf'), TD('medium.stdf'), TD('correlated.stdf'), TD('many_tests.stdf')]],
      ['waitForFilterScan'],
      ['shrinkModalToContent'],
    ],
    selector: '.tsmap-modal-box',
  },

  // A mixed scan: STDF and ATDF (one family, loadable together) plus a CSV, so
  // the format quick filter appears — opened on the most common kind.
  {
    file: 'file-filter-kinds',
    group: 'ui',
    description: 'Filter files dialog — mixed scan with the file-kind buttons',
    viewport: { width: 1900, height: 900 },
    setup: [
      ['filterFiles', [TD('small.stdf'), TD('medium.atdf'), TD('correlated.stdf'), TD('small.csv')]],
      ['waitForFilterScan'],
      ['shrinkModalToContent'],
    ],
    selector: '.tsmap-modal-box',
  },

  // ── §2 File associations dialog (Help menu, desktop-only) ──────────────────
  // This row (main.ts) is gated on `isTauri`, so it never renders against the
  // plain web `dist/` build the rest of this harness drives — there's no way
  // to reach it by clicking through the app. screenshotFn instead stubs
  // `window.__TAURI_INTERNALS__.invoke` (via page.addInitScript, before the
  // real navigation) so `isTauri` reads true and `platform.getFileAssociationStatus()`
  // /`setFileAssociation()` resolve mock data instead of hitting a real Tauri
  // IPC bridge that doesn't exist in headless Chromium. Every other Tauri-only
  // call the app makes on this path (`get_startup_files`, the drag/CLI event
  // listeners in main.ts's `if (isTauri)` block) is either mocked too or
  // already wrapped in its own `.catch()`, so the rest of startup degrades
  // quietly instead of throwing. Mock data deliberately covers all three row
  // states — associated & matched (stdf), unassociated (atdf), associated but
  // pointing at a stale binary (parquet) — so the guide's screenshot shows the
  // mismatch warning described in the text right next to it, not just the
  // common case.
  {
    file: 'file-associations',
    group: 'ui',
    description: 'File associations dialog (Help menu) — associated/unassociated/stale-path states',
    screenshotFn: async (page, outFile, baseUrl) => {
      await page.addInitScript(() => {
        const statuses = [
          { extension: 'stdf', associated: true, registeredExePath: '/usr/local/bin/tsmap', currentExePath: '/usr/local/bin/tsmap' },
          { extension: 'atdf', associated: false, registeredExePath: null, currentExePath: '/usr/local/bin/tsmap' },
          { extension: 'parquet', associated: true, registeredExePath: '/opt/tsmap-0.1.20/tsmap', currentExePath: '/usr/local/bin/tsmap' },
        ];
        // @ts-ignore — mock of the real Tauri IPC bridge, browser-side only.
        window.__TAURI_INTERNALS__ = {
          invoke: (cmd) => {
            if (cmd === 'get_file_association_status') return Promise.resolve(statuses);
            if (cmd === 'set_file_association') return Promise.resolve();
            if (cmd === 'get_startup_files') return Promise.resolve(null);
            return Promise.reject(new Error(`capture mock: unhandled invoke "${cmd}"`));
          },
          transformCallback: () => 0,
          unregisterCallback: () => {},
          convertFileSrc: (p) => p,
        };
      });
      await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30_000 });

      await page.click('#help-btn');
      await page.waitForTimeout(200);
      const clicked = await page.evaluate(() => {
        const menus = [...document.body.children].filter(el => el.tagName === 'DIV' && el.style.position === 'fixed');
        for (const menu of menus) {
          const btn = [...menu.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith('File associations'));
          if (btn) { btn.click(); return true; }
        }
        return false;
      });
      if (!clicked) throw new Error('"File associations…" row not found in the Help menu — isTauri mock may not have taken effect');

      await page.waitForSelector('.tsmap-modal-box', { timeout: 5_000 });
      await page.waitForSelector('.tsmap-modal-box input[type=checkbox]', { timeout: 5_000 });
      // The dialog's own contentSize sets a fixed 360px min-height regardless
      // of how much the three mock rows actually need — shrink it the same
      // way file-filter/column-mapping do, so the guide image isn't mostly
      // empty grey below the content.
      await page.evaluate(() => {
        const box = document.querySelector('.tsmap-modal-box');
        if (box) { box.style.height = 'auto'; box.style.maxHeight = 'none'; }
      });
      await page.waitForTimeout(100);

      const el = await page.$('.tsmap-modal-box');
      if (!el) throw new Error('file-associations modal box not found');
      await el.screenshot({ path: outFile });
    },
  },

  // ── §9 Log panel ─────────────────────────────────────────────────────────────
  {
    file: 'log-panel',
    group: 'ui',
    description: 'Log panel expanded, after a normal load',
    setup: [
      ['loadFile', TD('small.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
      ['dismissSelector'],
      ['expandLogPanel'],
    ],
    selector: '#log-bar',
  },

  // ── §5.1 Single wafer map — hard bin, summary panel open ─────────────────
  // Use correlated.stdf (W01..W05 IDs don't trigger rename overlay)
  {
    file: 'wafer-map-single',
    group: 'maps',
    description: 'Single-wafer map — hard bin, summary panel open',
    screenshotFn: async (page, outFile, baseUrl) => {
      await injectFile(page, TD('correlated.stdf'), baseUrl);
      await waitForSelector(page, '#tsmap-test-selector-overlay');
      await page.waitForTimeout(400);
      // Historical behaviour, preserved exactly: this click "Select none" is
      // superseded a moment later by dismissSelector's own "Select all" —
      // net effect is all tests selected + imported, same as every other
      // capture in this file. Kept as-is rather than "fixed" so this image
      // doesn't change; see M1 harness-extraction notes.
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('#tsmap-test-selector-overlay button')];
        btns.find(b => b.textContent?.trim() === 'Select none')?.click();
      });
      await page.waitForTimeout(200);
      await dismissSelector(page);
      // Open the summary panel
      await page.evaluate(() => {
        const root = document.querySelector('#map-container') ?? document;
        const btn = [...root.querySelectorAll('button')].find(b => b.ariaLabel === 'Summary panel');
        if (btn && !btn.dataset.active) btn.click();
      });
      await page.waitForTimeout(600);
      await pinWmapToolbar(page);
      await page.screenshot({ path: outFile, fullPage: false });
    },
  },

  // ── §5.2 Toolbar: plot mode dropdown open ─────────────────────────────────
  {
    file: 'wafer-map-toolbar',
    group: 'maps',
    description: 'Map toolbar with Plot mode dropdown open — Hard Bin highlighted',
    setup: [
      ['loadFile', TD('correlated.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
      ['dismissSelectorSelectNone'],
      ['hoverMapCard', 0],
      ['openWmapDropdown', 'Plot mode', 'Hard Bin'],
    ],
  },

  // ── §5.2 Soft Bin map ─────────────────────────────────────────────────────
  {
    file: 'wafer-map-softbin',
    group: 'maps',
    description: 'Map in Soft Bin mode — correlated.stdf gallery',
    setup: [
      ['loadFile', TD('correlated.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
      ['dismissSelectorSelectNone'],
      ['hoverMapCard', 0],
      ['selectWmapMode', 'Soft Bin'],
      ['wait', 600],
      ['hoverMapCard', 0],
    ],
  },

  // ── §5.2 Test value heatmap ────────────────────────────────────────────────
  {
    file: 'wafer-map-testvalue',
    group: 'maps',
    description: 'Map in Test Value mode — correlated.stdf gallery, parametric heatmap',
    setup: [
      ['loadFile', TD('correlated.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
      ['dismissSelector'],
      ['hoverMapCard', 0],
      ['selectWmapMode', 'Test Value'],
      ['wait', 600],
      ['hoverMapCard', 0],
    ],
  },

  // ── §5.4 Gallery (medium lot) ─────────────────────────────────────────────
  {
    file: 'gallery',
    group: 'maps',
    description: 'Multi-wafer gallery — medium.stdf, 10 wafers, first card hovered',
    setup: [
      ['loadFile', TD('medium.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
      ['dismissSelectorSelectNone'],
      ['wait', 600],
      ['hoverMapCard', 0],
    ],
  },

  // ── §7 Insights — Overview sub-tab (yield + bin pareto + ring/quadrant) ───
  // wmap's own Insights tab replaced tsmap's former bespoke Charts view —
  // Overview/Distributions/Correlation sub-tabs, opened via
  // the map/gallery's "Insights" button rather than a tsmap #charts-btn.
  {
    file: 'charts-overview',
    group: 'charts',
    description: 'Insights tab, Overview sub-tab — correlated.stdf',
    // The Insights tab is auto-height inside #map-container's own
    // overflow-y:auto wrapper, not the document — use a fixed viewport tall
    // enough to fit the Overview sub-tab without scrolling (found
    // empirically: a taller wafer count needs more — see the splits-group
    // definitions below, which use 2300 for a 13-wafer lot).
    viewport: { width: 1600, height: 2000 },
    setup: [
      ['loadFile', TD('correlated.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
      ['dismissSelector'],
      ['openInsights'],
      ['scroll', 0, 0],
    ],
  },

  // ── §7.1 Yield by wafer — expand modal ───────────────────────────────────
  {
    file: 'chart-yield',
    group: 'charts',
    description: 'Yield by wafer — expanded modal, correlated.stdf',
    selector: '.wmap-modal-box',
    setup: [
      ['loadFile', TD('correlated.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
      ['dismissSelector'],
      ['openInsights'],
      ['expandChartByTitle', 'Yield by wafer'],
    ],
  },

  // ── §7.2 Bin pareto — expand modal ───────────────────────────────────────
  {
    file: 'chart-pareto',
    group: 'charts',
    description: 'Bin pareto — expanded modal, correlated.stdf',
    selector: '.wmap-modal-box',
    setup: [
      ['loadFile', TD('correlated.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
      ['dismissSelector'],
      ['openInsights'],
      ['expandChartByTitle', 'Hard bin pareto'],
    ],
  },

  // ── §7.3 Boxplot — expand modal ──────────────────────────────────────────
  {
    file: 'boxplot',
    group: 'charts',
    description: 'Test value distribution boxplot — expanded modal, correlated.stdf',
    selector: '.wmap-modal-box',
    setup: [
      ['loadFile', TD('correlated.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
      ['dismissSelector'],
      ['openInsights'],
      ['selectInsightsTab', 'Distributions'],
      ['expandChartByTitle', 'Test value distribution'],
    ],
  },

  // ── §7.4 Histogram — expand modal ────────────────────────────────────────
  {
    file: 'histogram',
    group: 'charts',
    description: 'Value histogram — expanded modal, correlated.stdf',
    selector: '.wmap-modal-box',
    setup: [
      ['loadFile', TD('correlated.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
      ['dismissSelector'],
      ['openInsights'],
      ['selectInsightsTab', 'Distributions'],
      ['expandChartByTitle', 'Value histogram'],
    ],
  },

  // ── §7.5 Correlation matrix — expand modal ───────────────────────────────
  {
    file: 'correlation',
    group: 'charts',
    description: 'Test correlation matrix — expanded modal, correlated.stdf',
    selector: '.wmap-modal-box',
    setup: [
      ['loadFile', TD('correlated.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
      ['dismissSelector'],
      ['openInsights'],
      ['selectInsightsTab', 'Correlation'],
      ['expandChartByTitle', 'Test correlation matrix'],
    ],
  },

  // ── §7.6 Scatter — expand modal ──────────────────────────────────────────
  {
    file: 'scatter',
    group: 'charts',
    description: 'Scatter plot — expanded modal, correlated.stdf',
    selector: '.wmap-modal-box',
    setup: [
      ['loadFile', TD('correlated.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
      ['dismissSelector'],
      ['openInsights'],
      ['selectInsightsTab', 'Correlation'],
      ['expandChartByTitle', 'Test scatter'],
    ],
  },

  // ── §6 Wafer splits ────────────────────────────────────────────────────────
  // Uses sample_data/PVT-LOT-05.stdf (a 13-wafer PVT corner lot generated by
  // scripts/generate_stdf_corner_lot.py) + its companion _splits.csv — the
  // testdata/ suite has no split-relevant fixture, and this one is small and
  // git-committed already (see SD() above).

  {
    file: 'splits-modal',
    group: 'splits',
    description: 'Splits dialog just opened — no assignments yet',
    viewport: { width: 1600, height: 1000 },
    selector: 'div[role="dialog"]',
    setup: [
      ['loadFile', SD('PVT-LOT-05.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
      ['dismissSelector'],
      ['openSplitsDialog'],
    ],
  },

  {
    file: 'splits-modal-loaded',
    group: 'splits',
    description: 'Splits dialog after loading PVT-LOT-05_splits.csv — TT/FF/SS/FS/SF assigned',
    viewport: { width: 1600, height: 1000 },
    selector: 'div[role="dialog"]',
    setup: [
      ['loadFile', SD('PVT-LOT-05.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
      ['dismissSelector'],
      ['openSplitsDialog'],
      ['loadSplitsFile', SD('PVT-LOT-05_splits.csv')],
    ],
  },

  {
    file: 'gallery-splits',
    group: 'splits',
    description: 'Gallery with split suffixes shown on every card (" · TT" etc.)',
    viewport: { width: 1600, height: 1300 },
    setup: [
      ['loadFile', SD('PVT-LOT-05.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
      ['dismissSelector'],
      ['openSplitsDialog'],
      ['loadSplitsFile', SD('PVT-LOT-05_splits.csv')],
      ['closeSplitsDialog'],
      ['wait', 500],
    ],
  },

  {
    file: 'charts-grouped-by-split',
    group: 'splits',
    description: 'Insights Overview grouped by Split — yield + bin pareto, TT/FF/SS/FS/SF corners',
    viewport: { width: 1600, height: 2300 },
    setup: [
      ['loadFile', SD('PVT-LOT-05.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
      ['dismissSelector'],
      ['openSplitsDialog'],
      ['loadSplitsFile', SD('PVT-LOT-05_splits.csv')],
      ['closeSplitsDialog'],
      ['openInsights'],
      ['setInsightsGroupBy', 'Split'],
      ['scroll', 0, 0],
    ],
  },

  {
    file: 'yield-group-drilldown',
    group: 'splits',
    description: 'Yield panel drilled into a single Split — per-wafer bars + ← Back',
    viewport: { width: 1600, height: 1000 },
    setup: [
      ['loadFile', SD('PVT-LOT-05.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
      ['dismissSelector'],
      ['openSplitsDialog'],
      ['loadSplitsFile', SD('PVT-LOT-05_splits.csv')],
      ['closeSplitsDialog'],
      ['openInsights'],
      ['setInsightsGroupBy', 'Split'],
      ['clickChartRowByTitle', 'Yield by Split', 0],
    ],
  },

  // ── Tutorial: "Analyse your first wafer lot" ──────────────────────────────
  // The tutorial walks the SAME corner lot the in-app "Load sample data"
  // button loads (platform.ts fetches a gzipped copy of PVT-LOT-05 and seeds
  // its splits), so these reuse the splits fixtures above rather than adding
  // new data. Two shots only: the tutorial's other checkpoints are already
  // covered by `gallery-splits` and `charts-grouped-by-split`, and a second
  // near-identical image of each would just be another thing to keep in step.
  //
  // Deliberately NOT reusing `test-selector` for the tutorial's import step:
  // that one shoots many_tests.stdf (250 tests, nothing pre-ticked) while the
  // tutorial's lot has 7 tests and arrives fully ticked — the whole point of
  // that paragraph. Showing the 250-test overlay there would contradict the
  // text it illustrates.

  {
    file: 'tutorial-test-selector',
    group: 'tutorial',
    description: 'Test selector for the sample corner lot — 7 tests, all pre-ticked',
    viewport: { width: 1280, height: 800 },
    selector: '#tsmap-test-selector-overlay div[role="dialog"]',
    setup: [
      ['loadFile', SD('PVT-LOT-05.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
      ['wait', 400],
    ],
  },

  {
    file: 'tutorial-yield-sorted',
    group: 'tutorial',
    description: 'Lot gallery with the Wafer Yield list sorted by yield — worst wafers first',
    viewport: { width: 1440, height: 900 },
    setup: [
      ['loadFile', SD('PVT-LOT-05.stdf')],
      ['waitForOverlay', '#tsmap-test-selector-overlay'],
      ['dismissSelector'],
      ['openSplitsDialog'],
      ['loadSplitsFile', SD('PVT-LOT-05_splits.csv')],
      ['closeSplitsDialog'],
      ['wait', 600],
      // The Slot/Yield toggle is wmap's makeSegmented: a role="radiogroup" of
      // <label>-wrapped radios with a RANDOM `name`, no class and no id. The
      // radio `value` is the only stable handle, and the group is identified by
      // the sibling option it contains rather than by position among the
      // panel's other segmented controls. The label is clicked, not the input —
      // the input is opacity:0/0×0 and not actionable.
      ['click', '[role="radiogroup"]:has(input[value="slot"]) label:has(input[value="yield"])'],
      ['wait', 500],
    ],
  },

];
