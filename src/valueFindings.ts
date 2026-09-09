import type { WaferData } from './types';

/**
 * Cost model and phrasing for wmap's regional test-value analysis
 * (`enableTestValueAnalysis`), which tsmap runs unprompted when it is cheap and
 * offers explicitly when it is not.
 *
 * Split out of `main.ts` so the decision that governs it is testable on its own:
 * it is the thing standing between a user and a whole category of findings, and
 * an off-by-a-factor coefficient here either makes the app pause for ten seconds
 * with no warning or hides the analysis from lots that could have had it free.
 */

/**
 * Measured at ~1.2µs per (wafer × die × test) on the reference machine —
 * benchmarked across 5–25 wafers, 10.7k dies and 30–100 tests, where the pass
 * ran 1.9s / 6.7s / 9.7s against a 0.3–1.4s baseline. wmap documents it as
 * scaling with regions × tests × dies, a linear scan, so one coefficient tracks
 * it closely enough to answer "instant or not". It is not a progress bar and
 * does not need to be one; the only decision it feeds is a single threshold.
 */
export const VALUE_FINDINGS_US_PER_DIE_TEST = 1.2;

/**
 * How long the analysis may take before we stop running it unprompted. Below
 * this it is imperceptible beside the parse and render that just happened, so
 * asking would be pure friction; above it the wait is long enough that it has
 * to be the user's call, with the price shown.
 */
export const VALUE_FINDINGS_AUTO_BUDGET_MS = 1000;

/** The largest per-die test count on any wafer — the multiplier in the cost. */
export function maxTestCount(wafers: WaferData[]): number {
  let most = 0;
  for (const w of wafers) {
    for (const d of w.results) {
      const n = d.testValues ? Object.keys(d.testValues).length : 0;
      if (n > most) most = n;
    }
  }
  return most;
}

/** Rough cost of the regional test-value pass over `wafers`, in ms. */
export function estimateValueFindingsMs(wafers: WaferData[]): number {
  let dieTests = 0;
  for (const w of wafers) {
    let tests = 0;
    for (const d of w.results) {
      const n = d.testValues ? Object.keys(d.testValues).length : 0;
      if (n > tests) tests = n;
    }
    dieTests += w.results.length * tests;
  }
  return (dieTests * VALUE_FINDINGS_US_PER_DIE_TEST) / 1000;
}

/** True when any die anywhere in the lot carries a test value to analyse. */
export function lotHasTestValues(wafers: WaferData[]): boolean {
  return wafers.some(w => w.results.some(d => d.testValues && Object.keys(d.testValues).length > 0));
}

/**
 * "about 400ms" / "about 2.5s" / "about 10s" — a duration the reader can act
 * on. Deliberately coarse and deliberately hedged: the estimate is a linear
 * model, and printing "9,687ms" would claim a precision it does not have.
 */
export function describeDuration(ms: number): string {
  if (ms < 1000) return `about ${Math.max(1, Math.round(ms / 100)) * 100}ms`;
  if (ms < 10_000) return `about ${(ms / 1000).toFixed(ms < 3000 ? 1 : 0)}s`;
  return `about ${Math.round(ms / 5000) * 5}s`;
}
