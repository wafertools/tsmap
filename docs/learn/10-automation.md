---
marp: true
theme: tsmap
paginate: true
title: "10 · Automation and integration"
description: Open data from a link or the command line, and manage definitions files and saved settings.
footer: Learn tsmap · 10 Automation
---

<!-- _class: title -->
<!-- _paginate: false -->

# Automation and integration

## Lesson 10

Learn tsmap

---

# In this lesson

- Open data from a link or the command line
- Use the definitions files: tests, splits, bins and plots
- See and reset what tsmap remembers

---

<!-- _class: divider -->

# Opening data automatically

---

<!-- covers: tsmap guide › Opening data from a URL -->

# From a link
Another application can open the web app on a data file:

`…/app/?dataUrl=<encoded URL>&dataFormat=csv`

Name the format: `stdf`, `atdf`, `csv`, `json`, `parquet` or `zip`.

---

<!-- covers: tsmap guide › Browser build: the data server must allow cross-origin requests (CORS) -->

# The lab link
The labs in these lessons use it. This opens the sample CSV:

[Open the sample CSV](https://wafertools.github.io/tsmap/app/?dataUrl=https%3A%2F%2Fwafertools.github.io%2Ftsmap%2Fsamples%2Ftsmap-sample.csv&dataFormat=csv)

The data server must allow pages from other websites to read the file (this is called CORS). If the fetch fails, the log says so.

More in the [user guide](../user-guide.md#opening-data-from-a-url)

---

<!-- covers: tsmap guide › Command line -->

# The command line
On the desktop app, name files when you launch it:

`tsmap lot1.stdf lot2.stdf`
`tsmap lot1.stdf --splits my-splits.csv`
`tsmap lot1.stdf --plots my-plots.json`
`tsmap --url https://… --url-format stdf`

`tsmap --help` lists everything. Launching again hands the files to the running window.

---

# More options

- `--wafer-diameter`, `--edge-exclusion`, `--reticle`: the dialogs' values, for that launch
- `--tests` fills in the test selector; `--list` reads a list of paths
- A `tsmap://open?url=…` link opens the desktop app from a web page

More in the [user guide](../user-guide.md#command-line)

---

<!-- covers: tsmap guide › Authentication -->

# Data behind a login

- A link carries no password: use a presigned URL
- `--url-headers auth.txt` sends a token from a file (desktop)
- See the [integration guide](../integrating-data-selection.md) and a [live demo](../demos/open-from-link.html)

---

<!-- covers: tsmap guide › File associations (desktop) -->

# File associations
On the desktop app, **Help → File associations…** opens `.stdf`, `.atdf` and `.parquet` files in tsmap by double-click. Nothing is associated until you tick it. It is not available in the browser.

---

<!-- _class: divider -->

# Definitions files

---

<!-- _class: split -->
<!-- covers: Help › User guide; Help › Definitions file formats…; Help › ☐Log phase timings; Help › Reset saved settings…; Help › About tsmap… -->

# The Help menu

**User guide** opens the full guide in its own window. **Log phase timings** adds timing lines to the log while a file loads, which helps when reporting a slow load. **About tsmap…** shows the version. The other two entries are covered on the next slides.

![The Help menu](images/10/help-menu.png)

---

<!-- _class: split -->
<!-- covers: tsmap guide › Definitions files; Definitions file formats… › Save a test definitions template; Definitions file formats… › Save a plots template; Definitions file formats… › Save a splits template; Definitions file formats… › Save a bin definitions template -->

# Definitions file formats…

Four kinds of file, each with a **Save template…** button that writes a filled-in example in the exact layout tsmap reads. You can save a template and edit it before you have any data.

![The Definitions file formats window](images/10/definitions-formats.png)

---

<!-- covers: tsmap guide › Test definitions file; tsmap guide › Splits file; tsmap guide › Bin definitions file; tsmap guide › Sweeps in a plots file -->

# Three CSV files and one JSON
- CSV: test definitions (lesson 01), splits (04), bin definitions (here)
- JSON: plots and sweeps (08)
- Every format is in the [user guide](../user-guide.md#definitions-files)

---

<!-- _class: split -->
<!-- covers: tsmap guide › Bin definitions; Setup ▾ › Bin definitions…; Bin definitions… › Save…; Bin definitions… › Load…; Bin definitions… › Load a recently used definitions file -->

# Bin definitions…

A name for each hard or soft bin, whether a hard bin passes, and optionally its map colour. <span class="badge">1</span> **Save…** writes them to a CSV file. <span class="badge">2</span> **Load…** reads one. <span class="badge">3</span> The **▾** lists recently used files.

![The Bin definitions window, with its three buttons outlined](images/10/bin-definitions.png)

---

<!-- covers: Colour scheme › ✓Use colours from bin definitions -->

# STDF, ATDF and the rest

STDF and ATDF name their bins; in a table every bin is a bare number until you load definitions. Bin colours from a file can be switched off under **Colour scheme**.

---

<!-- covers: Load bin definitions… -->

# In the column mapping

For those formats, load the file in the column mapping before you continue, next to **Pass bin(s)**.

![The column mapping's footer, with Load bin definitions… outlined](images/10/mapping-bin-definitions.png)

---

<!-- _class: split -->
<!-- covers: tsmap guide › Recently used definitions files -->

# Recent definitions files

- The **▾** beside **Load…** lists recent files of that kind
- In the browser an entry is a copy from when you last used it
- Changed since? Use **Choose a file…** to pick it again

![The menu opened by the arrow beside Load…, listing a recent file](images/10/recent-definitions.png)

---

<!-- _class: divider -->

# What tsmap remembers

---

<!-- _class: split -->
<!-- covers: tsmap guide › What tsmap remembers, and how to forget it; Reset saved settings… › stored item; Reset saved settings… › Select all; Reset saved settings… › Forget selected; Reset saved settings… › Cancel -->

# Reset saved settings…

- Theme, splits, mappings, plots, filters, geometry: kept on this machine
- The window lists what is stored now
- Tick items, then **Forget selected**

![The Reset saved settings window](images/10/reset-settings.png)

---

# Nothing is sent anywhere

Loaded wafer data is not affected by a reset. Saved settings stay on this machine, and tsmap does not upload your data.

---

<!-- _class: lab -->

# Try it yourself

1. Open **Help → Definitions file formats…** and save the splits template
2. On the sample lot, open **Setup ▾ → Bin definitions…** and **Save…**
3. Open the [sample CSV link](https://wafertools.github.io/tsmap/app/?dataUrl=https%3A%2F%2Fwafertools.github.io%2Ftsmap%2Fsamples%2Ftsmap-sample.csv&dataFormat=csv)
4. Open **Help → Reset saved settings…** and read the list of what is stored, then **Cancel**

---

# Recap

- A link or the command line opens data with no clicking
- Templates show the exact layout of every definitions file
- **Reset saved settings…** shows and forgets what tsmap remembers

More in the [user guide](../user-guide.md#reference)

---

<!-- _class: next -->
<!-- _paginate: false -->

# That is every lesson

Back to [the start](00-welcome.md), or open the app and try your own data.

wafermap is the library tsmap is built on. To use it in your own application, see the [wafermap documentation](https://wafertools.github.io/wafermap/), [quickstart](https://wafertools.github.io/wafermap/quickstart/) and [developer guide](https://wafertools.github.io/wafermap/guide/).
