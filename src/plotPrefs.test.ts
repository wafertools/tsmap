// Saved plots: stored as wmap's own plots file, read leniently, shared in memory with the next mount.

import { describe, it, expect, beforeEach } from 'vitest';
import { writePlotsFile, writeFiltersFile } from '@wafertools/wafermap';
import type { PlotSpec, SavedFilter } from '@wafertools/wafermap';
import { resetMigrationForTests } from './storageKeys';
import { loadSavedPlots, savePlots, resetPlotPrefsForTests, importPlotsText, plotsTemplateText, loadInsightsFilter, saveInsightsFilter, loadSavedFilters, saveSavedFilters } from './plotPrefs';
import { readPlotsFile } from '@wafertools/wafermap';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

const A: PlotSpec = { id: 'a', title: 'Vth vs Idsat', chart: 'scatter', fields: { x: { test: 1050, name: 'Vth' }, y: { test: 1060 } } };
const B: PlotSpec = { id: 'b', chart: 'histogram', fields: { y: { test: 1050 } } };

beforeEach(() => { store.clear(); resetMigrationForTests(); resetPlotPrefsForTests(); });

describe('saved plots', () => {
  it('starts empty', () => {
    expect(loadSavedPlots()).toEqual([]);
  });

  it('stores wmap\'s own plots file, so an export and a saved list are the same thing', () => {
    savePlots([A, B]);
    const text = store.get('tsmap:plots')!;
    expect(text).toBe(writePlotsFile([A, B]));
    expect(JSON.parse(text).format).toBe('wafermap-plots');
  });

  it('reads them back after a restart', () => {
    savePlots([A, B]);
    resetPlotPrefsForTests();
    expect(loadSavedPlots()).toEqual([A, B]);
  });

  it('a re-render before the next change is reported starts from the latest list', () => {
    loadSavedPlots();
    savePlots([A]);
    store.clear();   // even if storage lagged
    expect(loadSavedPlots()).toEqual([A]);
  });

  it('forgets the item when the list is emptied, so Reset saved settings has nothing to list', () => {
    savePlots([A]);
    savePlots([]);
    expect(store.has('tsmap:plots')).toBe(false);
  });

  it('keeps the readable plots of a damaged value rather than losing them all', () => {
    store.set('tsmap:plots', JSON.stringify({ format: 'wafermap-plots', version: 1, plots: [A, { id: 'x', fields: {} }, 7] }));
    expect(loadSavedPlots()).toEqual([A]);
  });

  it('treats text that is not a plots file as nothing saved', () => {
    store.set('tsmap:plots', 'not json');
    expect(loadSavedPlots()).toEqual([]);
  });
});

describe('importing a plots file named on the command line', () => {
  it('adds the plots to the saved ones', () => {
    savePlots([A]);
    const r = importPlotsText(writePlotsFile([B]));
    expect(r).toMatchObject({ added: 1, replaced: 0, titles: [], untitled: 1 });
    expect(loadSavedPlots().map(p => p.id)).toEqual(['a', 'b']);
  });

  it('reports the titles the plots carry, and counts the untitled ones instead of naming them by id', () => {
    savePlots([]);
    const titled: PlotSpec = { ...B, id: 'c', title: 'Vth vs Idsat' };
    const r = importPlotsText(writePlotsFile([titled, B]));
    expect(r.titles).toEqual(['Vth vs Idsat']);
    expect(r.untitled).toBe(1);
    expect(JSON.stringify(r)).not.toContain('"b"');
  });

  it('replaces a plot with the same id, so the same file twice leaves one copy', () => {
    savePlots([A]);
    const edited: PlotSpec = { ...A, title: 'Edited' };
    const text = writePlotsFile([edited, B]);
    expect(importPlotsText(text)).toMatchObject({ added: 1, replaced: 1 });
    expect(importPlotsText(text)).toMatchObject({ added: 0, replaced: 2 });
    expect(loadSavedPlots().map(p => p.title ?? p.id)).toEqual(['Edited', 'b']);
  });

  it('reads an older sweeps file too, as sweep plots', () => {
    const sweeps = JSON.stringify({ format: 'tsmap-sweeps', version: 1, sweeps: [
      { id: 's1', title: 'Power', series: [{ label: 'Up', tests: [1, 2], xValues: [0, 1] }] },
    ] });
    const r = importPlotsText(sweeps);
    expect(r.error).toBeUndefined();
    expect(loadSavedPlots()).toMatchObject([{ id: 's1', title: 'Power', chart: 'sweep' }]);
  });

  it('leaves the saved plots alone when the file cannot be read', () => {
    savePlots([A]);
    const r = importPlotsText('{ not json');
    expect(r.error).toBeDefined();
    expect(loadSavedPlots()).toEqual([A]);
  });
});

describe('the example plots file', () => {
  it('is a plots file wmap reads without complaint', () => {
    const read = readPlotsFile(plotsTemplateText());
    expect(read.error).toBeUndefined();
    expect(read.warnings).toEqual([]);
    expect(read.plots).toMatchObject([{ id: 'set-reset', chart: 'sweep' }]);
  });
});

describe('the saved Insights filter', () => {
  const FILTER = { conditions: [{ field: { meta: 'split' }, values: ['A'] }, { field: { test: 1050 }, min: 0.4 }], off: true };

  it('starts with none', () => {
    expect(loadInsightsFilter()).toBeUndefined();
  });

  it('reads back after a restart, switched off as it was left', () => {
    saveInsightsFilter(FILTER);
    resetPlotPrefsForTests();
    expect(loadInsightsFilter()).toEqual(FILTER);
  });

  it('a re-render before the next change is reported starts from the latest filter', () => {
    saveInsightsFilter(FILTER);
    store.clear();
    expect(loadInsightsFilter()).toEqual(FILTER);
  });

  it('removing the filter forgets it, so Reset saved settings has nothing to list', () => {
    saveInsightsFilter(FILTER);
    saveInsightsFilter(undefined);
    expect(store.has('tsmap:insights-filter')).toBe(false);
    resetPlotPrefsForTests();
    expect(loadInsightsFilter()).toBeUndefined();
  });

  it('stored text that is not JSON is no filter rather than an error', () => {
    store.set('tsmap:insights-filter', '{not json');
    expect(loadInsightsFilter()).toBeUndefined();
  });

  it('is kept apart from the plots, so exporting plots never carries it', () => {
    savePlots([A]);
    saveInsightsFilter(FILTER);
    expect(readPlotsFile(store.get('tsmap:plots')!).plots).toEqual([A]);
  });
});

describe('saved filters', () => {
  const SAVED: SavedFilter[] = [
    { id: 'f1', name: 'Bin 1 only', conditions: [{ field: { builtin: 'hbin' }, values: ['Bin 1'] }] },
    { id: 'f2', name: 'Split A', conditions: [{ field: { meta: 'split' }, values: ['A'] }] },
  ];

  it('starts empty', () => {
    expect(loadSavedFilters()).toEqual([]);
  });

  it('stores wmap\'s own filters file, so an export and the saved list are the same thing', () => {
    saveSavedFilters(SAVED);
    const text = store.get('tsmap:saved-filters')!;
    expect(text).toBe(writeFiltersFile(SAVED));
    expect(JSON.parse(text).format).toBe('wafermap-filters');
  });

  it('reads them back after a restart', () => {
    saveSavedFilters(SAVED);
    resetPlotPrefsForTests();
    expect(loadSavedFilters()).toEqual(SAVED);
  });

  it('an empty list forgets the key, so Reset saved settings has nothing to list', () => {
    saveSavedFilters(SAVED);
    saveSavedFilters([]);
    expect(store.has('tsmap:saved-filters')).toBe(false);
    resetPlotPrefsForTests();
    expect(loadSavedFilters()).toEqual([]);
  });

  it('stored text that is not a filters file is no filters rather than an error', () => {
    store.set('tsmap:saved-filters', '{not json');
    expect(loadSavedFilters()).toEqual([]);
  });

  it('a filter that cannot be read is dropped and the rest are kept', () => {
    store.set('tsmap:saved-filters', JSON.stringify({ format: 'wafermap-filters', version: 1, filters: [SAVED[0], { name: 'Broken', conditions: [{ nope: 1 }] }] }));
    expect(loadSavedFilters()).toEqual([SAVED[0]]);
  });

  it('is kept apart from the filter in force and from the plots', () => {
    savePlots([A]);
    saveInsightsFilter({ conditions: SAVED[0].conditions });
    saveSavedFilters(SAVED);
    expect(JSON.parse(store.get('tsmap:insights-filter')!).conditions).toEqual(SAVED[0].conditions);
    expect(readPlotsFile(store.get('tsmap:plots')!).plots).toEqual([A]);
  });

  it('is a registered stored item, so the app can start and Reset can list it', async () => {
    const { STORED_ITEMS } = await import('./storageKeys');
    expect(STORED_ITEMS.map(i => i.key)).toContain('tsmap:saved-filters');
  });
});
