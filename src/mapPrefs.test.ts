import { describe, it, expect, beforeEach } from 'vitest';
import { resetMigrationForTests } from './storageKeys';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

const { loadMapPrefs, saveMapPrefs } = await import('./mapPrefs');

beforeEach(() => { store.clear(); resetMigrationForTests(); });

describe('map preferences', () => {
  it('loads nothing when nothing is saved, so wmap defaults apply', () => {
    expect(loadMapPrefs()).toEqual({});
  });

  it('keeps each preference the reader changes, colours and the rest', () => {
    saveMapPrefs({ plotMode: 'value', valueColorScheme: 'mako' }, ['valueColorScheme']);
    saveMapPrefs({ showRingBoundaries: true }, ['showRingBoundaries']);
    saveMapPrefs({ legendPosition: 'bottom' }, ['legendPosition']);
    saveMapPrefs({ chartClipOutliers: true, chartLimitLines: 'spec' }, ['chartClipOutliers', 'chartLimitLines']);
    expect(loadMapPrefs()).toEqual({
      valueColorScheme: 'mako', showRingBoundaries: true, legendPosition: 'bottom',
      chartClipOutliers: true, chartLimitLines: 'spec',
    });
  });

  it('saves only the keys a change touched, so a value set at mount is not taken for a choice', () => {
    saveMapPrefs({ binColorScheme: 'accessible', valueColorScheme: 'mako' }, ['valueColorScheme']);
    expect(loadMapPrefs()).toEqual({ valueColorScheme: 'mako' });
  });

  it('never keeps what describes the data on screen: orientation, compact layout, log scale, plot mode', () => {
    saveMapPrefs(
      { rotation: 90, flipX: true, compact: true, logScale: true, plotMode: 'softBin', activeTest: 3 },
      ['rotation', 'flipX', 'compact', 'logScale', 'plotMode', 'activeTest'],
    );
    expect(store.size).toBe(0);
    // A mixed change keeps its preference part only.
    saveMapPrefs({ rotation: 90, showAxes: true }, ['rotation', 'showAxes']);
    expect(loadMapPrefs()).toEqual({ showAxes: true });
  });

  it('keeps a preference turned back off, rather than treating false as unset', () => {
    saveMapPrefs({ reverseValueScheme: true }, ['reverseValueScheme']);
    saveMapPrefs({ reverseValueScheme: false }, ['reverseValueScheme']);
    expect(loadMapPrefs()).toEqual({ reverseValueScheme: false });
  });

  it('keeps the colour choices saved before every preference was kept', () => {
    store.set('tsmap:map-colors', JSON.stringify({ binColorScheme: 'accessible', useDefinedBinColors: false }));
    expect(loadMapPrefs()).toEqual({ binColorScheme: 'accessible', useDefinedBinColors: false });
  });

  it('drops a saved value that is no longer valid', () => {
    store.set('tsmap:map-colors', JSON.stringify({
      binColorScheme: 'gone', valueColorScheme: 'mako', legendPosition: 'sideways', chartLimitLines: 'all',
      rotation: 90, notAPreference: 1,
    }));
    expect(loadMapPrefs()).toEqual({ valueColorScheme: 'mako' });
  });

  it('survives malformed storage', () => {
    store.set('tsmap:map-colors', '{not json');
    expect(loadMapPrefs()).toEqual({});
    store.set('tsmap:map-colors', JSON.stringify({ useDefinedBinColors: 'yes', reverseValueScheme: 'yes' }));
    expect(loadMapPrefs()).toEqual({});
  });
});
