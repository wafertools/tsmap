---
marp: true
theme: tsmap
paginate: true
title: "08 · Your own plots"
description: Derived tests, sweeps and the plot editor: build charts, keep them, and reuse them on the next lot.
footer: tsmap training · 08 Your own plots
---

<!-- _class: title -->
<!-- _paginate: false -->

# Your own plots

## Session 08

tsmap training · a self-paced course

---

# In this session

- Compute new tests from measured ones
- Read a run of tests as a sweep curve
- Build, keep and reuse your own charts

---

<!-- _class: divider -->

# Derived tests

---

# What a derived test is

A test computed from other tests on the same die, such as a ratio or a margin, instead of measured. A row in a test definitions file with an **expression** is one.

Once defined it is an ordinary test: map it, colour it against limits, chart it. These slides use RRAM-LOT-06, a resistive-memory lot with its definitions file.

---

<!-- _class: split -->

# Load the definitions

**Setup ▾ → Tests…**, then **Load definitions**. The file renames the tests and adds derived ones: the footer counts them, here 7.

![The test selector after loading RRAM-LOT-06's definitions](images/08/selector-loaded.png)

---

<!-- _class: split -->
<!-- covers: † Derived -->

# The † Derived filter

**† Derived** shows only the derived tests. Each has a † before its name. Give a derived test a number the tester doesn't use: if it matches a measured test, the derived one is ignored and the log says so. Numbers from 900001 up are a safe habit.

![The test selector filtered to derived tests](images/08/selector-derived.png)

---

# Expressions: what they read

| Write | It gives |
| --- | --- |
| `t[3126]` | the measured value of test 3126 |
| `testPass[2001]` | the pass or fail the tester recorded |
| `specPass[3126]` | whether the value is inside its limits |
| `diePass()` | whether the die's bin counts as a pass |
| `dieX()`, `dieY()` | the die's position |
| `hbin()`, `sbin()`, `site()` | the die's hard bin, soft bin and probe site |

A derived test can read another.

---

# Expressions: what you can do with them

- **Arithmetic:** `+ - * / % ^`
- **Comparisons:** `< <= > >= == !=`, joined with `and`, `or`, `not`
- **Choosing:** `if(condition, a, b)`
- **Functions:** `abs sqrt ln log10 exp floor ceil round sign pow min max`

For example `abs(t[1020] - t[1010])`, or `if(dieX() < 5, t[1010], 0 - 1)`.

A true or false expression needs **testType F**. Its result is a pass or fail, not a number.

---

# Expressions: ranges and missing data

`3126..3130` names every test in that range that exists. A range must be reduced to one number or verdict: `mean sum min max` for values, `all any none countTrue countFalse` for verdicts, `countKnown` for either.

If a die lacks a value the expression needs, the derived value is blank for that die, never zero. Reducers skip blanks. A result such as 0/0 is blank too.

A derived test that cannot be computed is left out with the reason in the log, never half-computed.

More in the [user guide](../user-guide.md#derived-tests)

---

<!-- _class: split -->

# Derived tests in Plot mode

They appear in the test list marked †, with a note: Derived, not measured. Type in the list's box to filter it.

![Plot mode listing the three plateau derived tests](images/08/plot-mode-derived.png)

---

# Mapped like any test

Choosing **† Set plateau** colours every die by its computed value.

![The gallery coloured by the derived Set plateau test](images/08/derived-map.png)

---

<!-- _class: divider -->

# Sweeps

---

<!-- covers: My plots; + New sweep -->

# My plots

The **My plots** tab holds charts you build. **+ New sweep** starts a sweep: a run of tests, such as one quantity measured at a series of voltages, read as a curve.

![My plots with no plots yet](images/08/my-plots-empty.png)

---

<!-- covers: Import plots… -->

# Import plots…

Reads a plots file and adds its plots. RRAM-LOT-06's plots file brings two sweeps. Each line is the median across the dies, with a shaded band from the 10th to the 90th percentile.

![Two sweep cards: set and reset switching, and endurance](images/08/sweep-cards.png)

---

# What the card measures

The first two curves are measured: where they **cross**, and how far apart they are at chosen levels (the **width**). On a log axis the width is a ratio, such as ×17.8.

---

<!-- _class: split -->
<!-- covers: Test order; Values; From test name; + Add series; Linear; Log -->

# The sweep editor

**Edit** opens the sweep beside a live copy of its curve. For each series, type its tests in sweep order, then say where each test's X comes from.

![The sweep editor for the set and reset switching sweep](images/08/sweep-editor.png)

---

<!-- _class: split -->

# From test name

**Test order** uses the position in the run, **Values** one number per test, and **From test name** reads the swept value from the test's text. The editor lists what it read from the first names. **+ Add series** adds a curve.

![The endurance sweep reading cycles from the test names](images/08/sweep-editor-name.png)

---

# A sweep remembers its tests' names

If a later lot uses the same test numbers for other measurements, the sweep does not draw them and says so on its card, instead of drawing another quantity as the same curve.

---

<!-- _class: divider -->

# Plots

---

<!-- covers: Add examples; + New plot -->

# Add examples

On the sample lot, **Add examples** draws plots chosen from its data: one of each chart type it can show. **+ New plot** starts a blank one on the first two tests.

![My plots after Add examples: a scatter with fit lines and a histogram by split](images/08/examples.png)

---

<!-- covers: Edit; Duplicate; Delete -->

# Edit, Duplicate, Delete

Each card has three buttons. **Delete** can be undone for ten seconds. Changes in the editor are drawn at once and kept as you make them.

---

<!-- _class: split -->
<!-- covers: Setup; Reset; Cancel; Maximize (F); Close (Esc) -->

# The plot editor

The chart on the left, its settings on the right. **Setup** chooses what the chart shows, **Customise** how it looks. **Reset** and **Cancel** both put the plot back as it was when you opened it.

![The plot editor on a new scatter plot](images/08/plot-editor.png)

---

<!-- covers: Scatter; Histogram; Box; Bar; Line; Probability; Control; Heatmap; Goal -->

# Chart types

Scatter, histogram, box, bar, line, probability, control, heatmap and goal. Each needs different fields: a histogram takes one set of values, a box or bar takes categories.

![The Chart type buttons, with the histogram chosen](images/08/chart-types.png)

---

<!-- _class: split -->
<!-- covers: X axis; Y axis; Colour; X axis menu entry; Y axis menu entry; Colour menu entry; Plot editor wafer row -->

# X, Y and Colour

Each opens a list of fields: any test, a die's position, ring, bin or site, a wafer's yield, or a wafer field such as split. Colour separates the data into groups, each with its own button above the chart.

![The Colour list on a scatter plot](images/08/colour-menu.png)

---

<!-- _class: split -->

# Colour by Split

One colour per split. **Follow Group by** is the default: the colours follow the Group by control above the charts, so changing it recolours every plot.

![The scatter coloured by Split](images/08/colour-split.png)

---

<!-- covers: + Add a condition; Panels; None; Least squares; Orthogonal; y = x line; Automatic; Die; Wafer -->

# More settings

**Filter** (**+ Add a condition**) keeps only the dies that meet conditions. **Panels** draws one small plot per value of a field. A scatter's **Fit line** is **Least squares** or **Orthogonal**, and **y = x line** marks agreement. **One mark per** chooses Automatic, Die or Wafer.

---

<!-- _class: split -->
<!-- covers: Customise; Linear; Reverse direction; Test + spec; Spec -->

# Customise

Titles, each axis's minimum, maximum, **Linear** or **Log** scale and **Reverse direction**, reference lines, and which limits are drawn: **Test + spec**, **Test**, **Spec** or **None**.

![The Customise page of the plot editor](images/08/customise.png)

---

# Your plots are kept

A plot is a recipe, not a picture: which fields go where, and nothing about the lot. tsmap remembers the list on this machine and draws it on the next lot you open. A plot that needs a test the lot lacks stays in the list, dimmed, with the reason.

---

<!-- covers: Export plots…; Delete all plots… -->

# Export, import, delete all

**Export plots…** writes every plot to a file and **Import plots…** adds the plots of such a file, so a set can move to a colleague. **Delete all plots…** asks first.

![Delete all plots confirmation: how many, and to Export plots first](images/08/delete-all.png)

---

# Undo

After deleting, **Undo** brings the whole list back for ten seconds.

![My plots after deleting, with Undo outlined](images/08/plots-deleted.png)

---

<!-- _class: split -->
<!-- covers: Charts and tables for this wafer (or right-click) › New plot…; Charts and tables for this wafer (or right-click) › New sweep… -->

# From the right-click menu

Every saved plot is a row in the menu on a selection, drawn over just those dies. **New plot…** and **New sweep…** at its foot start a draft on them.

![The right-click menu with New plot… and New sweep… outlined](images/08/menu-new-plot.png)

---

<!-- _class: split -->

# A draft

A draft is kept only if you press **Add to my plots**.

![A draft plot over one die selected on W02](images/08/draft-plot.png)

---

<!-- _class: lab -->

# Try it yourself

1. In the [web app](https://wafertools.github.io/tsmap/app/), **Load sample data**, then **Insights → My plots → Add examples**
2. **Edit** the first plot and switch **Chart type** to **Box**
3. Set **Colour** to **Split**: which split differs most?
4. Open **Customise** and put a reference line on the axis
5. **Export plots…**, then **Delete all plots…** and **Undo**

---

# Recap

- A **derived test** is computed from others and marked †
- A **sweep** reads a run of tests as a curve and measures where two cross
- **My plots** are recipes kept on this machine and redrawn on the next lot

More in the [wafer map guide](https://wafertools.github.io/wafermap/user-guide/#plots)

---

<!-- _class: next -->
<!-- _paginate: false -->

# Next session

09 · Unusual wafers

Multi-project wafers, no positions, retests and multi-site testing.
