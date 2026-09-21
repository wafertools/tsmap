#!/usr/bin/env node
/**
 * Exact per-object heap cost of a parsed die, measured in real Chrome.
 *
 * WHEN TO REACH FOR THIS
 * ----------------------
 * Any question of the form "why is this object expensive?". Do NOT answer that
 * from `performance.memory`: a whole-heap delta before and after building a
 * graph will happily support a confident wrong answer, and did three times on
 * 2026-09-20 (see `CLAUDE_HANDOFF.md` §5 #14). A heap snapshot gives the real
 * byte size of an object and of its elements backing store, which is what
 * actually settles it.
 *
 * WHAT IT REPORTS
 * ---------------
 * For one parsed die it compares, side by side:
 *   - `testValues` as the parser produced it
 *   - the same keys/values rebuilt as a plain object literal
 *   - the same values under dense keys 0..T-1  (what interning would give)
 *   - `testPass` as the parser produced it
 * plus the V8 elements kind of each, so the size and the representation are
 * read from the same run and cannot drift apart.
 *
 * Background: a die's readings are a plain object keyed by test number, and
 * integer-like keys are ARRAY INDICES to V8, not hash keys — so the container
 * is a contiguous store, a dictionary, or a packed array depending on the key
 * set AND the insertion path. Two files with identical test numbers have been
 * observed 3.9x apart. See `WMAP_ISSUES.md` #64 and `COLUMNAR_DATA.md` §11.
 *
 * USAGE
 * -----
 *   node scripts/heap-probe.mjs                          # bench.stdf
 *   node scripts/heap-probe.mjs large.stdf
 *   node scripts/heap-probe.mjs bench.csv --tests 50 --test-base 20000
 *
 * Fixture names resolve inside the fixture dir (see scripts/fixture_paths.py).
 * Needs the WASM parser built at packages/parsers/pkg and system Chrome at
 * /opt/google/chrome/chrome (Playwright's own browsers are not installed).
 *
 * TWO TRAPS THIS SCRIPT ALREADY AVOIDS — keep them if you edit it:
 *  1. A snapshot of a multi-GB heap exceeds V8's max string length when the
 *     CDP chunks are concatenated in JS. So the page DROPS the parse graph and
 *     keeps only the handful of objects under study; an object's representation
 *     does not change when the rest of the heap is freed.
 *  2. Release Chrome's %DebugPrint prints only a one-line summary — no capacity.
 *     The snapshot is the only release-build source for backing-store bytes.
 */

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const PKG = path.join(REPO, 'packages', 'parsers', 'pkg');
const CHROME = process.env.CHROME_PATH || '/opt/google/chrome/chrome';
const PORT = Number(process.env.HEAP_PROBE_PORT || 8151);

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? dflt : argv[i + 1];
};
const fixture = argv.find(a => !a.startsWith('--') && argv[argv.indexOf(a) - 1]?.startsWith('--') !== true)
  || 'bench.stdf';
const tests = Number(flag('tests', 50));
const testBase = Number(flag('test-base', 20000));

// The fixture dir is owned by fixture_paths.py — ask it rather than restating it.
const fixtureDir = execFileSync('python3', [path.join(HERE, 'fixture_paths.py')], { encoding: 'utf8' }).trim();
const fixturePath = path.join(fixtureDir, fixture);
if (!fs.existsSync(fixturePath)) {
  console.error(`No such fixture: ${fixturePath}\nGenerate one with scripts/generate_stdf_bench.py or generate_sweep_csv.py`);
  process.exit(1);
}
if (!fs.existsSync(path.join(PKG, 'testdata_parser.js'))) {
  console.error(`WASM parser not built at ${PKG} — run the parser build first.`);
  process.exit(1);
}
const kind = fixture.endsWith('.csv') ? 'csv' : 'stdf';

// ── the page ──────────────────────────────────────────────────────────────────
const PAGE = `<!doctype html><meta charset="utf-8"><title>heap probe</title><body><pre>probe</pre>
<script type="module">
import init, { parse_csv, parse_stdf } from './pkg/testdata_parser.js';
const mapping = (n, base) => ({
  x: 'x', y: 'y', hbin: 'hbin', sbin: 'sbin', wafer: 'wafer', lot: 'lot', site: 'site',
  tests: Array.from({ length: n }, (_, i) => ({ col: \`t\${1000 + i}\`, testNumber: base + i, name: \`t\${1000 + i}\` })),
  meta: [], splitBy: [], passBins: [1],
});
window.setup = async ({ file, kind, tests, testBase }) => {
  await init();
  const bytes = new Uint8Array(await (await fetch('fixture/' + file)).arrayBuffer());
  const parsed = kind === 'csv' ? parse_csv(bytes, mapping(tests, testBase)) : parse_stdf(bytes);
  const dies = parsed.wafers.reduce((n, w) => n + w.results.length, 0);
  const d = parsed.wafers.flatMap(w => w.results).find(x => x.testValues);
  if (!d) throw new Error('no die with testValues in this fixture');

  const rebuilt = {}; for (const k in d.testValues) rebuilt[k] = d.testValues[k];
  const dense = {}; let i = 0; for (const k in d.testValues) dense[i++] = d.testValues[k];
  window.PROBE_parsedTV = d.testValues;
  window.PROBE_rebuiltTV = rebuilt;
  window.PROBE_denseTV = dense;
  window.PROBE_parsedPass = d.testPass;

  const tvKeys = Object.keys(d.testValues).map(Number);
  const meta = {
    dies, tests: tvKeys.length,
    tvMin: Math.min(...tvKeys), tvMax: Math.max(...tvKeys),
    passKeys: d.testPass ? Object.keys(d.testPass).length : 0,
    passMax: d.testPass ? Math.max(...Object.keys(d.testPass).map(Number)) : null,
  };

  // Free everything but the probes. Representation is a property of the object,
  // not of what else is alive — see trap 1 in this script's header.
  for (const k of Object.keys(parsed)) { try { delete parsed[k]; } catch {} }
  for (let g = 0; g < 6; g++) window.gc && window.gc();
  await new Promise(r => setTimeout(r, 300));

  const N = (expr, x) => { try { return eval(expr)(x); } catch { return null; } };
  const kindOf = (o) => o == null ? null
    : N('(x)=>%HasDictionaryElements(x)', o) ? 'dictionary'
    : N('(x)=>%HasObjectElements(x)', o) ? (N('(x)=>%HasHoleyElements(x)', o) ? 'holey object elements' : 'packed object elements')
    : N('(x)=>%HasDoubleElements(x)', o) ? (N('(x)=>%HasHoleyElements(x)', o) ? 'holey doubles' : 'packed doubles')
    : N('(x)=>%HasSmiElements(x)', o) ? 'smi elements' : 'unknown';
  meta.kinds = {
    parsedTV: kindOf(window.PROBE_parsedTV),
    rebuiltTV: kindOf(window.PROBE_rebuiltTV),
    denseTV: kindOf(window.PROBE_denseTV),
    parsedPass: kindOf(window.PROBE_parsedPass),
  };
  return meta;
};
</script>`;

// ── serve pkg + fixture + page ────────────────────────────────────────────────
const TYPES = { '.js': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html' };
const srv = http.createServer((rq, rs) => {
  const url = decodeURIComponent(rq.url.split('?')[0]);
  let file = null;
  if (url === '/' || url === '/index.html') {
    rs.writeHead(200, { 'content-type': 'text/html' });
    rs.end(PAGE);
    return;
  }
  if (url.startsWith('/pkg/')) file = path.join(PKG, url.slice(5));
  else if (url.startsWith('/fixture/')) file = path.join(fixtureDir, url.slice(9));
  if (!file || !file.startsWith(path.resolve(path.dirname(file)))) { rs.writeHead(404); rs.end(); return; }
  fs.readFile(file, (e, b) => {
    if (e) { rs.writeHead(404); rs.end(); return; }
    rs.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    rs.end(b);
  });
}).listen(PORT);

// ── run ───────────────────────────────────────────────────────────────────────
const br = await chromium.launch({
  executablePath: CHROME,
  args: ['--js-flags=--expose-gc --allow-natives-syntax'],
});
const page = await br.newPage();
page.on('pageerror', e => console.error('page error:', e.message));
await page.goto(`http://127.0.0.1:${PORT}/index.html`);

console.log(`${fixture} (${kind})`);
const meta = await page.evaluate(([f, k, t, b]) => window.setup({ file: f, kind: k, tests: t, testBase: b }),
  [fixture, kind, tests, testBase]);
console.log(`  ${meta.dies.toLocaleString()} dies, ${meta.tests} tests, testValues ${meta.tvMin}..${meta.tvMax}`
  + (meta.passMax != null ? `, testPass ${meta.passKeys} keys, max ${meta.passMax}` : ''));

const cdp = await page.context().newCDPSession(page);
let chunks = '';
cdp.on('HeapProfiler.addHeapSnapshotChunk', p => { chunks += p.chunk; });
await cdp.send('HeapProfiler.enable');
await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, treatGlobalObjectsAsRoots: true });
await br.close();
srv.close();

// ── read the snapshot ─────────────────────────────────────────────────────────
const snap = JSON.parse(chunks);
const { node_fields, edge_fields, edge_types } = snap.snapshot.meta;
const NF = node_fields.length, EF = edge_fields.length;
const { nodes, edges, strings } = snap;
const F_NAME = node_fields.indexOf('name');
const F_SIZE = node_fields.indexOf('self_size');
const F_EDGES = node_fields.indexOf('edge_count');
const E_TYPE = edge_fields.indexOf('type');
const E_NAME = edge_fields.indexOf('name_or_index');
const E_TO = edge_fields.indexOf('to_node');

const nodeCount = nodes.length / NF;
const firstEdge = new Uint32Array(nodeCount);
for (let i = 0, e = 0; i < nodeCount; i++) { firstEdge[i] = e; e += nodes[i * NF + F_EDGES]; }
const nName = i => strings[nodes[i * NF + F_NAME]];
const nSize = i => nodes[i * NF + F_SIZE];
const children = (i) => {
  const out = [];
  for (let k = 0; k < nodes[i * NF + F_EDGES]; k++) {
    const e = firstEdge[i] + k;
    const t = edge_types[0][edges[e * EF + E_TYPE]];
    out.push({ type: t, name: (t === 'element' || t === 'hidden') ? String(edges[e * EF + E_NAME]) : strings[edges[e * EF + E_NAME]], node: edges[e * EF + E_TO] / NF });
  }
  return out;
};

const LABELS = {
  PROBE_parsedTV: 'testValues (parsed)',
  PROBE_rebuiltTV: 'testValues (rebuilt, same keys)',
  PROBE_denseTV: 'testValues (dense keys 0..n)',
  PROBE_parsedPass: 'testPass (parsed)',
};
const found = {};
const wanted = Object.keys(LABELS);
for (let i = 0; i < nodeCount && Object.keys(found).length < wanted.length; i++) {
  for (const c of children(i)) if (wanted.includes(c.name) && found[c.name] === undefined) found[c.name] = c.node;
}

console.log(`\n  ${'object'.padEnd(34)} ${'backing store'.padStart(14)}   representation`);
for (const key of wanted) {
  const n = found[key];
  if (n === undefined) { console.log(`  ${LABELS[key].padEnd(34)} ${'(absent)'.padStart(14)}`); continue; }
  const el = children(n).find(c => c.name === 'elements' || c.name === '(object elements)');
  const bytes = el ? nSize(el.node) : 0;
  const perTest = meta.tests ? (bytes / meta.tests).toFixed(0) : '-';
  const kindName = meta.kinds[key.replace('PROBE_', '')] ?? '';
  console.log(`  ${LABELS[key].padEnd(34)} ${(bytes + ' B').padStart(14)}   ${kindName}  (${perTest} B/test)`);
}
console.log(`\n  payload floor for ${meta.tests} f64: ${meta.tests * 8} B\n`);
