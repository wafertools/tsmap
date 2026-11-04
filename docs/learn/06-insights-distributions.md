---
marp: true
theme: tsmap
paginate: true
title: "06 · Insights: distributions and data"
description: "Distributions and capability, comparing groups of wafers, the wafer-to-wafer trend and the data tables behind every chart."
teaser: "How values spread, how groups compare, and the tables behind every chart."
footer: "Learn tsmap · 06 Insights: distributions and data"
---

<!-- _class: title -->
<!-- _paginate: false -->

# Insights: distributions and data

## Lesson 06

Learn tsmap

---

# In this lesson

- Read how values spread, and where tests sit against their limits
- Compare groups of wafers and see where on the wafer they differ
- Export the numbers behind every chart

---

<!-- _class: divider -->

# Distributions

---

<!-- covers: Distributions; Capability, Ppk and the goal plot; chart › Test value distribution; chart › Value histogram -->

# The Distributions tab

How values spread: process capability, a box plot per wafer, a histogram and the trend across wafers.

![The Distributions tab](images/06/distributions.png)

---

<!-- _class: split -->
<!-- covers: chart › Tests by wafer; Heatmaps and the difference map; Rescaling values; wmap guide › Heatmaps and the difference map; wmap guide › Rescaling values -->

# Tests by wafer

At the top of Distributions, **Tests by wafer** picks the tests whose wafers differ most and draws them as a grid. Each row is a test and each column is a wafer. The colour is how far that wafer's mean is from the mean of all the wafers: blue is below, orange is above, and a pale cell is close to average.

![The Tests by wafer grid, six tests by twenty-five wafers](images/06/tests-by-wafer.png)

---

# Reading the grid in z-scores

- Each test is rescaled on its own, so tests in different units share one colour scale
- The number in a cell is a [**z-score**](https://wafertools.github.io/tsmap/learn/glossary/#z-score): how many standard deviations the wafer's mean is from the mean of all wafers
- A column that is dark in several rows is a wafer that moved several tests together

---

<!-- _class: split -->
<!-- covers: chart › Process capability; glossary › Process capability (Cp / Cpk / Pp / Ppk) -->

# Process capability

Each test is rescaled against its own limits: the low limit becomes 0 and the high limit becomes 1. That puts tests in different units on one scale.

![The Process capability card](images/06/capability.png)

---

<!-- covers: wmap guide › Capability, Ppk and the goal plot -->

# Reading the colours

- A box centred between 0 and 1, whiskers inside, has room; one against 0 or 1 does not
- Lowest [**Ppk**](https://wafertools.github.io/tsmap/learn/glossary/#ppk) first: 1.33 or more is capable, under 1.0 poor
- Ppk is the gap from the mean to the nearest limit, in units of 3σ

---

<!-- _class: split -->

# Tests with no limits

A test without both limits still appears, drawn muted and dashed on its own range, with no Ppk. Its place says how its values spread, not how near a limit they are.

![SWEEP-LOT-06 capability chart: tests without limits drawn muted and dashed](images/06/no-limits.png)

---

<!-- _class: split -->
<!-- covers: Test; Test menu › (one per test) -->

# One test for every card

Under the heading **Test by test** there is one **Test** menu. Changing it changes the box plot, the histogram, the trend and the scatter together, so every card is about the same test. Clicking a test in the capability chart does the same. A card shows a Test menu of its own only while you have expanded it.

![The Test menu in the Test by test row, listing every test](images/06/test-menu.png)

---

<!-- covers: Axis includes limits; Clip outliers; Log scale -->

# Axis controls

<span class="badge" role="img" aria-label="callout 1">1</span> **Axis includes limits** widens the axis to the limits. <span class="badge" role="img" aria-label="callout 2">2</span> **Clip outliers** narrows it to the bulk of the data. <span class="badge" role="img" aria-label="callout 3">3</span> **Log scale**, on the box plot only, uses a log axis once every value is positive.

![The box plot's three axis controls, outlined](images/06/box-controls.png)

---

# Clipping changes only the axis

The chart states how many values fall outside the axis, and every statistic still includes them.

![The box plot with Clip outliers on](images/06/box-clipped.png)

---

<!-- _class: split -->

# Which limits are drawn

When a test has both kinds, a **Limits** choice appears on the box plot, histogram, trend and scatter: **Test + spec** (the default), **Test limits**, **Spec limits** or **None**. A limit off the edge of the axis is marked with an arrow.

![The box plot with its Limits choice outlined](images/06/limits-choice.png)

---

<!-- _class: split -->
<!-- covers: Wafer; Wafer menu › (one per wafer) -->

# One wafer or all

The histogram has a **Wafer** menu: all wafers pooled, or one wafer. Type to filter the list.

![The Wafer menu on the value histogram](images/06/wafer-menu.png)

---

<!-- covers: Bands on a line; chart › Wafer-to-wafer trend; wmap guide › Bands on a line -->

# Wafer-to-wafer trend

Each wafer's mean in slot order, with a band of ±1 standard deviation. There is no sort: a drift only shows in sequence.

![The wafer-to-wafer trend of ioff_nA](images/06/trend.png)

---

<!-- _class: split -->
<!-- covers: Trend; Control chart; wmap guide › Control charts -->

# Trend or control chart

**Control chart** shows the same wafers against control limits, with the points that break a rule marked. The trend shows how the dies within each wafer spread; the control chart shows whether a wafer's mean stands out from the others. It needs at least three wafers.

![The control chart view of the wafer-to-wafer card](images/06/trend-control.png)

---

<!-- _class: split -->

# The histogram when grouped

With Group by on, each group's bars are a share of its own dies, so groups of different sizes compare by shape. **Counts** shows the number of dies instead.

![The value histogram with one series per split, as shares](images/06/histogram-share.png)

---

<!-- _class: split -->
<!-- covers: Cumulative; wmap guide › The cumulative probability plot -->

# Histogram or cumulative

**Cumulative** draws the same values as a curve instead of bars. Each die sits at the share of dies at or below its value, on a scale where a normal distribution falls on a straight line. A group whose curve is further right has higher values, and a steeper curve is a tighter spread.

![The same values drawn as a cumulative curve, one line per split](images/06/histogram-cumulative.png)

---

<!-- _class: split -->

# The box plot when grouped

With Group by on, the box plot also offers **Split, then wafer**: each split's wafers sit inside it, coloured by split, so you see the spread between splits and within each.

![The box plot with each split's wafers inside it](images/06/box-nested.png)

---

<!-- _class: split -->
<!-- covers: By wafer; By radius -->

# By wafer or by radius

The box plot can show one box for each wafer (**By wafer**) or one for each ring, from the centre of the wafer out to the edge (**By radius**). By radius is the one to use when you suspect a value changes with distance from the centre: the boxes then step up or down from Ring 1 to Ring 4.

![The box plot drawn by radius, with By radius outlined](images/06/box-by-radius.png)



---

<!-- covers: wmap guide › Why wafers are counted, not dies; wmap guide › The statistics, explained -->

# Why each wafer counts once

- Dies on one wafer went through the same processing, so they are not independent
- Counted die by die, thousands of dies make a tiny difference between two wafers look certain
- So a comparison of groups takes each wafer's mean as one value: n is wafers

---

<!-- covers: Comparing groups of wafers; wmap guide › Comparing groups of wafers; chart › Comparison by group; glossary › Welch test, Kruskal–Wallis and q-value -->

# Comparing groups

- [**Welch p**](https://wafertools.github.io/tsmap/learn/glossary/#welch-p), [**Rank p**](https://wafertools.github.io/tsmap/learn/glossary/#rank-p): how likely a difference this large is by chance
- [**q**](https://wafertools.github.io/tsmap/learn/glossary/#q) corrects p for many tests: read q
- **Largest shift** is the size; **Control** compares each group with one

![The Comparison by split table](images/06/comparing-groups.png)

---

<!-- _class: split -->

# Tests by group

With Group by on, **Tests by wafer** becomes **Tests by split**: one column for each group instead of each wafer, in z-scores again. A group that is dark across several rows differs on several tests at once, which usually means one cause.

![Tests by split, six tests by five splits](images/06/tests-by-split.png)

---

<!-- _class: split -->

# Group by temperature

Grouped by **Temperature**, the card compares the six wafers tested at 85 °C with the nineteen at 25 °C. At 85 °C leakage (`ioff_nA`) is high and the thresholds, `idsat_n_uA` and `fmax_MHz` are lower. Tester, program revision and burn-in time group the same way.

![Tests by temperature: the 85 group against the 25 group](images/06/tests-by-temperature.png)

---

<!-- covers: chart › Difference map -->

# Where on the wafer

The difference map shows where on the wafer two groups differ, not whether the difference is significant.

![The difference map: FF minus FS on ioff_nA](images/06/difference-map.png)

---

<!-- _class: divider -->

# The numbers behind it

---

<!-- covers: Data tab; wmap guide › Data tables; tsmap guide › Tables and exports -->

# The Data tab

**Data**, the tab after Correlation, holds every number behind the charts as tables. The foot of the Overview links to it too.

![The link to the Data tab at the foot of the Overview, outlined](images/06/data-tab-link.png)

---

<!-- covers: Data; Statistics; Test values CSV; Functional CSV; chart › Statistics table -->

# Statistics

The **Data** tab holds the same numbers as tables, in three sub-tabs: Statistics, Wafers and Dies. Statistics has two tables, each with its own CSV button: <span class="badge" role="img" aria-label="callout 1">1</span> **Test values CSV** and <span class="badge" role="img" aria-label="callout 2">2</span> **Functional CSV**.

![The Statistics table with its two CSV buttons outlined](images/06/data-statistics.png)

---

<!-- covers: Wafers; chart › Wafers table -->

# Wafers

One row per wafer: its lot fields, die counts, yield and the mean of each test.

![The Wafers table](images/06/data-wafers.png)

---

<!-- covers: Dies; chart › Dies table -->

# Dies

One row per die: position, ring, quadrant, site, bins, every test and the PAT verdict. **Copy** puts it on the clipboard and **Export CSV** saves a file; **Wide** has a column per test, **Long** a row per die and test.

![The Dies table](images/06/data-dies.png)

---

<!-- _class: lab -->

# Try it yourself

1. In the [web app](https://wafertools.github.io/tsmap/app/), **Load sample data**, then switch to **Insights**
2. On **Distributions**, pick **ioff_nA** and turn on **Clip outliers**
3. On **Data → Dies**, export the table

---

# Recap

- **Distributions** shows how values spread and where tests sit against their limits
- With **Group by** on, the same tab compares groups of wafers
- **Data** holds every number as a table you can export

More in the [wafer map guide](https://wafertools.github.io/wafermap/user-guide/#8-insights-tab)

---

<!-- _class: next -->
<!-- _paginate: false -->

# Next lesson

[07 · Correlation →](07-correlation.md)

Which tests move together.
