/**
 * Chromium launch + page setup shared by the screenshot harness and the
 * scenario runner. See server.mjs for the extraction rationale.
 */

import { chromium } from 'playwright';

/**
 * CHROME_PATH: fall back to a system Chrome when Playwright's bundled
 * Chromium isn't installed/supported (e.g. CHROME_PATH=/usr/bin/google-chrome).
 * HEADED=1: launch with a visible window (needs a real display — DISPLAY
 * must be set) instead of headless, so a human can watch the run happen.
 * SLOWMO: extra ms Playwright pauses before each action — only meaningful
 * headed; defaults to 250ms when HEADED is set so clicks are followable
 * rather than instant, 0 otherwise. Override with an explicit value either way.
 */
export async function launchBrowser() {
  const headed = process.env.HEADED === '1';
  const slowMo = process.env.SLOWMO !== undefined ? Number(process.env.SLOWMO) : (headed ? 250 : 0);
  return chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    headless: !headed,
    slowMo,
  });
}

/**
 * Opens a context+page wired the way this harness needs:
 *  - window.confirm() in headless Chromium returns false; auto-accept so the
 *    "bin data only" confirmation in showTestSelectorOverlay doesn't block.
 *  - deviceScaleFactor is a real contract with build-user-guide.mjs (which
 *    halves PNG dimensions on read) — screenshot captures pass 2, the
 *    scenario runner passes 1. Never hardcode it here.
 *  - collectDiagnostics: screenshot captures swallow console/pageerror
 *    (matches long-standing behaviour, keeps `docs/images` output quiet);
 *    the scenario runner wants them recorded so a beat failure can be
 *    diagnosed from more than a stack trace.
 */
export async function newCapturePage(browser, { viewport, deviceScaleFactor = 1, collectDiagnostics = false } = {}) {
  const ctx = await browser.newContext({
    viewport: viewport ?? { width: 1280, height: 800 },
    deviceScaleFactor,
  });
  const page = await ctx.newPage();

  const diagnostics = { console: [], pageerror: [] };
  if (collectDiagnostics) {
    page.on('console', (msg) => diagnostics.console.push({ type: msg.type(), text: msg.text() }));
    page.on('pageerror', (err) => diagnostics.pageerror.push(String(err && err.message ? err.message : err)));
  } else {
    page.on('console', () => {});
    page.on('pageerror', () => {});
  }
  page.on('dialog', (d) => d.accept());

  return { ctx, page, diagnostics };
}
