# UX/Feature Backlog

Ideas from a full app review (2026-07-09), from a user's point of view — what would make
tsmap easier to use, more intuitive, and more useful. Not all of these are committed; several
need more discussion before scoping. Check items off (`[x]`) and add an implementation note
or a link to the PR/commit when done, rather than deleting the entry — keep the history like
`WMAP_ISSUES.md` does.

## Quick wins (low effort, real friction removed)

- [x] **Recent-files (MRU) list.** No way to reopen a recently-loaded file/lot without a fresh
      file-picker trip. Show last 5–10 on the empty state and under "Open file".
      Implemented 2026-07-09: `src/recentFiles.ts` + empty-state list and a toolbar **Recent**
      dropdown in `main.ts`, both sharing `buildRecentRows`. Desktop only (Tauri paths required
      to reopen without the picker); last 8 entries with last-loaded timestamps, `localStorage`.
      Fixed same day: entry tooltips were using the native `title` attribute, which left ghost
      rendering artifacts on WebKitGTK when a row was removed while hovered — switched to the
      shared themed `attachTooltip`. Also added the toolbar button so Recent stays reachable
      once a file is loaded, not just from the empty state. Reopening is replace-only (matches
      "Open file" semantics) — no append-from-recent yet, a deliberate v1 scope call.
      Second fix same day: the row tooltip rendered behind the Recent dropdown itself — root
      cause was a latent bug in the shared `tooltip.ts` singleton (only re-appended to `<body>`
      on its first-ever show, so any later-appended overlay at the same z-tier silently
      out-ranked it in DOM paint order). Fixed at the source in `tooltip.ts` — always
      re-appends on every show — so it can't recur for any future overlay either.
- [x] **Sample/demo data on first run.** Installers are unsigned and trigger OS security
      warnings (first-impression cost). A "Load sample data" button on the empty state lets an
      evaluator get past that and see the app work before trusting their own files.
      Implemented 2026-07-09: reused the existing `sample_data/PVT-LOT-05.stdf` fixture
      (13 wafers, 5 process corners) rather than bundling anything new — gzipped to 106 KB
      (`sample_data/sample-lot.stdf.gz`) and loaded through the normal pipeline via a new
      `Platform.getSampleFile()`. Desktop: shipped as a Tauri `bundle.resources` entry,
      resolved at runtime with `resolveResource()` to a real path — reuses the native parse
      commands' existing transparent `.gz` decompression, no new Rust code. Web: fetched as a
      Vite-resolved static asset (`new URL(..., import.meta.url)`), decompressed by the
      existing `expandArchives()` `.gz` handling — also no new code. Sizing (measured against
      real bundles): +14.3% raw / +2.2% gzipped on the `.deb`; +0.9%/+0.14% on the AppImage
      (dominated by its bundled webview runtime). Verified: web path end-to-end via `curl`
      against the dev server (exact byte match); desktop verified by config/code inspection
      and `cargo check` only, since a GUI smoke test needs a display this environment doesn't
      have — caught two real bugs on the user's manual `tauri dev` test that inspection alone
      missed. (1) The desktop path 404'd (ENOENT): `bundle.resources` was the bare string-array
      form, and Tauri rewrites `..` segments to a literal `_up_` in the resource tree for that
      form (the source lives outside `src-tauri`) — so the real key was
      `_up_/sample_data/sample-lot.stdf.gz`, not `sample-lot.stdf.gz`. Fixed by switching to
      the `{ "source": "target" }` object form, which pins the target name explicitly. (2) The
      error surfaced as unhelpful "undefined" — a separate, codebase-wide bug where
      `(e as Error).message` on a Tauri `invoke()` rejection (a plain string, not an `Error`)
      silently reads as `undefined`; fixed at the source with a new `errMsg()` helper in
      `lib.ts`, applied to all 7 call sites in `main.ts`. Confirmed fixed against a real
      `tauri dev` run.
      Follow-up 2026-07-09: bundled the matching `PVT-LOT-05_splits.csv` alongside (same
      resource/fetch pattern as the STDF — one more `bundle.resources` entry, one more
      `Platform.getSampleSplitsCsv()`) so the demo shows off wafer splits too, with no new UI.
      Rather than a second load flow, it seeds the *existing* splits auto-restore store
      (`SPLITS_LS_KEY` in `main.ts`, `loadSavedSplits`) just before the fingerprint becomes
      computable — via a small `pendingSampleSplitSeed` module variable consumed inside
      `loadSavedSplits` itself — so the already-built "never silent, logs + opens the dialog"
      restore UX picks it up for free. Splits fetch failure degrades gracefully (logs, doesn't
      block the STDF load). Verified: web assets confirmed via `curl` against the dev server
      (exact byte match for both files); wafer-ID match between the CSV and STDF confirmed by
      reading `scripts/generate_stdf_corner_lot.py` (both are generated from the same
      `WAFER_CORNERS` list, so they can't drift); the `renderWafers`-side seeding logic itself
      not run live (same environment constraint as above) — worth a manual check alongside the
      sample-file fix.
- [ ] **Pin/favorite tests.** With hundreds of tests, the boxplot/histogram/scatter/correlation
      dropdowns are flat lists. A pinned/favorites section (separate from the existing rename
      feature) cuts repeated searching during a debug session focused on a handful of tests.
- [ ] **Keyboard-shortcut cheat sheet.** Esc/F etc. exist but are documented only in guide
      prose. A `?`-triggered overlay would surface them in-context.

## Chart/analysis additions (highest-value category — needs discussion on scope)

**2026-07-11 ownership shift:** tsmap's own Charts page (`src/charts/*`, ~2000 lines) was
deleted entirely as part of the wmap↔tsmap boundary rework — every chart/analysis panel (yield,
bin pareto/cluster, capability, boxplot, histogram, correlation, scatter) now lives in wmap
itself as its **Insights tab** (opt-in via `insights: { enabled: true }` on
`renderWaferMap`/`renderWaferGallery`), available to any wmap host, not just tsmap. tsmap has no
chart-rendering code of its own left. See `WMAP_ISSUES.md` #31 for the full migration history.
Any new chart idea below would now be scoped and built as a **wmap** contribution, not a tsmap
change — noted per item.

- [x] **Cpk/Ppk (process capability).** Biggest functional gap for this audience. Boxplot and
      histogram already have mean/stddev/limits in scope — natural home for Cp/Cpk/Pp/Ppk.
      Implemented 2026-07-10 as a new **Process capability** chart panel (`src/charts/capability.ts`,
      `buildCapabilityData` in `charts/aggregate.ts`), merged with the "parametric worst
      offenders" idea below into one visual per user discussion: a normalized boxplot per
      test (LSL→0, USL→1, only tests with *both* limits — a real-world fab audience often has
      few or no limits set, so the panel reports how many tests were excluded rather than
      guessing) sorted worst-Ppk-first, colour-coded by Ppk band. Cp/Cpk use pooled
      within-wafer stddev (ANOVA-style pooling, wafer = the natural short-term subgroup);
      Pp/Ppk use the plain overall stddev — both shown on hover. Respects the existing "Group
      by" via a `Group:` selector mirroring the correlation matrix's restrict-to-group pattern
      (subgroup for Cp/Cpk stays per-wafer regardless of grouping; only the pooled population
      changes). Clicking a test's box sets the boxplot/histogram panels to that test in place,
      the same cross-panel-link pattern as the correlation matrix → scatter (`onSelectPair`),
      required adding `setTest` handles to `renderBoxplotPanel`/`renderHistogramPanel`'s return
      values. Verified with Playwright against `dev:web` (headless — no display in this
      environment) using the `PVT-LOT-05`-style corner-lot fixture: normalized boxes render
      correctly, hover tooltip shows Cp/Cpk/Pp/Ppk, click-to-drive-boxplot confirmed, and the
      grouped `Group:` selector correctly restricts to one split's wafers.
      Follow-up 2026-07-10: three issues found by the user in first review, all fixed. (1) The
      panel's canvas didn't grow to fill the expand modal — it drew at a fixed size regardless
      of the modal's available space, unlike boxplot/histogram/scatter. Fixed by adopting the
      same `applyCanvasFlow`/`chartFillHeight` fill-canvas pattern for height, and by lifting the
      per-column pixel cap only inside the modal (`isInModal(card)`) so columns stretch to use
      the full width instead of leaving it empty. (2) Capability was placed after boxplot/
      histogram in the card order even though it's effectively a selector for them (click a
      test's box to drive their selection) — reordered to lead. (3) The charts page was one
      flat 2-column grid; an odd card count in one logical group (e.g. 3 distribution panels)
      staggered the row alignment of unrelated cards after it (correlation matrix landing
      before the scatter it's paired with). Fixed by splitting `renderChartGrid` into labeled
      sections (`ChartSection[]`, `render.ts`), each with its own sub-grid — "Yield & bins",
      "Distributions", "Correlation" — so one section's odd count can no longer bleed into the
      next section's layout. Deliberately not collapsible yet (agreed with the user to hold off
      until the remaining 3 chart ideas below actually make the page unwieldy, rather than
      building that complexity preemptively).
      **Superseded 2026-07-11**: `src/charts/capability.ts` (and the rest of tsmap's Charts
      page) was deleted as part of the wmap↔tsmap boundary rework. Cp/Cpk/Pp/Ppk now live in
      wmap itself (`stats/capability.ts` + `packages/charts/capability.ts`) as part of its
      Insights tab's Distributions section, ported with the same normalized-boxplot/Group-by/
      cross-link design described above, and available to every wmap host, not just tsmap. See
      `WMAP_ISSUES.md` #31.
- [x] **Parametric "worst offenders" Pareto.** Bin pareto ranks hard-bin failures; nothing
      ranks *parametric tests* by out-of-spec rate or Cpk. Users currently click through tests
      one at a time to find the yield-loss driver. Mirrors the correlation matrix's existing
      "rank by |r|" pattern.
      Folded into the Process capability panel above (2026-07-10) rather than built as a
      separate pareto bar chart — the normalized-boxplot-sorted-by-worst-Ppk view covers the
      same "which test is the problem" workflow while also showing distribution shape, not
      just a single ranking number. Migrated into wmap along with that panel — see the note
      above.
- [ ] **Cross-lot SPC/run chart.** Boxplot's "Trend line" only connects per-wafer medians
      *within one load*. No run chart of a test's mean/median across lots/dates with control
      limits, despite faceting already supporting multi-lot loads.
      Note (2026-07-11): the "Trend line" toggle this idea builds on no longer exists at all —
      it was deliberately trimmed (not carried over) when boxplot was ported into wmap's
      Insights tab (`WMAP_ISSUES.md` #31). This would need to be built fresh in wmap, not layered
      onto an existing feature. Still unimplemented either way.
- [ ] **Wafer-to-wafer bin/value diff.** No overlay/diff view between two selected wafer maps
      (e.g. tool A vs tool B edge-ring pattern). Splits/grouping already segment wafers this
      way; a direct compare view closes the loop.
      Note (2026-07-11): tsmap has no chart code of its own left — this would now be a wmap
      Insights-tab addition, not a tsmap change. Still unimplemented.
- [ ] **Site-level analysis view.** Test site is captured (tooltip + grouping dimension) but
      has no dedicated chart. Boxplot-by-site or site-vs-site comparison is the standard way to
      catch a miscalibrated test head on multi-site testers. Mostly reuses existing grouping
      infrastructure.
      Note (2026-07-11): checked wmap's `buildFacetTable`/facet curation — site is not currently
      exposed as a groupable wafer-level facet (it's per-die, not per-wafer metadata), so "mostly
      reuses existing grouping infrastructure" is optimistic as written; would need its own
      aggregation. Would now be a wmap addition. Still unimplemented.

- [ ] **Single-test focus: make Insights' existing drilldown read as one system.** Discussed
      2026-09-05. The original framing was a new full-page "analysis of one test" view, reached
      by selecting a test from Insights — stats, charts, pass/fail, faceting, optionally a test
      report. Investigation found most of it already built but distributed, so the scoped work
      is to concentrate and finish what exists rather than add a page beside it.
      **Already there, do not rebuild:** `insightsTab.ts`'s Distributions section already holds
      one shared `activeSectionTest`, broadcast by `selectTestEverywhere` to capability, boxplot,
      histogram and trend — pick a test in any of the four and the rest follow. `axisPrefs` is
      shared the same way. Faceting is already plumbed section-wide (`Group by:` builds `groups`
      and every panel consumes it). Per-wafer test-value drilldown already works from boxplot
      (`charts/boxplot.ts`, click a leaf row) and trend (`charts/trend.ts`, click a point), both
      carrying the active test through `openWaferDetailModal(waferIndex, title, testNumber)`.
      Lot-wide test maps are the *gallery's* job and already exist there
      (`renderWaferGallery.ts`'s `updateShared({ plotMode: 'value', activeTest })` for per-wafer
      maps; `buildWaferMap.ts`'s cross-wafer `testValues` aggregation for the stacked build) —
      no test-value map panel belongs inside Insights.
      **The actual gap** is that a click means something different on adjacent cards, so the
      drilldown reads as accidental and is, in the user's words, easily overlooked. Four changes,
      in the order they should be done — all in wmap (tsmap has no chart code left, per the
      2026-07-11 ownership shift above), all inside `insightsTab.ts` and `canvas-adapter/charts/`:
      1. **Settle the click vocabulary.** Capability's click rebinds the section; boxplot's, on
         the card next to it, throws a modal. Rule to adopt: *a mark that is one wafer opens that
         wafer at the current test; a mark that is a test selects that test across the section.*
         Boxplot and trend already follow the first, capability and correlation the second — this
         is a decision, not code, but it is what makes the rest coherent.
      2. **Add `onOpen` to the scatter panel** (`charts/scatter.ts`) — the panel where you stare
         at an outlier and currently cannot act on it. Click a point → open that die's wafer at
         the X test, same `(waferIndex, testNumber)` signature boxplot and trend already use,
         routed through the existing `openWaferDetailModal`. Needs a small data change first:
         `ScatterPoint` (`stats/scatter.ts`) carries only `x`/`y`/`hbin`/`group`, no wafer
         identity, so `ScatterItem` gains an optional `waferIndex` and `scatterPointsForDies`
         threads it onto each point. Additive and optional — not a breaking change.
      3. **Add a per-test pass-rate card to Distributions.** `buildTestPassRateData`
         (`stats/testPassRate.ts`, with its three spec/testFlag/functional modes and
         `disagreementDies`) and `renderTestPassRatePanel` (`charts/testPassRate.ts`) both
         already exist and are wired only into Overview, as a *cross-test* comparison. Bind a
         second instance to `activeSectionTest` as a fifth subscriber to `selectTestEverywhere`.
         Nearly no new code; it answers "is this test failing more in one split than another",
         which is the faceting half of the original request.
      4. **Unify Distributions' three grouping controls** — the follow-up already logged in
         `insightsTab.ts`'s header comment (capability's restrict-to-one-group dropdown,
         boxplot's pooled-overview-with-drill, histogram's overlay-with-legend become one
         section-level control, the way the selected test and `axisPrefs` already are). Largest
         of the four, and only worth doing after 1–3 have settled what the section is.
         **Reclassified 2026-09-05: correctness, not polish.** Observed live with Process
         capability scoped to `EDGE-LOT-01` while the boxplot beside it was drilled into
         `Lot: (none)` — two adjacent panels describing different populations, with nothing
         saying so. Raise its priority accordingly; see `WMAP_ISSUES.md` #50.
         **Done 2026-09-05** (wmap, unpublished): one shared `activeSectionGroup` broadcast by
         `selectGroupEverywhere`, via a new `makeLinkedGroupSelect` mirroring
         `makeLinkedTestSelect`'s set-does-not-fire asymmetry. Default changed from `groups[0]`
         to **all groups**. The panels keep their own renderings of the scope — capability
         narrows, boxplot drills (click-a-box and Back unchanged, now moving the shared scope),
         histogram emphasises rather than filters, since the overlay is its whole job. Trend
         stays out, as it already stood outside `groups`. 7 new tests.
      **Deliberately not in scope.** A new page or sub-tab: two surfaces answering the same
      question is the failure mode this codebase has already paid for twice (the
      Summary-panel/Insights overlap, and tsmap's duplicate `Report…` button, deleted 2026-07-11).
      Histogram `onOpen`: a bin is a die set that can span wafers, so "open that wafer" has no
      honest answer — that case wants the die set handed to the gallery, which is a separate
      idea. A per-test report: `renderSummaryReport.ts`'s `testSection` and `capabilitySection`
      already emit per-test min/mean/max and Cp/Cpk/Pp/Ppk, so a one-test report is mostly a
      filter over existing output — revisit if someone actually asks.
      **Discoverability, and how not to fix it.** The affordance today is a trailing clause in
      each panel's subtitle plus a cursor change and an appended `<em>click to open this
      wafer</em>` on the hover tooltip. Making it louder on hover is the wrong instinct: this
      codebase already ran that experiment with the hover-only per-card toolbar icons and users
      did not find them. Fewer, consistent click meanings that hold across every panel is the fix.

## Workflow/report gaps

- [x] **Exportable lot-level report.** PNG export is per-chart only. `write_temp_html.rs`
      already exists for the guide's print flow — extend that pattern to bundle current charts
      + a stats table into one HTML/PDF for handoff (customer, management, lot disposition).
      Implemented 2026-07-10 as a new toolbar **Report…** button (shown once wafers are
      loaded, same visibility rule as Splits…). Major mid-implementation pivot: while
      researching a from-scratch design (tables + embedded chart-image PNGs), found that
      `@wafertools/wafermap/stats` (the currently-linked wmap 0.18.0) already ships a complete,
      unused, undocumented-in-tsmap `renderLotSummaryReportHtml` + `openHtmlReport` — a
      standalone-HTML lot report generator (per-wafer yield, bin breakdown, **ring/quadrant
      regional yield** — a bonus not in the original design, per-test min/mean/max, findings
      with severity badges) already routed through tsmap's own `platform.openReport` via the
      `setReportOpener` call every session already makes at startup (`main.ts:222`). Even the
      input shape matched for free: `buildLotStatsSummary`'s existing `items` (`main.ts`) are
      already `{label, wafer, dies}` per wafer — spread straight from `buildWaferMap`'s result —
      exactly what wmap's report wants, no conversion needed. Discussed with the user and
      pivoted to **wrap, not duplicate**: `src/reportHtml.ts`'s `buildLotReportHtml` calls
      wmap's function for the bundled yield/bins/regions/findings content, then appends two
      tsmap-specific sections wmap has no concept of — **Process Capability** (Cp/Cpk/Pp/Ppk,
      reusing `buildCapabilityData` from the capability panel work above) and **Splits** — as
      plain HTML strings using wmap's own `report-table`/`report-section` class names, so they
      inherit that document's stylesheet with zero new CSS (verified visually — the appended
      sections are indistinguishable in styling from wmap's native ones). `src/reportUI.ts` is
      a small picker modal (mirrors `showSplitsModal`'s structure) with just two checkboxes —
      Capability and Splits — since everything else comes bundled as one unit from wmap's
      function with no per-section toggle available without forking it (a deliberate v1 scope
      cut, not an oversight). Both checkboxes auto-disable when there's nothing to show (no
      limits set / no splits assigned), same pattern as `valueFindingsBtn`. Chart images
      (yield/bin/capability visuals) were explicitly cut from v1 given the reused report is
      tables-only — numbers are what actually gets read/acted on in a disposition doc; revisit
      later if wanted, either as a wmap addition or a tsmap-side capture. Also fixed a latent
      type-narrowing bug found along the way: `buildLotStatsSummary`'s explicit return-type
      annotation declared `items: ReturnType<typeof buildWaferMap>[]`, silently hiding the
      `label`/`statsSummary` fields the function actually returns (never caught before because
      nothing had needed `.label` off that type until the report builder did) — fixed by
      letting the return type infer instead of narrowing it by hand. Verified end-to-end with
      Playwright against `dev:web`: loaded the corner-lot fixture, assigned a split, generated
      the report, confirmed via screenshot that Capability and Splits render correctly
      alongside wmap's native sections in one consistently-styled document, and confirmed zero
      console errors. 11 new Vitest cases for the pure row/section-builder functions in
      `reportHtml.ts`; full suite green (208 tests); `tsc --noEmit` clean.
      Also relabeled/extended wmap's own Lot Summary metrics (edited `../wmap` directly under
      the link-dev workflow, uncommitted there — see WMAP_ISSUES.md's version-tracking table):
      "Mean yield" → "Mean wafer yield" (it was an unweighted per-wafer average, easily
      confused with a true total), plus new Total dies/Good dies/Bad dies/Partial dies/Total
      yield (die-count-weighted) — small-lot/characterization workflows need the exact good/bad
      part counts, not just a percentage.
      Follow-up fix 2026-07-10, found by the user testing a multi-file ("Add files") load: the
      report only showed the *first* loaded lot's identity (Lot/Product/Tester/Program) while
      silently pooling yield/bins/findings/capability across every loaded lot underneath — root
      cause was wmap's `analyzeWaferLot` deriving lot identity from the first wafer only,
      unverified against the rest (logged as wmap issue #30). Fixed by having tsmap check its
      own faceting (`buildFacetTable`) for whether Lot/Part type/Temperature/Test program vary
      across the loaded wafers *before* generating, and if so, partitioning into groups and
      generating one correctly-scoped `renderLotSummaryReportHtml` + Capability/Splits section
      per group, all spliced into one document (one shared stylesheet, a banner explaining the
      split, one open/print/PDF) rather than one call pooling everything —
      `reportSplitFacets`/`reportGroupsOf` in `main.ts`, `LotReportGroup`/multi-group assembly
      in `reportHtml.ts`. Deliberately a short curated identity-field list (not every splittable
      facet) so an incidental column can't fragment the report into dozens of sections — chosen
      with the user via AskUserQuestion (Lot, Part type, Temperature, Test program). The
      single-group path (the common case) is byte-identical to before this fix — verified by a
      dedicated test. Also caught and fixed in the same pass: the report title fell back to
      `currentFileName`, which isn't updated by the append flow and would have kept showing only
      the first file's name even for a correctly-split multi-group report — now uses an honest
      "N wafers, M groups" title whenever `groups.length > 1`. 3 new Vitest cases covering
      single-group passthrough, multi-group section assembly, and per-group section scoping;
      verified end-to-end with Playwright against a real two-lot merged load (13-wafer
      corner-lot + a separate 3-wafer synthetic lot) — confirmed fully independent per-group
      stats (2873 vs 663 dies, no cross-contamination) and zero console errors.
      **Superseded 2026-07-11**: this entire tsmap-side implementation (`src/reportHtml.ts`,
      `src/reportUI.ts`, and tsmap's own toolbar **Report…** button) was deleted as part of the
      wmap↔tsmap boundary rework — wmap's own Summary panel already had a fully-wired, always-
      visible **"Summary report"** button doing the identical thing, and the Capability/Splits
      sections tsmap used to splice on by hand are now native section builders inside wmap
      itself (`packages/stats/renderSummaryReport.ts`). tsmap no longer builds report HTML of
      any kind — report generation is now wmap's Summary panel button only, for both
      single-wafer and gallery views. Numeric parity (incl. the multi-group split fix above) was
      verified byte-identical before/after the move. See `WMAP_ISSUES.md` #29/#30.
- [ ] **Raw data export.** No path out of the app for selected test data besides re-parsing the
      original file. Even a simple "export selected tests as CSV" from the test selector would
      let users take data into Excel/JMP/Python.
      Note (2026-07-11): not the same as wmap's Insights/Summary panel "Export CSV" button —
      that exports per-test **summary statistics** (min/max/mean/median/stddev/spec-yield), not
      raw per-die values. This idea (raw die-level export) remains a distinct, unaddressed gap.
- [ ] **Annotation/notes on a wafer or lot.** Splits set a precedent for lightweight per-wafer
      metadata the user assigns and the app persists/restores. A free-text note field (e.g.
      "retested — probe card swap") using the same persistence pattern gives engineers a trail
      without a separate tracking system.

## Data ingestion (needs validated demand before scoping)

- [x] **Allow STDF + ATDF in the same load batch.** They're the same record model (ATDF is
      STDF's own text-readable rendering) — a mixed tester fleet emitting one format or the
      other for the same lot is a plausible real case. `checkSameExtension` (`lib.ts`) currently
      blocks mixing them, same as it blocks e.g. stdf+csv.
      Note (2026-08-16): checked the actual coupling before scoping. The second-pass parse loop
      in `handleFiles` (`main.ts`) already dispatches stdf vs atdf correctly per file inside its
      `for (const file of files)` loop — that half needs no work. The real blocker is the
      first-pass scan, `scanBinaryTests`, which picks ONE parser for the whole batch via a
      single shared `currentBinaryExt` flag (used both for the initial load's default scan and
      for "Filter tests…"'s rescan) — feeding it a mixed batch today would call the ATDF text
      parser on raw STDF bytes (or vice versa) and fail or misparse. Would need to become
      per-file, mirroring the second-pass loop, before `checkSameExtension` could actually be
      loosened for this pair. Discussed with the user 2026-08-16; not started.
      Done in v0.1.34 (2026-09-11): `checkSameExtension` now compares format families, so STDF and
      ATDF load together while either still refuses CSV/JSON/Parquet. See CHANGELOG 0.1.34.

- [x] **"Open from URL" — programmatic REST-pull ingestion.** ~~Today tsmap only ingests local
      files~~ Implemented 2026-08-15 as `--url <url> --url-format <stdf|atdf|csv|json|parquet>`
      (desktop) / `?dataUrl=&dataFormat=` (web query param) — a caller application (its own data
      selection UI, a script) hands tsmap a URL to fetch and load, no human retyping anything. On
      desktop the fetch happens entirely in Rust *before the window opens*, resolving to a real
      local temp file the frontend sees as an ordinary CLI file path — no IPC command, no
      mapping-overlay changes needed. Desktop also supports `--url-headers <file>` for
      header-authenticated data APIs (a `Header-Name: value`-per-line file, mirroring
      `--tests`/`--splits`, so the secret never sits on the command line). The original design
      doc's specific shape (an interactive "type a URL in" modal, JSON-only,
      `tauri-plugin-http`-vs-`reqwest` research) is superseded by what shipped, kept at
      [plans/open-from-url-ingestion.md](plans/open-from-url-ingestion.md) for its still-relevant
      research (the CORS/credential-exposure reasoning, the `tauri-plugin-http` rejection).
- [ ] **Multiple URLs per launch.** `--url`/`dataUrl` are singular today — one URL, one fetch, per
      launch. If a caller's data API can bundle a multi-lot selection into a single combined
      multi-wafer response for one URL, that's already fully supported (tsmap is multi-wafer-native
      per file/response already) — no work needed, and this is the currently-recommended
      integration shape (see the integration proposal doc shared 2026-08-15). But if a caller's
      selection UI naturally maps to *several separate* URLs (discrete per-lot endpoints, not one
      combinable call), there's no way to hand tsmap more than one today. Would need a
      `--url-list <file>`-style mechanism (and a web equivalent) mirroring how `--list` already
      works for local file paths, fetching N URLs and merging the results. Not started — no
      validated demand yet, logged here in case a caller's API can't be reshaped to the single
      combined-response pattern.
- [x] **`tsmap://` URL scheme / deep link.** ~~A registered custom protocol handler~~ Implemented
      2026-08-15 via `tauri-plugin-deep-link` — `tsmap://open?url=...&format=...`, so a web page
      can launch the desktop app directly (`<a href="tsmap://open?...">`) rather than requiring
      something already running as a process to invoke `tsmap --url ...`. On Linux/Windows the OS
      just relaunches tsmap with the whole URI as a plain argv entry (confirmed via direct
      `xdg-open` reproduction) — `cli_files.rs` recognizes a `tsmap://`-prefixed positional arg and
      parses it into the same `url`/`url_format` fields `--url`/`--url-format` set, so the entire
      existing single-instance-forwarding and `resolve_cli_url` path needed zero new code beyond
      that recognition. The app self-registers the scheme at every startup (mirrors the file
      associations feature's own "self-heal a dev/unpacked binary" approach). As expected, doesn't
      solve header-based auth on its own — a deep-link URL has nowhere safe to carry a credential,
      same constraint as a page URL — only presigned/self-authenticating URLs work cleanly through
      it. Complements the file associations feature (Help → File associations…, 2026-08-15) — a
      deep link launches from a URL a caller supplies, file associations launch from a local file
      the user already has.

## Smaller polish items

- [x] **Toolbar overflow.** Already busy (Open, Add, Charts, Filter tests, Splits, Value
      findings, Clear, theme picker, help). Watch whether it needs an overflow/"more" menu as
      more features land — re-check the z-index lesson (see CLAUDE.md "Stacking order") if any
      new overflow menu is itself an overlay.
      Note (2026-07-11): the **Charts** button no longer exists (tsmap's Charts page was removed
      — see the chart/analysis section above), and a short-lived toolbar **Report…** button was
      added and then also removed (report generation moved into wmap's own Summary panel).
      Current buttons: Open, Add, Recent, Filter tests, Splits, Value findings, Clear, theme
      picker, help. Net roughly the same count as originally described, but the immediate
      pressure that motivated this idea is lower now that Charts is gone. Still unimplemented.
      **Superseded 2026-08-09** — the "watch whether it needs" framing was already out of date
      when written: the bar *was* clipping. Measured on the web build, `scrollWidth` reached
      913px against a 900px viewport, and because the row had neither `flex-wrap` nor
      `overflow-x`, the theme picker and Help button were pushed past the right edge with no
      way to scroll to them — gone, not clipped. On desktop with Recent shown, that starts
      nearer 985px, i.e. an ordinary half-screen window. Fixed without a "more" menu, so the
      z-index caveat above never came into play: `#drop-hint` (decorative, 141px) drops out at
      ≤1100px and `#toolbar-title` at ≤700px, `#theme-select`/`#help-btn` are pinned
      `flex-shrink:0` so they're never the thing that yields, and `overflow-x:auto` is the hard
      floor below that. Deliberately *not* `flex-wrap`: a second toolbar row would resize
      `#map-container` and force wmap to re-lay-out the canvas. Verified reachable at 1100,
      900, 780 and 640px. A real overflow menu is still the answer if the button count grows
      again — this buys headroom, it doesn't remove the ceiling.
      Note (2026-08-16): the button list above was stale — **Filter tests** and **Splits** no
      longer exist as separate buttons (collapsed into the **Lot ▾** menu by the same
      toolbar-restructuring commit already noted elsewhere in this file), and the list predated
      **Filter files…** (the file-triage feature) entirely. Current buttons: Open files, Filter
      files…, Add files, Recent, Lot ▾, Value findings, Clear, theme picker, Help — a wash on
      net count (two buttons collapsed into one menu, one new button added).
      Note (2026-09-02): stale again — **Filter files…** has since been removed (it answered a
      different question from its neighbours; see CHANGELOG 0.1.33), and Open files/Add files
      each gained a caret half, so the row is now: Open files ▾, Add files ▾, Recent, Lot ▾,
      Value findings, Clear, theme picker, Help. Net width is roughly unchanged — one button
      gone, two narrow carets added — and the overflow defence was re-verified against this
      set the same way as the 2026-08-16 pass, in the widest (loaded) state where Lot ▾ and
      Clear are both visible: no overflow at 1100, 900, 780 or 640px (`toolbarScrollWidth`
      equalled `toolbarClientWidth` at each), with `help-btn` and the theme picker fully
      on-screen throughout.
      Method note, because the first attempt got it wrong: measure by resizing the **viewport**,
      not by setting `#toolbar`'s own width. The defence leans on media queries that hide
      `#drop-hint` (≤1100px) and `#toolbar-title` (≤700px), and those key off the viewport — so
      narrowing only the element leaves both still rendered and reports a phantom overflow
      (795px against a 780px toolbar) that does not happen to a real user. Re-verified the
      overflow defence itself against this current set, not just assumed it still held: no
      overflow at any of the same four breakpoints (1100/900/780/640px — `toolbarScrollWidth`
      never exceeded `toolbarClientWidth` at any of them), `help-btn`/`filter-files-btn` stay
      fully on-screen throughout. The fix still holds; only the button inventory needed updating.
- [ ] **Accessibility for canvas charts.** Charts are canvas-only with no text/table
      alternative. Not urgent for this audience but worth tracking.
      Note (2026-07-11): tsmap has no canvas chart code of its own left (moved into wmap's
      Insights tab). wmap has since made real accessibility investments elsewhere — keyboard-
      navigable toolbar/menu roles (`role="menu"`, arrow/Home/End/Enter/Escape), a 63-entry
      colourblind-safe "Accessible" colour scheme — but no text/table alternative for the chart
      canvases themselves exists yet. If pursued, this is now a wmap-side idea, not tsmap's.

## Demo/investigation-scenario system

A deterministic, scripted investigation of a deliberately-designed dataset, driven against
the *real* app rather than staged. Built 2026-08:

- `scripts/lib/` (server/browser/inject/steps — extracted from `capture-screenshots.mjs`,
  which now shares it rather than duplicating it)
- `scripts/generate_edge_corner_lot.py` (a 12-wafer lot with a real, verified process-corner
  defect — one corner's `fmax_MHz` fails concentrated at the wafer edge, 73% edge-die fail
  rate vs 5.8% non-edge, not staged — plus a 190-file decoy haystack, both gitignored,
  `npm run demo:data`)
- `scripts/run-scenario.mjs` + `scripts/scenarios/edge-corner-lot.mjs` (7 beats: haystack →
  filter → open → inspect → group-by-split → the worst-capability test syncs the other
  panels to it → drill into the bad corner, the opened wafer lands pre-selected on that
  exact test, ring pattern visible — `npm run demo:test`, or `HEADED=1
  CHROME_PATH=/usr/bin/google-chrome npm run demo:test` to watch it run in a real window)

Required adding `data-wmap-*` hooks to wmap's Insights DOM (WMAP_ISSUES.md #36). `scripts/scenarios/README.md`
is the technical reference (full step catalog, beat/check shape, how to extend it).
Authoring workflow: each scenario is a hand-written `<name>.md` (prose — "select this, click
this…") plus a generated `<name>.mjs` — see `scripts/scenarios/edge-corner-lot.md` for the worked
template. Multiple demos are meant to coexist as separate `.md`/`.mjs` pairs.

**CI wiring was considered, then deliberately deferred, not blocked** — wiring an unattended
scenario into automation after exactly one clean run is premature regardless of workflow.
Revisit only if/when the scenario has survived enough real use to be worth trusting
unattended.

A further idea building on this scenario (turning it into a produced video, with narration
and a visible-cursor replay) is tracked outside this repo — see this repo's `CLAUDE.md`.

## Editing bin definitions in the app

- [ ] **A bin editor, to match the test editor.** Considered 2026-09-10 and deliberately not
      done. Recorded so the asymmetry is a decision rather than an oversight.

      **The asymmetry.** After the 0.1.34 consolidation, `Setup ▾` offers **Tests…** (choose
      which are imported, rename, set limits/units/type, save and load) and **Bin definitions…**
      (save and load only). You cannot rename a bin or change a pass flag in the app; you edit a
      CSV outside and load it.

      **Why it was left alone.** Symmetry is not a user need, and the two are not symmetric in
      practice. Test names, limits and types get adjusted ad hoc, per engineer, per
      investigation — which is what earns in-app editing. Bin definitions are usually an
      *organisational* standard: they come from the test program or the MES, and a site wants
      them identical for everyone. A file is the right source of truth for that, and "load the
      standard bin definitions CSV" is arguably the behaviour to encourage rather than design
      around.

      **The part that would need real care if it is built.** Bin definitions carry **which hard
      bins count as pass**. Editing that re-computes every yield figure in the session — the
      lot summary, every finding, every report. That is not an inline table edit: it wants to be
      explicit, confirmed and logged, in the same way the app already treats other things that
      move a yield number. A bin *name* is cosmetic; a pass flag is not, and an editor that
      treats them as two columns of the same table invites the mistake.

      **If demand appears**, the evidence to look for is people hand-editing CSVs repeatedly for
      one-off corrections rather than maintaining a shared standard file — that would mean the
      file-as-source-of-truth assumption above is wrong for how they actually work.

## File System Access API — persistent file handles on the web

- [ ] **Re-read a remembered file in the browser build, via `FileSystemFileHandle`.**
      Investigated 2026-09-10, not started. Worth revisiting; not obviously worth doing.

      **The problem it would solve.** The browser's ordinary file picker hands the page a
      file's *contents* and never its location, which is why `recentFiles.ts` is desktop-only
      and why `recentDefinitions.ts` stores content rather than a path. For definitions files
      that is mostly fine — they are kilobytes, so caching the content works — except that a
      cached copy cannot be checked against the file it came from. A test-definitions file can
      set **spec limits**, and reapplying a superseded copy produces capability figures and
      out-of-spec marks that look entirely normal and are wrong. 0.1.34 mitigates that with
      framing (a header on the recents menu, dated rows, and a warning-level log naming the
      file when it sets limits) — a compromise, not a fix.

      **The mechanism.** `window.showOpenFilePicker()` returns a `FileSystemFileHandle`, which
      is structured-cloneable and so can be stored in IndexedDB and retrieved in a later
      session. `queryPermission`/`requestPermission` re-grant access in one click — no
      re-navigating the file system — and `handle.getFile()` then reads the file *as it is
      now*. That would let the browser do exactly what the desktop already does: re-read,
      compare, and report that the file has changed. It would **retire the caveat rather than
      restate it**, and would also make a browser Recent-*files* list possible for the first
      time.

      **Two catches specific to us, which are why this is not already scoped:**

      1. **It needs a secure context** — HTTPS or localhost. The self-hosted intranet bundle
         shipped in 0.1.34 explicitly documents plain `http://` as fine, and it is for
         everything tsmap does today. So the deployment aimed at the audience *least* able to
         run the desktop app is also where this API is *least* likely to be available, unless
         those sites serve over HTTPS. It degrades to the current behaviour rather than
         failing, but it cannot be relied on for the people who would benefit most.
      2. **Browser support is Chromium-only** — Chrome, Edge, Opera. Firefox does not have it;
         Safari's support does not extend to persistent handles for user-visible files. Fine
         for a fab standardised on Chrome or Edge, not a general answer.

      Together those produce a **three-way behaviour matrix**: desktop (path, always fresh),
      web-with-handles (fresh after a permission click), web-fallback (cached copy, today).
      That runs against this repo's own "prefer a single-dimension mechanism over a
      combinatorial one", and the third branch still needs every piece of caveat plumbing that
      exists now. That trade — not the difficulty — is the reason to think before building.

      **If it is picked up, the honest scoping:**

      - Do **definitions files first**, not data files. Smaller blast radius, and it retires an
        existing compromise instead of adding a new capability.
      - Keep the cached copy as the fallback so behaviour degrades rather than disappears.
      - Gate on `'showOpenFilePicker' in window`, which covers browser support and secure
        context in one check.
      - Raw IndexedDB rather than `idb-keyval`: one key-value pair does not justify a runtime
        dependency in a project that has kept them minimal.
      - `showOpenFilePicker` must be called synchronously from a user gesture — the same
        constraint `main.ts` already documents for the current `<input type="file">` path, so
        it fits the existing shape.
      - Verify current browser support at the time rather than trusting this note; this area
        has moved and may move again (Safari in particular).

## One "open" dialog — tsmap's own home for opening, scanning and filtering

- [ ] **Make the file filter the place every open starts, alongside the system chooser.**
      Discussed 2026-09-11, not started; aimed at a future release, not the current one.

      **The idea.** Today there are three entry points that each open the system
      chooser — Open files, Add files, Scan a folder — and the file filter only appears
      after the fact. Instead, one tsmap dialog would open first and behave much like a
      standard chooser: recent folders and files, browsing into folders, and a choice between
      loading what is picked directly and scanning it into the filter table first. The kind
      buttons, format families and blank-column hiding added to the filter on 2026-09-11 are
      already most of the "what's in here" half.

      **Complement the system chooser, don't replace it.** The OS dialog brings favourites,
      search, network and cloud drives, drive letters, OS-level recents and its own
      accessibility — all expensive to rebuild well, and a navigator missing any of them feels
      worse than the one people already know. So: our dialog as the home screen, with a
      **Browse…** button that still opens the system chooser.

      **Per platform:**

      - **Desktop.** Cheap: `list_dir_files` already lists folders from Rust, so a breadcrumb
        path plus subfolder list is mostly UI. Recent *folders* would join the existing recent
        files (`recentFiles.ts`), with paths stored as today.
      - **Web.** The only way the browser keeps a location between sessions is a stored
        `FileSystemDirectoryHandle` / `FileSystemFileHandle` — the mechanism, and its two
        catches (secure context; Chromium only), are written up in the File System Access API
        section above rather than restated here. This dialog would be that investigation's
        most visible payoff: a web Recent-folders list that reopens with one permission click.
        Elsewhere it falls back to the ordinary file input, as now.

      **Before scoping:** it multiplies that section's three-way behaviour matrix across more
      of the UI, so settle that trade first; decide whether "load directly" and "scan first"
      are one flow with a choice or two buttons; and follow UI_STANDARDS.md for the navigator
      (keyboard navigation of the folder list, focus handling when moving into a folder).

## Settings layering — one precedence model, and a site-defaults file

- [ ] **Decide which layer wins before adding another settings channel.**
      Discussed 2026-09-18, not started. Prompted by the custom colour scheme request
      (`WMAP_ISSUES.md` #60), which cannot be specified without this.

      **The problem, stated once.** tsmap has three settings surfaces that already overlap
      and nothing relates them:

      | Surface | Where | Size |
      | --- | --- | --- |
      | Saved preferences | `storageKeys.ts` `STORED_ITEMS` | 9 items, registry exists |
      | Definitions files (CSV) | tests, splits, bin defs — `Load definitions ▾` | 3 types |
      | CLI flags | `src-tauri/src/cli_files.rs` `VALUE_FLAGS` | 7, growing, no registry |

      `--edge-exclusion` and `tsmap:edge-exclusion-mm` set the same value; `--tests` loads the
      file the dialog loads. The CLI list is accumulating one flag at a time with nothing
      enumerating it — the drift `storageKeys.ts`'s own header comment was written to stop,
      recurring one layer up.

      **There is already a layering bug from this.** `main.ts` (the `cli-open-files` handler)
      calls `setWaferGeometry(normalized)` on CLI args, and those setters write straight to
      localStorage (`waferGeometry.ts`). So `tsmap --wafer-diameter 300 lot.stdf`
      **permanently rewrites the user's saved diameter**, not just this session's. A one-shot
      invocation flag mutating persistent state is invisible until someone's pinned geometry
      changes because they pasted a command line a colleague sent them.

      **The model.** Layers, lowest wins to highest:

      ```text
      built-in defaults → site file → user's saved prefs → CLI flags → in-session UI change
      ```

      One rule fixes the bug above and most of its future siblings: **a layer writes only to
      its own level.** CLI flags apply for the session and never touch storage. A UI change
      writes user prefs. "Reset my settings" clears user prefs and falls back to the *site
      file*, not to built-ins — which is what makes site defaults worth having at all.

      **The site-defaults file.** The point is a fab standardising across users: one file
      giving the house palette, geometry, and data endpoints, read at startup with no user
      action. That is a distribution problem, not a preference one — a file each user loads
      through a dialog is just a preference with extra steps. Desktop: a path convention
      (plus a `--settings` flag for testing). Web/PWA: no filesystem, so a fetched URL or a
      build-time bake — which is why the format must be **JSON**, not CSV.

      **Keep the CSV line clean.** The three definitions files are CSV on purpose: tabular,
      edited in Excel, and about *this lot's data*. Settings are nested, rarely hand-edited,
      and about *how tsmap behaves* whatever is loaded. Don't stretch CSV over the second
      kind. Colour schemes belong on the settings side despite arriving via a "file you load",
      because a palette is a named object with two lists, not a table of rows.

      **What earns a place in the file.** Unbounded "sections for current and future
      overrides" becomes a dumping ground. Gate it: **a setting belongs only if a site would
      plausibly standardise it across users.** Colour schemes, wafer geometry, URL endpoints —
      yes. Last file filter, recent files, window state — no, personal, localStorage only.
      `STORED_ITEMS` already carries `scope` (`both`/`desktop`); this is a second axis of the
      same idea and is probably one more field on those entries rather than a parallel list.

      **Order to build:**

      1. Write the model down (header comment in a new `settings.ts`, or a short doc). No code.
      2. Fix the CLI-writes-to-storage bug — small, real, and it validates the model.
      3. Build #60's colour scheme loading as the first citizen, single-section.
      4. Add the site-defaults layer once two or three settings are worth shipping to a site.

      **Before scoping:** settle precedence against the *per-lot* definitions files too — a
      site palette, a user's saved selection and a bin defs file's `BinDef.color` all colour
      the same die, and an unstated order there is the control-disagrees-with-display class of
      bug `WMAP_ISSUES.md` #52 was about. Decide also whether a site can mark a setting
      non-overridable, since that changes the file's shape and is hard to add later.

## The web build crashes above ~200k dies — the `postMessage` clone (measured 2026-09-19)

- [ ] **A 341 MB / 266k-die STDF crashes the browser tab.** The desktop app is **not**
      affected — Tauri calls the parser natively, with no worker and no clone. Full evidence,
      design options and open questions: **[`COLUMNAR_DATA.md`](COLUMNAR_DATA.md)**, with the
      wmap-side history in [`WMAP_ISSUES.md`](WMAP_ISSUES.md) #10.

      **Cause: two full copies live at once.** The web build parses in a Worker and posts the
      result to the main thread, which structured-clones the whole graph. The limit is total
      heap across both copies — one copy must stay under roughly 2 GB. Measured in real Chrome
      (default heap):

      | case | worker path (the app) | main thread (for contrast) |
      | --- | --- | --- |
      | 50k dies × 50 tests | OK, 1657 ms (clone 303 ms) | OK, 267 MB |
      | 200k × 50 | OK, 6313 ms (clone 934 ms) | OK, 1005 MB |
      | 200k × 100 | OK, 13619 ms (clone 1390 ms) | OK, 1447 MB |
      | 400k × 50 | **TAB CRASHED** | OK, 2012 MB |
      | 266k × 51 (341 MB STDF) | **TAB CRASHED** (reproduced) | OK, 3213 MB, 12.9 s |

      Per-die heap is ~5 KB (CSV, 50 tests), ~7 KB (100 tests), **~12 KB for STDF** — the only
      case carrying functional-test verdicts, so a second map per die. So a 25-wafer × 10k-die
      STDF sweep does not open in the browser, while a 200k-die lot does in 6–14 s.

      **Building die objects is not the problem, and nor is wmap** — on one thread, 400k dies
      and the 266k STDF both complete, and `buildWaferMap` adds only ~60 MB for 266k dies.

      **The cheap mitigations were tried and measured; none work** (`COLUMNAR_DATA.md` §3d).
      Per-wafer streaming with backpressure still crashes both lots. The transfer is not the
      constraint — streaming 400k dies and *discarding* on the main thread peaks at 105 MB, and
      the worker parses either lot alone. Nor does building maps per wafer and dropping the raw
      dies help: `Die` retains the caller's `testValues` **by reference**, so the bulk of the
      memory cannot be freed while the maps live. The binding term is the representation —
      ~5 KB/die as objects vs ~0.3 KB/die as typed arrays — which makes **columnar the fix**,
      as one cross-repo project (columnar output is worthless while `buildWaferMap`
      materialises `Die` objects).

      **What helps users today, and needs no architecture:** find the usable threshold and show
      a clear message above it instead of a dead tab.

      **Die/wafer subsetting is not an acceptable fix** (decided 2026-09-19): a user asking for
      a lot expects the lot.

      **Also worth doing regardless:** find where the STDF threshold sits below 266k, so there
      is an honest answer for users about how large a lot the web app can open.

## ~~One busy/progress system — the load chrome is currently three surfaces with no owner~~ (2026-09-19; **done 2026-09-20**)

**User's verdict, verbatim:** *"having a tiny busy circle in the top bar with equally tiny text is
unnoticeable, and it seems strange that in some parts of the load it mirrors what the progress bar
says, though not in sync. In brief the whole busy chrome is a mess."* And: *"tsmap should have one
busy system and chrome. That needs fixing either now or later but it shouldn't be forgotten."*

**Not a cosmetic complaint — the surfaces genuinely disagree.** Loading a lot currently drives
three independent indicators, and no single thing owns "is the app busy, and with what":

| surface | driven by | what's wrong with it |
| --- | --- | --- |
| topbar spinner + `#file-label` | `setBusy` / `setIdle` | tiny, easy to miss, and `#file-label` is `display:none` below 900px — so on a narrow window it conveys nothing at all |
| covering overlay in `#map-container` | `showRenderProgress(msg, done, total)` | only used for the analysis phase |
| docked strip in `#map-container` | `showRenderProgress(…, 'staging')` | added 2026-09-19 for the progressive gallery mount — a THIRD message, and with no bar |

They fall out of sync structurally, not by accident: `renderWafers` calls `setBusy(…)`, then the
analysis block inside `renderWaferView` calls `setIdle(priorLabel)` **before the gallery mounts**,
so the app declares itself idle while 50 cards are still rendering — measured: the spinner reads
`idle` for the whole mount while the docked strip says "Rendering 50 wafers…". Two surfaces, two
different claims, at the same moment.

The staging strip also has **no progress bar**, only static text, because the gallery reports
completion (`onItemsResolved`) and not per-card advance. That is the wrong way round: a static
"Rendering 50 wafers…" for 10+ seconds is exactly the kind of indicator that reads as a hang.

**Shape of the fix — one owner, one surface, phases:**

```
beginLoad()                          → one indicator appears, in the map container
  phase('Parsing sweep-…')           → covering: nothing behind it yet
  phase('Analysing wafers', 32, 50)  → covering, with the real count
  phase('Rendering wafers', 12, 50)  → docks to a strip once cards exist, with a REAL bar
endLoad()                            → indicator goes; topbar carries the file identity only
```

- **One function decides the visual form** (covering vs docked) from the phase, so no call site can
  pick wrong — the covering/docked distinction matters because a covering overlay hid the staging
  cards completely when it was reused for the mount phase (see `CLAUDE_HANDOFF.md` §7).
- **The topbar stops carrying progress** and keeps only the file identity. This also closes the
  sub-900px invisibility noted in `CLAUDE_HANDOFF.md` §8: progress no longer lives in a hidden
  element. `setBusy`/`setIdle` keep only their button-disabling job.
- **One "am I busy" flag**, set at `beginLoad` and cleared at `endLoad`, rather than `setIdle`
  firing mid-load from inside a sub-phase.

**Needs one small additive wmap change to be done properly:** a per-item progress callback on
`renderWaferGallery` so the Rendering phase can show a real bar — the gallery knows exactly how
many factories have resolved. Logged as `WMAP_ISSUES.md` #63.

**Do not "fix" this by adding another indicator.** That is how it got to three.

---

**[DONE 2026-09-20]** Built as designed above. `src/main.ts` now has one flag, one surface and
named phases (`LoadPhase`: waiting / reading / parsing / analysing / rendering / finishing).

- **`loadPhase(phase, msg, done, total)` begins a load if none is running; only `endLoad()` ends
  one.** That is the structural fix, not a tidier version of the old one: the analysis block used
  to call `setIdle` before the gallery mounted, and now no sub-phase has the vocabulary to end a
  load at all.
- **`indicatorForm(phase)` is the single decision point** for covering vs docked. The phase
  proposes and an already-mounted view vetoes — covering a gallery the user is still looking at
  (an "add more files" load, a native picker that may be cancelled) would blank the app for work
  that has not replaced anything yet.
- **The topbar spinner is gone** and `#file-label` carries the file identity only. That deleted
  the `prevLabel` save-and-restore that was threaded through six functions purely because the
  busy message used to overwrite the label; `setBusy`/`setIdle` are replaced by
  `setControlsBusy`, which only disables buttons.
- **The docked strip shows a real bar**, fed by wmap's new `onItemResolved` (`WMAP_ISSUES.md`
  #63). The span between the last card and the settled panel became a named `finishing` phase of
  the same indicator — **not** a fourth surface.

Verified end to end in real Chrome against the running web build by
`scripts/verify-load-chrome.mjs`, which asserts the bounding **rect** of every frame (the failure
mode here is an indicator that exists and is off screen, not one that is missing) and that
exactly one indicator exists at any moment. Observed sequence on 50 wafers x 500 dies:

```
cover   Reading → Parsing → Analysing 0..49 of 50      bar 0 → 98%
docked  Rendering 0..47 of 50                          bar 0 → 94%, pinned to viewport bottom
docked  Finishing lot summary
[gone]  topbar: "sweep-25000.csv — 50 wafers, 25000 dies"
```

**[CORRECTED same day, after user testing]** The first version of this shipped with four
defects, all of which the user found in minutes and none of which the first harness could see,
because it drove one path (a progressive CSV load via `setInputFiles`) and both of the visible
bugs lived in the other:

1. **A late gallery callback began a phantom load.** A lot below
   `GALLERY_PROGRESSIVE_DIE_THRESHOLD` mounts pre-built, so wmap's `onItemResolved` fires a task
   *after* `endLoad`. `loadPhase` starts a load when none is running — correct for the
   sequential flow, wrong for a callback — so "Finishing lot summary" opened a load nothing
   would ever close: the indicator stuck on that message forever and every toolbar button
   stayed disabled. **This is what "Load sample data" does**, i.e. the first thing a new user
   clicks. Fixed with `loadPhaseIfActive`, which callbacks use instead.
2. **`showLoadingState` was a FOURTH surface** — not in the table above, which is why unifying
   the three that *were* listed left it behind. It wrote its own "Loading x.stdf…" and, via
   `innerHTML = ''`, destroyed the real indicator on the way past. Now `clearViewForLoad`,
   which clears the view and re-asserts the live phase.
3. **Two owners for the Add buttons** — the loaded-state path set `addBtn.disabled` from wafer
   count alone, mid-load, re-enabling it while the gallery was still rendering.
4. **`busy = false` written by hand in both picker paths**, to get past `handleFiles`' own
   re-entrancy guard. That desynchronised the flag `setControlsBusy` owns: for the rest of
   every picker-initiated load the toolbar disagreed with the load AND every `if (busy)` guard
   in the app was open, so a second load could start on top of the first. `handleFiles` now
   takes an explicit `continuesCurrentLoad` instead of faking its own precondition. `busy` has
   one writer again.

Also corrected: `renderWafers` announced "Rendering …" and then went *back* to "Analysing
wafers — 9 of 13", so the one indicator contradicted itself a beat later. It says "Loading …"
now and lets the phases that follow narrate.

**The harness is the durable fix.** `scripts/verify-load-chrome.mjs` now runs BOTH paths
(pre-built sample, progressive CSV), drives the CSV one through the real button and filechooser
so the `waiting` phase is exercised, and counts busy surfaces by scanning every visible leaf in
the DOM rather than counting `#render-progress` by id — counting the element you already know
about is precisely how a fourth surface survives a review. It asserts the end state directly:
no indicator, all four buttons enabled, cards mounted, identity in the topbar.

**[CORRECTED again, after the user exercised both the Tauri and web builds]** The busy system
held — no failures across many loads and adds — but it still *looked* like several systems,
which was the original complaint. Reported as "different busy message formats and locations…
a central progress bar and its dynamic label, a static central label, and a static label in the
bottom bar which is hardly noticeable".

It was one element throughout (the harness reports `surfaces=1` on every frame). It presented as
three, and moved between them mid-load:

- **The form was keyed on the PHASE NAME**, with `rendering`/`finishing`/`waiting` docked
  unconditionally — and `renderWafers` enters the rendering phase *before* any card exists. So a
  single load went centre (Parsing) → bottom (Loading) → centre (Analysing) → bottom (cards).
  Now keyed on the one question that matters — is there content behind it? — so it changes at
  most once per load, at the moment cards actually appear.
- **The bar was hidden for indeterminate phases**, so the same indicator appeared as a message
  with a bar and then as a bare label. It is always present now and sweeps when the end is not
  countable (`prefers-reduced-motion` gets a static dimmed bar instead).
- **The docked form was styled as a lesser thing** — 13px, no bar. Same message weight and same
  bar as the centred form now; it is the same component, just out of the way of live content.
  The sub-line remains its only difference, having nowhere to go in a one-line strip.

Both properties are now asserted by the harness: **at most one centre↔docked transition per
load**, and the bar visible on every frame. Verified traces: the sample load stays centred
throughout (zero transitions); the CSV load transitions exactly once, with `cards=1` still
centred and `cards=3` docked.

**[CORRECTED again — the re-render path]** User report: *"after disabling 'show test value
findings' the 'Finishing lot summary' busy message and bar never stop"*. The phantom load from
the opposite direction, and the one the earlier fix did not cover.

`toggleValueFindings` did `loadPhase(…)` → rAF → **`void renderWaferView(...)`** (not awaited)
→ `endLoad(...)` immediately. The load ended while the render was still starting; the render's
own analysis progress then called plain `loadPhase('analysing', …)`, which **begins** a load —
and that second load had no owner left to end it.

Two fixes, and the second is the one that matters:

- **`renderWaferView`'s phases can no longer begin a load** (`loadPhaseIfActive`). It is never
  an entry point — it always runs inside a load its caller opened. This closes the class,
  including `refreshCurrentView` (theme change), which called it with no load open at all.
- **Four copies became one.** The identical `loadPhase → void renderWaferView → endLoad` block
  appeared at four call sites — findings toggle, wafer geometry, bin definitions, splits — so
  all four carried this bug. They now share `rerenderCurrentLot(verb)`, which awaits the render
  before ending the load. Fixing only the reported one would have left three.

Guarded by a third harness scenario, `toggle`, which loads the sample lot, waits for it to
settle, then drives the real menu row.

**[ENTRY-POINT SWEEP]** The load system was verified against one path when it shipped, and the
user found two bugs in the other within minutes. The sweep closed that: `verify-load-chrome.mjs`
now covers **seven** scenarios — pre-built sample, progressive CSV, re-render (settings toggle),
append, drag-and-drop, cancel-at-mapping and cancel-at-selector. It found two more real defects:

- **Two user gates announced nothing.** `showRenameOverlay` and `showAppendConfirm` left the
  indicator claiming "Parsing x.csv…" while the app was actually blocked on a dialog. Every
  other gate in the file announces `waiting`; these did not. You would never report this as a
  bug — the modal sits over the indicator — which is exactly why a harness had to find it.
- **The indicator covered live content for a frame**, at "Rendering N wafers — 0 of N". Two
  layers to this, and the first fix was wrong. `indicatorForm()` read `mainViewController`,
  which is assigned only after `renderWaferGallery(...)` RETURNS while cards mount inside that
  call — so it lagged the screen. Asking the DOM instead fixed the *decision* but not the
  *staleness*: the form was still computed only on a phase update, while content appears
  continuously. `trackIndicatorForm()` re-asks each frame while a load is open.
  **Being right at one instant is not the same as being right throughout.**

Two of the sweep's failures were the harness, not the app, and both were the same mistake —
asserting a proxy instead of the property. "Add files is enabled at the end" is false for a
cancel that loaded nothing; "at most one centre↔docked transition" forbade an append's three
honest states (docked over the old gallery → covering while it is torn down → docked as new
cards arrive). The assertion is now the invariant itself: **the form must match whether there is
content behind the indicator**, which passes append and still catches the original bug.

`mainViewController` for "is something on screen", and a transition count for "does the form
match the view" — the same proxy-for-reality error twice in one hour, once in the app and once
in its test.

559 tests pass, `npx tsc --noEmit` clean, style scales clean, **all seven scenarios pass**.

## Prioritization (if picking three to start)

1. Cpk/Ppk — closes the biggest functional gap for the target audience. **Done** 2026-07-10
   (later migrated into wmap, 2026-07-11 — see above).
2. Parametric worst-offenders ranking — speeds up the most common workflow (finding *which*
   test is the problem). **Done**, folded into Cpk/Ppk above (same migration).
3. Recent-files list — cheap, removes daily friction. **Done** 2026-07-09.

All three original picks have shipped — revisit this list next time priorities are discussed.

Open at 2026-09-10, in rough order of value: remembering the **test selection per test
program** (the natural next step after the definitions-file recents, and the same
workflow one step further), **window size and position on desktop** (still 1000x700 every
launch, no `tauri-plugin-window-state`), and the File System Access API investigation
above — which is the only one of the three whose value is uncertain rather than merely
unbuilt.
