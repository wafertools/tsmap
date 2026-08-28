import { describe, it, expect, beforeEach } from 'vitest';
import {
  getEdgeExclusionMm, setEdgeExclusionMm,
  getWaferDiameterMm, setWaferDiameterMm,
  normalizeWaferGeometry, setWaferGeometry,
} from './waferGeometry';

const EXCLUSION_KEY = 'tsmap:edge-exclusion-mm';
const DIAMETER_KEY = 'tsmap:wafer-diameter-mm';

// Suite runs on vitest's `node` environment (vite.config.ts) — stand up the
// same minimal localStorage stub recentFiles.test.ts uses, rather than pull
// in jsdom for one pure module.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

beforeEach(() => store.clear());

describe('getEdgeExclusionMm', () => {
  it('returns undefined when nothing is stored', () => {
    expect(getEdgeExclusionMm()).toBeUndefined();
  });

  it('returns undefined for a corrupted (non-numeric) stored value', () => {
    store.set(EXCLUSION_KEY, 'not-a-number');
    expect(getEdgeExclusionMm()).toBeUndefined();
  });

  it('returns 0 for a stored zero (a legitimate "no exclusion" value), but undefined for negative', () => {
    store.set(EXCLUSION_KEY, '0');
    expect(getEdgeExclusionMm()).toBe(0);
    store.set(EXCLUSION_KEY, '-3');
    expect(getEdgeExclusionMm()).toBeUndefined();
  });

  it('reads back a valid stored value', () => {
    store.set(EXCLUSION_KEY, '3.2');
    expect(getEdgeExclusionMm()).toBe(3.2);
  });
});

describe('setEdgeExclusionMm', () => {
  it('persists a positive value', () => {
    setEdgeExclusionMm(3);
    expect(getEdgeExclusionMm()).toBe(3);
  });

  it('round-trips a fractional value', () => {
    setEdgeExclusionMm(2.5);
    expect(getEdgeExclusionMm()).toBe(2.5);
  });

  it('clears the stored value when given undefined', () => {
    setEdgeExclusionMm(3);
    setEdgeExclusionMm(undefined);
    expect(getEdgeExclusionMm()).toBeUndefined();
    expect(store.has(EXCLUSION_KEY)).toBe(false);
  });

  it('persists an explicit zero rather than treating it as unset', () => {
    // Unlike diameter, 0 is a legitimate "no exclusion" value here — the CLI
    // (--edge-exclusion) validates >= 0 and the dialog accepts 0 too, so
    // persistence must not silently coerce an explicit 0 into "unset".
    setEdgeExclusionMm(0);
    expect(store.get(EXCLUSION_KEY)).toBe('0');
    expect(getEdgeExclusionMm()).toBe(0);
  });

  it('clears the stored value when given a negative number or NaN', () => {
    setEdgeExclusionMm(3);
    setEdgeExclusionMm(-1);
    expect(store.has(EXCLUSION_KEY)).toBe(false);

    setEdgeExclusionMm(3);
    setEdgeExclusionMm(NaN);
    expect(store.has(EXCLUSION_KEY)).toBe(false);
  });

  it('clears the stored value when given undefined', () => {
    setEdgeExclusionMm(3);
    setEdgeExclusionMm(undefined);
    expect(store.has(EXCLUSION_KEY)).toBe(false);
  });
});

describe('getWaferDiameterMm', () => {
  it('returns undefined when nothing is stored', () => {
    expect(getWaferDiameterMm()).toBeUndefined();
  });

  it('returns undefined for a corrupted (non-numeric) stored value', () => {
    store.set(DIAMETER_KEY, 'not-a-number');
    expect(getWaferDiameterMm()).toBeUndefined();
  });

  it('returns undefined for a stored zero or negative value', () => {
    store.set(DIAMETER_KEY, '0');
    expect(getWaferDiameterMm()).toBeUndefined();
    store.set(DIAMETER_KEY, '-300');
    expect(getWaferDiameterMm()).toBeUndefined();
  });

  it('reads back a valid stored value', () => {
    store.set(DIAMETER_KEY, '300');
    expect(getWaferDiameterMm()).toBe(300);
  });
});

describe('setWaferDiameterMm', () => {
  it('persists a positive value', () => {
    setWaferDiameterMm(300);
    expect(getWaferDiameterMm()).toBe(300);
  });

  it('clears the stored value when given undefined, zero, negative, or NaN', () => {
    setWaferDiameterMm(300);
    setWaferDiameterMm(undefined);
    expect(store.has(DIAMETER_KEY)).toBe(false);

    setWaferDiameterMm(300);
    setWaferDiameterMm(0);
    expect(store.has(DIAMETER_KEY)).toBe(false);

    setWaferDiameterMm(300);
    setWaferDiameterMm(-1);
    expect(store.has(DIAMETER_KEY)).toBe(false);

    setWaferDiameterMm(300);
    setWaferDiameterMm(NaN);
    expect(store.has(DIAMETER_KEY)).toBe(false);
  });
});

describe('normalizeWaferGeometry', () => {
  it('drops edge exclusion when diameter is unset', () => {
    expect(normalizeWaferGeometry(undefined, 3)).toEqual({ diameterMm: undefined, edgeExclusionMm: undefined });
  });

  it('passes edge exclusion through unchanged when diameter is set', () => {
    expect(normalizeWaferGeometry(300, 3)).toEqual({ diameterMm: 300, edgeExclusionMm: 3 });
  });

  it('leaves edge exclusion undefined when diameter is set but exclusion is not (diameter-only pin)', () => {
    expect(normalizeWaferGeometry(300, undefined)).toEqual({ diameterMm: 300, edgeExclusionMm: undefined });
  });

  it('drops both when both are unset', () => {
    expect(normalizeWaferGeometry(undefined, undefined)).toEqual({ diameterMm: undefined, edgeExclusionMm: undefined });
  });
});

describe('setWaferGeometry', () => {
  it('persists both values when diameter is set', () => {
    const result = setWaferGeometry({ diameterMm: 300, edgeExclusionMm: 3 });
    expect(result).toEqual({ diameterMm: 300, edgeExclusionMm: 3 });
    expect(getWaferDiameterMm()).toBe(300);
    expect(getEdgeExclusionMm()).toBe(3);
  });

  it('clears the persisted exclusion when diameter is unset, even if exclusion was requested', () => {
    setWaferGeometry({ diameterMm: 300, edgeExclusionMm: 3 });
    const result = setWaferGeometry({ diameterMm: undefined, edgeExclusionMm: 3 });
    expect(result).toEqual({ diameterMm: undefined, edgeExclusionMm: undefined });
    expect(getWaferDiameterMm()).toBeUndefined();
    expect(getEdgeExclusionMm()).toBeUndefined();
  });
});
