# tsmap in the browser

The browser version of tsmap is available at
**[wafertools.github.io/tsmap/app/](https://wafertools.github.io/tsmap/app/)**.

It uses a WebAssembly build of the same Rust parser as the desktop app. Files are parsed
entirely in your browser — nothing is sent to a server. Parsing runs in a background Web
Worker, so the interface stays responsive even while a large file loads.

## Opening files

Click **Open files** to pick one or more files from your device, or drag and drop files
anywhere in the window. Multiple files are loaded as a batch and merged into a single
gallery, with a rename step to label each wafer.

For a large set, **Filter files…** scans just the header metadata of every file you pick —
lot ID, part type, wafer count and so on — and shows them in a sortable, filterable table so
you can load only the ones you want. Files are read a few at a time and released again, so
scanning a big batch doesn't hold it all in memory.

For every STDF and ATDF file, a test selector overlay appears before parsing — pick which
tests to import, then click **Import**. What varies with size is only whether the tests
arrive already ticked: a small lot is pre-selected, while a large one starts empty so that
importing everything can never be the accidental default. A **Setup ▾ → Tests…** entry in the
toolbar lets you change your selection at any time after load.

### "Upload" in the browser's own dialog

**Scan a folder…** may show a dialog headed *Open file* with an **Upload** button, then ask
*"Upload N files to this site?"* — in Firefox and Safari, which is alarming and, for tsmap,
untrue. That wording belongs to the browser and is attached to the only folder-picking
mechanism those browsers offer; a page cannot change it. Nothing is uploaded: the folder is
read in your browser, and no file, name, or measurement leaves the machine.

Chrome, Chromium and Edge implement a newer picker that tsmap uses instead, which asks *"Let
this site view files?"* — a fair description of what happens next.

If you would rather verify than take our word for it, open your browser's developer tools on
the Network tab and scan a folder: there are no outbound requests. Or disconnect from the
network entirely and use the app offline, which works.

## Try it with sample data

No wafer files to hand? Download one of these synthetic samples and open it in the app:

- [tsmap-sample.stdf](samples/tsmap-sample.stdf) — STDF: 3 wafers, ~500 dies each, 20 tests.
- [tsmap-sample.atdf](samples/tsmap-sample.atdf) — ATDF: the same dataset in ASCII form.
- [tsmap-sample.csv](samples/tsmap-sample.csv) — CSV: the same dataset; opening it shows the
  column-mapping overlay.
- [tsmap-sample.json](samples/tsmap-sample.json) — JSON: the same dataset as per-die
  `testValues`.
- [tsmap-sample.parquet](samples/tsmap-sample.parquet) — Parquet: the same shape (3 wafers,
  ~500 dies each, 20 tests), snappy-compressed; opening it shows the same column-mapping
  overlay as CSV/JSON.
- [tsmap-correlated.stdf](samples/tsmap-correlated.stdf) — STDF: 5 wafers, ~200 dies each, 30
  tests with *designed* correlations spanning a full range of Pearson r. Open **Charts** to
  see the correlation matrix and scatter plots come to life.
- [tsmap-correlated.parquet](samples/tsmap-correlated.parquet) — Parquet: the same designed
  correlation dataset.

All seven contain no real device data — they are generated for demonstration.

Or try the **[live demo of opening tsmap from a link](demos/open-from-link.html)** — it
builds the `?dataUrl=` link for each of these samples for you and opens the browser build
directly, alongside the desktop `tsmap://` equivalent.

## Supported formats

All five formats are supported in the browser:

- **STDF** / **ATDF** — parsed directly from binary/text bytes via WASM
- **CSV** / **JSON** / **Parquet** — column mapping overlay appears before rendering; the
  mapping is saved per column layout and restored automatically next time. Parquet's
  `zstd` codec is desktop-only — every other codec (`snappy`, `gzip`, `lz4`, `brotli`) works
  in the browser too
- **Gzip** (`.gz`) — decompressed in-browser using the native `DecompressionStream` API
- **Zip** (`.zip`) — extracted in-browser using [fflate](https://github.com/101arrowz/fflate)

## Differences from the desktop app

| Feature | Browser | Desktop |
|---------|---------|---------|
| File parsing | WASM in a Web Worker (same logic) | Native Rust (off-thread) |
| File picker | Browser dialog | Native OS dialog |
| Last used folder | Chrome and Edge: each kind of dialog reopens at its own last folder (data, definitions, filters). Firefox and Safari: no — their file picker cannot be pointed at a folder. Saves are downloads. | Remembered between sessions for each kind of dialog — data, images, exported data, definitions, filters — on all three platforms. A kind with no folder yet starts in the data folder. |
| Drag and drop | Yes | Yes |
| PNG export | Browser download | Native save dialog |
| HTML reports | Opens in new tab | Writes to temp file |
| Zip extraction | In-browser (fflate) | Rust (native) |
| Offline use | Yes — the app installs a service worker on first visit and then opens with no network at all | Yes |
| Install as an app | Yes in Chrome, Chromium and Edge — see [Installing tsmap as an app](#installing-tsmap-as-an-app). Firefox on the desktop cannot install web apps at all | Yes (installer) |
| Opening data from a URL | `?dataUrl=&dataFormat=` query param, subject to the target server's CORS policy | `--url`/`--url-format` CLI flags, a `tsmap://open?url=...&format=...` link, or both — plus optional header-based auth via `--url-headers` |
| File associations (open `.stdf`/`.atdf`/`.parquet` by double-click) | Not available | **Help → File associations…** |

## Browser requirements

Any modern browser with WebAssembly and `DecompressionStream` support — Chrome 80+,
Firefox 113+, Safari 16.4+, Edge 80+.

## Installing tsmap as an app

The browser build can be installed, giving it a launcher entry and its own window with no
browser tabs or address bar — the same way you would use the desktop app. This is the
closest thing to a package on the Linux distributions we do not ship installers for.

In **Chrome, Chromium or Edge**, open [the app](https://wafertools.github.io/tsmap/app/) and
use the install icon at the right-hand end of the address bar, or ⋮ ▸ *Cast, save and share*
▸ *Install page as app*. On **Safari** (macOS and iOS), use *Share* ▸ *Add to Dock* / *Add to
Home Screen*.

**Firefox on the desktop cannot install web apps.** There is no install button and no way to
add one — this is a deliberate Firefox decision, not something tsmap can work around. Firefox
on Android can. The offline behaviour below applies in Firefox either way; only the install
does not.

### What installing does and does not give you

Installing is a convenience, not a different application. It is the same code, the same
browser engine and the same sandbox, so everything in the comparison table above still
applies — notably, there is still no access to native file dialogs, no remembered directory,
and no file associations.

What it does change:

- **It works offline.** The whole application — including the parser — is cached on first
  visit, so it opens with no network connection. This happens whether or not you install;
  installing simply makes it reachable without going through a browser.
- **Saved settings become durable.** Column mappings, splits, bin definitions and the theme
  live in browser storage, which a browser is entitled to evict when it needs space.
  Installed apps are granted persistent storage, so they are not discarded.
- **The user guide's screenshots are not part of the offline cache.** The guide text works
  offline; its screenshots need a network connection the first time each one is shown, and may
  appear broken offline on a machine that has not displayed them before. The guide opens in a
  separate window, which browsers place outside the offline cache's reach — so this is a
  limitation we cannot cache our way around, not an oversight. The guide is also published in
  full at [wafertools.github.io/tsmap/user-guide](https://wafertools.github.io/tsmap/user-guide/).

### Updating an installed app

When a new version is published, tsmap shows a prompt offering to update. It never updates
by itself, because updating reloads the app and **the browser build cannot re-read your
files** — anything currently loaded would be lost. Choose *Not now* and it will ask again
next time.

Your data is never part of this. Files you open are read in the browser and never uploaded,
installed or not.

## Hosting tsmap on your own server

The browser build is a plain static site, so you can serve it from your own intranet instead
of using ours. This is the right choice when the machines that need tsmap cannot reach the
public internet, or when policy says lot data must not touch an external origin.

The hosted app is now offline-capable in its own right (see
[Installing tsmap as an app](#installing-tsmap-as-an-app)), so this is no longer the only way
to get that. It remains the stronger one: a service-worker cache belongs to one browser
profile on one machine and can still be cleared, whereas a copy on your own server is
reachable from every machine on the network, survives a wiped profile, and never involves
`wafertools.github.io` at all — which is usually the point when policy is what is driving
the decision.

**Download** `tsmap-<version>-web.zip` from the
[latest release](https://github.com/wafertools/tsmap/releases/latest). It is the same
application published at [/app/](https://wafertools.github.io/tsmap/app/), packaged for
self-hosting.

1. Unpack it into any directory your web server serves, e.g. `/var/www/html/tools/tsmap/`.
2. Browse to it: `http://your-server/tools/tsmap/`.

That is the whole procedure. There is no installer, no server-side component, no database and
no build step. The bundle uses relative paths, so it works from the server root or any
subdirectory, over http or https. It requests no external site at any point — installation
included — and needs no cookies, no special headers and no cross-origin isolation.

Files are parsed in the browser by the same WebAssembly parser the hosted version uses, so
nothing is uploaded to your server either. It only ever serves the application.

### Three things that catch people out

**`.wasm` must be served as `application/wasm`.** The parser is WebAssembly; if the server
sends it as `text/plain` or `application/octet-stream` the browser refuses to compile it and
tsmap opens to a blank page. nginx, Apache and Python's `http.server` are correct out of the
box. **IIS is not** — add the MIME type once, under *Server → MIME Types → Add…*, mapping the
extension `.wasm` to `application/wasm`.

**It must be served over `http://` or `https://`.** Opening `index.html` from the filesystem
(a `file://` URL) will not work — browsers block module scripts and web workers on that
scheme. Any web server will do.

**Offline use and app installation need `https://`.** They are built on a service worker,
which browsers only allow in a secure context — that means HTTPS, or `http://localhost`. Over
plain `http://` on an intranet hostname tsmap still works completely; it simply loads from the
server every time and cannot be installed. If that matters, give the host a certificate (an
internal CA is fine — it does not have to be publicly trusted).

### Updating

Replace the directory's contents with a newer bundle. Nothing persists on the server; each
user's preferences live in their own browser.

If you are serving over HTTPS, browsers will be holding a cached copy, so a user is not
switched to the new bundle the moment you replace it: tsmap notices the new version and offers
each user an update, which they accept when it suits them. That is deliberate — reloading
discards whatever they currently have loaded. Expect a short tail of users on the previous
version rather than an instant cut-over.

## Running locally

```bash
git clone https://github.com/wafertools/tsmap
cd tsmap
npm install
npm run dev:web   # opens at http://localhost:5301
```

Requires Node 22+ and Rust (for rebuilding the WASM parser — not needed just to run the dev server).
