#!/usr/bin/env node
// Times — and optionally CPU-profiles — the app's heavy flows in real Chrome on a
// large fixture: parse, load-time analysis, gallery mount, plot-mode switches,
// the single-wafer map. See `profile-web-flows.ts` for what each flow does.
//
//   npm run profile:web                          # large.stdf, every flow, one run
//   npm run profile:web -- --fixture bench.atdf --runs 3
//   npm run profile:web -- --profile             # + top functions per flow, and
//                                                #   .cpuprofile files for DevTools
//   npm run profile:web -- --save base.json      # record a baseline
//   npm run profile:web -- --compare base.json   # and compare against it
//
// Why this exists: cost that grows with the lot is invisible in a code review
// and in a Node benchmark on a small synthetic wafer. The string die keys rebuilt
// fifteen times per wafer in wmap's analysis (32 s → 6.5 s once fixed) survived
// many reviews and showed up in the first Chrome profile of a real 266k-die lot.
// Node is not a browser either: it did not even reproduce a 2x heap difference
// that Chrome shows. Profile here, on the path the product runs.
//
// Fixtures come from $WAFERTOOLS_FIXTURES or ~/.cache/wafertools/fixtures — the
// same place as the parser's Rust benches. Chrome is $CHROME, else the system
// Chrome, else Playwright's own. Baselines are machine-specific: keep them out
// of the repo.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { argOpt, fixturePathFor, reportTimings, startProfileServer } from './lib/profile.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => argOpt(args, name, fallback);
const fixturePath = fixturePathFor(opt('fixture', 'large.stdf'), 'profile-web');
const runs = Number(opt('runs', '1'));
const profile = args.includes('--profile');
const only = opt('flows')?.split(',');
const outDir = opt('out', join(tmpdir(), 'tsmap-profile'));
const chrome = process.env.CHROME || (existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : undefined);

const { server, url } = await startProfileServer(fixturePath);

const results = [];   // one { flow: { ms, heapMB } } per run
const hotspots = {};  // flow -> [[name, ms]] from the last run
try {
  for (let run = 0; run < runs; run++) {
    const browser = await chromium.launch({
      executablePath: chrome,
      args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'],
    });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    let crashed = false;
    page.on('crash', () => { crashed = true; });
    await page.goto(url);
    await page.evaluate(async (name) => {
      const m = await import('/scripts/profile-web-flows.ts');
      await m.prepare('/__profile-fixture', name);
      window.__profileFlows = m.flows;
    }, basename(fixturePath));
    const names = await page.evaluate(() => Object.keys(window.__profileFlows));
    const cdp = await page.context().newCDPSession(page);
    if (profile) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    }
    const row = {};
    for (const flow of names) {
      if (only && !only.includes(flow)) {
        // Still run it: later flows depend on earlier ones. Just don't report it.
      }
      if (profile) await cdp.send('Profiler.start');
      let res;
      try {
        res = await page.evaluate(async (flow) => {
          const t0 = performance.now();
          await window.__profileFlows[flow]();
          const ms = performance.now() - t0;
          globalThis.gc?.(); globalThis.gc?.();
          return { ms: Math.round(ms), heapMB: Math.round(performance.memory.usedJSHeapSize / 2 ** 20) };
        }, flow);
      } catch (e) {
        res = { error: crashed ? 'tab crashed' : String(e).split('\n')[0].slice(0, 160) };
      }
      if (!res.error) res.workerMB = await parserWorkerWasmMB(page);
      if (profile) {
        const { profile: p } = await cdp.send('Profiler.stop');
        if (run === runs - 1 && (!only || only.includes(flow))) {
          mkdirSync(outDir, { recursive: true });
          writeFileSync(join(outDir, `${flow}.cpuprofile`), JSON.stringify(p));
          hotspots[flow] = topSelfTime(p, 8);
        }
      }
      if (!only || only.includes(flow)) row[flow] = res;
      if (res.error) break;
    }
    results.push(row);
    await browser.close();
  }
} finally {
  await server.close();
}

// ── Report ───────────────────────────────────────────────────────────────────

reportTimings(results, {
  fixturePath,
  browser: chrome ? 'Chrome' : 'Playwright Chromium',
  save: opt('save'),
  compare: opt('compare'),
});
for (const [flow, top] of Object.entries(hotspots)) {
  console.log(`\n${flow}: top self time`);
  for (const [name, ms] of top) console.log(`  ${`${ms} ms`.padStart(9)}  ${name}`);
}
if (profile) console.log(`\n.cpuprofile files (open in Chrome DevTools → Performance): ${outDir}`);

/**
 * WebAssembly memory held by a live parser worker, in MB; 0 when none is running.
 * The JS heap figure never includes it, and a worker kept alive after a large
 * parse held its peak (1.1 GB on large.stdf) for the whole session.
 */
async function parserWorkerWasmMB(page) {
  const worker = page.workers().find(w => /parserWorker/.test(w.url()));
  if (!worker) return 0;
  return worker.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map(e => e.name).find(n => /testdata_parser\.js/.test(n));
    if (!url) return 0;
    const exports = await (await import(url)).default();
    return Math.round(exports.memory.buffer.byteLength / 2 ** 20);
  }).catch(() => 0);
}

function topSelfTime(p, n) {
  const byId = new Map(p.nodes.map(node => [node.id, node]));
  const self = new Map();
  p.samples.forEach((id, i) => {
    const cf = byId.get(id).callFrame;
    if (cf.functionName === '(idle)') return;
    const file = cf.url.split('/').pop().split('?')[0];
    const key = `${cf.functionName || '(anonymous)'}  ${file}${file ? `:${cf.lineNumber + 1}` : ''}`;
    self.set(key, (self.get(key) ?? 0) + (p.timeDeltas[i] ?? 0));
  });
  return [...self].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => [k, Math.round(us / 1000)]);
}
