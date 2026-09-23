/**
 * File injection into the running tsmap web app.
 *
 * The app listens for a 'drop' event on document.body. Files are injected by
 * having the PAGE fetch them from the static server's /testdata/ or
 * /sample_data/ route — no bytes ever cross the CDP bridge, so large files
 * don't OOM Node.
 */

import { existsSync } from 'fs';
import { relative } from 'path';
import { TESTDATA, SAMPLEDATA } from './paths.mjs';

/** Drops a single file. filePath is absolute, under testdata/ or sample_data/. */
export async function injectFile(page, filePath, baseUrl) {
  await injectFiles(page, [filePath], baseUrl);
}

/**
 * Drops every path in filePaths as one multi-item DataTransfer — needed for
 * the "loading multiple files together" state (triggers the wafer rename
 * overlay; see multiFileUI.ts's needsRename).
 */
export async function injectFiles(page, filePaths, baseUrl) {
  const items = filePaths.map(filePath => {
    if (!existsSync(filePath)) throw new Error(`Demo data file not found: ${filePath}`);
    // fileName is what the app sees as the File's name (basename only — the
    // app has no notion of a subdirectory). The URL, separately, has to
    // preserve any subdirectory below testdata/ or sample_data/ (e.g. a
    // scenario's own testdata/edge-corner-lot/*.stdf) — server.mjs's routing
    // already joins the full relative path, so this was previously only
    // correct for files directly at the testdata/ or sample_data/ root.
    const fileName = filePath.split('/').pop();
    const underSampleData = filePath.startsWith(SAMPLEDATA);
    const urlPrefix = underSampleData ? '/sample_data/' : '/testdata/';
    const relPath = relative(underSampleData ? SAMPLEDATA : TESTDATA, filePath);
    return { fetchUrl: `${baseUrl}${urlPrefix}${relPath}`, fileName };
  });

  // Wait until the app's drop listener is registered (open-btn is present and
  // the page script has run). The listener is added synchronously in main.ts
  // on DOMContentLoaded, so waiting for networkidle (done before setup) is
  // sufficient — but add a small extra guard to avoid a race on slower machines.
  await page.waitForFunction(() => !!document.getElementById('open-btn'), { timeout: 10000 });

  await page.evaluate(async (fetchItems) => {
    const dt = new DataTransfer();
    for (const { fetchUrl, fileName } of fetchItems) {
      const resp = await fetch(fetchUrl);
      if (!resp.ok) throw new Error(`fetch failed: ${resp.status} ${fetchUrl}`);
      const blob = await resp.blob();
      dt.items.add(new File([blob], fileName));
    }
    document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, items);
}

/**
 * Clicks the "Add files" toolbar button and picks filePath via Playwright's
 * filechooser interception — unlike a drop (always a fresh load), only the
 * real button + native <input type=file> path sets main.ts's `appendOnPick`
 * flag, which is what's needed to reach the append-confirm dialog.
 */
export async function addFile(page, filePath) {
  // The app prefers showOpenFilePicker() in Chromium, but Playwright's
  // `filechooser` event only observes the hidden file input fallback. Force
  // that fallback for captures so the append path remains the real button
  // path while the harness can provide its fixture deterministically.
  await page.evaluate(() => { window.showOpenFilePicker = undefined; });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('#add-btn'),
  ]);
  await chooser.setFiles(filePath);
}
