#!/usr/bin/env node
// `profile:web`'s flows in WebKitGTK, the Linux desktop app's engine, which
// costs things very differently from V8: per-die key walks that V8 shrugs off
// were most of the analysis time here. The same flows module runs in the
// same Vite dev server; only the browser differs.
//
//   npm run profile:webkit                         # large.stdf, every flow, one run
//   npm run profile:webkit -- --fixture bench.atdf --runs 3
//   npm run profile:webkit -- --profile            # + JavaScriptCore's top functions
//   npm run profile:webkit -- --save base.json     # record a baseline
//   npm run profile:webkit -- --compare base.json  # and compare against it
//
// The browser is WebKitGTK's MiniBrowser ($MINIBROWSER to override); the
// WebKit inspector with JS sampling slows the app too much to measure. It has
// no automation protocol, so the page runs the flows itself and POSTs the
// timings back. It has no headless mode either: a window appears for the run.
// Its timings match the desktop app's (analysis 14.8 s against 14.2 s,
// gallery 12.8 s against 12.8 s, when measured).
//
// `--profile` enables JSC's sampling profiler (JSC_useSamplingProfiler) for a
// second launch that runs parse, decode, build and analysis in a worker:
// the profiler writes its report only when a VM is destroyed, which happens
// for a worker, not reliably for the page. The DOM flows (gallery, map) are
// timed but not profiled per function. Sampling slows the worker run (its
// analysis took about 1.5x the page's), so read its times as proportions.
//
// WebKit reports no heap figure, so there is no heap column. Fixtures and
// baselines as for `profile:web`.
import { spawn } from 'child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { argOpt, fixturePathFor, reportTimings, startProfileServer } from './lib/profile.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => argOpt(args, name, fallback);
const fixturePath = fixturePathFor(opt('fixture', 'large.stdf'), 'profile-webkit');
const runs = Number(opt('runs', '1'));
const profile = args.includes('--profile');
const top = Number(opt('top', '25'));
const TIMEOUT_MS = 600_000;

const minibrowser = process.env.MINIBROWSER ?? [
  '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser',
  '/usr/lib/x86_64-linux-gnu/webkitgtk-6.0/MiniBrowser',
  '/usr/lib/aarch64-linux-gnu/webkit2gtk-4.1/MiniBrowser',
  '/usr/libexec/webkit2gtk-4.1/MiniBrowser',
].find(existsSync);
if (!minibrowser) {
  console.error('profile-webkit: WebKitGTK MiniBrowser not found (install webkit2gtk-driver or set MINIBROWSER).');
  process.exit(1);
}

// The pages the browser opens. Each POSTs one JSON report to /__report.
const PAGES = {
  flows: `<script type=module>
    const out = {};
    try {
      const m = await import('/scripts/profile-web-flows.ts');
      await m.prepare('/__profile-fixture');
      for (const name of Object.keys(m.flows)) {
        const t = performance.now();
        try { await m.flows[name](); } catch (e) { out[name] = { error: String(e).slice(0, 160) }; break; }
        out[name] = { ms: Math.round(performance.now() - t) };
      }
    } catch (e) { out.setup = { error: String(e).slice(0, 160) }; }
    await fetch('/__report', { method: 'POST', body: JSON.stringify(out) });
  </script>`,
  worker: `<script type=module>
    const w = new Worker('/scripts/profile-webkit-worker.ts', { type: 'module' });
    const out = await new Promise(r => {
      w.onmessage = e => r(e.data);
      w.onerror = e => r({ error: String(e.message) });
    });
    // Give the closed worker's VM time to be destroyed, which writes the profile.
    await new Promise(r => setTimeout(r, 3000));
    await fetch('/__report', { method: 'POST', body: JSON.stringify(out) });
  </script>`,
};

let onReport = () => {};
const { server, url } = await startProfileServer(fixturePath, {
  '/__profile-page': (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><meta charset=utf-8><body>${PAGES[req.url.slice(1)] ?? ''}`);
  },
  '/__report': (req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => { res.end('ok'); onReport(JSON.parse(body)); });
  },
});

/** Opens `page` in a fresh MiniBrowser and resolves with what it reports. */
async function runPage(page, profileDir) {
  const report = new Promise(r => {
    onReport = r;
    setTimeout(() => r({ error: `no report after ${TIMEOUT_MS / 1000} s` }), TIMEOUT_MS).unref();
  });
  // A clean environment: the snap-packaged VS Code leaks LD_LIBRARY_PATH,
  // which breaks the system WebKit.
  const env = {
    HOME: process.env.HOME, DISPLAY: process.env.DISPLAY, WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY,
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR, PATH: '/usr/bin:/bin',
    ...(profileDir && {
      JSC_useSamplingProfiler: 'true',
      JSC_samplingProfilerPath: profileDir,
      JSC_samplingProfilerTopFunctionsCount: String(top * 2),
    }),
  };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  const mb = spawn(minibrowser, [`${url}__profile-page/${page}`], { env, stdio: 'ignore' });
  const exited = new Promise(r => mb.on('exit', r));
  const result = await report;
  mb.kill('SIGINT');
  if (!await Promise.race([exited.then(() => true), new Promise(r => setTimeout(() => r(false), 10_000).unref())])) {
    mb.kill('SIGKILL');
  }
  return result;
}

/**
 * JSC's report is plain text; its first section is
 * `Top functions as <numSamples  'functionName#hash:sourceID'>`, one line
 * each, 1 ms per sample. WebAssembly frames (the parser) are left out.
 */
function topFunctions(text) {
  const total = Number(/Total samples: (\d+)/.exec(text)?.[1] ?? 0);
  const section = text.split(/Top functions as [^\n]*\n/)[1]?.split(/\n\s*\n/)[0] ?? '';
  const rows = [...section.matchAll(/^\s*(\d+)\s+'(.*)#[^#']*:(\d+)'$/gm)]
    .map(([, n, name]) => [name || '(anonymous)', Number(n)])
    .filter(([name]) => !name.startsWith('.wasm-function'));
  return { total, rows };
}

const results = [];
let workerRun;
try {
  for (let run = 0; run < runs; run++) results.push(await runPage('flows'));
  if (profile) {
    const dir = mkdtempSync(join(tmpdir(), 'tsmap-jsc-'));
    workerRun = { timings: await runPage('worker', dir), profiles: [] };
    for (const f of readdirSync(dir)) {
      const p = topFunctions(readFileSync(join(dir, f), 'utf8'));
      if (p.total >= 100) workerRun.profiles.push(p);  // skip VMs that only loaded a module
    }
    rmSync(dir, { recursive: true, force: true });
  }
} finally {
  await server.close();
}

reportTimings(results, { fixturePath, browser: 'WebKitGTK MiniBrowser', save: opt('save'), compare: opt('compare') });

if (workerRun) {
  const t = workerRun.timings;
  console.log('\nworker run (parse, decode, build and analysis, profiled)');
  if (t.error) console.log(`  ${t.error}`);
  else console.log('  ' + Object.entries(t).map(([k, ms]) => `${k} ${ms} ms`).join(', '));
  if (!workerRun.profiles.length) console.log('  no sampling profile was written');
  for (const p of workerRun.profiles.sort((a, b) => b.total - a.total)) {
    console.log(`\nJavaScriptCore top functions, excluding WebAssembly (${p.total} samples, 1 ms each)`);
    for (const [name, n] of p.rows.slice(0, top)) console.log(`  ${`${n} ms`.padStart(9)}  ${name}`);
  }
}
process.exit(0);
