// The registry's job is to be the complete, correct list — so the tests are
// mostly about the ways it could quietly stop being that: a duplicate key, a
// legacy name colliding with a current one, or a rename that drops the user's
// existing value on the floor. That last one is the reason `legacyKeys` exists
// at all, and it is invisible in manual testing because it only shows up for
// someone upgrading with data already stored.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  STORED_ITEMS, storageKey, migrateLegacyStorageKeys, hasStoredValue,
  clearStoredItems, resetMigrationForTests,
} from './storageKeys';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

beforeEach(() => { store.clear(); resetMigrationForTests(); });

describe('the registry itself', () => {
  it('has no duplicate current keys', () => {
    const keys = STORED_ITEMS.map(i => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has no duplicate legacy keys, and none colliding with a current key', () => {
    const current = new Set(STORED_ITEMS.map(i => i.key));
    const legacy = STORED_ITEMS.flatMap(i => i.legacyKeys ?? []);
    expect(new Set(legacy).size).toBe(legacy.length);
    for (const l of legacy) expect(current.has(l)).toBe(false);
  });

  it('names every key under one scheme, so the set stays greppable', () => {
    for (const i of STORED_ITEMS) expect(i.key).toMatch(/^tsmap:[a-z0-9-]+$/);
  });

  it('gives every item text the reset dialog can show', () => {
    for (const i of STORED_ITEMS) {
      expect(i.label.length).toBeGreaterThan(0);
      expect(i.description.length).toBeGreaterThan(0);
    }
  });
});

describe('storageKey', () => {
  it('returns the current key', () => {
    expect(storageKey('tsmap:theme')).toBe('tsmap:theme');
  });

  it('throws on a key that is not registered, rather than inventing one', () => {
    expect(() => storageKey('tsmap:not-a-thing')).toThrow(/not in STORED_ITEMS/);
  });
});

describe('legacy migration', () => {
  it('moves a value from an old key to the current one', () => {
    store.set('tsmap-theme', 'nord');
    migrateLegacyStorageKeys();
    expect(store.get('tsmap:theme')).toBe('nord');
    expect(store.has('tsmap-theme')).toBe(false);
  });

  it('migrates the dotted file-filter key too', () => {
    store.set('tsmap.fileFilter.lastCriteria', 'lot=ABC');
    migrateLegacyStorageKeys();
    expect(store.get('tsmap:file-filter')).toBe('lot=ABC');
    expect(store.has('tsmap.fileFilter.lastCriteria')).toBe(false);
  });

  it('keeps the current value when both exist, and clears the stale one', () => {
    store.set('tsmap-theme', 'old');
    store.set('tsmap:theme', 'new');
    migrateLegacyStorageKeys();
    expect(store.get('tsmap:theme')).toBe('new');
    expect(store.has('tsmap-theme')).toBe(false);
  });

  it('is idempotent', () => {
    store.set('tsmap-recent-files', '[]');
    migrateLegacyStorageKeys();
    migrateLegacyStorageKeys();
    expect(store.get('tsmap:recent-files')).toBe('[]');
  });

  it('runs automatically on the first storageKey call — the ordering consumers rely on', () => {
    store.set('tsmap-theme', 'dracula');
    expect(store.has('tsmap:theme')).toBe(false);
    storageKey('tsmap:theme');
    expect(store.get('tsmap:theme')).toBe('dracula');
  });

  it('does not throw when storage is unavailable', () => {
    const original = localStorage.getItem;
    (localStorage as { getItem: unknown }).getItem = () => { throw new Error('SecurityError'); };
    expect(() => migrateLegacyStorageKeys()).not.toThrow();
    (localStorage as { getItem: unknown }).getItem = original;
  });
});

describe('hasStoredValue / clearStoredItems', () => {
  const theme = STORED_ITEMS.find(i => i.key === 'tsmap:theme')!;
  const splits = STORED_ITEMS.find(i => i.key === 'tsmap:wafer-splits')!;

  it('reports only what is actually stored', () => {
    expect(hasStoredValue(theme)).toBe(false);
    store.set('tsmap:theme', 'nord');
    expect(hasStoredValue(theme)).toBe(true);
  });

  it('clears only the items named, and counts what really existed', () => {
    store.set('tsmap:theme', 'nord');
    store.set('tsmap:wafer-splits', '{}');
    expect(clearStoredItems([theme])).toBe(1);
    expect(store.has('tsmap:theme')).toBe(false);
    expect(store.has('tsmap:wafer-splits')).toBe(true);
    // Clearing something already absent is not an error and is not counted.
    expect(clearStoredItems([theme])).toBe(0);
    expect(clearStoredItems([splits])).toBe(1);
  });

  it('also removes a legacy key, so a reset cannot be undone by migration', () => {
    store.set('tsmap-theme', 'old');
    store.set('tsmap:theme', 'new');
    clearStoredItems([theme]);
    expect(store.has('tsmap:theme')).toBe(false);
    expect(store.has('tsmap-theme')).toBe(false);
  });
});
