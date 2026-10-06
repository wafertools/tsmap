import { describe, it, expect, beforeEach } from 'vitest';
import { getReticle, setReticle, normalizeReticle, toWmapReticleConfig } from './reticle';

const KEY = 'tsmap:reticle';

// Same minimal localStorage stub waferGeometry.test.ts uses.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

beforeEach(() => store.clear());

describe('normalizeReticle', () => {
  it('keeps a whole-number field size', () => {
    expect(normalizeReticle({ width: 4, height: 6 })).toEqual({ width: 4, height: 6 });
  });

  it('refuses a field that is not a positive whole number of dies', () => {
    for (const bad of [{ width: 0, height: 4 }, { width: 4, height: -1 }, { width: 2.5, height: 4 }, { width: '4', height: 4 }, { width: 4 }, null, 7]) {
      expect(normalizeReticle(bad)).toBeUndefined();
    }
  });

  it('keeps an anchor die, including negative positions, and drops the default (0, 0)', () => {
    expect(normalizeReticle({ width: 4, height: 6, anchorDie: { x: -3, y: 2 } })).toEqual({ width: 4, height: 6, anchorDie: { x: -3, y: 2 } });
    expect(normalizeReticle({ width: 4, height: 6, anchorDie: { x: 0, y: 0 } })).toEqual({ width: 4, height: 6 });
  });

  it('ignores an anchor that is not a die position', () => {
    expect(normalizeReticle({ width: 4, height: 6, anchorDie: { x: 1.5, y: 2 } })).toEqual({ width: 4, height: 6 });
  });
});

describe('getReticle / setReticle', () => {
  it('is undefined when nothing is stored', () => {
    expect(getReticle()).toBeUndefined();
  });

  it('round-trips a reticle', () => {
    setReticle({ width: 5, height: 3, anchorDie: { x: 1, y: -2 } });
    expect(getReticle()).toEqual({ width: 5, height: 3, anchorDie: { x: 1, y: -2 } });
  });

  it('clears the stored value when given undefined or something unusable', () => {
    setReticle({ width: 5, height: 3 });
    expect(setReticle(undefined)).toBeUndefined();
    expect(store.has(KEY)).toBe(false);
    setReticle({ width: 5, height: 3 });
    expect(setReticle({ width: 0, height: 3 })).toBeUndefined();
    expect(store.has(KEY)).toBe(false);
  });

  it('reads a corrupted stored value as unset', () => {
    store.set(KEY, '{not json');
    expect(getReticle()).toBeUndefined();
    store.set(KEY, JSON.stringify({ width: 'x', height: 3 }));
    expect(getReticle()).toBeUndefined();
  });
});

describe('toWmapReticleConfig', () => {
  it('is undefined for no reticle, so the key can be left off the call', () => {
    expect(toWmapReticleConfig(undefined)).toBeUndefined();
  });

  it('carries the anchor only when there is one', () => {
    expect(toWmapReticleConfig({ width: 4, height: 6 })).toEqual({ width: 4, height: 6 });
    expect(toWmapReticleConfig({ width: 4, height: 6, anchorDie: { x: 2, y: 1 } })).toEqual({ width: 4, height: 6, anchorDie: { x: 2, y: 1 } });
  });
});
