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
import { renderWaferGallery, renderWaferMap } from '@wafertools/wafermap/render';
import type { LotStatsSummary } from '@wafertools/wafermap/stats';
import { buildAndAnalyse } from './profile-analyse';
import type { ProfileItem } from './profile-analyse';

const state: {
  bytes?: Uint8Array;
  parsed?: RustParsedFile;
  items?: ProfileItem[];
  lot?: LotStatsSummary;
  container?: HTMLElement;
  gallery?: ReturnType<typeof renderWaferGallery>;
  map?: ReturnType<typeof renderWaferMap>;
} = {};

const need = <T>(v: T | undefined, what: string): T => {
  if (v === undefined) throw new Error(`profile flow needs ${what} — run the earlier flows first`);
  return v;
};

/** Two frames: the one the change is drawn in, and the one after it is painted. */
const painted = () => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

function container(): HTMLElement {
  state.container?.remove();
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--bg, #fff)';
  document.body.appendChild(el);
  return (state.container = el);
}

const firstTest = () => Number(Object.keys(need(state.parsed, 'parse').testDefs)[0]);
const insights = { enabled: true };

/** Untimed setup: fetch the fixture, so `parse` times parsing only. */
export async function prepare(url: string): Promise<void> {
  state.bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
}

export const flows: Record<string, () => Promise<void>> = {
  /** Worker parse, buffer transfer, main-thread decode. */
  async parse() {
    const bytes = need(state.bytes, 'prepare');
    state.parsed = await createPlatform().parseStdf({ name: 'fixture', bytes });
    state.bytes = undefined;
  },

  /** `buildWaferMap` + `analyzeWaferMap` per wafer, then `analyzeWaferLot` — tsmap's load-time pass. */
  async analyse() {
    ({ items: state.items, lot: state.lot } = buildAndAnalyse(need(state.parsed, 'parse')));
  },

  /** Progressive gallery mount with the lot summary panel, until every card and the panel have settled. */
  async gallery() {
    const items = need(state.items, 'analyse');
    state.map?.destroy();
    state.map = undefined;
    await new Promise<void>(resolve => {
      state.gallery = renderWaferGallery(container(), items.map(it => () => it), {
        lotStatsSummary: state.lot,
        onItemsResolved: () => resolve(),
        summaryPanel: { placement: 'right', defaultOpen: true },
        showHelpButton: false,
        viewOptions: { plotMode: 'hardBin' },
        insights,
      });
    });
    await painted();
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
};
