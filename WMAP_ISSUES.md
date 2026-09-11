# wmap Issues Found via tsmap

This file tracks wmap library issues discovered while building tsmap.
At some point these will be converted into an implementation plan for wmap.

## Version tracking

| Field | Value |
|-------|-------|
| wmap package | **Renamed** from `@paulrobins/wafermap` to `@wafertools/wafermap` (2026-08-01), scope move only — no functional change. |
| wmap version in use | **0.28.0** — published to npm and adopted (2026-09-11): `npm run wmap:unlink` restored the published package, `package.json`/`package-lock.json` now pin `^0.28.0`. `npm run verify` (tsc, lint, check:docs, 530 JS tests, cargo check, 184 + 110 Rust tests), `check-wmap-published.js`, `check-testdata-parser-published.js` and `check-drift.mjs` all clean. |
| Latest wmap release | **0.28.0** published to npm and tagged (`v0.28.0`) in wafermap's own repo, 2026-09-11, minor bump, **breaking**. Bin and value colours are separate preferences (`binColorScheme`/`valueColorScheme`; `colorScheme`, the colour-scheme registry functions and `hardBinColor`/`softBinColor` removed), and bin colour has one pass/fail-aware rule, `resolveBinColors` (issue #52). Also: a boxplot leaf click opens the test in a single-wafer render (#51), `WMAP_VERSION`/`WMAP_BUILD_TIME` exported, and implausible geometry can no longer hang a render (#53). tsmap consumed all of it while linked (`mapColorPrefs.ts`, the About dialog's Engine row). Full list in wafermap's own `CHANGELOG.md` [0.28.0]. |
| Previous wmap release | **0.27.0** published to npm and tagged (`v0.27.0`) in wafermap's own repo, 2026-09-09, minor bump, **breaking**. The change that matters here: test definitions are reconciled **per wafer** (`mergeTestDefs`, new export) instead of one wafer's defs being applied to the whole population — the wmap half of issue #50 below, without which a multi-file load plots wafers against another file's spec limits. Also: geometry advisories reworked (`inferred-pitch` removed, `non-standard-diameter` and `diameter-exceeds-die-extent` added, `standardDiameters`/`STANDARD_WAFER_DIAMETERS_MM` overridable), `FindingsNotice` (issue #48), themed Insights pickers replacing native `<select>` (#43, #45), `inferred-pitch` severity (#44), the cached-viewport highlight offset (#46), truncated colorbar tick labels (#47), a per-test pass-rate chart and a wafer-to-wafer trend chart, and three new sizing tokens (`--wmap-font-size`, `--wmap-density`, `--wmap-font-family`). **Breaking:** `AnalyzeWaferMapOptions.significanceLevel`/`.minimumEffectSize`/`.minimumRelativeEffect` removed (internal constants now), `RenderOptions` no longer extends `ToCanvasOptions` (five accepted-but-ignored options removed), `showMetadataBadge` → `showIdentity`, `setMetadataBadgeVisible` → `setIdentityVisible`, `HoverTextOptions.waferMeta` removed, `--wmap-bar-fill-muted` removed. tsmap used none of the removed surface. Full list in wafermap's own `CHANGELOG.md` [0.27.0]. |
| Earlier wmap release | **0.26.1** published to npm and tagged (`v0.26.1`) in wafermap's own repo, 2026-08-28, patch, no breaking changes. Fixes the guide window rendering with pale, near-illegible text on a plain white background in a dark host theme (`.wmap-guide` set `color` from the synced `--wmap-*` tokens but never a matching `background`) — the tsmap-side half of this same bug (the guide's own theming was hardcoded light regardless of host theme) is fixed in tsmap directly, see this repo's own `CHANGELOG.md` [0.1.32]. Also fixes `edgeExcluded` dies rendering almost invisibly against the default light data colour scheme (fill was lighter than "no data" and barely darker than the canvas background) — now a visibly darker, distinct grey. Full list in wafermap's own `CHANGELOG.md` [0.26.1]. |
| Earlier wmap release | **0.26.0** published to npm (2026-08-28), minor bump, breaking: the die-list's single `Position` column is now separate `X`/`Y` columns (tsmap doesn't render the die list's own columns directly — reached only via wmap's Summary panel/Lot ▾ UI — so no tsmap code change was needed for this). New: `openReportModal` (Summary/Lot report buttons now open in-page instead of `window.open`, no `setReportOpener` wiring needed — tsmap never registered one, so this is a pure UX upgrade with zero code change), `openWaferMapGuide`/`ICONS` newly exported from `/render`, a combined guide "Contents" nav (flat, unnumbered, column-flow so a host's own guide sections and wmap's don't collide as two separately-numbered "1., 2., 3." runs) plus a find-in-page search box for the in-page guide fallback (real popup windows get native Ctrl+F instead), new `Ring`/`Quadrant`/`Edge excluded` die-list columns (`getWafer`/`ringCount`, not currently passed by tsmap), `LotStatsSummary.mixedIdentityFields` (closes issue #30 below), a CSV export formula-injection guard, and a fix for edge exclusion silently misbehaving when it exceeds the resolved wafer radius (closes issue #42 below). Full list in wafermap's own `CHANGELOG.md` [0.26.0]. |
| Earlier wmap release | **0.25.0** published to npm (2026-08-25), minor bump (no breaking changes — chosen for a release with this much new surface, not required by the versioning policy). New additive options: `WaferViewOptions.showLegend` (hide the legend/colorbar; default `true`), `WaferViewOptions.markFailingDies`/`ToCanvasOptions.markFailingDies` (diagonal hatch on failing-bin dies — a non-colour pass/fail channel; default `false`), `GalleryOptions.perCardLegend` (opt back into per-card legends; default `false`), `ViewOptions.passBins`/`ViewRect.binFail` (which bins count as passing — never derived from the bin number, any bin including bin 1 can be a fail bin). Also: two sequential z-index regressions in the gallery (per-card toolbars floating above the gallery's own sticky toolbar, then the sticky legend obscuring its own dropdowns) fixed generically — the card grid now contains its own stacking context (`isolation: isolate`) and every toolbar/chart dropdown renders into one shared elevated layer (`menuLayerFor`) — relevant here since tsmap's own `zIndex: WAFER_MODAL_OVERLAY_Z` render option composes with this unchanged (the whole `--wmap-z` scale still shifts together, confirmed in wmap's own docs/api.md update); a value-mode gallery with spec-ranged limits no longer silently loses its colorbar; the gallery's "Wafers" tab (lists only wafers with findings, not every wafer) renamed to "Findings" — checked against tsmap's own capture scripts, nothing there references the old label; map/legend titles no longer render near-black on dark themes; the floating legend no longer covers the whole card on small gallery sizes; the correlation chart's r-value label (previously dead code — its cell was structurally smaller than its own minimum) now actually renders; the capability chart's axis labels adapt to tests with no spec limits instead of assuming every test has them. Full list in wafermap's own `CHANGELOG.md` [0.25.0]. `npx tsc --noEmit`, full Vitest suite (319 passing), and `node scripts/check-wmap-published.js` all clean after the bump — no tsmap code changes needed, every change is additive with a default matching prior behaviour. No open issue in this file was resolved by 0.25.0 — none of it originated from a logged tsmap-side gap; it came from an independent wmap UX review plus a fix to wmap's own demo pages (`docs/examples/*.html`), which don't affect tsmap. |
| Earlier wmap release | **0.24.3** published to npm (2026-08-25). Fixes the die-list modal's font and padding rendering incorrectly when opened from a wafer detached into its own popup window (`dieList.ts` injected its stylesheet and built elements via the bare global `document` rather than the anchor's own document — correct in-page, wrong once the modal legitimately landed in a different document), the toolbar's "Data warnings" popup mispositioning in that same detached-popup case (`buildWarningsMenuEl`'s `ownerWindow` param existed but neither call site passed it), and a matching fix for the in-app user guide window (`openUserGuideWindow`/`openGuideInFloatingWindow`). Also normalized the shared toolbar/menu primitives (`buildCheckMenuEl`, `makeDropdown`, `makeSearchableTestCombo`, `summaryPanel.ts`'s internal `el()`) to the same doc-aware pattern, and added a build-time check (`check-overlay-conventions.mjs`) that fails on a new `openModal`/`openFloatingWindow` call missing `anchor`, or a new bare `document.head.appendChild`. No breaking changes. **0.24.0** (minor, breaking): metadata now reaches the die-list table and its CSV export (issue #41 — `DieListOptions.metadataColumns`/`waferMetadataColumns`, `RenderOptions.dieList`, new `metadataDisplayValue`/`metadataCategoricalValue`/`resolveMetadataColumns`/`discoverDieMetadataKeys` exports), a new "View die list" link on the Summary panel (on by default, `renderWaferMap`/`renderWaferGallery`), and wafer identity on the two per-test CSVs. **Breaking:** `buildDieListSection`/`RenderOptions.dieList` now caps rendered rows at `maxRows` (default `50_000`) — CSV export is never capped. tsmap sets no `dieList` options and populates no `Die.metadata`, so this adopted with no code change; `npm run check` + `npm test` (319 passing) both clean after the bump. **0.24.1**: fixed the die-list modal opening behind a host's own `<dialog>`, and the report popup being blocked as an ad (`window.open` + Blob URL instead of `document.write`). **0.24.2**: fixed the die-list modal's vertical scrollbar being pushed off-screen by `min-width: auto` on a wide table. |
| Earlier wmap releases | **0.23.1** published to npm (2026-08-18), together with 0.23.0: support for dies/wafers with no reported X/Y position (issue #39), `renderWaferMap` accepting a `RenderableWaferMap`, a fix for the degenerate-axis pitch bug (issue #40), and stable `data-wmap-*` DOM hooks on the Insights tab (issue #36). **Breaking (0.23.0):** `Die.x`/`y`/`physX`/`physY` are now optional, not `number`. **0.22.0**: the library surfaces its own data warnings — a ⚠ toolbar indicator plus a Summary-panel banner. **Breaking:** `StatsSummary.stats.warnings` is now `WaferWarning[]`, not `string[]` — tsmap never read that field, so it was unaffected. **0.21.1**: `maxSize` render option, gallery card-size fixes. **0.21.0** (breaking): removed long-deprecated aliases (`DieResult.values`/`Die.values`, `TestDef.index`, `colorBySpec`, etc.) — tsmap used none. **0.20.9**: fixed phantom "partial" dies at wafer edges (the edge-die yield fix). Full history in the update log below. Check [github.com/wafertools/wafermap/releases](https://github.com/wafertools/wafermap/releases) |
| testdata-parser package | **Renamed** from `@paulrobins/testdata-parser` to `@wafertools/testdata-parser` (2026-08-01), scope move only — no functional change. |
| testdata-parser version | **0.10.0** — published to npm and adopted (2026-09-11, bumped from **0.9.0**): STDF WCR read by the spec (it was 2 bytes out of place), ATDF read in its own field order, the V4-2007 VUR record read, several lot records per stream labelling each wafer with its own lot, CSV/JSON/Parquet rows grouped by lot + wafer (`flat_wafers.rs`), and `parquet_distinct_count` for the file filter's Parquet wafer count. `npm run parser:unlink` restored the published package, `package.json`/`package-lock.json` pin `^0.10.0`. |
| Last updated | 2026-09-11 (wmap bumped **0.27.0 → 0.28.0** and testdata-parser **0.9.0 → 0.10.0** in tsmap, alongside this repo's own batch — see tsmap's own `CHANGELOG.md` [0.1.34]. Published, unlinked, pinned `^0.28.0`/`^0.10.0`. Issues #51, #52 and #53 closed by this bump. #53 was found while preparing the release itself: the bundled `sample-lot.stdf.gz` still had the old WCR layout and hung **Load sample data** — fixed on both sides before publishing.) |
| Previous update | 2026-09-09 (wmap bumped **0.26.1 → 0.27.0** in tsmap, alongside this repo's own batch — the per-wafer test-definition reconciliation this release exists for. tsmap already consumed the new API (`FindingsNotice`, `mergeTestDefs`) while linked, so unlinking before the publish briefly broke the build with three `TS2305`/`TS2353` errors — a reminder that the publish must land before the unlink, not after. Published, unlinked, pinned `^0.27.0`. Issues #43, #44, #45, #46, #47, #48, #49 and #50 closed by this bump — the largest single batch this table has recorded. See tsmap's own `CHANGELOG.md` [0.1.33] for the tsmap-side half.) |
| Previous update | 2026-08-28 (wmap bumped **0.26.0 → 0.26.1** in tsmap, fixing a dark-theme guide bug found immediately after the 0.26.0/testdata-parser 0.9.0 batch shipped — see WMAP_ISSUES.md's "Latest wmap release" row and tsmap's own `CHANGELOG.md [0.1.32]` for the full story: the guide read as broken in Nord/Dark/Solarized Dark, root-caused to a hardcoded light-theme block in tsmap's own `build-user-guide.mjs` (removed) plus a missing `background` on wmap's own guide chrome (added). Also fixes `edgeExcluded` die fill visibility. Published, unlinked, `package.json`/`package-lock.json` pin `^0.26.1`. `npm run verify` (tsc, lint, check:docs, 391 JS tests, cargo check, 251 Rust tests), `check-wmap-published.js`, `check-testdata-parser-published.js`, and `check-drift.mjs` all clean.) |
| Previous update | 2026-08-28 (wmap bumped **0.25.0 → 0.26.0** and testdata-parser **0.8.0 → 0.9.0** in tsmap, alongside this repo's own batch — bin definitions, wafer diameter/edge-exclusion override, WCR/HBR/SBR parsing, the guide-consolidation reversal of issue #37 below (see tsmap's own `CHANGELOG.md [0.1.31]` for the tsmap-side detail). Both published to npm, unlinked, `package.json`/`package-lock.json` pin `^0.26.0`/`^0.9.0`. `npm run verify` (tsc, lint, check:docs, 391 JS tests, cargo check, 251 Rust tests), `check-wmap-published.js`, `check-testdata-parser-published.js`, and `check-drift.mjs` all clean. Issues #30 and #42 closed by the wmap bump. See "Latest wmap release" above for the full wmap summary.) |
| Previous update | 2026-08-25 (wmap bumped **0.24.3 → 0.25.0** in tsmap: published to npm and unlinked, `package.json`/`package-lock.json` pin `^0.25.0`. `npx tsc --noEmit` clean, full Vitest suite (**319** tests) clean, `node scripts/check-wmap-published.js` clean, `node scripts/check-drift.mjs` clean. No tsmap code changes needed — every change in this release is additive with a default matching prior behaviour, and the one text change (gallery "Wafers" tab → "Findings") isn't referenced by any tsmap capture script. See the "Latest wmap release" row above for the full summary.) |
| Previous update | 2026-08-18 (wmap bumped **0.23.0 → 0.23.1** in tsmap: published to npm and unlinked, `package.json`/`package-lock.json` pin `^0.23.1`. `npx tsc --noEmit` clean, full Vitest suite (**319** tests) clean, `eslint src/` clean, `node scripts/check-wmap-published.js` clean. No tsmap code changes needed for this bump — 0.23.1's own new surface (`data-wmap-*` hooks, the degenerate-axis pitch fix) needs no consumption to take effect; only `capture-screenshots.mjs` would need updating to actually *use* the new hooks in place of its current heading-text selectors, not scoped for this pass. **This bump also retroactively closes a gap in this file**: the prior release (v0.1.27, commit `bbcdd5a`) had already pinned `^0.23.0` — adopting issue #39's coordinate-less-dies work and its breaking `Die.x` optional change — without this version-tracking table or issue #39/#40 ever being updated to say so. Both are corrected now: issue #39 and #40 are confirmed fixed and published (0.23.0 for #39, 0.23.1 for #40 and #36), struck through below.) |
| Previous update | 2026-08-07 (wmap bumped **0.21.1 → 0.22.0** in tsmap: published to npm and unlinked, `package.json`/`package-lock.json` pin `^0.22.0`. `npx tsc --noEmit` clean, `eslint` clean, full Vitest suite (**197** tests — two new) clean, full release-guard build (`npm run build:web`, including `check-wmap-published.js` and `check-testdata-parser-published.js`) clean. 0.22.0's breaking change (`StatsSummary.stats.warnings` → `WaferWarning[]`) needed no migration: tsmap never read that field, only `WaferMapResult.warnings`, which was already structured. **One tsmap-side fix the bump surfaced:** `logWmapWarnings` read only `WaferMapResult.warnings`, but 0.22.0 makes explicit that advisories come from two sources — the build (geometry) *and* the analysis (`test-count-capped`, meaning test-value analysis was skipped and **no** test findings were produced). tsmap was silently dropping the second, in exactly the case where a user wonders why the Insights/Findings panels are empty. Now routed through wmap's own `collectWarnings` (which unions both and de-duplicates), so it runs after `analyzeWaferMap` rather than before; severity maps to log level, so geometry advisories log as errors (opening the log panel) rather than as one more `warn`, and each line names the stable code — `Wafer W03 [partial-coverage]: …`. Two integration tests pin that contract, asserting `collectWarnings({ result })` alone misses `test-count-capped` while `{ result, statsSummary }` reports it. wmap's own ⚠ indicator is deliberately left on alongside the log: the indicator is discoverable and persists with the map, the log is the per-wafer history. No open issue in this file was resolved by 0.22.0 — the warning-surfacing work was never logged here.) |
| Previous update | 2026-08-02 (tsmap v0.1.23: wmap bumped **0.20.9 → 0.21.1** and both `wafermap`/`testdata-parser` adopted under the `@wafertools` npm scope (`@paulrobins/*` deprecated) — package.json/package-lock.json pin `^0.21.1`/`^0.5.0`, unlinked, `node_modules` resolves both. `npx tsc --noEmit`, `eslint`, full Vitest suite (195 tests), Rust `cargo check` + `cargo test` (97 tests), and both release guards (`check-wmap-published.js`, `check-testdata-parser-published.js`) all clean. The wmap 0.20.9 phantom-partial-die fix (folded into this same release) is the functional change: tsmap passes neither `waferConfig.diameter` nor a `dieConfig` pitch, so every wafer goes through wmap's fully-inferred geometry path, which is exactly what was undersizing the wafer circle and dropping real edge dies. Measured on `testdata/correlated.stdf` (9865 dies) before → after: dies counted in stats 9705 → 9865; hard bins 6463/557/2685 → 6463/569/2833; lot yield 66.6% → **65.5%**; ring 4 (edge) yield 20.8% → **17.6%**. Bin 1's count is identical across the two, so all 160 recovered dies were *failing* edge dies — i.e. tsmap had been silently overstating yield, worst at the wafer edge, and the toolbar's own die count (9865, straight from the parser) disagreed with wmap's stats N (9705); they now agree. Every screenshot showing a yield or die count was recaptured (2026-07-28, unchanged by the subsequent 0.21.x bump). One tsmap-side fix in the same pass: `buildWaferMap`'s `warnings` were logged on the gallery path but silently dropped on the single-wafer path — now shared via `logWmapWarnings` and called from both, so geometry advisories can actually reach the log panel. No open issue in this file was resolved by 0.20.9–0.21.1.) |
| Previous update | 2026-07-28 (wmap bumped to **0.20.8** in tsmap: published to npm and unlinked, `package.json`/`package-lock.json` pin `^0.20.8`. `npx tsc --noEmit` clean, full Vitest suite (195 tests) clean, full release-guard build (`npm run build:web`, including `check-wmap-published.js` and `check-testdata-parser-published.js`) clean, smoke-tested via a Playwright capture against the built `dist/` (STDF load → gallery → Insights Overview renders correctly under 0.20.8). **No tsmap code changes were needed** — nothing in tsmap uses `colorBySpec`, `metadataFields`, `View.axisFlip`, or `getDieKey`, so the whole span is a drop-in bump; the 0.20.6–0.20.8 geometry fixes apply to configurations tsmap doesn't currently expose (wafer orientation, non-square die pitch, reticle fields) but are correctness wins if it ever does. No open issue in this file was resolved by 0.20.5–0.20.8.) |
| Previous update | 2026-07-21 (wmap bumped to **0.20.4** in tsmap: published to npm and unlinked, `package.json`/`package-lock.json` pin `^0.20.4`. `npx tsc --noEmit` clean, full Vitest suite (195 tests) clean, full release-guard build (`npm run build:web`, including `check-wmap-published.js`) clean. Fixes two issues found via tsmap testing while linked — see issue #32's fourth-pass update (guide demo teardown) and issue #37 below (modal-close `NotFoundError`), both confirmed fixed in this version.) |
| Previous update | 2026-07-19 (wmap bumped to **0.20.3** in tsmap: published to npm and unlinked, `package.json`/`package-lock.json` pin `^0.20.3`. `npx tsc --noEmit` clean, full Vitest suite (159 tests) clean, full release-guard build (`npm run build:web`, including `check-wmap-published.js`) clean. testdata-parser left at 0.4.0 — the tsmap-side functional-test parser/TS changes (issue #34) are already in the working tree but not yet published, so the WASM/browser path still produces legacy-encoded functional data via the documented fallback; the native Tauri path is unaffected since it builds the local crate directly.) |
| Previous update | 2026-07-16 (wmap bumped to **0.20.2** in tsmap: published to npm and unlinked, `package.json` pins `^0.20.2`. `npx tsc --noEmit` clean, full Vitest suite (155 tests) clean, full release-guard build (`npm run build:web`, including `check-wmap-published.js`) clean, smoke-tested via the Playwright screenshot captures against the built `dist/` (STDF load → test selector → gallery render → splits dialog → splits CSV load). Issue #33 confirmed fixed in this version. Note: `npm run wmap:link` no longer uses `npm link` — it creates the `../wmap` symlink directly, so it works regardless of npm's global-prefix permissions; behaviour is otherwise identical.) |
| Previous update | 2026-07-15 (wmap linked and rebuilt against 0.20.0 for the new `onSaveText` hook (issue #33): `main.ts` adds an `onSaveText` handler mirroring `onSaveImage` (routes through `platform.saveTextFile` in Tauri, default download on web), wired into both `renderWaferMap`/`renderWaferGallery` calls; `analysisEnabled: true` → `insights: { enabled: true }` and Help menu copy updated to "Findings/Insights panels" to match 0.20.0's actual naming (an earlier linked snapshot had tried a `summaryPanel` → `findings` rename that 0.20.0's final release did not ship — reverted back to `summaryPanel`, which was already correct). `npx tsc --noEmit` and full Vitest suite (155 tests) clean.) |
| Previous update | 2026-07-13 (wmap linked for the (since-reverted) Findings/Insights option-name split: see 2026-07-15 entry above for the correction.) |
| Previous update | 2026-07-12 (wmap bumped to **0.19.0** in tsmap: unlinked via `npm run wmap:unlink`, `package.json`/`package-lock.json` updated, `npx tsc --noEmit` clean, full Vitest suite (155 tests) clean, full release-guard build (`npm run build:web`, including `check-wmap-published.js`) clean, smoke-tested via headless Playwright against the built `dist/` — loaded a synthetic STDF, confirmed the Help menu ("tsmap guide" always enabled, "Wafer map reference" enabled only once a map renders), confirmed no wmap help button exists in the DOM (`showHelpButton: false`), and confirmed `openUserGuide()` opens wmap's guide with all 13 live demos correctly mounted. Issue #32 confirmed fixed in this version.) |
| Previous update | 2026-07-08 (wmap bumped to 0.18.0: gallery card expand detaches into a real `window.open()` window with in-page fallback, `setDetachWindowOpener` host hook. Issues #26 and #27a confirmed fixed in that version.) |

## Rust Backend Notes

### ~~`rust-stdf` ATDF feature is unusable~~ (resolved — own parser written)

`rust-stdf` v0.3.1 has an `atdf` feature flag but the implementation is
incomplete. `AtdfRecord` has a private `data_map` field with no public
accessors — the only public method is `to_atdf_string()`. The
`From<&AtdfRecord> for StdfRecord` conversion is a TODO stub that returns an
empty record.

**Current workaround:** ATDF is parsed in TypeScript (`atdfParser.ts`). This
works but means ATDF cannot benefit from Rust performance for large files.

**Options when we add a `parse_atdf` Rust command:**

1. Wait for `rust-stdf` to complete its ATDF implementation
2. Write our own ATDF parser in Rust — ATDF is ASCII line-by-line, the format
   is well-specified, and the field layouts are already documented in
   `atdfParser.ts`. A Rust implementation would be ~200 lines.

Option 2 is likely faster than waiting. The field positions are already mapped
in `atdfParser.ts` — porting to Rust is mechanical.

## API Issues

### ~~1. `renderWaferMap` missing `downloadFilename` option~~ (fixed in v0.12.8)

`renderWaferGallery` accepts `options.downloadFilename` to customise the PNG
save filename. `renderWaferMap` hardcodes `a.download = 'wafermap.png'`
regardless of context. The host has no way to suggest a meaningful filename
(e.g. the loaded file's stem).

**Fix applied:** `downloadFilename?: string` added to `RenderOptions` in both
`renderWaferMap` and `renderWaferGallery`. tsmap now passes `stem` to both.

### ~~2. `openHtmlReport` uses `window.open` — not embeddable~~ (fixed in v0.12.8)

`openHtmlReport(html)` calls `window.open('', '_blank')` then writes HTML into
the popup. In Tauri (and any non-browser host), `window.open` is blocked and
returns `null`, silently doing nothing. The "Open Report" and "Summary report"
buttons in the summary panel are therefore broken in tsmap without a workaround.

**Fix applied:** `setReportOpener(opener)` added to the wmap stats API. tsmap
now calls it at startup instead of patching `window.__openHtmlReport`.

### ~~3. `wrapWithSummaryPanel` uses `height: 100%` on a flex child — broken on WebView2~~ (fixed)

`summaryPanel.ts: wrapWithSummaryPanel()` set `height: '100%'` on the wrapper
div, which is a flex child of whatever container the caller provides. In a pure
flexbox layout, `height: 100%` on a flex child only resolves correctly if the
parent has an explicit declared height — not a flex-given height. WebKitGTK is
lenient; WebView2 (Windows) is strict and collapses the wrapper to zero height,
breaking the summary panel layout.

**Fix applied:** Replaced `height: '100%'` with `flex: '1 1 0'` and added
`minHeight: '0'` on the wrapper, matching the pattern already used on the
content element.

### ~~5. Toolbar and menus use `z-index: 9998`/`9999` — overrides host app overlays~~ (fixed in v0.12.8)

`toolbar.ts` assigns `zIndex: '9998'` to menus and dropdowns and `zIndex: '9999'` to the hover tooltip, all via `position: fixed` on `document.body`. These values compete globally with any host application overlay (modals, mapping panels, help dialogs). Hosts are forced to use `z-index ≥ 10000` to stay above the toolbar.

**Fix applied:** CSS custom property `--wmap-z` (default `100`) replaces all hardcoded z-index values. tsmap overlays remain at `z-index: 200` and now correctly appear above the toolbar.

### ~~4. Die tooltip freezes visible after pointer leaves canvas during a drag~~ (fixed)

`setPointerCapture` in `onPointerDown` routes all pointer events to the canvas
while a button is held, which suppresses `pointerleave`. If the user releases
the mouse button outside the canvas bounds, `onPointerLeave` never fires and
the tooltip remains visible.

**Fix applied:** `onPointerUp` now checks if the release point is outside the
canvas bounds and hides the tooltip if so.

### ~~6. `analyzeWaferMap` per-test stats lack quartiles (median/Q1/Q3)~~ (fixed in v0.13.3)

**Where:** `packages/stats/analyzeWaferMap.ts` — the per-test statistics
computed into `StatsSummary` (currently `mean`, `stddev`, `count`, `min`, `max`
per test/region).

**Problem:** tsmap is considering adding box-plot charts of test values per
test/wafer. A box plot needs median, Q1, and Q3 (and typically whisker bounds
derived from the IQR) in addition to min/max. `analyzeWaferMap` already walks
every test's `testValues` to compute mean/stddev/min/max, so quartiles are a
natural extension of that existing pass rather than a new computation tsmap
would have to duplicate — and any other consumer of `StatsSummary` wanting
distribution shape would benefit too.

**Suggested fix:** During the existing per-test aggregation in
`analyzeWaferMap`, sort (or use a selection algorithm on) the collected test
values once and add `median`, `q1`, `q3` fields to the per-test stats shape
(e.g. alongside `mean`/`stddev`/`min`/`max`). Whisker bounds (e.g.
`q1 - 1.5*iqr`, `q3 + 1.5*iqr`) can be derived by the chart consumer from
`q1`/`q3`, so they don't need to be stored.

**Fix applied:** `StatsSummary.stats.perTestStats` now includes `median`, `q1`, `q3` (plus `mean`, `stddev`, `min`, `max`, `count`) for each test. Note: `perTestStats` aggregates across the whole lot; `buildTestBoxplotData` in tsmap computes per-wafer boxes for a selected test and is not replaced by this change.

### ~~7. `yieldPercent` fields hold a 0–1 fraction despite the name~~ (fixed in v0.13.3)

**Where:** `packages/renderer/buildWaferMap.ts` (`YieldSummary.yieldPercent`,
`yieldPercentGross`) and `packages/stats/types.ts`
(`StatsSummary.stats.yieldPercent`, `LotStatsSummary.lotYieldSeries[].yieldPercent`,
`testSpecYield[].yieldPercent`).

**Problem:** Despite the `*Percent` naming, every one of these fields is a
0–1 fraction (`passDies / totalDies`), not a 0–100 percentage — wmap's own
`summaryPanel.ts` has to multiply by 100 before display
(`` `${(yieldSummary.yieldPercent * 100).toFixed(1)}%` ``). tsmap's first
chart implementation passed `yieldPercent` straight into a 0–100 colour
gradient, so every wafer landed near 0% and rendered red regardless of actual
yield — a naming trap any new consumer is likely to fall into.

**Suggested fix:** Either rename the fields to `yieldFraction`/`yieldRatio`
(breaking change, needs a major version bump) or document prominently in the
TSDoc comment on each field that the value is a 0–1 fraction and must be
multiplied by 100 for display — the current comment on `YieldSummary.yieldPercent`
explains the *formula* but never states the *range*.

**Fix applied:** All `yieldPercent` fields now hold values in [0, 100]. Remove the `* 100` multiply in `src/charts/aggregate.ts` (`buildYieldData`).

### ~~8. `softBinColor` defaults `maxBin` to 6 — clamps lots with higher soft-bin codes to one colour~~ (fixed in v0.13.3)

**Where:** `packages/renderer/colorMap.ts` — `softBinColor(bin, maxBin = 6)`
maps `bin / maxBin` onto the Viridis scale via `valueToViridis`, which clamps
its input to `[0, 1]`.

**Problem:** Soft bin codes commonly exceed 6 (STDF V4 allows 0–32767, and
multi-category test programs routinely define a dozen or more). Any bin
`>= maxBin` clamps to `t = 1` and renders identically — the same end-of-scale
colour — making `softBinColor(bin)` useless for distinguishing bins in a
typical lot unless the caller already knows to pass the lot's actual maximum
soft-bin code as `maxBin`. This is easy to miss since the function compiles
and runs fine; it just silently produces indistinguishable colours.

**Suggested fix:** Either derive a sensible default from the bin value itself
(e.g. round up to the next power-of-two-ish ceiling), or — better — make
`maxBin` a required parameter so callers can't omit it without thinking about
their data's bin range. At minimum, the TSDoc should call out that omitting
`maxBin` silently clamps high bin codes to the same colour.

**Fix applied:** `softBinColor(bin)` now uses a discrete categorical palette (same as `hardBinColor`) — no `maxBin` parameter, no gradient. Remove the `maxSoftBin` computation in `src/main.ts` and call `softBinColor(bin)` directly.

### ~~9. `analyzeWaferMap` lacks per-wafer test statistics — tsmap must re-walk results for box plots~~ (fixed in v0.13.4)

**Where:** `packages/stats/analyzeWaferMap.ts` — `computePerTestStats` aggregates test values across all dies into a single lot-level entry per test (`StatsSummary.stats.perTestStats`). There is no per-wafer breakdown.

**Problem:** tsmap's box-plot chart shows one box per wafer for a selected test (min/Q1/median/Q3/max). To build this, tsmap re-walks `wafer.results` itself in `buildTestBoxplotData` (`src/charts/aggregate.ts`), duplicating the value-extraction and quantile logic that `analyzeWaferMap` already performs. This was originally logged as issue 6 requesting quartiles on `perTestStats`, but that was the wrong ask — `perTestStats` is lot-level; what tsmap needs is a per-wafer × per-test five-number summary.

**Fix applied:** `perWaferTestStats` added to `LotStatsSummary` (not `StatsSummary`) — projected from `perWafer[i].summary.stats.perTestStats` in `analyzeWaferLot`. Shape matches the proposal above plus a `label` field. Only present when `enableTestValueAnalysis: true`. tsmap can drop `buildTestBoxplotData` and read `lotSummary.perWaferTestStats` directly.

> **Update (2026-06-24, wmap 0.16.0):** still not consolidated, and the calculus
> changed. 0.16.0 made `enableTestValueAnalysis` opt-in (default off) for
> performance, and tsmap took that default — so `perWaferTestStats` is no longer
> populated in tsmap's render path, and `buildTestBoxplotData`/`buildTestHistogramData`
> remain the source of box-plot/histogram stats. **However** 0.16.0 also added the
> *cheap* `computePerTestStats: true` option (the changelog explicitly recommends it
> for "box-plot / histogram panels that need distribution shape but not spatial
> findings") — but it produces **lot-level** `perTestStats`, not the **per-wafer ×
> per-test** five-number summary tsmap's per-wafer boxplot needs, and it is implied
> by `enableTestValueAnalysis` so there's still no cheap *per-wafer* path.
> **Suggested fix:** have `computePerTestStats: true` also populate
> `LotStatsSummary.perWaferTestStats` (per-wafer five-number summaries) *without*
> requiring the expensive `enableTestValueAnalysis` Welch pass. Then tsmap can
> finally retire its duplicated quantile logic in `aggregate.ts` and read per-wafer
> box-plot data straight from the cheap analysis path. Until then, tsmap's own
> raw-die computation stays — and is correct to keep.

### ~~11. Die hover tooltip has no row cap — becomes taller than the viewport with many tests~~ (fixed in v0.13.4)

**Where:** wmap die tooltip renderer (wherever per-die `testValues` are listed in the hover popup).

**Problem:** When a die has many `testValues` (e.g. 30+ selected tests after filtering), the tooltip grows to match, easily exceeding the viewport height. There is no cap on the number of rows shown and no scrolling or truncation.

**Fix applied:** `buildHoverText` now accepts a `testLimit` parameter (default 12). When the die has more tests than the limit, the remainder are replaced with `…and N more`. `RenderOptions.tooltipTestLimit` threads the value through from `renderWaferMap`. tsmap can pass `tooltipTestLimit` if it needs a different cap.

---

### 10. IPC data transfer and wmap input format are not designed for large test counts — investigation ongoing

**Where:** tsmap `src-tauri/src/commands/` (all parsers), wmap `packages/renderer/buildWaferMap.ts` (`DieResult` input type).

**Problem:** The current data path is:

1. Rust parser → JSON serialisation (serde) → Tauri IPC bridge → JS JSON.parse → `DieResult[]` objects → `buildWaferMap`

At production scale — 50,000 dies × hundreds of parametric tests per wafer — this becomes a significant bottleneck at every step: JSON text volume, serialisation/deserialisation cost, per-object heap allocation in JS, and GC pressure. The `DieResult` format is also row-oriented (one object per die, with a `testValues` map), which is cache-unfriendly for the column-oriented access patterns that rendering and statistics use (e.g. "all values for test #42 across all dies").

Die-level metadata (arbitrary string/number fields attached to each die, e.g. site ID, temperature, serial number) compounds the problem further — it currently travels in the same per-die object and is not used by wmap's rendering at all.

**Suggested directions:**

1. **Columnar typed-array input to `buildWaferMap`** — instead of `DieResult[]`, accept a columnar structure: `{ x: Int32Array, y: Int32Array, hbin?: Uint16Array, sbin?: Uint16Array, testValues?: { [testNumber: string]: Float64Array }, metadata?: Record<string, unknown[]> }`. This maps directly to how rendering and stats consume the data, eliminates per-die object allocation, and transfers as raw binary over the IPC bridge. Metadata can be separated into a parallel array structure that wmap stores but does not process.

2. **Rust → WASM for data processing** — since both tsmap and wmap are owned projects, moving wmap's `buildWaferMap` (geometry inference, grid construction, retest policy) to a Rust/WASM module is viable. The Rust parser would produce the typed arrays directly in WASM-shared memory, bypassing the IPC bridge and JSON entirely for the hot path. Analysis (`analyzeWaferMap`) could also move to WASM. This is a larger undertaking but eliminates the serialisation round-trip completely.

**Investigation completed (2026-06-08):** Full pipeline analysis and benchmarking done. Key findings:

- **Tier 1 fixes shipped** (no API breakage): merged `buildView` min/max scans, replaced per-die object spread with `Float64Array` coord table (1.9 MB → 314 KB per rotated view at 20k dies), merged bin-count loop, replaced O(D) hover scan with uniform-grid spatial index (48× faster at 20k dies). See `scripts/bench-buildview.mjs` for the canonical benchmark.
- **Synthetic scale dataset** generated: `site/data/large-parametric.csv` — 5 wafers × 2709 dies × 200 tests (~24 MB) for future profiling.
- **Remaining bottleneck in `buildView`** is `pushDieRectangles` loop itself — irreducible O(D), ~2–3 ms at 20k dies. Memoising the ViewRect array (Tier 2) would help for pan/zoom-only redraws.
- **IPC/columnar redesign** (Tier 3): still requires profiling with a real large STDF file to confirm the IPC boundary is actually the bottleneck. Columnar input to `buildWaferMap` is a breaking API change; Rust/WASM is viable but large effort. Do not start without profiling data.
- **Recommended next step:** Load a real production STDF (50k+ dies, 100+ tests) in tsmap with DevTools performance timeline open. Measure Rust parse, IPC transfer, JS JSON.parse, `buildWaferMap`, `analyzeWaferMap` separately before designing Tier 2/3 changes.
- **Parser throughput benchmark (2026-06-08):** Synthetic STDF files — `packages/parsers/examples/bench_stdf.rs` measures native `parse_stdf_from_bytes` in isolation. Results: 663 dies × 4 tests → 68ms; 5,585 dies × 11 tests → 720ms; 266,325 dies × 51 tests → 34.7s. Throughput is ~7,700 dies/sec regardless of scale, confirming the bottleneck is per-record iteration cost in `rust-stdf`'s `StdfRecord` enum (HashMap allocation per PTR). WASM would be ~50–70% of this. For typical production files (1–3 wafers, 10–20 tests, <5k dies) native parse is under 1s and WASM under 2s — acceptable. For very large sweeps (25 wafers × 50 tests × 10k dies) Rust parse alone takes 35s, making a re-implementation that avoids per-record allocation worthwhile.

---

### ~~12. No save/download hook in the render API — host must monkey-patch the DOM~~ (fixed in 0.13.5)

**Where:** wmap canvas-adapter toolbar (the PNG download button in `renderWaferMap` / `renderWaferGallery`). It triggers a download with `<a download href="blob:…">.click()`.

**Problem:** A host that needs to redirect the save (Tauri desktop, where `<a download>` is suppressed and the file must go through a native dialog) has no API to intercept it. tsmap currently monkey-patches `HTMLAnchorElement.prototype.click` globally (`src/main.ts`, capture-phase guard for `download && href.startsWith('blob:')`) to grab the blob and route it to `platform.savePng`. This is a fragile global hack: it affects every anchor on the page and breaks if wmap changes its download mechanism.

**Suggested fix:** Add an optional `onSaveImage?(blob: Blob, suggestedName: string): void | Promise<void>` to the render options. When provided, the toolbar calls it instead of performing the `<a download>` click; when absent, behaviour is unchanged. Hosts then handle persistence (native dialog, server upload, etc.) without touching global prototypes.

---

### ~~14. `enableTestValueAnalysis` computation model doesn't match tsmap's usage pattern~~ (fixed in 0.16.0)

**Where:** `analyzeWaferMap` / `analyzeWaferLot` in wmap stats.

**Problem:** When `enableTestValueAnalysis: true` is passed, wmap eagerly computes per-test quartiles **and** five additional Welch t-test region-family passes (edge/corner/center/quadrant/half-wafer) for every test, on every wafer, up-front. This is 5–8× slower than `false` (benchmarked: ~32ms vs ~160ms per wafer at 1w × 2k dies × 50 tests). tsmap used this flag to get `perWaferTestStats` for its boxplot panels, but only ever needs the quartiles — never the regional Welch findings. The eager all-tests all-regions model caused severe UI hangs on large lots (25w × 10k dies × 400 tests).

**Workaround in tsmap:** Reverted to computing boxplot quartiles directly from die data in tsmap's own `buildTestBoxplotData` / `buildTrendData` functions (lazy, one test at a time, only on panel interaction). `analyzeWaferMap` is now called without the flag.

**Suggested fix in wmap:** Split the flag into two independent options: (a) `computePerTestStats: true` — only the quartile scan, no region passes, cheap; (b) `enableTestValueAnalysis: true` — full regional Welch t-tests, expensive, opt-in separately. This lets hosts get lightweight quartiles without paying for spatial analysis they don't use.

**Fix applied (wmap, pending release):** Both parts done.
1. **The flag was split exactly as suggested.** `computePerTestStats: true` runs only the per-test quartile scan (→ `StatsSummary.stats.perTestStats` / `LotStatsSummary.perWaferTestStats`); `enableTestValueAnalysis: true` runs the full regional Welch findings pass (and implies `perTestStats`). Both now **default to `false`** — the old default-`true` on `enableTestValueAnalysis` was the root cause: any caller not opting out paid the expensive pass. This is a breaking default change (wmap minor bump).
2. **The expensive pass itself was rewritten** to be allocation-light (columnar single-pass running sums per region; "rest of wafer" derived by subtraction, never materialised). ~2–2.3× faster with byte-identical findings (p-values exact; effect sizes within ~1e-12). Profiling had shown ~95% of analysis cost was array/GC churn around the Welch math, not the math — so WASM was considered and rejected (it would only touch the ~2% that is arithmetic and reintroduce the IPC marshalling of issue #10).

**Net effect for tsmap:** tsmap already calls `analyzeWaferMap(waferMap)` with no options and reads only the panel's yield/bin/ring sections (never the test-value findings or `perTestStats`), so under the new default it **automatically gets the fast path with no code change** — analysis drops from ≈285–867 ms/wafer to ≈23–31 ms/wafer, and a 10-wafer lot from multiple seconds to ≈293 ms. If tsmap later wants wmap-computed box-plot quartiles instead of its own `buildTestBoxplotData`, it can now pass `computePerTestStats: true` (≈149 ms at 2.8k × 200 tests) without triggering the Welch pass. **Adoption note:** because tsmap calls `analyzeWaferMap` with no options, bumping the wmap dependency to 0.16.0 *automatically* picks up the fast default — no tsmap code change required, but it is a behaviour change (the panel no longer carries regional test-value findings, which tsmap never displayed).

### ~~15. `stdf_test_names` / `atdf_test_names` WASM functions return wrong shape~~ (fixed in testdata-parser 0.2.3)

**Where:** `packages/parsers/src/lib.rs` WASM exports; published `@paulrobins/testdata-parser`.

**Problem:** The Rust source for `parse_stdf_test_names` returns `ScanResult { test_defs, die_count }` which should serialise as `{ testDefs: {...}, dieCount: N }`. However the published WASM package (≤ 0.2.2) returned just the raw `HashMap<String, TestDef>` — a flat object keyed by test number with no `dieCount` field. This meant in the browser/WASM path, `scanResult.testDefs` was `undefined` and `scanResult.dieCount` was `undefined`.

**Impact:** In the web app, `stdfTestNames` / `atdfTestNames` always threw "Cannot convert undefined or null to object". The scan fell back to unfiltered parse and the test selector overlay never appeared in the browser. The desktop (native Rust) path was unaffected.

**Fix:** Rebuilt and republished `@paulrobins/testdata-parser` 0.2.3 with the correct `ScanResult` struct. A temporary `normaliseScanResult` shim was used in `platform.ts` during the window between the Rust fix and the WASM publish; the shim has been removed in 0.2.3.

---

### ~~13. No structured warnings channel on `WaferMapResult` / `analyzeWaferMap`~~ (fixed in 0.13.5)

**Where:** wmap `buildWaferMap` and `analyzeWaferMap` return shapes.

**Problem:** wmap performs silent inference (pitch/center/flat-notch) and `llms.txt` documents principles like hbin/sbin independence and "do not fabricate missing bins". When the host *does* fabricate (e.g. tsmap mirrors hard bin onto a 65535 soft-bin sentinel), there is nowhere in wmap's own pipeline to surface that — tsmap added a `warnings: string[]` field to its parser output (`ParsedStdf.warnings`, `testdata-parser` ≥ 0.2.2) and logs them, but wmap's inference decisions still go to `console.warn` only. Mirrors the reviewer's "add a `warnings: []` array" suggestion.

**Suggested fix:** Add `warnings: string[]` to `WaferMapResult` (and/or `StatsSummary`) carrying inference advisories ("pitch inferred at confidence 0.6", "partial wafer — center inferred from bounding box midpoint"). Hosts can then display these instead of losing them to the console.

### 16. Toolbar icon set is internal — host cannot import it to match wmap's iconography

**Where:** wmap `packages/canvas-adapter/icons.ts` (the `ICONS` map) and the gallery-card expand SVG in `renderWaferGallery.ts`.

**Problem:** tsmap renders its own chart-card and overlay chrome (PNG save, expand, fullscreen, close, help) alongside embedded wmap wafer maps, so the user sees both UIs at once. To keep them visually consistent, tsmap's icon buttons should use the *same* icons as wmap. But `icons.ts` is marked "Internal shared module. Do not re-export from index.ts." and is not exported from the package, so tsmap cannot import the SVGs. tsmap currently **copies** the SVG strings verbatim into its own `src/charts/icons.ts` (`download`/camera, gallery-card `expand`, Lucide `x`/`minimize`, `help`). This couples the two repos by copy-paste: if wmap redesigns its icons, tsmap silently drifts.

**Suggested fix in wmap:** Export the icon set (or a curated subset) as a public API — e.g. `export const ICONS` from a stable entry point, or a small `getIcon(name)` helper — so host apps can import the exact same SVGs and stay in sync automatically. Document which icon keys are stable/public. This generalises beyond tsmap to any host wanting to match wmap's look.

### ~~17. Expand-modal fullscreen button uses the real Fullscreen API — dead in macOS WKWebView~~ (fixed in 0.16.0)

**Where:** `packages/canvas-adapter/toolbar.ts` — the modal opened by `openModal`. The fullscreen button click handler (line ~848), the `F`/`Esc` key handler in `onKeyDown` (~902–910), the `onFsChange` handler (~864), and the `document.addEventListener('fullscreenchange', onFsChange)` registration (~939). Also `getMenuParent`-style `document.fullscreenElement` reads at ~170 and ~333.

**Problem:** The modal toggles fullscreen with the **unprefixed** Fullscreen API — `box.requestFullscreen()`, `document.exitFullscreen()`, `document.fullscreenElement`, and the `fullscreenchange` event. macOS Tauri runs on WKWebView (WebKit), which:

1. Only exposes the **`webkit`-prefixed** variants (`webkitRequestFullscreen`, `webkitFullscreenElement`, `webkitfullscreenchange`) — the unprefixed names are `undefined`, so `box.requestFullscreen` throws/no-ops and the button does nothing; and
2. Has **element fullscreen disabled at the native level** unless the host sets WKWebView's `isElementFullscreenEnabled` / `fullScreenEnabled` preference. In Tauri that requires `app.macOSPrivateApi: true`, which uses Apple **private API** and blocks Mac App Store distribution.

So even a prefixed shim isn't enough on macOS Tauri without opting into private API. The `onFullscreenChange(isFs, box)` callback also never fires there, so consumers that reparent the tooltip into the fullscreen box (`renderWaferMap.ts` ~846, `renderWaferGallery.ts` ~1518) silently break too.

**Discovered in tsmap:** tsmap's own expand/help modals had the identical bug. Fixed there by **dropping the real Fullscreen API entirely** in favour of a CSS maximize — the modal box grows to `100vw/100vh` via a toggled class/inline style. This behaves identically on every target (Linux/Windows/macOS Tauri + all web browsers incl. Safari) with no native config and no private API. See `src/charts/chartShell.ts` (`toggleFullscreen` → `applyMaximize`) and `index.html` `.help-modal.maximized`.

**Suggested fix in wmap:** Replace the Fullscreen API in `openModal` with a CSS maximize toggle (size the box to fill its `position: fixed; inset: 0` backdrop). Keep the existing `onFullscreenChange(isFs, box)` callback firing on the synthetic toggle so tooltip-reparenting consumers keep working. Keep the close button visible while maximized (no OS chrome to escape) and let `Esc` always close. This removes the macOS dependency on `macOSPrivateApi` and the prefixed-API portability problem in one move.

**Fix applied:** `openModal` in `packages/canvas-adapter/toolbar.ts` now maximizes via a CSS toggle (`setMaximized` sizes the box to `100vw`/`100vh`) — the real Fullscreen API (`requestFullscreen`/`exitFullscreen`/`fullscreenchange`) is gone entirely. `onFullscreenChange(isMaximized, box)` still fires on the synthetic toggle, so the tooltip-reparenting consumers in `renderWaferMap.ts`/`renderWaferGallery.ts` are unchanged. `Esc` always closes; the close button stays visible while maximized. The `document.fullscreenElement` reads that routed menus/submenus into the fullscreen element were dropped (`menuRootFor` already walks up to `.wmap-modal-box`; the value-mode cascade submenu now appends into its parent menu's stacking root).

### ~~18. Hover tooltips require per-die duplication of wafer-level metadata~~ (fixed in v0.15.0)

**Where:** wmap `packages/renderer/buildView.ts` `buildHoverText` (read provenance only from `die.metadata`) and `packages/core/metadata.ts` `DieMetadata` (named wafer-level fields `lotId`/`waferId`/`deviceType`/`testProgram`/`temperature`).

**Problem:** Provenance appeared in die hover tooltips only when set per-die on `DieMetadata`. But lot/program/temperature/product are wafer-level facts — a die cannot differ from its wafer on them. tsmap knows them at the wafer level (`WaferSource`), so to get tooltips it would have had to copy identical values onto every `DieResult` (up to ~500k per lot), bloating memory and mutating the wmap-bound `results` array (which threatens tsmap's shared-`WaferSource`-by-reference invariant). The tooltip already had the wafer's `WaferMetadata` (`view.metadata`) in scope but ignored it.

**Suggested fix in wmap:** Tooltip should read wafer-level metadata from `waferConfig.metadata` as the base and let any per-die key override it; drop the redundant wafer-level named fields from `DieMetadata`.

**Fix applied (0.15.0):** `buildHoverText` gained a trailing `waferMeta?` parameter; it now merges `{ ...waferMeta, ...die.metadata }` (wafer base, die override), omitting `waferId`. `renderWaferMap` passes `result.metadata` automatically, so gallery cards benefit too. The wafer-level named fields were removed from `DieMetadata` (open index signature retained for genuinely per-die annotations). tsmap now supplies wafer metadata once via `toWmapWaferMeta(source, waferId)` and gets full tooltips with no per-die cost.

### ~~19. `WaferMetadata`/`DieMetadata` types not re-exported from `/renderer`~~ (fixed in v0.15.0)

**Where:** wmap `packages/renderer/index.ts`.

**Problem:** `WaferMetadata` (used to build `WaferConfig.metadata`) and `DieMetadata` are renderer-input concepts but were re-exported only from `/core`, so a consumer building renderer input had to import the renderer functions from `/renderer` and these types from `/core`.

**Fix applied (0.15.0):** `packages/renderer/index.ts` now `export type { WaferMetadata, DieMetadata } from '../core/metadata.js'`.

### ~~20. tsmap/wmap capability boundary — charts ↔ summary-panel redundancy~~ (decided 2026-06-24)

**Context:** tsmap has become a proving-ground for analysis/visualisation ideas. Several now overlap what wmap's summary panel already does, and the strategic question is *where each capability should ultimately live* — tsmap-only, or promoted into wmap so every wmap host benefits. The owner is not against moving more into wmap when that's the best home; the point of this entry is to make the boundary a deliberate, logged decision rather than drift.

**The redundancy (centred on the gallery LOT panel, which is at the same scope as tsmap's charts page):**

| Metric | wmap gallery lot panel (`renderLotSummaryContent`) | tsmap charts page | Overlap |
|--------|---------------------------------------------------|-------------------|---------|
| Per-wafer yield | "Per-wafer yield" list | "Yield by wafer" bars | direct duplication |
| Lot bin breakdown | "Lot bin" (pooled) | "Bin pareto" (pooled) | direct duplication |
| Per-test value stats | "Lot test value" numbers | Boxplot + Histogram | strong (numbers vs. distribution) |
| Ring / quadrant / site / findings | yes | — | panel only |
| Trend, correlation, scatter, **metadata/lot faceting** | — | yes | charts only |

**Clean split:** the **panel** uniquely owns spatial + significance *findings* (always beside the maps); the **charts** uniquely own trends, correlation, scatter, and **group/compare by metadata or lot** (tsmap's faceting work). The middle band (per-wafer yield, bin pareto, per-test summary) is duplicated.

**Capabilities tsmap built that are wmap-promotion candidates** (each: does every wmap host want this? if yes, it likely belongs in wmap):
- **Faceting / group-compare** by lot/program/temperature/date — combined yield-per-group, boxplot-per-group, overlaid histograms, clustered bin pareto, scatter-coloured-by-group, correlation restricted-to-group. (tsmap `src/charts/`.)
- **Generic metadata model** — `{key,value}` fields with host-side curation (already partly in wmap via `WaferMetadata`'s open index; the *faceting* on top is tsmap's).
- **Interactive distribution charts** (boxplot, histogram, correlation matrix, scatter) vs. the panel's numeric summaries.

**Decision (2026-06-24) — option (a), boundary drawn by data scope, not widget type:**

- **wmap panel owns** single-population summaries (per-wafer yield, pooled bin pareto, per-test value numbers, ring/quadrant) **and** spatial + significance *findings*. These are one-lot, no-grouping facts that belong beside the maps. No change to the panel.
- **tsmap charts own** faceting / group-compare / split-by (yield-per-group, boxplot-per-group, overlaid histograms, clustered pareto, scatter/correlation coloured-by-group) **and** interactive distributions (boxplot, histogram, correlation, scatter). This is a cross-population analytics surface.
- **The middle-band duplication stays — it is intentional.** The panel gives the engineer the exact pooled figure beside the wafer; the chart gives distribution shape and lets them split by lot/program/temperature. Same fact, two reading modes. Not trimmed.

**Faceting is NOT promoted into wmap.** It depends on three things wmap's panel deliberately does not carry: the generic `{key,value}` metadata model (the *storage* already exists in wmap via `WaferMetadata`'s open index — but the *faceting on top* does not), a host-curated label/which-to-facet table (tsmap `src/metadata.ts` `FIELD_META`), and a charting runtime. Promoting it would force every wmap host onto tsmap's curation conventions and pull a chart engine into the renderer-agnostic, DOM-light panel. Faceting stays host-side.

No code change in either repo — this entry records the boundary so future work doesn't grow faceting into the panel by drift. See the tsmap plan file "Phase 8" section for the fuller analysis.

### ~~21. No render teardown — wmap's internal observers leak when its container is removed~~ (already provided — `controller.destroy()`)

**Where:** wmap `renderWaferMap` / `renderWaferGallery` (`packages/renderer`). They attach internal `ResizeObserver`s (and likely other listeners) to elements inside the host-provided container, but return nothing and expose no `dispose()` / cleanup handle.

**Problem:** tsmap now renders maps into a **transient modal** (charts drilldown — `openWaferModal` in `src/main.ts`). When the modal closes we `backdrop.remove()`, which detaches the wmap-rendered subtree. wmap's observers/listeners are never explicitly disconnected; they linger on the detached nodes until GC. The same latent leak exists on every `container.innerHTML = ''` swap in `renderWaferView`, but the modal makes it frequent (open/close per drilldown). tsmap can't clean this up itself because the observers live inside wmap and aren't registered in tsmap's own `trackObserver` registry (and that registry must NOT be flushed on modal close — it holds the live charts grid's observers).

**Suggested fix:** have `renderWaferMap` / `renderWaferGallery` return a disposer (e.g. `{ dispose(): void }`) that disconnects every observer/listener they created, so a host embedding maps in modals/tabs can tear down cleanly on close. Alternatively, observe container detachment internally and self-disconnect. Until then the leak is benign (detached nodes are GC-eligible once the host drops its refs) but real.

**Resolution — no wmap change needed; the API already exists.** The premise that the
controllers "return nothing and expose no `dispose()`" is incorrect for the current
library. Both `renderWaferMap` and `renderWaferGallery` already return a controller with
a public, typed `destroy(): void` ("Remove all event listeners and DOM elements") that
performs exactly the teardown requested:

- `renderWaferMap().destroy()` (`packages/canvas-adapter/renderWaferMap.ts`) calls
  `resizeObserver.disconnect()`, removes every canvas pointer/wheel/key/click listener,
  removes the `window` `blur` listener and the DPR `matchMedia` `change` listener,
  removes the document-level menu-close capture listener, closes any open modal/menu,
  hides (never destroys) the shared singleton tooltip, and removes all DOM it appended
  (`canvasWrap`, toolbar, summary-panel wrappers).
- `renderWaferGallery().destroy()` (`packages/canvas-adapter/renderWaferGallery.ts`)
  cascades `destroy()` to every card controller, disconnects the grid `ResizeObserver`,
  removes its document/window listeners, closes the modal, and removes its DOM.

**Adoption in tsmap (done 2026-06-26):** every wmap render now captures its controller and
destroys it before its container is detached/cleared:
- `openWaferModal` (`src/main.ts`) — `render` returns the controller; `close()` calls
  `controller.destroy()` before `backdrop.remove()`.
- `renderWaferView` (full-window map/gallery) — stores the controller in module-level
  `mainViewController`; `destroyMainView()` is called before every `container.innerHTML = ''`
  / view swap (`renderWaferView` itself, `renderChartsViewWork`, `showLoadingState`,
  `showEmptyState`).
This disconnects wmap's observers/listeners deterministically — no need to register them in
tsmap's `trackObserver` registry, and the charts-grid observers are untouched. No library
change required.

### ~~22. Toolbar menus/tooltips are unreachable when wmap renders inside a host modal that isn't a `.wmap-modal-box`~~ (fixed in wmap — pending release)

**Where:** wmap `packages/canvas-adapter/toolbar.js` — `menuRootFor(anchor)` (walks ancestors for a `.wmap-modal-box`, else falls back to `document.body`) and the tooltip reparenting in `renderWaferMap.js`. All menus/tooltips are positioned `position: fixed` with `z-index: var(--wmap-z, 100)` (menus) / `calc(var(--wmap-z, 100) + 1)` (tooltips).

**Problem:** tsmap renders a wafer map into its **own** modal (`openWaferModal` in `src/main.ts`) — opened from a chart drilldown (pareto bar → stack map, yield bar → bin map). That modal is a plain host `<div>`, not wmap's `openModal` box, so it has neither the `wmap-modal-box` class nor a `--wmap-z` custom property. Consequences:

- `menuRootFor()` finds no `.wmap-modal-box` ancestor and appends the plot-mode dropdown (and other menus) to `document.body` at `z-index: 100`.
- tsmap's modal backdrop is `z-index: 200` and its box `z-index: 201`, so every wmap menu renders **behind** the modal. The toolbar buttons fire correctly but their menus (and tooltips) are hidden underneath — the toolbar appears completely dead to the user.

This is the inverse of resolved issue #5: #5 handed stacking control to the host via `--wmap-z`, but wmap only sets that variable and the `wmap-modal-box` hook on **its own** modal. A host embedding a wmap render in a host-owned modal has no documented contract for making toolbar menus land above it.

**Suggested fix (any one):**

1. Document the contract: "to embed a wmap render inside your own modal, give the modal element `class="wmap-modal-box"` and set `--wmap-z` above your modal's z-index." (Cheapest; this is what tsmap now relies on.)
2. Add a render option (e.g. `menuRoot?: HTMLElement` or `zIndex?: number`) so the host can pass the container/stacking value explicitly instead of relying on an undocumented class name.
3. Have `menuRootFor` fall back to the wmap render container (or the toolbar's offset parent) rather than `document.body`, so menus inherit the host modal's stacking context automatically.

**Workaround in tsmap (2026-06-26):** two parts in `openWaferModal` (`src/main.ts`):

1. The box carries `class="wmap-modal-box"` so `menuRootFor` reparents the plot-mode dropdown *into* the box.
2. `--wmap-z:300` is set on **`document.documentElement`** (not the box) for the modal's lifetime, restored on close.

Part 2 is essential and was missed on the first attempt: setting `--wmap-z` on the box only fixes overlays wmap appends inside the box (the plot-mode menu). But several wmap overlays append to **`document.body`**, outside the box, and read `--wmap-z` from `:root` — the singleton **die tooltip** (`createTooltip` → `document.body.appendChild`), the **user-guide modal** (help button), and the **expand modal** (`openModal` → `document.body.appendChild(backdrop)`, which also *reparents the canvas into its box*, so a too-low z made the canvas appear to blank). All of these stayed at z 100 behind the tsmap modal until `--wmap-z` was raised on the root. This whole dance depends on the undocumented `wmap-modal-box` class and the `--wmap-z` variable — options 1/2 above would make it a supported contract.

**Fix applied (wmap, pending release) — see issue #23 for the unified resolution.** Both the per-render `zIndex` option and the safe-by-default stacking landed together; this addresses #22 and #23 as one design fix.

### ~~23. Overlay stacking has no first-class host API — z-index issues keep recurring (design recommendation)~~ (fixed in wmap — pending release)

**Why this is its own entry:** stacking has bitten us repeatedly — issue #5 (toolbar at `z 9998/9999` overriding host overlays), then issue #22 (toolbar menus/tooltips/expand-modal *behind* a host modal). #5 and #22 are the two opposite failure directions of the *same* missing abstraction. This entry records the root cause and the recommended API change so the wmap implementation plan treats it as a deliberate design fix, not a third one-off patch.

**Root cause — two uncoupled axes the host must align by hand.** Every wmap transient overlay (toolbar dropdowns, die tooltip, expand modal backdrop/box, user-guide modal) is positioned by two independent decisions made in different places:

1. **Stacking value** — a CSS variable `--wmap-z` (default `100`), read from wherever the element sits in the cascade.
2. **DOM attach point** — `menuRootFor()` attaches to the nearest `.wmap-modal-box` ancestor, *else* falls back to `document.body`.

Because some overlays attach inside a wmap box and others escape to `document.body`, "set the stacking correctly" really means "enumerate every escape-to-body overlay and ensure the `--wmap-z` it inherits is high enough" — which is exactly the bug hit twice in #22. Two structural traps make it worse:

- **The default `100` is unsafe.** It sits *below* almost any app's own modal layer (200, 1000, 9999…), and the failure mode is silent: the overlay renders *behind* the host UI with no error. An embedder gets a "dead toolbar" / "blank canvas" with nothing in the console.
- **The host's only lever is a global, undocumented CSS variable.** Controlling stacking means mutating `--wmap-z` on `document.documentElement` (so escape-to-body overlays inherit it) and remembering to restore it — global mutation for what should be a per-render concern, keyed off internal names (`--wmap-z`, `.wmap-modal-box`) reverse-engineered from the dist.

**Recommended fix (in priority order):**

1. **First-class per-render stacking input.** Add `renderWaferMap(el, map, { zIndex })` (and the gallery equivalent). wmap writes that value onto *its own* overlay elements directly rather than reading an inherited `:root` variable, so the attach-point axis stops mattering — an overlay appended to `document.body` and one appended inside a box both stack at the host-specified value. This is the real fix and removes the entire "which ancestor do I inherit from" failure class.
2. **Safe-by-default stacking.** If no `zIndex` is given, default wmap transient overlays to the top of the stacking order (a very high constant, or an explicit "wmap renders transient overlays above app content" contract) instead of `100`. Most embedders expect overlays to "just appear on top" with no configuration.
3. **Document the embedding contract** for the interim: to embed a wmap render inside a host-owned modal, set `--wmap-z` (above the host modal's z-index) on an ancestor that *all* wmap overlays inherit from — in practice `document.documentElement`, because several overlays append to `document.body`. Name `--wmap-z` and `.wmap-modal-box` as the supported public hooks.

**tsmap status:** working today via the issue #22 workaround (`--wmap-z:300` on `document.documentElement` for the modal's lifetime). That is a host-side patch over a missing API; options 1–2 here would let tsmap drop the global-variable mutation entirely and just pass a `zIndex` per render.

**Fix applied (wmap, pending release):** options 1 and 2 both done; option 3 documented.

1. **Per-render `zIndex`** added to `RenderOptions` (`renderWaferMap`) and `GalleryOptions` (`renderWaferGallery`). wmap applies it for the render's lifetime and restores the previous stacking on `controller.destroy()`. Implemented via `applyOverlayZ(zIndex)` in `packages/canvas-adapter/toolbar.ts` — it writes `--wmap-z` onto `document.documentElement` so the body-escaping overlays (tooltip, expand/help modal backdrops) inherit it, returning a disposer the controller calls on teardown. (wmap kept the CSS-variable mechanism rather than writing inline z-index onto every overlay element; the host-facing result is the same — one `zIndex` value per render, no manual global mutation.)
2. **Safe-by-default stacking:** the `--wmap-z` fallback changed from `100` to `6000` (a single `DEFAULT_OVERLAY_Z` constant, surfaced as the `Z_BASE`/`Z_ABOVE`/`Z_ABOVE2` z-index strings used across `toolbar.ts`/`renderWaferMap.ts`). Overlays now appear above typical app modal layers with no configuration. Logged as a default change (CHANGELOG `### Changed`), not breaking — the only way to regress is to have *deliberately* placed a host overlay between `100` and `6000` to cover wmap's own menus, which is not a sensible config; any host that already set `--wmap-z` is unaffected.
3. **Embedding contract documented** in `docs/api.md` §5.4 "Overlay z-index", naming `zIndex` and `--wmap-z` as the supported public hooks.

**Net effect for tsmap:** the issue #22 workaround in `openWaferModal` (`--wmap-z:300` on `document.documentElement` + `class="wmap-modal-box"`) can be replaced with a single `zIndex` passed to the wmap render (set above tsmap's modal box z-index, e.g. `zIndex: 300`). The `wmap-modal-box` class hint is still useful for reparenting menus *into* the host box, but the global-variable mutation and its save/restore dance can be dropped once tsmap bumps to the release carrying this fix. With no change at all, tsmap's modal-embedded maps also stop rendering behind the modal by default (safe-by-default), though tsmap should still pass `zIndex` if its own overlays exceed `6000`.

**Adopted in tsmap (2026-06-26, wmap 0.16.1):** `openWaferModal` now passes `zIndex: WAFER_MODAL_OVERLAY_Z` (= 300, a module constant clearing the modal box's z 201) to all four wmap renders (`renderWaferMap` ×3, `renderWaferGallery` ×1). The `--wmap-z` mutation on `document.documentElement` and its save/restore in `close()` are deleted — the controller's `destroy()` restores wmap's stacking. The `class="wmap-modal-box"` on the box is kept (still reparents the plot-mode menu into the box). `npm run check` clean.

### 24. In-app user-guide modal has no print / save-as-PDF affordance

**Where:** wmap `packages/canvas-adapter/toolbar.ts` (the guide/help modal opened from the toolbar help button) + `packages/canvas-adapter/userGuideHtml.ts` (the generated guide HTML).

**Problem:** wmap's in-app guide modal is read-only — there's no way for a user to print the guide or keep an offline copy. tsmap hit the same gap and added a "Print or save as PDF" button to its own guide modal: a small header button that opens the guide as a standalone light-themed HTML page in the system browser (via the host's report-opener), where the browser's native Print → Save-as-PDF handles both. In tsmap this is `userGuidePrintHtml()` (a light, print-friendly wrapper around the guide fragment) + `platform.openReport()`; the button lives in the shared `openModal` via a `headerActions` option. It works on Tauri (Linux/macOS/Windows) and web with no per-platform code because it just opens a browser page.

**Why it may belong in wmap:** every wmap host that shows the guide modal has the same read-only limitation, and the fix is self-contained (the guide HTML already exists; it just needs a light-themed standalone wrapper + a way to open it). If wmap added it, all hosts get printable docs for free. The one host dependency is "open this HTML somewhere a browser can print it" — in a pure-web host that's `window.open`; wmap already opens HTML reports (see resolved issue #2 `setReportOpener`), so the same opener hook applies.

**Suggested fix in wmap:**
1. Generate (or expose) a standalone, light-themed print variant of the guide HTML — the in-app modal styling is theme-aware, but a print/PDF copy should be hardcoded light (dark wastes ink, reads poorly on paper), mirroring tsmap's `userGuidePrint.ts`.
2. Add a print/save button to the guide modal header that routes the print HTML through the existing report-opener (`setReportOpener`), so hosts that already wire report opening get printing with no extra plumbing.

**tsmap status:** implemented host-side (tsmap-only) for now — `src/userGuidePrint.ts` + a `headerActions` print button on the guide modal. If wmap adopts this, tsmap's guide-print could move to the wmap guide modal, though tsmap's guide is a *different document* from wmap's (tsmap-specific content), so tsmap would still need its own print HTML — the reusable part is the modal button + report-opener wiring, not the content.

**Related (styling convergence, not logged as its own issue):** tsmap aligned its in-app guide typography to wmap's (14px body, roomier zebra-striped tables, centered column) but kept it theme-aware via `--var` tokens (wmap's guide is hardcoded light). If wmap ever exports its guide styling as reusable CSS, the two could converge instead of tsmap hand-matching — but that's low value; noting it here so the alignment is a recorded choice, not drift.

**Update 2026-07-12 — no longer motivated by tsmap.** tsmap's guide is no longer a modal at all (see #32) — it's a standalone HTML page opened directly in the system browser, where native Ctrl+P / Save-as-PDF already works with zero extra plumbing. `userGuidePrint.ts` and the guide's `headerActions` print button have been deleted from tsmap. This issue may still be worth fixing in wmap on its own merits (wmap's own guide modal is still read-only for every host), but tsmap is no longer the motivating use case and won't consume the fix if wmap adds it.

### ~~25. wmap render chrome has no theming — hardcoded-light island in a dark host; needs a token system (light/dark/custom)~~ (fixed in v0.17.0)

**Where:** wmap `packages/canvas-adapter/` — the canvas background (`toCanvas.ts:29,141` default `background: '#f5f5f5'`), the toolbar (`toolbar.ts`, ~18 hardcoded hex colours), and the summary panel (`summaryPanel.ts`, ~30 hardcoded hex colours: `#fff`, `#2a3f5f`, `#506784`, `#e2e5ea`, …). There are **no `--wmap-*` colour custom properties** — the only `--wmap-` variable is `--wmap-z` (stacking). `colorScheme` exists but controls only the bin/value **data** palette, not the chrome.

**Problem:** wmap's rendered output (canvas background + DOM toolbar + DOM summary panel) is hardcoded light. A host running dark — tsmap follows the OS `prefers-color-scheme`, and the whole app goes dark — embeds a wmap map that stays bright white/grey, so the wafer view is a glaring light island in an otherwise dark UI. The host cannot fix this: the chrome colours are inline hex in wmap's own elements (not CSS classes a host stylesheet could override), and the canvas background is drawn with `ctx.fillStyle = '#f5f5f5'`. There is no option, CSS hook, or theme flag to darken any of it. This is the single most visible unthemed surface in a dark tsmap session.

**Why it belongs in wmap:** the colours live inside wmap's own render output; a host structurally cannot reach them. And it generalises — any wmap host that supports dark mode (or just wants to match its own brand chrome) hits this. This is the colour analogue of resolved issue #5/#23 (stacking): those moved a hardcoded concern (`z-index`) behind a host-settable `--wmap-z` custom property with a safe default. The same pattern fits here.

**Design decision (2026-07-01): a token system, not a light/dark boolean.** wmap embeds into arbitrary host apps, so theming must cover host-brand integration, not just the two OS schemes. A bare `theme: 'light' | 'dark'` is a one-way door (custom later = breaking change or a second API). The chosen model is the same one mature libraries use — ECharts (`registerTheme`), AG-Grid / MUI / Mantine (CSS-variable token sets), Plotly (`layout.template`): **design tokens are the primitive; light/dark are just presets built on them; custom themes fall out for free.** A full Plotly-style *named-template registry* was considered and rejected as over-built for a wafer-map library — it can be added non-breakingly later as sugar over the tokens if real demand appears. **Custom themes are supplied via CSS variables only** (no JS theme object), which keeps one mechanism and suits CSS-driven hosts like tsmap; a JS theme-object option can be added later if a host needs JS-config over stylesheets.

**Suggested fix in wmap (mirror the `--wmap-z` playbook), three layers:**

1. **Primitive — `--wmap-*` colour custom properties (does the real work).** Replace the hardcoded chrome hex (~18 in `toolbar.ts`, ~30 in `summaryPanel.ts`) with a named token set: `--wmap-bg`, `--wmap-surface`, `--wmap-border`, `--wmap-text`, `--wmap-text-muted`, `--wmap-accent`, plus semantic finding/warn tokens. Each carries its current value as a **light default** via `var(--wmap-text, #333)`, so existing hosts are untouched. DOM chrome (inline styles today) picks these up for free. **This layer alone delivers custom integration themes** — a host sets the variables on an ancestor.
2. **Presets — `theme?: 'light' | 'dark' | 'auto'` (the ergonomic 90% case).** A render option that applies a bundled token set so a host wanting plain dark writes one option, not a dozen variables. `'auto'` follows `prefers-color-scheme` (wmap has no such listener today — `renderWaferMap.ts` only watches DPR via `matchMedia`; a `(prefers-color-scheme: dark)` listener would be new). Presets just set the same `--wmap-*` tokens the custom path uses — no separate code path.
3. **Canvas — the hard part (must be done for dark at all, boolean or tokens).** The canvas is **not** just the `#f5f5f5` background: `toCanvas.ts` has ~24 hardcoded canvas colours — axis text (`#333`/`#555`/`#999`), grid/tick strokes (`rgba(0,0,0,…)`), label halos (`rgba(255,255,255,…)`), active-state blue (`#1a66cc`). A canvas can't inherit CSS, so each must be **resolved from the computed `--wmap-*` variable at draw time** (`getComputedStyle(container).getPropertyValue(...)`, cached per draw) and **re-resolved when the theme changes** (preset flip or `prefers-color-scheme`). `toCanvas` has two draw entry points (`toCanvas` at :132, `drawAxisTicks` at :1041) — resolve the palette once at the top of the draw and thread it through, rather than reading variables per-primitive.
4. **`colorScheme` (bin/value data palette) stays orthogonal** — dark chrome must work with any data palette. Check the default palettes read on a dark canvas (Viridis does; a light-tuned categorical palette may need a dark variant).

**Adopted in tsmap (2026-07-03, wmap 0.17.0):** wmap shipped exactly the design above — `--wmap-*` custom properties for chrome (toolbar, panels, menus, tooltip) *and* canvas (background, axis/legend text, active-selection accent), each with a light default baked in so unstyled hosts are unaffected, canvas colours resolved once per draw via `getComputedStyle` and re-resolved on a theme/`prefers-color-scheme` change. tsmap maps every `--wmap-*` token to its own theme-independent `--var` tokens in `index.html`'s base `:root` block (e.g. `--wmap-canvas-bg: var(--bg-app)`, `--wmap-icon-hover: var(--accent)`) — since those `--var` tokens are redefined per theme block, all 8 tsmap themes (Auto, Light, Light green, Solarized Light, High contrast, Dark, Nord, Solarized Dark) apply to the embedded wafer map automatically with zero per-theme `--wmap-*` duplication. `colorScheme` (the data/bin palette) is untouched, as designed. `npm run check` clean.

### ~~26. Toolbar expand button/E key is redundant when wmap is already rendered inside a host modal~~ (fixed in v0.18.0)

**Where:** wmap `packages/canvas-adapter/renderWaferMap.ts` — the expand button (`btnExpand`, previously always created ~line 835) and the `E`-key handler in `onKeyDown` (~line 1573), both of which open wmap's own built-in expand modal (`openExpandModal` → `openModal` in `toolbar.ts`) unless `onExpand` overrides the action.

**Problem:** tsmap opens some wafer maps inside its own modal (chart-click drilldowns via `openWaferModal` in `src/main.ts` — pareto bar → stack map, yield bar → bin map, etc.). In that context the host has already given the user an expanded/large view, so wmap's own expand button and `E` shortcut — which reparent the canvas into a *second*, wmap-owned modal on top of tsmap's modal — are a confusing, redundant nested-modal-on-modal affordance. This was investigated in depth (2026-07-05) and confirmed **not** to be a structural/z-index bug: both wmap's and tsmap's modals are plain `document.body` siblings with `position: fixed`, no portal/Shadow DOM/CSS containment traps content, and the historical "invisible expand modal" symptom (issues #22/#23) was purely a z-order ordering problem already fixed via the `zIndex` render option / `--wmap-z` custom property (which all wmap overlays read live, so there's no staleness risk). The remaining problem was purely UX redundancy plus an ongoing burden of keeping tsmap's own modal z-index and the `zIndex` passed to wmap in relative sync for a nested-modal surface that tsmap doesn't need at all.

Also found in the same investigation: wmap's existing `onExpand?: () => void` option (which can override the expand action) is **not used anywhere in tsmap** and has no history tying it to a tsmap request — its only real caller is `renderWaferGallery` wiring its own per-card modal internally. It was never a documented/sanctioned host hook (absent from `docs/api.md`'s `RenderOptions` field table), so it was not the right mechanism to reach for here; overriding the action still leaves a button that implies "make this bigger" when the host is already as big as it's going to get.

**Fix applied:** `showExpandButton?: boolean` added to `RenderOptions` in `packages/canvas-adapter/renderWaferMap.ts` (default `true`). Gates both the toolbar expand button and the `E`-key shortcut; does not touch `onExpand` or `renderWaferGallery`'s internal per-card expand behaviour, which is unaffected. Documented in `docs/api.md` §5.4 next to `showPlotModeSelector`.

**Action for tsmap:** available in wmap **v0.18.0** (released 2026-07-08) — bump `package.json`'s `wmap` pin from `^0.17.0` to `^0.18.0` to pick it up; the `showExpandButton: false` calls below already target the right API, they just need the dependency bump to take effect against a published version instead of the linked local checkout.

**Adopted in tsmap (2026-07-05, linked local wmap, pending publish):** `showExpandButton: false` added to the three `renderWaferMap` calls inside `openWaferModal` — `openSingleWafer`'s single-wafer branch, `openStackedBin`, `openTestValueWafer`. **Not** added to the `renderWaferGallery` call in `openSingleWafer`'s multi-wafer branch — `GalleryOptions` doesn't have this field (confirmed via `tsc` error: "Object literal may only specify known properties... Did you mean to write 'showHelpButton'?"), consistent with the fix note above ("does not touch... `renderWaferGallery`'s internal per-card expand behaviour"). The main full-window view (`renderWaferView`, the two calls outside `openWaferModal`) is deliberately untouched — its expand button is not redundant there. **New gap to log separately:** the gallery-in-modal case (subset-of-wafers drilldown) still has a redundant per-card expand affordance with no host override; `renderWaferGallery` would need its own `showExpandButton`-equivalent (or per-card `onExpand` override) to close this for the gallery path.

### ~~27a. Gallery card "detach into its own window" did nothing in tsmap~~ (fixed in v0.18.0: automatic in-page fallback)

**Where:** wmap `packages/canvas-adapter/renderWaferGallery.ts` (`openWindowForCard`) and `toolbar.ts` (`openDetachWindow`/`setDetachWindowOpener`), released in wmap **v0.18.0**.

**Problem:** wmap's gallery card expand button detaches a card into a real, separate `window.open()` window (not an in-page overlay), so it can be dragged outside the host window's own bounds — same design goal as the earlier expand-modal work. Exactly like issue #2's `openHtmlReport`, a plain `window.open()` call is blocked and returns `null` silently in Tauri's WebView — so in tsmap, clicking a gallery card's detach button did **nothing** (confirmed by direct testing). This was a real regression versus the previous in-page-modal expand behaviour, not a pre-existing gap — flagged and fixed same-day.

**Fix applied:** `openWindowForCard` now falls back to the same in-page non-modal floating window the user guide already uses (`openFloatingWindow`) whenever `window.open()` returns `null` and no custom `setDetachWindowOpener` is registered — matching what tsmap had before this change, functionally. Detach works in tsmap again with **zero tsmap-side code required**: no opener registration, no config. The remaining gap — getting a real, OS-manageable, drag-outside-the-app-window popup in Tauri specifically — is tracked separately below as #27b, since that requires either a wmap contract change or tsmap-side Tauri multi-window work, neither of which is needed just to restore working behaviour.

**Action for tsmap:** none required beyond the same `^0.18.0` dependency bump noted in #26 above — once installed, confirm gallery card detach reopens an in-page floating window as before.

### 27b. No real, OS-manageable detach window for gallery cards in Tauri — `setDetachWindowOpener` can't be satisfied by a Tauri `WebviewWindow` as designed

**Where:** same as #27a. This is the enhancement gap left after #27a's fallback fix — not a regression, since #27a already restores full in-page functionality.

**Problem (unchanged from original investigation):** wmap's `setDetachWindowOpener` hook lets a host provide a real window for gallery card detach instead of the in-page fallback — but the hook's contract (`(label: string) => Window | null`, synchronously handing back a live `.document` for wmap's own already-loaded JS to build into) cannot be satisfied by a Tauri `WebviewWindow` as designed.

wmap ships the same class of fix it used for #2: a public `setDetachWindowOpener(opener)` hook (mirrors `setReportOpener`) that a host registers at startup. The opener's contract is:

```ts
type DetachWindowOpener = (label: string) => Window | null;
```

The opener must **synchronously return a `Window`-like object with a live, already-open `.document`** — wmap's own already-loaded JS then builds the detached view directly into that document (`doc.createElement(...)`, `doc.body.appendChild(...)`, then calls `renderWaferMap(container, item, opts)` from the same module instance already running in the host page, no re-import, no IPC round trip).

**This contract does not transfer to Tauri's window model as-is.** A Tauri v2 `WebviewWindow` created via `new WebviewWindow(label, options)` is **fully isolated**: it always loads a fresh URL/page, runs its own separate script context with its own `window`/`document`, and shares zero JS state with the window that created it. There is no way to hand a `WebviewWindow` a synchronous DOM reference the opener's JS can build into the way `setReportOpener`'s `window.open()`-backed popup can. (Checked directly against Tauri v2 docs, 2026-07-07 — the JS `WebviewWindow` API and the "Capabilities for windows and platforms" guide; neither documents a way to get an in-process DOM handle into a new window.)

**Possible directions — none implemented, all need real scoping before committing to one:**

1. **Dedicated bootstrap page + IPC.** Ship a small HTML asset (e.g. `detach.html`) that itself imports the wmap ES module bundle and calls `renderWaferMap` independently. tsmap's opener creates a `WebviewWindow` pointed at that asset instead of returning a `Window`; once the new window signals it's ready (e.g. a `tauri://created` / custom "ready" event), tsmap `emit()`s the wafer data (dies, bin defs, view options — whatever `WaferMapDisplayItem` needs) to it, and the bootstrap page's own tiny script `listen()`s for that event and renders. This is the shape that actually fits Tauri's isolation model, but it means tsmap's detach feature would **not** go through wmap's `setDetachWindowOpener` contract at all — `openDetachWindow` would need to return `null` (declining) and tsmap would drive `WebviewWindow` creation itself, entirely outside wmap's detach flow. Real work: a new bundled asset, an IPC event contract for the wafer payload (must be structured-clone-safe — check `Die[]`/`BinDef[]`/`TestDef[]` sizes for a lot's worth of wafers), capability config to allow the new window to load the wmap bundle and receive the event, and a decision on reattach/unlink semantics given the detached view now lives in a totally separate script realm (today's wmap-side reattach reads `ctrl.getOptions()`-equivalent state back out synchronously — that read would need to become another IPC round trip, or be dropped in favour of "always reset to shared options on reattach," which is what wmap itself settled on for the plain-browser case too, so may be an acceptable simplification here as well).
2. **Skip window.open() entirely, keep tsmap's own modal-based drilldown for multi-wafer views.** tsmap's existing chart-drilldown modals (`openWaferModal`, see issue #26) already provide an in-app "look at this bigger" affordance for single wafers. If cross-window dragging genuinely isn't a requirement for tsmap's own users, the simplest option is to leave `setDetachWindowOpener` unregistered (detach silently no-ops, matching today's behavior) and treat wmap's real-window detach as a browser-only feature that tsmap doesn't need to adopt at all.
3. **Ask upstream (wmap) whether the `DetachWindowOpener` contract itself should change** to something IPC-friendly for embedded hosts — e.g. an async opener that returns a promise, or a contract shaped around "here is the data, you render it wherever/however" rather than "here is a `Window`, go build into it yourself." This would be a wmap-side API change, not a tsmap workaround, and only worth pursuing if option 1's IPC-bootstrap shape turns out to be the common pattern every embedded host needs (Electron would hit a similar, though less severe, version of this — `BrowserWindow` in Electron *can* share more directly via `webContents`/preload scripts, so Electron may not need this at all; needs its own check if/when relevant).

**Status: unresolved, needs full scoping before implementation.** Do not attempt option 1 without first confirming: (a) the actual IPC payload size/shape for a realistic lot (many wafers × many dies) is workable over Tauri's event bus, (b) whether `renderWaferMap`'s own bundle can be loaded a second time cheaply in a fresh webview context (cold JS engine per window — startup cost per detach), and (c) how many of tsmap's existing capability/CSP settings need to change to allow it. No fix applied; gallery card detach in tsmap currently silently no-ops, matching today's shipped behavior — not a regression, just a currently-inert new wmap feature from tsmap's perspective.

**2026-07-07 follow-up — full research pass, confirms option 3 is the way forward, not option 1.** Before committing to the IPC-bootstrap-page approach, did a thorough survey of Tauri v2's actual multi-window primitives, official docs, plugin ecosystem, and other apps' precedent, specifically to avoid reinventing something Tauri already provides. Findings:

- **No Tauri mechanism of any kind can satisfy the current `DetachWindowOpener` contract.** Confirmed directly by a Tauri maintainer (FabianLars, [tauri-apps/discussions#11643](https://github.com/orgs/tauri-apps/discussions/11643)) answering the exact question ("can a sub-window share a JS context/live object the way Electron/browser `window.open()` popups do?"): no. `WebviewWindowBuilder`/`WebviewWindow` (JS and Rust) only ever return a label-addressable control handle for metadata/events — never a cross-webview DOM reference. This is architectural, not a missing flag or an under-documented escape hatch.
- **`BroadcastChannel` is not a viable substitute, and this matters specifically because Linux is a target platform here.** Same-origin `BroadcastChannel` between two `WebviewWindow`s requires them to share a `WebContext`; Tauri gives each webview its own by default. Confirmed via [tauri-apps/wry#1308](https://github.com/tauri-apps/wry/issues/1308). The only way to force a shared context is `TAURI_WEBVIEW_AUTOMATION=true`, which is documented as a test/automation-only setting (and separately had an IPC-crosstalk bug, fixed in wry PR #1326, when misused this way) — not something to ship in production. So the "lighter weight than Rust-mediated IPC" idea doesn't hold up on the one platform (WebKitGTK) this app must support.
- **No plugin exists for this.** Checked crates.io and the general Tauri plugin ecosystem for anything like "detach a live view into a window" or turnkey multi-window state sharing: `tauri-plugin-window-state` (position/size persistence only), `tauri-plugin-store` (KV store, not pub/sub, not designed for this), `tauri-nspanel` (macOS-only window chrome, unrelated problem). Nothing turnkey solves "hand a live rendered view to a new window."
- **Precedent from real Tauri v2 apps popping out chart/canvas/editor views into their own window is uniform**: new `WebviewWindow` on its own route (browser-history routing, not hash routing — hash routers can't target distinct URLs per window per the [Mobile Multi-Window guide](https://v2.tauri.app/learn/mobile-multiwindow/)) → hand-rolled "I'm mounted, send me data" ready-handshake (confirmed there's no built-in ready signal beyond window-creation itself — `tauri://created` fires on window creation, not frontend-mounted; must hand-roll per [tauri-apps/tauri#12348](https://github.com/tauri-apps/tauri/issues/12348)) → data pushed via `emit`/`emit_to`, or **Channels** for larger/ordered payloads (Tauri's own recommended tool for "streaming"-shaped data larger than a one-off event, still JSON/serde — not structured-clone, not free of size cost). No app or example anywhere used a cleverer trick (SharedArrayBuffer, custom protocol tricks, etc.) — everyone lands on this same shape because it's the only shape Tauri's process model permits.

**Conclusion: this is a wmap API design gap, not a tsmap integration gap — resolve via option 3, not option 1.** tsmap cannot produce a `Window`-like object with a live `.document` under any Tauri mechanism; the concept doesn't exist in Tauri's model. Attempting option 1 as originally scoped (tsmap declines the opener, drives its own `WebviewWindow` + IPC entirely outside wmap's detach flow) is still *possible* but now clearly the wrong layer to fix it at — every embedded host with isolated webviews (Electron with context isolation on, any future host) will hit the same wall, so the fix belongs in wmap's hook shape itself: change `DetachWindowOpener` from "synchronously hand me a live `Window`" to something async/data-driven, e.g. `(label, dataPayload) => Promise<void> | void` where the host is responsible for standing up its own window (however it likes) and wmap hands over the data to render rather than a DOM target to build into. This turns wmap's own gallery detach code from "build into caller's document" to "call `renderWaferMap`-equivalent against whatever the host's promise resolves against," which is a wmap-side refactor of `openWindowForCard`/`openDetachWindow`, to be scoped and implemented in wmap, not tsmap.

**Status update (2026-07-07, after #27a landed): no longer urgent.** #27a's automatic in-page-floating-window fallback means tsmap's gallery card detach is fully functional today with zero tsmap-side code — it just doesn't get a real, drag-outside-the-app-window OS popup in Tauri specifically, same limitation tsmap already lived with before this whole feature existed. Leave `setDetachWindowOpener` unregistered; tsmap's own `openWaferModal` drilldown (issue #26) plus the in-page fallback already cover "look at this bigger" for the cases tsmap's users need. Revisit only if/when the wmap-side async-opener redesign (above) actually ships and a real Tauri multi-window detach becomes worth the IPC-bootstrap-page implementation cost.


### 28. `renderWaferGallery` does not propagate `onSaveImage` to per-card renderers — per-card PNG save falls back to detached anchor

**Where:** `packages/canvas-adapter/renderWaferGallery.ts` — internal per-card `renderWaferMap` calls used to render each gallery card.

**Problem:** wmap added the `onSaveImage` host hook so callers can intercept image saves. `renderWaferGallery` accepts and uses `onSaveImage` for the gallery-level toolbar, but it does **not** pass `onSaveImage` into the internal per-card `renderWaferMap` calls. Each card’s camera/download button therefore falls back to creating a detached `<a download>` anchor and invoking the browser download, rather than calling the host-provided `onSaveImage`.

**Impact:** Hosts that rely on `onSaveImage` (native save dialogs, upload hooks, or other custom persistence) cannot intercept per-card image saves. In hosts embedding wmap (e.g. tsmap) this produces inconsistent behaviour: gallery-wide save works but per-card and modal card saves do not, forcing fragile host-side workarounds.

**Suggested fix:** When creating each per-card renderer inside `renderWaferGallery`, forward the gallery’s `onSaveImage` into the child `renderWaferMap` options (i.e. include `onSaveImage: options.onSaveImage` in the per-card `RenderOptions`). Consider a systematic forwarding strategy for other host hooks/options (e.g. `showExpandButton`, `onExpand`) so gallery child renders consistently inherit relevant host-provided callbacks.

**Notes / Related:** Related to #12 (save hook addition) and #26 (per-card expand-button control). The intended behaviour is that any host-provided save hook applies uniformly to every rendered map instance (gallery-level, per-card, and modal).

### 29. ~~`renderLotSummaryReportHtml`/`renderSummaryReportHtml` have no extension point for host-specific sections~~ (resolved — superseded by native sections, 2026-07-11)

**Resolution (2026-07-11):** The original suggested fix (an `extraSections` hook + exporting `reportHtml.ts`'s helpers so a host could hand-roll matching sections) was **not** what shipped — a direct instruction reframed the problem: there was no good reason for tsmap to own any report-rendering logic at all, capability and splits included, when every wafermap host needs the same thing. Instead:

- `capabilitySection(items, testDefs)` and `splitsSection(items)` are now **native** section builders in `packages/stats/renderSummaryReport.ts`, using the already-exported `buildCapabilityData` and the already-first-class `WaferMetadata.split` field — no new host-facing API surface at all, just two more entries in the same internal section list every other section (Yield, Bins, Findings, …) already lives in. `capabilitySection` is wired into both `renderLotSummaryReportHtml` and the single-wafer `renderSummaryReportHtml`; `splitsSection` is lot-report-only (a per-wafer report has nothing to compare splits against).
- Both sections follow the established "empty string when not applicable" convention (`buildCapabilityData` returning `[]` when no test has both spec limits; no item having `wafer.metadata.split` set) — they appear/disappear automatically, exactly like every other section, never a user-toggled option.
- tsmap's entire splice-based workaround is deleted: `src/reportHtml.ts`, `src/reportHtml.test.ts`, and `src/reportUI.ts` (the opt-in modal with capability/splits checkboxes) are gone. tsmap no longer builds report HTML of any kind.
- Went further than the original ask, closing #30 below for this call path in the same pass — see that entry.
- **tsmap no longer has its own `Report…` button at all** (a separate finding mid-implementation: wmap's own summary panel — `canvas-adapter/summaryPanel.ts`'s `renderLotSummaryContent`/`renderWaferSummaryContent` — already had a fully-wired, always-visible "Summary report" button calling these same functions, with everything it needs already flowing in from what a host passes to `renderWaferGallery`/`renderWaferMap`. tsmap's separate button was a second, redundant path to the identical feature. Removed tsmap's button entirely; wmap's own summary-panel button is now the only way to generate a report, and `setReportOpener` — already wired in tsmap for an unrelated purpose (the guide's print button) — is what makes it open correctly via Tauri's native dialog / the browser with zero additional host glue).
- Verified: numeric parity confirmed via Playwright against `PVT-LOT-05.stdf` (+ its splits CSV) — every Cp/Cpk/Pp/Ppk value byte-identical before/after the move, on both a single-lot and a real two-lot merged load. wmap gained 10 new tests (`tests/renderSummaryReport.test.mjs`) covering both sections' appear/absent behavior and the grouping described in #30's resolution below. wmap: 414 tests; tsmap: 155 tests (down from 169 — the deleted `reportHtml.test.ts`'s 14 cases moved to wmap's suite).

**Two minor cosmetic items found during the parity check, logged rather than fixed (out of scope for this move):**
- `fmt()` (`packages/renderer/fmt.ts`) double-prefixes a value when its `unit` argument is *already* SI-prefixed and the magnitude is small enough to pick a smaller-than-base SI scale — e.g. `fmt(0.5, 'nA')` renders `"500 mnA"` instead of a sane `"0.500 nA"` or `"500 pA"`. Surfaced by Process Capability's LSL/USL column (a `leakage` test's 0.5 nA limit) but not introduced by this change — `testSection`'s existing Min/Mean/Max column calls `fmt()` the same way and would hit the same bug given a similarly small pre-prefixed value. `fmt()` has no way to know a passed unit string already carries a prefix character; worth a real fix (detect a leading SI prefix letter in `unit` and treat the value as already-scaled) but not attempted here — pre-existing, unrelated to report generation specifically.
- The Splits table's Wafer column can read redundantly (e.g. `"W01 · TT"` next to a Split column that already says `"TT"`) when a host's `item.label` already has the split baked into it (tsmap's `waferDisplayLabel(w, showSplitSuffix)`, on by default) — `splitsSection` has no separate "raw wafer ID without any host-added suffix" to fall back to, since `item.label` is the only per-item identity string `LotSummaryReportParams` carries. Cosmetic only (the split value itself is always correct); would need a new field (e.g. a `shortLabel`) to fix cleanly, not worth adding for this alone.

### ~~30. `analyzeWaferLot`'s lot identity (`lotSummary.lot`) is silently derived from the *first* wafer only, not verified shared~~ (fixed in wmap 0.26.0)

**Where:** `packages/stats/analyzeWaferLot.ts:169-174`.

**Problem:** The comment says "take shared fields from the first wafer that has identity data" but the implementation never checks that the other wafers actually share those values — it just takes wafer 0's identity fields verbatim:

```ts
const firstWafer = perWafer.find(w => w.summary.wafer)?.summary.wafer;
const lotIdentity = firstWafer
  ? Object.fromEntries(Object.entries(firstWafer).filter(([k]) => k !== 'wafer' && k !== 'waferId'))
  : undefined;
```

For a single-lot load (the overwhelmingly common case) every wafer's identity fields genuinely are identical, so this is harmless. It stops being harmless the moment a host merges wafers from more than one lot/part-type/temperature/program into one `analyzeWaferLot` call (tsmap's "Add files" append flow does exactly this) — `lotSummary.lot` then silently reports only the first file's Lot/Product/Tester/Program while `stats`, `lotYieldSeries`, `findings`, etc. are computed by pooling **every** wafer regardless of lot. A report or dashboard built on `lotSummary.lot` reads as "this is lot A's data" while actually describing a pooled mix of lot A and lot B — a real correctness bug, found via a user report ("the report only lists the first lot/file") 2026-07-10.

**Resolution, for the report path specifically (2026-07-11):** `renderLotSummaryReportHtml` no longer accepts a pre-computed `lotSummary` at all — it takes a flat `items` list and does its own identity-heterogeneity detection internally (`groupByIdentity`, keyed on `lot`/`product`/`testProgram`/`temperature` — the same four fields tsmap's now-deleted `reportSplitFacets`/`reportGroupsOf` checked, ported directly into wmap), partitions into groups when they vary, and calls `analyzeWaferLot` **once per already-homogeneous group** — so by the time `analyzeWaferLot` ever sees a batch of items, they're guaranteed to share those four fields by construction, and the first-wafer-only bug above can't manifest for this call path. tsmap no longer has (or needs) any identity-detection code of its own for reporting.

This is a **narrower** fix than either suggestion below — it closes the bug for the one call path where it was found (report generation), not inside `analyzeWaferLot` itself. `analyzeWaferLot` remains unfixed at the source and still silently mislabels `lotSummary.lot` for **any other caller** that hands it a heterogeneous batch directly (e.g. a future host computing its own lot-level view outside the report builder). The original suggested fix below is still valid and still open.

**Suggested fix (still open, for `analyzeWaferLot` itself):** Actually verify agreement across `perWafer` before treating a field as lot identity — either (a) only include a key in `lotIdentity` when every wafer that has identity data agrees on its value (mixed values omit the key, matching the existing "fields with no value" omission behavior), and/or (b) surface a `lotSummary.mixedIdentityFields?: string[]` so a host can detect and warn/split without re-deriving it from raw wafer metadata itself.

**Update (2026-08-27):** The suggested fix above is now implemented in `analyzeWaferLot.ts`/`stats/types.ts` — a mixed field is omitted from `lotSummary.lot` and named in a new `lotSummary.mixedIdentityFields: string[]`. Verified directly against a linked local build: two synthetic wafers with `metadata: {lot: 'LOT-A'}`/`{lot: 'LOT-B'}` produce `lot: undefined` and `mixedIdentityFields: ['lot']` instead of silently reporting `'LOT-A'`. **Published in wmap 0.27.0** (2026-09-09) — leave this entry open until it ships in a published version, then close per the usual convention.

**Update (2026-08-28):** Published as wafermap **v0.26.0** and adopted here (see the Version tracking table above). Closed.

**Notes / Related:** Same root cause class as #29 (report generation needing something wmap's stats layer is well-positioned to own centrally) — #29's resolution fixed the report-specific symptom; this entry stays open for the underlying `analyzeWaferLot` gap. Verified via `tests/renderSummaryReport.test.mjs`'s grouping cases (uniform lot → one group; heterogeneous lot/product → N groups; split varying alone → deliberately does NOT trigger grouping, since comparing splits within one report is the point of that feature) plus a real two-lot Playwright load.

### 31. wmap↔tsmap boundary rework — moving reusable chart/analysis code into wmap, plus a wmap-owned "Analysis" tab (cutover complete; one item deferred)

**Context:** Issues #29/#30 above were both instances of the same pattern — tsmap building analysis/report functionality that's not actually app-specific and belongs in wmap, where every integrator (not just tsmap) benefits. 2026-07-10, prompted by a direct request to reconsider the wmap/tsmap boundary given tsmap is currently wmap's only consumer and much of what's grown up in `src/charts/*` (boxplot, histogram, scatter, correlation, capability, pareto — 9 files, pure DOM+canvas+wmap-data with no Tauri/parsing dependency) would be valuable to any wafermap integrator but is currently locked inside tsmap's app shell.

**Decided direction** (supersedes an earlier draft that proposed wmap merely export chart-panel functions for a host to assemble into its own page): wmap's `renderWaferMap`/`renderWaferGallery` gain a second, **wmap-owned** view — an **Analysis** tab, alongside the existing map/gallery view — that takes over the full render container when selected and owns the chart suite, the "Group by" control, and (eventually) report generation internally. A host gets all of this by rendering `renderWaferGallery` as it already does, opting in with one flag — no per-chart wiring, no host-computed facets.

**Progress so far (first proven slice, all shipped to the link, none published):**

- `core/metadata.ts`: `WaferMetadata` gained a first-class `split` field. Along the way, found and fixed a real, previously-invisible gap: tsmap's `toWmapWaferMeta` only ever passed lot-level `WaferSource` fields to wmap, never per-wafer fields (where splits live) — so a wafer's split was completely invisible to wmap's own summary panel and reports, visible only to tsmap's own separate code that read it directly. Fixed on the tsmap side (`toWmapWaferMeta` now merges per-wafer fields too, per-wafer winning on collision) — verified end-to-end: wmap's own summary panel and die tooltip now show a wafer's split with zero tsmap-side special-casing.
- New `stats/facets.ts`: `buildFacetTable`/`facetValueOf`, generalized from tsmap's `metadata.ts`, operating on `WaferMetadata` with an extensible curation config (`DEFAULT_FACET_CURATION`) so a host's own friendly labels layer on top instead of being lost. Caught one real bug before it shipped: `waferId` (a `WaferMetadata` field) was initially offered as a "groupable" facet, which is meaningless — it's unique per wafer by definition, so "grouping" by it just recreates one group per wafer. Fixed by curating `waferId` as `facet: false` (present, not offered by default) — covered by a regression test.
- New `stats/capability.ts` (`buildCapabilityData` — Cp/Cpk/Pp/Ppk) and `stats/correlation.ts` (`buildCorrelationMatrix`/`filterCorrelationMatrix`), moved from tsmap's `charts/aggregate.ts` — pure math, no DOM, now available to every wmap consumer.
- New `packages/charts/` (`chartShell.ts`, `capability.ts`): the first DOM/canvas panel ported into wmap itself, composed internally by `canvas-adapter`, not exported for a host to assemble. Reused wmap's own existing `--wmap-*` theme tokens (`CLR`, `canvas-adapter/toolbar.ts`) and `saveImageBlob` save-hook plumbing rather than porting tsmap's parallel copies of either. One real design fix made during porting: the ResizeObserver lifecycle helper (`trackObserver`/`disconnectAllObservers`) tsmap's version used a **module-global** registry, safe for tsmap (exactly one chart view ever exists) but wrong for a library where `renderWaferGallery` can have multiple concurrent instances on one page — one instance's teardown would silently disconnect another's observers. Changed to a per-panel `observeResize()` handle instead.
- `canvas-adapter/renderWaferGallery.ts`: new opt-in `analysisEnabled` option. When set, an "Analysis" toolbar tab (new icon, `docs/images/icons/analysis.svg`) swaps the grid/summary-panel body for the chart suite. The tab owns its own "Group by" control, computed via `buildFacetTable` from each item's `wafer.metadata` — no host wiring. ~~When grouped, renders one capability panel per group side by side (not a single-value restrict-and-filter picker — an earlier draft of the per-panel UI got this wrong by conflating "which field to group by" with "which value to filter to"; fixed by having the tab, not the panel, own grouping and hand each panel an already-scoped population).~~ **This description was wrong and has since been corrected — see the "grouping model was invented, not checked" entry below.**
- tsmap wired `analysisEnabled: true` on its main gallery render call (`main.ts`) — coexisting with tsmap's own separate Charts page, not replacing it yet (deliberate, low-risk first step). Verified end-to-end via Playwright: loaded the corner-lot fixture, assigned TT/FF splits, opened the Analysis tab, confirmed the Group-by dropdown correctly offers only "Split" (not `waferId`), confirmed grouping renders two independently-correct capability panels (TT vs FF), confirmed tsmap's own pre-existing Charts page is completely unaffected, zero console errors throughout. Both test suites green (wmap: 377 tests at the time; tsmap: 214 tests). Now at wmap: 381 tests, tsmap: 214 tests, after the boxplot port below.
- **Found and fixed via a user report after the above was already "verified"**: the capability panel's columns were capped at a small fixed width (a leftover from tsmap's original grid-card sizing, wrong here since the Analysis tab always gives the panel the full container), leaving most of the width empty — and separately, **every canvas color in the panel was broken**: `CLR`'s tokens are `var(--wmap-…, fallback)` strings, correct for DOM `.style` assignments but silently invalid when assigned to a canvas 2D context's `fillStyle`/`strokeStyle` (canvas can't parse `var()` syntax at all; the browser just keeps whatever color was last validly set). This made the hover highlight render as a solid block in the previous box's leftover fill color, obscuring the box/whiskers underneath — looked like an intentional but broken design choice, not an inert style. Fixed with a new `resolveChartCanvasColors(el)` in `chartShell.ts` that reads the actual computed `--wmap-*` values (same technique `canvas-adapter/canvasTheme.ts`'s `resolveCanvasTheme` already uses for the map canvas) and returns concrete color strings for canvas use. **This is a trap every future ported panel will hit again if `CLR.*` is used directly in canvas draw calls instead of `resolveChartCanvasColors`** — worth a lint rule or at least a code-review checklist item when porting histogram/boxplot/scatter/correlation next, since the failure is silent (no error, no warning — just a wrong-looking but plausible-enough result that passed an initial screenshot check before a closer look caught it).
- **Expand-to-modal added, reusing wmap's own existing overlay primitive.** The first port deliberately skipped a per-card expand button (reasoning: the Analysis tab already takes over the full view, so a second layer of "expand" seemed redundant) — wrong call, per direct user feedback: a single chart still benefits from its own resizable/maximizable window, same as every wafer-map popup already gets. Checked before implementing rather than assuming: `canvas-adapter/toolbar.ts`'s `openModal`/`openFloatingWindow` are **already fully generic** (the same primitive `openUserGuideWindow` uses for plain HTML content, not something coupled to `WaferMapController`) — a `contentWrap` div the caller fills with arbitrary DOM, with resize/maximize/Esc/focus-trap for free. No reason not to reuse it. Added `openChartExpandModal(card, title)` to `chartShell.ts` (reparents the card into `contentWrap` on open, restores it to its original position on close — same pattern tsmap's own original `chartShell.ts` used for its local modal) and a new expand icon button in `cardShell()`. Verified: opens/closes correctly, card re-renders at the right size in both directions (its `ResizeObserver` keeps watching the same DOM node through the reparent, no special handling needed).
- **Boxplot panel ported (second panel), with the capability→boxplot cross-link preserved.** New `stats/boxplot.ts` (`buildTestBoxplotData`, pure per-item five-number-summary math) and `packages/charts/boxplot.ts` (`renderBoxplotPanel`), following the same pattern as capability — canvas colors via `resolveChartCanvasColors` from the start this time (the trap noted above did not recur). Deliberately trimmed vs. tsmap's original for this first cut: no trend-line toggle, no in-place group drill-down (grouping is tab-owned, not per-panel, per the established design), no click-to-open-wafer. Matching tsmap's existing behavior, `capability.ts` gained an `onSelectTest` callback and `boxplot.ts` a `setTest(testNumber)` handle; the Analysis tab's `renderCapabilityAndBoxplot` helper wires `capability.onSelectTest → boxplot.setTest` per rendered pair (one pair per group when grouped, so each group's boxplot only reacts to clicks in *its own* capability panel — verified explicitly, see below).
- **Found and fixed via a user screenshot: grouped panels rendered stacked/overlapping, and the boxplot card rendered as an invisible "tiny strip."** Root cause: the boxplot canvas is an in-flow, content-sized element (height driven by row count), unlike capability's, which is `position: absolute` and filled via `chartFillHeight` reading whatever height the flex layout resolves to. `cardShell()`'s default `body { flex: '1', minHeight: '0' }` is correct for that fill-style canvas but wrong for a content-sized one: with `flex-basis: 0` and no definite height anywhere up the ancestor chain (several group panels stacked in an auto-height list have nothing to distribute flex-grow against), the box resolves to a computed height of 0 and `overflow-y: auto` silently clips the real, correctly-sized canvas into an invisible box — same failure shape as the earlier canvas-color trap: no error, a plausible-looking (if broken) result. Compounding it, each group's outer wrapper (`wrap`, one per group in the grouped list) was *also* `flex: '1 1 0'` with `min-height: 0`, so multiple siblings competed for the same undefined flex-grow space and mostly collapsed too — only the last-rendered group showed a chart at all. Fixed in two places: `charts/boxplot.ts` now sets `card`/`body` to `flex: '0 0 auto'` (size to content, the correct default for any panel whose canvas height is data-driven, not fill-style) instead of relying on `cardShell()`'s fill-oriented default; `renderWaferGallery.ts`'s per-group `wrap` changed from `flex: '1 1 0'` to `flex: '0 0 auto'` so each group claims exactly the height its own content needs rather than fighting siblings for space, with `analysisEl` given `overflow-y: auto` as the actual scroll boundary for the resulting (now correctly-sized) list. Verified via Playwright against the real multi-group scenario (5 splits: TT/FF/SS/FS/SF) this time, not just the earlier single-group case that had looked fine on a first pass: all 5 capability+boxplot pairs now render at distinct, non-overlapping, correctly-sized heights (capability floors at 360px via its own explicit `min-height`; boxplot sizes to its row count, ~200–235px for 2–3 wafers per group here) with monotonically increasing vertical position and zero overlap. Cross-link re-verified in this same multi-group layout: clicking a box in the FF capability panel updates only the FF boxplot's selected test, leaving TT's untouched. **General lesson, worth carrying into every remaining panel port:** a single-instance/ungrouped screenshot check is not sufficient signal that a panel's sizing is correct — this exact bug was present (boxplot silently zero-height) even in the earlier "already verified" single-group pass and only became obvious once multiple instances were stacked; verify layout with the actual multi-instance case a real user will hit (multiple groups, not just one), the same way #22/#23's z-index lesson called for testing over an already-rendered map rather than only the empty-state path.

- **Found via direct user pushback: the grouping model above was invented, not checked against tsmap's actual behavior — and the layout bug fixed just above was a symptom of that, not an independent CSS bug.** The user asked directly why wmap's Analysis tab wasn't "keeping the same functionality and selectors" as tsmap's Charts page, and specifically that tsmap's capability panel "had a group selector" that wmap's port lacked. Re-reading tsmap's source (`src/charts/capability.ts`, `boxplot.ts`, `histogram.ts`, `main.ts`) rather than working from memory revealed: tsmap renders **exactly one card per panel, always** — grouping is consumed differently *inside* each panel, not by instantiating N panels. Capability has its **own "Group: `<value>` ▾" restrict-to-one-group dropdown** (`groupKeys?`, `getData(groupKey?)`); boxplot shows **pooled-per-group overview rows by default with in-place drill-down** (click a group's row → per-wafer rows + a Back button, `drillGroup`/`getDrillData`/`onDrillChange`); histogram uses a third pattern again (overlaid multi-series with a click-to-emphasize legend); correlation matrix uses its own restrict-dropdown (same shape as capability); scatter uses colour-by-group with a click-to-filter legend. One shared page-level `chartGroupBy` state feeds all of them — there is no independent per-panel facet picker anywhere, but each panel's *consumption* of that shared state is bespoke. wmap's "one full capability+boxplot pair per group, stacked" design matched none of these — it was invented under a mistaken belief that tsmap's per-panel UI was buggy (see the struck-through claim above), when it was actually a deliberate, working design that was never actually read closely before being described as wrong. **Fixed**: `packages/charts/capability.ts` gained an optional `groups?: { key, items }[]` prop — when present, renders its own "Group:" dropdown and restricts to one group's `buildCapabilityData` output at a time, exactly matching tsmap. `packages/charts/boxplot.ts` gained the same `groups?` prop plus `groupLabelText?`, `drillGroup` state, and a new `makeBackButton` helper (added to `chartShell.ts`, ported from tsmap's) — overview rows are now one pooled row per group (all of that group's dies combined into one five-number summary), clicking a row drills into that group's per-item rows with a Back button, matching tsmap's `syncDrillChrome` hint-text behavior exactly. `renderWaferGallery.ts`'s Analysis tab now renders **exactly one capability card + one boxplot card, always** (the per-group `groupsRow`/`wrap`-multiplication machinery from the previous entry is gone entirely — it existed to work around a design that no longer exists, not a real requirement), laid out as a responsive two-column CSS grid (`repeat(auto-fit, minmax(420px, 1fr))`) matching tsmap's "Distributions" grid-section layout instead of a full-width vertical stack. One deliberate simplification versus tsmap's exact internal shape: tsmap's `getData(groupKey?)`/`getDrillData(...)` are callbacks into `main.ts` because `main.ts` owns cross-panel caching across five panels; wmap's panels already compute their own stats internally, so they resolve the active/drilled group's item list themselves from the `groups` prop directly — same end-user behavior, one fewer indirection. Verified via Playwright against the 5-split (TT/FF/SS/FS/SF) fixture: ungrouped and grouped layouts render correctly (screenshot-confirmed), capability's "Group:" dropdown lists all 5 splits and switching it re-renders only that card, boxplot shows the 5 pooled overview rows by default, clicking a row drills into that group's per-wafer rows with a working Back button, and the capability→boxplot cross-link still works correctly in both boxplot states (overview and drilled). Both test suites green throughout (wmap: 381; tsmap: 214) — required raising `tests/bundle-size.test.mjs`'s `wafermap/render (initial)` threshold from 75 KB to 90 KB gzipped (real baseline ~75 KB now) to account for the added per-panel grouping UI, done deliberately per that test file's own stated update policy, not silently. **Standing lesson, stated plainly because it cost real rework**: when porting or replicating existing UX, read the actual source of the thing being replicated before designing its replacement — a plausible-sounding rationale for "why the original must be wrong" is not a substitute for checking, and in this case the wrong rationale was written into this very file as if it were a verified finding. The remaining unported panels (histogram, correlation, scatter) each have their own distinct grouping pattern (see above) — the next port must read the relevant tsmap source panel directly, not infer a pattern from capability's or boxplot's.

- **Capability's chart requires both LSL and USL per test to normalize (Cp/Cpk/Ppk are mathematically undefined without both) — real-world lots very commonly have some or all tests without spec limits captured.** The "some tests" case was already handled correctly (caption reads "X of Y tests shown — Z excluded (no spec limits, or only one)"), but the "zero tests have both limits" case forced a large empty box: `renderCapabilityAndBoxplot` in `renderWaferGallery.ts` unconditionally set `capability.card.style.minHeight = '360px'` (needed so the fill-style chart canvas has a floor when there *is* data), which also applied when capability had nothing to draw, next to a boxplot panel that works fine regardless of spec limits (it just skips drawing LSL/USL lines when a test lacks them — no dependency). Fixed: `CapabilityPanelHandle` gained a `hasData: boolean` (computed once from `testDefs` — spec-limit availability is a property of the test, not the selected group, so it doesn't change when "Group:" changes), and the tab only applies the 360px floor `if (capability.hasData)`; otherwise the card sizes to its natural (small) empty-state message, and the grid row is driven by boxplot's height instead. **Also confirmed this doesn't block grouping**: since the shared `groups` prop is computed once in the tab and passed independently to both panels, boxplot's "Group:"-driven overview/drill-down and capability's "Group:" dropdown both keep working correctly even when capability has nothing to chart — capability's dropdown still renders and switches groups even in its empty state (it just has nothing to draw for any group). Verified via two purpose-built synthetic STDF fixtures (13-wafer corner-lot fixture, `scripts/generate_stdf_corner_lot.py` with a `NO_LIMIT_TESTS` patch omitting `LimitLow`/`LimitHigh` from written PTR records for some or all of the 6 parametric tests, while keeping the real limits for value-generation/pass-fail math): all-tests-no-limits shows capability's compact empty state (not a dead box) alongside a fully working, correctly grouped boxplot (drill-down, Back button, cross-link all still function); the mixed case (4 of 6 with limits) renders capability normally at full height with the correct exclusion count. **This is a `capability`-specific gap, not a general one** — of the still-unported panels, histogram, correlation, and scatter don't depend on spec limits at all (correlation's empty-state trigger, if any, would be "too few numeric tests," a different condition) — but the general principle carries forward: **any panel that can structurally end up with nothing to show must degrade to a compact empty state that doesn't force excess height on itself, and must never block sibling panels or the shared "Group by" mechanism from working** — worth an explicit check on each future port, not just capability.

- **All remaining panels ported: histogram, correlation matrix, scatter, yield, bin pareto, bin cluster — the Analysis tab now has full parity with tsmap's Charts page.** Each panel's source (`src/charts/histogram.ts`, `correlation.ts`, `scatter.ts`, `render.ts`'s generic `renderPanel`, `binCluster.ts`, and `main.ts`'s wiring) was read directly before porting, per the standing lesson above — no pattern was inferred from another panel. Confirmed distinct grouping mechanics per panel, none copied from another:
  - **Histogram** (`stats/histogram.ts`, `charts/histogram.ts`): overlaid multi-series — one coloured series per group over shared bucket ranges (`buildTestHistogramSeries`, taking the tab's `groups` list directly rather than tsmap's `wafers + groupBy` callback), with a click-to-emphasize legend (dim the rest, not filter). Ungrouped mode keeps the existing per-item/all-wafers view with a wafer selector, hidden when grouped (matches tsmap: the selector is meaningless once grouped).
  - **Correlation matrix** (`stats/correlation.ts` — already existed — `charts/correlation.ts`): its own "Group: `<value>` ▾" restrict dropdown, same pattern as capability (pooling across groups is misleading — Simpson's paradox — so the matrix is always one group's dies at a time when grouped). Self-computes `buildFacetTable(...).filter(f => f.splittable)` for the "Mixed `<fields>`" warning, rather than a tab-supplied `mixedFields` callback. Matrix-size control is panel-owned local state (tsmap persists it at `main.ts` level across full-page chart-grid rebuilds; wmap's tab doesn't rebuild this aggressively, so the simpler local-state version is equivalent in practice).
  - **Scatter** (`stats/scatter.ts`, `charts/scatter.ts`): a fourth distinct pattern — never restricts (unlike correlation/capability); every group's points are always plotted together, coloured by group instead of hard bin, with a click-to-*filter* (not emphasize) legend. `onSelectPair` from correlation drives `scatter.setXY` in place, mirroring tsmap's `main.ts` wiring exactly — verified: clicking a non-diagonal matrix cell updates scatter's Y test number live.
  - **Yield** (`stats/yield.ts`, composed via the new generic `charts/barPanel.ts`): pooled-per-group bars with in-place drill-down + Back button when grouped (same `drill` contract as boxplot, confirmed from `main.ts`'s `yieldPanel.drill`), sort-by-yield/sort-by-label segmented control (`makeSegmented`, newly ported into `chartShell.ts`). Yield percent is computed directly from each item's `dies` (hard-bin pass/fail against `passBins`, already available in `renderWaferGallery`'s option scope) rather than depending on a host-supplied lot-summary object — self-contained, consistent with every other stats builder in this package.
  - **Bin pareto vs. bin cluster** (`stats/binPareto.ts`, `charts/binCluster.ts`): confirmed from `main.ts:848-884` that grouped mode doesn't restrict or drill the plain pareto — it swaps in an **entirely different panel** (`renderBinClusterPanel`, clustered sub-bars per bin, one per group, always all groups at once, no drill). The plain pareto (hard/soft toggle via `makeSegmented`) is used only when ungrouped.
  - `charts/barPanel.ts` is the new generic bar-chart panel backing yield and the plain bin pareto (mirrors tsmap's `charts/render.ts`'s `renderPanel`) — one shared implementation, panel-specific behavior supplied via a `ChartPanel` config object (title, data, `selfControl`, `drill`, `barColor`, `valueLabel`), same shape as tsmap's.
  - **Click-to-open-wafer intentionally deferred everywhere in this pass** (yield bars, bin pareto/cluster bars) — asked the user directly rather than guessing, given it needs a new capability (a wafer-detail modal) that doesn't exist in the Analysis tab yet, unlike every panel ported so far this session which was self-contained. Decided: port the panels read-only for now (drill-in-place still works, since that's chart-internal, not wafer-opening), add the open-wafer action as a separate follow-up — tracked below, not silently dropped.
  - Verified via Playwright against the 5-split (TT/FF/SS/FS/SF) fixture for every panel, both ungrouped and grouped: histogram's legend emphasize-on-click, correlation's group dropdown + cell-click → scatter cross-link, scatter's colour-by-group + filter legend, yield's drill-in-place (heading updates to "Yield by wafer — Split: FF", Back button restores the overview), bin cluster's per-group sub-bars. Zero console errors throughout. Both test suites green (wmap: 399 tests, up from 381 at the start of this entry; tsmap: 214 tests) — no bundle-size threshold change needed this time (stayed under the 90 KB gzipped ceiling raised in the previous entry).
  - The Analysis tab is now laid out in three sections matching tsmap's Charts page exactly: **Yield & bins** (yield + bin pareto/cluster), **Distributions** (capability, boxplot, histogram), **Correlation** (matrix, scatter) — each its own responsive grid, in that order.

- **Found via a direct user question ("have you checked that the results in the charts page match the results in the new analysis page?") — behavioral/layout verification is not the same as numeric verification, and this session had only done the former.** Every panel had been screenshot-checked for correct *interaction* (dropdowns, legends, drill, cross-links), but the actual computed values had never been diffed against tsmap's existing Charts page on the same file. Doing that surfaced one real bug: **`stats/yield.ts`'s yield calculation didn't exclude `partial`/`edgeExcluded` dies**, unlike wmap's own established convention in `renderer/buildWaferMap.ts:783-801` (`fullDies = dies.filter(d => !d.partial)`, then `if (die.edgeExcluded) continue;`, *then* classify pass/fail) — which tsmap's own yield chart already goes through today, via `analyzeWaferLot`. Per-wafer yield differed from tsmap's Charts page by up to ~1.3 percentage points on the 13-wafer corner-lot fixture (e.g. W02: tsmap 73.2% vs wmap 71.9% before the fix), even though bin-pareto totals matched exactly (2271/425/177 — bin pareto counts every binned die, no exclusion, so the aggregate total happened to still agree while the per-wafer yield denominator didn't). Fixed by applying the same exclusion in `yieldPercentOf` — reverified: all 13 wafers now match tsmap's Charts page exactly. Also cross-checked (already correct, no fix needed): boxplot medians match exactly across all 13 wafers, and correlation's strong/moderate pair counts match exactly (2 strong, 9 moderate) — neither of those computations ever touched `partial`/`edgeExcluded`, which is specific to the fab yield-reporting convention, not to how a die's *test value* should be treated elsewhere (a partial/edge-excluded die still has a real, valid measured value and correctly belongs in distributions/correlations/scatter). **Standing lesson, a companion to the "read the source before porting" one above**: functional/UX parity checks (does the dropdown work, does the click do the right thing) do not catch numeric bugs — a value can be wrong while every interaction around it works perfectly, silently, with no error and a plausible-looking chart. Any future numeric-computation port needs an explicit side-by-side value diff against tsmap's existing chart on a real fixture, not just a screenshot check of the new panel in isolation.
  - Also fixed in the same pass, found visually rather than numerically: the bar/sub-bar "track" background (the full-width backdrop behind each value bar, showing 0–100% extent) in `barPanel.ts` and `binCluster.ts` used `theme.border` — a token meant for visible border lines, not a backdrop fill — making every bar look like it sat on a heavy grey block. Added a dedicated `track` color to `ChartCanvasColors` (mapped to `--wmap-panel-bg`, a genuinely subtle background token, matching tsmap's own `--bg-input` track color) and switched both panels to use it.

- **Follow-up to the yield fix above, prompted by a direct user question: "tsmap was using wmap for chart data calculations yet wmap isn't using it? this seems strange."** Fair challenge — the fix in the previous entry made `stats/yield.ts` compute the *same* exclusion rule as `buildWaferMap.ts`, but that meant wmap now had the "exclude partial/edge-excluded dies" rule hardcoded **independently in three places**: `buildWaferMap.ts`'s `computeYield` (original), `analyzeWaferMap.ts`'s private `isEligibleDie` (also original — these two had already silently duplicated the rule *before* this session), and my new `stats/yield.ts` (a third copy, freshly added). Given the explicit direction — wmap is owned by this project, dedup and reuse existing code rather than re-deriving it — this needed a real fix, not just a correct-by-coincidence third copy:
  - **Extracted the rule once**: `core/dies.ts` gained `isYieldEligibleDie(die, options?)` (`options: { includePartial?, includeEdgeExcluded? }`, both default `false`) — the single source of truth, exported from wmap's root and `./core` entry points. `buildWaferMap.ts`'s `computeYield` and `analyzeWaferMap.ts`'s `isEligibleDie` both now call it instead of their own inline checks.
  - **Went further than just deduping the fallback rule**: found that tsmap already computes `lotStatsSummary` (via `analyzeWaferLot`) and passes it into `renderWaferGallery`'s `options.lotStatsSummary` today (`main.ts:431/532`) — the exact same object tsmap's *own* yield chart reads from (`lotYieldSeries`). So `stats/yield.ts`'s `YieldItem` gained an optional `yieldPercent` field: when supplied, it's used **directly** (zero recomputation); the dies-based fallback (now via `isYieldEligibleDie`) only runs when it's absent. `renderWaferGallery.ts`'s `renderYieldBinsSection` now looks up each item's precomputed yield from `currentLotStats.lotYieldSeries` (keyed by `waferIndex`) before building the chart data. This is a stronger guarantee than "two independent computations happen to agree" — the Analysis tab's yield bars are now *literally the same numbers* tsmap's own summary panel and Charts page already computed, not a second calculation that matches by construction.
  - Had to fix a latent index bug to wire this correctly: `analysisFacetItems()` filtered out `null` entries in `originalItems` (still-building gallery cards) *before* mapping, which would have shifted `waferIndex` out of sync with `lotYieldSeries`'s indexing whenever any card was still pending. Fixed by mapping first (capturing the true array index as `waferIndex`) and filtering after.
  - Reverified end-to-end after the refactor: all 13 wafers' yield percentages are unchanged and still match tsmap's Charts page exactly (confirms the reuse path produces identical output to the old recompute-and-happen-to-match path); grouped drill-in-place still resolves each wafer's individual yield correctly from the group. New tests: `tests/dies.test.mjs` (`isYieldEligibleDie` directly) and two new cases in `tests/yield.test.mjs` covering the precomputed-`yieldPercent` reuse path (both single-item and die-count-weighted combined). wmap: 404 tests (up from 399), tsmap: 214 tests, both typecheck clean.
  - **Standing lesson**: when a host already computes something wmap also needs, check whether the host is already passing it in (here: `GalleryOptions.lotStatsSummary`, sitting right there, already used by the summary panel) before writing a second computation "generalized from tsmap's own aggregate.ts" — genuinely self-contained math (boxplot quantiles, capability Cp/Cpk, correlation r) is the right default for this package's stats builders, but yield specifically already had a canonical, precomputed, host-supplied answer available and didn't need rederiving.

- **Gaps closed, then the tsmap-side cutover completed.** Direct instruction: close every remaining gap that would make removing tsmap's own Charts page a regression, *then* remove it — not a "ship now, backfill later" cutover. Three gaps, all landed on the link before the cutover:
  - **Wafer-open action.** New `openWaferDetailModal`-equivalent wiring: `renderWaferGallery.ts`'s Analysis tab already had `buildDetachedController(container, item)` (pre-existing, used for the "detach card into its own window" feature) — reused as-is rather than inventing a second way to render a wafer from a `WaferMapDisplayItem`. An `openWafer: (waferIndex, label) => void` callback opens it inside wmap's own `openModal` (`toolbar.ts`, the same primitive the chart expand modal uses), destroying the controller on close. Wired into `barPanel.ts` (new `onOpen?: (datum) => void` on `ChartPanel`, called for a non-group leaf row — yield bars) and `boxplot.ts` (new `onOpen?: (waferIndex) => void`, called for a non-group-overview leaf row). **Bin pareto/bin-cluster bars remain intentionally non-clickable** — opening a *stacked* multi-wafer map for one bin code (tsmap's old `openStackedBin`) needs a synthetic lot-stack `WaferMapResult` that doesn't exist yet; scoped out of this pass and left as the one remaining explicit follow-up below, not silently dropped.
  - **Shared `analysisTab.ts` module.** The ~300 lines of Analysis-tab construction previously inline in `renderWaferGallery.ts` (`renderAnalysisContent`, the three section builders, open/close state) were extracted into `canvas-adapter/analysisTab.ts` — a `createAnalysisTab(deps): AnalysisTabHandle` factory parameterized by `getItems`, `getLotStats`, `getColorSchemeName`, `passBins`, `onSaveImage`, `openWafer`. `renderWaferGallery.ts` now calls this instead of its inline version — verified zero behavior change via Playwright (same 5-split fixture, ungrouped/grouped, all 7 panels, both cross-links, wafer-open).
  - **Single-wafer Analysis tab.** `renderWaferMap.ts` gained the same opt-in `analysisEnabled` option and an "Analysis" toolbar button, calling `createAnalysisTab` with a single-item array — the existing `facetTable.length > 0` gate already hides "Group by" with nothing to group. Hit and fixed one real bug in the process: the Analysis tab element was originally shown by hiding `canvasWrap` (`display:none`) — but the toolbar (including the very Analysis button needed to close the tab) is a *child* of `canvasWrap`, so opening the tab made it un-closable via the UI. Fixed by never hiding `canvasWrap`; the Analysis tab is instead a `position:absolute;inset:0` opaque sibling with implicit/auto `z-index`, which — per normal CSS stacking rules — paints above the plain unpositioned `<canvas>` but below the toolbar's own explicit high z-index, so the toolbar (and its Analysis button) stays visible and clickable throughout.
  - **Report decoupled from tsmap's own `charts/aggregate.ts`.** `main.ts`'s `openReportDialog` now calls wmap's exported `buildCapabilityData(items, testDefs)` (`@paulrobins/wafermap/stats`) directly over the same wmap-shaped items already cached for lot-level analysis (`cachedLotStats.items`), instead of tsmap's own independently-computed copy. Confirmed the `CapabilityDatum` shape is field-identical (both were ported from the same source; the tsmap copy has since been deleted entirely and `reportHtml.ts`/`reportHtml.test.ts` now import `CapabilityDatum` from wmap too) — only label formatting changed cosmetically (wmap's version omits tsmap's old "(#1234)" test-number suffix). Report generation reverified end-to-end via Playwright after the full cutover below: capability section renders correctly from the same fixture.
  - **tsmap's own Charts page removed entirely.** Deleted `src/charts/*` (`aggregate.ts`+`.test.ts`, `binCluster.ts`, `boxplot.ts`, `capability.ts`, `chartShell.ts`, `correlation.ts`, `histogram.ts`, `render.ts`, `types.ts`, `perf.bench.ts` — 11 files/~2000 lines), the `viewMode: 'charts'` union member and the `Charts`/`Maps` toolbar toggle button (`index.html` markup + CSS), `renderChartsView`/`renderChartsViewWork` and every module-level chart-data cache map, and the drill-state variables (`selectedTestNumber`, `boxplotLogScale`, `yieldDrillGroup`, `histogramTestNumber`, `scatterXTest`, etc. — all superseded by wmap's own internal panel state now that wmap owns the charts). `src/charts/icons.ts` was **relocated**, not deleted — it turned out to be a general-purpose icon set consumed by `modal.ts` and `testSelectorUI.ts` too, not chart-specific; moved to `src/icons.ts` with all three import sites updated. `cssVar` (used by `modal.ts`/`menuSelect.ts`, previously imported from `charts/chartShell.ts`) moved to `theme.ts`, the more accurate home for a CSS-custom-property reader. Every wafer map/gallery render in `main.ts` now sets `analysisEnabled: true` unconditionally — it is the only chart access, not an additive extra alongside a separate page. `docs/user-guide.md` §7 rewritten from "Charts view" (a separate toolbar-toggled page) to "Analysis tab" (opened via the Analysis button inside the map/gallery toolbar, present on both single-wafer and gallery views), documenting the actual current panel set including the new **Process capability** panel (present in wmap's Analysis tab, was report-only in tsmap's old Charts page) and correcting stale claims (bin pareto/cluster's click-to-open was tsmap-only and did not carry over — see above; the boxplot trend-line toggle was also deliberately trimmed during the port and never re-added). Verified via a 19-check Playwright pass covering: no `#charts-btn` anywhere in the DOM, gallery load → Analysis tab → all 7 panel titles present → wafer-open click → toggle back to gallery, Report dialog still generates with a capability section, and a single-wafer load → Analysis button present → Yield panel renders → no Group-by control (nothing to group with one wafer). `npx tsc --noEmit` and the full test suite (169 tests) clean in tsmap; wmap unaffected (404 tests, typecheck, build all clean — this was a tsmap-only file removal, no wmap API change).

**Explicitly deferred (tracked here, not forgotten):**

- **Stacked-bin click for bin pareto/bin-cluster bars** — clicking a pareto bar or cluster sub-bar does nothing today (deliberately non-clickable, not silently broken). tsmap's old `openStackedBin` opened a *synthetic lot-stack* wafer map (that bin's dies counted across every wafer that contains it, not a single wafer) — materially more work than the plain wafer-open action above, since it needs a `buildWaferMap({ lotStack: {...} })`-style aggregated `WaferMapResult` that doesn't exist in the Analysis tab's data flow yet. This is the one functional gap tsmap's old Charts page had that the Analysis tab does not yet replicate; scoped out of the cutover pass on the basis that it's a nice-to-have drill, not a primary workflow, per the original plan's explicit call.
- **Findings must stay clickable-to-highlight the relevant wafer region/map** in whatever the decluttered Summary tab + Analysis tab end up looking like — explicit user requirement, not yet addressed since no panel restructuring of the existing summary panel's findings list has happened yet.
- Whether `packages/charts/` becomes its own published `@paulrobins/wafermap/charts` subpath, or stays `canvas-adapter`-internal forever, is still open — revisit now that its shape is clear (8 files: `chartShell.ts`, `barPanel.ts`, `capability.ts`, `boxplot.ts`, `histogram.ts`, `correlation.ts`, `scatter.ts`, `binCluster.ts`).

**Notes / Related:** Directly extends #29 (report extension point) and #30 (lot identity verification) — same underlying finding (wmap's stats/report layer is the right home for cross-host analysis logic), now extended to the DOM/canvas chart layer too. **The wmap↔tsmap boundary rework itself is now essentially complete**: tsmap has no chart/analysis code of its own left (`src/charts/*` is gone), and wmap's Analysis tab is the sole chart surface for both single-wafer and gallery views. Only the stacked-bin click and the findings-highlight requirement remain open, tracked above — this entry will be updated if either lands, rather than opening a new numbered issue.

### 32. ~~In-app help/guide system rethought — `UserGuideExtension` no longer needed by tsmap; two smaller wmap-side gaps remain~~ (resolved in wmap v0.19.0)

**Context:** 2026-07-12, prompted by wmap shipping `UserGuideExtension` (host HTML prepended into wmap's own guide window — `packages/canvas-adapter/toolbar.ts`'s `openUserGuideWindow`) with the stated goal of letting tsmap collapse its two help buttons into one. Investigating the fit surfaced that both wmap and tsmap independently duplicate their own markdown docs into two renderers each — a real static docs site (Zensical, in both repos) and a bespoke in-app HTML-template renderer compiled at build time (`userGuideHtml.ts` in both repos) — and that duplication, not any single piece, was the actual source of fragility in both. A wider review (see conversation, not reproduced here) concluded:

- Most JS rendering libraries ship no in-app help at all; docs live on an external site, and any in-widget "?" is a plain external link. wmap's live-demo-in-widget guide is genuinely justified for wmap specifically (a library shipped into arbitrary unknown hosts, must be self-contained and offline-capable with zero host cooperation) — this is *not* a recommendation to change wmap's approach.
- tsmap's situation is different: it fully controls its own packaging (a Tauri app) and already builds its own static docs site in the same monorepo, so maintaining a *second*, bespoke in-app renderer for the same markdown was pure duplication, not a host-agnostic-portability requirement the way it is for wmap.

**tsmap-side resolution (done, this repo):** tsmap's `scripts/build-user-guide.mjs` now compiles `docs/user-guide.md` directly into a single standalone, self-contained HTML page (`public/guide/index.html` + bundled images, no reachability probing, no GitHub-Pages coupling) instead of a JS-template-literal fragment for an in-app modal. `helpBtn` now calls `platform.openGuide()`, which opens it as a bundled Tauri resource (offline-capable) or a same-origin relative link (web build). `src/userGuideHtml.ts` (generated), `src/guideImages.ts`, and `src/userGuidePrint.ts` were deleted outright — printing is now just the browser's native Ctrl+P on a real page, no custom wrapper needed. See CLAUDE.md's "User guide maintenance" section for the current architecture.

**Consequence for `UserGuideExtension`:** tsmap does **not** adopt it. Injecting tsmap's content into wmap's guide window turned out to be the wrong fix for the "two help buttons" complaint anyway — wmap's own guide is *already* fully self-contained/offline (live demos run wmap's own bundled runtime, icons/screenshot inlined as base64, no network fetch), so routing tsmap's guide through a DOM-injected merge (or worse, disabling wmap's button and hyperlinking to wmap's *hosted* docs site instead) would have traded a working offline feature for a broken one in exactly the offline/air-gapped-lab environments tsmap needs to support.

**Update 2026-07-12 (first pass) — single Help button shipped via a DOM-click workaround, not a wmap API.** tsmap first landed this with `showHelpButton: true` + a CSS-hidden wmap button (`#map-container button[aria-label="User guide"] { display: none }`) that the "Wafer map reference" menu row found via `querySelector` and `.click()`'d. Worked, but fragile — depended on wmap never renaming the `'User guide'` aria-label, and on the button always living inside the render container.

**Update 2026-07-12 (second pass) — resolved properly in wmap v0.19.0.** wmap now exports `openUserGuide(): void` on both `WaferMapController` and `GalleryController`, independent of `showHelpButton`/button visibility. tsmap now passes `showHelpButton: false` (no wmap button in the DOM at all, hidden or otherwise) and its "Wafer map reference" menu row calls `mainViewController.openUserGuide()` directly — the DOM-click workaround and its CSS hide-rule are both gone. Verified end-to-end via Playwright: no wmap help button exists in the DOM even after a map loads, the menu row is enabled once `mainViewController` is set, and clicking it opens `.wmap-guide` correctly. wmap also separately added `window.open()`-with-`openFloatingWindow`-fallback for the guide window itself (reusing the gallery-detach pattern) — confirmed via this repo's own history (`window.open()` returns `null` in Tauri's webview, see issue #27b) that this specifically improves the web build; Tauri desktop still falls back to the in-page floating window, which is fine — wmap's guide has live canvas demos tied to its own running JS context, so it can never open as a true external tab the way tsmap's static guide does. That presentation difference (tsmap: external page; wmap: in-app panel) is accepted as an intentional, explainable distinction between live/interactive vs. static reference content, not a bug to chase full uniformity on.

**Update 2026-07-12 (third pass) — a real regression surfaced and fixed in the same version: live demos were rendering as empty divs.** After adopting `openUserGuide()`, testing tsmap's guide showed every `data-wmap-demo` widget empty (no canvas mounted). Root cause, confirmed with a minimal repro: `populateGuideContent` (the shared helper both the `window.open()` popup and in-page-floating-window branches used) built the guide's content div — including cloning and appending the live-demo `<script>`, then immediately calling `__wmapPopulateGuideDemos()` — **while that div was still detached from the document**. A `<script>` element appended to a detached node does not execute (verified directly: Chromium only runs a script's insertion steps once it becomes connected) — so the population call fired before the script defining it had actually run, and silently no-opped via `?.()`. The original pre-refactor code avoided this by accident of ordering (it attached content to the live DOM *before* finding/cloning the script). Fixed by splitting `populateGuideContent` into `buildGuideContent` (safe to run while detached — creates the div, sets `innerHTML`, sets `__wmapDemoApi`) and `activateGuideScripts` (must run *after* the content is connected — finds/clones/appends the script, calls the populate function), with both `openGuideInFloatingWindow` and `openGuideInPopup` now calling `activateGuideScripts` only after their respective `appendChild` into the live document. Verified via Playwright against both code paths (a real popup, and `window.open` forced to fail to exercise the in-page fallback Tauri actually uses) — all 13 demo widgets mount a `<canvas>` in both. Also confirmed working in the real Tauri desktop app.

**This is exactly the class of bug gap 1 below would have caught automatically** — noting that connection now, since it happened.

**`UserGuideExtension` was not adopted** (tsmap's own guide is a separate static page, not merged into wmap's window) and remains an open question for wmap to resolve independently — whether it's worth keeping for other hosts, or removing since tsmap (its apparent motivating use case) doesn't use it.

**Two smaller, independently-justified wmap-side gaps noted during the original review:**

1. ~~**Zero test coverage on the 13 live demo widgets**~~ (fixed — see Update 2026-07-21 below).
2. **`scripts/build-user-guide.mjs`'s image handling silently drops any markdown image it can't inline** (a regex strips references it doesn't recognize as an icon or the one hand-picked inlined screenshot, rather than warning or failing the build). A future contributor adding a new guide image would get no signal that it vanished from the shipped guide. Still open, still non-blocking; noting here so it's not lost.

**Update 2026-07-21 (fourth pass) — gap 1 above materialized as a real bug: the 13 demo widgets leaked forever, causing an infinite `ResizeObserver` console-error loop after closing the guide.** Found via tsmap's web build: opening then closing the guide (in a context where `window.open()` is blocked/null, forcing the in-page `openGuideInFloatingWindow` fallback) left the browser console spamming `ResizeObserver loop completed with undelivered notifications` nonstop, indefinitely.

Root cause: `docs/guide-demos.js`'s `populateGuideDemos()` instantiates all 13 demos via direct `renderWaferMap`/`renderWaferGallery` calls and discarded every returned controller handle — nothing was ever stored, so nothing's `.destroy()` was ever called. Each demo's own `ResizeObserver` (`renderWaferMap.ts`'s per-instance observer) plus its DPR/colour-scheme `matchMedia` listeners kept running against now-detached canvases forever, since neither `openGuideInFloatingWindow`'s `onClose` nor `openOverlay`'s `close()` (a plain `box.remove()`) ever reached into the guide content to tear anything down.

This was invisible on wmap's own demo site only because `openUserGuideWindow` tries a real popup first (`openGuideInPopup`) — when that succeeds, closing the popup destroys its entire separate JS realm, masking the leak regardless of whether cleanup code exists. It is not a difference in wmap's code between hosts, only in whether `window.open()` happens to succeed for the current origin/host — it's confirmed to *always* fail in Tauri's WebView (issue #27b), so real desktop-app users hit this every time, not just first-visit browser tabs.

**Fixed in wmap, published in v0.20.4 (2026-07-21):** `populateGuideDemos` now collects each demo's controller handle and exposes a paired `window.__wmapDestroyGuideDemos()` teardown (same global-function convention `__wmapPopulateGuideDemos` already uses, since this is plain re-executed inline JS, not a module). `openGuideInFloatingWindow`'s `onClose` and `openGuideInPopup`'s `cleanup()` both now call it before/alongside `restoreApi()`. Confirmed fixed end-to-end in tsmap's web app (the console loop no longer occurs after opening and closing the guide); tsmap unlinked and pinned to published `^0.20.4` the same day.

### ~~33. Insights tab "Export CSV" button has no save hook — broken in Tauri, same class of bug as #12/#28~~ (fixed in v0.20.2)

**Where:** `packages/canvas-adapter/summaryPanel.ts` — `downloadTextFile(text, filename, mimeType)` (~line 705), called by the "Export CSV" button (~line 838-875) in the test-values table shown in the Insights/summary panel.

**Problem:** `downloadTextFile` builds a `Blob`, an `object URL`, and a detached `<a download>` anchor, then calls `.click()` directly — the exact same pattern issue #12 already identified as broken in Tauri (`<a download>` is suppressed; the click silently does nothing, no dialog, no error). Issue #12 fixed this for PNG saves by adding `onSaveImage?(blob, suggestedName)` to `RenderOptions`, which tsmap now uses via `platform.savePng` (routed through a native save dialog). `downloadTextFile`, however, has no equivalent host hook — it always does the raw anchor-click dance regardless of what render options the host passed, so the fix for #12 never covered it.

**Symptom in tsmap:** Clicking "Export CSV" on the Insights tab's tests table does nothing observable — no save dialog, no file written, no console error (the only console entry is an unrelated, harmless "ResizeObserver loop completed with undelivered notifications" warning). Confirmed by reading the code: tsmap's `onSaveImage` callback (`src/main.ts`) is wired into `renderWaferMap`/`renderWaferGallery` options for **image** saves only; there is no corresponding options field for `summaryPanel.ts` to call for text/CSV saves, so it always falls through to the raw anchor click, which is a no-op in Tauri.

**Suggested fix:** Add an `onSaveText?(text: string, suggestedName: string, mimeType: string): void | Promise<void>` (or a narrower `onExportCsv`) to `RenderOptions`/`SummaryPanelOptions`, mirroring `onSaveImage`. When provided, `downloadTextFile` (and any other CSV/text export button in wmap, e.g. splits or report exports if they share this helper) should call it instead of the anchor-click fallback. tsmap would then wire it to `platform.saveTextFile` (already used for the splits CSV export, `src/main.ts` line 1218) the same way `onSaveImage` is wired to `platform.savePng`.

**Notes / Related:** Same underlying gap as #12 (PNG save hook, fixed) and #28 (hook not propagated to gallery per-card renders) — a third call site (`downloadTextFile`) was never given the hook at all rather than having it but not propagating it. Worth checking whether other exports (report HTML, if any use a similar raw download) share this helper and would be fixed for free.

**Fix applied (wmap, pending release).** Shipped essentially as suggested: new `onSaveText?(text, suggestedName, mimeType): void | Promise<void>` on both `RenderOptions` and `GalleryOptions`, mirroring `onSaveImage`. New shared `saveTextFile(text, filename, mimeType, onSaveText?)` in `toolbar.ts` (alongside `saveImageBlob`) replaces the local `downloadTextFile`; `buildTestSection`/`buildLotTestSection` (the CSV export's actual builders, shared by the Summary panel and the Insights Overview tab's test-values table — so both surfaces are fixed by the one change) now take an `onSaveText` param and use it. Threaded through `renderWaferMap`, `renderWaferGallery` (including per-card renders, for parity with `onSaveImage`/#28), and `createInsightsTab`. tsmap should wire `onSaveText` to `platform.saveTextFile` the same way `onSaveImage` is wired to `platform.savePng`, and can then drop nothing on its own side (no workaround was ever built for this one). Covered by a new wmap test (`renderWaferMap onSaveText hook intercepts the Summary panel's CSV export`, `tests/dom-adapter.test.mjs`) asserting the hook is called with the right text/name/mimeType and that the default `<a download>` path is bypassed.

### 34. No first-class per-test pass/fail datum — functional (FTR) tests were faked as values and got parametric statistics (fixed in wmap 0.20.3; tsmap side pending testdata-parser release)

**Where:** wmap `packages/renderer/buildWaferMap.ts` / `buildView.ts`, `packages/stats/*`, `packages/canvas-adapter/*`; tsmap `packages/parsers/src/*`, `src/lib.ts`, `scripts/generate_stdf*.py`.

**Problem (as originally found, then widened):** first seen as the inbuilt sample dataset's FTR test 2001 `scan_chain` appearing in the Insights tab with a boxplot/histogram/Cpk/correlation entries — statistically meaningless for a binary outcome. Root cause went deeper than a missing stats filter: **the whole pipeline had no per-test pass/fail datum.** The parsers collapsed FTR outcomes into fake `1.0`/`0.0` entries in `testValues`, discarded PTR TEST_FLG pass/fail entirely (ATDF PTR pass/fail wasn't even parsed, though the field exists), and wmap's die model had nowhere to put a verdict — so a functional test rendered as a 0→1 gradient colorbar with tooltips reading "scan_chain: 1".

**Fix applied (wmap, released in v0.20.3):**

- **Data model:** `TestDef.testType?: 'P' | 'F'` (default `'P'`) + exported `isParametricTest()`; new `DieResult.testPass?: Record<testNumber, boolean>` / `Die.testPass` (true = pass), parallel to `testValues`. P tests: value + optional recorded verdict; F tests: verdict ONLY. New exported `getTestPassStatus(die, tn, def)` is the single verdict read-path and owns the documented migration fallback (F-typed test with `testValues` exactly 0/1 → 1 = pass) — legacy data (e.g. anything parsed by published `testdata-parser` ≤ 0.4.0) keeps working everywhere. New exported `dieHasTestData()` unifies "has any test data" checks (verdict-only dies get value mode).
- **Unified pass/fail display:** `ViewOptions.passFailDisplay?: 'off' | 'spec' | 'test'` generalises the old `colorBySpec` (now a deprecated alias for `'spec'`). `'spec'` = limits judgement (green/blue/red, unchanged); `'test'` = the tester's recorded verdict (green/red, undirected). buildView resolves the *effective* display and degrades invalid requests; an F-typed active test is always forced to `'test'`. Both solid displays replace the colorbar with a counted Pass/Fail legend; the map title's secondary line names which is shown (`Spec pass/fail` / `Test pass/fail (recorded)` / `Test pass/fail (functional)`), so spec-vs-test can never be confused even when they disagree. Overlays menu gets two mutually exclusive entries shown only when valid; log-scale/colorbar-range controls hide under solid displays; tooltips read `scan_chain: Pass` and annotate parametric rows with `(recorded fail)`; die labels render `P`/`F`.
- **Stats:** F tests are excluded from every parametric statistic (`discoverTestNumbers` → perTestStats/Welch findings, spec-yield paths, capability, correlation, chart-suite feeds, `stackedValues`/lot-stack value aggregation — the last was a separately-found live gap). They get pass-rate analysis instead: `StatsSummary.stats.functionalYield` (per-test pass/fail/verdict counts, `passRatePercent`; computed by new exported `computeFunctionalYield`), "Functional Tests" tables (Summary panel, Insights Overview card, HTML summary report — wafer + lot-pooled variants, own CSV export via `onSaveText`), and regional pass-rate findings (`kind: 'functionalTest'`, two-proportion z, reusing the yield/bin significance machinery via new shared `bucketDiesByRegion`/`finalizeProportionFindings`).
- Aggregated/lot-stacked dies always strip `testPass` (one wafer's verdicts are meaningless on a stacked die). Covered by new tests across `tests/passFailDisplay.test.mjs`, `stats/capability/correlation/summaryPanel/renderSummaryReport/build-wafermap/dom-adapter` suites — wmap suite now 497 green.

**Fix applied (tsmap, pending release):**

- **Parsers:** `DieResult.test_pass: HashMap<String, bool>` (serde camelCase `testPass`, omitted when empty — parametric-only files byte-identical). STDF: TEST_FLG bit 6 (0x40) = no indication → nothing recorded, bit 7 = fail; PTR emits the verdict alongside its value (the fail-and-zero → NaN value rule unchanged); **FTR stops writing 1.0/0.0 values** and records the verdict only; all three duplicated parse paths (plain/filtered/timed) updated; `SiteAccum` gains a parallel pass channel. ATDF: PTR `PASS_FAIL` (field 5 — present in the spec all along, previously unread) now parsed; FTR verdicts move to the pass channel. 97 cargo tests green incl. new TEST_FLG-semantics, verdict-routing, and serde-contract tests; bench unchanged (~2M PTR/s on sample lots).
- **TS:** `applyTestSelection` prunes `testPass` with the selection; `autoPlotMode` counts verdict-only dies as test data. (`toWmapTestDefs` already passed `testType` through.) 159 Vitest green incl. new parser-shaped integration tests through linked wmap.
- **Generator bug found by the end-to-end pass:** every STDF generator script wrote a **non-spec FTR record** — `XFAIL_AD`/`YFAIL_AD` as I*2 (spec: I*4) and the test name written into the `FAIL_PIN` slot with the real `TEST_TXT` left empty — so the spec-correct walker mis-aligned and every generated FTR silently lost its name (surfaced as "Test 2001" instead of "scan_chain" in the UI). Fixed in all four `generate_stdf*.py` scripts; `sample_data/PVT-LOT-05.stdf` + `sample-lot.stdf.gz` + splits CSV regenerated (deterministic seeds); a cargo test now asserts FTR names are non-empty on the sample lot.

**End-to-end verified** (Playwright against the built web app + linked wmap, sample lot — deliberately exercising the *legacy* 0/1 path since the browser build still uses published parser 0.4.0): scan_chain renders solid green/red with `Pass · N / Fail · N` legends and `Test pass/fail (functional)` titles on all 13 gallery cards; no colorbar/log/range controls; neither pass/fail overlay entry offered; tooltip `scan_chain: Pass`; Insights Overview shows the "Functional Tests" pass-rate card (97.1%, N=2769); scan_chain absent from Test Values/boxplot/histogram/capability/correlation. 10/10 checks green.

**Remaining deferral:** a stacked (lot-aggregate) functional representation — per-position fail count across the lot, countBin-style. F tests are simply excluded from `stackedValues` for now.

**Release train note:** required a wmap minor release AND a `@paulrobins/testdata-parser` release (wasm rebuild) before tsmap could unlink. **wmap 0.20.3 has shipped** and tsmap is unlinked and pinned to it (2026-07-19, see version-tracking table above). The parser-side changes landed in tsmap v0.1.20 (2026-07-19) but sat unpublished for about a month with nothing in the build pipeline flagging it — `packages/parsers/Cargo.toml` is now bumped to 0.5.0 (2026-07-20) and `package.json` pinned to `^0.5.0`, but the actual `wasm-pack build` + `npm publish` (needs an OTP only the maintainer can provide) are still outstanding as of this note. Until that publish happens, browser builds keep producing legacy-encoded functional data via the documented fallback; the native Tauri path already builds the local crate directly and is unaffected. **This won't go unnoticed again**: `scripts/check-testdata-parser-published.js` (new, wired into `prebuild`/`prebuild:web`) fails a release build if `packages/parsers/src` has changed since the version was last bumped, if `Cargo.toml`'s version doesn't match `package.json`'s pinned range, or if that range doesn't resolve to a published npm version.

### 35. Linux Wayland/Tauri hidden-window decoration bug — tsmap host workaround

**Where:** tsmap `src-tauri/src/lib.rs`.

**Problem:** On Linux/Wayland, a Tauri window created hidden (`visible: false`) and then shown later can leave native titlebar decorations unresponsive until the window is refocused or a focus-driven workaround runs. In tsmap this manifested as the main window's minimize/maximize/close buttons not responding immediately after launch.

**Workaround in tsmap:** In `src-tauri/src/lib.rs`, the main window's `WindowEvent::Focused(true)` handler toggles `set_resizable(false)` then `set_resizable(true)` when built on Linux. This forces GTK to recompute the decoration hit-test region and restores the titlebar buttons.

**Impact:** Linux-only and Tauri-only. Web builds and non-Linux platforms are unchanged by this workaround.

**Suggested host guidance:** Avoid hidden-then-show on Linux/Wayland if possible, or apply the same resizable toggle on focus as a temporary fix until the upstream Tauri/Wry/TAO pipeline is fixed.

### 36. ~~Insights tab chart cards/controls have no stable class/aria-label hooks~~ (fixed in wmap 0.23.1)

**Update (2026-08):** partially stale even before this fix — wmap commit `98e5849` (2026-07-30) had already added `aria-label="Expand"`/`"Save as PNG"` and `role="tab"`/`aria-selected` to the sub-tabs, ahead of this entry being written. What was still genuinely missing (card/grid/Group-by/Insights-button hooks) is fixed below, alongside building the scripted investigation scenario (`scripts/scenarios/edge-corner-lot.mjs`, `scripts/run-scenario.mjs`) that needed it — see that file's own header for the beats this unblocked.

**Where:** `packages/canvas-adapter/charts/chartShell.ts` — `cardShell()` (card `div` and its Expand `button` are both unlabeled: no `className`, no `id`, no `aria-label`; the Expand button only sets `.title = 'Expand'`) and `makeChartGridWrap()` (grid wrapper `div`, also unlabeled). `packages/canvas-adapter/insightsTab.ts` — the sub-tab bar buttons (Overview/Distributions/Correlation) carry only `textContent`, no `aria-label`/class either, and the "Group by:" control (`makeLabeledSelect`) nests its `<select>` inside a `<label>` with no id/name to query by.

**Problem:** tsmap's `scripts/capture-screenshots.mjs`/`capture-definitions.mjs` (Playwright-driven screenshot capture, used for the in-app guide and this session's new marketing-site work) previously targeted the *former* tsmap-owned Charts view's DOM — `.chart-card`, `button[aria-label^="Expand"]`, a `#charts-btn` toolbar id, and a "Group by:" `<span>` sibling of a plain `<select>`. When that view was removed and folded into wmap's own Insights tab (issue #31), none of those selectors carry over: the new cards/buttons/tab-bar/select are all bare, unlabeled DOM nodes distinguishable only by exact heading text or button textContent. 6 of 9 affected screenshot captures failed loudly (`selector not found`), but the 7th (`charts-overview`, clicking a now-nonexistent `#charts-btn`) failed *silently* — the click was a no-op, and the capture happily screenshotted the still-showing gallery view under a misleading "charts-overview.png" filename, which would have shipped as a wrong screenshot had it not been checked visually.

**Impact:** Any external tooling (screenshot capture, e2e tests, visual regression, accessibility audits) that needs to drive the Insights tab from outside wmap's own code has no stable selector to do so and must resort to fragile heading-text/textContent matching, which breaks silently on any copy change (e.g. a future rename of "Test correlation matrix" to something else) rather than failing loudly.

**Old workaround in tsmap:** `scripts/capture-screenshots.mjs` opened Insights via `button[aria-label="Insights"]`, switched sub-tabs by exact `textContent` match, and located a given chart card by finding the heading `div` whose text starts with its known title string. Still in place for the 24 existing screenshot captures (unchanged, still working, not worth the churn of migrating a proven target) — but the scenario runner's own steps use the new hooks below instead.

**Fix (wmap 0.23.1):**
- `chartShell.ts`'s `cardShell(title, ...)` now sets `card.dataset.wmapChartCard = '1'` and `card.dataset.wmapChartTitle = title` — one change covering all 8 chart panels plus Overview's `plainCard()`.
- `makeChartGridWrap()` sets `data-wmap-chart-grid`.
- `makeLabeledSelect()` gained an `opts.hook` parameter — `select.dataset.wmapSelect = hook` — since the same factory builds the Group-by control, every per-panel "Group:" restrict dropdown, and the histogram wafer picker, so a bare `<select>` is ambiguous. `insightsTab.ts`'s Group-by call site passes `{ hook: 'group-by' }`.
- `insightsTab.ts`'s `makeTabButton` sets `data-wmap-insights-tab` to the view key (`overview`/`distributions`/`correlation`); `makeBackTabButton` sets `data-wmap-insights-back`.
- `renderWaferMap.ts`/`renderWaferGallery.ts`'s Insights toggle button gets `data-wmap-insights-btn` — needed because its `aria-label` is *itself* toggled (`'Insights'` ↔ `'Back to wafer/gallery view'`), so `button[aria-label="Insights"]` only ever matched while closed and couldn't assert open state or close it.
- Test coverage: `wafermap/tests/chart-shell-hooks.test.mjs` (new, unit-level: `cardShell`/`makeChartGridWrap`/`makeLabeledSelect`'s hook wiring directly) and an extended case in `wafermap/tests/dom-adapter.test.mjs` (full-pipeline: renders Insights, asserts the hooks are actually present on real rendered output). 623/623 wmap tests pass.
- **Not done / deferred:** `makeBackTabButton`'s hook has no dedicated DOM test (low risk — identical mechanism to `makeTabButton`, already proven). Promoting `setInsightsOpen` onto `GalleryController`, and a `setInsightsView`/`setGroupBy` API on `InsightsTabHandle`, remain unbuilt — the scenario drives the real UI by design, so these were never required, but they'd still be a reasonable follow-up for host code that wants to control Insights without simulating clicks.

**Status:** fixed and published in wmap 0.23.1 (2026-08-18); tsmap unlinked and pinned to `^0.23.1`. **Still open:** `scripts/capture-screenshots.mjs`/`capture-definitions.mjs`'s 24 existing Insights captures still use the old heading-text/textContent matching described above — migrating them to the new `data-wmap-*` hooks is real cleanup but wasn't required to close this issue (the scenario runner, `scripts/scenarios/edge-corner-lot.mjs`, already used the new hooks from the point they existed on the linked build) and hasn't been scheduled.

### 37. Summary reports open via `xdg-open` into an existing, unfocused browser window — looks like the button silently does nothing

**Where:** tsmap `src-tauri/src/commands/write_temp_html.rs` (the `write_temp_html` command backing `platform.openReport`, registered with wmap via `setReportOpener` in `main.ts`). Not a wmap bug — wmap's involvement ends at handing the report HTML string to the registered `setReportOpener` callback; everything described below happens entirely in tsmap + the OS after that.

**Problem:** On Linux, `write_temp_html` writes the report HTML to a temp file and shells out to `xdg-open <path>` to display it. `xdg-open` hands the file off to the user's default browser (Chrome) — if Chrome is already running, the request goes to that existing process as a new tab, not a new window. Linux window managers generally refuse focus-steal requests from background-spawned processes as a matter of policy, so Chrome opens the tab but does not raise/focus its window. If that Chrome window happened to be minimized, it stays minimized. From the user's perspective, clicking "Summary report" (gallery lot-level or the per-wafer button in a detached card) appears to do nothing, when the report in fact opened successfully but invisibly. Confirmed by direct testing (2026-07-21) — the report was there, in a minimized Chrome window, on every click.

**Impact:** Every `setReportOpener`-routed report open (`renderLotSummaryReportHtml`/`renderSummaryReportHtml`) is affected identically; not specific to the gallery or to detached cards. Linux-only as investigated so far — not yet checked on macOS (`open` command, same fire-and-forget shape, may or may not have the same OS-level focus-steal restriction).

**Possible directions — none implemented, all need scoping before committing to one:**

1. **Forward an xdg-activation token (Wayland only).** Generate/consume a fresh activation token from Tauri's own focused window before spawning `xdg-open`, and pass it via `XDG_ACTIVATION_TOKEN` in the child process's environment. Wayland compositors (GNOME/KDE) that support xdg-activation will honor a request carrying a valid token from the currently-focused surface and grant focus for it. Works only on Wayland; does nothing on X11, and needs a working token-generation path from Tauri/wry, which isn't confirmed yet.
2. **Skip the OS browser entirely — open the report in its own Tauri `WebviewWindow`** loading the HTML directly (e.g. via a data URL or Tauri's asset protocol) instead of writing a temp file and shelling out to `xdg-open`. Tauri fully owns focus for windows it creates itself, so this is the most reliable fix and is platform-uniform (Linux/macOS/Windows alike) — but it drops the system browser's own print/save-as-PDF chrome, and the report becomes just another app-owned window the user has to consciously close. Unlike issue #27b, this does *not* need to share a live JS realm with anything — it's static, already-rendered HTML — so none of #27b's "Tauri can't hand over a live document" blockers apply here.
3. **Cheap/fragile band-aid:** after spawning `xdg-open`, best-effort shell out to `wmctrl -a` (or equivalent) to try to find and raise the newest browser window. Racy (no reliable way to identify which window is the new tab), depends on `wmctrl` being installed, and only covers X11/some Wayland compositors with XWayland compatibility layers. Not recommended as a real fix, listed for completeness.

**Status: unresolved, needs a decision before implementation.** No fix applied yet. Leaning toward option 2 as the most robust and platform-uniform, at the cost of losing the system browser's native print/PDF affordances for the report view.

**Related symptom, same root cause, different feature (2026-07-21):** the Help menu's "tsmap guide" row (`platform.openGuide()`, also `openPath` on Linux) hits the identical OS-level focus-steal refusal — clicking it can silently reopen into an already-open-but-minimized browser with no visible change. Rather than fix the underlying OS behavior (same open questions as above), `openHelpMenu` (`src/main.ts`) added a lightweight, purely cosmetic mitigation: a brief `showToast` confirmation ("Opening in browser…") fires the instant the row is clicked, so the *in-app* feedback is immediate and unambiguous regardless of what the external browser window does. This does not fix #37 itself (the report opener has no equivalent in-app surface to toast from, and a toast doesn't solve "the report window still isn't focused") but is worth knowing about if/when #37 gets a real fix — the same toast pattern could be reused for the report-open path too as a stopgap alongside whichever of options 1-3 above gets picked.

**Decision (2026-08-28) — option 2 chosen, but "own webview window" turned out to be unnecessary: an in-app modal solves this for both the report AND the guide, and also fixes the confusing two-separate-guide-systems UX (raised independently, same session) — supersedes the option list above.** Prompted by a direct observation: tsmap's own guide has *the same* symptom as this issue (opens via `xdg-open` into the system browser, can mis-focus/stay minimized) while wmap's own guide (reached from the same tsmap Help menu) opens as an in-app modal — two different presentations for what a tsmap user experiences as one "help" concept, confusing on its own even before the focus-steal bug. Investigated properly before deciding, including a fresh check of Tauri v2's actual APIs (`v2.tauri.app/reference/javascript/api/namespacewebviewwindow`) rather than assuming option 2's original shape was still the best one:

- **`WebviewWindow` has no print/PDF API** — confirmed against the current v2 JS reference (no `print()`, no `printToPDFOptions()`; those were speculatively mentioned in an old, unanswered Tauri discussion thread but don't exist in the actual API surface). So option 2 as originally scoped ("open the report in its own Tauri window... but it drops the system browser's own print/save-as-PDF chrome") was solving the focus bug by trading away printing — a real cost that doesn't need to be paid.
- **`window.print()` called from inside a Tauri webview already opens the OS-native print dialog**, same as any browser tab — this is standard, unremarkable webview behavior (WebView2, WebKitGTK, and WKWebView all support it), not a Tauri feature. **wmap's own overlay chrome already has a working print mechanism for exactly this** — `toolbar.ts`'s `openOverlay` injects an `@media print` stylesheet (`markPrintVisible`) that hides everything on the page except the currently-open modal/window and un-styles its chrome, so `window.print()` while a wmap overlay is open prints *just that overlay's content* cleanly. This was already built (for the guide's real-popup print case) and just needed to be exposed as a button and reused for the report.
- **This works identically in a plain web app and in Tauri** — both cases matter here since wmap must support both. Neither `window.print()` nor the `@media print` CSS trick are Tauri-specific; they're browser-engine-standard, so no host branching is needed at all. This also means the fix needed no `WebviewWindow`/IPC work of any kind.

**Revised design, now implemented on the wmap side (see "wmap-side status" below):**
1. **Report opens in an in-app wmap modal by default** (`openReportModal`, new) — no `setReportOpener` wiring required just to *view* a report, in a browser tab or in Tauri alike. This alone fixes the "did my click do anything" symptom this issue is about: the primary interaction never leaves the app, so the OS-level focus-steal bug can no longer make the primary action look broken.
2. **Printing is a header button inside that modal** — calls `window.print()`, scoped to the report via `<iframe srcdoc>` isolation (see `openReportModal`'s own doc comment/api.md entry) rather than the sibling-hiding CSS trick the guide uses (report HTML is a full standalone document, so an iframe is the more natural fit than parsing it apart). No host wiring, no lost printing.
3. **`setReportOpener`/`xdg-open`/system browser becomes a secondary, explicit "Open as full page ↗" link inside the modal** — still there for a host that wants a real separate page (bookmarking, keeping it open outside the app, or a per-platform print fallback if in-app printing ever misbehaves somewhere), but no longer the primary path, so this issue's original focus-steal symptom is now an edge case a user deliberately opts into rather than the default click behavior. tsmap's `write_temp_html`/`xdg-open` Rust command does **not** need to change — it's still exactly what should run when that link is clicked; it just stops being reached by default.
4. **The exact same shape applies to the guide**, closing the "two different guide systems" UX gap raised alongside this issue: wmap's guide window (the in-page floating-window fallback used whenever `window.open` is blocked, i.e. Tauri/Electron/WebView2) now has the same Print/Save-as-PDF header button, for the same reason — no host wiring, works in both browser and Tauri hosts. **tsmap's side of this is the remaining open work** — see below.

**wmap-side status: implemented, unpublished (linked local dev only, not yet released — batching per the usual link/prove/publish workflow).**
- `packages/canvas-adapter/toolbar.ts`: `OverlayOptions.printable?: boolean | (() => void)` — adds a Print/Save-as-PDF header button to any `openModal`/`openFloatingWindow` overlay; `true` calls the overlay's own `window.print()`, a function is used when the real content lives in a child document (the report's iframe) the sibling-hiding print stylesheet can't reach. New `print` icon (`docs/images/icons/print.svg`, Lucide-style, added to the now-public `ICONS` set — see #16 above).
- New `openReportModal(html, opts?)` (`toolbar.ts`, exported from `canvas-adapter/index.ts` → the `/render` subpath) — the in-app report modal described above (iframe + print button + "Open as full page" link).
- `summaryPanel.ts`'s two "Summary report" buttons (`renderWaferSummaryContent`, `renderLotSummaryContent`) now call `openReportModal(...)` instead of `openHtmlReport(...)` directly.
- Guide's `openGuideInFloatingWindow` (the Tauri-relevant path) now passes `printable: true`.
- `docs/api.md` updated: new §10.3 `openReportModal`, §7.9 `openHtmlReport`/`setReportOpener` reframed as the secondary/fallback path, §5.11 (`UserGuideExtension`) gets a printing note, plus the three "Summary report button calls this automatically" cross-references updated.
- Tests: `tests/summaryPanel.test.mjs` — two new cases assert "Summary report" produces a `.wmap-modal-box` with an iframe (`srcdoc` containing real report content), a `button[aria-label="Print / Save as PDF"]`, and an "Open as full page" link, for both the single-wafer and lot panels. Full suite green, `npm run check` clean.
- **Code review pass (2026-08-28) caught one real gap the above missed**: `renderWaferGallery.ts` has its *own* separate "Findings report" button (the gallery's per-wafer findings sidebar, distinct from the Summary panel's "Summary report" button) that was still calling `openHtmlReport` directly — same silent-no-op-in-Tauri class of bug this whole fix exists to close, just left untouched because it lives in a different code path. Fixed: now routes through `openReportModal` too, with a new regression test (`tests/dom-adapter.test.mjs`) asserting it opens a `.wmap-modal-box` with an iframe rather than calling `window.open`. Also fixed two stale doc comments (`packages/stats/reportHtml.ts`, `packages/stats/renderFindingsReport.ts`) that still described `LotStatsSummary.lot` as a "first-wafer-wins" shortcut — inaccurate since the #30 fix earlier in this same session (now: all-agree, omit-and-flag-via-`mixedIdentityFields` on mismatch). Full suite green (680 tests), `npm run check` clean. **Worth noting for the tsmap-side work below**: re-check for any other tsmap-side call site that might reach for `openHtmlReport` directly instead of a report/findings surface wmap already exposes — the pattern that caused this miss (a second, less-obvious call site of the same underlying function) could recur.

**tsmap-side work still needed (not started — this is the part that must land in the tsmap repo, tracked here so it isn't lost between sessions):**
1. ~~**Re-adopt `UserGuideExtension`**~~
2. ~~**Delete tsmap's separate "tsmap guide" Help-menu row and its `platform.openGuide()`/`xdg-open` path**~~
3. **Bump wmap once this batch is ready to publish** (this is one piece of a larger in-progress batch — see the version-tracking table's "wmap version in use" row for what else is queued) and re-verify end-to-end in Tauri specifically: confirm the guide's print button produces a real print dialog under WebKitGTK (Linux is the untested engine — this file has no confirmed WebKitGTK `window.print()` test yet, only general research), confirm "Summary report" opens the in-app modal with no `setReportOpener` registered at all, confirm the "Open as full page" link still correctly routes through tsmap's existing `write_temp_html` opener when clicked. **Still open — this needs the actual `npm publish`/`wmap:unlink`/pin step, held back deliberately for the user to trigger.**
4. ~~**Decide whether tsmap's toast mitigation** ... is still needed anywhere~~

**Update (2026-08-28, this session) — points 1, 2, and 4 done; point 3 (publish) deliberately held back.**

A real gap surfaced while implementing point 1 and was fixed as part of the same batch, not logged separately since it's directly load-bearing for this issue: **wmap had no way to open the guide window without a live `WaferMapController`/`GalleryController`** — only `controller.openUserGuide()` existed, both thin wrappers around the already-internally-exported `openUserGuideWindow(api, html, extension, anchor)` built from wmap's own top-level functions (`buildWaferMap`, `renderWaferMap`, `renderWaferGallery`, `analyzeWaferMap` — nothing derived from a specific render). tsmap's own guide content is useful before anything is loaded (file formats, CLI flags, column mapping), so collapsing to one Help-menu row gated on a live controller, as originally scoped above, would have silently removed guide access in the empty state. Considered and rejected a dummy hidden controller instantiated just to reach the guide — `renderWaferMap`/`renderWaferGallery` create a real canvas, `ResizeObserver`, and `matchMedia` listeners, exactly the machinery whose leaked teardown already caused a real bug (this issue's own 2026-07-21 "fourth pass", the infinite `ResizeObserver` console-error loop) — building and tearing down a full render purely to reach one button would reintroduce that risk for no reason.

**Fixed in wmap (same unpublished batch as the rest of this issue):** new `openWaferMapGuide(extension?, anchor?): void`, exported from `packages/canvas-adapter/index.ts` → `/render` — a thin controller-free wrapper around `openUserGuideWindow`, same shape as `openReportModal`. Documented as docs/api.md §10.4, cross-referenced from §5.11. Two new tests (`tests/openWaferMapGuide.test.mjs`) confirm it opens the floating window with no prior render and that a host extension's html is prepended before wmap's own guide content, same as the controller path. Full suite green (684 tests), `npm run check` clean.

**tsmap side (done, uncommitted — this repo):**
- `scripts/build-user-guide.mjs` rewritten to emit a fragment (`src/guideExtension.ts`, generated/gitignored, `TSMAP_GUIDE_HTML`) instead of a standalone `<!doctype html>` page — own `<style>` (scoped to a `.tsmap-guide-scope` wrapper class, not `:root`, since this fragment can land inside the SAME document as the running app via wmap's in-page floating-window fallback, not always a separate popup document — a bare `:root` rule would have leaked tsmap's light-theme tokens over the whole app's dark theme for as long as the guide stayed open) and app-absolute image paths (`/guide/images/...`) instead of page-relative ones.
- `main.ts`: one shared `guideExtension` object passed as `userGuideExtension` to both `renderWaferMap`/`renderWaferGallery` calls, and to `openWaferMapGuide` in `openHelpMenu`'s single remaining "User guide" row (`mainViewController ? mainViewController.openUserGuide() : openWaferMapGuide(guideExtension, anchor)`) — collapsed from the old two-row menu, `enabled` gate, `showToast` calls, and `ICONS.externalLink` marker, all removed as no longer applicable.
- `platform.ts`: `openGuide()` removed from the `Platform` interface and both implementations (Tauri `resolveResource('guide/index.html')`/`openPath`, web popup/`openFramedModal` fallback). `openReport`/`write_temp_html` untouched — still the report's "Open as full page ↗" fallback, unrelated to this change.
- `icons.ts`: `ICONS.externalLink` deleted (its one call site is gone). `ICONS.printer` was already unused before this change (pre-existing, not touched — printing now lives entirely inside wmap's own guide/report windows).
- `src-tauri/tauri.conf.json`: removed the `"../public/guide": "guide"` bundle-resources entry — nothing resolves that resource path any more.
- CLAUDE.md's "User guide maintenance" section and the architecture tables (README.md + CLAUDE.md) rewritten/updated for the new fragment-based flow. `check-architecture-docs.mjs` passes.
- Checked `scripts/capture-screenshots.mjs`/`capture-definitions.mjs` for anything keyed to the old two-row Help menu or its row text — nothing is; `empty-toolbar` only screenshots `#toolbar` itself (Help button unchanged, only its dropdown), never an opened menu. No recapture needed.
- Verified: `npx tsc --noEmit`, `npm run check:docs`, `npm run lint`, `npm test` (391 passed) all clean against wmap linked to this unpublished batch.

**Update (2026-08-28, same session) — visual/UX follow-up after first review: the merge looked like two stacked guides, not one.** Direct feedback on the first pass: tsmap's section had no horizontal breathing room (wmap's did), the TOC (tsmap-only, listing just its 10 sections) looked "untidy/amateur," there was no way back to it once scrolled past, and doc prose in a few places explicitly told the reader "this part is a separate library, tsmap" — exactly the seam a combined guide should hide, since a tsmap user has no reason to know wmap exists as a distinct thing.

**Fixed in wmap (same unpublished batch):**
- New `buildGuideToc` (`toolbar.ts`, called from `buildGuideContent`) — ONE sticky "Contents" nav built by scanning every `<h2 id>` in the *merged* document (a host's `extension.html` and wmap's own content alike, in document order), not something tsmap builds for its own section alone. A "Contents (N)" disclosure toggle (`wireExpandToggle` — the existing click/Enter/Space-toggle, Escape/outside-click-closes primitive, not a hand-rolled one) opens a multi-column link grid; a "Top" shortcut sits alongside it. Every heading in the merged document (not just the h2s listed) gets `scroll-margin-top` so a jump target never lands hidden under the sticky bar — verified in a real browser: a target heading lands at `48.64px` from the viewport top (bar height + margin), exactly as designed, in both the real-popup and in-page-floating-window presentations. Skipped entirely under two sections total, so a trivial guide gets no dead chrome. Hidden in print (`.wmap-guide-toc{display:none!important}` — sticky positioning and a live disclosure button have no printed form, same treatment the existing "view online" banner already got).
- `.wmap-guide`'s `max-width` changed from a hardcoded `720px` to `max-width: var(--wmap-guide-reading-width, 720px)`, and the maximize toggle (`openGuideInFloatingWindow`'s `onMaximizeChange`) now sets that custom property on the shared content wrapper instead of toggling a `.wmap-guide--max` class scoped to wmap's own div — so a host's own extension content can opt into the identical reading-column width (and identical widening on maximize) via the same variable, with no dependency on a wmap-internal class name. Documented in `UserGuideExtension`'s doc comment and `docs/api.md` §5.11 as the "matching wmap's reading measure" convention.
- Verified in a real headless Chrome, both the real-popup path and the `window.open`-forced-to-fail in-page floating-window path (what Tauri/WebKitGTK actually uses): `.tsmap-guide` and `.wmap-guide` report identical computed `padding` (`24px 32px`) and `max-width` (`720px`, `1000px` after maximize, in both sections together), the combined TOC lists all 19 sections (10 tsmap + 9 wmap) correctly interleaved in document order, and the app's own toolbar background colour is provably unchanged (`getComputedStyle` before/after) while the guide is open — confirming the `.tsmap-guide-scope`-not-`:root` fix actually holds and there is no theme leak. Zero console errors in either the host page or a real popup's own JS realm. Full wmap suite still green (682 tests unchanged — this was a styling/DOM-structure change with no new assertions of its own beyond what was already covered), `npm run check` clean.

**Fixed in tsmap (uncommitted, this repo):**
- `scripts/build-user-guide.mjs`: removed the tsmap-only inline TOC entirely (`tocEntries`/`tocHtml`/`.tsmap-guide-toc` CSS) — superseded by wmap's combined one; keeping both would have shown two tables of contents in the same window. `.tsmap-guide`'s box model changed to match `.wmap-guide` exactly: `padding: 24px 32px; max-width: var(--wmap-guide-reading-width, 720px)` (was `margin: 0 auto` with no padding at all and an unrelated `960px` cap via a since-removed `--guide-content-width` var) — this is what closes the "no horizontal space" gap.
- `docs/user-guide.md`: removed every place that told the reader tsmap and wmap are separate things — "The wafer map itself... [is] a separate library, wafermap, with its own built-in guide... open it via the toolbar's **?** menu → **Wafer map reference**" (three occurrences, one of which also named a menu row that no longer exists) — replaced with "further down this guide" / "use **Contents** at the top," consistent with the two sections now being one continuously-scrolling, one-TOC document. Checked wmap's own `docs/user-guide.md` (the source for its embedded end-user guide) for any reciprocal "tsmap"/"host app" language — none exists, it was already host-neutral.
- Rebuilt the fragment, re-verified `npx tsc --noEmit`, `npm run check:docs`, `npm run lint`, `npm test` (391 passed) all clean.

**Known minor rough edge, not fixed, not raised in feedback:** tsmap's guide and wmap's guide each number their own sections independently starting at 1 ("1. Supported file formats" vs. wmap's own "1. Reading the map"), so the combined 19-entry Contents list contains two different "1."s (and so on through both max counts) with no visual separator between the two runs. Renumbering either guide's headings to continue from the other isn't a good fix — wmap's own numbering must stay self-contained for hosts with no extension at all (its own demo site, any other host). Left as-is; worth a lightweight visual divider in the Contents grid if it turns out to actually confuse anyone in practice.

**Update (2026-08-28, same session, third pass) — content review: real duplication and misplaced ownership, not just styling.** User flagged both guides having an "Insights" section and asked for a full content review. Read both files in full and cross-checked disputed content against actual source ownership (`grep` for the described behaviour's real implementation, not just where the prose happened to live). Four real issues, only one a literal title collision:

1. **Title collision in the combined Contents list**: tsmap's old "7. Insights tab" and wmap's own "8. Insights tab" — same words, read as a duplicate entry even though tsmap's content didn't actually repeat wmap's (it only explains where the "Group by" field list comes from — MIR record fields, CSV/JSON metadata columns, splits). **Fixed**: renamed to "7. Grouping data in the Insights tab" — leads with the distinguishing word instead of colliding on "Insights".
2. **Misplaced content — coordinate-less/mixed-wafer rendering** (tsmap's old §5.1, ~25 lines: bin-breakdown/histogram summary card instead of a map, the "+N dies without position" footer, which toolbar controls get hidden, layout-dependent findings only considering positioned dies). Grepped the actual implementation: `maplessSummary.ts`, `dieList.ts`, `summaryPanel.ts`, `renderWaferGallery.ts`, `renderWaferMap.ts` — 100% wmap-owned, and wmap's own guide didn't mention it anywhere. **Fixed**: ported (host-neutral, no tsmap mentions) to a new wmap `### 1.5 Wafers and dies with no position data` under "1. Reading the map"; tsmap's §5.1 trimmed to just its own genuinely tsmap-specific bits (column-mapping load-time assignment, the `COORDLESS-LOT-01` fixture, the Lot ▾ menu's die-list entry) plus a cross-reference.
3. **Misplaced content — chart PNG export** (tsmap's old §8 "Exporting charts", ~15 lines: camera button, expand-first for full resolution, the exported PNG's header strip). Confirmed via `summaryPanel.ts`'s own comment referencing "the Insights header strip" as a real internal concept — wmap-owned, undocumented in wmap's own guide. The section's one tsmap-specific fact (native save dialog vs. downloads folder) was already a row in tsmap's desktop/browser table. **Fixed**: ported to a new wmap `### Exporting a chart` under "8. Insights tab"; tsmap's §8 deleted outright (fully redundant once the wmap-owned part moved and the remaining fact was already in the table) — tsmap's guide is now 9 sections, not 10.
4. **Stale wording, found while reading closely**: tsmap called "Show test-value findings" the "**Value findings** toolbar control", but `main.ts`'s own comment says it was moved out of the app bar into a **Lot ▾ menu row** — the guide named neither the current label nor the current location. **Fixed**: corrected both.

**Fifth issue, self-inflicted, found while planning the fix for #2/#3**: `docs/user-guide.md` is rendered by two engines — `marked` into the in-app fragment (merged with wmap's guide, where "further down this guide"/"use **Contents**" are true) and Python-Markdown/pymdownx into tsmap's **standalone Zensical docs site** (`docs/user-guide.md` alone, never merged with wmap's content, no Contents nav). The four "documented further down this guide, use **Contents**" cross-references added in the previous pass (intro, §5, §7, §8) were all **false on the site build** — nothing is "further down" there and there's no Contents nav. **Fixed**: replaced all four with plain external links to wmap's own hosted guide (`https://wafertools.github.io/wafermap/user-guide/`, no anchor — Python-Markdown's slug algorithm isn't guaranteed to match wmap's own JS `slugify`, so an unanchored link into the right page is safer than a maybe-wrong deep link), worded as "the full wafer map guide" rather than naming "wafermap" — correct on the site, the in-app real popup, and the in-app floating-window fallback alike, without reintroducing the "two systems" language the previous pass removed. Also fixed two further stale `#7-insights-tab`/`#8-exporting-charts` anchor links found by grep + Zensical's own build-time anchor checker (`docs/use-cases.md`, `docs/features.md` ×2) — `.venv/bin/zensical build --clean` on both tsmap's and wmap's docs sites now reports "No issues found".

Verified: wmap `npm run build && npm test` (682 passed) `&& npm run check` clean; tsmap `npx tsc --noEmit`, `npm run check:docs`, `npm run lint`, `npm test` (391 passed) clean; real-browser check confirms the combined Contents list has 18 entries (was 19) with no two entries starting with the same word, both new wmap subsections render inside the merged content, and the renamed tsmap section jumps correctly.

**Update (2026-08-28, same session, fourth pass) — closes the "known minor rough edge" above, plus a genuine layout bug and a new capability.** Direct feedback on a screenshot of the Contents panel: the two guides' independently-numbered sections read as duplicated/broken ("1. Supported file formats" next to "1. Reading the map" a few entries later), and the grid's left-to-right fill order read entries in an unintuitive sequence rather than top-to-bottom like an ordinary printed TOC.

**Fixed in wmap (same unpublished 0.26.0 batch):**

- `buildGuideToc`'s list switched from a row-major CSS grid (`grid-template-columns: repeat(auto-fill, ...)`, filled left-to-right) to a CSS multi-column box (`columns: 200px`, fills top-to-bottom within a column before starting the next) — the standard reading order for an on-screen or printed table of contents.
- A first attempt at the numbering fix grouped entries by source (a labelled/divided block per `<h1>`) — **rejected on review**: tsmap users don't know or care that tsmap is built on wafermap, and visually splitting "their" guide into two labelled sections undermines the one-app framing this whole issue exists to achieve. **Final fix**: the nav strips any leading `N.` a heading's own text supplies and relies on the one flat list's own position to carry the order — genuinely one unnumbered, unsplit list, not two numbered ones stitched together.
- Verified against the real linked build in a browser: the combined 22-entry list (13 tsmap + 9 wmap, current section counts) now reads as one continuous, unnumbered sequence with no visible seam and no duplicate "1./2./3." runs.

**Added in wmap (same batch): in-page find-in-page search**, but *only* for the in-page floating-window fallback (Tauri/WebKitGTK, where `window.open` is blocked and there's no reachable native Ctrl+F) — a real popup window gets no search box, since native find already covers it there and a redundant custom one would just be clutter. Case-insensitive substring match, `<mark>`-highlighted (native highlight styling, no invented colour) with an outline on the current match, Enter/Shift+Enter to step, Escape to clear. Verified end-to-end against the linked build: forcing `window.open` to fail (simulating the Tauri path) shows the search box and correctly finds/highlights/navigates matches (confirmed via each match's actual DOM position, not just the on-screen scroll — smooth-scrolling a ~20k px document takes a couple of seconds in headless Chrome, which looked like a mis-scroll before waiting it out); the real-popup path shows no search box, as designed.

Verified: wmap `npx tsc --noEmit`, `npm run check` (incl. `check-toolbar-docs`), full suite (682 passed) clean; `docs/api.md` updated (Contents nav's grouping/numbering behaviour, new Search subsection). No tsmap-side code change needed for either fix — both are entirely inside wmap's guide-window chrome.

**Update (2026-08-28) — point 3 (publish) done.** wmap published as **v0.26.0**, tsmap unlinked and pinned to `^0.26.0`. `npm run verify` (tsc, lint, check:docs, 391 JS tests, cargo check, 251 Rust tests), `check-wmap-published.js`, and `check-drift.mjs` all clean against the real published packages. The single-"User guide"-row Help menu, combined guide content, Contents nav, and find-in-page search were browser-verified earlier in this same session (headless Chrome against the Vite dev server) — but that was **while still linked** to the local wmap build, not re-verified against the actual published 0.26.0, and neither the report modal's "Open as full page ↗" fallback nor **any of this under real Tauri/WebKitGTK** (the untested engine this issue's point 3 originally called out) has been checked at all. Leaving this open rather than marking it closed until someone actually runs `npm run tauri dev` and clicks through it.

### ~~38. Expand-modal reparent/restore threw `NotFoundError` on close when the DOM shifted underneath it while open~~ (fixed in v0.20.4)

**Where:** `packages/canvas-adapter/renderWaferMap.ts` — `openExpandModal`'s `onClose` handler (~line 1187), which restores the reparented element (`insightsTab.el`, `summaryPanelWrapper`, `autoSummaryPanelWrapper`, or `canvasWrap`) to its original position via `modalOriginalParent.insertBefore(modalReparentedEl, modalOriginalNext)`.

**Problem:** `modalOriginalNext` (the sibling reference used to restore the exact original position) is captured once, at modal-open time. The same file has several other spots that reposition/rebuild the summary-panel wrapper independently (e.g. toggling the summary panel while the expand modal is open, or an auto-summary-panel rebuild). If any of those ran while the modal was open, the saved sibling could stop being an actual child of `modalOriginalParent` by close time — and `Node.insertBefore` throws `NotFoundError` (not a silent no-op) when the reference node isn't a child of the node you call it on. Confirmed via tsmap testing (2026-07-21, Tauri app): `insertBefore (renderWaferMap.js) → onClose (renderWaferMap.js) → close (toolbar.js)`, an uncaught exception on modal close that likely left the reparented element orphaned (the code never reached the lines resetting tracking state or reattaching the toolbar).

**Fixed in wmap v0.20.4:** shipped as "expand-modal reparent fix, cross-document listener fixes" — per the current code's own header comment at the `openReparentedModal` call site, the toolbar is now reparented alongside `reparentRoot` as one paired move (not a separate call) specifically so a shared stale-reference guard in the reparent helper sees both moves as one unit — "this pairing is exactly the case that used to throw `NotFoundError` on close." Confirmed fixed: tsmap unlinked and pinned to published `^0.20.4` (2026-07-21), `npx tsc --noEmit` clean, full Vitest suite (195 tests) clean, full release-guard build clean.

### 39. ~~No support for dies/wafers with no reported X/Y position — required everywhere, silently dropped by every parser~~ (fixed in wmap 0.23.0)

**Where:** `x`/`y` were required, non-optional fields on both `DieResult` (`packages/renderer/buildWaferMap.ts`) and `Die` (`packages/core/dies.ts`) — every downstream spatial function (region builders, cluster/pattern detection, the renderer's grid inference) assumed every die had a position. On the tsmap side, all four Rust parsers (`parse_stdf.rs`, `parse_atdf.rs`, `parse_csv.rs`/`parse_json.rs`/`parse_parquet.rs`) silently dropped any die/row whose X/Y was missing or unparseable (STDF: the `SENTINEL_I2` "no position" marker triggered a `continue`, discarding real hbin/sbin/test-value data; CSV/JSON/Parquet: same via `continue` on a failed parse).

**Problem:** Real-world data sometimes has no spatial layout at all (wafer-number-only test logs) or a lot/wafer where some dies report a position and others don't. There was no way to see that data in tsmap — it was silently discarded at parse time, with no warning that anything had been dropped.

**Fix applied (wmap 0.23.0, developed via the link workflow):**
- `Die.x`/`y`/`physX`/`physY` and `DieResult.x`/`y` are now optional. A new `hasPosition(die)` predicate (`packages/core/dies.ts`) is the single source of truth for "does this die have a position" — a die is either fully positioned or fully unpositioned, never half (`buildWaferMap` throws if only one of x/y is set). `getDieKey` falls back to `id:<id>` for an unpositioned die so two unpositioned dies never collide on the same key.
- `buildWaferMap` partitions input into positioned/unpositioned before geometry inference (pitch, grid, wafer diameter, orientation, edge-exclusion, reticles) runs — unpositioned dies skip all of that and are folded back into the returned `dies`/`dataCoverage`/`yield` afterward. `dataCoverage` gained `unpositionedDies: number` (always present); `totalDies`/`filledDies`/`ratio` stay scoped to positioned dies only. Yield is **not** spatial, so unpositioned dies with bin data still count toward it (`isYieldEligibleDie` never checked position).
- `analyzeWaferMap`/`regions.ts` exclude unpositioned dies from the spatial region families only — ring/quadrant/sector/reticle-position regions, and cluster/pattern detection — via a `hasPosition` filter at each call site. `buildTestSiteRegions` (keyed by `siteNum`, not coordinates) and every value-based stat (yield, bin counts, `computePerTestStats`, spec-limit yield) are deliberately **not** filtered — coordinate-less dies still count there.
- New `buildDieListSection` (`packages/canvas-adapter/dieList.ts`, exported from `/render`) — a general, reusable die-list table (position/site/bins/per-test values) with CSV export, used three ways: (1) in place of the map canvas for a wafer with zero positioned dies (an opaque overlay in `renderWaferMap.ts`, so the canvas/toolbar/insights machinery underneath needs no branching — deliberately **not** a wafer-shaped mosaic, which risks being misread as real spatial data); (2) an expandable "+N dies without position data" footer on a mixed wafer's card; (3) available for a host to build its own lot-level combined view (tsmap's "Die list…" toolbar button does this, concatenating every wafer's `dies` with a wafer-id column).
- Lot-stack aggregation (`collapseLotStack`) and the gallery's stacked-value/bin cards exclude unpositioned dies — combining values "at the same physical die" across a stack is inherently position-based, and an unpositioned die has no cross-wafer position identity to aggregate by.

**tsmap-side fix applied:**
- All four Rust parsers keep a coordinate-less die instead of dropping it (STDF's `SENTINEL_I2`, ATDF's blank PRR X/Y field, CSV/JSON/Parquet's missing/unmapped/unparseable x/y column). Each assigns a stable per-wafer `die_index` (only when unpositioned) so the frontend/wmap can key it without relying on array position surviving downstream filters. A shared `position_warnings()` helper (`packages/parsers/src/types.rs`) pushes one `"Wafer {id}: N of M dies have no reported X/Y position"` warning per affected wafer into the same `warnings: Vec<String>` every parser already surfaces — reaches the log panel via the existing `logWarnings` path with no new wiring.
- CSV/JSON/Parquet's long-format (pivot) path can't group rows by position when x/y isn't mapped — each unpositioned row becomes its own die (row-ordinal key) rather than merging unrelated rows under a shared empty key, so cross-row pivoting is lost specifically for coordinate-less long-format data (a row is still never dropped or corrupted).
- `mappingUI.ts`'s `CsvMapping.x`/`y` are now `string | null`. Assigning only one of X/Y is still a hard block (`validateXYAssignment`, exported and unit-tested) — a stray role assignment, never a legitimate case. Assigning neither is now an explicit, informed confirmation (`showNoPositionModal`, mirrors the existing long-format confirmation) rather than blocked.
- `main.ts` adds a **Die list…** toolbar button (shown whenever wafers are loaded) opening every die across the whole lot in one table via `buildDieListSection`, with a "Wafer" attribution column and CSV export routed through the existing `onSaveText` host hook.

**Verification:** wmap's own test suite (607 `node --test` cases, including new coverage in `tests/dies.test.mjs`, `tests/build-wafermap.test.mjs`, and a new `tests/coordinate-less.test.mjs` exercising the full mixed-wafer pipeline end to end) all pass; `npx tsc --noEmit` clean against the linked build. tsmap's Rust suite (134 parser tests, including rewritten fixtures asserting a coordinate-less die is *kept* rather than dropped, plus one committed-fixture round-trip test per format — STDF, ATDF, CSV, JSON, Parquet) and JS suite (286 Vitest tests) both pass; `npx tsc --noEmit` and `eslint` clean.

**Sample data, docs:**
- `sample_data/COORDLESS-LOT-01.stdf` (generated by new `scripts/generate_stdf_coordinateless.py`) and `sample_data/COORDLESS-LOT-01.atdf` (hand-written) — a 3-wafer lot: one fully positioned, one mixed (~15% coordinate-less), one fully coordinate-less, with bin/test data intact throughout.
- `sample_data/TESTNUM-COORDLESS-01.{csv,json,parquet}` (the Parquet twin generated by new `scripts/generate_testnum_coordless_parquet.py`) — the same 3-wafer shape in all three tabular formats, so every one of the five parsers has a dedicated committed fixture and test.
- `docs/user-guide.md`: the X/Y mapping rows now read "Optional" with a link to a new "Dies with no reported position" subsection (§3) explaining the all-or-nothing confirmation and per-row mixed-wafer handling; a new §5.1 "Dies with no reported position" explains what the die-list-instead-of-map and the "+N dies without position data" footer actually look like, and which findings are spatial-only vs. always-on.
- `docs/features.md` and `README.md` each gained a short callout for the capability.

**Follow-up (2026-08-15): footer collapse fix + table replaced with a plot-mode-aware summary.**
Two usability problems surfaced once this landed in real use:
1. The mixed-wafer footer's expanded panel had no way to collapse back down — the toggle *state* was correct (`renderWaferMap.ts`'s `let expanded` + click handler did remove it on a second click), but the expanded panel (`top: 20%`→bottom, zIndex 2) was laid directly over the footer strip (`bottom: 0`, zIndex 1) that would have re-triggered the collapse, so once open there was nothing left to click.
2. `buildDieListSection`'s dense multi-column table is impractical inside a small gallery card — useful for export/inspection, not for the "scan many cards, spot the different one" job a gallery card actually does.

**Fix applied:**
- The footer now uses `wireExpandToggle()` (`packages/canvas-adapter/toolbar.ts`) — the same helper already used for the gallery's metadata-panel chevrons — instead of the ad hoc listener. Gets a proper `aria-expanded` chevron, Escape-to-close, and outside-click-to-close for free.
- New `buildMaplessSummary` (`packages/canvas-adapter/maplessSummary.ts`) is now the **default** representation for both the fully coordinate-less wafer's overlay and the mixed-wafer footer's expanded panel, replacing the table as the default (the table is still one click away via a "View table" toggle, for CSV export/per-die inspection). It dispatches on the *current plot mode*:
  - `hardBin`/`softBin` → reuses `summaryPanel.ts`'s existing `buildBinSection` directly on the unpositioned `Die[]` — zero new rendering code, and colours are guaranteed to match a positioned card's own bin legend since it's literally the same colour-scheme function.
  - `value` → a small new histogram built from `stats/histogram.ts`'s pure `buildTestHistogramData` (not the full ~230px Insights-tab `renderHistogramPanel`, which carries axis/dropdown chrome too heavy for a card corner).
  - Every other mode (`metadata`, `stackedValues`, `stackedBins`, `stackedSoftBins`) falls back to a one-line "No summary available for this view" message rather than a blank panel — deliberately scoped out of this pass (no existing reusable metadata-count builder to reuse, and see the new stacked-mode issue below for why stacked modes don't need one at all).
  - The panel refreshes automatically when the plot mode or active test changes (hooked into `syncOpts`'s existing `modeChanged` check) — previously this block only ever ran once at mount and never responded to the toolbar at all.
- Explicitly **not** applied to the ordinary canvas-drawn bin legend on positioned cards (`toCanvas.ts`) — confirmed with the user that adding a proportional bar there would cost canvas space on every card for no benefit, since a positioned card already has the map itself to read. The bar treatment is scoped to mapless cards only, where there's no map competing for space.

**New issue — stacked plot modes silently exclude coordinate-less wafers from pooled aggregates, no UI indication.** Surfaced while investigating the above (not a regression, pre-existing): `stackedValues`/`stackedBins`/`stackedSoftBins` discard every individual wafer card from the gallery grid and replace it with pooled cross-wafer cards (one per test parameter or bin value, via `buildStackedItems`, `renderWaferGallery.ts`). A coordinate-less wafer's dies are filtered out by the same `hasPosition` check every stacking aggregate already uses (`renderWaferGallery.ts`, `packages/core/aggregates.ts`) — correct, since stacking requires cross-wafer positional identity a coordinate-less die doesn't have — but there is no card, message, or slot anywhere that tells the user a wafer was excluded; it's simply absent from the pooled numbers, indistinguishable from that wafer not existing in the lot at all. **Suggested fix:** a small note in the stacked-mode gallery header (e.g. "N wafer(s) excluded — no position data") when `unpositionedDies > 0` on any wafer in the lot. Not fixed in this pass — logged for a future pass since it's a distinct, lower-urgency gap (visibility, not incorrect data).

**Verification (follow-up):** new `tests/mapless-summary.test.mjs` (9 cases: hardBin/softBin mode text matches `buildBinSection` byte-for-byte on the same dies, value-mode bucket counts match `buildTestHistogramData`, unhandled modes and bin-less dies fall back to the message rather than blank) all pass; full wmap suite and `npx tsc --noEmit` re-run clean.

**Second follow-up (same day): real bugs found in manual testing, plus a scope extension.**

1. **Fully coordinate-less overlay rendered an empty card.** Root cause: its initial content was built synchronously (`contentMount.appendChild(buildPanelContent())`) at a point in `renderWaferMap`'s construction *before* `viewOpts` (a `let` declared later in the same function) had been assigned — a temporal-dead-zone `ReferenceError` thrown mid-construction, silently aborting the rest of the render. The mixed-wafer footer never hit this because its content is only built lazily on first click, well after mount. **Fix:** the initial population is now deferred to right after the function's first real `render()` call, alongside the existing mode-change refresh hook.
2. **"Total dies: 0" next to "Yield: 86.4%"** on a fully coordinate-less wafer's summary panel — self-contradictory. Root cause: the "Total dies" stat card read `dataCoverage.totalDies` (by design scoped to *positioned* dies only — see the original fix above), while Yield is deliberately non-spatial and already counted every die. Three duplicate occurrences of the same mistake (`summaryPanel.ts`'s `buildYieldSection`, and two in `renderSummaryReport.ts`'s single-wafer HTML report — the lot-level report's own `totalDies` was already correct, computed by walking `allDies` directly with no position filter). **Fix:** all three now read `yieldSummary.totalDies` instead.
3. **The overlay's "No die position data..." note and "View table" toggle were rendered under the floating toolbar** — the overlay sits `inset: 0` from the very top of the card, same region the toolbar occupies. **Fix:** added the same `paddingTop` clearance `insightsTab.el` already uses for the identical problem (44px when the toolbar is shown).
4. **Histogram now shows LSL/USL spec-limit markers** (dashed line + label) when the active test has `limitLow`/`limitHigh`, mirroring the Insights histogram's own convention — the mini histogram already asked `buildTestHistogramData` to expand its bucket range to include the limits, but nothing drew them.
5. **A gallery card's expand icon reverted to the gallery's shared default plot mode** instead of preserving whatever mode that specific card had been switched to (most visible for a coordinate-less card: value mode showing a histogram → expand → hardBin pareto instead). Root cause, confirmed by reading the code (not a coordinate-less-specific bug — would reproduce for any positioned card too): `openWindowForCard`/`buildDetachedController` (`renderWaferGallery.ts`) build a **fresh** `renderWaferMap()` call for the detached window/popup, seeded only from `sharedOpts`/`item.viewOptions` — never the source card's own live, per-card `viewOpts` (each grid card's toolbar state is private to its own `renderWaferMap()` closure). **Fix:** `openWindowForCard` now reads the source card's live state via the existing `WaferMapController.getOptions()` API (`cardControllers[cardIndex]?.getOptions()`) before destroying it, and threads it into `buildDetachedController` as a new optional `liveOptions` parameter, merged over `sharedOpts`/`item.viewOptions`. `openWafer` (the findings/boxplot drilldown, which opens an arbitrary lot wafer that may have no live grid card at all) is deliberately left on the old behaviour — see its own updated doc comment.
6. **Toolbar reduced for a fully coordinate-less card** (scope extension agreed with the user): zoom/pan/select/download, orientation, overlays, and legend-position controls are spatial/canvas-only and hidden entirely when there's no map drawn. Plot mode, colour-scheme/palette, log-scale, and colorbar-range stay — all four genuinely drive `buildMaplessSummary`'s output (see item 8 below for why log-scale/colorbar-range apply to a histogram too). Summary panel, warnings, expand, Insights, and help are all left alone (still meaningful — Insights in particular works on values/bins with no positional dependency at all). PNG download is dropped rather than kept as a "blank canvas" no-op; CSV export (via the "View table" toggle) is the mapless card's real export path.

**Third follow-up (same day): four more bugs found in continued manual testing.**

7. **The plot-mode dropdown was empty on a fully coordinate-less card** — no bin or value entries ever appeared, despite the wafer having hbin/sbin/test data. Root cause: the dropdown's data source was `currentView.dies`, but `currentView` is built from `currentDies.filter(hasPosition)` (`rebuildView`) — for a wafer with zero positioned dies that's always `[]`. Same "positioned-only source used where the full population was needed" mistake as items 2 and 5. **Fix:** the dropdown now reads from `currentDies` (the full, unfiltered die set) instead.
8. **Histogram bar colours didn't respond to the map's log-scale or colorbar-range (data vs. spec) toggles.** The bars were coloured with a fixed linear normalize over the bucket range — not the same value→colour resolution the real map's colorbar uses (`buildView.ts`'s private `normalize`, which is spec-range-aware and log-scale-aware). **Fix:** added `resolveValueNormalize()` in `maplessSummary.ts`, re-deriving that same resolution (duplicated rather than exported from `buildView.ts`, whose version is closed over internal, non-exported state — refactoring it out was judged riskier than ~20 lines of duplication for this pass). It's computed from the *full* wafer die population (`valueRangeDies`, defaulting to the map's own `result.dies`), not just the unpositioned subset being charted — so a mixed wafer's footer histogram and its visible map agree on colour for the same test even though the histogram only charts a subset of the dies. `btnLogScale`/`btnColorbarRange` were un-hidden from the mapless toolbar reduction (item 6) as a result — they're functional controls again, not canvas-only ones.
9. **LSL/USL limit markers had poor contrast once bars became a full colour gradient** — a single dashed accent-coloured line could disappear against a similarly-coloured bar. **Fix:** switched to a solid line in `CLR.value` (the library's high-contrast "strong text" token, not tied to any particular hue) with a panel-background halo, plus a bordered label chip instead of bare coloured text — both stay legible regardless of what colour is directly behind them.
10. **Considered and explicitly deferred:** adding a gradient colorbar strip (matching the map's own vertical legend) alongside the histogram, for full visual parity with how bin mode reuses `buildBinSection`. Discussed with the user and dropped as redundant — the bars are already individually coloured by value, which already conveys the same "value → colour" mapping a separate strip would add.
11. **Histogram bars still didn't visibly react to the map's log-scale/colorbar-range toggles**, even after item 8's fix made the colour *computation* correct. Root cause: `syncOpts`'s `refreshMaplessPanel?.()` call was gated on `colorScheme`/mode/`activeTest` changing — `logScale`/`colorbarRangeMode` were never added to that condition, so `resolveValueNormalize`'s new logic was correct but nothing ever re-ran it when those two specific options changed; the histogram just kept showing whatever colours it had at the last refresh. **Fix:** added both to the refresh-trigger condition.
12. **Histogram bar/limit-marker hover used the native browser `title` attribute** — slow to appear (OS hover delay, ~1s+) and rendered in the browser's own unthemed system tooltip (larger font, no dark theme), unlike every other hover surface in the app (the map's own die hover uses a shared, instant, themed tooltip). **Fix:** `maplessSummary.ts` now wires the same shared tooltip singleton the map's die hover uses (`getTooltip`/`positionTooltip`/`hideTooltip`, `toolbar.ts`) onto each bar via `mousemove`/`mouseleave`, via a new small `wireHoverTooltip()` helper. The limit-marker lines carry no tooltip of their own (`pointerEvents: 'none'` so they don't block the bar hover underneath) — not a regression, since their LSL/USL value is already shown as an always-visible label chip, never hover-gated.
13. **The histogram only filled roughly half the card's available height**, both on a fully coordinate-less card and a mixed wafer's footer panel. Root cause: `contentMount` (`renderWaferMap.ts`, both the overlay and footer-expanded variants) had no `display: flex`, so its child (`buildMaplessSummary`'s returned element) just sized to its own natural content height rather than stretching — and even if it had stretched, the histogram's chart area (`barsRow`) was a fixed `height: 64px`, not relative to its container at all. **Fix:** `contentMount` is now `display: flex; flex-direction: column` in both places; the histogram's outer wrapper and its `barsRow` both gained `flex: 1; min-height: 0` (a small `min-height: 48px` floor on `barsRow` so it stays usable in a very short card) so the chart area now grows to fill whatever space the card actually has, with only the fixed-height title/axis/label rows staying their natural size. Bin mode (`buildBinSection`'s own result) is left as-is — a list of bin rows doesn't need to stretch to fill remaining space the way a chart's plotting area does.
14. **Zero-count buckets drew a small visible "stub" bar** (a `Math.max(2, …)` height floor), reading as "there's data here" for a value range that actually has none. Checked against the real Insights histogram's own convention (`charts/histogram.ts`: `barHeight = (bucket.count / maxCount) * plotMaxHeight`, no floor — a zero-count bucket draws nothing) and this was an unwarranted deviation with no good reason behind it. **Fix:** removed the floor; a zero-count bucket is now genuinely invisible, matching standard histogram convention and the Insights histogram's own behaviour.

15. **The die-list table was a fixed 360px tall** regardless of how much room it had — a short table floated in a half-empty card, and inside the resizable "Die list" modal it produced *two* nested scrollbars (the modal body scrolled, and so did the 360px table inside it). **Fix:** `buildDieListSection`'s scroll box now sizes with `flex: 1; min-height: 0` and fills its container, with the surrounding title/note rows pinned `flex-shrink: 0` so the table is the only thing that absorbs space. A new optional `maxHeight` re-imposes a cap for a host mounting the list in a container with no definite height (omitted = fill, which is what every in-library caller wants). tsmap's own Die list modal switched from `bodyOverflow: 'auto'` to `'hidden'` so the body stays a flex column and the *table* owns the scrolling — which also removed a `section.style.height = '100%'` that violated the repo's own "never height:100% on a flex child" cross-platform rule.

**Verification (third follow-up):** `tests/mapless-summary.test.mjs` grew to 15 cases (log-scale/colorbar-range-mode colour-change coverage, LSL/USL marker presence, and a new case asserting bars carry no native `title` and that hovering dispatches through the shared tooltip singleton instead); `npx tsc --noEmit` clean; full wmap suite re-run clean.

**Verified by the user directly in `tauri dev`:** items 1–4, 6, and the original reports behind items 12 (slow/unthemed hover), 13 (histogram sizing), and 14 (zero-count stub bars). **Verified only by reading the code path, not yet re-confirmed live:** item 5 (cross-card mode preservation), items 7, 9, 11, and the fixes for 12/13/14 (this batch) — flag any of these if still wrong after this rebuild. Single-wafer mode (`renderWaferMap` called directly, not via the gallery) shares the exact same code path as gallery cards (confirmed via `tsmap/src/main.ts:508`), so every fix above applies there too — but hasn't been separately live-tested; the user's testing so far has been multi-wafer fixture data only.

**Status: fixed and published.** wmap 0.23.0 (breaking, minor bump — `Die.x`/`y`/`physX`/`physY` optional) shipped this; tsmap unlinked and pinned `^0.23.0` in v0.1.27 (commit `bbcdd5a`), then further bumped to `^0.23.1` on 2026-08-18 (see the version-tracking table above — that later bump also picked up issue #40 and #36). `npx tsc --noEmit`, full Vitest suite, and `check-wmap-published.js` all clean at `^0.23.1`.

### 40. ~~Sparse coordinate-less wafers can infer a stretched (non-square) die aspect ratio from a single row/column of positioned dies~~ (fixed in wmap 0.23.1)

**Where:** `resolveGridPitch` (`packages/core/inference/pitch.ts`), Case 5 (no die dimensions or wafer diameter known — the path tsmap always takes, since it passes neither).

**Problem:** Found loading `sample_data/TESTNUM-COORDLESS-01.csv` in tsmap: W01 (all 4 dies positioned, at `(0,0) (1,0) (0,1) (1,1)`) renders normal square dies; W02 (only 2 of 4 dies positioned, both at `y=0`: `(0,0) (1,0)`) renders visibly rectangular dies, roughly twice as tall as wide.

Root cause: `computeNearestNeighborPitch` finds an X step (`pitchX=1`, from the two x values at the same y) but no Y step at all (each x value appears in only one row, so there are no adjacent-y pairs to measure), and falls back `pitchY ?? pitchX!` → `pitchY=1`. Since NN's `pitchX === pitchY`, `resolveGridPitch` treats that as "uninformative" and switches to the circular-wafer constraint: `aspectRatio = xRange / yRange = 2 / 1 = 2`, i.e. it reads "I only ever saw one row" as "this wafer's real geometry is twice as wide as tall" and stretches `pitchY` accordingly.

That inference is backwards for this case: a positioned-die subset confined to a single row/column is a sampling artefact (partial position coverage — see issue #39), not evidence about the wafer's true aspect ratio. The circular constraint is sound when both axes have ≥2 distinct values sampled across a real spread of the wafer; it actively misfires when one axis is degenerate (`xRange` or `yRange === 1`), which is exactly the case NN's own `pitchX === pitchY` fallback already signals.

**Fix applied (wmap 0.23.1, developed via the link workflow):** in Case 5, `useCircular` now also requires `xRange > 1 && yRange > 1` (a new `degenerateAxis` check). When either range is 1, the circular-aspect-ratio fallback is skipped and `aspectRatio` falls through to `nnRatio`, which is provably `1` whenever an axis is degenerate (a single-value axis can never produce an NN step on the other grouping, so its `pitchY`/`pitchX` fallback-to-each-other always yields equal steps) — so the practical effect is `pitchX = pitchY = 1`, square dies, instead of a stretched guess. `confidence` is also lowered to `0.3` in the degenerate case (from `0.5`) since the aspect ratio is genuinely unknown, not just imprecise.

**tsmap-side impact:** cosmetic only (die shape, not die count/bin/yield correctness — confirmed those are unaffected in this fixture).

**Future enhancement (not implemented, proposed 2026-08-18):** the fix above only prevents a *wrong* guess for a wafer with degenerate position coverage — it can't recover the *correct* aspect ratio for that wafer, because `resolveGridPitch` only ever sees one wafer's dies at a time (it's called per-wafer inside `buildWaferMap`, which has no visibility into sibling wafers). A more capable approach would pool positioned-die coordinates across every wafer in a lot/gallery batch before inferring pitch, since a wafer with sparse coverage often sits alongside other wafers of the same device with full coverage. This would need to live above `resolveGridPitch` — e.g. a lot-level pre-pass (natural fit: `renderWaferGallery`, which already has every wafer's `WaferMapResult` in hand) that infers a shared pitch and feeds it into each wafer's `buildWaferMap` call via `dieConfig` — and would need a real grouping key (device/part-type/lot metadata) so it's never applied across a batch of genuinely different device geometries. Bigger design than this bug fix; not scoped or scheduled.

**Status:** fixed and published in wmap 0.23.1 (2026-08-18); tsmap unlinked and pinned to `^0.23.1`. The future enhancement above remains open and unscheduled.

### ~~41. Die-level metadata renders in tooltips but is silently dropped from the die-list CSV export~~ (fixed in wmap 0.24.0, published)

**Where:** `buildDieListSection` (`packages/canvas-adapter/dieList.ts`) — the fixed `columns` array, which backs both the on-screen table and the "Export CSV" button. Contrast `buildHoverText` (`packages/renderer/buildView.ts`), which does render it.

**Problem:** the two surfaces disagree about whether `DieMetadata` is real data.

The tooltip treats it as first-class — it merges wafer and die metadata and renders every key, with per-die keys overriding the wafer value of the same name, skipping only `null`/`undefined`:

```ts
const meta = { ...(waferMeta ?? {}), ...(die.metadata ?? {}) };
for (const [key, value] of Object.entries(meta)) { … }
```

The die list has a fixed column set and no metadata at all, wafer- or die-level:

```
[extraColumn?] · Position · Site · Hard bin · Soft bin · <one column per test>
```

The table and the CSV are generated from that same array, so both omit it — what you see is what you export, and neither shows it.

The consequence is the asymmetry, not the omission on its own. A host that populates `DieMetadata` gets it displayed on hover, which reasonably implies the field is carried through the library; the export then drops it with no warning, no column, and no note. The realistic failure is a user who hovers a die, sees a per-die field, exports the die list intending to filter on it in a spreadsheet, and finds no such column — with nothing on screen explaining why.

`extraColumn` is a partial escape hatch, but **only for a host calling `buildDieListSection` itself**. It is (a) a single column and (b) already spent in tsmap's own lot-wide list on the wafer label (`main.ts`, `extraColumn: { label: 'Wafer', get: … }`), so a host wanting both a wafer label and one metadata field cannot have them.

**Through wmap's own built-in UI there is no escape hatch at all.** The library's single internal call site hardcodes its options:

```ts
// renderWaferMap.ts:468 — the "View die list" toggle
buildDieListSection(unpositionedDies, result.testDefs, { onSaveText: options.onSaveText })
```

Nothing on `RenderOptions` reaches `DieListOptions` — no `dieList` passthrough, no column hook (confirmed by grep: `extraColumn`/`metadataColumns` appear nowhere outside `dieList.ts`). So a user who reaches the die list through wmap's own toggle and Export CSV button gets those fixed columns and no way for the host to add one. That path also drops `Die.partId` and `Die.retestCount`, both of which the tooltip shows.

The only lever left on that path is intercepting the CSV in `onSaveText(text, name, mime)` and rewriting it before saving. That works, but rows cannot be identified by content — the built-in list contains only unpositioned dies, so `positionLabel` renders `—` for every row — leaving row order as the sole join key. A host must reproduce `result.dies.filter((d) => !hasPosition(d))` exactly and match by index. It also fixes only the CSV: the on-screen table still lacks the column, so the two now disagree in the opposite direction.

**tsmap-side impact:** none today. tsmap sets no per-die metadata — everything it attaches is wafer-level (splits via `SPLIT_FIELD_KEY`, provenance via `WaferSource`), so nothing is missing from its current exports. Logged because the gap is in wmap's public API rather than in tsmap's use of it, and because tsmap hits it the moment it surfaces a genuinely per-die field — probe card, site group, or a retest pass index are all plausible.

**Suggested fix:** give `DieListOptions` a `metadataColumns?: string[] | 'auto'`.

- An explicit array names the keys to show, in that order — the right default for a host that knows its own schema.
- `'auto'` takes the union of keys present across the die set and sorts them, mirroring what `fileFilterUI.ts`/`filterTable.ts` already do for a batch of files with differing metadata. Worth having because a host merging data from several sources may not know the key set up front.
- Stringify through the same path the tooltip uses, so hover and CSV can never disagree about how a value is rendered. That shared path is the actual point of the fix; two independent formatters would reintroduce the same class of divergence.
- Scope to `die.metadata` only. `buildDieListSection` receives dies, not wafer metadata, and a wafer-constant column repeated down every row of a per-wafer list is noise.

Worth doing in the same pass: `extraColumn` → `extraColumns?: Array<{ label, get }>` (keeping the singular form as an alias, so no caller breaks). One arbitrary slot is what forces the choice between a wafer label and anything else; the limit has no reason behind it.

**Status:** fixed in wmap (0.24.0, unpublished at the time of writing — developed via the link
workflow). All four suggestions above landed, plus more than was originally scoped:

- `DieListOptions.metadataColumns` (default `'auto'`) and `waferMetadataColumns` (default
  `'csv'`) — die metadata on by default in both the table and CSV; wafer metadata CSV-only by
  default, since it's constant down every row. Stringification goes through new
  `metadataDisplayValue`/`metadataCategoricalValue` (`@wafertools/wafermap/core`), which also
  replaced the tooltip's own inline stringifier and three other near-duplicates — so hover and
  export genuinely share one code path now, not just "the same rule applied twice".
- `RenderOptions.dieList?: DieListDisplayOptions` closes the "no escape hatch at all" gap on
  wmap's own built-in view — the wafer metadata and `metadataFields` it needs are always
  supplied by the library from the current build result, never from the host option.
- The two per-test CSVs (`test-values.csv`, `functional-tests.csv`) also gained wafer identity,
  which they'd never had at all — a lot-pooled export previously had no wafer/lot column
  whatsoever. Self-derived from `perWaferSummaries` in both lot builders, so no call-site change
  was needed. Die-level metadata is deliberately *not* added to these two: a row there
  aggregates over many dies, so no single die-level value exists to print.
- Went further than the suggested fix on two points: `extraColumn` was left alone rather than
  becoming `extraColumns` (the new metadata columns make the multi-column need moot, so the
  API-surface cost of adding a second option wasn't justified); and a new `maxRows` (default
  `50_000`) caps the table's DOM cost, since it has no virtualisation and the new columns would
  otherwise have made the existing large-lot case (~1.3M elements at 266k dies) strictly worse
  rather than net-better. The CSV export itself is never capped.

**tsmap-side action, wmap 0.24.2 adopted 2026-08-24:** items 1–3 below verified done. tsmap's
`main.ts` "Die list…" call (`buildDieListSection` at line ~1622) passes no
`CsvExportContext`/wafer metadata, so `waferMetadataColumns` (CSV-only by default) has nothing
to emit and cannot duplicate the existing `extraColumn: { label: 'Wafer', … }`. tsmap also still
populates no `Die.metadata`, so `metadataColumns: 'auto'` finds no keys either. `npm run check`
and `npm test` (319 passing) both clean after the bump.

1. If tsmap ever wants a genuinely per-die annotation (probe card, site group, a retest pass
   index), it now has a real path: populate `Die.metadata` and it appears in both the table and
   CSV automatically, no `extraColumn`-style plumbing required. Not needed today — left open.
2. `wmap` bumped to `^0.24.2` in the normal unlink/re-pin flow. Minor bump (new public API, plus
   a behaviour change — the die-list table now defaults to capping at 50,000 rendered rows, CSV
   unaffected) — no other breakage found.
3. **Stopgap applied**, per item 4's own explicit either/or: both `renderWaferMap` and
   `renderWaferGallery` calls in `main.ts` now pass `dieList: { enabled: false }`, since this
   pass is the release that actually crosses the `^0.24.0` line and the duplication described
   below is otherwise live immediately, not hypothetical. The full rework (deleting
   `openDieListDialog` in favour of wmap's own link) is deliberately **not** done here — it's
   the separate follow-up item 4 already scopes out below.
4. ~~`main.ts`'s `openDieListDialog()` (the "Lot ▾ → Die list…" toolbar menu row) is now
   redundant~~ (done — `openDieListDialog`, its `Die`/`buildDieListSection` imports, and the
   "Die list…" `Lot ▾` menu row are all deleted; `openModal`'s import went with them, caught by
   `tsc --noEmit` reporting it unused). wmap is bumped to `^0.24.2` (`package.json`,
   `package-lock.json`). Both `renderWaferMap`/`renderWaferGallery` call sites already pass
   `summaryPanel: { placement: 'right', defaultOpen: true }` with no `dieList` option, so wmap's
   built-in "View die list" link (default-enabled since it's a plain panel link, not a toolbar
   button) is what tsmap now ships — the full rework, not the `{ enabled: false }` stopgap this
   entry originally scoped as the alternative. `cachedLotStats`/`buildLotStatsSummary` remain in
   use elsewhere (the gallery's own lot stats) and were not touched. Verified clean:
   `tsc --noEmit`, `eslint src`, `vitest run` (319/319), `check-architecture-docs.mjs`,
   `check-changelog.mjs`, `check-wmap-published.js`.

A host using wmap directly can approximate one metadata column today, since `extraColumn.get` receives the whole `Die` and `Die.metadata` is public:

```ts
extraColumn: { label: 'Probe card', get: (d) => d.metadata?.probeCard as string | undefined }
```

### ~~42. `applyEdgeExclusion` silently produces a wrong (smaller) excluded band when `edgeExclusion` exceeds the wafer radius~~ (fixed in wmap 0.26.0)

**Where:** `applyEdgeExclusion` (`packages/renderer/buildWaferMap.ts:991`).

```js
function applyEdgeExclusion(dies: PositionedDie[], wafer: Wafer, exclusionMm: number): PositionedDie[] {
  const innerRadiusSq = (wafer.radius - exclusionMm) ** 2;
  ...
}
```

**Problem:** `WaferConfig.edgeExclusion` is an absolute mm value, but `WaferConfig.diameter` is *inferred* from the die grid when not supplied (`inferWaferFromXY`, `packages/core/inference/wafer.ts` — snapped to a standard size, with a `confidence` score the caller can read back via `WaferMapResult.inference.wafer`). Nothing checks `exclusionMm` against the resolved `wafer.radius`. When `exclusionMm > wafer.radius` (plausible whenever the diameter is under-inferred — sparse/partial position data, or the `confidence: 0` default-300mm fallback when there's nothing to infer from at all), `wafer.radius - exclusionMm` goes negative and squaring it silently makes it positive again. The result is a *smaller*, wrong excluded band rather than the honest answer ("the whole wafer is excluded") or a thrown error.

Found via tsmap surfacing `edgeExclusion` in its own UI (a Diameter & edge exclusion… dialog that gates the exclusion field on an explicit, confirmed diameter — see tsmap's `waferGeometry.ts`) — the dialog's gate prevents the most likely real-world trigger, but doesn't fix the underlying unclamped math, which any other wmap host passing `edgeExclusion` without also pinning `diameter` could still hit silently.

Contrast `createWafer` (`packages/core/wafer.ts:47-49`), which already throws a `RangeError` for a non-positive `diameter` — this exact area of the codebase already has a precedent for validating a geometry input rather than letting it silently produce nonsense.

**Suggested fix:** clamp in `applyEdgeExclusion`:

```js
const innerRadius = Math.max(0, wafer.radius - exclusionMm);
const innerRadiusSq = innerRadius ** 2;
```

so an exclusion-exceeds-radius input degrades to "every die is excluded" — correct — instead of a silently wrong smaller band. Consider also surfacing it as a structured warning on `WaferMapResult.warnings` (the same channel low-confidence `inference.wafer` results already use) so a host can tell the user their exclusion value doesn't fit the resolved diameter, rather than only noticing from an oddly-shaped excluded ring on the rendered map.

**tsmap-side mitigation:** the diameter+edge-exclusion dialog gates the exclusion field on an explicit diameter and shows wmap's own inferred value (with confidence) for comparison, closing off the most likely accidental trigger. Not a substitute for the library-side fix above.

**Update (2026-08-27):** The suggested fix is now implemented in `buildWaferMap.ts` — `applyEdgeExclusion` clamps with `Math.max(0, wafer.radius - exclusionMm)` and emits a new structured warning, code `edge-exclusion-exceeds-radius`, severity `warning`. Verified directly against a linked local build: `waferConfig: { diameter: 20, edgeExclusion: 15 }` (exclusion > radius 10) produces the expected warning and 80/81 synthetic dies get `edgeExcluded: true` (the 1 exception is the die exactly at the physical center, `dx²+dy²=0`, a correct edge case of the clamp — not a bug).

**Update (2026-08-28):** Published as wafermap **v0.26.0** and adopted here. Closed.

`get` returning `undefined` renders an empty cell, which is the documented behaviour. The limits are that it is one column, it is forced to the leading position, and the value arrives as `unknown` so the host casts or stringifies it itself.

### 43. ~~Insights tab's native `<select>` pickers (Group by, per-panel test/wafer selectors) ignore theming entirely on Linux WebKitGTK~~ (fixed in wmap 0.27.0)

**Where:** `makeTestSelect`, `makeWaferSelect`, `makeLabeledSelect` (`packages/canvas-adapter/charts/chartShell.ts`) — the "which test" picker (boxplot/histogram/scatter), the histogram wafer picker, and the Analysis tab's "Group by:" field selector plus every per-panel "Group: `<value>` ▾" dropdown.

**Problem:** all three built a plain native `<select>` styled only via `background`/`color`/`border` (`CLR.menuBg`/`CLR.text`/`CLR.menuBorder`, which resolve to `var(--wmap-surface, #fff)` etc.). Most engines respect that on a native `<select>`, but WebKitGTK — the Linux Tauri WebView tsmap ships in — paints the closed box with native GTK chrome regardless, ignoring the resolved CSS colour entirely: every one of these selects rendered generic OS light/dark grey no matter which of tsmap's 16 themes was active. Found via tsmap's own Insights tab "Group by" selector after the tsmap theme-system work above; confirmed the `--wmap-*` token chain itself was resolving correctly (verified computed style in headless Chrome — `background: rgb(43, 45, 58)` etc., matching the active theme exactly) before narrowing it down to WebKitGTK-specific native-control rendering, distinct from (and broader than) the already-known "native popup ignores `color-scheme`" limitation (tsmap's own `CLAUDE.md`), which is about the *open* option list, not the closed box.

**Fix:** `appearance: none` (+ `-webkit-`/`-moz-` prefixes) opts the closed box back into CSS-painted chrome in every engine including WebKitGTK, restoring theming. Since that also removes the native dropdown arrow, a small hand-drawn chevron is re-added via `background-image` (a static `#888` SVG data URI — an embedded data URI can't resolve a `var(--wmap-*)` reference, so it isn't itself theme-reactive, but reads acceptably against both light and dark surfaces). Extracted into one shared `styleNativeSelect(select, maxWidth)` helper used by all three call sites rather than patching the same inline-style block three times independently (it had already drifted into three near-identical copies).

**Known residual limitation, not fixed and not fixable via CSS:** the *open* option-list popup remains OS-native styled in every browser, not just WebKitGTK — no CSS reaches it in any engine. Confirmed acceptable in practice (visible only for the instant the menu is open).

**Status: superseded and fully fixed, 2026-08-31 — published in wmap 0.27.0 (2026-09-09).** The `appearance: none` fix above was only ever half of it (it reached the closed box, never the popup). All three pickers are now built by a new shared `makeListSelect` in `chartShell.ts` — a themed trigger button plus a popup `listbox`, generalised from the long-list combobox that already backed `makeTestSelect` past `MENU_SEARCH_THRESHOLD` — so the searchable and short-list paths became one implementation, and `styleNativeSelect` plus its hand-drawn arrow SVG are deleted. The "known residual limitation" below is therefore **gone**: there is no native option list left to be OS-styled. Verified in tsmap against the linked build — zero `<select>` elements remain in the Insights tab and the picker renders in the host's theme. Two consequences worth carrying forward: `makeWaferSelect` now returns `HTMLElement & { value: string }` rather than `HTMLSelectElement` (no public API change — none of the three builders is exported), and **any host driving these in automation must click the trigger and the option row rather than assigning `select.value` + dispatching `change`** — tsmap's own `scripts/lib/steps.mjs` `setInsightsGroupBy` was updated in the same pass, and `data-wmap-select` still marks the same control, now on the trigger button. See also issue #45 below: this is the wmap half of a cross-repo convergence, and the rule it now follows lives in `UI_STANDARDS.md`.

**Possible future subject — why this is structurally different from tsmap's own colour-theme picker:** tsmap's theme picker (`menuSelect.ts`) has a fully themed open list because it was never a native `<select>` to begin with — it's a hand-built `<button>` trigger + `<div role="option">` popup, so ordinary CSS reaches every row. wmap's three pickers above are real native `<select>` elements; `appearance: none` (this issue's fix) only reaches the *closed* box — the open `<option>` list is OS-rendered chrome in every browser, not just WebKitGTK, and no CSS selector in any engine can style inside it. Matching tsmap's picker exactly (a themed open list too) would mean porting the same custom-widget approach into wmap itself — its own popup, `role="listbox"`/`role="option"` rows, full keyboard handling per `UI_STANDARDS.md` — real feature work, not a follow-up CSS tweak. Not scoped or prioritized yet; noted here so it isn't rediscovered from scratch next time someone asks "why does the theme picker look more polished than the Group by dropdown."

### 44. ~~`inferred-pitch` advisory was classified `severity: 'error'`, making the supported diameter-only path show a permanent red banner~~ (fixed in wmap 0.27.0)

**Where:** `buildWarnings` (`packages/renderer/buildWaferMap.ts`), which promotes the deprecated `inference.warnings` string channel into structured `WaferWarning[]`. It mapped every advisory to `severity: 'error' as const` with a comment asserting "all three are errors".

**Problem:** the blanket `'error'` contradicted both wmap's own severity contract and the site that raises this particular advisory. Per the `WaferWarning.severity` docs, `'error'` means the map may be *positionally wrong*; `'warning'` means what is drawn is correct but something is degraded. But the `inferred-pitch` push site (the `else if (!pitchWasSupplied)` branch, same file) documents in its own comment that containment is *guaranteed* — `resolveGridPitch` clamps the pitch to fit the diameter — and that the only unverified quantity is the assumed **aspect ratio**, which is skewed solely when edge dies are absent from the data (a reticle-complete map, or partial dies filtered upstream). It is an assumption made on the caller's behalf, not a detected contradiction, unlike `partial-coverage` and `geometry-conflict`, which both genuinely mean dies may be drawn in the wrong place.

The user-visible consequence in tsmap: supplying `waferConfig.diameter` without a `dieConfig` pitch is a documented, supported input, and it is exactly what tsmap's **Lot ▾ → Diameter & edge exclusion…** dialog and `--wafer-diameter` produce. Only `generate_stdf_corner_lot.py` emits a WCR record, so for every other file `wcrGeometryFrom` returns no `dieConfig` and `buildWmapConfig` (`main.ts`) passes `dieConfig: undefined`. Any user who set a diameter therefore got a red error banner, on every wafer, with no field anywhere in tsmap that could clear it — and the perverse shape of it was that supplying *more* correct information (the true diameter) is what turned the map red; leaving diameter unset renders clean.

**Fix:** `buildWarnings` now derives the code first and maps severity per code — `'inferred-pitch'` → `'warning'`, `partial-coverage`/`geometry-conflict` unchanged at `'error'` — with both comments corrected so the classification site and the push site no longer contradict each other. tsmap needs no change: `logWmapWarnings` already maps severity to log level via `WMAP_WARNING_LOG_LEVEL`/`severityOf`, and wmap's own ⚠ indicator colours from the same field, so the downgrade flows through both surfaces automatically.

**Status:** fixed directly in wmap (both repos are ours) — published in wmap 0.27.0 (2026-09-09); tsmap picks it up via the `npm run wmap:link` symlink. Publish alongside the next batch per the usual link workflow (issue #43 is queued in the same batch), then strike this through with the version.

#### Considered and declined: a die width/height input in tsmap

The obvious companion fix — add die pitch fields to `waferGeometryUI.ts`, persist them in `waferGeometry.ts`, add `--die-width`/`--die-height`, splice them into `buildWmapConfig`'s `dieConfig` — was scoped and **deliberately not built**. Recorded here so it isn't re-derived from scratch.

Grepped what actually consumes die pitch downstream before deciding:

- **`clusterDetection.ts`** (the only stats consumer) uses pitch purely as a *ratio* — `neighbourRadius = max(pitchX, pitchY) * 1.5`, then `ceil(neighbourRadius / pitch)`. Scale-invariant; an inferred pitch changes its results not at all.
- **Rendering** is scale-invariant too — the map is drawn to fit its container regardless of the absolute mm figure.
- **Edge exclusion** (`applyEdgeExclusion`, called from `buildWaferMap`) is the single genuinely scale-sensitive consumer, because it is an absolute mm band measured against physical die positions.

So the real exposure is one narrow case: a user sets an edge exclusion **and** their data doesn't span the full wafer. `resolveGridPitch` stretches the grid to fill the supplied diameter, so the band gets measured against positions that are systematically too spread out, excluding dies that aren't really at the edge. Everything else is unaffected.

That is thin justification for a new persisted setting, two dialog fields, two CLI flags, a `check:docs` row, guide prose and a screenshot recapture. It also cuts against itself: supplying a pitch is precisely what makes `geometry-conflict` reachable (that advisory is only raised when the pitch *was* supplied), so the feature's main new capability would be giving users a fresh way to type a wrong number and get back the red banner this issue just removed. It grows the option matrix to buy back a problem.

**Revisit when** someone actually reports an edge-exclusion ring that looks wrong on a map whose grid doesn't reach the wafer edge. Even then the narrower fix is probably wmap-side — widening the existing `edge-exclusion-exceeds-radius` advisory (issue #42) into a companion "edge exclusion applied against an inferred pitch" warning, so the user is told the band is approximate — rather than a tsmap input field. A pitch input in tsmap is the last resort, not the first.

### 45. ~~Four separate option-list implementations across the two repos had drifted into three visible styles~~ (converged 2026-08-31, fixed in wmap 0.27.0)

**Where:** `makeDropdown` (`packages/canvas-adapter/toolbar.ts`) and the Insights pickers (`packages/canvas-adapter/charts/chartShell.ts`) in wmap; `menuSelect.ts` and `anchoredMenu.ts` in tsmap.

**Problem:** reported from the user's side as "the plot mode dropdown, the Lot ▾ menu and the theme dropdown are three different list styles — it's not good", which is exactly what it was. The four implementations had each answered the same questions independently:

| List | Pattern | Rows take DOM focus? | Keyboard indicator |
| --- | --- | --- | --- |
| wmap toolbar (`makeDropdown`) | `menu` + `menuitemradio`, roving `tabIndex=-1` | yes | browser `:focus-visible` ring |
| wmap Insights (`styleNativeSelect`) | native `<select>` | n/a | OS-drawn |
| tsmap `anchoredMenu` | `<button>` rows | yes | browser ring |
| tsmap `menuSelect` | `listbox` + `option`, `aria-activedescendant` | **no** | hand-drawn accent left-bar |

The visible oddity — an accent bar on the theme picker's rows and nowhere else — was not a style choice but a *consequence of the ARIA pattern*. `menuSelect` was the only one of the four using `aria-activedescendant`, where focus stays on the trigger and rows are merely pointed at; with no DOM focus there is no `:focus-visible` ring, so it had to draw its own indicator (a background swap alone measured ~1.2:1 on the Dark theme, below WCAG 1.4.11's 3:1). It then wired `mouseenter` to the same "set active" path as the arrow keys, so the focus treatment followed the mouse. Both patterns are valid APG; they simply cannot coexist in one application.

**Fix (all three parts landed):**

1. **The contract is written down** in `UI_STANDARDS.md` — "Option lists and menus: one visual contract", in the shared copy so it binds both repos. Two widget classes decided by what the items *are* (value pickers → `listbox`/`option`; command menus → `menu`/`menuitem`), exactly three visual states (selected / hover / focus ring), rows on roving `tabIndex = -1` so the **browser** draws the ring, and `aria-activedescendant` reserved for the single case that requires it (focus must stay in a text input — a true editable combobox). Added to the new-widget checklist too.
2. **tsmap `menuSelect` → roving tabindex**; the accent bar is deleted, hover no longer moves focus, and the selected row uses `--bg-accent-hover` (the same token `filterTable.ts` already uses for a selected row).
3. **wmap Insights pickers → the shared themed `makeListSelect`** — see issue #43 above, which this supersedes.

**Follow-up, same root cause one level up (tsmap, 2026-09-01):** with the rows
consistent, the picker's *trigger* was then the only control in tsmap's toolbar
that didn't match its neighbours — it hardcoded `background: var(--bg-input)` +
`--border-mid` (input chrome) while every other toolbar button is `.tb-btn`
(`background: none`, `--border-dim`, `--text-muted`), so it rendered as a filled
pill in a row of transparent outlined buttons. `makeMenuSelect` now sets no
colours whatsoever: it takes `opts.className` and `main.ts` passes `tb-btn`, so
the trigger inherits the shared button styling including its accent hover. The
caret moved from a hardcoded `--text-muted` to `color: inherit` for the same
reason — it would otherwise stay grey while the label went accent. Verified in
Catppuccin Mocha: `#theme-select`'s computed background/border/colour are now
identical to `filter-files-btn`, `add-btn`, `recent-btn` and `lot-btn`.
`UI_STANDARDS.md` gained a matching rule ("The trigger takes the host's own
button styling, not its own") and a checklist line, since this is the second
time the same mistake — a widget choosing its own colours instead of taking the
host's — has shipped in the same component.

**Deliberately NOT done: wmap exporting a general dropdown widget.** It is a wafermap and analysis library, not a UI library, and its API is already wide. The two repos keep separate implementations bound by the written contract rather than one importing the other. Revisit only if a third consumer appears.

**Deferred (low value, opportunistic):** `makeDropdown` still labels value pickers `menu` + `menuitemradio` rather than `listbox` + `option`. It is invisible on screen and changes only what assistive tech announces; do it if you are in that function anyway. Deep screen-reader support is not a goal for either tool — spatial wafer data doesn't survive being announced — which is why this is the one part of the convergence left undone. The parts that *were* done are justified by consistency and by removing hand-maintained code, not by conformance.

**Status:** tsmap side complete (`menuSelect.ts`); wmap side complete and **published in wmap 0.27.0** (2026-09-09) — publish with the #43/#44 batch, then strike this through with the version.

---

### 46. ~~Finding highlight (and click hit-testing) drawn offset from the dies — `fittedViewport` cached the first auto-fit forever~~ (fixed in wmap 0.27.0)

**Reported from tsmap, 2026-09-03.** Reproduction: open `correlated.csv` with the
tsmap window at normal size, enable Lot ▸ *Show test value findings*, **maximise
the window**, then click a finding in the Summary panel. The ring highlight is
drawn well away from the dies it belongs to — in the reported case an annulus
sitting outside the wafer circle entirely, which reads as a second, ghost wafer
next to the real one.

**Where it originates in wmap:** `packages/canvas-adapter/renderWaferMap.ts`.
`render()` cached the auto-fit viewport the first time it was computed:

```ts
if (!fittedViewport) fittedViewport = result.viewport;   // ← the bug
```

`fittedViewport` is what `currentViewport()` returns, and `currentViewport()` is
the geometry read back by `drawSelectionOverlay`, by the click hit-test in
`handleClick`, and by the hover tooltip. But the map itself is drawn with the
viewport `toCanvas` computes for *that particular draw*. Caching one and drawing
with the other means they diverge the moment anything moves the fit.

Plenty moves it, and none of it resizes the canvas: the fit origin/ppm depend on
the colorbar and bin-legend reserve, the legend position, the axis gutter, the
legend row count, and `render()`'s own `minRightReserve` (which itself switches on
`cssW` crossing the `BIN_LEGEND_ADAPT_*` thresholds). The `ResizeObserver` that
invalidated the cache therefore never fires for most of them — and because RO
delivery is asynchronous, even a genuine maximise leaves a window in which any
render draws at the new size against the old cached fit. The finding click *is* a
render, so it lands in exactly that window. That is why the maximise is part of
the repro and why it was hard to hit deliberately.

**This is a regression, not an original defect.** Until wmap 0.9.0 (2026-05-03,
commit `ef34a3c`) the condition read `if (!fittedViewport || !viewport)` — the
`!viewport` leg meaning "this was a fitted draw", i.e. precisely the invariant
restored here. That commit dropped the leg (plausibly because the no-op
`if (!viewport) viewport = null;` sitting beside it made the whole condition look
redundant) and, in the same hunk, added the `syncOpts` plot-mode invalidation to
patch the one symptom it immediately caused — its comment names the colorbar-width
shift and `drawSelectionOverlay` by name. Plot mode being much the commonest way to
move the fit is why the remaining routes stayed latent for four months, and why
this felt like it had never happened before.

**Fix applied:** `render()` now re-reads the viewport on every *fitted* draw:

```ts
if (viewport === null) fittedViewport = result.viewport;
```

guarded on `viewport === null` so a zoomed draw cannot overwrite the zoom clamp's
fit baseline (`clampedPpm`). The plot-mode special case in `syncOpts` was removed:
it covered one knob out of many and would additionally strand `fittedViewport` at
`null` while zoomed. Regression test in `tests/selectionViewport.test.mjs` asserts
zero drift between the drawn transform's origin and the overlay across legend
show/hide, legend reposition, plot-mode change, and a resize the `ResizeObserver`
has not yet reported. Measured drift before the fix: **62px** for merely hiding
the legend, **427px** across a maximise.

**Note the second symptom**, which nothing had reported: the same stale geometry
fed click hit-testing and hover, so while it was stale, clicking a die selected a
*different* die and the tooltip described the wrong one — silently, and by the
same offset.

**Status:** fixed in wmap (linked), full wmap suite green (821 tests). Not yet
published — publish with the #43/#44/#45 batch, then strike this through with the
version. No tsmap-side change is needed; the fix is entirely inside wmap.

---

### 47. ~~Colorbar tick labels truncated at the canvas right edge — fixed-width label band vs. a now-themeable font~~ (fixed in wmap 0.27.0)

**Reported from tsmap, 2026-09-03**, alongside #46 and in the same session:
value legend labels clipped on the right edge of a wafer card.

**Where it originates in wmap:** `packages/canvas-adapter/toCanvas.ts`. The band
to the right of the colorbar was two constants — `labelGap = 20` and
`rightReserve = colorbarWidth + 28`, which work out to 31px of room for the tick
text. Both date from 2026-04-25, when `COLORBAR_LABEL_FONT` was a hardcoded
`10px` and the widest typical label measured about 20px.

**This is new, and newer than #46.** wmap commit `6b07cf7` (2026-09-02, HEAD,
*unreleased*) changed `COLORBAR_LABEL_FONT` from `'10px system-ui, sans-serif'`
to `` () => `${fontPx()}px system-ui, sans-serif` `` so it follows
`--wmap-font-size`. Default is 12px, and tsmap's own convention is a 12px
minimum — so every label got ~20% wider while the 31px band did not move. The
same commit grew `BIN_ROW_H` 17 → 20 to compensate for the taller font: the
vertical compensation was made, the horizontal one was missed. So this has been
visible for roughly one day, and only in the linked working tree — no published
wmap version has it.

Measured against the reported data (`correlated.csv`, `test_002`, range
48.3–77.0), instrumenting the library's real `fillText`/`measureText` in Chrome:

| `--wmap-font-size` | widest label | result |
|---|---|---|
| 10px (the old hardcoded size) | `50.00` | fits, 5.4px spare |
| 12px (current default) | `50.00` | **0.3px spare** — sits on the edge, last glyph shaved |
| 13px | `50.00` | clipped by 2.2px |
| 12px, negative values | `-12.00` | clipped by 3.5px |

**Fix applied:** the band is measured from the text that will actually be drawn.
The tick formatter is derived before the reserves are computed, `measureText`
sizes a `colorbarLabelGap`, and `rightReserve` follows it — keeping every label
`COLORBAR_EDGE_MARGIN` (6px) clear of the edge at any font size. The tick set
itself can't be used for the measurement (it depends on the bar height, which
depends on this reserve), so the endpoints bound the width, plus the negated
larger magnitude when the range spans zero — the only case where an intermediate
tick can be wider than both endpoints. A `COLORBAR_LABEL_GAP_MIN` floor at the
old 20px leaves already-fitting layouts unchanged to the pixel. Regression test
in `tests/colorbarLabels.test.mjs`.

**Consequence to be aware of on the tsmap side:** `renderWaferMap`'s
`colorbarReserve` floor (still `colorbarWidth + 28`) exists to hold the wafer the
same size across value/bin mode switches. With very wide value labels the
measured reserve can now exceed it, so such a wafer draws slightly smaller in
value mode than in bin mode. Deliberate — a marginally smaller wafer beats
clipped numbers — but it is a visible difference if any tsmap screenshot capture
straddles a mode switch.

**Follow-up — the font change behind it was itself partly reverted.** Reviewing
this, the `fontPx()` migration turned out to have flattened the map canvas's
three deliberate type tiers into two: subtitle 11→12, scale note 11→12, colorbar
labels 10→12, axis ticks 10→11, leaving the map title and its own subtitle
separated only by weight. All five tokens now carry the tier delta that
reproduces their original size at the default 12px base (`fontPx()` /
`fontPx(-1)` / `fontPx(-2)`), so the sizes are back to what they were while a
host can still move the whole scale. `BIN_ROW_H`, `BIN_LEGEND_W` and
`BIN_LEGEND_W_COMPACT` reverted with them (20→17, 124→110, 72→64) — they had
only been enlarged to house the bigger text, and the bin legend's reserve is
taken off the wafer, so this returns **14px of wafer width in bin mode**. The
adaptive label band above is kept regardless: it is what makes the layout robust
to the next font change rather than to this one.

**Left alone deliberately:** the same migration also moved every Insights chart
label from 10px (and one 9px in `scatter.ts`) to `fontPx(-1)` = 11px, flattening
a similar annotation-vs-label distinction there — in `histogram.ts`, axis ticks,
LSL/USL markers and muted unit labels were 10px while axis labels were 11px; they
are now all 11px. Confirmed as displaying correctly and left unchanged. Recorded
here so the decision is visible if a chart's labels are ever found colliding or
clipping at a larger `--wmap-font-size`: the same `fontPx(-2)` tier is available.

**Status:** fixed in wmap (linked), full wmap suite green (822 tests). Not yet
published — publish with the #43/#44/#45/#46 batch, then strike this through with
the version. No tsmap-side change needed.

---

### 48. ~~No way for a host to say a *category* of finding is missing — expensive analysis was discoverable only as a menu checkbox~~ (fixed in wmap 0.27.0)

**Raised from tsmap, 2026-09-03.** `Lot ▾ → Show test-value findings` was judged
too hidden: most users would never find it, and so would never see wmap's
regional test-value findings at all.

**The real problem was not the control's placement.** wmap's Findings panel
renders the findings that exist. When a host skips `enableTestValueAnalysis`,
the panel says nothing — the absence of an entire category is invisible, and no
amount of making the *control* more prominent tells a reader looking at the
Findings list that something is missing from it. The gap had to be stated where
the gap is.

**Why it can't simply default on.** Benchmarked against wmap's own
`analyzeWaferMap`, the pass costs roughly 1.2µs per (wafer × die × test):

| Lot | off | on | added |
|---|---|---|---|
| 5 wafers × 10.7k dies × 30 tests | 299ms | 2.2s | +1.9s |
| 5 × 10.7k × 100 tests | 392ms | 7.0s | +6.7s |
| 25 × 10.7k × 30 tests | 1.4s | 11.1s | +9.7s |
| 25 × 10.7k × 500 tests | — | did not finish in 2 min | — |

So the opt-in is well justified above a certain size; it is only the silence
that was wrong.

**Fixed in wmap** with `FindingsNotice` — an optional `findingsNotice` render
option on `renderWaferMap`/`renderWaferGallery`, a `setFindingsNotice` controller
method, and the type exported from `/render`. It draws a quiet row at the top of
the Findings section with a message, an optional detail line and an optional
action button, and it makes the Findings section render even when `findings` is
empty (otherwise the offer would be hidden precisely on the lots that most need
it). wmap never raises the notice itself: only the host knows what it skipped and
what recomputing would cost.

**tsmap side** (`src/valueFindings.ts`, `src/main.ts`): estimates the cost, runs
the analysis unprompted below a 1s budget, and passes a priced notice above it.
The Lot menu item remains as the way to turn it back off; either route marks the
choice as the user's, after which the budget stops deciding. Cost model pinned by
`src/valueFindings.test.ts` to within a factor of two of the measurements above.

**Status:** fixed in wmap (linked), wmap suite green (827 tests), tsmap green
(429 tests). Not yet published — publish with the #43/#44/#45/#46/#47 batch, then
strike this through with the version.


---

### 49. ~~Geometry advisories reworked in wmap 0.27.0 — one removed, two added~~ (fixed in wmap 0.27.0)

Not a tsmap-found gap; recorded here because it changes what tsmap's log panel
reports and because the new checks are reachable from tsmap's own **Diameter &
edge exclusion** dialog.

**`inferred-pitch` is gone.** It fired whenever a diameter was supplied without a
die pitch — which is tsmap's normal CSV path, so it fired on essentially every
CSV load. The pitch there is derived as `diameter ÷ grid span`, which places the
outermost die at ~95% of the radius by construction: the result is
self-consistent and there is nothing to check it against, and at full coverage
the derived pitch is within ~1%. It was noise in the channel that also carries
real geometry errors.

**`non-standard-diameter` and `diameter-exceeds-die-extent` replace it**, both
`warning` severity, both covering cases that were previously silent:

| tsmap state | before | now |
|---|---|---|
| CSV, no diameter set | — | — |
| CSV, diameter set (any value) | `inferred-pitch` | — |
| STDF with a WCR die size, no diameter | — | `non-standard-diameter` if the inferred size is off the standard ladder |
| STDF with a WCR die size + a too-large diameter | — | `diameter-exceeds-die-extent` |
| STDF with a WCR die size + a too-small diameter | `geometry-conflict` | `geometry-conflict` |

Verified against `testdata/correlated.csv` through tsmap's own `buildWmapConfig`
shape: the CSV path stays silent at every dialog setting including a 3000 mm typo
(harmless there — with the pitch inferred everything scales proportionally, so
ring classification is unaffected), while the WCR path correctly flags the same
typo. So tsmap gains a safety net on STDF loads and takes no new false alarms on
CSV.

**No tsmap code change was needed** — `logWmapWarnings` routes by *severity*, not
by code, so new codes flow through unchanged; `npx tsc --noEmit`, `eslint` and all
429 tests pass against the linked build. One doc comment in `src/main.ts` that
listed `inferred-pitch` among the build advisories was updated.

**Worth knowing when the dialog is next touched:** a user who sets a diameter far
larger than the probed area on an STDF file will now see a warning in the log
panel. That is the intended catch — an over-large wafer empties the outer rings
and silently distorts ring/edge findings — but the dialog itself gives no hint
that the value is suspect. Surfacing it there rather than only in the log would
be a natural follow-up.

**Status:** wmap side complete (linked, 850 tests green). Not yet published —
publish with the #43–#48 batch, then strike this through with the version.

---

### 50. ~~Cross-wafer surfaces borrow ONE wafer's `testDefs` and apply it to the whole population — test numbers collide across test programs~~ (fixed in wmap 0.27.0)

**Severity: high — silently wrong numbers, not a rendering glitch.** Found 2026-09-05 by
loading six lots from five different test programs into tsmap and grouping Insights by Lot.

**Where:** seven call sites, all the same rule:

```js
const allTestDefs = getItems().find(it => it?.testDefs?.length)?.testDefs ?? [];
```

| Site | Feeds |
| --- | --- |
| `canvas-adapter/insightsTab.ts:1046` | every Insights panel (capability, boxplot, histogram, trend, scatter, correlation, test-values table) |
| `canvas-adapter/renderWaferGallery.ts:733` | the exported lot report (`renderLotSummaryReportHtml`) |
| `canvas-adapter/renderWaferGallery.ts:876` | the docked lot Summary panel |
| `canvas-adapter/renderWaferGallery.ts:1049` | the data-mode menu — i.e. *which tests are offered at all* |
| `canvas-adapter/renderWaferGallery.ts:1128` | the shared active test's def — map colorbar, log scale, pass/fail display, limit gating |
| `canvas-adapter/renderWaferGallery.ts:2272` | stacked-value cards |

**Problem:** `TestDef.testNumber` is documented (`renderer/buildWaferMap.ts:212`) as identifying
a test *"within a test program"*. Every site above ignores that and treats one arbitrary
wafer's list as the namespace for the entire loaded population. Across a multi-program load the
assumption is void: names, units, `limitLow`/`limitHigh`, `logScale` and `testType` are all
borrowed from a wafer that may describe a completely different measurement.

Reproducible from tsmap's own fixtures — test number **1001** is:

| Generator | 1001 | Limits |
| --- | --- | --- |
| `scripts/generate_stdf_corner_lot.py:202` | `vth_n_mV` | 260–380 mV |
| `scripts/generate_edge_corner_lot.py:175` | `vth_n_mV` | 260–380 mV |
| `scripts/generate_stdf_coordinateless.py:131` | `leakage_nA` | 0–5 nA |
| `scripts/generate_parquet.py:107` | `leakage_nA` | 0–8 nA |

Observed in the reporting session: the boxplot drew medians of 2.65 / 2.40 / 2.51 — `leakage_nA`
readings — titled `vth_n_mV`, axis unit `mV`, with a borrowed `USL 380` line drawn across them,
while the histogram beside it showed the real 260–380 mV population for the "same" test.
Process capability reported **Ppk −1489.43** and **−89.02**, and drilling into a wafer produced
maps entirely above USL or below LSL.

**This is not only about limits.** Four independent failure modes fall out of the one rule:

1. **Value pooling under a colliding number.** Boxplot group rows, histogram, correlation and
   scatter pool physically different measurements into one distribution. Occurs *even when no
   file carries limits at all* — pure identity corruption, and the most serious of the four.
2. **Name/unit mislabelling** on every axis, title, tooltip and colorbar.
3. **Limits** — capability, spec yield, USL/LSL lines, spec colouring.
4. **Test list truncation** — the list is one wafer's array, so a test present only in the
   other lots never appears in any selector. Silent omission, also independent of limits.

**Not affected:** `analyzeWaferMap` is called per wafer with that wafer's own `testDefs`
(tsmap `src/main.ts:514`), so per-wafer `perTestStats` / `testSpecYield` and the single-wafer
view are correct. The corruption is confined to the cross-item layer — but per the table above
that layer includes the map's own colouring and the exported report, not just Insights.

**Suggested fix:** one pure merge function, used by all seven sites, replacing the `find(...)`.

```js
// packages/stats/mergeTestDefs.ts
export function mergeTestDefs(
  items: Array<{ testDefs?: TestDef[] }>,
): { defs: TestDef[]; conflicts: TestDefConflict[] };
```

Union every test number across every item (fixes 4), then per test number reconcile the defs on
a three-tier rule. **An absent field is "not stated", never a conflict** — a load mixing files
that carry limits with files that do not is legitimate and must merge silently:

| Condition | Verdict | Behaviour |
| --- | --- | --- |
| Field absent on some items, stated on others | benign | union; stated value wins; no warning |
| Distinct stated `name`s, distinct stated `unit`s, or `testType` `'P'` vs `'F'` | hard collision — different measurements | exclude the test from every cross-item surface; warn naming both sides |
| Same name+unit, both limits stated but different | soft conflict — same measurement, different spec | keep the test and keep pooled distributions (the values *are* comparable); drop the merged limits, so no Cp/Cpk/Pp/Ppk, no spec yield, no USL/LSL line; warn |

Two comparison details that matter for false positives: compare limits with a **relative
epsilon**, not `===`, so float32 STDF `LO_LIMIT` vs a float64 CSV cannot manufacture a conflict
from representation noise; and compare names trimmed and case-insensitively, so `TEST_TXT`
whitespace or case drift does not hard-block a legitimate merge.

Surface both conflict kinds through the existing `collectWarnings` channel
(`canvas-adapter/warnings.ts:64`) as new stable codes — suggested `test-def-collision`
(severity `error`: data is being withheld) and `test-limit-conflict` (severity `warning`:
data shown, spec-relative output withheld) — so the ⚠ toolbar indicator and the Summary-panel
banner report it with no host work, exactly as `test-count-capped` already does. A user must
never be shown a Ppk of −1489 in place of "these lots cannot be compared on this test".

**Note on scope:** deliberately a *per-test* rule, not a per-program gate. Blocking any load
that mixes test programs would be both too blunt (programs often share a genuinely identical
test) and too narrow (the same collision arises between revisions of one program). One
mechanism keyed on the test defs themselves covers both.

**tsmap-side finding (2026-09-05) — the premise above was wrong, and this half mattered more.**
"tsmap supplies correct per-wafer `testDefs`" was not true. `main.ts` merged every file's defs
with `Object.assign({}, ...entries.map(e => e.parsed.testDefs))` — last-wins — and passed that one
object to `buildWmapConfig` for **every** wafer. So wmap received a population in perfect
agreement and correctly reported nothing; the wrong definition had already been chosen, host-side,
and the losing one discarded. The wmap fix above is real and necessary for any host that does pass
per-wafer defs, but it could not fire for tsmap and is **not** what produced the reported
screenshot. Verified against the committed fixtures' own PTR records: test 1001 is `vth_n_mV`
(mV, 260-380) in `PVT-LOT-05.stdf`, `leakage_nA` (nA, 0-5) in `COORDLESS-LOT-01.stdf` and
`leakage` (nA, 0.5-5.5) in `EDGE-LOT-01.stdf` — three meanings, one number, in one load.

**Fixed tsmap-side the same day.** Each wafer now carries its own file's defs
(`RenamedWafer.testDefs` → `currentDefsBySource`, keyed on the `WaferSource` its file's wafers
already shared by reference), so wmap's `mergeTestDefs` gets the per-wafer input it was built for.
`currentTestDefs` stays the lot-wide union for tsmap's own UI, built by a new `unionTestDefs`
(`lib.ts`) that mirrors wmap's tiers exactly — same absent-is-not-stated rule, same relative
tolerance on limits, same case-insensitive name comparison — so the two layers can never disagree
about what counts as a conflict. tsmap adds the half wmap cannot: the log message names the
**files**, which wmap (knowing only wafer indices) cannot do. See tsmap's `CHANGELOG.md`
[Unreleased].

**The same last-wins rule had two siblings, one of them worse.** `main.ts` also merged bin names
(`mergeBinDefs`, last-wins) and pass bins (`mergePassHbins`, a **union**) across files. The union
was the dangerous one: a hard bin marked Pass by one file became a pass bin for every wafer in the
load, including wafers from a file that counts it as a fail — moving yield, findings, region
yields and the report. Fixed in the same pass: each file's wafers are judged by its own
`passHbins` (`FileDefs`), disagreements are logged naming both files and the bin, and a file that
states none inherits the union rather than wmap's `[1]` default. Bin *names* remain merged —
cosmetic, and changing them would alter the gallery legend. Worth noting on the wmap side:
`renderWaferGallery`'s own lot legend does the same `deduplicateDefs` last-wins merge over items'
`hbinDefs`, which is the wmap half of that cosmetic gap.

**Full audit (2026-09-05).** Swept both repos and the Rust crate for every place a test number,
bin number or per-file fact is treated as a lot-wide identity. Result:

| Area | Verdict |
| --- | --- |
| Per-wafer analysis (`analyzeWaferMap`, findings, spatial/regional, per-wafer summary, single-wafer map, mapless summary) | **Sound.** Always ran against that wafer's own `testDefs`; never had the bug. |
| `analyzeWaferLot` | **Sound.** Carries per-wafer `perTestStats` through keyed by wafer index; pools nothing by test number. |
| Insights panels (capability, boxplot, histogram, trend, scatter, correlation, pass rate) | **Fixed.** All receive reconciled defs; Distributions additionally scope-aware. |
| Lot Summary panel, lot report, CSV exports | **Fixed** via `lotTestDefs()`. |
| Plot-mode menu, stacked-value maps, die list | **Fixed** — all three fell back to discovering withheld numbers off the dies when reconciliation kept nothing (ambiguous `undefined`). |
| Findings click → gallery active test | **Fixed** — wrote `activeTest` unguarded, bypassing every other check. |
| tsmap load paths (fresh, append, re-parse) | **Fixed** — per-file defs and pass bins. |
| tsmap first-pass scan | **Fixed** — flattened test names before the selector. |
| **Rust parsers (`testdata-parser`)** | **Clean, no change needed.** Every entry point takes one file's bytes; there is no cross-file merge in Rust at all. Within a file a test number IS the identity key, so `test_defs.insert` last-wins is correct and matches the STDF convention the HBR/SBR handling already follows. |

**Scope extended to every view (2026-09-05).** Overview and Correlation now reconcile over the
scope too, via ONE tab-level **Show:** control beside "Group by" — replacing the per-panel copies.
`renderCorrelationPanel` turned out to carry the same latent bug `renderCapabilityPanel` had
(silent restrict to `groups[0]`, no way back, nothing naming the chosen group); both lose their
`groups` option entirely, since a scoped population arrives with grouping already collapsed.

**Known limitations, deliberately left:**
hard/soft bin **names** are still merged lot-wide in both tsmap and `renderWaferGallery`'s legend
(cosmetic — a wrong name, not a wrong number); and a file supplying **no** `testDefs` contributes
values that cannot be checked for disagreement, since a wafer describing nothing contradicts
nothing (the alternative, withholding everything whenever any file lacks defs, is worse).

**Follow-up (2026-09-05): withholding needed a SCOPE, and the first cut got it wrong.** Applied to
the whole load, the rule punishes agreement — with six lots where four define test 1001
identically and two differ, 1001 was withheld from all six, leaving only the tests unique to a
single lot (the one lot that can compare with nothing). Insights got emptier the more data was
loaded, while the Findings panel — per-wafer, using each wafer's own defs, and correct — kept
reporting on tests Insights refused to chart. wmap's Distributions view now reconciles over the
population **in scope**: pick a group and every one of its tests returns with its own name, unit
and limits, because within one lot a test number does identify one test; "All groups" still
withholds. A caption names what was withheld and how to get it back.

**Correction (2026-09-09): the "still open" note that stood here was already stale when it was
written.** It said Overview and Correlation reconciled over the whole population and that
Correlation needed the shared group-scope control first. That control landed the same day
(`activeSectionGroup` / `selectGroupEverywhere` / `makeLinkedGroupSelect`), and with it
`mergeTestDefs` moved **above** the view switch in `insightsTab.ts`'s `render()` — so all three
views have been scope-aware since. Verified against a two-lot fixture with a hard collision on
test 1001: unscoped, every view withholds it and says so; scoped to LOT-A each returns
`vth_n_mV`, scoped to LOT-B each returns `leakage_nA` — that lot's own name, not the first one
seen. What was actually missing was a **test**: nothing pinned the behaviour, in any view. Now
pinned by `tests/insightsScopeReconciliation.test.mjs` (10 cases, three views × withheld /
scope-A / scope-B, plus the caption's own wording), because the wrong version shipped once and
the fix's correctness rests on where in `render()` it sits — a refactor moving it back inside a
section would restore the bug for the other two views silently.

**Decisions (2026-09-05, agreed with the user):** a hard collision **excludes** the test from
cross-item surfaces — splitting it into one series per program would need a compound test key
threaded through every panel, which is the combinatorial direction to avoid. The `(none)` lot
bucket seen in the same session (wafers labelled with a lot but bucketed as unset) is held
until this is fixed, to see whether it survives.

**Status (2026-09-05): fixed in wmap, published in wmap 0.27.0 (2026-09-09).** Implemented as suggested —
`packages/stats/mergeTestDefs.ts` (new, exported from `/stats`), all seven call sites switched
to it, and the collision warnings joined onto the gallery's existing `collectWarnings` call, so
no `collectWarnings` API change was needed. The soft tier needed **no consumer changes at all**:
a merged def that drops its limits already makes `buildCapabilityData` report `hasSpec: false`
(no Cp/Cpk/Pp/Ppk, normalised to its own observed range) and already removes the limit lines and
spec-yield read, because every one of those paths keys on the limits being present.

Verified against the exact fixture collision: with test 1001 defined as `vth_n_mV` 260–380 mV in
one item and `leakage_nA` 0–5 nA in the other, `buildCapabilityData` on the borrowed list still
returns a capability row with a Ppk for the pooled population; on the merged list it returns
zero rows plus one `test-def-collision` error naming both. The benign case merges silently —
limits stated in one file and absent in the other produce the stated limits and no warning.
19 new tests (`tests/mergeTestDefs.test.mjs`); full suite 869 green; `tsc --noEmit` clean;
`check-bundle-size`, `check-clones`, `check-style-scales`, `check-overlay-conventions` and the
export-surface guard all clean (the data layer grew ~44 → ~46 KB gzip; README and
`docs/performance.md` updated to match). Publish with the #43–#49 batch.

**Not addressed here:** the per-wafer `statsSummary.stats.testSpecYield` shown in the lot Summary
panel is still computed per wafer against that wafer's own limits, which is honest in itself but
can sit beside a lot-level capability that has been withheld for the same test. Worth a look when
the soft tier meets real data.

Related: `IDEAS.md`'s "Single-test
focus" entry item 4 (Distributions' three independent grouping controls) — the same session
showed Process capability scoped to `EDGE-LOT-01` while the boxplot beside it was drilled into
`Lot: (none)`, with nothing indicating the two panels were describing different populations.
That was filed as a polish item; on this evidence it is a correctness bug and should be raised.

### 51. ~~Boxplot (and yield) leaf-row click is inert in a single-wafer render — `renderWaferMap` never passes `openWafer`~~ (fixed in wmap 0.28.0)

**Where:** `packages/canvas-adapter/renderWaferMap.ts` — the `mountInsightsTab`/`insightsTab(...)` deps object, which deliberately omits `openWafer` (the comment reads *"No openWafer — this map already IS the only wafer there is to open"*). Consumed in `packages/canvas-adapter/insightsTab.ts` (`openWaferDetailModal`, wired into the yield panel's `onOpen` and the boxplot's/capability's `onOpen` at the leaf level) and `packages/canvas-adapter/charts/boxplot.ts` (`leafClickable`, the hover cursor, the `click to open this wafer` tooltip hint, and `syncHint`'s header line). `renderWaferGallery.ts` passes a real `openWafer`.

**Problem:** In a single-wafer load (tsmap's `renderWaferMap` path, `main.ts` — `wafers.length === 1`, `insights: { enabled: true }`), clicking a box in **Test value distribution** does nothing. The chart correctly hides its own affordances when `onOpen` is absent (no pointer cursor, no "click a box to open that wafer" hint), so it isn't visibly broken — but a user who has just come from a multi-wafer lot, where the same box *is* clickable, reads it as the feature failing.

The reasoning behind the omission is only half right. Opening *the same wafer* in a modal is indeed pointless. But the gallery's `openWafer` carries a **second** payload: `testNumber`, from a boxplot leaf-row click, which opens the map straight into **value mode on that test** (`buildDetachedController`'s own doc comment says so). That half is exactly as useful with one wafer as with twenty — arguably more so, since a single-wafer user reaches Insights specifically to find which test is misbehaving and then wants to see it on the map. Today the only route is: leave Insights, open the toolbar's plot-mode/test picker, find the test again by name.

**Impact (tsmap):** the boxplot → map shortcut silently exists only for multi-wafer loads. Same for the yield panel's leaf rows, though there the click genuinely has nothing to add with one wafer. tsmap can't paper over it host-side: `openWafer` isn't reachable from `RenderOptions`, and the only host-visible workaround — force every single-wafer load through `renderWaferGallery` — would be worse in every other respect.

**Suggested fix (single-dimension, no new modal):** don't give `renderWaferMap` a modal-opening `openWafer`; give the Insights tab an optional `focusTest?: (testNumber: number) => void` dep that `renderWaferMap` fills in with "switch this map to value mode on `testNumber` and close Insights" (the plot-mode switch it already performs internally, plus the existing `setInsightsOpen(false)`). Then:

- In `insightsTab.ts`, a leaf-row `onOpen` resolves to `openWafer` when present, else to `focusTest` when present and the row's wafer is the only wafer — one branch, not a second parallel wiring.
- In `boxplot.ts`, `leafClickable` and the two hint strings key on "a leaf action exists", not on `onOpen` specifically, and the wording differs by which one it is: *"click a box to show this test on the map"* rather than *"…to open that wafer"*.
- The yield panel keeps `onOpen`-only (no `focusTest` equivalent — a yield leaf row carries no test), so it stays inert in a single-wafer render, correctly.

Alternative considered and rejected: passing a modal-opening `openWafer` from `renderWaferMap` anyway, so the click opens the same wafer in a modal already switched to that test. It works, but it duplicates the whole map into an overlay to change one view option, and leaves the user with two maps of one wafer.

**Notes / Related:** #31 (the chart suite living in wmap at all), #48 (`FindingsNotice`) — same class of "the single-wafer path quietly gets less than the gallery path" gap that `insights: { enabled: true }` on `renderWaferMap` was added to close in the first place. Found 2026-09-09 against wmap 0.27.0.

**Round-trip check (does the map ↔ Insights switch lose context?):** no — and this is what makes
the `focusTest` shape viable rather than merely cheaper than a modal. `setInsightsOpen(false)`
only sets `display: none`; the tab is constructed once (`insightsLoad ??=`, `renderWaferMap.ts`)
and never torn down. Reopening calls `tab.render()`, which *does* rebuild every panel
(`insightsTab.ts`, `render()` — `panelHandles` destroyed, `bodyEl.innerHTML = ''`), but the
state that matters is closure state living outside that rebuild and is re-applied on the way
back: `activeView` (sub-tab), `analysisGroupKey` (**Group by**), `activeSectionTest` (fed to all
four panels as `selectedTestNumber`), `activeSectionGroup` (drilled group). So the user returns
to the same boxplot, same grouping, same test they clicked from.

Two things *are* lost on any Insights close/reopen, both consequences of `render()` emptying
`bodyEl`, and **both are pre-existing** — they happen today on every toolbar Insights toggle in
the gallery too, so they are not caused by this issue's fix, but the fix makes the round trip
routine enough to be worth closing them in the same pass:

- **Scroll position** resets to 0 (the `overflowY:auto` wrapper survives, its content doesn't).
- **Axis prefs** (include limits / clip outliers) reset — `axisPrefs` is declared *inside* the
  Distributions builder rather than beside the four lifted variables above.

**Suggested fix for those two:** lift `axisPrefs` to sit with `activeView`/`analysisGroupKey`/
`activeSectionTest`/`activeSectionGroup` (it is already funnelled through one `axisHandler`, so
this is a declaration move, not a rewiring), and have `setInsightsOpen` record the scroll
container's `scrollTop` on close and restore it after the post-`render()` reveal.

**Status: fixed in wmap 0.28.0 (published and adopted 2026-09-11).** Implemented 2026-09-09 against the link. Implemented as suggested, plus both round-trip fixes above:

- `InsightsTabDeps.focusTest?(testNumber)`, filled by `renderWaferMap` with "switch to
  `{ plotMode: 'value', activeTest: testNumber }` and `setInsightsOpen(false)`" — the same
  option pair `renderWaferGallery`'s `buildDetachedController` already uses for the modal, so
  the two paths cannot diverge on what "open on this test" means.
- One resolver (`testLeafAction`) decides what a test-carrying leaf click does for the host at
  hand, so no panel knows which kind of host it is in: `openWafer` wins where it exists,
  `focusTest` applies only when the row is the sole item. The trend panel is deliberately left
  on `openWafer` alone — it renders an empty state below two wafers, so the single-wafer branch
  there would be dead code claiming otherwise.
- `BoxplotPanelOptions.openActionLabel` carries the wording, so the chart states what the click
  will actually do ("click a box to show this test on the map").
- `axisPrefs` lifted to tab level beside `activeSectionTest`/`activeSectionGroup`; Insights
  scroll offset remembered and re-applied after the rebuild. The scroll restore needed more
  than one assignment — the cards grow to their measured content over the following frames, so
  the first write is clamped (212px of a requested 300px) and the layout pass then resets it to
  0; it now retries over ~600ms and stops if the position goes PAST the target, which is the
  user scrolling. Reading "different from what we wrote" as a takeover was the first version's
  bug: the resets to 0 are exactly that, and it gave up on its own clamped write.

**Verified** in wmap by 6 new tests (`tests/insightsReview.test.mjs` for the resolver and the
axis-prefs lift, new `tests/insightsFocusTest.test.mjs` for the end-to-end `renderWaferMap`
click → `plotMode: 'value'` + `activeTest` + Insights closed); full suite 894 green, `npm run
verify` clean. The scroll restore is deliberately NOT unit-tested — JSDOM has no layout, so
`scrollTop` never resets and the test passed with the restore deleted (checked). It was
verified in a real browser instead, against the built tsmap web app with a single-wafer STDF:
hint reads "Click a box to show this test on the map"; clicking a box leaves Insights and puts
the map in value mode on `leakage_nA` (confirmed by the Plot-mode menu's checked entry, not by
eye); reopening Insights returns to Distributions with the same test selected and scroll 300 →
300 (212 before the retry fix).

**Not done here:** the gallery's own Insights scroll position, because there the host page owns
the scroller and the library has nothing to restore. tsmap needed **no code change** for any of
this. Publish with the next wmap batch, then unlink and pin.

### 52. ~~Colour scheme choices can't be persisted — one `colorScheme` for two kinds of map, reset on every bin-mode switch; and the bin palettes themselves were unsound~~ (fixed in wmap 0.28.0)

**Where:** `packages/renderer/colorSchemes.ts` (one `ColorScheme = { forBin, forValue }` registry
behind one `colorScheme` option), the "not bin-compatible" reset in `renderWaferMap.ts` `syncOpts`
and `renderWaferGallery.ts` `updateShared` (plus a third copy of the allowed-names list in
`toolbar.ts` `makePaletteBtn`), and `packages/renderer/colorMap.ts` (`hardBinColor`/`softBinColor`).

**Problem (as found — asked for "persist the user's chosen value and bin colour schemes"):** wmap
kept a single `colorScheme` and, on any switch into Hard/Soft Bin mode, reset it to `'default'`
unless it was one of three hardcoded names. A user who chose Viridis for value maps lost it the
first time they looked at a bin map, so tsmap could only ever have persisted whichever mode was
touched last. A review of the bin side then found the palettes themselves wrong, measured
(CIEDE2000, bins 1–16, with simulated colour-vision deficiency):

- hashing the bin number made collisions certain — soft bins 1/7 and 4/6 identical, Accessible
  bins 4/5 and 9/13 identical; only 75 distinct colours across hard bins 1–255;
- the "Accessible" palette was CVD-safe in its hue families but not in the colours bins actually
  received (near-identical steps within a family, randomly assigned);
- pass/fail colour was tied to the bin NUMBER (bin 1 green, 2 red) — contradicting `passBins`;
- the soft-bin failing-die hatch tested soft bin numbers against the hard pass list;
- `BinDef.color` applied only under a `'custom'` pseudo-scheme that the gallery auto-selected only
  when the host passed no scheme — so restoring a saved scheme would have hidden a site's colours;
- `getActiveLegend()` hashed bin numbers regardless of the active palette.

**Fix (wmap, unpublished — ships as 0.28.0, breaking; tsmap LINKED):** `binColorScheme` and
`valueColorScheme` are separate `WaferPreferences` with separate registries; no reset exists any
more. Bin colours come from one resolver, `resolveBinColors` → `View.binColors`: pass bins (per
`passBins`) take green pass colours, fail bins the rest, ranked by die count; soft bins are
pass-aware; `BinDef.color` is a layer every palette honours (`useDefinedBinColors`, a Palette-menu
toggle). The gallery resolves once over every wafer it shows. Palettes re-selected by measurement (Default 3 + 19,
every pair ≥ 16 ΔE00; Colour-blind safe 2 + 14, ≥ 8.8 ΔE00 under deutan/protan/tritan together),
guarded by `tests/binPalettes.test.mjs`; a `bin-colors-shared` warning names bins once a palette
runs out. Full list in wafermap's `CHANGELOG.md` [Unreleased].

**tsmap side (done, against the link):** `src/mapColorPrefs.ts` restores the three preferences
into both render calls' `viewOptions` and saves them from `onViewOptionsChange`
(`tsmap:map-colors`, in Reset settings); bin definitions files gained a `color` column
(`src/binDefs.ts`, template, `mergeBinDefs`). An in-app bin colour editor was deliberately left for
later — it would want a wmap hook (legend-swatch click → host), and the file column covers the
realistic case of a site colour sheet first.

### 53. ~~Implausible geometry hangs the render — `toCanvas`'s hit-test grid had no size bound~~ (fixed in wmap 0.28.0)

**Where:** `packages/canvas-adapter/toCanvas.ts`, the uniform-grid spatial index built for
hit-testing at the end of every render (`nCols × nRows` cells of 1.5 dies each, allocated with
`Array.from({ length: nCols * nRows })`).

**Problem (found 2026-09-11, preparing the 0.28.0 / 0.1.34 releases):** tsmap's **Load sample
data** never finished: the toolbar stayed on "Rendering sample-lot.stdf — 13 wafers…" with every
control disabled, and each render and resize threw `RangeError: Invalid array length` from
`toCanvas`. The bundled `sample-lot.stdf.gz` had been written with the WCR record's fields 2 bytes
out of place (the generator bug fixed in this same batch), so read correctly it gave dies ~1e-8
mm wide against a normal die-index span — and the grid, sized from die size alone, asked for
more cells than an array can hold. A geometry error of any kind should reach the reader as a
warning, never as a map that silently fails to draw and a host stuck in its busy state.

**Fix (published in wmap 0.28.0, adopted 2026-09-11):** the grid is sized by `hitGridDims`
(new internal `packages/canvas-adapter/hitGrid.ts`): non-finite or non-positive cell sizes fall
back to the span, and cells grow until the grid holds at most max(4096, 4 × dies). A coarser grid
only makes a hit test inspect a few more dies. A non-finite die position is filed in cell 0
instead of index `NaN`. Guarded by `tests/hitGrid.test.mjs`.

**tsmap side (done):** `sample_data/sample-lot.stdf.gz` regenerated from the corrected
`PVT-LOT-05.stdf` (it had been missed when that file was patched), and `wcrGeometryFrom`
(`src/lib.ts`) now ignores a WCR record whose `WF_UNITS` is outside the spec's 0–4 — the
signature of a misread record — rather than passing its centre and notch on.
