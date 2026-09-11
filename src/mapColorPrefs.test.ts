import { describe, it, expect, beforeEach } from 'vitest';
import { resetMigrationForTests } from './storageKeys';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

const { loadMapColorPrefs, saveMapColorPrefs } = await import('./mapColorPrefs');

beforeEach(() => { store.clear(); resetMigrationForTests(); });

describe('map colour preferences', () => {
  it('loads nothing when nothing is saved, so wmap defaults apply', () => {
    expect(loadMapColorPrefs()).toEqual({});
  });

  it('round-trips bin scheme, value scheme and the definition-colour toggle', () => {
    saveMapColorPrefs(
      { plotMode: 'value', binColorScheme: 'accessible', valueColorScheme: 'viridis', useDefinedBinColors: false },
      ['valueColorScheme'],
    );
    expect(loadMapColorPrefs()).toEqual({
      binColorScheme: 'accessible', valueColorScheme: 'viridis', useDefinedBinColors: false,
    });
  });

  it('keeps the two schemes independent — saving one never clears the other', () => {
    saveMapColorPrefs({ binColorScheme: 'accessible' }, ['binColorScheme']);
    saveMapColorPrefs({ binColorScheme: 'accessible', valueColorScheme: 'plasma' }, ['valueColorScheme']);
    expect(loadMapColorPrefs()).toEqual({ binColorScheme: 'accessible', valueColorScheme: 'plasma' });
  });

  it('ignores changes that are not colour choices', () => {
    saveMapColorPrefs({ plotMode: 'softBin', showRingBoundaries: true }, ['plotMode', 'showRingBoundaries']);
    expect(store.size).toBe(0);
  });

  it('drops a saved scheme name that is no longer registered', () => {
    store.set('tsmap:map-colors', JSON.stringify({ binColorScheme: 'gone', valueColorScheme: 'viridis' }));
    expect(loadMapColorPrefs()).toEqual({ valueColorScheme: 'viridis' });
  });

  it('survives malformed storage', () => {
    store.set('tsmap:map-colors', '{not json');
    expect(loadMapColorPrefs()).toEqual({});
    store.set('tsmap:map-colors', JSON.stringify({ useDefinedBinColors: 'yes' }));
    expect(loadMapColorPrefs()).toEqual({});
  });
});
