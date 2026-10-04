// Saved plots: stored as wmap's own plots file, read leniently, shared in memory with the next mount.

import { describe, it, expect, beforeEach } from 'vitest';
import { writePlotsFile } from '@wafertools/wafermap';
import type { PlotSpec } from '@wafertools/wafermap';
import { resetMigrationForTests } from './storageKeys';
import { loadSavedPlots, savePlots, resetPlotPrefsForTests } from './plotPrefs';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

const A: PlotSpec = { id: 'a', title: 'Vth vs Idsat', mark: 'scatter', encoding: { x: { test: 1050, name: 'Vth' }, y: { test: 1060 } } };
const B: PlotSpec = { id: 'b', mark: 'histogram', encoding: { y: { test: 1050 } } };

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
    store.set('tsmap:plots', JSON.stringify({ format: 'wafermap-plots', version: 1, plots: [A, { id: 'x', encoding: {} }, 7] }));
    expect(loadSavedPlots()).toEqual([A]);
  });

  it('treats text that is not a plots file as nothing saved', () => {
    store.set('tsmap:plots', 'not json');
    expect(loadSavedPlots()).toEqual([]);
  });
});
