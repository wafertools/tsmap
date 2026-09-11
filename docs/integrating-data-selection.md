# Integrating tsmap with a data-selection system

This guide describes the **URL-based** way a data-selection application can open a selected lot or
wafer directly in tsmap. It is intended for systems whose data API currently uses an API key in a
request header, as well as systems that can issue short-lived download links.

URL import is one integration option, not the only way to use tsmap. The desktop application can
also open local filenames passed on its command line, filenames listed in a list file, and files a
user selects manually in the application. Those approaches can be appropriate when the selection
system first downloads or stages files locally; this guide focuses on avoiding that manual
download/import step.

**[Try the live demo →](demos/open-from-link.html)** It generates the browser `?dataUrl=`
link and the desktop `tsmap://open?url=...` link for a chosen sample dataset, so you can see
both launch paths working end to end before wiring one up.

## What tsmap does

tsmap is a wafer-map visualisation tool for STDF, ATDF, CSV, JSON, and Parquet data. It is
available as a browser app and a native desktop app for Windows, macOS, and Linux.

Both versions can fetch data from a URL and then run the normal tsmap loading flow: column
mapping where required, test selection, and the wafer-map/gallery views. No data is uploaded to
a tsmap service. The desktop application does materialise a fetched response as a temporary local
file while it is being loaded.

## The direct integration

After a user selects one or more lots or wafers, the selection system provides tsmap with one URL
that returns the selected data:

- **Browser:** `https://<tsmap-host>/?dataUrl=<URL-encoded-data-URL>&dataFormat=<format>`
- **Desktop CLI:** `tsmap --url <data-URL> --url-format <format>`
- **Desktop from a web page:**
  `tsmap://open?url=<URL-encoded-data-URL>&format=<format>`

`<format>` is one of `stdf`, `atdf`, `csv`, `json`, `parquet`, or `zip`.

One response may contain multiple wafers or lots. This is the preferred way to represent a
multi-selection: have the endpoint return one combined, supported file/response. A URL launch
currently performs one fetch; it cannot combine several separate endpoints into one tsmap
session. What that one response can be:

- **A `zip` of several files** — for example one STDF per lot. tsmap unpacks it and loads
  every file inside, exactly as if they had been opened together. **This is the recommended
  way to return several STDF or ATDF lots.** Both formats define one lot record (MIR) per
  file, so a file per lot keeps each lot's bin names and pass/fail bins (HBR/SBR) and its
  test-selection scan to itself.
- **One CSV, JSON or Parquet table holding several lots.** Map a lot column: each wafer is
  then identified by lot + wafer ID, so two lots' W01 stay two separate wafers. Other mapped
  columns (temperature, test program, …) are recorded per wafer. If the same wafer appears
  more than once — tested at two temperatures, say — and a mapped column tells the passes
  apart, each pass becomes its own wafer map; otherwise the repeats are treated as retests and
  the log says so.
- **One STDF or ATDF stream with several lot records (MIR)**, which some systems produce by
  concatenating files. This is outside the spec and is handled as a fallback: each wafer is
  labelled with the lot record it was tested under, but the bin summaries (HBR/SBR) of every
  lot are merged into one set, and the test-selection step lists only one lot's details.
  Prefer a zip.

For CSV, JSON, and Parquet, tsmap can map the source columns to its expected fields. The data
must nevertheless contain the logical die/wafer/test information needed to produce a wafer map;
column mapping cannot turn unrelated data into supported wafer data.

## Authentication: choose an architecture

The key principle is that a long-lived API key stays on a trusted server or a managed desktop —
not in a browser URL or a `tsmap://` link. The following options are practical for an API that
today requires, for example, `X-Api-Key` or `Authorization`.

### Option 1 — issue a short-lived download URL

Use this when the selection system can expose a download endpoint that is already authorised by a
short-lived URL token. On selection, the system creates a URL limited to the selected data and a
short expiry, then opens tsmap with it.

```text
Selection page
  → https://downloads.example.internal/tsmap/exports/eyJ...?
      expires=2026-08-15T11:05:00Z
  → tsmap browser or desktop fetches that URL
```

For the browser, the selection page opens:

```text
https://tsmap.example.internal/?dataUrl=https%3A%2F%2Fdownloads.example.internal%2Ftsmap%2Fexports%2FeyJ...&dataFormat=parquet
```

For desktop, it may open:

```text
tsmap://open?url=https%3A%2F%2Fdownloads.example.internal%2Ftsmap%2Fexports%2FeyJ...&format=parquet
```

**Advantages:** simplest experience; works with both tsmap versions; no API key on the client.

**Implementation notes:** the generated URL is a bearer capability. Make it HTTPS-only,
short-lived, limited to one selection and read-only; do not include a long-lived API key in it.
URLs normally remain reusable until they expire unless the download service explicitly records and
rejects reuse. The browser version also needs CORS if the download host differs from the tsmap
host.

### Option 2 — add a download proxy in front of the existing API (recommended for a header-only API)

This works even if the current wafer-data API cannot be changed. Add a small server endpoint to
the existing selection system. It uses the system's existing user session to authorise the request,
then calls the upstream API with the server-held API key.

```text
User → selection page → download proxy → existing wafer-data API
                         user session       X-Api-Key: kept on server
```

For example, after the user selects two lots, the selection system could create or redirect to:

```text
https://selection.example.internal/tsmap-export/4f8a2c
```

The proxy checks that the requesting user may read the selection represented by `4f8a2c`, fetches
the two lots from the upstream API using `X-Api-Key`, and returns one combined Parquet, JSON, or
STDF response. It can either make `4f8a2c` a short-lived bearer token for tsmap, or first issue a
short-lived URL as described in Option 1.

**Advantages:** no upstream API change; one approach supports web and desktop; API key never
leaves server-side infrastructure.

**Implementation notes:** the proxy must perform authorisation itself, apply expiry and audit
rules, and be sized to stream or prepare large exports. If tsmap is hosted on another origin, add
CORS for the tsmap origin; hosting the proxy and tsmap under the same origin avoids that.

### Option 3 — same-origin gateway using existing browser SSO

This is a variant of Option 2 for a browser-first deployment. Host tsmap and a gateway route under
the same HTTPS origin, so ordinary session cookies/SSO authenticate the browser request.

```text
https://tools.example.internal/tsmap/
https://tools.example.internal/tsmap-data/selection/4f8a2c
```

The selection page opens:

```text
https://tools.example.internal/tsmap/?dataUrl=%2Ftsmap-data%2Fselection%2F4f8a2c&dataFormat=parquet
```

The browser sends its normal same-origin session cookie to `/tsmap-data/...`; the gateway checks
it and adds the API-key header only for its server-to-server call to the wafer-data API.

**Advantages:** no CORS configuration between tsmap and the gateway; integrates naturally with an
existing company login.

**Limitations:** primarily a browser pattern. For desktop, use an absolute short-lived URL and
ensure the endpoint has an appropriate non-browser authorisation mechanism; desktop does not share
the browser's session cookie.

### Option 4 — desktop-only command-line integration with headers

For automated or managed desktop workflows, a local script or launcher can invoke tsmap with a
headers file that already exists on the machine:

```bash
tsmap --url https://wafer-api.example.internal/v1/exports/lot-123 \
  --url-format parquet \
  --url-headers /etc/company-tsmap/wafer-api.headers
```

```text
# /etc/company-tsmap/wafer-api.headers
X-Api-Key: example-key
```

**Advantages:** works with the existing header-only API now; CORS does not apply to desktop.

**Limitations:** this is not a safe general web-page-click integration. A `tsmap://` link cannot
carry the header or a headers-file path. The file is plaintext and needs OS-level permission
controls; it is best suited to managed machines and narrow-scope, rotated credentials.

### Quick comparison

| Option | Browser | Desktop | Upstream API change | Best fit |
|---|---|---|---|---|
| Short-lived download URL | Yes; CORS if cross-origin | Yes | Often no — may be issued by a gateway | Simple direct integration |
| Download proxy | Yes; CORS if cross-origin | Yes | No | Existing header/API-key API |
| Same-origin gateway | Yes | Not with browser session alone | No | Browser-first SSO deployment |
| CLI headers file | No | Yes | No | Managed scripts and automation |

## Browser-specific requirements

The browser version fetches the `dataUrl` directly. If its data URL is on a different origin,
the endpoint must allow tsmap's origin with CORS, for example:

```
Access-Control-Allow-Origin: https://<tsmap-host>
```

A same-origin proxy avoids this cross-origin requirement. The browser integration cannot accept an
arbitrary API-key or bearer-token header through the tsmap launch URL. Do not put a long-lived API
key in a query string: URLs can be retained in browser history, logs, bookmarks, monitoring tools,
and referrer data.

The browser uses an ordinary fetch. Same-origin browser session credentials (such as cookies) may
be sent according to normal browser rules, but tsmap does not add custom authentication headers.

## Desktop-specific requirements

The desktop application fetches outside the browser, so CORS does not apply. It supports custom
headers for a command-line launch:

```bash
tsmap --url https://data.example.internal/export/lot-123 \
  --url-format parquet \
  --url-headers /path/to/headers.txt
```

`headers.txt` contains one header per line:

```
X-Api-Key: example-key
```

The value is not placed in the command line, but the file is plaintext. Restrict its permissions,
avoid long-lived broad-scope credentials, and use a credential manager in any custom launcher.

The `tsmap://` link is intentionally limited to a URL and format. It cannot securely carry an API
key or the contents/path of a headers file, so it requires a self-authenticating URL (or a gateway
that does not require client-supplied headers).

## Possible tsmap enhancement

No tsmap changes are needed for Options 1–4. One possible future enhancement is:

| Enhancement | Benefit | Trade-off |
|---|---|---|
| **Multiple URL inputs per launch** | Lets a selection system retain one endpoint per lot rather than producing a combined response | Requires decisions about partial failures, ordering, mapping, and test-selection behaviour. |

## Decision guide

- If you can issue a short-lived URL for the selected data, use Option 1. It gives the cleanest
  web and desktop integration.
- If the upstream API must remain header/API-key-only, use Option 2. This is the recommended route
  for both web and desktop users.
- For a browser-first system with existing SSO, Option 3 avoids cross-origin complexity.
- If the workflow is desktop-only and managed, Option 4 is a viable interim solution.
- If the API cannot be changed and no proxy/launcher can be deployed, direct browser launching is
  not suitable for header-authenticated data.

## Information to confirm during implementation

1. Can a selected multi-lot set be returned as one supported response?
2. Which identity/session mechanism authorises the requesting user?
3. Can the selection system operate a gateway or issue a short-lived, scoped download capability?
4. For browser use, what origin will host tsmap and what CORS policy will the data endpoint use?
5. What expiry, scope, audit logging, and revocation behaviour is required for generated links or
   tokens?
