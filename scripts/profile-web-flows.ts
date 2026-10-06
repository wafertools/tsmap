// The flows `profile-web.mjs` times, run inside the real app page with the real
// modules — tsmap's web platform (worker parse, transfer, decode) and wmap's
// build, analysis and renderers, called with the options tsmap itself passes.
// Served by Vite from the dev server `profile-web.mjs` starts; not part of the
// app bundle.
//
// Flows run in order and each builds on the last (`analyse` needs `parse`'s
// lot, `gallery` needs `analyse`'s maps). Keep the options here in step with
// `main.ts`'s `renderWaferView` (and `profile-analyse.ts`'s with
// `buildLotStatsSummary`), or the profile describes something the app does not do.
import { createPlatform } from '../src/platform';
import type { RustParsedFile } from '../src/platform';
import type { CsvMapping } from '../src/mappingUI';
import { renderWaferGallery, renderWaferMap } from '@wafertools/wafermap/render';
import type { LotStatsSummary } from '@wafertools/wafermap/stats';
import { buildAndAnalyse } from './profile-analyse';
import type { ProfileItem } from './profile-analyse';

const state: {
  name?: string;
  bytes?: Uint8Array;
  parsed?: RustParsedFile;
  items?: ProfileItem[];
  lot?: LotStatsSummary;
  container?: HTMLElement;
  gallery?: ReturnType<typeof renderWaferGallery>;
  gallerySettled?: Promise<void>;
  map?: ReturnType<typeof renderWaferMap>;
} = {};

const need = <T>(v: T | undefined, what: string): T => {
  if (v === undefined) throw new Error(`profile flow needs ${what} — run the earlier flows first`);
  return v;
};

/** Two frames: the one the change is drawn in, and the one after it is painted. */
const painted = () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/**
 * Waits until `root` has had no DOM change and the page no long task for
 * `quietMs`, and returns when the last one ended. Insights draws after the
 * flow's own call returns (a lazily loaded chunk, then charts drawn from
 * ResizeObserver and animation-frame callbacks), so "the promise resolved" is
 * not "the view is drawn". A chart drawn in under 50 ms without touching the
 * DOM is not seen, so the figure is a slight underestimate, never an overestimate.
 */
async function settled(root: HTMLElement, quietMs = 400): Promise<number> {
  let last = performance.now();
  const mo = new MutationObserver(() => { last = performance.now(); });
  mo.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
  const lt = new PerformanceObserver(l => {
    for (const e of l.getEntries()) last = Math.max(last, e.startTime + e.duration);
  });
  // WebKit reports no long tasks; there, DOM changes alone mark activity.
  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) lt.observe({ type: 'longtask' });
  try {
    while (performance.now() - last < quietMs) {
      await painted();
      await new Promise(r => setTimeout(r, 50));
    }
  } finally {
    mo.disconnect();
    lt.disconnect();
  }
  return last;
}

function click(selector: string): void {
  const el = need(state.container, 'a mounted view').querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`profile flow: nothing matches ${selector}`);
  el.click();
}

/** Opens an Insights view by its tab and waits for it to be drawn. */
async function insightsView(view: string): Promise<{ endedAt: number }> {
  click(`[data-wmap-insights-tab="${view}"]`);
  return { endedAt: await settled(state.container!) };
}

function container(): HTMLElement {
  state.container?.remove();
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;overflow:auto;z-index:99999;background:var(--bg, #fff)';
  document.body.appendChild(el);
  return (state.container = el);
}

const firstTest = () => Number(Object.keys(need(state.parsed, 'parse').testDefs)[0]);
const insights = { enabled: true };

/** Untimed setup: fetch the fixture, so `parse` times parsing only. */
export async function prepare(url: string, name = 'fixture.stdf'): Promise<void> {
  state.bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  state.name = name;
}

/**
 * The mapping for the wide-format CSV fixtures (`sweep-*.csv`): wafer, lot,
 * x, y, hbin, sbin, site, then one column per test named `t<testNumber>`.
 */
function sweepMapping(bytes: Uint8Array): CsvMapping {
  const header = new TextDecoder().decode(bytes.subarray(0, bytes.indexOf(10))).trim().split(',');
  const tests = header.filter(h => /^t\d+$/.test(h)).map(h => ({ col: h, testNumber: Number(h.slice(1)), name: h }));
  return {
    x: 'x', y: 'y', hbin: 'hbin', sbin: 'sbin', wafer: 'wafer', lot: 'lot', site: 'site', tests, meta: [], splitBy: [],
    testnameCol: null, testnumberCol: null, testvalueCol: null, loLimitCol: null, hiLimitCol: null,
    loSpecCol: null, hiSpecCol: null, unitsCol: null, passBins: [1],
  };
}

/** Flows run only when asked for by name (`--flows`, or `--until` for WebKit). */
export const OPTIONAL_FLOWS = ['analyse-values'];

export const flows: Record<string, () => Promise<void | { endedAt: number }>> = {
  /** Worker parse, buffer transfer, main-thread decode. STDF, ATDF or a `sweep-*.csv`, by extension. */
  async parse() {
    const bytes = need(state.bytes, 'prepare');
    const platform = createPlatform();
    const name = state.name ?? 'fixture.stdf';
    state.parsed = name.endsWith('.csv') ? await platform.parseCsv({ name, bytes }, sweepMapping(bytes))
      : name.endsWith('.atdf') ? await platform.parseAtdf({ name, bytes })
      : await platform.parseStdf({ name, bytes });
    state.bytes = undefined;
  },

  /** `buildWaferMap` + `analyzeWaferMap` per wafer, then `analyzeWaferLot` — tsmap's load-time pass. */
  async analyse() {
    ({ items: state.items, lot: state.lot } = buildAndAnalyse(need(state.parsed, 'parse')));
  },

  /**
   * The load-time pass with test-value analysis on — what tsmap runs when the
   * user asks for value findings. Opt-in (see `OPTIONAL_FLOWS`): on a large lot
   * it is much the longest flow. Leaves the other flows' state alone.
   */
  async 'analyse-values'() {
    buildAndAnalyse(need(state.parsed, 'parse'), undefined, { enableTestValueAnalysis: true });
  },

  /**
   * Progressive gallery mount with the lot summary panel, until every card is
   * in — the app's "Rendering N wafers" phase. `gallery-summary` then waits
   * for the rest.
   */
  async gallery() {
    const items = need(state.items, 'analyse');
    state.map?.destroy();
    state.map = undefined;
    let cardsIn!: () => void;
    const allCards = new Promise<void>(r => { cardsIn = r; });
    state.gallerySettled = new Promise<void>(settle => {
      state.gallery = renderWaferGallery(container(), items.map(it => () => it), {
        lotStatsSummary: state.lot,
        onItemResolved: (resolved, total) => { if (resolved === total) cardsIn(); },
        onItemsResolved: () => { cardsIn(); settle(); },
        summaryPanel: { placement: 'right', defaultOpen: true },
        showHelpButton: false,
        viewOptions: { plotMode: 'hardBin' },
        insights,
      });
    });
    await allCards;
  },

  /** The lot summary panel finishing after the last card — the app's "Finishing lot summary" phase. */
  async 'gallery-summary'() {
    await need(state.gallerySettled, 'gallery');
    await painted();
  },

  /**
   * The lot Summary panel's "Summary report" button: building the report and
   * opening its window (the click itself, which runs synchronously).
   */
  async report() {
    await need(state.gallerySettled, 'gallery');
    const button = [...need(state.container, 'gallery').querySelectorAll<HTMLButtonElement>('button')]
      .find(b => b.textContent?.trim() === 'Summary report');
    if (!button) throw new Error('profile flow: no "Summary report" button in the lot panel');
    button.click();
  },

  /** The report loading and laying out in its window, until painted; then the window is closed. */
  async 'report-render'() {
    const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Summary report"]');
    if (!frame) throw new Error('profile flow: the report window did not open');
    if (frame.contentDocument?.readyState !== 'complete' || frame.contentDocument.body?.childElementCount === 0) {
      await new Promise(r => frame.addEventListener('load', r, { once: true }));
    }
    await painted();
    const ended = performance.now();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { endedAt: ended };
  },

  /** Every card redrawn as the first test's values. */
  async 'gallery-value'() {
    need(state.gallery, 'gallery').setOptions({ plotMode: 'value', activeTest: firstTest() });
    await painted();
  },

  /** Every card redrawn as the lot's stacked (per-position) hard bins. */
  async 'gallery-stacked'() {
    need(state.gallery, 'gallery').setOptions({ plotMode: 'stackedBins' });
    await painted();
  },

  /** The Insights side of the gallery's Maps | Insights switch: the lot-wide Overview, drawn. Loads the Insights chunk the first time. */
  async insights() {
    need(state.gallery, 'gallery');
    click('[data-wmap-view="insights"]');
    return { endedAt: await settled(state.container!) };
  },

  /** Lot-wide Distributions view (capability, boxplot, histogram, trend for the selected test). */
  async 'insights-distributions'() { return insightsView('distributions'); },

  /** Lot-wide Correlation view. */
  async 'insights-correlation'() { return insightsView('correlation'); },

  /** One wafer, the single-map view tsmap shows for a one-wafer load. */
  async map() {
    const items = need(state.items, 'analyse');
    state.gallery?.destroy();
    state.gallery = undefined;
    state.map = renderWaferMap(container(), items[0], {
      statsSummary: items[0].statsSummary,
      summaryPanel: { placement: 'right', defaultOpen: true },
      viewOptions: { plotMode: 'hardBin' },
      showHelpButton: false,
      insights,
    });
    await painted();
  },

  /** The single map redrawn as the first test's values. */
  async 'map-value'() {
    need(state.map, 'map').setOptions({ plotMode: 'value', activeTest: firstTest() });
    await painted();
  },

  /** The single map's Insights: one wafer's Overview, drawn. */
  async 'map-insights'() {
    need(state.map, 'map').setInsightsOpen(true);
    return { endedAt: await settled(state.container!) };
  },

  /** One wafer's Distributions view. */
  async 'map-insights-distributions'() { return insightsView('distributions'); },
};
