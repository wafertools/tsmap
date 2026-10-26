// The per-program selection memory: what must hold is that a program is recognised by its set of test numbers
// (order and names aside), that a different set gets nothing, and that a remembered number the data no longer has
// is dropped rather than offered.

import { describe, it, expect, beforeEach } from 'vitest';
import { programKey, rememberedSelection, rememberSelection } from './testSelectionMemory';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

beforeEach(() => store.clear());

describe('programKey', () => {
  it('is the same for the same tests in any order, and differs when a test is added or dropped', () => {
    expect(programKey([3, 1, 2])).toBe(programKey([1, 2, 3]));
    expect(programKey([1, 2, 3])).not.toBe(programKey([1, 2, 4]));
    expect(programKey([1, 2, 3])).not.toBe(programKey([1, 2, 3, 4]));
  });
});

describe('remembering a selection', () => {
  it('offers the last choice for the same tests, and nothing for another set', () => {
    rememberSelection([1, 2, 3, 4], [2, 4]);
    expect(rememberedSelection([4, 3, 2, 1])).toEqual([2, 4]);
    expect(rememberedSelection([1, 2, 3, 5])).toBeUndefined();
  });

  it('keeps the latest choice when the same tests are confirmed again', () => {
    rememberSelection([1, 2, 3], [1]);
    rememberSelection([1, 2, 3], [2, 3]);
    expect(rememberedSelection([1, 2, 3])).toEqual([2, 3]);
  });

  it('remembers an empty choice as empty, not as missing', () => {
    rememberSelection([1, 2], []);
    expect(rememberedSelection([1, 2])).toEqual([]);
  });

  it('forgets the oldest program beyond twenty', () => {
    for (let i = 0; i < 22; i++) rememberSelection([i, 1000], [i]);
    expect(rememberedSelection([0, 1000])).toBeUndefined();
    expect(rememberedSelection([21, 1000])).toEqual([21]);
  });

  it('survives corrupt storage and a refused write', () => {
    store.set('tsmap:test-selections', '{not json');
    expect(rememberedSelection([1])).toBeUndefined();
    const original = localStorage.setItem;
    (localStorage as { setItem: unknown }).setItem = () => { throw new Error('QuotaExceededError'); };
    expect(() => rememberSelection([1], [1])).not.toThrow();
    (localStorage as { setItem: unknown }).setItem = original;
  });
});
