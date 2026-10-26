import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

vi.mock('@wafertools/wafermap/render', () => ({ setPinnedTests: vi.fn(), onPinnedTestsChange: vi.fn() }));

import { loadPinnedTests, savePinnedTests } from './pinnedTestsPrefs';

beforeEach(() => store.clear());

describe('pinned tests, saved', () => {
  it('round-trips the set', () => {
    savePinnedTests([30, 10]);
    expect(loadPinnedTests()).toEqual([30, 10]);
  });

  it('forgets the item when the set is emptied, so Reset saved settings has nothing to list', () => {
    savePinnedTests([1]);
    savePinnedTests([]);
    expect(store.has('tsmap:pinned-tests')).toBe(false);
  });

  it('reads nothing from storage that is malformed or holds other values', () => {
    store.set('tsmap:pinned-tests', '{oops');
    expect(loadPinnedTests()).toEqual([]);
    store.set('tsmap:pinned-tests', JSON.stringify([1, 'x', null, 2]));
    expect(loadPinnedTests()).toEqual([1, 2]);
  });

  it('does not throw when storage refuses the write', () => {
    const original = localStorage.setItem;
    (localStorage as { setItem: unknown }).setItem = () => { throw new Error('QuotaExceededError'); };
    expect(() => savePinnedTests([5])).not.toThrow();
    (localStorage as { setItem: unknown }).setItem = original;
  });
});
