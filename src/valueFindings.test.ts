import { describe, it, expect } from 'vitest';
import {
  estimateValueFindingsMs, lotHasTestValues, describeDuration, maxTestCount,
  VALUE_FINDINGS_AUTO_BUDGET_MS, VALUE_FINDINGS_US_PER_DIE_TEST,
} from './valueFindings';
import type { WaferData } from './types';

/** A wafer of `dieCount` dies each carrying `testCount` test values. */
function wafer(waferId: string, dieCount: number, testCount: number): WaferData {
  const testValues: Record<number, number> = {};
  for (let t = 0; t < testCount; t++) testValues[t] = t;
  return {
    waferId,
    results: Array.from({ length: dieCount }, (_, i) => ({
      id: String(i), x: i % 50, y: Math.floor(i / 50), hbin: 1,
      testValues: testCount ? { ...testValues } : undefined,
    })),
  } as unknown as WaferData;
}

describe('test-value analysis cost model', () => {
  it('scales linearly with wafers × dies × tests', () => {
    const one = estimateValueFindingsMs([wafer('W01', 1000, 10)]);
    expect(one).toBeCloseTo(1000 * 10 * VALUE_FINDINGS_US_PER_DIE_TEST / 1000, 6);
    // Doubling any one factor doubles the estimate.
    expect(estimateValueFindingsMs([wafer('W01', 2000, 10)])).toBeCloseTo(one * 2, 6);
    expect(estimateValueFindingsMs([wafer('W01', 1000, 20)])).toBeCloseTo(one * 2, 6);
    expect(estimateValueFindingsMs([wafer('W01', 1000, 10), wafer('W02', 1000, 10)]))
      .toBeCloseTo(one * 2, 6);
  });

  it('puts a typical single-lot CSV under the auto budget and a production lot over it', () => {
    // testdata/correlated.csv — 5 wafers, 9865 dies total, 30 tests. This is the
    // lot the reported case used; it must not prompt.
    const correlated = Array.from({ length: 5 }, (_, i) => wafer(`W0${i + 1}`, 1973, 30));
    expect(estimateValueFindingsMs(correlated)).toBeLessThan(VALUE_FINDINGS_AUTO_BUDGET_MS);

    // 25 wafers × 10.7k dies × 30 tests measured at ~9.7s — must prompt.
    const production = Array.from({ length: 25 }, (_, i) => wafer(`W${i}`, 10_725, 30));
    expect(estimateValueFindingsMs(production)).toBeGreaterThan(VALUE_FINDINGS_AUTO_BUDGET_MS);
  });

  it('tracks the measured benchmarks within a factor of two', () => {
    // The coefficient only has to answer "instant or not", but a model that
    // drifts an order of magnitude would silently break both sides of that.
    for (const [wafers, dies, tests, measuredMs] of [
      [5, 10_725, 30, 1917], [5, 10_725, 100, 6656], [25, 10_725, 30, 9689],
    ] as const) {
      const est = estimateValueFindingsMs(
        Array.from({ length: wafers }, (_, i) => wafer(`W${i}`, dies, tests)));
      expect(est).toBeGreaterThan(measuredMs / 2);
      expect(est).toBeLessThan(measuredMs * 2);
    }
  });

  it('reports the largest per-die test count, not the first or the mean', () => {
    expect(maxTestCount([wafer('W01', 10, 3), wafer('W02', 10, 17)])).toBe(17);
    expect(maxTestCount([])).toBe(0);
  });

  it('detects whether there is anything to analyse', () => {
    expect(lotHasTestValues([wafer('W01', 10, 5)])).toBe(true);
    expect(lotHasTestValues([wafer('W01', 10, 0)])).toBe(false);
    expect(lotHasTestValues([])).toBe(false);
  });

  it('states a duration coarsely rather than claiming false precision', () => {
    expect(describeDuration(355)).toBe('about 400ms');
    expect(describeDuration(1917)).toBe('about 1.9s');
    expect(describeDuration(6656)).toBe('about 7s');
    expect(describeDuration(9689)).toBe('about 10s');
    expect(describeDuration(23_000)).toBe('about 25s');
    // Never rounds a real wait down to nothing.
    expect(describeDuration(20)).toBe('about 100ms');
  });
});
