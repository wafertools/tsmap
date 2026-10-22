/**
 * Captures the screenshots for the training course decks (docs/training/).
 *
 * Each session has one scenario, scripts/training/NN-slug.mjs, that drives the
 * real web build through stateful beats exactly as scripts/run-scenario.mjs
 * does: strict mode (no silent no-ops), no cosmetic layout changes, and checks
 * that assert the app is on the screen the beat expects. Each beat then writes
 * one or more named PNGs, with callouts (scripts/lib/steps.mjs `callout`) drawn
 * from the live layout just before the capture and removed straight after.
 *
 * A broken selector, a missing callout target, a failed check or a crop target
 * that has gone stops the session at that beat, names the beat and the step,
 * saves demo/training/FAILURE-<session>-<beat>.png, and exits non-zero. A
 * session's images are written to a scratch folder and only replace
 * docs/training/images/NN/ once every beat has passed, so a failed run never
 * leaves a mix of old and new screenshots behind.
 *
 * Usage:
 *   npm run demo:build                 # once: the web app in dist/ (works while wmap is linked)
 *   npm run training:shots             # every session
 *   npm run training:shots -- --only 01        # one session (or a comma list: 00,01)
 *   npm run training:shots -- --list           # sessions, beats and shot names
 *
 * CHROME_PATH picks the browser binary; HEADED=1 shows the window (see browser.mjs).
 */

import { existsSync, mkdirSync, readdirSync, rmSync, mkdtempSync, cpSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { pathToFileURL } from 'url';
import { DIST, ROOT } from './lib/paths.mjs';
import { startServer } from './lib/server.mjs';
import { launchBrowser, newCapturePage } from './lib/browser.mjs';
import { runSetup, removeTempDirs, resolveFrame } from './lib/steps.mjs';
import { runChecks } from './lib/checks.mjs';

const SCENARIO_DIR = join(ROOT, 'scripts', 'training');
const IMAGES_DIR = join(ROOT, 'docs', 'training', 'images');
const FAILURE_DIR = join(ROOT, 'demo', 'training');

async function loadScenarios(only = null) {
  const files = readdirSync(SCENARIO_DIR).filter((f) => /^\d\d-[\w-]+\.mjs$/.test(f)).sort();
  const out = [];
  for (const f of files) {
    const session = f.slice(0, 2);
    if (only && !only.includes(session)) continue;
    const { scenario } = await import(pathToFileURL(join(SCENARIO_DIR, f)).href);
    if (scenario.session !== session) throw new Error(`${f}: scenario.session is "${scenario.session}", expected "${session}"`);
    const names = new Set();
    for (const beat of scenario.beats) {
      for (const shot of beat.shots ?? []) {
        if (!/^[a-z0-9][a-z0-9-]*$/.test(shot.name)) throw new Error(`${f}: beat ${beat.id}: shot name "${shot.name}" must be lower-case kebab-case`);
        if (names.has(shot.name)) throw new Error(`${f}: shot name "${shot.name}" is used twice`);
        names.add(shot.name);
      }
    }
    out.push({ file: f, scenario });
  }
  return out;
}

/** The screenshot clip for a shot: the frame of its `clip` target plus padding, kept inside the viewport. */
async function clipFor(page, clip) {
  if (!clip) return undefined;
  const spec = typeof clip === 'string' ? { target: clip } : clip;
  // A fixed rectangle, for a region with no element of its own (a menu and the button it hangs from).
  if (spec.rect) return spec.rect;
  const box = await resolveFrame(page, spec.target, spec, 'clip');
  const pad = spec.pad ?? 12;
  const vp = page.viewportSize();
  const x = Math.max(0, Math.floor(box.x - pad));
  const y = Math.max(0, Math.floor(box.y - pad));
  // maxWidth keeps only the left part of a wide frame, so a long strip stays legible on a slide.
  const right = Math.min(vp.width, Math.ceil(box.x + Math.min(box.width, spec.maxWidth ?? Infinity) + pad));
  // maxHeight keeps only the top part of a tall frame, so a long panel can be shown larger.
  const bottom = Math.min(vp.height, Math.ceil(box.y + Math.min(box.height, spec.maxHeight ?? Infinity) + pad));
  return { x, y, width: right - x, height: bottom - y };
}

async function takeShot(page, shot, dir) {
  const steps = (shot.callouts ?? []).map(([target, opts]) => ['callout', target, opts ?? {}]);
  try {
    await runSetup(page, steps, '', { strict: true, allowCosmetic: false });
    const clip = await clipFor(page, shot.clip);
    await page.screenshot({ path: join(dir, `${shot.name}.png`), clip });
  } finally {
    await runSetup(page, [['clearCallouts']], '', {});
  }
}

async function runSession(browser, base, { file, scenario }) {
  console.log(`\n▸ Session ${scenario.session} — ${scenario.title}  (scripts/training/${file})\n`);
  const outDir = mkdtempSync(join(tmpdir(), `tsmap-training-${scenario.session}-`));
  const { ctx, page, diagnostics } = await newCapturePage(browser, {
    viewport: scenario.viewport ?? { width: 1280, height: 720 },
    deviceScaleFactor: scenario.deviceScaleFactor ?? 1.5,
    collectDiagnostics: true,
  });
  const scratchDirs = [];
  let failure = null;
  let shots = 0;
  try {
    // A scenario may name a colour theme; it is stored where the app reads it, before the page loads.
    if (scenario.theme) await page.addInitScript((t) => { try { localStorage.setItem('tsmap:theme', t); } catch { /* ignore */ } }, scenario.theme);
    await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 30_000 });
    for (const beat of scenario.beats) {
      const t0 = Date.now();
      console.log(`  ${beat.id.padEnd(26)} ${beat.title}`);
      try {
        await runSetup(page, beat.steps ?? [], base, { strict: true, allowCosmetic: false, tempDirs: scratchDirs });
      } catch (e) {
        failure = { beat, what: `step ${e.failedStep?.index ?? '?'} [${e.failedStep?.name ?? '?'}]`, message: e.cause?.message ?? e.message };
        break;
      }
      const results = beat.checks?.length ? await runChecks(page, beat.checks) : [];
      for (const c of results) {
        console.log(`      ${c.passed ? '✓' : '✗'} ${c.describe}` +
          (c.passed ? '' : `\n        got: ${JSON.stringify(c.actual)}${c.error ? ` error: ${c.error}` : ''}`));
      }
      const failed = results.find((c) => !c.passed);
      if (failed) { failure = { beat, what: `check "${failed.name}"`, message: failed.describe }; break; }
      for (const shot of beat.shots ?? []) {
        try {
          await takeShot(page, shot, outDir);
          shots++;
          console.log(`      ▣ ${scenario.session}/${shot.name}.png`);
        } catch (e) {
          failure = { beat, what: `shot "${shot.name}"`, message: e.cause?.message ?? e.message };
          break;
        }
      }
      if (failure) break;
      console.log(`    ${Date.now() - t0}ms`);
    }
  } catch (e) {
    failure = { beat: { id: '(page)' }, what: 'setup', message: e instanceof Error ? e.message : String(e) };
  }

  if (failure) {
    mkdirSync(FAILURE_DIR, { recursive: true });
    const shotPath = join(FAILURE_DIR, `FAILURE-${scenario.session}-${failure.beat.id}.png`);
    await page.screenshot({ path: shotPath }).catch(() => {});
    console.error(`\n  ✗  session ${scenario.session}, beat ${failure.beat.id}: ${failure.what} failed — ${failure.message}`);
    console.error(`     page at the failure: ${shotPath}`);
    console.error('  --- console (last 15) ---');
    for (const c of diagnostics.console.slice(-15)) console.error(`  [${c.type}] ${c.text}`);
    for (const e of diagnostics.pageerror) console.error(`  [pageerror] ${e}`);
    rmSync(outDir, { recursive: true, force: true });
  } else {
    const dest = join(IMAGES_DIR, scenario.session);
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(IMAGES_DIR, { recursive: true });
    // A copy, not a rename: the scratch folder is usually on another filesystem.
    cpSync(outDir, dest, { recursive: true });
    rmSync(outDir, { recursive: true, force: true });
    console.log(`\n  ✓ session ${scenario.session}: ${shots} screenshots → docs/training/images/${scenario.session}/`);
  }
  await ctx.close().catch(() => {});
  await removeTempDirs(scratchDirs);
  return !failure;
}

async function main() {
  const args = process.argv.slice(2);
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx !== -1 ? (args[onlyIdx + 1] ?? '').split(',').map((s) => s.trim().padStart(2, '0')) : null;
  const sessions = await loadScenarios(only);
  if (sessions.length === 0) {
    console.error(`\n✗  no training scenario matches ${only ? `--only ${only.join(',')}` : 'scripts/training/NN-*.mjs'}\n`);
    process.exit(1);
  }

  if (args.includes('--list')) {
    for (const { file, scenario } of sessions) {
      console.log(`\n${scenario.session}  ${scenario.title}  (scripts/training/${file})`);
      for (const beat of scenario.beats) {
        const names = (beat.shots ?? []).map((s) => s.name).join(', ');
        console.log(`    ${beat.id.padEnd(26)} ${names}`);
      }
    }
    console.log('');
    return;
  }

  if (!existsSync(DIST)) {
    console.error('\n✗  dist/ not found. Run: npm run demo:build\n');
    process.exit(1);
  }

  const { server, port } = await startServer();
  const browser = await launchBrowser();
  let ok = true;
  try {
    for (const s of sessions) ok = (await runSession(browser, `http://127.0.0.1:${port}`, s)) && ok;
  } finally {
    await browser.close();
    server.close();
  }
  console.log(ok ? '\n✓ training screenshots complete\n' : '\n✗ training screenshots failed — see the beat named above\n');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
