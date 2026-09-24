/**
 * Declarative setup-step vocabulary shared by the screenshot harness
 * (scripts/capture-screenshots.mjs) and the scenario runner
 * (scripts/run-scenario.mjs). Extracted from capture-screenshots.mjs (2026-08)
 * — see server.mjs's header for the extraction rationale.
 *
 * A step is `[stepName, ...args]`; `runSetup(page, steps, baseUrl, opts)` runs
 * a sequence and returns a per-step result array `{index, name, args, ms, ok}`.
 * On failure it throws, attaching `.stepResults` (everything that succeeded
 * before the failure) and `.failedStep` to the error, so a caller can report
 * exactly which step in which beat broke.
 *
 * opts:
 *   allowCosmetic (default true)  — shrinkPanelToContent / shrinkModalToContent
 *     / showCursorOn / hideCursor deliberately break real app behaviour for a
 *     tight screenshot crop. They are meaningless — or actively misleading —
 *     in a behavioural scenario run, so passing `allowCosmetic: false` makes
 *     them throw instead of running.
 *   strict (default false)  — a handful of steps (hoverMap, hoverMapCard,
 *     openWmapDropdown, openSummaryPanel, clickFindingByText, closeSplitsDialog)
 *     historically no-op silently when their target isn't found, because a
 *     missing hover target still produces a usable (if slightly different)
 *     screenshot. A scenario run has no such tolerance — `strict: true` makes
 *     every one of these throw on a miss instead. The four Insights steps
 *     (selectInsightsTab, expandChartByTitle, setInsightsGroupBy,
 *     clickChartRowByTitle) already throw unconditionally — see their own
 *     comments — and are unaffected by this flag.
 *
 * Screenshot captures keep the historical defaults (both false→lenient,
 * cosmetic allowed) so none of the 24 existing capture-definitions.mjs
 * targets change behaviour. The scenario runner passes
 * `{ allowCosmetic: false, strict: true }`.
 */

import { injectFile, injectFiles, addFile } from './inject.mjs';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

// ─── Cursor helper (cosmetic only) ─────────────────────────────────────────

const CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="22" viewBox="0 0 18 22"><path d="M1 1 L1 18 L5.2 13.8 L8.6 21 L11 19.8 L7.6 12.5 L14 12.5 Z" fill="white" stroke="#333" stroke-width="1.2" stroke-linejoin="round"/></svg>`;

async function injectCursor(page, x, y) {
  await page.evaluate(([svg, cx, cy]) => {
    const el = document.getElementById('__fake-cursor__');
    if (el) el.remove();
    const div = document.createElement('div');
    div.id = '__fake-cursor__';
    Object.assign(div.style, { position: 'fixed', left: `${cx}px`, top: `${cy}px`, width: '18px', height: '22px', pointerEvents: 'none', zIndex: '999999' });
    div.innerHTML = svg;
    document.body.appendChild(div);
  }, [CURSOR_SVG, x, y]);
}

async function removeCursor(page) {
  await page.evaluate(() => { document.getElementById('__fake-cursor__')?.remove(); });
}

// ─── Wait helpers ───────────────────────────────────────────────────────────

export async function waitForSelector(page, selector, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = await page.$(selector);
    if (el) return el;
    await page.waitForTimeout(200);
  }
  throw new Error(`Timeout waiting for selector: ${selector}`);
}

export async function waitForWmapCanvas(page) {
  // WASM parse in headless Chromium can be slow — allow up to 60s for large files
  await waitForSelector(page, '#map-container canvas', 60000);
  // Extra settle time for wmap to finish rendering
  await page.waitForTimeout(800);
}

// ─── wmap toolbar helpers ───────────────────────────────────────────────────

export async function pinWmapToolbar(page, containerSel = '#map-container') {
  await page.evaluate((sel) => {
    const tb = document.querySelector(`${sel} [data-wmap-toolbar]`);
    if (tb) { tb.style.opacity = '1'; tb.style.visibility = 'visible'; }
  }, containerSel);
}

async function hoverMapCanvas(page, containerSel = '#map-container', strict = false) {
  const canvas = await page.$(`${containerSel} canvas`);
  if (!canvas) {
    if (strict) throw new Error(`hoverMap: no canvas found in ${containerSel}`);
    return;
  }
  const box = await canvas.boundingBox();
  if (!box) {
    if (strict) throw new Error(`hoverMap: canvas in ${containerSel} has no bounding box`);
    return;
  }
  await page.mouse.move(box.x + box.width * 0.38, box.y + box.height * 0.35);
  await page.waitForTimeout(400);
  await pinWmapToolbar(page, containerSel);
}

async function hoverMapCard(page, idx, strict = false) {
  const cards = await page.$$('#map-container canvas');
  const card = cards[idx];
  if (!card) {
    if (strict) throw new Error(`hoverMapCard: no canvas at index ${idx} (found ${cards.length})`);
    await page.waitForTimeout(400);
    return;
  }
  const box = await card.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
  } else if (strict) {
    throw new Error(`hoverMapCard: canvas at index ${idx} has no bounding box`);
  }
  await page.waitForTimeout(400);
  await pinWmapToolbar(page);
}

async function openSummaryPanel(page, containerSel = '#map-container', strict = false) {
  const status = await page.evaluate((sel) => {
    const root = document.querySelector(sel) ?? document;
    const btn = [...root.querySelectorAll('button')].find(b => b.ariaLabel === 'Summary panel');
    if (!btn) return 'not-found';
    if (btn.dataset.active) return 'already-open';
    btn.click();
    return 'opened';
  }, containerSel);
  if (status === 'not-found' && strict) {
    throw new Error(`openSummaryPanel: "Summary panel" button not found in ${containerSel}`);
  }
  await page.waitForTimeout(600);
  await hoverMapCanvas(page, containerSel, false);
}

async function clickFindingByText(page, textFragment, containerSel = '#map-container', strict = false) {
  const found = await page.evaluate(([sel, filter]) => {
    const root = document.querySelector(sel) ?? document;
    const rows = [...root.querySelectorAll('[data-wmap-finding]')];
    const row = rows.find(r => {
      if (filter && !r.textContent?.includes(filter)) return false;
      let el = r.parentElement;
      while (el && el !== root) { if (el.style.display === 'none') return false; el = el.parentElement; }
      return true;
    });
    if (!row) return false;
    let panel = row.parentElement;
    while (panel) { const oy = getComputedStyle(panel).overflowY; if (oy === 'auto' || oy === 'scroll') break; panel = panel.parentElement; }
    if (panel) panel.scrollTop = Math.max(0, row.offsetTop - 40);
    row.dataset.wmapFindingTarget = 'pending';
    return true;
  }, [containerSel, textFragment]);
  if (!found) {
    if (strict) throw new Error(`clickFindingByText: no finding matching "${textFragment}" in ${containerSel}`);
    return;
  }
  await page.click('[data-wmap-finding-target="pending"]');
  await page.evaluate(() => { delete document.querySelector('[data-wmap-finding-target="pending"]')?.dataset.wmapFindingTarget; });
  await page.waitForTimeout(400);
}

async function selectWmapDropdownItem(page, btnAriaLabel, itemLabel) {
  await page.evaluate((label) => {
    const btn = [...document.querySelectorAll('button')].find(b => b.ariaLabel === label);
    if (!btn) return;
    let el = btn.parentElement;
    while (el) { if (el.hasAttribute('data-wmap-toolbar')) { el.style.opacity = '1'; el.style.visibility = 'visible'; break; } el = el.parentElement; }
  }, btnAriaLabel);
  await page.click(`button[aria-label="${btnAriaLabel}"]`);
  await page.waitForTimeout(300);
  const clicked = await page.evaluate((label) => {
    const menus = [...document.body.children].filter(el => el.tagName === 'DIV' && el.style.position === 'fixed');
    for (const menu of menus) {
      // Use startsWith to handle items with trailing decoration like ' ▶'
      const row = [...menu.querySelectorAll('div')].find(d => d.textContent?.trim().startsWith(label));
      if (row) { row.click(); return true; }
    }
    return false;
  }, itemLabel);
  if (!clicked) throw new Error(`Dropdown item not found: "${itemLabel}" in "${btnAriaLabel}"`);
  await page.waitForTimeout(200);
}

async function openWmapDropdown(page, btnAriaLabel, highlightItem = null, strict = false) {
  const found = await page.evaluate((label) => {
    const btn = [...document.querySelectorAll('button')].find(b => b.ariaLabel === label);
    if (!btn) return false;
    let el = btn.parentElement;
    while (el) { if (el.hasAttribute('data-wmap-toolbar')) { el.style.opacity = '1'; el.style.visibility = 'visible'; break; } el = el.parentElement; }
    btn.click();
    return true;
  }, btnAriaLabel);
  if (!found && strict) {
    throw new Error(`openWmapDropdown: button not found for aria-label "${btnAriaLabel}"`);
  }
  await page.waitForTimeout(150);
  if (highlightItem) {
    await page.evaluate((label) => {
      const menus = [...document.body.children].filter(el => el.tagName === 'DIV' && el.style.position === 'fixed' && el.offsetParent !== null);
      for (const menu of menus) {
        const div = [...menu.querySelectorAll('div')].find(d => d.textContent?.trim() === label);
        if (div) { div.style.fontWeight = 'bold'; return; }
      }
    }, highlightItem);
  }
  await pinWmapToolbar(page);
  await page.waitForTimeout(100);
}

async function closeSplitsDialog(page, strict = false) {
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('div[role="dialog"] button')];
    const b = btns.find(b => b.textContent?.trim() === 'Done');
    if (!b) return false;
    b.click();
    return true;
  });
  if (!clicked && strict) {
    throw new Error('closeSplitsDialog: no "Done" button found in an open dialog');
  }
  await page.waitForTimeout(400);
}

// ─── Test-selector dismissal (also used directly by capture-definitions.mjs's
// screenshotFn entries — exported, not just switch-case-local) ─────────────

/** Click "Select all" then Import — loads all tests. */
export async function dismissSelector(page) {
  await waitForSelector(page, '#tsmap-test-selector-overlay');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#tsmap-test-selector-overlay button')];
    btns.find(b => b.textContent?.trim() === 'Select all')?.click();
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#tsmap-test-selector-overlay button')];
    const b = btns.find(b => b.textContent?.includes('Import'));
    if (b) { b.id = '__import-btn__'; }
  });
  await page.click('#__import-btn__');
  await waitForWmapCanvas(page);
}

/** Like dismissSelector, but waits for the rename overlay afterward (multi-file loads). */
export async function dismissSelectorThenRename(page) {
  await waitForSelector(page, '#tsmap-test-selector-overlay');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#tsmap-test-selector-overlay button')];
    btns.find(b => b.textContent?.trim() === 'Select all')?.click();
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#tsmap-test-selector-overlay button')];
    const b = btns.find(b => b.textContent?.includes('Import'));
    if (b) { b.id = '__import-btn__'; }
  });
  await page.click('#__import-btn__');
  await waitForSelector(page, '#tsmap-rename-overlay');
  await page.waitForTimeout(300);
}

/** Click "Select none" then Import — loads bin data only, no test values. */
export async function dismissSelectorSelectNone(page) {
  await waitForSelector(page, '#tsmap-test-selector-overlay');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#tsmap-test-selector-overlay button')];
    btns.find(b => b.textContent?.trim() === 'Select none')?.click();
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#tsmap-test-selector-overlay button')];
    const b = btns.find(b => b.textContent?.includes('Import'));
    if (b) b.id = '__import-btn__';
  });
  await page.click('#__import-btn__');
  await waitForWmapCanvas(page);
}

// ─── Step runner ────────────────────────────────────────────────────────────

async function runStep(page, name, args, baseUrl, { allowCosmetic, strict, tempDirs = [] }) {
  switch (name) {

    case 'loadFile': {
      await injectFile(page, args[0], baseUrl);
      await page.waitForTimeout(500);
      break;
    }

    case 'loadFiles': {
      await injectFiles(page, args[0], baseUrl);
      await page.waitForTimeout(500);
      break;
    }

    case 'addFiles': {
      await addFile(page, args[0]);
      await page.waitForTimeout(500);
      break;
    }

    case 'filterFiles': {
      // The standalone "Filter files…" toolbar button is gone — it was a third
      // sibling to Open/Add that differed on a different axis (how to pick, not
      // what to do). The filter table is now reached by scanning a folder, so
      // this drives the empty state's #scan-folder-btn instead.
      //
      // That input is `webkitdirectory`, and Chromium REFUSES a list of
      // individual files for one ("requires passing a path to a directory") —
      // this step used to hand setFiles the file list directly and had been
      // failing ever since, which is why docs/images/file-filter.png went
      // stale while every other capture kept refreshing. Passing the shared
      // testdata/ folder instead would fix the throw but change the picture:
      // 17 entries would be scanned where the doc text promises four. So the
      // requested files are staged into a temp directory and THAT is scanned,
      // which keeps the caller's file list meaningful.
      //
      // The staged copy CANNOT be removed when this step returns: setFiles
      // only hands Chromium the path, and the scan that actually reads those
      // files is still in flight until waitForFilterScan. So the dir is
      // registered with the run and torn down by runSetup's finally instead.
      // Without that it leaked a full copy of every requested fixture per
      // run — on a tmpfs /tmp that is leaked RAM, not disk (40 abandoned
      // dirs / 2.5 GB had accumulated before this was fixed).
      const files = Array.isArray(args[0]) ? args[0] : [args[0]];
      const scanDir = await mkdtemp(join(tmpdir(), 'tsmap-scan-'));
      tempDirs.push(scanDir);
      await Promise.all(files.map(f => copyFile(f, join(scanDir, basename(f)))));
      // Chromium has `showDirectoryPicker`, which the web build prefers
      // (platform.ts `pickFolderViaHandle`) and which Playwright cannot drive —
      // it raises no `filechooser` event, so this step timed out from b859cbf
      // on. Hiding it sends the scan down the `webkitdirectory` fallback, the
      // same scan pipeline and the same table.
      await page.evaluate(() => { window.showDirectoryPicker = undefined; });
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.click('#scan-folder-btn'),
      ]);
      await chooser.setFiles(scanDir);
      break;
    }

    case 'waitForFilterScan': {
      // The table is only constructed once every scan has resolved, so its
      // presence in the modal IS the completion signal — no fixed sleep.
      await waitForSelector(page, '.tsmap-modal-box table tbody tr');
      await page.waitForTimeout(300);
      break;
    }

    case 'waitForWafers':
      await waitForWmapCanvas(page);
      break;

    case 'waitForOverlay':
      await waitForSelector(page, args[0] ?? '#tsmap-test-selector-overlay');
      await page.waitForTimeout(300);
      break;

    case 'dismissSelector':
      await dismissSelector(page);
      break;

    case 'dismissSelectorThenRename':
      await dismissSelectorThenRename(page);
      break;

    case 'dismissSelectorSelectNone':
      await dismissSelectorSelectNone(page);
      break;

    case 'openInsights': {
      // wmap's own Insights button — tsmap's bespoke Charts view (#charts-btn,
      // .chart-card) was removed and folded into wmap.
      await page.click('button[aria-label="Insights"]');
      await page.waitForTimeout(1200);
      break;
    }

    case 'selectInsightsTab': {
      // Insights tab-bar buttons have no class/id — wmap's insightsTab.ts sets
      // only textContent — so match on exact label text. Always throws on a
      // miss (see file header): a silent no-op here would produce a
      // screenshot of the wrong sub-tab under the right filename.
      const label = args[0];
      const tabbed = await page.evaluate((lbl) => {
        const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === lbl);
        if (!btn) return false;
        btn.click();
        return true;
      }, label);
      if (!tabbed) throw new Error(`Insights sub-tab not found: "${label}" (renamed in wmap?)`);
      await page.waitForTimeout(500);
      break;
    }

    case 'expandChartByTitle': {
      // wmap's chart cards carry no class/id on the card or the Expand button
      // — match the card by its heading text, then find the Expand button
      // among that heading's siblings by its `aria-label` (was matched on a
      // native `title="Expand"` attribute, but wmap's `attachChartTip`
      // — themed tooltips replacing native `title` on chart-card header
      // controls, wmap 0.25.0 — removed that attribute entirely, so every
      // capture through this matcher started failing at once; `aria-label`
      // was always present alongside it and is the more robust choice
      // anyway, being semantic rather than a tooltip implementation detail).
      // Always throws on a miss (see file header).
      const wanted = args[0];
      const expanded = await page.evaluate((titleText) => {
        const headings = [...document.querySelectorAll('div')]
          .filter(d => d.children.length === 0 && d.textContent?.trim().startsWith(titleText));
        for (const h of headings) {
          const headingRow = h.parentElement;
          const btn = headingRow && [...headingRow.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Expand');
          if (btn) { btn.click(); return true; }
        }
        return false;
      }, wanted);
      if (!expanded) throw new Error(`Chart card / Expand button not found for title: "${wanted}" (renamed in wmap?)`);
      await page.waitForTimeout(800);
      break;
    }

    case 'hoverMap':
      await hoverMapCanvas(page, args[0] ?? '#map-container', strict);
      break;

    case 'hoverMapCard':
      await hoverMapCard(page, args[0] ?? 0, strict);
      break;

    case 'clickToolbarBtn': {
      const label = args[0];
      await page.evaluate((lbl) => {
        const btn = [...document.querySelectorAll('button')].find(b => b.ariaLabel === lbl);
        if (!btn) return;
        let el = btn.parentElement;
        while (el) { if (el.hasAttribute('data-wmap-toolbar')) { el.style.opacity = '1'; el.style.visibility = 'visible'; break; } el = el.parentElement; }
      }, label);
      await page.click(`button[aria-label="${label}"]`);
      await page.waitForTimeout(300);
      break;
    }

    case 'openWmapDropdown':
      await openWmapDropdown(page, args[0], args[1] ?? null, strict);
      break;

    case 'selectWmapMode':
      await selectWmapDropdownItem(page, 'Plot mode', args[0]);
      break;

    case 'openSummaryPanel':
      await openSummaryPanel(page, args[0] ?? '#map-container', strict);
      break;

    case 'clickFindingByText':
      await clickFindingByText(page, args[0], args[1] ?? '#map-container', strict);
      break;

    case 'openSplitsDialog': {
      // Splits… lives in the Setup ▾ menu — open the menu first, then pick the
      // row by its visible label (built in JS, carries no id/selector).
      await page.click('#lot-btn');
      await page.waitForTimeout(150);
      const opened = await page.evaluate(() => {
        const row = [...document.querySelectorAll('button')]
          .find(b => b.textContent?.trim().startsWith('Splits'));
        if (!row) return false;
        row.click();
        return true;
      });
      if (!opened) throw new Error('openSplitsDialog: no "Splits…" row found in the Lot menu');
      await waitForSelector(page, 'div[role="dialog"]');
      await page.waitForTimeout(300);
      break;
    }

    case 'closeSplitsDialog':
      await closeSplitsDialog(page, strict);
      break;

    case 'loadSplitsFile': {
      // Splits are loaded via a real file picker, so this must arm
      // Playwright's filechooser listener before the click. .first(): when
      // nothing is assigned yet the empty-state banner shows its own
      // "Load splits…" button alongside the footer one — both trigger the
      // same load.
      const filePath = args[0];
      // The web app prefers showOpenFilePicker() in Chromium, which does not
      // emit Playwright's filechooser event. Use the hidden input fallback for
      // scripted captures, just as addFile() does for data files.
      await page.evaluate(() => { window.showOpenFilePicker = undefined; });
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.locator('div[role="dialog"] button', { hasText: 'Load splits…' }).first().click(),
      ]);
      await chooser.setFiles(filePath);
      await page.waitForTimeout(500);
      break;
    }

    case 'setInsightsGroupBy': {
      // The Insights "Group by:" picker is a themed button + popup listbox
      // (chartShell.ts makeListSelect, reached via makeLabeledSelect), NOT a
      // native <select> — it stopped being one when wmap converted these so
      // they'd follow the host theme on WebKitGTK. So it has to be *driven*,
      // not assigned: click the trigger, then click the option row by its
      // text. Always throws on a miss.
      const label = args[0];
      const opened = await page.evaluate(() => {
        const labels = [...document.querySelectorAll('label')];
        const groupByLabel = labels.find(l => l.textContent?.trim().startsWith('Group by:'));
        const trigger = groupByLabel?.querySelector('button');
        if (!trigger) return false;
        trigger.click();
        return true;
      });
      if (!opened) throw new Error('Insights "Group by:" trigger not found (renamed/restructured in wmap?)');
      await page.waitForTimeout(150);
      const picked = await page.evaluate((optionLabel) => {
        const row = [...document.querySelectorAll('[role="option"]')]
          .find(o => o.textContent?.trim().startsWith(optionLabel));
        if (!row) return false;
        row.click();
        return true;
      }, label);
      if (!picked) throw new Error(`Insights "Group by:" option not found: "${label}"`);
      await page.waitForTimeout(600);
      break;
    }

    case 'clickChartRowByTitle': {
      // Click a specific row inside the canvas of the chart card whose
      // heading starts with the given title — row geometry matches
      // chartShell.ts PADDING=12 and barPanel.ts ROW_HEIGHT=24/ROW_GAP=5.
      const wanted = args[0];
      const rowIdx = args[1] ?? 0;
      const box = await page.evaluate((titleText) => {
        const headings = [...document.querySelectorAll('div')]
          .filter(d => d.children.length === 0 && d.textContent?.trim().startsWith(titleText));
        for (const h of headings) {
          const card = h.parentElement?.parentElement;
          const canvas = card?.querySelector('canvas');
          if (canvas) {
            const r = canvas.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          }
        }
        return null;
      }, wanted);
      if (!box) throw new Error(`Chart card canvas not found for title: "${wanted}" (renamed in wmap?)`);
      const PADDING = 12, ROW_HEIGHT = 24, ROW_GAP = 5;
      const y = box.y + PADDING + rowIdx * (ROW_HEIGHT + ROW_GAP) + ROW_HEIGHT / 2;
      const x = box.x + box.width / 2;
      await page.mouse.click(x, y);
      // Park the pointer off the canvas afterwards: wmap's charts show a
      // hover tooltip that follows the cursor and stays pinned over the data
      // for as long as the pointer sits there.
      await page.mouse.move(2, 2);
      await page.waitForTimeout(500);
      break;
    }

    case 'clickChartColumnByTitle': {
      // Column-hit-test click for capability.ts's per-test grid (e.g.
      // "Process capability" — one column per test, not the row-based
      // layout clickChartRowByTitle/expandChartByTitle target). Unlike
      // those two (which walk headings by text — see their own comments on
      // why, predating the data-wmap-* hooks), this locates the card via
      // data-wmap-chart-card/data-wmap-chart-title directly — added
      // alongside those hooks, so new steps should
      // prefer them over the heading-text walk.
      const [wanted, colIdx, numCols] = args;
      const box = await page.evaluate((titleText) => {
        const card = [...document.querySelectorAll('[data-wmap-chart-card]')]
          .find(c => c.dataset.wmapChartTitle === titleText);
        const canvas = card?.querySelector('canvas');
        if (!canvas) return null;
        const r = canvas.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }, wanted);
      if (!box) throw new Error(`Chart card canvas not found for data-wmap-chart-title: "${wanted}"`);
      const x = box.x + (colIdx + 0.5) / numCols * box.width;
      const y = box.y + box.height / 2;
      await page.mouse.click(x, y);
      await page.mouse.move(2, 2);
      await page.waitForTimeout(400);
      break;
    }

    case 'expandLogPanel':
      await page.click('#log-toggle');
      await page.waitForTimeout(300);
      break;

    case 'showCursorOn': {
      if (!allowCosmetic) throw new Error('showCursorOn: cosmetic steps are disabled for this run');
      const target = args[0];
      const ox = args[1] ?? 0;
      const oy = args[2] ?? 0;
      const isSel = /^[.#\[a-z]/i.test(target) && !/\s/.test(target.split('[')[0]);
      const el = isSel ? await page.$(target) : (await page.$(`[aria-label="${target}"]`) ?? await page.$(target));
      if (el) {
        const box = await el.boundingBox();
        if (box) await injectCursor(page, box.x + box.width / 2 + ox, box.y + box.height / 2 + oy);
      }
      break;
    }

    case 'hideCursor':
      if (!allowCosmetic) throw new Error('hideCursor: cosmetic steps are disabled for this run');
      await removeCursor(page);
      break;

    case 'shrinkPanelToContent': {
      if (!allowCosmetic) throw new Error('shrinkPanelToContent: cosmetic steps are disabled for this run');
      await page.evaluate(() => {
        const panel = document.querySelector('.mapping-panel');
        if (panel) { panel.style.flex = 'none'; panel.style.maxHeight = 'none'; }
        const scroll = document.querySelector('.mapping-scroll');
        if (scroll) { scroll.style.flex = 'none'; scroll.style.overflow = 'visible'; scroll.style.maxHeight = 'none'; }
      });
      await page.waitForTimeout(100);
      break;
    }

    case 'shrinkModalToContent': {
      if (!allowCosmetic) throw new Error('shrinkModalToContent: cosmetic steps are disabled for this run');
      await page.evaluate(() => {
        const box = document.querySelector('.tsmap-modal-box');
        if (!box) return;
        box.style.height = 'auto';
        box.style.maxHeight = 'none';
        box.style.width = 'max-content';
        box.style.maxWidth = 'none';
        for (const el of box.querySelectorAll('*')) {
          const cs = getComputedStyle(el);
          if (cs.overflowY === 'auto' || cs.overflowY === 'scroll'
            || cs.overflowX === 'auto' || cs.overflowX === 'scroll') {
            el.style.flex = 'none';
            el.style.overflow = 'visible';
            el.style.maxHeight = 'none';
          }
        }
      });
      await page.waitForTimeout(150);
      break;
    }

    case 'click': {
      // Generic CSS-selector click — Playwright throws on its own if it
      // doesn't resolve. For elements with a real id/unique selector; when
      // the only handle is visible button text, use clickButtonByText.
      await page.click(args[0]);
      break;
    }

    case 'clickButtonByText': {
      // Click a <button> inside containerSelector matched on exact,
      // trimmed textContent — for dialogs whose buttons carry no id/class/
      // aria-label of their own (e.g. filterTable.ts's toolbar). Always
      // throws on a miss, regardless of `strict` — this step has no
      // existing lenient caller to stay compatible with (new in the
      // scenario runner), so there's no reason to allow a silent no-op.
      const [containerSelector, text] = args;
      const clicked = await page.evaluate(([sel, t]) => {
        const root = document.querySelector(sel);
        if (!root) return 'no-container';
        const btn = [...root.querySelectorAll('button')].find(b => b.textContent?.trim() === t);
        if (!btn) return 'no-button';
        btn.click();
        return 'ok';
      }, [containerSelector, text]);
      if (clicked === 'no-container') throw new Error(`clickButtonByText: container not found: ${containerSelector}`);
      if (clicked === 'no-button') throw new Error(`clickButtonByText: no button with text "${text}" in ${containerSelector}`);
      break;
    }

    case 'fillInput': {
      // page.fill throws on its own if the selector doesn't resolve — no
      // strict-mode gating needed, matches every other Playwright-native step.
      const [selector, value] = args;
      await page.fill(selector, value);
      break;
    }

    case 'wait':
      await page.waitForTimeout(args[0] ?? 300);
      break;

    case 'scroll':
      await page.evaluate(([x, y]) => window.scrollTo(x, y), [args[0] ?? 0, args[1] ?? 0]);
      break;

    default:
      throw new Error(`Unknown setup step: "${name}"`);
  }
}

/**
 * Runs a sequence of steps, returning per-step results. Throws on the first
 * failure — the thrown error carries `.stepResults` (everything that
 * succeeded before the failure) and `.failedStep` for callers that want to
 * report exactly where things broke.
 *
 * Owns the lifetime of any scratch directory a step stages files into
 * (currently only filterFiles): steps push onto `tempDirs` and every entry is
 * removed here, on the success and failure paths alike. Run-scoped rather
 * than step-scoped because a step's directory is still being read by the app
 * after the step itself returns.
 */
export async function runSetup(page, steps, baseUrl, opts = {}) {
  const allowCosmetic = opts.allowCosmetic ?? true;
  const strict = opts.strict ?? false;
  const results = [];
  const tempDirs = [];
  try {
    for (let i = 0; i < steps.length; i++) {
      const [name, ...args] = steps[i];
      const t0 = Date.now();
      try {
        await runStep(page, name, args, baseUrl, { allowCosmetic, strict, tempDirs });
        results.push({ index: i, name, args, ms: Date.now() - t0, ok: true });
      } catch (err) {
        results.push({ index: i, name, args, ms: Date.now() - t0, ok: false, error: err.message });
        const wrapped = new Error(`step ${i} [${name}] failed: ${err.message}`);
        wrapped.cause = err;
        wrapped.stepResults = results;
        wrapped.failedStep = { index: i, name, args };
        throw wrapped;
      }
    }
    return results;
  } finally {
    // Never let teardown mask a step failure: a scratch dir that won't delete
    // is a disk-space nuisance, not a reason to lose the error that says which
    // step broke.
    for (const dir of tempDirs) {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch (err) {
        console.warn(`warning: could not remove scratch dir ${dir}: ${err.message}`);
      }
    }
  }
}
