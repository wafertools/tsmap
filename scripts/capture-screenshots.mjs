/**
 * Captures screenshots of the tsmap web app for use in the user guide.
 *
 * The reusable half of this file (static server, browser/page setup, file
 * injection, the declarative setup-step vocabulary) now lives in
 * scripts/lib/ — shared with scripts/run-scenario.mjs. This file keeps only
 * the screenshot-specific main loop and CLI. See scripts/lib/steps.mjs's
 * header for the step vocabulary reference and the allowCosmetic/strict
 * flags (this script keeps the historical lenient/cosmetic-allowed defaults
 * so none of the existing capture-definitions.mjs targets change behaviour).
 *
 * Usage:
 *   node scripts/capture-screenshots.mjs
 *   node scripts/capture-screenshots.mjs --only loading     # run a named group
 *   node scripts/capture-screenshots.mjs --only empty-state # run a single image by file name
 *   node scripts/capture-screenshots.mjs --list             # print all capture targets
 *
 * The script:
 *   1. Starts a local static file server serving the built dist/ directory
 *   2. Opens the app in headless Chromium
 *   3. For captures that need data, injects a file via DataTransfer drop simulation
 *   4. Runs the declarative setup step sequence
 *   5. Screenshots the target element (or full viewport)
 *   6. Saves to docs/images/<name>.png
 *
 * Prerequisites:
 *   npm run build:web          — builds the app to dist/
 *   npm run screenshots:data   — generates demo STDF/CSV files in testdata/
 *
 * NOTE ../wafermap/scripts/capture-screenshots.mjs is the same kind of
 * harness (static server + headless Chromium + a setup-step vocabulary)
 * pointed at a different app. Extracting a harness shared *across* the two
 * repos is a separate, unstarted job. scripts/lib/ here only
 * de-duplicates the two *tsmap-internal* consumers of this harness
 * (screenshot capture and the scenario runner).
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { DIST, ROOT } from './lib/paths.mjs';
import { startServer } from './lib/server.mjs';
import { launchBrowser, newCapturePage } from './lib/browser.mjs';
import { runSetup } from './lib/steps.mjs';
import { CAPTURES } from './capture-definitions.mjs';

const OUT_IMAGES = join(ROOT, 'docs', 'images');

async function main() {
  if (!existsSync(DIST)) {
    console.error('\n✗  dist/ not found. Run: npm run build:web\n');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const listOnly  = args.includes('--list');
  const onlyIdx   = args.indexOf('--only');
  const onlyVal   = onlyIdx !== -1 ? args[onlyIdx + 1] : null;

  const targets = onlyVal
    ? CAPTURES.filter(c => c.group === onlyVal || c.file === onlyVal)
    : CAPTURES;

  if (listOnly) {
    console.log('\nCapture targets:\n');
    for (const c of CAPTURES) {
      console.log(`  [${c.group.padEnd(12)}]  ${(c.file + '.png').padEnd(26)}  ${c.description ?? ''}`);
    }
    console.log(`\n${CAPTURES.length} total\n`);
    return;
  }

  if (targets.length === 0) {
    console.error(`No targets matched "${onlyVal}". Use --list to see groups and file names.`);
    process.exit(1);
  }

  console.log(`\n▸ Capturing ${targets.length} screenshot(s)${onlyVal ? ` (--only ${onlyVal})` : ''}…\n`);

  const { server, port } = await startServer();
  const base = `http://127.0.0.1:${port}`;
  const browser = await launchBrowser();

  let ok = 0, fail = 0;

  try {
    for (const cap of targets) {
      const outFile = join(OUT_IMAGES, cap.file + '.png');
      const label = cap.file + '.png';
      process.stdout.write(`  ${label.padEnd(28)} `);

      let ctx;
      try {
        const opened = await newCapturePage(browser, {
          viewport: cap.viewport ?? { width: 1280, height: 800 },
          deviceScaleFactor: 2, // contract with build-user-guide.mjs, which halves PNG dims on read
        });
        ctx = opened.ctx;
        const page = opened.page;

        await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 30_000 });

        if (cap.wait) await page.waitForTimeout(cap.wait);
        // Historical defaults: allowCosmetic true, strict false — unchanged
        // behaviour for all 24 existing capture targets.
        if (cap.setup) await runSetup(page, cap.setup, base);

        if (cap.screenshotFn) {
          await cap.screenshotFn(page, outFile, base);
        } else if (cap.selector) {
          const el = await page.$(cap.selector);
          if (!el) throw new Error(`selector not found: ${cap.selector}`);
          await el.screenshot({ path: outFile });
        } else {
          await page.screenshot({ path: outFile, fullPage: cap.fullPage ?? false });
        }

        await ctx.close();
        console.log('✓');
        ok++;
      } catch (err) {
        if (ctx) await ctx.close().catch(() => {});
        console.log(`✗  ${err.message}`);
        fail++;
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${ok} captured, ${fail} failed — saved to docs/images/\n`);
  if (fail > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
