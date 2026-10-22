---
marp: true
theme: tsmap
paginate: true
title: "05 · Insights"
description: Yield, bins, pass rates, groups, part average testing, distributions and the data tables behind them.
footer: tsmap training · 05 Insights
---

<!-- _class: title -->
<!-- _paginate: false -->

# Insights

## Session 05

tsmap training · a self-paced course

---

# In this session

- Find which wafers, bins and tests lose yield
- Compare groups of wafers, such as process splits
- Read distributions and export the numbers behind every chart

---

<!-- _class: divider -->

# Where yield is lost

---

<!-- covers: Insights; Overview -->

# From maps to charts

The **Maps | Insights** switch <span class="badge">1</span> swaps the wafer view for charts of the same dies. **Overview** <span class="badge">2</span> is the first tab; its tiles state the population.

![The Maps | Insights switch and the Overview tab, outlined](images/05/switch-and-tabs.png)

---

# The Overview

Yield first, then bins, pass rates and regions, then what is worth a look. Scroll down: every card is a chart you can click.

![Insights Overview on the sample lot](images/05/insights-overview.png)

---

<!-- _class: split -->
<!-- covers: Sort: yield; Sort: wafer -->

# Yield by wafer

One bar per wafer, with the median as a line. **Sort: yield** <span class="badge">1</span> ranks them; click a bar to open that wafer.

![Yield by wafer in wafer order, with Sort: yield outlined](images/05/yield-by-wafer.png)

---

<!-- _class: split -->

# Weakest first

Sorted by yield, W11 and W04 lead the low end. Both are SS.

![Yield by wafer sorted by yield](images/05/yield-sorted.png)

---

<!-- _class: split -->
<!-- covers: Hard bins; Soft bins -->

# Bin pareto

Dies in each bin, largest first, with the running share as a line. **Hard bins** or **Soft bins** switches the bin type. Click a bar to chart or tabulate its dies.

![The hard bin pareto, with Soft bins outlined](images/05/bin-pareto.png)

---

<!-- _class: split -->

# Soft bins

Soft bins are the test program's own failure categories, so the same loss is split more finely.

![The soft bin pareto](images/05/bin-pareto-soft.png)

---

<!-- _class: split -->
<!-- covers: Test limits; Tester flag; Functional -->

# Pass rate by test

The share of judged dies that pass each test, lowest first. The three buttons choose how a die is judged.

![The pass rate card with its three judging buttons outlined](images/05/pass-rate.png)

---

<!-- _class: split -->

# Tester flag

**Test limits** judges the measured value against the limits. **Tester flag** uses the pass or fail the tester recorded. When the two disagree the card says how many dies they judged differently.

![Pass rate by tester flag](images/05/pass-rate-flag.png)

---

<!-- _class: split -->

# Functional tests

**Functional** covers tests that only pass or fail, such as a scan chain.

![Pass rate of the functional tests](images/05/pass-rate-functional.png)

---

<!-- _class: split -->
<!-- covers: Show on map -->

# Worth a look

The same items as **What stands out** (session 03), each drawn as the chart that shows it, with one sentence saying why. **Show on map** goes back to the map showing it.

![A Worth a look card, with Show on map outlined](images/05/worth-a-look.png)

---

<!-- _class: divider -->

# Every chart's buttons

---

<!-- covers: Chart actions; Chart actions › Save as PNG; Chart actions › Edit as plot; Chart actions › ✓About this chart -->

# The ⋯ menu

Every chart has a ⋯ menu. **Save as PNG** saves the chart, **Edit as plot** opens it as a plot of your own (session 08), and **About this chart** adds a line saying what it shows.

![A chart's ⋯ menu: Save as PNG, Edit as plot and About this chart](images/05/chart-actions.png)

---

# About this chart

The line says what the chart shows and how to read it, in the words the app uses.

![Yield by wafer with the About this chart line shown](images/05/about-chart.png)

---

<!-- covers: Expand -->

# Expand

**Expand**, left of the ⋯, opens one chart large. Save as PNG from there for a clean full-size image.

![Yield by wafer expanded into its own window](images/05/expanded-chart.png)

---

<!-- _class: divider -->

# Finding causes

---

<!-- _class: split -->
<!-- covers: What divides yield; Group by -->

# What divides yield

Each wafer field, such as the split or the lot, is compared for yield and for the commonest fail bins, with each wafer counted once. Rows are ranked by q: low means the groups differ by more than wafer-to-wafer noise. A **Group by** button on each row regroups the tab.

![The What divides yield card, left part](images/05/what-divides-yield.png)

---

<!-- covers: Part average testing (PAT); Show all 13 wafers -->

# Part average testing

PAT screens out dies that pass every limit but sit far from their wafer's distribution. The card shows, per wafer, the dies within PAT limits, the outliers and the rate. **Show all 13 wafers** lists every wafer.

![The Part average testing card, left part](images/05/pat-card.png)

---

<!-- covers: Map the verdicts; Plot mode › PAT verdict -->

# Map the verdicts

**Map the verdicts** returns to the maps coloured by PAT verdict: within the limits, outlier or fails anyway. It is also **PAT verdict** in **Plot mode**.

![The gallery in PAT verdict mode](images/05/pat-map.png)

---

# What PAT does not do

It shows what PAT would have flagged. It is not the screening itself, and a wafer needs 30 or more passing values on a test before it has PAT limits.

More in the [user guide](../user-guide.md#grouping-data-in-the-insights-tab)

---

<!-- _class: split -->
<!-- covers: Group by › None; Group by › Split -->

# Group by

When a wafer field varies across the lot, **Group by** offers it. **None** shows each wafer; a field such as **Split (5)** pools wafers into groups.

![The Group by menu, offering None and Split (5)](images/05/group-by-menu.png)

---

# Grouped by Split

Yield and the pareto now draw a bar per split. SS is lowest at 54.1%; TT is highest at 96.3%.

![The Overview grouped by Split](images/05/grouped-overview.png)

---

<!-- _class: divider -->

# Distributions

---

<!-- covers: Distributions; Capability, Ppk and the goal plot -->

# The Distributions tab

How values spread: process capability, a box plot per wafer, a histogram and the trend across wafers.

![The Distributions tab](images/05/distributions.png)

---

# Process capability

Every test with limits on one scale: the low limit at 0 and the high limit at 1, lowest Ppk first. Ppk is the distance from the mean to the nearest limit, in three standard deviations. Capable is 1.33 or more; poor is under 1.0.

![The Process capability card](images/05/capability.png)

*(The guide's page on capability, Ppk and the goal plot is linked from the card.)*

---

<!-- _class: split -->
<!-- covers: Test; Test menu › (one per test) -->

# One test at a time

The **Test** menu picks the test for the box plot, the histogram and the trend together. Clicking a test in the capability chart does the same.

![The Test menu listing every test](images/05/test-menu.png)

---

<!-- covers: Axis includes limits; Clip outliers; Log scale -->

# Axis controls

<span class="badge">1</span> widens the axis to the limits. <span class="badge">2</span> narrows it to the bulk of the data. <span class="badge">3</span> uses a log axis once every value is positive.

![The box plot's three axis controls, outlined](images/05/box-controls.png)

---

# Clipping changes only the axis

The chart counts the values outside the axis, and every statistic still uses them.

![The box plot with Clip outliers on](images/05/box-clipped.png)

---

<!-- _class: split -->
<!-- covers: Wafer; Wafer menu › (one per wafer) -->

# One wafer or all

The histogram has a **Wafer** menu: all wafers pooled, or one wafer. Type to filter the list.

![The Wafer menu on the value histogram](images/05/wafer-menu.png)

---

<!-- covers: Bands on a line -->

# Wafer-to-wafer trend

Each wafer's mean in slot order, with a band of one standard deviation. There is deliberately no sort: a drift only reads in sequence.

![The wafer-to-wafer trend of ioff_nA](images/05/trend.png)

*(The band is explained in the guide's page on bands on a line, linked from the card.)*

---

<!-- covers: Comparing groups of wafers -->

# Comparing groups

With **Group by** on, Distributions opens with the comparison of the groups, counting each wafer once. **q** corrects for looking at many tests; read q, not p. **Largest shift** is the size of the effect.

![The Comparison by split table](images/05/comparing-groups.png)

---

# Where on the wafer

The difference map shows where on the wafer two groups differ, not whether the difference is significant.

![The difference map: FF minus FS on ioff_nA](images/05/difference-map.png)

---

<!-- _class: divider -->

# The numbers behind it

---

<!-- covers: Data tab -->

# The Data tab

At the foot of the Overview, a link opens the **Data** tab: every number behind the charts, as tables.

![The link to the Data tab at the foot of the Overview, outlined](images/05/data-tab-link.png)

---

<!-- covers: Data; Statistics; Test values CSV; Functional CSV -->

# Statistics

The **Data** tab holds the same numbers as tables. Each table has its own CSV button: <span class="badge">1</span> and <span class="badge">2</span>.

![The Statistics table with its two CSV buttons outlined](images/05/data-statistics.png)

---

<!-- covers: Wafers -->

# Wafers

One row per wafer: its lot fields, die counts, yield and the mean of each test.

![The Wafers table](images/05/data-wafers.png)

---

<!-- covers: Dies -->

# Dies

One row per die: position, ring, quadrant, site, bins, every test and the PAT verdict. **Copy** and **Export CSV** save it; **Wide** has a column per test, **Long** a row per die and test.

![The Dies table](images/05/data-dies.png)

---

<!-- _class: lab -->

# Try it yourself

1. In the [web app](https://wafertools.github.io/tsmap/app/), **Load sample data**, then switch to **Insights**
2. **Sort: yield**: which two wafers are lowest, and what do they share?
3. **Group by → Split**: which split has the lowest yield?
4. On **Distributions**, pick **ioff_nA** and turn on **Clip outliers**
5. On **Data → Dies**, export the table

---

# Recap

- **Overview** shows where yield is lost; **Group by** compares groups
- **Distributions** shows how values spread and where tests sit against their limits
- **Data** holds every number as a table you can export

More in the [wafer map guide](https://wafertools.github.io/wafermap/user-guide/#8-insights-tab)

---

<!-- _class: next -->
<!-- _paginate: false -->

# Next session

06 · Correlation

Which tests move together.
