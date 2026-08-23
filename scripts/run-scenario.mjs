/**
 * Runs a scripted investigation scenario against the real tsmap web build —
 * scripts/scenarios/edge-corner-lot.mjs is the first (and, as of this writing,
 * only) one. One long-lived browser page progresses through the scenario's
 * `beats` in order; each beat's steps run through the shared harness
 * (scripts/lib/steps.mjs) in strict mode (no cosmetic mutations, no silent
 * no-ops), then its `checks` assert real values — file counts, canvas
 * counts, menu contents — not just "an element appeared".
 *
 * On the first failed step or check, the run STOPS — a later beat can't
 * sensibly run against undefined app state — and reports exactly which beat
 * and which check/step failed, with console/page-error diagnostics and a
 * failure screenshot. This is deliberately unlike capture-screenshots.mjs's
 * per-target isolation: an investigation is stateful, so beats are not
 * independent.
 *
 * Usage:
 *   npm run demo:data     # generate testdata/edge-corner-lot/ (gitignored)
 *   npm run demo:build    # predev guards only — NOT prebuild:web, see below
 *   npm run demo:test     # = node scripts/run-scenario.mjs
 *
 * demo:build deliberately runs only the predev guards (mirrors
 * build:site:dev's own trick) so this works while wmap is linked to
 * ../wafermap for local wmap development — but that means its dist/ can
 * embed an unpublished wmap and must never be deployed. A real release
 * build (`npm run build:web`) works fine here too once wmap is unlinked and
 * published; demo:build only exists for the linked-development case.
 */

import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { DIST, ROOT } from './lib/paths.mjs';
import { startServer } from './lib/server.mjs';
import { launchBrowser, newCapturePage } from './lib/browser.mjs';
import { runSetup } from './lib/steps.mjs';
import { scenario } from './scenarios/edge-corner-lot.mjs';

const SHOTS_DIR = join(ROOT, 'demo', 'screenshots');

async function runChecks(page, checks) {
  const results = [];
  for (const check of checks) {
    let actual, error;
    try {
      actual = await check.get(page);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const passed = error === undefined && (() => {
      try { return !!check.expect(actual); } catch (e) { error = e instanceof Error ? e.message : String(e); return false; }
    })();
    results.push({ name: check.name, describe: check.describe, passed, actual, error });
  }
  return results;
}

async function main() {
  if (!existsSync(DIST)) {
    console.error('\n✗  dist/ not found. Run: npm run demo:build\n');
    process.exit(1);
  }
  mkdirSync(SHOTS_DIR, { recursive: true });

  console.log(`\n▸ Scenario: ${scenario.name}\n`);

  if (scenario.preflight) {
    try {
      const info = await scenario.preflight();
      console.log(`  preflight ✓  ${JSON.stringify(info)}\n`);
    } catch (e) {
      console.error(`  preflight ✗  ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    }
  }

  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}`;
  const browser = await launchBrowser();
  const { ctx, page, diagnostics } = await newCapturePage(browser, {
    viewport: scenario.viewport ?? { width: 1400, height: 900 },
    deviceScaleFactor: 1, // not a docs-image capture — no build-user-guide.mjs contract to satisfy
    collectDiagnostics: true,
  });

  let exitCode = 0;
  try {
    await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 30_000 });

    for (const beat of scenario.beats) {
      const t0 = Date.now();
      process.stdout.write(`  ${beat.id.padEnd(24)} ${beat.title}\n`);

      let stepResults = [];
      let stepError = null;
      if (beat.steps?.length) {
        try {
          stepResults = await runSetup(page, beat.steps, base, { strict: true, allowCosmetic: false });
        } catch (e) {
          stepError = e;
          stepResults = e.stepResults ?? [];
        }
      }

      if (stepError) {
        console.error(`\n  ✗  ${beat.id} failed at step ${stepError.failedStep?.index ?? '?'} ` +
          `[${stepError.failedStep?.name ?? '?'}]: ${stepError.cause?.message ?? stepError.message}\n`);
        exitCode = 1;
      } else {
        const checkResults = beat.checks?.length ? await runChecks(page, beat.checks) : [];
        const failed = checkResults.filter(c => !c.passed);
        for (const c of checkResults) {
          console.log(`      ${c.passed ? '✓' : '✗'} ${c.name} — ${c.describe}` +
            (c.passed ? '' : `\n        expected: (predicate) got: ${JSON.stringify(c.actual)}${c.error ? ` error: ${c.error}` : ''}`));
        }
        if (failed.length > 0) exitCode = 1;

        if (beat.shot && exitCode === 0) {
          await page.screenshot({ path: join(SHOTS_DIR, `${beat.shot}.png`) }).catch(() => {});
        }
        console.log(`    ${Date.now() - t0}ms\n`);
      }

      if (exitCode !== 0) {
        await page.screenshot({ path: join(SHOTS_DIR, `FAILURE-${beat.id}.png`) }).catch(() => {});
        console.error(`  --- console (last 20) ---`);
        for (const c of diagnostics.console.slice(-20)) console.error(`  [${c.type}] ${c.text}`);
        console.error(`  --- page errors ---`);
        for (const e of diagnostics.pageerror) console.error(`  ${e}`);
        break;
      }
    }
  } catch (err) {
    console.error('\nUnexpected failure:', err);
    exitCode = 1;
  } finally {
    if (process.env.HEADED === '1') {
      // Leave the window open so the final state (or the failure state) is
      // actually visible — closing immediately would defeat the point of
      // running headed. Waits for the user to close the browser window
      // themselves (or Ctrl+C the process).
      console.log('\n  HEADED=1 — browser window left open. Close it (or Ctrl+C) to finish.\n');
      await new Promise((resolve) => browser.on('disconnected', resolve));
    } else {
      await ctx.close().catch(() => {});
      await browser.close();
    }
    server.close();
  }

  console.log(exitCode === 0 ? '\n✓ scenario complete\n' : '\n✗ scenario failed\n');
  process.exit(exitCode);
}

main().catch(err => { console.error(err); process.exit(1); });
