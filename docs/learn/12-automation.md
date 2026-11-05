---
marp: true
theme: tsmap
paginate: true
title: "12 · Automation and integration"
description: Open data from a link or the command line, and manage definitions files and saved settings.
teaser: "The command line, links, and definitions files."
footer: Learn tsmap · 12 Automation
---

<!-- _class: title -->
<!-- _paginate: false -->

# Automation and integration

## Lesson 12

Learn tsmap

---

# In this lesson

If you open the same kind of data every day, or you want another tool to open it for you, clicking through the dialogs gets tiresome. This lesson shows how to open data from a link or the command line, and how to save your setup so you only have to make it once.

- Open data from a link or the command line
- Use the definitions files: tests, splits, bins and plots
- See and reset what tsmap remembers

---

<!-- _class: divider -->

# Opening data automatically

---

<!-- covers: tsmap guide › Opening data from a URL -->

# From a link
Another application, or a colleague's message, can open the web app on a data file. The link holds the address of the file:

`…/app/?dataUrl=<encoded URL>&dataFormat=csv`

Name the format: `stdf`, `atdf`, `csv`, `json`, `parquet` or `zip`.

---

<!-- covers: tsmap guide › Browser build: the data server must allow cross-origin requests (CORS) -->

# The lab link
The labs in these lessons use this kind of link. This one opens the sample CSV:

[Open the sample CSV](https://wafertools.github.io/tsmap/app/?dataUrl=https%3A%2F%2Fwafertools.github.io%2Ftsmap%2Fsamples%2Ftsmap-sample.csv&dataFormat=csv)

The data server must allow pages from other websites to read the file (this is called CORS). If the fetch fails, the log says so.

More in the [user guide](../user-guide.md#opening-data-from-a-url)

---

<!-- covers: tsmap guide › Command line -->

# The command line
On the desktop app, name files when you launch it, and they open without a single click:

`tsmap lot1.stdf lot2.stdf`
`tsmap lot1.stdf --splits my-splits.csv`
`tsmap lot1.stdf --plots my-plots.json`
`tsmap --url https://… --url-format stdf`

`tsmap --help` lists everything. Launching again hands the files to the running window.

---

# tsmap --help

The first lines of what it prints:

```text
tsmap [OPTIONS] [FILE...]

Options:
  --list <FILE>         A text file of data-file paths, one per line
  --tests <FILE>        A test-selection list; pre-fills the selector
  --splits <FILE>       A wafer-splits CSV, applied once loaded
  --bins <FILE>         A bin-definitions CSV, applied over the data
  --setup <FILE>        A setup file: diameter, edge exclusion, reticle, ...
  --plots <FILE>        A plots file, added to your saved plots
```

---

# More options

Options let a launch carry its own setup.

- `--wafer-diameter`, `--edge-exclusion`, `--reticle`: the dialogs' values, for that launch
- `--tests` fills in the test selector; `--list` reads a list of paths
- A `tsmap://open?url=…` link opens the desktop app from a web page

More in the [user guide](../user-guide.md#command-line)

---

<!-- covers: tsmap guide › Authentication -->

# Data behind a login

Data often sits behind a login, and a link should not carry a password.

- Use a presigned URL, which builds the access into the address
- `--url-headers auth.txt` sends a token from a file (desktop)
- See the [integration guide](../integrating-data-selection.md) and a [live demo](../demos/open-from-link.html)

---

<!-- covers: tsmap guide › File associations (desktop) -->

<!-- _class: split -->

# File associations

To open files by double-clicking them, use the desktop app. **Preferences → File associations…** opens `.stdf`, `.atdf` and `.parquet` files in tsmap. Nothing is associated until you tick it. It is not available in the browser.

![The desktop app's Preferences menu, with File associations… outlined](images/12/preferences-desktop.png)

---

<!-- _class: split -->

# The File associations window

One row per file type. A tick means double-clicking that type opens it in tsmap, and the path under it is the copy of tsmap that is registered. A **⚠** warns when that is a different copy from the one running, as after an upgrade or a dev build.

![The File associations window: STDF registered, ATDF not, and Parquet registered to another copy](images/12/file-associations.png)

---

<!-- _class: split -->
<!-- covers: Help › User guide; Help › Keyboard shortcuts…; Help › Definitions file formats…; Help › Support tsmap…; Help › About tsmap… -->

# The Help menu

- **User guide** opens the full guide
- **Keyboard shortcuts…** lists the keys; **?** opens it from anywhere
- **Definitions file formats…** is covered in the next section

![The Help menu](images/12/help-menu.png)

---

<!-- _class: split -->

# Keyboard shortcuts

**Help → Keyboard shortcuts…**, or **?** from anywhere, lists the keys for maps, galleries, windows and menus. Zooming, panning, **E** for an enlarged map and **1–5** for the columns of cards are all here.

![The Keyboard shortcuts window](images/12/shortcuts.png)

---

# The rest of the Help menu

- **Support tsmap…** opens the page on how to support the project
- **About tsmap…** shows the version

---

<!-- _class: split -->
<!-- covers: Preferences; Preferences › Export or import settings…; Preferences › Reset saved settings…; Preferences › ☐Record load timings; tsmap guide › Taking settings to another machine; Export or import settings… › Export…; Export or import settings… › Import…; Export or import settings… › Close -->

# The Preferences menu

The gear works with nothing loaded, so you can set things up before you open any data.

- **Export or import settings…** carries your column mappings and preferences to another machine

![The Preferences menu](images/12/preferences-menu.png)

---

<!-- _class: split -->

# Export or import settings

Use this to set up a second machine. **Export…** writes a file and **Import…** reads one. Column mappings merge at once; the other settings are chosen from a list, and tsmap then reloads. The window lists what is never included.

![The Export or import settings window: column mappings above, other saved settings below](images/12/settings-dialog.png)

---

# The rest of the Preferences menu

- **Reset saved settings…** is covered after the definitions files
- **Record load timings** is for bug reports only: it adds timing lines to the log. Leave it off otherwise

---

<!-- _class: divider -->

# Definitions files

---

<!-- _class: split -->
<!-- covers: tsmap guide › Definitions files; Definitions file formats… › Save a test definitions template; Definitions file formats… › Save a plots template; Definitions file formats… › Save a splits template; Definitions file formats… › Save a bin definitions template; Definitions file formats… › Save a setup template -->

# Definitions file formats…

Earlier lessons used files that tell tsmap about your data: test names and limits, splits, plots, bin names. This window lists all five kinds. Each has a **Save template…** button that writes a filled-in example in the exact layout tsmap reads.

![The Definitions file formats window](images/12/definitions-formats.png)

---

# Start from a template

You can save a template and edit it before you have any data. It is the easiest way to get a layout right.

---

<!-- covers: tsmap guide › Test definitions file; tsmap guide › Splits file; tsmap guide › Bin definitions file; tsmap guide › Sweeps in a plots file -->

# Four CSV files and one JSON
Where each is covered:

- CSV: test definitions (lesson 01), splits (04), bin definitions and the setup file (here)
- JSON: plots and sweeps (10)
- Every format is in the [user guide](../user-guide.md#definitions-files)

---

<!-- covers: tsmap guide › Saving the setup; tsmap guide › Setup file; Setup ▾ › Setup file…; Setup file… › Save…; Setup file… › Load…; Setup file… › Load a recently used definitions file; Setup file… › Close -->

# Setup file…

If you set the same geometry for every lot of a product, save it once. The last rows of **Setup ▾** (diameter, edge exclusion, reticle, retests, value filter) can be saved as one file for a product or a site, and loaded again from **Setup ▾ → Setup file…**: **Save…** writes it, **Load…** reads one, and the **▾** lists recent files. On the command line, `--setup` applies one for a single launch.

---

# The Setup file window

![The Setup file window with Save…, Load… and the list of recent files](images/12/setup-file.png)

---

<!-- _class: split -->
<!-- covers: Bin definitions… › Save…; Bin definitions… › Load…; Bin definitions… › Load a recently used definitions file -->

# Saving and loading bin definitions

The Bin definitions window ([lesson 04](04-the-lot-view.md)) saves and loads files, and a loaded file lands as edits you can check before **Apply**. <span class="badge" role="img" aria-label="callout 1">1</span> **Save…** writes them to a CSV file. <span class="badge" role="img" aria-label="callout 2">2</span> **Load…** reads one. <span class="badge" role="img" aria-label="callout 3">3</span> The **▾** lists recently used files.

![The Bin definitions window, with its three buttons outlined](images/12/bin-definitions.png)

---

<!-- covers: Colour scheme › ✓Use colours from bin definitions -->

# STDF, ATDF and the rest

A table has only bin numbers, so every bin is a bare number until you load definitions. STDF and ATDF files can carry bin names, but you can load definitions for them as well. Bin colours from a file can be switched off under **Colour scheme**.

---

<!-- covers: Load bin definitions…; Name bins… -->

# In the column mapping

For a table, you can name the bins in the column mapping before you continue: **Name bins…** opens the bin table over the bins in the sample of rows it holds (add a rare one by number), and **Load bin definitions…** reads a file. Both are next to **Pass bin(s)**.

![The column mapping's footer, with Name bins… and Load bin definitions… outlined](images/12/mapping-bin-definitions.png)

---

<!-- _class: split -->
<!-- covers: tsmap guide › Recently used definitions files -->

# Recent definitions files

- The **▾** beside **Load…** lists recent files of that kind
- In the browser an entry is a copy from when you last used it
- Changed since? Use **Choose a file…** to pick it again

![The menu opened by the arrow beside Load…, listing a recent file](images/12/recent-definitions.png)

---

<!-- _class: divider -->

# What tsmap remembers

---

<!-- _class: split -->
<!-- covers: tsmap guide › What tsmap remembers, and how to forget it; Reset saved settings… › stored item; Reset saved settings… › Select all; Reset saved settings… › Forget selected; Reset saved settings… › Cancel -->

# Reset saved settings…

tsmap keeps a lot between sessions, which is convenient until you want a clean start.

- Theme, splits, mappings, plots, filters, geometry: kept on this machine
- The window lists what is stored now

![The Reset saved settings window](images/12/reset-settings.png)

---

<!-- _class: split -->

# Forgetting settings

On the desktop app the list also holds **Recently opened files**.

![The Reset saved settings window on the desktop app, with Recently opened files in the list](images/12/reset-settings-desktop.png)

Tick the items you want to forget, then choose **Forget selected**. **Reset saved settings…** is also the way to undo anything an earlier lab left behind.

---

# Nothing is sent anywhere

Loaded wafer data is not affected by a reset. Saved settings stay on this machine, and tsmap does not upload your data.

---

<!-- _class: lab -->

# Try it yourself

1. Open **Help → Definitions file formats…** and save the splits template
2. On the sample lot, open **Setup ▾ → Bin definitions…** and **Save…**
3. *Optional, desktop app only:* in a terminal run `tsmap --help`, then `tsmap sample.stdf` with any STDF file to open it from the command line
4. Open **Preferences → Reset saved settings…** and read the list of what is stored, then **Cancel**

---

# Recap

- A link or the command line opens data with no clicking
- Templates show the exact layout of every definitions file
- **Reset saved settings…** shows and forgets what tsmap remembers

That is the whole app, from loading a file to automating it.

More in the [user guide](../user-guide.md#reference)

---

<!-- _class: next -->
<!-- _paginate: false -->

# That is every lesson

Back to [the start](00-welcome.md), or open the app and try your own data.

wafermap is the library tsmap is built on. To use it in your own application, see the [wafermap documentation](https://wafertools.github.io/wafermap/), [quickstart](https://wafertools.github.io/wafermap/quickstart/) and [developer guide](https://wafertools.github.io/wafermap/guide/).
