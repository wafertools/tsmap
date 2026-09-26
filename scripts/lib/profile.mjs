/**
 * What `profile-web.mjs` (Chrome) and `profile-webkit.mjs` (WebKitGTK) share:
 * the fixture, the dev server that streams it, and the timing report with its
 * `--save` / `--compare` baselines. The flows themselves are one module,
 * `scripts/profile-web-flows.ts`, run in whichever browser.
 */
import { createServer } from 'vite';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { basename, join } from 'path';
import { ROOT } from './paths.mjs';

/** `--name value` from argv, or `fallback`. */
export function argOpt(args, name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1];
}

/**
 * Fixtures come from $WAFERTOOLS_FIXTURES or ~/.cache/wafertools/fixtures, the
 * same place as the parser's Rust benches. Exits when the file is missing.
 */
export function fixturePathFor(name, tool) {
  const dir = process.env.WAFERTOOLS_FIXTURES || join(homedir(), '.cache', 'wafertools', 'fixtures');
  const path = join(dir, basename(name));
  if (!existsSync(path)) {
    console.error(`${tool}: ${path} not found (set WAFERTOOLS_FIXTURES, or pass --fixture <name>).`);
    process.exit(1);
  }
  return path;
}

/**
 * The Vite dev server over the repo, plus `/__profile-fixture` streaming the
 * fixture from disk. The page fetches it itself: handing a browser driver a
 * 341 MB body kills the browser (Playwright sends it over the DevTools
 * protocol as base64). `routes` adds more middleware, `{ path: handler }`.
 * Dependencies are re-bundled on every start: a stale pre-bundle left from
 * before a `wmap:link` profiles the published, minified wmap.
 */
export async function startProfileServer(fixturePath, routes = {}) {
  const server = await createServer({
    root: ROOT,
    logLevel: 'error',
    server: { port: 0, strictPort: false },
    optimizeDeps: { force: true },
    plugins: [{
      name: 'profile-fixture',
      configureServer(s) {
        s.middlewares.use('/__profile-fixture', (_req, res) => {
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Length', String(statSync(fixturePath).size));
          createReadStream(fixturePath).pipe(res);
        });
        for (const [path, handler] of Object.entries(routes)) s.middlewares.use(path, handler);
      },
    }],
  });
  await server.listen();
  return { server, url: server.resolvedUrls.local[0] };
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

/**
 * Prints the per-flow medians over `results` (one `{ flow: { ms, heapMB?,
 * workerMB?, error? } }` per run) against an optional baseline, and saves them
 * when asked. Columns a browser cannot measure (WebKit has no heap figure) are
 * left out rather than shown as zero.
 */
export function reportTimings(results, { fixturePath, browser, save, compare }) {
  const flows = Object.keys(results[0] ?? {});
  const summary = {};
  for (const flow of flows) {
    const ok = results.map(r => r[flow]).filter(r => r && !r.error);
    const pick = (key) => ok.some(r => r[key] !== undefined) ? median(ok.map(r => r[key])) : undefined;
    summary[flow] = ok.length
      ? { ms: pick('ms'), heapMB: pick('heapMB'), workerMB: pick('workerMB') }
      : { error: results.map(r => r[flow]?.error).find(Boolean) ?? 'not run' };
  }
  const baseline = compare ? JSON.parse(readFileSync(compare, 'utf8')).flows : undefined;
  const delta = (now, then) => {
    if (then === undefined || now === undefined) return '';
    const pct = then === 0 ? 0 : Math.round(((now - then) / then) * 100);
    return ` (${pct >= 0 ? '+' : ''}${pct}%)`;
  };
  const cols = [
    ['time', 'ms', 'ms', 10],
    ['heap after', 'heapMB', 'MB', 12],
    ['worker wasm', 'workerMB', 'MB', 13],
  ].filter(([, key]) => Object.values(summary).some(s => s[key] !== undefined));

  const runs = results.length;
  console.log(`\n${basename(fixturePath)} in ${browser}: ${runs} run${runs === 1 ? '' : 's'}, median\n`);
  console.log('flow'.padEnd(18) + cols.map(([title, , , w]) => title.padStart(w) + ''.padEnd(9)).join(''));
  for (const flow of flows) {
    const s = summary[flow];
    if (s.error) { console.log(`${flow.padEnd(18)}  ${s.error}`); continue; }
    console.log(flow.padEnd(18) + cols.map(([, key, unit, w]) =>
      (s[key] === undefined ? '' : `${s[key]} ${unit}`).padStart(w) + delta(s[key], baseline?.[flow]?.[key]).padEnd(9)).join(''));
  }
  if (save) {
    writeFileSync(save, JSON.stringify({ fixture: basename(fixturePath), browser, runs, date: new Date().toISOString(), flows: summary }, null, 2) + '\n');
    console.log(`\nbaseline saved: ${save}`);
  }
}
