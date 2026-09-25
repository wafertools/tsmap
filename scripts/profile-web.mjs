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
import { createServer } from 'vite';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { basename, join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1];
};
const fixture = opt('fixture', 'large.stdf');
const runs = Number(opt('runs', '1'));
const profile = args.includes('--profile');
const only = opt('flows')?.split(',');
const outDir = opt('out', join(tmpdir(), 'tsmap-profile'));
const fixtureDir = process.env.WAFERTOOLS_FIXTURES || join(homedir(), '.cache', 'wafertools', 'fixtures');
const fixturePath = join(fixtureDir, basename(fixture));
if (!existsSync(fixturePath)) {
  console.error(`profile-web: ${fixturePath} not found (set WAFERTOOLS_FIXTURES, or pass --fixture <name>).`);
  process.exit(1);
}
const chrome = process.env.CHROME || (existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : undefined);

// The dev server, plus a route streaming the fixture from disk. (Handing
// Playwright a 341 MB body to fulfil kills the browser: it crosses the
// DevTools protocol as base64.)
const server = await createServer({
  root,
  logLevel: 'error',
  server: { port: 0, strictPort: false },
  plugins: [{
    name: 'profile-web-fixture',
    configureServer(s) {
      s.middlewares.use('/__profile-fixture', (_req, res) => {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', String(statSync(fixturePath).size));
        createReadStream(fixturePath).pipe(res);
      });
    },
  }],
});
await server.listen();
const url = server.resolvedUrls.local[0];

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
    await page.evaluate(async () => {
      const m = await import('/scripts/profile-web-flows.ts');
      await m.prepare('/__profile-fixture');
      window.__profileFlows = m.flows;
    });
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

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const flows = Object.keys(results[0]);
const summary = {};
for (const flow of flows) {
  const ok = results.map(r => r[flow]).filter(r => r && !r.error);
  summary[flow] = ok.length
    ? { ms: median(ok.map(r => r.ms)), heapMB: median(ok.map(r => r.heapMB)) }
    : { error: results.map(r => r[flow]?.error).find(Boolean) ?? 'not run' };
}
const baseline = opt('compare') ? JSON.parse(readFileSync(opt('compare'), 'utf8')).flows : undefined;
const delta = (now, then) => {
  if (then === undefined || now === undefined) return '';
  const pct = then === 0 ? 0 : Math.round(((now - then) / then) * 100);
  return ` (${pct >= 0 ? '+' : ''}${pct}%)`;
};

console.log(`\n${basename(fixturePath)} — ${runs} run${runs === 1 ? '' : 's'}, median${chrome ? '' : ', Playwright Chromium'}\n`);
console.log(`${'flow'.padEnd(18)}${'time'.padStart(10)}${''.padEnd(9)}${'heap after'.padStart(12)}`);
for (const flow of flows) {
  const s = summary[flow];
  const b = baseline?.[flow];
  if (s.error) { console.log(`${flow.padEnd(18)}  ${s.error}`); continue; }
  console.log(`${flow.padEnd(18)}${`${s.ms} ms`.padStart(10)}${delta(s.ms, b?.ms).padEnd(9)}${`${s.heapMB} MB`.padStart(12)}${delta(s.heapMB, b?.heapMB)}`);
}
for (const [flow, top] of Object.entries(hotspots)) {
  console.log(`\n${flow} — top self time`);
  for (const [name, ms] of top) console.log(`  ${`${ms} ms`.padStart(9)}  ${name}`);
}
if (profile) console.log(`\n.cpuprofile files (open in Chrome DevTools → Performance): ${outDir}`);
if (opt('save')) {
  writeFileSync(opt('save'), JSON.stringify({ fixture: basename(fixturePath), runs, date: new Date().toISOString(), flows: summary }, null, 2) + '\n');
  console.log(`\nbaseline saved: ${opt('save')}`);
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
