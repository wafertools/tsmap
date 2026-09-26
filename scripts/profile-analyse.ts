// tsmap's load-time pass, as the profilers run it: `buildWaferMap` +
// `analyzeWaferMap` per wafer, then `analyzeWaferLot`. No DOM, so the WebKit
// profiler can run it in a worker (`profile-webkit-worker.ts`) as well as on
// the page (`profile-web-flows.ts`'s `analyse`). Keep the options in step
// with `main.ts`'s `buildLotStatsSummary`, or the profile describes something
// the app does not do.
import { toWmapTestDefs } from '../src/lib';
import type { RustParsedFile } from '../src/platform';
import { buildWaferMap } from '@wafertools/wafermap';
import type { WaferMapResult } from '@wafertools/wafermap';
import { analyzeWaferMap, analyzeWaferLot } from '@wafertools/wafermap/stats';
import type { StatsSummary, LotStatsSummary } from '@wafertools/wafermap/stats';

export type ProfileItem = WaferMapResult & { label: string; statsSummary: StatsSummary };

export const analyzeOpts = { enableTestValueAnalysis: false };

/** Runs the pass; `time`, when given, receives each phase's milliseconds. */
export function buildAndAnalyse(
  parsed: RustParsedFile,
  time?: (phase: 'build' | 'analyseWafers' | 'analyseLot', ms: number) => void,
  opts: { enableTestValueAnalysis: boolean } = analyzeOpts,
): { items: ProfileItem[]; lot: LotStatsSummary } {
  const testDefs = toWmapTestDefs(parsed.testDefs);
  const passBins = parsed.passHbins?.length ? parsed.passHbins : undefined;
  let t = performance.now();
  const lap = (phase: 'build' | 'analyseWafers' | 'analyseLot') => {
    const now = performance.now();
    time?.(phase, Math.round(now - t));
    t = now;
  };
  const maps = parsed.wafers.map(w =>
    buildWaferMap({ results: w.results, testDefs, passBins, hbinDefs: parsed.hbinDefs, sbinDefs: parsed.sbinDefs }));
  lap('build');
  const items = maps.map((map, i) =>
    ({ ...map, label: parsed.wafers[i].waferId || `W${i + 1}`, statsSummary: analyzeWaferMap(map, opts) }));
  lap('analyseWafers');
  const lot = analyzeWaferLot(items, { perWaferSummaries: items.map(i => i.statsSummary), ...opts });
  lap('analyseLot');
  return { items, lot };
}
