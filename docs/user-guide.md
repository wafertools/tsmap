---
title: User Guide
---

<!-- RENDERER NOTE: this file is processed by two markdown engines.
     marked (scripts/build-user-guide.mjs) → in-app ? modal
     Python-Markdown/pymdownx (zensical)   → docs site
     Rules to avoid divergence:
     - Use 4-space-indented blocks for plain code examples, NOT fenced blocks.
       Fenced blocks require a language tag on the docs site but not in marked.
     - HTML mockup blocks (<div class="tsmap-mockup">) work in both renderers.
     - Test both after structural changes: npm run build:guide && npm run build:site
-->

# tsmap User Guide

tsmap loads semiconductor wafer map data from STDF, ATDF, CSV, JSON, and Parquet files and renders
interactive yield maps, parametric heat maps, and statistical charts. It runs as a native
desktop application on Linux, macOS, and Windows, and as a browser app at
[wafertools.github.io/tsmap/app/](https://wafertools.github.io/tsmap/app/).

This guide covers tsmap's own side of the workflow: opening files, column mapping, test
filtering, splits, and the command line. The wafer map itself, its toolbar, and every
Insights tab panel (yield, bin pareto, process capability, boxplot, histogram, correlation,
scatter) are a separate library, [wafermap](https://github.com/wafertools/wafermap), with its
own built-in guide covering all of that in full — open it any time via the toolbar's **?**
menu → **Wafer map reference** (enabled once a file is loaded). This guide doesn't repeat
that material.

## 1. Supported file formats

| Format | Extensions | Notes |
|--------|-----------|-------|
| STDF v4 | `.stdf`, `.std` | Binary; PTR (parametric) and FTR (functional) records; multi-wafer lots |
| ATDF | `.atdf`, `.atd` | ASCII equivalent of STDF; same data, same features |
| CSV | `.csv`, `.txt`, `.dat` | Tab, semicolon, and comma auto-detected; wide and long (pivot) formats |
| JSON | `.json` | Flat array of die objects or nested `[{ wafer, results: [{die}] }]` |
| Parquet | `.parquet` | Columnar, typed; wide and long (pivot) formats, same as CSV/JSON. `snappy`, `gzip`, `lz4`, and `brotli` compression on both desktop and web; `zstd` on desktop only |
| Gzip | `.gz` | Transparent decompression — e.g. `lot.stdf.gz` |
| Zip | `.zip` | All contained files extracted and loaded as a batch |

STDF and ATDF are always parsed natively — never attempt to open them in a text editor
or spreadsheet. CSV, JSON, and Parquet require a [column mapping step](#3-column-mapping-csv-json-and-parquet)
before the data is parsed.

---

## 2. Opening files

### Installing past security warnings

tsmap's installers are not code-signed, so your operating system may warn that the app is
from an unknown or unidentified developer the first time you run it. This is expected — it
reflects the absence of a paid signing certificate, not a problem with the app. The steps
below let you install anyway. If you would rather not install at all, the
[browser version](https://wafertools.github.io/tsmap/app/) runs with no download.

**Windows** — SmartScreen shows a blue "Windows protected your PC" dialog when you run
`tsmap-<version>-windows-x64.msi` (or the `-setup.exe` installer). Click **More info**, then
**Run anyway**. The warning fades as more people install the app.

**macOS** — Gatekeeper blocks the app with "tsmap can't be opened because it is from an
unidentified developer." After mounting the `.dmg`
(`tsmap-<version>-macos-apple-silicon.dmg` for M-series Macs, `-macos-intel.dmg` for Intel)
and dragging tsmap to Applications, **right-click** the app in Applications and choose
**Open**, then click **Open** in the dialog. You only need to do this once. If macOS instead
says the app is "damaged and can't be opened" — common on Apple Silicon for downloaded
unsigned apps — clear the quarantine flag in Terminal:

    xattr -dr com.apple.quarantine /Applications/tsmap.app

**Linux** — the `.deb`, `.rpm`, and `.AppImage` builds run normally; any warning is just a
browser download nag. For the AppImage, mark it executable first:

    chmod +x tsmap-*-linux-x86_64.AppImage
    ./tsmap-*-linux-x86_64.AppImage

![Empty-state toolbar — Open files, Filter files, Add files, Recent, theme picker, help](images/empty-toolbar.png)

The **colour theme** picker sits at the right end of the toolbar, next to the help button. Choose
Auto to follow your system's light/dark setting, or pick a theme explicitly — Light, Light green,
Solarized Light, High contrast, Dark, Nord, Solarized Dark. Your choice is remembered.

### Open files

Click **Open files** in the toolbar to open a file picker. You can select one file or
multiple files at once. On the desktop the picker opens a native OS dialog; in the browser
it opens the browser file dialog.

### Filter files

When you have far more files than you want to load — a directory of hundreds of lots, say —
**Filter files…** lets you narrow them down before anything is parsed. Pick the whole set,
and tsmap reads just the *header* metadata from each one: lot ID, part type, tester, job
name and whatever else the file carries, plus wafer count, earliest start, latest finish and
site count for STDF/ATDF. No die data is read, so scanning a large batch is quick.

![Filter files dialog — four scanned STDF files with their lot metadata as columns](images/file-filter.png)

The results appear in a table, one row per file, with a column for every metadata field
found across the batch (alongside Name, Size and Modified). From there you can:

- **Sort** by clicking a column heading — click again to reverse, a third time to clear.
  Size and Modified sort by their real value, not by how they're written.
- **Filter** a column by clicking the **▾** in its heading and ticking the values to keep.
  Right-clicking any cell opens the same popup pre-set to that cell's value — a quick way to
  say "just this lot". **Clear filters** in the toolbar resets every column at once.
- **Hide columns** you don't care about with **Columns ▾** — a batch can easily produce
  twenty-odd metadata columns. Hiding one only affects the display; if it has a filter set,
  that filter still applies (the picker marks it as filtered so you can tell).
- **Search** across all columns with the search box.
- **Select** rows by clicking them or their checkbox; **Select all**, **Select none** and
  **Invert** apply to the rows currently shown, so they respect the filter.

**Load selection…** replaces whatever is currently loaded with the files you've ticked;
**Add selection…** appends them instead. Both confirm first. The selected files then go
through the normal load flow — column mapping, test selector, wafer rename and so on — just
as if you had picked them directly.

**Save filter…** writes the current column filters and search text to a small JSON file, and
**Load filter…** reads one back, re-selecting every row that matches. That makes a recurring
selection ("this quarter's production lots") reusable across sessions and across different
batches of files. If a saved filter names a column these particular files don't have, that
column is ignored and the dialog says so, rather than quietly matching nothing.

If you pick more than five files through **Open files** or **Add files**, tsmap offers to
route them into this table first, so you don't have to pick them twice.

**Mixed formats are fine here.** Unlike **Open files**, you can scan a directory holding
STDF, CSV and Parquet together — reading metadata doesn't care about the format, and a
**Format** column appears so you can sort and filter by it. The one-format-per-load rule
still applies when you actually load, so narrow the selection to a single format first; the
dialog tells you if you haven't and stays open so you can adjust. Zip archives are expanded
and their contents scanned individually, and `.gz` files are read straight through.

### Loading sample data

The empty state has a **Load sample data** button that loads a bundled synthetic lot — 13
wafers across 5 process corners — through the normal load flow (test selector included), so
you can see tsmap working before opening your own files. Available on both desktop and
browser. Its process-corner [splits](#6-wafer-splits) apply automatically, so the loaded
lot is ready to explore with **Group by → Split** right away.

### Drag and drop

Drop one or more files anywhere in the window. This is equivalent to selecting them through
the file picker and is supported on both desktop and browser.

### Recent files

*Desktop only.* The **Recent** button lists the last 8 file sets you've opened, each showing
when it was last loaded (`Today 14:32`, `Yesterday 09:05`, or a date for older entries).
Click an entry to reopen it — this replaces the current view the same way **Open files**
does, so it's not a way to append. Click the **×** next to an entry to remove it from the
list. Recent is available whenever you have history, whether or not a file is currently
loaded — not just from the empty state. Not shown in the browser version, since reopening
requires a native file path that browser file pickers don't provide.

### Command line

*Desktop only.* Launch tsmap with files already named, for scripting or automation:

```bash
tsmap lot1.stdf lot2.stdf                  # one or more data files
tsmap --list files.txt                     # a text file of paths, one per line
cat files.txt | tsmap                      # or piped via stdin
tsmap lot1.stdf --tests my-tests.csv       # pre-fills the test selector (still shown — see below)
tsmap lot1.stdf --splits my-splits.csv     # applies splits automatically, same as sample data
tsmap --url https://.../lot.stdf --url-format stdf   # fetch and open a URL — see below
tsmap --help                               # full usage
tsmap --version                            # print the version and exit
```

`--tests` takes the same file a test selector's **Save list** button produces — selection,
renames, and optionally spec limits/test type (see
[Test lists](#test-lists-save-load) above) — and `--splits` the same CSV the
[Splits… dialog](#63-saving-and-loading-split-definitions-csv) saves and loads. `--tests` only
pre-fills the selector's checkboxes, renames, and limit/type overrides — the overlay still
always appears and still needs a confirm click, the same as any other load; it just saves
re-picking (and re-entering limits for) tests you already set up before.

If tsmap is already running, launching it again with files hands them to the running window
instead of opening a second blank one: with nothing currently loaded they open right away;
with data already loaded, a dialog asks whether to replace it. Decline and the new files open
in a separate, independent tsmap window instead, so nothing is lost either way.

### Opening data from a URL

Another application can hand tsmap a data URL directly, so it can fetch and load the file
itself with no one retyping anything. This is aimed at a caller application that already
knows where the data lives (its own database or API) — not at typing a URL in by hand. On
desktop, the fetched response is briefly materialised as a temporary local file while it's
loading (so it can flow through the same load pipeline as any other file); no data is
uploaded to a tsmap service either way. In the browser build there's no local filesystem to
write to, so the fetched bytes stay in memory.

On desktop, pass it on the command line, paired with the format:

```bash
tsmap --url https://example.com/lot.stdf?sig=... --url-format stdf
```

In the browser, encode it in the page URL instead:

```
https://your-tsmap-deployment/?dataUrl=https%3A%2F%2Fexample.com%2Flot.json&dataFormat=json
```

Or, to launch the **desktop** app directly from a web page (rather than requiring a script or
terminal to run the command above), a `tsmap://` link works the same way once the desktop app
has been run at least once on that machine (which registers it as the link's handler):

```html
<a href="tsmap://open?url=https%3A%2F%2Fexample.com%2Flot.stdf%3Fsig%3D...&format=stdf">
  Open in tsmap
</a>
```

All three forms need the format spelled out explicitly (`stdf`, `atdf`, `csv`, `json`, or
`parquet`) — tsmap doesn't guess it from the URL. Once fetched, the file goes through the
exact same load as opening it locally: column mapping for CSV/JSON/Parquet, the test
selector for STDF/ATDF.

The `dataUrl`/`dataFormat` params are removed from the address bar right after the fetch is
attempted, so reloading the page won't re-trigger it.

#### Authentication

**Browser build: no credentials are ever sent.** tsmap does a plain, unauthenticated fetch —
the URL itself must be self-authenticating (a presigned/signed link with the token already
embedded), since there's no secure way for tsmap to accept a separate secret here — the page
URL can end up in browser history, bookmarks, or a server's access log.

**Desktop: `--url-headers <FILE>`** sends custom headers with the fetch — e.g. an
`Authorization` bearer token for a data API that expects header-based auth rather than a
presigned link. Point it at a small text file, one header per line:

```bash
tsmap --url https://internal-api.example.com/lot123 --url-format json --url-headers auth.txt
```

```
# auth.txt — blank lines and '#' comments are skipped
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
X-Api-Key: abc123
```

The header *value* never appears on the command line itself (so it won't sit in shell
history or a process list the way a `--header "Authorization: ..."` flag would) — only the
file path does. The file itself is still plain text on disk, exactly like the `--tests`/
`--splits` files already are; tsmap doesn't encrypt it or integrate with an OS credential
store. `--url-headers` requires `--url`; a malformed line (missing the `:` separator) or an
unreadable file fails the fetch immediately with a clear error rather than silently sending
an unauthenticated request. There's no browser-build equivalent — see the CORS section below
for why a header-based secret can't safely travel through a page URL.

**The `tsmap://` link has the same constraint as the browser build, not the same option as
`--url-headers`.** A link URL — page URL or deep link — has nowhere safe to carry a header
value either, so `tsmap://` links only work with a self-authenticating URL, the same as
`?dataUrl=`. `--url-headers` remains a *local file* the launching machine already has; there's
no way to pass its content through the link itself.

#### Browser build: the data server must allow cross-origin requests (CORS)

This only applies to the **browser build's** `?dataUrl=` — the desktop app's `--url` never
hits this, see below.

Every browser enforces a rule called CORS (Cross-Origin Resource Sharing): a web page can
only read the response from a *different* website's server if that server explicitly says
it's OK. "Different website" is decided purely by the address — scheme, hostname, and port —
never by network location. **Being on the same office network, the same VPN, or even the
same machine on a different port does not help** — tsmap's page and the data server are still
two different "origins" as far as the browser is concerned, and the browser blocks the read
by default regardless of how reachable the server actually is.

Concretely: if tsmap is served from `https://tsmap.example-corp.internal/` and the data URL is
`https://wafer-data-api.example-corp.internal/lot123`, the browser will refuse to hand the
response back to tsmap's JavaScript **unless** the data API's response includes a header like:

```
Access-Control-Allow-Origin: https://tsmap.example-corp.internal
```

(or `Access-Control-Allow-Origin: *` to allow any site — simpler, but only appropriate if the
data behind that URL isn't sensitive to being fetched by *any* web page that knows the link).

Whether this is easy depends entirely on whether you control the data API:

- **If you (or your team) run the API**: this is normally a small, one-time config change —
  a line of middleware (e.g. Express's `cors()` package, Flask-CORS), or a header directive
  in the reverse proxy / API gateway in front of it (nginx's `add_header`, an API gateway's
  CORS setting). tsmap only ever sends a plain `GET` with no custom headers, which keeps this
  to the simplest CORS case — no separate preflight request to also allow.
- **If it's a third-party or legacy API you can't change**: the browser build's `dataUrl` path
  won't work against it, full stop — there is no per-request workaround, and tsmap cannot
  disable or bypass this check (it's enforced by the browser itself, not by tsmap). Use the
  **desktop app's `--url`/`--url-format` instead** — the fetch happens inside the desktop
  app's own Rust process, never inside a browser page, so CORS simply doesn't apply there.

If a `dataUrl` fetch fails, the log panel names CORS explicitly as a likely cause — that's the
first thing to check with whoever owns the data API.

### File associations (desktop)

**Help → File associations…** lets you open `.stdf`, `.atdf`, and `.parquet` files in tsmap
automatically by double-clicking them in a file manager (Windows Explorer, GNOME Files,
Dolphin, etc.). CSV and JSON aren't offered here on purpose — those extensions are already
claimed by dozens of unrelated apps, and quietly becoming their default handler would be an
unwelcome surprise even behind a checkbox.

Each file type is a separate checkbox, and nothing is associated until you turn one on — this
is never set automatically. It's a setting, not an installer choice, so you can change your
mind at any time without reinstalling; toggling a checkbox off removes the association
immediately.

**If a checkbox fails to turn on**, the dialog shows the reason inline rather than silently
reverting. The most common cause on a managed/corporate machine: registry write access
(Windows) or the relevant config directory (Linux) is restricted by IT policy — in that case
file-type association simply isn't available on that machine, and there's no in-app
workaround. This has nothing to do with tsmap's own permissions; it's the same restriction
that would block any application from registering a default handler there.

Each row also shows the executable path currently registered for that file type — or, when
unchecked, the path that would be registered if you turned it on. This is what the OS will
actually launch on a cold double-click, which can silently drift from the tsmap you're running
right now (for example, if the association was last turned on while running a development
build) — a mismatch is flagged inline rather than left to be discovered as a launch failure.

Not available in the browser build — there's no equivalent to "the OS's default app for a
file type" a web page can register.

### Adding files to an existing lot

Once a file is loaded, the **Add files** button becomes active. Use it to append additional
wafers to the current gallery — it goes through the same column mapping / test selector /
rename steps as a fresh load, then shows a confirmation dialog before merging into the
current gallery:

![Append-confirm dialog, warning about a die-count mismatch](images/append-confirm.png)

The dialog summarises the incoming wafers and warns about structural mismatches (different
die count, different hard bin set, duplicate wafer IDs). With no mismatches, the button
reads **Add to gallery**; if there's a warning to acknowledge, it reads **Add anyway**.
Click **Cancel** to keep the current data unchanged.

### Clearing data

Click **Clear** to unload all data and return to the empty state.

### What happens next

After selecting files, what happens depends on the format:

| Format | Next step |
|--------|-----------|
| STDF / ATDF | [Test selector overlay](#4-test-selector-stdf-and-atdf) always appears first |
| CSV / JSON / Parquet | [Column mapping overlay](#3-column-mapping-csv-json-and-parquet) appears first |
| Multiple files | [Wafer rename overlay](#21-wafer-rename-overlay) appears before rendering |

### 2.1 Wafer rename overlay

![Wafer rename overlay, loading two files together](images/wafer-rename.png)

When loading multiple files (or a zip containing multiple files, or a single file whose
only wafer has a generic ID like `W01`), tsmap shows a rename overlay listing each wafer
with an editable label. Labels are pre-filled from whatever identifies the wafer in the
data — a distinctive wafer ID is used as-is; a generic one (`W01`) is combined with the
lot ID (`LOT-A · W01`) so wafers stay distinct within and across lots without you needing
to edit anything; with neither, it falls back to the file name. Edit any label that needs
changing, then click **Continue →**.

---

## 3. Column mapping (CSV, JSON, and Parquet)

![Column mapping overlay, long-format CSV](images/column-mapping.png)

CSV and JSON files don't have a fixed schema, and Parquet files carry an arbitrary schema
of their own, so tsmap shows a column mapping overlay before parsing any of the three. It
lists every column in the file with a dropdown to assign its role. Common column names
(`x`, `hbin`, `result`, `lo_limit`, etc.) are detected automatically and pre-filled.

Parquet columns are typed (numbers, text, booleans) rather than plain text like CSV/JSON
cells, so the overlay adds one thing on top: a **⚠** next to a column's role dropdown if
you assign a numeric-only role (X position, Y position, Hard bin, Test value, etc.) to a
column whose values are actually text. This is a hint, not a hard stop — a numeric-looking
text column (e.g. `"42"`) still parses fine — but it catches an obvious mismatch (e.g.
mapping a wafer-ID text column to X position) before a full parse silently produces empty
or wrong results.

### Role reference

| Role | What it means |
|------|--------------|
| **X position** | Die column coordinate (prober step, integer). Optional — see [Dies with no reported position](#dies-with-no-reported-position) below. |
| **Y position** | Die row coordinate (prober step, integer). Optional — see [Dies with no reported position](#dies-with-no-reported-position) below. |
| **Hard bin** | Hard bin number per die |
| **Soft bin** | Soft bin number per die |
| **Wafer ID** | Identifies which wafer each row belongs to; splits rows into separate wafer maps |
| **Lot ID** | Lot identifier shown in the summary panel |
| **Test site** | Parallel-test site number for each die (the STDF `site_num` equivalent). Dies from all sites share one wafer map; the site appears in the die hover tooltip and can be used as a chart grouping/colour dimension. Numeric values only. |
| **Test value** | Numeric test result (wide format — one column per test); the **Test name** field to the right sets the display name for that test. If the column's own header is itself a bare number (e.g. `1001`), that real number is used as the test's identity instead of a generated one |
| **Test name (long format)** | Column containing the test name in a long/pivot layout. Optional if **Test number** is set instead — a file with only real test numbers and no descriptive names is fully supported; the number is used as the display name in that case |
| **Test number (long format)** | Column containing the test's real number in a long/pivot layout. Optional alongside **Test name** — set alone (no name column at all) or together (real number, given name). At least one of **Test name**/**Test number** is required, along with **Test result** |
| **Test result (long format)** | Column containing the numeric result in a long/pivot layout |
| **Low limit (long format)** | LSL in a long-format file |
| **High limit (long format)** | USL in a long-format file |
| **Units (long format)** | Units string in a long-format file |
| **Display info** | Additional metadata captured for grouping/comparison (and shown in tooltips). The **Subdivide file by this column** checkbox is a structural escape hatch for flat files that pack several wafers into one file with no wafer column — it subdivides the file into one wafer map per distinct value of the column. (Do not use it for parallel-test sites — map those to **Test site** instead.) |
| **— ignore —** | Column is not imported |

### Wide vs long format

**Wide format** has one column per test (the most common layout from prober exports). Assign
each test column the **Test value** role and fill in the test name.

**Long format** has one row per die per test (each row includes a test identity column and a
result column). Assign **Test result (long format)**, plus **Test name (long format)**,
**Test number (long format)**, or both — a file that only has real test numbers and no
descriptive names works just as well as one with only names; assigning both uses the real
number as the test's identity paired with the given name. Optionally assign the limit and
units columns too. tsmap detects likely long-format files automatically and shows a prompt
if multiple rows share the same X/Y coordinates.

Examples:

    Wide format — one column per test:
    x, y, hbin, Vt_lin, Idsat_vg1
    1, 1, 1,    452,    185
    2, 1, 2,    438,    179

    Long format — one row per die per test:
    x, y, hbin, test_name,  result
    1, 1, 1,    Vt_lin,     452
    1, 1, 1,    Idsat_vg1,  185
    2, 1, 2,    Vt_lin,     438
    2, 1, 2,    Idsat_vg1,  179

### Dies with no reported position

X/Y aren't required. Leave both unassigned and every die in the file is treated as having no
reported position — a confirmation explains what that means (see
[Dies with no reported position](#51-dies-with-no-reported-position) below) before you
continue. Assigning only one of X/Y (not both) is blocked — a die is either fully positioned
or fully unpositioned, never half.

A row whose X or Y cell is blank or doesn't parse is handled the same way individually: kept
as a coordinate-less die rather than dropped, even if most of the file's other rows do have a
position (a "mixed" wafer). `sample_data/TESTNUM-COORDLESS-01.{csv,json,parquet}` demonstrate
this — the same three-wafer lot in all three formats, one wafer fully positioned, one mixed,
one fully coordinate-less. STDF and ATDF have the same rule applied to their own "no reported
position" conventions (the STDF sentinel value and ATDF's blank PRR X/Y fields respectively);
`sample_data/COORDLESS-LOT-01.stdf` and `sample_data/COORDLESS-LOT-01.atdf` are their fixtures.

### Pass bins

The **Pass bin(s)** field at the bottom of the overlay specifies which hard bin values are
treated as pass for yield calculation. Default is `1`. Enter multiple bin numbers separated
by commas (e.g. `1,7`).

### Saved mappings

Once you click **Continue →**, the mapping is saved and automatically restored the next
time you open a file with the same set of column names. If the columns have changed, the
overlay re-appears with fresh auto-detection.

---

## 4. Test selector (STDF and ATDF)

![Test selector overlay — search, type filter, range select, and the test list](images/test-selector.png)

STDF and ATDF files from production testers often contain hundreds of parametric and
functional tests. tsmap always shows a test selector overlay before the full parse so
you can choose which tests to import. This keeps memory usage and load time proportional
to what you actually need.

tsmap uses a two-pass approach: a fast first pass reads only the test record headers
(PTR/FTR) to enumerate all tests and their numbers, names, units, and spec limits —
without accumulating any die data. The selector is built from this scan. The full parse
then runs only for the tests you selected, skipping accumulation for everything else.
For a 25-wafer lot with 500 tests and 10 000 dies per wafer, selecting 20 tests instead
of all 500 reduces the in-memory dataset by roughly 25×.

### Controls

- **Search** — Filter the list by test name or test number. Results update as you type.
- **Type filter** — Show all tests, only Parametric (PTR), or only Functional (FTR).
  The count per type is shown on each button.
- **Range select** — Type a numeric range (`1000-1099`) or a name-based range
  (`Idsat_vg1-Idsat_vg5`) in the range input and click **Select range**. Matching tests
  are added to the selection.
- **Select all / Select none** — Apply to the currently visible list (respects any active
  search filter).
- **Shift-click** — Click one checkbox, then Shift-click another to select or deselect
  the entire range between them.

Each test row shows the test number (in dim monospace), the test name, and — where defined
in the file — the units and spec limits. If a **Load list** (or `--tests`) has overridden a
test's limits, units, or type, the row shows those overridden values, with a tooltip noting
they were loaded from file.

### Renaming a test

Click into a test's name to edit it directly — the field looks like plain text until you
hover or focus it. Press **Enter** or click away to commit the new name; press **Esc** to
discard the edit and restore the previous name. Renaming only changes the display name —
nothing in the underlying data file changes — and the new name appears everywhere that test
is shown: the selector, the map tooltip, and chart axis labels. Renames persist across
**Filter tests…** re-opens and are included when you **Save list**.

### Test lists (Save / Load)

The **Save list** and **Load list** buttons let you persist a selection and reuse it across
sessions or files from the same product. Beyond just the selection and display names, a test
list can also carry **spec limits and test type** — useful when a test program ships without
limits (common for characterisation/test-vehicle work, where limits come from simulation or
are defined and adjusted separately), or when you need to correct a test's parametric/
functional classification. In effect, the file doubles as a lightweight test-definitions file.

**Saving** writes a plain-text `.csv` file with every selected test's number, current display
name, and current effective limits/units/type. **Loading** reads that file back, restores the
selection, and applies whatever the file specifies as overrides on top of the parsed data —
so renamed tests stay renamed, and any loaded limits/type replace what the test program shipped
with (or fill in limits it didn't have at all).

The saved format is one test per line, with a header naming the columns:

    # tsmap test list
    # Saved: 2026-06-15T10:00:00.000Z
    num,name,loLimit,hiLimit,units,testType
    1000,Idsat_vg1,0.1,1.5,mA,P
    1001,Idsat_vg2,,,mA,P
    1010,Vt_lin,,,,

- Lines starting with `#` are comments and are ignored on load.
- **Legacy format** (still fully supported): `<test number> <display name>`, with the number
  and name separated by a comma, semicolon, or plain whitespace, and no further columns. A
  line with just a number selects that test without overriding its name. Old saved files keep
  working unchanged.
- **Extended format**: comma-separated, optionally starting with a header row that names each
  column. Column names are matched case-insensitively, and common synonyms are recognized —
  `lsl`/`usl` (or `lo`/`hi`, `low`/`high`) for the limit columns, `type` for test type. A
  header lets you list columns in any order, and omit ones you don't need — for example a
  pure limits file with no name column at all, `num,lsl,usl`, is valid. Without a header,
  comma-separated rows are read positionally as
  `num,name,loLimit,hiLimit,units,testType`.
- `testType` accepts `P`/`p` (parametric) or `F`/`f` (functional).
- Limits only make sense for parametric tests — a functional test is pass/fail with no
  measured value to check a spec limit against. A `loLimit`/`hiLimit` given for a test that is
  (or is being reclassified to) functional is dropped with a warning; the rest of that row's
  overrides (name, units, type) still apply.
- A blank field means "don't override this" — it leaves the parsed value (or an override
  already loaded earlier in the session) alone. It never clears an existing value back to
  blank/zero. There's no way to *revert* an override from inside the app short of editing the
  file (blank the cell) or reloading the data fresh — Save/Load is the entire limit/type
  editing workflow, there is no in-app limit editor.
- A field tsmap can't parse (garbage numeric value, invalid test type, an unrecognized header
  column) is dropped with a log warning — the rest of that row, and the rest of the file, still
  load normally.
- A row whose saved test number isn't in the current scan is not immediately given up on:
  tsmap tries to recognise it by name instead, and if exactly one current test has that
  name, recovers it under its current number. This is what lets a saved list keep working
  across a CSV/JSON reload even though those two formats' test numbers are internal IDs,
  not identities from the file — reordering or adding columns can change them. (STDF/ATDF
  test numbers are real and don't change, so this mainly matters for CSV/JSON.) The log
  panel reports all three outcomes separately: matched by number, recovered by name (worth
  re-saving the list so it's back to matching by number directly), and genuinely not found.
  A name matching more than one current test is never guessed — it's reported as
  unresolved rather than silently picked.

You can hand-edit a list file to rename tests, or add/adjust limits, without changing anything
in the original data file — e.g. `1000,Threshold Voltage,0.2,1.2,mA,P`. Those names, limits,
and type appear in the selector, on the map tooltip, in chart axis labels, and — for
limits — as histogram LSL/USL lines and in the Process Capability panel.

### Memory advisory

The footer shows how many tests are selected and estimates the memory footprint
(selected tests × total die count):

- **Amber** — large selection (roughly 50 million die×test pairs); the import will be
  slow.
- **Red** — very large selection (roughly 200 million die×test pairs); risk of running
  out of memory. You'll be asked to confirm before the import starts.

<div style="display:flex;flex-direction:column;gap:4px;margin:8px 0 12px;">
  <div style="color:#fbbf24;">Large selection — may be slow to load</div>
  <div style="color:#f87171;">Very large selection — risk of running out of memory</div>
</div>

If you select no tests, tsmap asks you to confirm ("No tests selected — only bin data will be loaded. Continue?") before importing — the bin map is still fully usable with no tests selected.

### After load: re-filtering

After a successful load, the toolbar's **Lot ▾** menu offers **Filter tests…**. Click it to
re-open the test selector at any time and change which tests are imported. The file is
re-parsed with the new selection — bin and yield data is preserved regardless of which
tests you select.

For multi-file batches, the selector is shown once and the same selection is applied to
all files. By default the test list is scanned from the **largest file only** — a fast,
representative default. If a test appears only in a smaller file (so it's missing from the
list), click **Scan all N files** in the selector to re-scan every file and merge the full
test list; your current selection is preserved. The "Filter tests…" dialog offers the same
toggle if you didn't widen the scan at load time.

---

## 5. The wafer map view

After parsing, tsmap renders the wafer map. A single-wafer file shows one full-screen map
with the summary panel open by default; a multi-wafer lot shows a side-by-side gallery.

The map is delivered by the wafermap rendering engine. For a full walkthrough of toolbar
controls, plot modes, overlays, zoom and pan, die hover tooltips, findings panel, summary
panel, and gallery controls, open tsmap's **?** Help menu → **Wafer map reference**.

### 5.1 Dies with no reported position

Not every file reports an X/Y position for every die — see
[Dies with no reported position](#dies-with-no-reported-position) in the column mapping
section for how that's assigned (or left unassigned) at load time. What you see afterwards
depends on how much of a wafer is affected:

- **A fully coordinate-less wafer** never renders as a map or gallery mosaic — showing dies
  at fabricated positions would risk being misread as real spatial layout. Instead the card
  shows a compact summary matching the current plot mode: a **bin breakdown** (colour-coded
  the same as a positioned card's own bin legend) for hard/soft-bin modes, or a small
  **histogram** for value mode — coloured through the same colour scheme, log-scale, and
  spec/data-range settings the map itself uses, so switching those in the toolbar updates the
  chart the same way it would a real map. A **View die list** toggle switches to the full
  per-die table (one row per die, site/index, hard bin, soft bin, every test value) with its
  own **Export CSV** button; from there, **View chart** switches back.
- **A mixed wafer** — some dies positioned, some not — renders its normal wafer map for the
  positioned dies, plus an expandable **"+N dies without position data"** footer beneath the
  card (click the footer, or its chevron, to expand/collapse). Expanding it shows the same
  chart/die-list toggle, scoped to just the unpositioned subset.
- The toolbar's spatial-only controls (zoom, pan, select, download, orientation, overlays,
  legend position) are hidden on a fully coordinate-less card, since there's no map for them
  to act on. Plot mode and colour scheme stay — both drive what the summary shows.
- A **lot-level die list** combining every wafer (with a wafer-id column) is available from
  the toolbar's **Lot ▾** menu for multi-wafer loads, with its own CSV export covering the
  whole lot.

`sample_data/COORDLESS-LOT-01.stdf` demonstrates all three wafer states in one lot: `W01` is
fully positioned, `W02` is a mixed wafer (~15% of dies unpositioned), and `W03` is fully
coordinate-less.

Findings that depend on physical layout — edge ring, quadrants, sectors, reticle position,
cluster and pattern detection — only ever consider positioned dies, so a coordinate-less
wafer contributes none of these. Everything else — yield, bin counts, per-test statistics,
and the Insights tab's histograms/correlation/scatter — still includes every die, positioned
or not.

### Value findings

The wafer map's summary panel has a **Findings** list — statistically significant spatial
patterns: regions of the wafer (edge ring, quadrants, clusters, test sites) with unusually
low yield or distinctive bin patterns. These yield and bin findings are fast to compute and
**always on**.

The **Value findings** toolbar control is a **toggle** (shown with a ☐ / ☑ checkbox) that
adds one more category to that same Findings list: regions that read unusually high or low on
a specific *test value*, or fail spec more often there than elsewhere ("the edge ring reads
8% high on VDD_CORE"). This is the **only** thing it changes. It does **not** affect:

- the panel's per-test Min/Mean/Max statistics (always shown),
- test-value maps or stacked value maps,
- the [Insights tab](#7-insights-tab) (boxplots, histograms, scatter, correlation — all independent).

Because this regional value pass scales with regions × tests × dies, it is **off by default**
to keep loads fast. The toggle appears once a file with test values is loaded; switch it on
and the maps re-render with the extra findings in the panel — the wafer's data is already in
memory, so this recomputes in place with no reload. Switch it off to remove them. It resets to
off each time you load a new file, and is disabled while the Insights tab is open (it only
affects the map's summary panel).

---

## 6. Wafer splits

A **split** is a name you assign to a wafer that isn't in the file at all — most commonly a
process corner (`TT`, `FF`, `SS`, `FS`, `SF`), but it can be anything: an experiment
condition, a test-temperature group, anything you want to compare wafers by that your
tester didn't record. Once assigned, splits behave exactly like any other metadata field
in the [Insights tab's Group by dropdown](#7-insights-tab) — split-vs-split
yield, boxplots, histograms, correlation, and scatter all work immediately with no extra
setup — and they can optionally be shown right on the wafer map/gallery labels too.

Once a file is loaded, open the toolbar's **Lot ▾** menu and choose **Splits…** to open the
assignment dialog.
The banner at the top shows where things stand: with no assignments yet it points you at
the two ways to get started (assign below, or load a saved CSV), and once splits exist it
becomes a summary — e.g. *"5 splits assigned to 13 of 13 wafers"* — so a lot whose splits
were [restored automatically](#64-restoring-splits-automatically) reads as already done:

![Wafer splits dialog, just opened — no assignments yet](images/splits-modal.png)

![Splits dialog after loading a corner-lot split definition](images/splits-modal-loaded.png)

### 6.1 Assigning splits

Tick the checkbox next to one or more wafers — click to toggle, Shift-click to select a
range, same as the test selector — type a split name (or click one of the chips below the
input to reuse an existing name, avoiding accidental near-duplicates like `TT` vs `tt`),
and click **Assign to selected**. **Clear split** removes the assignment from just the
checked rows; **Clear all** removes every wafer's assignment at once (after a confirmation,
since it's not scoped to your current selection). Every action applies immediately — there
is no separate save step, and **Done** just closes the window.

Unlike the test selector, ticking wafers here is never required to proceed — it only
scopes the **Assign to selected** and **Clear split** buttons, which stay disabled until
at least one wafer is ticked. Loading a CSV, **Clear all**, and **Save splits…** ignore
the selection entirely.

### 6.2 Showing splits on the wafer map

The **"Show split in wafer map labels"** checkbox (on by default) appends the split, as
`W02 · FF`, wherever a wafer's ID is shown — gallery card headers, the single-wafer view,
the summary panel's Wafer Id row, and drilldown modal titles. Turn it off to see plain
wafer IDs again; the underlying assignments are unchanged either way.

![Gallery with split suffixes after loading PVT-LOT-05_splits.csv](images/gallery-splits.png)

### 6.3 Saving and loading split definitions (CSV)

**Save splits…** writes every wafer's current assignment to a CSV file; **Load splits…**
reads one back and applies it by matching wafer IDs — wafers in the file that aren't in
your currently-loaded set are silently skipped, and a log message reports how many rows
matched. This is the way to prepare a split definition ahead of time (e.g. from a fab's lot
traveler) and apply it after loading the STDF, or to share a known-good corner mapping with
a colleague. The format is a simple two-column CSV:

    # tsmap wafer splits
    # Saved: 2026-07-08T10:40:00.000Z
    waferId,split
    W01,TT
    W02,FF
    W03,TT

- Lines starting with `#` are comments and are ignored on load.
- The header row (`waferId,split`) is optional — tsmap recognises and skips it either way.
- A wafer listed with an empty split value is treated as explicitly unassigned.

### 6.4 Restoring splits automatically

tsmap remembers split assignments per lot ID + wafer ID (plus part type, if present) — the
physical wafer's identity, not the file it arrived in — so re-opening the *same lot* later
restores them without reloading the CSV, even if that lot is split across several files
(for example, one file per test temperature). This restore is never silent: if any
assignment is found for the wafers you just loaded, tsmap logs a message and automatically
opens the Splits dialog so you can see exactly what was restored, edit it, or clear it —
rather than silently changing chart groupings and map labels behind your back.

---

## 7. Insights tab

The **Insights** button in the map toolbar (both the single-wafer view and the gallery have
their own) switches to wafermap's own grid of statistical panels — yield, bin pareto, process
capability, boxplot, histogram, correlation, and scatter — sharing the same parsed,
in-memory data as the map, so switching never re-parses.

**This is entirely a wafermap feature.** Every panel, its controls, and its grouping/drill-down
behaviour are documented in full in wafermap's own built-in guide — see the note at the top of
this document for how to open it. This section covers only the two things that are
tsmap-specific:

- **Where the "Group by" field list comes from.** Grouping is driven by metadata attached
  to each wafer at load time, plus any [wafer splits](#6-wafer-splits) you've assigned.
  STDF and ATDF contribute every field present in their MIR record — lot, sublot, part
  type, program, test temperature, test date, tester, node, operator, and more; CSV and
  JSON contribute the lot column plus any columns you mapped as metadata. Only fields that
  actually *vary* across the loaded wafers appear in the dropdown.
- A single-wafer load has nothing to group by, so every panel simply shows that one
  wafer's own data and the **Group by** control doesn't appear.

---

## 8. Exporting charts

Every chart panel has a **camera** button that saves the current view as a PNG at the
displayed resolution. To get a clean full-resolution render, use the expand (corner-arrows)
button first to open the panel in the fullscreen modal, then click the camera button.

Each exported PNG includes a header strip above the chart with the panel title, source
filename, wafer and die counts, the active test name (where applicable), and the time of
export. The live card UI is unchanged — the header appears only in the saved file.

On the desktop, PNG saves open a native save dialog. In the browser, the file goes to your
downloads folder.

For map PNG export, use the **camera** button in the map toolbar — see **Wafer map reference**
(tsmap's **?** Help menu) for details.

---

## 9. The log panel

A collapsible log panel sits at the bottom of the window. It shows timestamped messages
from the parser and renderer: file load events, parse warnings, and any errors.

![Log panel expanded, after a normal load](images/log-panel.png)

- Click **Log** to expand or collapse the panel.
- If any errors occurred, the button label changes to **Log (N errors)** and the panel
  expands automatically.
- Parser warnings (e.g. fabricated soft bin numbers from sentinel values, unrecognised
  records) appear here rather than blocking the load.

**Soft bin 65535** is a sentinel value in the STDF spec meaning "no soft bin assigned to
this die". When the parser encounters it, it maps those dies to a fabricated soft bin so
the wafer map can render — the hard bin value is unaffected. The number in the warning
(e.g. "fabricated bin 2 for 14 dies") is the count of dies where this substitution was
applied. If soft bin data is not meaningful for your product, this warning can be ignored.

---

## 10. Desktop vs browser differences

| Feature | Desktop | Browser |
|---------|---------|---------|
| File parsing | Native Rust (fast, off UI thread) | WASM in a Web Worker (same logic) |
| File picker | Native OS dialog | Browser dialog |
| Drag and drop | Yes | Yes |
| Filter files | Yes | Yes (scans at most 4 files at a time to bound memory) |
| PNG save | Native save dialog | Browser download folder |
| Zip extraction | Native Rust | In-browser (fflate) |
| Offline use | Yes | Yes (once page loaded) |
| Opening data from a URL | `--url`/`--url-format` CLI flags | `?dataUrl=&dataFormat=` query params (subject to the target server's CORS policy) |

The browser version is functionally identical to the desktop app. Files are parsed entirely
in your browser — nothing is sent to a server.

Browser requirements: Chrome 80+, Firefox 113+, Safari 16.4+, Edge 80+.
