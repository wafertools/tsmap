---
marp: true
theme: tsmap
paginate: true
title: "01 · Getting data in"
description: Sample data, file formats, opening, adding and scanning files, the test selector, column mapping, the colour theme and the log.
teaser: "Opening your own files, choosing tests and mapping columns."
footer: Learn tsmap · 01 Getting data in
---

<!-- _class: title -->
<!-- _paginate: false -->

# Getting data in

## Lesson 01

Learn tsmap

---

# In this lesson

Most of the time, opening a file is a simple drag and drop. This lesson also covers the cases where you need more: many files, or a table whose columns tsmap has to be told about.

- Open files from inside the app, and build one lot from several files
- Choose and rename tests in the test selector
- Map the columns of a CSV, JSON or Parquet file

---

<!-- _class: divider -->

# Opening test data files

---

<!-- covers: Load sample data; tsmap guide › Sample files -->

# The quickest start

**Load sample data** opens an example lot: 25 wafers from five process corners. More sample lots, one per feature, are listed in the [user guide](../user-guide.md#sample-files).

![The start screen, with Load sample data outlined](images/01/load-sample.png)

---

# What tsmap reads

Whatever test data you have, you can probably open it in tsmap.

- **STDF** and **ATDF**: tester files, read directly
- **CSV**, **JSON** and **Parquet**: tables, after a simple column mapping step
- **.gz**, **.bz2** and **.zip**: compressed files are read without unpacking first

---

<!-- covers: tsmap guide › Drag and drop -->

# Drag and drop

Drop one or more files anywhere in the window. It is the same as picking them. In the desktop app, dropping a folder scans it.

![The start screen: both drop hints outlined](images/01/drop-anywhere.png)

---

<!-- covers: tsmap guide › Open files; Open files ▾; Open files ▾ › Choose files…; Open files ▾ › Scan a folder… -->

# Open files ▾

**Open files ▾** opens a menu that offers **Choose files…** or **Scan a folder…**

![The Open files menu](images/01/open-menu.png)

---

<!-- covers: tsmap guide › Recent files -->

# Recent files

*Desktop app only.*

The last 8 file sets you opened are listed on the start screen, with when you opened each. Click one to open it again, or **×** to forget it.

![The desktop app's start screen with three recent file sets](images/01/recent-start.png)

---

<!-- _class: split -->

# Recent files in the menu

Once data is loaded the start screen is gone, so the same list sits under **Open files ▾**, below **Choose files…** and **Scan a folder…**. Opening a recent set replaces what is loaded. **Add files ▾** has no list, because adding from a recent set is not offered.

![The Open files menu in the desktop app, with Recent below the two choices](images/01/recent-menu.png)

---

<!-- _class: divider -->

# Scanning a folder

Hundreds of files? Let tsmap tell you what is in them before you load any.

---

<!-- _class: split -->
<!-- covers: tsmap guide › Scanning a folder; Filter files › Sort by column; Filter files › Filter by column; Columns ▾; Clear filters -->

# The file filter

Scanning a folder reads only each file's header data, so it is quick even for a big batch. You then choose what to load.

- Click a column heading to sort; click **▾** to filter that column
- Search across every column

![The file filter after scanning six files](images/01/file-filter.png)

---

<!-- covers: Select all; Select none; Invert; Load selected…; Save filter…; Load filter… -->

# Select, then load

The usual routine: search for a string like **EDGE**, **Select all** of what is shown, then **Load selected…**. You load only the files you want.

![Two of the six files selected](images/01/file-filter-selected.png)

---

# Filters you use again

- **Save filter…** keeps the filters in a file; **Load filter…** reselects matching rows
- A mixed folder: buttons above the table pick which kind of file to load
- Pick more than five files with **Open files** and tsmap offers this filter table

---

<!-- covers: tsmap guide › Wafer rename overlay -->

# Naming the wafers

When you load several files at once, tsmap suggests a label per wafer. A plain ID such as W01 gets its lot in front, so two lots' W01 stay separate, instead of being mistaken for one wafer. Edit any label, then **Continue →**

![The wafer labels step for the two EDGE-LOT-01 files](images/01/wafer-labels.png)

---

# One lot from separate files

The two files of EDGE-LOT-01 hold one wafer each, and they load as one lot, `EDGE-LOT-01`. The six files used here are in the scan-folder zip on the [sample files page](https://wafertools.github.io/tsmap/web/#try-it-with-sample-data).

![Two wafers of EDGE-LOT-01, loaded from two files](images/01/scanned-lot.png)

---

<!-- covers: Add files ▾; Add files ▾ › * -->

<!-- covers: tsmap guide › Adding files to an existing lot -->

# Add files

**Add files** appends wafers to what is already loaded. The confirmation warns when the new wafers differ from the ones you have: another die count, other bins, or a wafer ID that's already loaded. Read it and confirm before you continue, because mixing unlike wafers can mislead.

![The confirmation before adding a wafer](images/01/add-confirm.png)

---

# The lot grows

Once the third file is added, its wafer joins the same gallery, Summary and yield.

![Three wafers of EDGE-LOT-01, the added one outlined](images/01/merged-lot.png)

---

# Test units across files

When files are combined, a test can arrive in different units.

- One file in mV and another in V? tsmap converts the later file to the first file's unit, and the log says so
- Any other difference, `mV` against `MV` included, may be another measurement. That test is left out of the views that compare wafers, so unlike numbers are never compared.

---

# Two more ways to open test data

- **A link** that tells the web app which files to load
- **The command line**, which opens the files you name in the desktop app

Both are in [lesson 12](12-automation.md).

---

<!-- _class: divider -->

# Choosing tests

---

<!-- covers: Setup ▾; Setup ▾ › Tests…; tsmap guide › Test selector (STDF and ATDF) -->

# The test selector

A test program can have hundreds or thousands of tests, and you rarely need them all at once. The test selector is where you choose what you need to analyse. A small lot imports every test by default, and **Setup ▾ → Tests…** opens the selector at any time.

![The test selector for the sample lot](images/01/test-selector.png)

---

<!-- covers: Edit limits…; tsmap guide › Editing limits, units and type -->

# Edit limits…

**Edit limits…** in the selector opens a table of every test, where you can change its name, limits, units and type before the tests are imported. [Lesson 02](02-reading-a-map.md) explains test and spec limits, then walks through the table.

---

<!-- _class: split -->
<!-- covers: All; Parametric; Functional; Select range; Test selector › test row; tsmap guide › Controls -->

# Narrow, then select

- <span class="badge" role="img" aria-label="callout 1">1</span> Search by name or number
- <span class="badge" role="img" aria-label="callout 2">2</span> Show one type of test
- <span class="badge" role="img" aria-label="callout 3">3</span> Select a range, such as `1001-1004`

![The selector's search, type filter and range box, each numbered](images/01/selector-filters.png)

---

<!-- covers: tsmap guide › Memory advisory; tsmap guide › Changing the selection after load -->

# Big lots start with no tests selected

Every test you import costs memory, so a large lot asks you to choose before it loads.

- A lot with many tests opens the selector first, nothing ticked
- The footer estimates memory: amber is slow, red asks first

---

# Many files, many tests

- Several files: **Scan all N files** lists tests from every file
- Later, removing a test applies at once; adding one rereads the files

---

<!-- covers: Apply to N tests →; Close; tsmap guide › Renaming a test -->

# Rename a test

Test names from a tester can be cryptic. Click into a name and type a clearer one. **Enter** keeps it; only the displayed name changes, not the data.

![Test 1006 renamed to Max frequency](images/01/test-rename.png)

---

<!-- covers: Save definitions; Load definitions; Load a recently used definitions file; tsmap guide › Saving and loading test definitions -->

# Save and load definitions

<span class="badge" role="img" aria-label="callout 4">4</span> **Save definitions** writes the selection, names, limits, units and test type to a CSV. <span class="badge" role="img" aria-label="callout 5">5</span> **Load definitions** reapplies it, which also gives limits to a program that shipped without them.

![The selector's Save definitions and Load definitions buttons](images/01/selector-definitions.png)

---

<!-- _class: divider -->

# Mapping columns

CSV, JSON and Parquet only

---

<!-- covers: tsmap guide › What happens next -->

# Not for STDF or ATDF

STDF and ATDF name every field in their records, so they go straight to the test selector without any need for column mapping.

A CSV, JSON or Parquet table can lay its columns out any way, so tsmap has to ask which column is the X position, which is the bin, and so on.

---

<!-- covers: Column mapping › Role; Continue →; tsmap guide › Column mapping (CSV, JSON, and Parquet) -->

# Column mapping

Every column gets a role. Common names are detected for you, so most of the time you only need to check that they are right, then **Continue →**

![The column mapping for a wide CSV](images/01/mapping-wide.png)

---

<!-- covers: tsmap guide › Wide vs long format -->

# Wide format

In wide format there is one column per test. Each test column takes the **Test value** role <span class="badge" role="img" aria-label="callout 1">1</span>.

![A test column with the Test value role](images/01/mapping-test-value.png)

---

# Long format

In long format there is one row per die per test: a test number or name column, and a result column.

![A long-format CSV: test_num and test_val outlined](images/01/mapping-long.png)

---

<!-- covers: tsmap guide › Role reference; tsmap guide › Dies with no position -->

# Roles worth knowing

Most columns are a test value or something to ignore. A few roles do more.

- **Lot ID**: map it so two lots' W01 stay two separate wafers
- **Pass/fail test**: a PASS/FAIL column, chosen for you
- **Display info**: a wafer fact, such as temperature, to group by
- **X** and **Y** are optional: without them, dies have no position

---

<!-- covers: Shown → Test value; Shown → Ignore -->

# Many columns at once

<span class="badge" role="img" aria-label="callout 1">1</span> Filter the columns by name, then give every shown column one role: <span class="badge" role="img" aria-label="callout 2">2</span> **Test value** or <span class="badge" role="img" aria-label="callout 3">3</span> **Ignore**.

![The column filter and the two bulk buttons](images/01/mapping-bulk.png)

---

<!-- covers: tsmap guide › Pass bins; glossary › Pass bin / passBins -->

# Pass bins

**Pass bin(s)** says which hard bins count as a pass, and the yield figure follows it. The default is 1. If your program passes in another bin, or several, list them with commas, such as `1,7`.

![The Pass bin(s) field at the foot of the column mapping](images/01/mapping-pass-bins.png)

---

<!-- covers: Reset to auto-detected; tsmap guide › Saved mappings -->

# Saved mappings

The roles you confirm are remembered for that set of columns, so the next file with the same columns needs no checking. **Reset to auto-detected** forgets them.

![The same file again: the saved mapping applied](images/01/mapping-saved.png)

---

<!-- _class: split -->

# Long format asks first

When you press **Continue →** on a table in which several rows share the same X and Y, tsmap says it looks like long format and offers to **Render as long format**, pivoting it to one column per test. **Cancel** returns you to the mapping.

![The Long-format CSV detected prompt](images/01/long-format-prompt.png)

---

<!-- _class: split -->

# No position columns

With no X or Y column, tsmap asks before it carries on. **Continue without position data** shows each wafer as a bin and value summary and a die list, not a map. Yield, histograms and correlation work as normal; only spatial analysis, such as rings and clusters, is unavailable.

![The No X/Y columns assigned prompt](images/01/no-position-prompt.png)

---

# Bin names

A file may carry only bin numbers. Tables show them as bare numbers until you name them in **Bin definitions…** or load a bin definitions file, which also names the bins in the legend. Lesson [04](04-the-lot-view.md) covers the window and lesson [12](12-automation.md) the files.

---

<!-- _class: divider -->

# Making it yours

---

<!-- _class: side -->
<!-- covers: Colour theme; tsmap guide › The toolbar and colour theme -->

# Colour theme

Choose a colour theme. Auto follows your system, or pick a light or dark theme. Your choice is remembered.

![The colour theme list](images/01/theme-menu.png)

---

# The whole app follows

Maps, charts and panels all take the theme's colours.

![The sample CSV in the Dark theme](images/01/theme-dark.png)

---

<!-- covers: Log; Log (with new-warning count); tsmap guide › The log panel -->

# The log panel

The log panel shows what each load did. Warnings are counted on the **Log** button until you open it.

![The log panel, open](images/01/log-panel.png)

---

# Copy the log

Right-click in the log for **Select all** and **Copy all**, which puts every entry on the clipboard: the thing to paste into a bug report.

![The log menu: Select all and Copy all](images/01/log-menu.png)

---

<!-- _class: lab -->

# Try it yourself

1. Open the [small sample CSV in the web app](https://wafertools.github.io/tsmap/app/?dataUrl=https%3A%2F%2Fwafertools.github.io%2Ftsmap%2Fsamples%2Ftsmap-few-tests.csv&dataFormat=csv): check the roles, then **Continue →**
2. **Clear files**, then **Load sample data**
3. **Setup ▾ → Tests…**: rename a test, then apply
4. Download and unzip the [scan-folder zip](https://wafertools.github.io/tsmap/samples/tsmap-scan-folder.zip), then **Open files ▾ → Scan a folder…**: how many files does it list?
5. Switch to a dark theme, then open the log

---

<!-- _class: answers -->

# Check your results

4. **Six** files, from four lots. Set the filter to one lot to list only its files.

---

# Recap

- Drop files, **Open files**, or scan a folder and filter by lot
- **Add files** grows the lot; **Setup ▾ → Tests…** chooses and renames tests
- Tables need a column mapping, and tsmap remembers it

With your data loaded and your tests chosen, you are ready to read the maps.

More in the user guide: [Loading your data](../user-guide.md#loading-your-data)

---

<!-- _class: next -->
<!-- _paginate: false -->

# Next lesson

[02 · Reading a map and the toolbar →](02-reading-a-map.md)

Plot modes, colours, overlays, orientation and the gallery layout.
