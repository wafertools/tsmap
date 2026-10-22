import { describe, it, expect, beforeEach } from 'vitest';
import { buildWaferMap } from '@wafertools/wafermap';
import type { DieResult } from '@wafertools/wafermap';
import RETEST_CSV from '../sample_data/RETEST-LOT-07.csv?raw';
import { getRetestPolicy, setRetestPolicy, normalizeRetestPolicy, type RetestPolicy } from './retestPolicy';

// Minimal localStorage stub, as validityLimits.test.ts uses, rather than pull in jsdom.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
};

describe('retest policy setting', () => {
  beforeEach(() => store.clear());

  it('defaults to the last result and falls back to it for anything unknown', () => {
    expect(getRetestPolicy()).toBe('last');
    expect(normalizeRetestPolicy('latest')).toBe('last');
  });

  it('remembers a chosen policy, and clears the stored value for the default', () => {
    expect(setRetestPolicy('best')).toBe('best');
    expect(getRetestPolicy()).toBe('best');
    setRetestPolicy('last');
    expect(localStorage.getItem('tsmap:retest-policy')).toBeNull();
  });
});

describe('retest policy on RETEST-LOT-07', () => {
  // The sample's first wafer, read straight from the CSV: one row per probe, retests after the first pass.
  const rows = RETEST_CSV.trim().split('\n').slice(1)
    .map(line => line.split(','))
    .filter(c => c[1] === 'W01')
    .map((c): DieResult => ({ x: Number(c[2]), y: Number(c[3]), hbin: Number(c[4]), sbin: Number(c[5]) }));
  const yieldWith = (retestPolicy: RetestPolicy) => buildWaferMap({ results: rows, retestPolicy }).yield.yieldPercent;

  // The sample is generated so that no two policies agree (scripts/generate_retest_csv.py).
  it('gives each policy its own yield: best, then last, then first, then worst', () => {
    const [best, last, first, worst] = (['best', 'last', 'first', 'worst'] as const).map(yieldWith);
    expect(best).toBeGreaterThan(last!);
    expect(last).toBeGreaterThan(first!);
    expect(first).toBeGreaterThan(worst!);
  });
});
