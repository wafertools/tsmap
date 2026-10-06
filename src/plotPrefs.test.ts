// Saved plots: stored as wmap's own plots file, read leniently, shared in memory with the next mount.

import { describe, it, expect, beforeEach } from 'vitest';
import { writePlotsFile } from '@wafertools/wafermap';
import type { PlotSpec } from '@wafertools/wafermap';
import { resetMigrationForTests } from './storageKeys';
import { loadSavedPlots, savePlots, resetPlotPrefsForTests, importPlotsText, plotsTemplateText } from './plotPrefs';
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
