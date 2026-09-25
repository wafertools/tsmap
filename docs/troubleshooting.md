# Troubleshooting

**For:** anyone using tsmap, desktop or browser. Symptoms you can actually see, what causes
them, and how to confirm the fix worked.

Entries are grouped by where the problem shows up. If you don't know which group you're in,
the [log panel](user-guide.md#8-the-log-panel) is the fastest way to find out — it records
every load, every warning, and the reason for every refusal.

---

## Installation

### "Windows protected your PC", or "tsmap can't be opened because it is from an unidentified developer"

**Cause:** tsmap's installers are not code-signed. Windows SmartScreen and macOS Gatekeeper
both warn about unsigned applications. This reflects the absence of a paid signing
certificate, not anything detected in the app.

**Fix:**

- **Windows** — click **More info**, then **Run anyway**.
- **macOS** — after dragging tsmap to Applications, **right-click** the app and choose
  **Open**, then **Open** in the dialog. Once only.
- **Linux** — `.deb`/`.rpm`/`.AppImage` run normally; mark an AppImage executable first with
  `chmod +x tsmap-*-linux-x86_64.AppImage`.

**How to confirm:** the app launches and shows the empty-state toolbar. If you would rather
not install at all, the [browser version](https://wafertools.github.io/tsmap/app/) needs no
download and parses files entirely on your own machine.

### macOS says the app is "damaged and can't be opened"

**Cause:** macOS quarantines downloaded unsigned apps. On Apple Silicon this presents as
"damaged" rather than as the unidentified-developer dialog, which makes it look like a
corrupt download.

**Fix:** clear the quarantine flag:

```bash
xattr -dr com.apple.quarantine /Applications/tsmap.app
```

**How to confirm:** the app opens normally. Re-downloading does *not* help — the flag is
applied on every download, so a second copy behaves identically.

---

## Loading and parsing

### "Error: no files parsed successfully"

**Cause:** every file in the batch failed. The usual reasons are a truncated or non-STDF file
with an `.stdf` extension, an unsupported Parquet codec, or a CSV whose column mapping was
cancelled.

**Fix:** open the [log panel](user-guide.md#8-the-log-panel) — each file logs its own failure
reason separately. Load one file on its own to isolate it.

**How to confirm:** the failing file loads alone, or its log line names a specific parse error
rather than a generic failure.

### A Parquet file opens on the desktop but fails in the browser

**Cause:** Parquet's `zstd` codec is desktop-only. Every other codec — `snappy`, `gzip`,
`lz4`, `brotli` — works in both.

**Fix:** re-encode with `snappy` (the usual default), or use the desktop app for that file.

**How to confirm:** a `snappy` copy of the same data opens in the browser.

### "Error: no files after extraction"

**Cause:** a `.zip` was opened but contained no file tsmap recognises — often because the
archive holds a nested folder of archives, or only unrelated files.

**Fix:** extract the archive yourself and open the data files directly.

**How to confirm:** the extracted files appear in the file picker and load individually.

### Some dies are missing from the map, but the file loaded fine

**Cause:** those rows have no reported position. tsmap keeps coordinate-less dies rather than
dropping them — they still count towards bin totals and yield — but they cannot be placed on
the map. A file can be "mixed", with some positioned wafers and some not.

**Fix:** nothing, if the data really has no coordinates. For CSV/JSON/Parquet, check that the
X and Y roles were mapped to the right columns in the
[column-mapping overlay](user-guide.md#3-column-mapping-csv-json-and-parquet) — leaving both
unassigned treats the whole file as coordinate-less.

**How to confirm:** see
[Dies with no reported position](user-guide.md#51-dies-with-no-reported-position) for how the
count is reported. Assigning only one of X/Y is refused outright, so a half-mapped file cannot
be the cause.

### A test I need is missing from the test selector

**Cause:** for a multi-file batch, test definitions are scanned from the **largest file only**
by default — fast and representative, but a test that appears only in a smaller file will not
be listed.

**Fix:** click **Scan all N files** in the selector to re-scan every file and merge the full
definitions. Your current selection is preserved.

**How to confirm:** the test appears in the list. After load, the same toggle is available via
**Setup ▾ → Tests…**.

### A file has multiple-result parametric records (MPR)

**Cause:** the log shows *"N multiple-result parametric test record(s) (MPR) are not read; those
tests are not shown."* MPR records hold several results for one test at once (a pin group, a
sweep). tsmap does not read them yet, so those tests are missing from the test selector, the map
and every chart. Everything else in the file — bins, positions, PTR and FTR tests — is read as
usual, and yield is unaffected.

**Fix:** none within tsmap for now. If you need these tests, say so on the
[issue tracker](https://github.com/wafertools/tsmap/issues) — it tells us which testers and
test programs to support first.

**How to confirm:** the message names the count; a file without MPR records never shows it.

### "Test name scan failed — parsing all tests"

**Cause:** the pre-parse scan that collects test names could not read them, so tsmap fell back
to importing everything rather than silently importing nothing.

**Fix:** usually none needed — the load continues. If the file is large, expect it to be slow,
and use **Setup ▾ → Tests…** afterwards to narrow the selection.

**How to confirm:** the load completes and the tests are present, though possibly with numbers
rather than names.

### The app runs out of memory, or the import is very slow

**Cause:** the footprint is roughly *selected tests × total die count*. The test selector's
footer estimates it and warns in amber at ~50 million die×test pairs and red at ~200 million,
asking you to confirm before a red import starts.

**Fix:** select fewer tests. Bin and yield data is preserved regardless of the test selection,
so a bin map remains fully usable with **no** tests selected at all.

**How to confirm:** the footer estimate drops out of the red band. You can widen the selection
later with **Setup ▾ → Tests…** without reloading from scratch.

---

## Definitions files

### "Test definitions file contained no valid rows" / "Bin definitions file contained no valid rows"

**Cause:** the file parsed, but no row matched the expected shape — usually a missing header
row or the wrong column names.

**Fix:** use **Save** first to write an example file from the currently loaded data, then edit
that. The format is documented in
[Definitions file formats](user-guide.md#13-definitions-file-formats).

**How to confirm:** loading reports `Test definitions loaded: N matched`.

### Definitions loaded, but some were "not applied"

**Cause:** the loaded files disagree about what a test number measures. tsmap refuses to apply
one definition across files that contradict each other, rather than picking a winner and
silently mislabelling one file's data.

**Fix:** load the conflicting files separately, or correct the definitions so the test number
means the same thing in both.

**How to confirm:** the load message reports `N matched` with no refused entries.

### "Save or load hard/soft bin names… (no HBR/SBR record found in this file)"

**Cause:** the file carries no bin-definition records, so there are no names or pass/fail flags
to save.

**Fix:** load a bin-definitions file instead — see
[Bin definitions](user-guide.md#11-bin-definitions).

**How to confirm:** bin names appear in the legend and the summary panel in place of bare
numbers.

---

## Geometry

### "--edge-exclusion ignored: no wafer diameter is set"

**Cause:** edge exclusion is a distance in from the wafer edge, so it means nothing without a
diameter.

**Fix:** pass `--wafer-diameter` alongside it, or set one in **Setup ▾ → Diameter & edge
exclusion…** first.

**How to confirm:** the excluded ring is visible on the map and the yield denominator changes.

### The wafer looks the wrong size, or dies sit outside the circle

**Cause:** no diameter was supplied, so it was inferred from the coordinates. A die outside
the wafer is proof the *geometry* is wrong, not the die — the data is ground truth.

**Fix:** set the real diameter in **Setup ▾ → Diameter & edge exclusion…**.

**How to confirm:** every die sits inside the circle. See
[Wafer diameter and edge exclusion](user-guide.md#12-wafer-diameter-and-edge-exclusion).

---

## Yield and statistics

### Lot yield is shown, but spec yield is withheld for a test

**Cause:** the loaded files disagree about the pass/fail verdict for a bin they have both
seen. A bin's verdict is not a lot-wide property — it is whatever the file that produced those
dies said it was — so tsmap keeps each file's own pass bins rather than unioning them into a
figure that would combine two different conventions.

**Fix:** none needed; per-wafer yield remains correct. To get a single lot-wide figure, load
only files that agree, or supply a bin-definitions file that settles the verdict.

**How to confirm:** the log panel names the bin and the disagreeing files.

### "The loaded wafers have no test values to analyse" / "This file has no test data"

**Cause:** the load imported bin data only — either no tests were selected, or the file
contains none.

**Fix:** re-open the selector with **Setup ▾ → Tests…** and select at least one test.

**How to confirm:** the Insights tab's parametric panels populate. Bin and yield views work
without any tests selected and are unaffected.

---

## Opening data from a link

### "dataUrl and dataFormat query params must both be given together"

**Cause:** only one of the pair was supplied. tsmap will not guess a format from a URL.

**Fix:** supply both, e.g.
`?dataUrl=https://example.com/lot.json&dataFormat=json`.

**How to confirm:** the lot loads directly with no file picker.

### The link works on the desktop but fails in the browser

**Cause:** the browser build fetches the URL directly, so it is subject to the target server's
CORS policy. The desktop app fetches outside the browser, where CORS does not apply.

**Fix:** allow tsmap's origin on the data endpoint:

```
Access-Control-Allow-Origin: https://<tsmap-host>
```

A same-origin proxy avoids the cross-origin requirement entirely.

**How to confirm:** the browser's network panel shows the fetch succeeding rather than being
blocked. See
[Integrating data selection](integrating-data-selection.md#authentication-choose-an-architecture)
for the full set of architectures, including which ones avoid CORS.

### The data endpoint needs an API key or bearer token

**Cause:** the browser integration cannot accept arbitrary authentication headers through the
launch URL, by design.

**Fix:** use a short-lived self-authenticating URL, a same-origin gateway, or the desktop app's
`--url-headers`. Do **not** put a long-lived API key in a query string — URLs are retained in
browser history, logs, bookmarks, monitoring tools, and referrer data.

**How to confirm:** the request is authorised without any secret appearing in the URL. The
trade-offs are compared in
[Integrating data selection](integrating-data-selection.md#authentication-choose-an-architecture).

---

## Self-hosting the browser build

### The self-hosted app opens to a blank page

**Cause:** the server is not sending `.wasm` as `application/wasm`. The parser is WebAssembly,
and the browser refuses to compile it when the MIME type is wrong — most often
`text/plain` or `application/octet-stream`. Nothing on the page reports it; the console does.

**Fix:** add the MIME mapping. nginx, Apache and Python's `http.server` are already correct.
**IIS is not** — *Server → MIME Types → Add…*, extension `.wasm`, type `application/wasm`.

**How to confirm:** request the `.wasm` file directly and check the response header, e.g.
`curl -I http://your-server/tools/tsmap/assets/*.wasm | grep -i content-type`. It must say
`application/wasm`.

### Nothing loads when opening index.html directly

**Cause:** the bundle was opened from the filesystem (a `file://` URL). Browsers block module
scripts and web workers on that scheme.

**Fix:** serve the directory over `http://` or `https://` — any web server will do, including
`python3 -m http.server` for a quick check.

**How to confirm:** the address bar shows `http://` or `https://`, not `file://`. See
[Hosting tsmap on your own server](web.md#hosting-tsmap-on-your-own-server).

---

## Desktop-only features

### File associations are missing, or "File associations are not supported on web"

**Cause:** registering `.stdf`/`.atdf`/`.parquet` for double-click opening requires OS
integration the browser cannot provide.

**Fix:** use the desktop app — **Help → File associations…**.

**How to confirm:** double-clicking a data file opens tsmap. The full browser/desktop split is
tabulated in [Differences from the desktop app](web.md#differences-from-the-desktop-app).

---

## Further reading

- [User guide](user-guide.md) — the full interface reference.
- [tsmap in the browser](web.md) — browser requirements and platform differences.
- [Integrating data selection](integrating-data-selection.md) — launching tsmap from another
  application.
- For problems with the wafer map itself (rendering, coordinates, findings) rather than with
  tsmap around it, see wafermap's
  [troubleshooting page](https://wafertools.github.io/wafermap/troubleshooting/).
