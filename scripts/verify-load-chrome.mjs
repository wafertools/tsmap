#!/usr/bin/env node
/**
 * Verify the one load indicator, in the real web build, in real Chrome.
 *
 * WHY THIS IS A SCRIPT AND NOT A UNIT TEST
 * ----------------------------------------
 * The thing that goes wrong here is never "the element is missing". It is the
 * element being present and *not on screen*: the docked strip was once
 * `position: absolute` inside `#map-container.gallery`, which scrolls, so it
 * pinned to the bottom of the scrollable CONTENT — with 50 cards that is far
 * below the viewport and the indicator was never visible at all. Two rounds of
 * "I see no change" came from asserting DOM presence. So every frame here is
 * checked by its BOUNDING RECT.
 *
 * It also guards the property the whole design exists for: ONE surface. The load
 * chrome was three disagreeing surfaces before 2026-09-20 (see the LoadPhase
 * block in src/main.ts). This scans the whole DOM for visible
 * busy-looking text, not just `#render-progress` — the first version counted
 * indicators by id and therefore missed `showLoadingState`, a FOURTH surface
 * that wrote its own "Loading x.stdf…" and destroyed the real indicator on the
 * way past. Counting the thing you already know about does not find the thing
 * you do not.
 *
 * TWO PATHS, because the first version tested one and both bugs lived in the
 * other. A lot at or above GALLERY_PROGRESSIVE_DIE_THRESHOLD mounts
 * progressively; one below it mounts PRE-BUILT, so wmap's callbacks land a task
 * after the load has already ended. That difference is what turned a late
 * "Finishing lot summary" into a phantom load nothing could end, leaving every
 * toolbar button disabled. The sample lot (13 wafers) is the small path and is
 * what a first-time user clicks.
 *
 * USAGE
 * -----
 *   npm run dev:web            # in another terminal — this drives localhost:5301
 *   node scripts/verify-load-chrome.mjs
 *
 * Needs ~/.cache/wafertools/fixtures/sweep-25000.csv (scripts/generate_sweep_csv.py)
 * and system Chrome. 25,000 dies over 50 wafers is deliberate: it clears
 * GALLERY_PROGRESSIVE_DIE_THRESHOLD so the progressive path is exercised, while
 * still loading in seconds — the 143 MB fixture never finished in headless
 * Chrome in 4.5 minutes.
 *
 * TWO CLICK-THROUGHS, NOT ONE: a CSV load gates on the column-mapping dialog
 * AND the test selector. Missing the second looks exactly like a hang at
 * "Parsing …" and cost three wasted verification runs.
 *
 * KNOWN INTERMITTENT FALSE POSITIVE (2026-09-21): on `csv`/`append`, one run in
 * three or so reports "indicator form did not match the view" for exactly one
 * poll at the very start of the Rendering phase — `cover` while the first card
 * has already mounted. Investigated: it is not a fix-able tsmap race (a
 * synchronous re-check right after `renderWaferGallery()` returns had no
 * effect, because the mount is not synchronous within that call — wmap's
 * `onItemResolved` for that first card lands a task later, by design, to avoid
 * a host's bar jumping mid-burst). Manually confirmed absent in both the web
 * build and the Tauri dev build watching the same transition directly. Most
 * likely explanation: this poller's `evaluate` calls can read a DOM state
 * between a mutation task and the next paint that the compositor never
 * actually renders as a distinct frame — stricter than what a human, or even
 * the browser, shows. Re-run once before treating a lone failure here as a
 * regression; treat a failure on every run, or on a scenario other than
 * `csv`/`append`, as real.
 */
import pw from 'playwright';
const { chromium } = pw;

const FIX = process.env.LOAD_CHROME_FIXTURE
  || process.env.HOME + '/.cache/wafertools/fixtures/sweep-25000.csv';
const URL_ = process.env.LOAD_CHROME_URL || 'http://localhost:5301/';
const SCENARIO = process.env.LOAD_CHROME_SCENARIO || 'both';   // csv | sample | both
const br = await chromium.launch({ executablePath: '/opt/google/chrome/chrome' });
let failures = 0;

for (const scenario of SCENARIO === 'both' ? ['sample', 'csv', 'toggle', 'append', 'drop', 'cancel-mapping', 'cancel-selector'] : [SCENARIO]) {
  console.log(`\n──── scenario: ${scenario} ────`);
  failures += await run(scenario);
}
await br.close();
process.exit(failures ? 1 : 0);

async function run(scenario) {
const page = await br.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message.slice(0, 160)));

await page.goto(URL_, { waitUntil: 'load' });

// Sample from inside the page, so nothing is missed between polls. This scans
// EVERY visible leaf for busy-looking text, not just #render-progress — the
// surface that got missed was a different element entirely.
await page.evaluate(() => {
  window.__frames = [];
  const seen = new Set();
  const RX = /(Rendering|Analysing|Parsing|Reading|Loading|Finishing|Waiting|Scanning|Fetching|Extracting|Importing)/;
  setInterval(() => {
    const surfaces = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length) continue;
      const t = (el.textContent || '').trim();
      if (!t || !RX.test(t)) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!(r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight)) continue;
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
      // A dialog the user is interacting with is not a busy indicator.
      if (el.closest('#tsmap-mapping-overlay, #tsmap-test-selector-overlay')) continue;
      surfaces.push({ id: el.id || el.className || el.tagName.toLowerCase(), text: t });
    }
    const el = document.getElementById('render-progress');
    const r = el?.getBoundingClientRect();
    const span = el?.querySelector('.rp-bar > span');
    const btn = (id) => { const e = document.getElementById(id); if (!e) return null;
      const cs = getComputedStyle(e);
      return (e.disabled === true || cs.pointerEvents === 'none' || +cs.opacity < 0.9) ? 'off' : 'on'; };
    const f = {
      surfaces: surfaces.length,
      names: surfaces.map(x => x.id).join(','),
      msg: surfaces.map(x => x.text)[0] ?? '',
      docked: el ? el.classList.contains('rp-staging') : null,
      barPct: span ? (span.style.width || 'indet') : '',
      barVisible: (() => {
        const b = el?.querySelector('.rp-bar');
        if (!b) return null;
        const br = b.getBoundingClientRect();
        return br.width > 0 && br.height > 0 && getComputedStyle(b).display !== 'none';
      })(),
      inViewport: r ? (r.bottom > 0 && r.top < innerHeight && r.height > 0 && r.width > 0) : null,
      open: btn('open-btn'), add: btn('add-btn'),
      label: document.getElementById('file-label')?.textContent ?? '',
      cards: document.querySelectorAll('.wmap-gallery-card canvas').length,
      // A one-wafer load renders a SINGLE map (renderWaferMap), not a gallery,
      // so gallery cards are legitimately zero there. "Did a view render" is
      // the invariant; "how many cards" is only the gallery's version of it.
      content: document.querySelectorAll('#map-container canvas').length,
    };
    const key = JSON.stringify(f);
    if (!seen.has(key)) { seen.add(key); window.__frames.push(f); }
  }, 60);
});

// Scenarios that deliberately end with nothing loaded: the assertions below
// must require recovery, not a lot.
const CANCELS = new Set(['cancel-mapping', 'cancel-selector']);

/** Load the bundled sample lot and wait for it to settle. */
async function loadSample() {
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await page.waitForSelector('#tsmap-test-selector-overlay', { timeout: 60000 });
  await page.getByRole('button', { name: /^Import \d+ tests/ }).click();
  await page.waitForFunction(() => !document.getElementById('render-progress')
    && document.querySelectorAll('.wmap-gallery-card canvas').length > 0, { timeout: 120000 });
  await page.waitForTimeout(1000);
}

if (scenario === 'append') {
  // ADD, not open. A different branch throughout — it keeps the current view,
  // so the indicator must dock over live content rather than cover it.
  await loadSample();
  await page.evaluate(() => { window.__frames.length = 0; });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#add-btn')]);
  await chooser.setFiles(FIX);
  await page.waitForSelector('#map-render', { timeout: 60000 });
  await page.click('#map-render');
  const sel2 = '#tsmap-test-selector-overlay button.btn-primary';
  try { await page.waitForSelector(sel2, { timeout: 15000 }); await page.click(sel2); } catch {}
  // An append has TWO user gates after the parse — the rename overlay and the
  // append confirmation — and the load correctly stays open across both. Drive
  // them by id; matching on button text missed them entirely and left the run
  // sitting at a modal, which looks exactly like a stuck load.
  try { await page.waitForSelector('#rename-confirm', { timeout: 20000 }); await page.click('#rename-confirm'); } catch {}
  try { await page.waitForSelector('#append-confirm', { timeout: 20000 }); await page.click('#append-confirm'); } catch {}
} else if (scenario === 'drop') {
  // Drag-and-drop is its own entry point and shares none of the picker's code.
  // A small inline CSV is enough: this tests the LOAD LIFECYCLE, not parsing.
  const dt = await page.evaluateHandle(() => {
    const rows = ['wafer,lot,x,y,hbin,sbin,t20000'];
    for (let i = 0; i < 200; i++) rows.push(`W01,LOT-DROP,${i % 20},${(i / 20) | 0},1,1,${(i % 7) / 10}`);
    const dt = new DataTransfer();
    dt.items.add(new File([rows.join('\n')], 'dropped.csv', { type: 'text/csv' }));
    return dt;
  });
  await page.dispatchEvent('#drop-zone', 'drop', { dataTransfer: dt }).catch(async () => {
    await page.dispatchEvent('body', 'drop', { dataTransfer: dt });
  });
  await page.waitForSelector('#map-render', { timeout: 60000 });
  await page.click('#map-render');
  const sel3 = '#tsmap-test-selector-overlay button.btn-primary';
  try { await page.waitForSelector(sel3, { timeout: 8000 }); await page.click(sel3); } catch {}
} else if (scenario === 'cancel-mapping') {
  // Cancelling a gate mid-load must END the load, not leave it open. The
  // 'waiting' phase opened it; nothing else will close it.
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#open-btn')]);
  await chooser.setFiles(FIX);
  await page.waitForSelector('#map-cancel', { timeout: 60000 });
  await page.click('#map-cancel');
  await page.waitForTimeout(2500);
} else if (scenario === 'cancel-selector') {
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await page.waitForSelector('#tsmap-test-selector-overlay', { timeout: 60000 });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(2500);
} else if (scenario === 'toggle') {
  // A post-load RE-RENDER, which is a load with its own entry point: the lot is
  // already in memory and only the analysis settings changed. Four call sites
  // did this as `void renderWaferView(...)` + an immediate `endLoad(...)`, so
  // the load ended while the render was starting and the render's own analysis
  // phase then opened a second load nothing would ever close — "Finishing lot
  // summary…" and a sweeping bar forever, toolbar dead behind it.
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await page.waitForSelector('#tsmap-test-selector-overlay', { timeout: 60000 });
  await page.getByRole('button', { name: /^Import \d+ tests/ }).click();
  await page.waitForFunction(() => !document.getElementById('render-progress')
    && document.querySelectorAll('.wmap-gallery-card canvas').length > 0, { timeout: 120000 });
  await page.waitForTimeout(1200);
  // Only now does the scenario begin: start sampling from a settled app.
  await page.evaluate(() => { window.__frames.length = 0; });
  await page.click('#lot-btn');
  await page.getByText('Show test-value findings').click();
} else if (scenario === 'sample') {
  // The PRE-BUILT path: 13 wafers is below GALLERY_PROGRESSIVE_DIE_THRESHOLD, so
  // wmap's callbacks land a task after the load has ended. Both 2026-09-20 bugs
  // lived here and in no other scenario.
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await page.waitForSelector('#tsmap-test-selector-overlay', { timeout: 60000 });
  await page.getByRole('button', { name: /^Import \d+ tests/ }).click();
} else {
  // The PROGRESSIVE path, driven through the real button + filechooser so the
  // 'waiting' phase is exercised too (setInputFiles skips the click handler).
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#open-btn')]);
  await chooser.setFiles(FIX);
  await page.waitForSelector('#map-render', { timeout: 60000 });
  await page.click('#map-render');
  const sel = '#tsmap-test-selector-overlay button.btn-primary';
  try { await page.waitForSelector(sel, { timeout: 15000 }); await page.click(sel); } catch {}
}

if (CANCELS.has(scenario)) {
  await page.waitForFunction(() => !document.getElementById('render-progress'), { timeout: 60000 })
    .catch(() => console.log('  !! indicator still up after cancel — the load never ended'));
} else {
  await page.waitForFunction(
    () => document.querySelectorAll('#map-container canvas').length > 0 && !document.getElementById('render-progress'),
    { timeout: 180000 },
  ).catch(() => console.log('  !! load never settled (indicator still up, or nothing rendered)'));
}
await page.waitForTimeout(2000);

const frames = await page.evaluate(() => window.__frames);
const final = await page.evaluate(() => {
  const btn = (id) => { const e = document.getElementById(id); if (!e) return 'missing';
    const cs = getComputedStyle(e);
    return (e.disabled === true || cs.pointerEvents === 'none' || +cs.opacity < 0.9) ? 'DISABLED' : 'enabled'; };
  return { open: btn('open-btn'), add: btn('add-btn'), openMore: btn('open-more-btn'),
           addMore: btn('add-more-btn'), label: document.getElementById('file-label')?.textContent ?? '',
           indicator: !!document.getElementById('render-progress'),
           cards: document.querySelectorAll('.wmap-gallery-card canvas').length,
           content: document.querySelectorAll('#map-container canvas').length };
});
await page.close();

for (const f of frames) {
  console.log(`  surfaces=${f.surfaces} ${f.inViewport === false ? 'OFFSCREEN' : (f.docked ? 'docked ' : 'cover  ')} `
    + `bar=${f.barVisible === false ? 'HIDDEN' : (f.barPct || '-')} open=${f.open ?? '-'} add=${f.add ?? '-'} view=${f.content} "${f.msg}"`
    + (f.surfaces > 1 ? `   <-- ${f.names}` : ''));
}
console.log(`  FINAL  open=${final.open} add=${final.add} openMore=${final.openMore} addMore=${final.addMore} `
  + `indicator=${final.indicator} cards=${final.cards} view=${final.content} label="${final.label}"`);

const fail = [];
const vis = frames.filter(f => f.surfaces > 0);
if (vis.some(f => f.surfaces > 1)) fail.push('more than one busy surface was visible at once');
if (vis.some(f => f.inViewport === false)) fail.push('the indicator was rendered outside the viewport');
if (!vis.length) fail.push('no busy indicator was ever shown');
// A re-render starts with the lot already on screen, so it is docked throughout
// and the mid-load heuristic below (which keys on an empty container) does not
// apply to it.
// The load must not declare itself over while it is still working.
if (frames.some(f => f.surfaces > 0 && f.add === 'on' && f.content === 0 && /Analysing|Parsing|Reading/.test(f.msg)))
  fail.push('toolbar was re-enabled mid-load');
// A cancel must leave the app usable: no indicator, and Open files clickable.
if (CANCELS.has(scenario) && final.open !== 'enabled') fail.push('cancel left the toolbar disabled');
// THE invariant, not a proxy for it: the form must always match whether there
// is content behind the indicator. Covering an empty container is honest;
// covering a live view is a lie, and docking over nothing is the "static label
// in the bottom bar" that read as a separate, lesser system.
//
// This replaces a "at most one centre↔docked transition per load" rule, which
// was a proxy that forbade correct behaviour: an APPEND legitimately goes
// docked (over the existing gallery) → covering (that view is torn down to
// re-analyse) → docked (new cards arriving). Three honest states, two
// transitions. The proxy failed it; the real invariant passes it and still
// catches the original bug, where "Loading …" docked over an empty container.
const mismatched = vis.filter(f => f.docked !== null && f.docked !== (f.content > 0));
if (mismatched.length) {
  fail.push(`indicator form did not match the view ${mismatched.length}x `
    + `(e.g. ${mismatched[0].docked ? 'docked over an empty container' : 'covering a live view'}: "${mismatched[0].msg}")`);
}
// And it must not change shape: a bar that vanishes for indeterminate phases
// makes the same indicator look like two different components.
if (vis.some(f => f.barVisible === false)) fail.push('the progress bar disappeared for part of the load');
if (final.indicator) fail.push('indicator still on screen after the load (phantom load)');
// Open files must always come back — it is the way out of any state.
if (final.open !== 'enabled') fail.push('Open files left disabled after the load');
// Add is enabled only when there is something to add TO, so a cancel that
// loaded nothing correctly leaves it disabled. Asserting otherwise would
// demand a bug.
if (!CANCELS.has(scenario)) {
  if (final.add !== 'enabled') fail.push('Add files left disabled after the load');
  if (final.addMore !== 'enabled') fail.push('Add-more caret left disabled after the load');
}
if (!CANCELS.has(scenario)) {
  if (!/wafer/.test(final.label)) fail.push('topbar does not show the file identity at the end');
  if (!final.content) fail.push('nothing was rendered into the map container');
}

console.log(fail.length ? '  FAIL:\n    ' + fail.join('\n    ') : '  PASS');
return fail.length;
}
