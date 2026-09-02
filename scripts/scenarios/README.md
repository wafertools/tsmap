# Writing and extending investigation scenarios

A scenario (e.g. `edge-corner-lot.mjs`) drives the real tsmap web build through a
sequence of **beats**, each asserting real state before moving to the next.
Run one with `scripts/run-scenario.mjs` (`npm run demo:test`; `HEADED=1
CHROME_PATH=/usr/bin/google-chrome npm run demo:test` to watch it happen in a
real browser window).

## Authoring workflow: prose first, `.mjs` generated

Each scenario has two files: `<name>.md` (plain prose — "select this, click
this…", written by hand) and `<name>.mjs` (the executable step/check
translation — generated, not hand-edited). The `.md` is the source of truth
for *intent*; the `.mjs` is a build artifact.

To create or change a demo: write or edit the `.md` describing what should
happen, then ask Claude to generate/regenerate the matching `.mjs` from it.
This isn't a mechanical text-to-code conversion — a plain parser can't tell
you that clicking column 0 of "Process capability" actually lands on
`fmax_MHz`, only running it against the real app can. Every beat in
`edge-corner-lot.mjs` was built exactly that way: read the prose intent, find or
build the right step, verify it against a live build, only then write it
down. Expect the same the next time — a `.md` → `.mjs` pass means re-running
and re-checking against the app, not just re-reading the markdown.

Multiple demos are meant to coexist — `scripts/scenarios/*.md`/`*.mjs` pairs,
one per story, not one file everything gets crammed into. `edge-corner-lot.md` is
the worked template for the prose style; match its shape (numbered beats,
what to select/click, what should become visible) for a new one.

## Shape of a scenario

```js
export const scenario = {
  name: 'edge-corner-lot',
  viewport: { width: 1600, height: 1000 },
  async preflight() { /* fast, browser-free sanity check — optional */ },
  beats: [ /* see below */ ],
};
```

## Shape of a beat

```js
{
  id: '05-splits-and-group-by',           // shows up in the run's log
  title: 'Load the corner splits…',       // human-readable, printed too
  steps: [ /* step arrays — see catalog below */ ],
  checks: [ /* optional — see below */ ],
  shot: 'demo-05-grouped-by-split',       // optional — screenshot filename, no extension
}
```

`steps` run in order via `scripts/lib/steps.mjs`'s `runSetup`, in **strict**
mode: any step that would normally no-op silently instead throws, and the
run stops at the first failure rather than limping into the next beat with
undefined app state.

**`checks` are optional.** A beat that's purely there to show something —
open a panel, switch a tab, take a screenshot — doesn't need any. A `get`/
`expect`/`describe` triple only earns its place when there's a real value
worth asserting on:

```js
checks: [
  {
    name: 'group-by-select-is-on-split',
    get: (page) => page.$eval('[data-wmap-select="group-by"]', (el) => el.querySelector('span')?.textContent),
    expect: (text) => text?.startsWith('Split') ?? false,
    describe: 'the Group by picker is set to Split',
  },
],
```

`get` can do more than read — it's an async function passed the live
`page`, so it can click, hover, or open a submenu to *find* the value worth
checking (see `07-drill-to-ss-wafer-on-fmax` in `edge-corner-lot.mjs` for an
example that opens a dropdown, reads it, then closes it again).

## Step catalog (`scripts/lib/steps.mjs`)

Every step is `[name, ...args]`. Full detail is in each case's own comment
in `steps.mjs` — this is the index to browse, not the whole story.

**Loading data**
| Step | Args | Does |
|---|---|---|
| `loadFile` | `path` | Drop one file (DataTransfer simulation) |
| `loadFiles` | `[path, …]` | Drop several files at once — triggers the rename overlay |
| `addFiles` | `path` | Click "Add files", pick via native file chooser |
| `filterFiles` | `path \| [path, …]` | Click "Filter files…", pick files |
| `waitForFilterScan` | — | Wait for the file-triage table to finish scanning |
| `waitForWafers` | — | Wait for a wafer canvas to appear |
| `waitForOverlay` | `selector?` | Wait for a named overlay (default: test selector) |
| `dismissSelector` | — | Test selector: Select all → Import |
| `dismissSelectorThenRename` | — | Same, but expects the rename overlay next |
| `dismissSelectorSelectNone` | — | Test selector: Select none → Import (bin data only) |
| `click` | `#rename-confirm` | *(the rename overlay's own confirm button)* |

**wmap toolbar / canvas**
| Step | Args | Does |
|---|---|---|
| `hoverMap` | `containerSel?` | Hover the map canvas (pins the hover-to-reveal toolbar) |
| `hoverMapCard` | `idx` | Hover the Nth gallery card's canvas |
| `clickToolbarBtn` | `ariaLabel` | Click a wmap toolbar button by aria-label |
| `openWmapDropdown` | `ariaLabel, highlightItem?` | Open a toolbar dropdown (e.g. "Plot mode") and leave it open |
| `selectWmapMode` | `label` | Pick an item from the Plot mode dropdown |
| `openSummaryPanel` | `containerSel?` | Open the Summary/Findings panel |
| `clickFindingByText` | `textFragment, containerSel?` | Click a specific finding row |

**Insights**
| Step | Args | Does |
|---|---|---|
| `openInsights` | — | Click `button[aria-label="Insights"]` (only matches while *closed* — see the toggle gotcha below) |
| `selectInsightsTab` | `label` | Switch Overview / Distributions / Correlation |
| `expandChartByTitle` | `titlePrefix` | Click a chart card's Expand button |
| `setInsightsGroupBy` | `label` | Set the "Group by:" select |
| `clickChartRowByTitle` | `titlePrefix, rowIdx` | Click a row inside a row-based chart (yield bars, boxplot groups) |
| `clickChartColumnByTitle` | `title, colIdx, numCols` | Click a column inside a column-based chart (Process capability) — uses the `data-wmap-chart-card`/`title` hooks directly, prefer this pattern for new steps over the heading-text walk the two above still use |

**Splits**
| Step | Args | Does |
|---|---|---|
| `openSplitsDialog` | — | Open Lot ▾ → Splits… |
| `closeSplitsDialog` | — | Click Done |
| `loadSplitsFile` | `path` | Load a splits CSV via the dialog's file picker |

**Generic (use these before reaching for a new switch case)**
| Step | Args | Does |
|---|---|---|
| `click` | `selector` | Playwright-native click on any CSS selector |
| `clickButtonByText` | `containerSelector, text` | Click a `<button>` inside a container, matched on exact text — for dialogs with no id/aria-label on their buttons |
| `fillInput` | `selector, value` | Type into a text input (e.g. the file-filter search box) |
| `wait` | `ms` | Fixed pause (prefer a real completion signal when one exists) |
| `scroll` | `x, y` | `window.scrollTo` |

**Cosmetic (screenshot-capture only — throw if used with `allowCosmetic: false`, which the scenario runner always sets)**
`showCursorOn`, `hideCursor`, `shrinkPanelToContent`, `shrinkModalToContent` — these exist for `capture-screenshots.mjs`'s docs-image crops and deliberately can't be used in a scenario, since they'd misrepresent real app behaviour.

## The toggle-button gotcha

The Insights button's `aria-label` flips between `"Insights"` and `"Back to
wafer/gallery view"` depending on open state — so `openInsights` only works
while it's closed, and can't be reused to close it or to assert open state.
Use the stable `data-wmap-insights-btn` hook instead when you need either:
`['click', '[data-wmap-insights-btn]']`.

## When there's no step for what you want to click

1. Check whether it already carries a `data-wmap-*` hook, an `aria-label`,
   or an `id` — if so, `click`/`clickButtonByText`/`fillInput` probably
   already cover it.
2. If it's a canvas (a chart, the wafer map itself), you need pixel
   coordinates. Look for the panel's own row/column layout constants in
   wmap's source (e.g. `chartShell.ts`'s `PADDING`, `barPanel.ts`'s
   `ROW_HEIGHT`/`ROW_GAP`) rather than guessing — `clickChartRowByTitle` and
   `clickChartColumnByTitle` are the two existing patterns to copy.
3. Add a new `case` to `scripts/lib/steps.mjs`'s `runStep` switch. Always
   throw on a miss — a silent no-op there produces a screenshot of the
   wrong state under the right filename, which is exactly how six wrong
   guide images shipped once (see the file's own header).
4. Verify empirically before trusting it: a small standalone script against
   the harness (`startServer` + `launchBrowser` + `newCapturePage`) that
   drives just the new step and dumps whatever DOM state you're curious
   about is much faster than guessing from source alone — that's how every
   beat in `edge-corner-lot.mjs` was actually built, including finding that
   Distributions' test-sync mechanism existed at all.
