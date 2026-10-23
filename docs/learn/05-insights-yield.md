---
marp: true
theme: tsmap
paginate: true
title: "05 · Insights: where yield is lost"
description: "Yield by wafer, bins, pass rates, part average testing, what divides yield, and Group by."
teaser: "Which wafers, bins and tests lose yield, and what divides it."
footer: Learn tsmap · 05 Insights: where yield is lost
---

<!-- _class: title -->
<!-- _paginate: false -->

# Insights: where yield is lost

## Lesson 05

Learn tsmap

---

# In this lesson

- Find which wafers, bins and tests lose yield
- Use the buttons and menus every chart shares
- Compare groups of wafers, such as process splits

---

<!-- _class: divider -->

# Where yield is lost

---

<!-- covers: Insights; Overview; wmap guide › Insights tab -->

# From maps to charts

The **Maps | Insights** switch <span class="badge" role="img" aria-label="callout 1">1</span> swaps the wafer view for charts of the same dies. **Overview** <span class="badge" role="img" aria-label="callout 2">2</span> is the first tab; its tiles state the population.

![The Maps | Insights switch and the Overview tab, outlined](images/05/switch-and-tabs.png)

---

# The Overview

Yield first, then bins, pass rates and regions, then what is worth a look. Scroll down: every card is a chart you can click.

![Insights Overview on the sample lot](images/05/insights-overview.png)

---

<!-- _class: split -->
<!-- covers: Sort: yield; Sort: wafer; chart › Yield by wafer -->

# Yield by wafer

One bar per wafer, with the median as a line. **Sort: yield** <span class="badge" role="img" aria-label="callout 1">1</span> orders the bars from highest to lowest yield; click a bar to open that wafer.

![Yield by wafer in wafer order, with Sort: yield outlined](images/05/yield-by-wafer.png)

---

<!-- _class: split -->

# Sorted by yield

Highest yield first, so the weakest wafers are at the right: W04 and W11, both SS. (The Wafer Yield list in lesson 03 sorts the other way, lowest first.)

![Yield by wafer sorted by yield](images/05/yield-sorted.png)

---

<!-- _class: split -->
<!-- covers: Hard bins; Soft bins; chart › Bin pareto -->

# Bin pareto

A pareto chart: one bar per bin, largest first, with the running share of all dies as a line. **Hard bins** or **Soft bins** switches the bin type. Click a bar to chart or tabulate its dies.

![The hard bin pareto, with Soft bins outlined](images/05/bin-pareto.png)

---

<!-- _class: split -->

# Soft bins

Soft bins (lesson 00) are numbered separately from hard bins, so the two charts can differ; in the sample lot they happen to match.

![The soft bin pareto](images/05/bin-pareto-soft.png)

---

<!-- _class: split -->
<!-- covers: Test limits; Tester flag; Functional; chart › Pass rate by test -->

# Pass rate by test

The share of judged dies that pass each test, lowest first. The three buttons choose how a die is judged.

![The pass rate card with its three judging buttons outlined](images/05/pass-rate.png)

---

<!-- _class: split -->

# Tester flag

**Test limits** judges the measured value against the limits. **Tester flag** uses the pass or fail the tester recorded. When the two disagree the card says how many dies they judged differently. In the sample lot they agree, so no note appears.

![Pass rate by tester flag](images/05/pass-rate-flag.png)

---

<!-- _class: split -->

# Functional tests

**Functional** covers tests that only pass or fail, such as a scan chain.

![Pass rate of the functional tests](images/05/pass-rate-functional.png)

---

<!-- _class: split -->
<!-- covers: chart › Ring yield -->

# Ring yield

A wafer diagram with each ring labelled with its yield. Ring 1 is the centre and the last ring the edge. Click a region for its dies.

![The Ring yield card: four rings, each labelled with its yield](images/05/ring-yield.png)

---

<!-- _class: split -->
<!-- covers: chart › Quadrant yield -->

# Quadrant yield

A wafer diagram with each quadrant labelled with its yield; a quadrant well below the rest shows a one-sided loss. Click a region for its dies.

![The Quadrant yield card](images/05/quadrant-yield.png)
---

<!-- _class: split -->
<!-- covers: Show on map -->

# Worth a look

The same items as **What stands out** (lesson 03), each drawn as the chart that shows it. Each card starts with a line saying why it is shown. **Show on map** opens the map that shows that item.

![A Worth a look card, with Show on map outlined](images/05/worth-a-look.png)

---

<!-- _class: divider -->

# Every chart's buttons

---

<!-- covers: Chart actions; Chart actions › Save as PNG; Chart actions › Edit as plot; Chart actions › ✓About this chart; wmap guide › A chart's buttons -->

# The ⋯ menu

Every chart has a ⋯ menu. **Save as PNG** saves the chart, **Edit as plot** opens it as a plot of your own (lesson 10), and **About this chart** adds a line saying what it shows.

![A chart's ⋯ menu: Save as PNG, Edit as plot and About this chart](images/05/chart-actions.png)

---

# About this chart

The line explains what the chart shows and how to read it. The **About this chart** entry turns it on or off.

![Yield by wafer with the About this chart line shown](images/05/about-chart.png)

---

<!-- covers: Expand; wmap guide › Exporting a chart; wmap guide › Names of saved files -->

# Expand

The **Expand** button, to the left of the ⋯ button, opens a chart in its own large window. **Save as PNG** there gives a full-size image, headed with its settings and named for the lot and chart.

![Yield by wafer expanded into its own window](images/05/expanded-chart.png)

---

<!-- covers: wmap guide › What a click does -->

# Every mark opens something

- A wafer's bar, box or point opens that wafer's map
- A bin, a histogram bar or a ring opens the menu of charts and tables for those dies (lesson 08)
- A capability box or a correlation cell moves the other charts to that test

---

<!-- _class: divider -->

# Finding causes

---

<!-- covers: What divides yield; Group by; chart › What divides yield; wmap guide › What divides yield -->

# What divides yield

Each wafer field, such as the split, compared for yield and the top fail bins (four or more wafers). A low [**q**](https://wafertools.github.io/tsmap/learn/glossary/#q) means the groups differ by more than noise: where to look, not why.

![The What divides yield card](images/05/what-divides-yield.png)

---

<!-- covers: Part average testing (PAT); Show all 13 wafers; chart › Part average testing (PAT); glossary › Part average testing (PAT) -->

# Part average testing

PAT finds dies that pass every limit but sit far from the rest of their wafer. The card counts them per wafer; **Show all 13 wafers** lists every wafer.

![The Part average testing card, left part](images/05/pat-card.png)

---

<!-- covers: Map the verdicts; Plot mode › PAT verdict; chart › PAT verdict map -->

# Map the verdicts

**Map the verdicts** returns to the maps coloured by PAT verdict: within the limits, outlier or fails its bin or limits. You can also choose **PAT verdict** in the **Plot mode** menu on the map toolbar.

![Wafer maps coloured by PAT verdict: within limits, outlier, fails](images/05/pat-map.png)

---

<!-- covers: wmap guide › Part average testing (PAT); glossary › Robust sigma -->

# How PAT limits are set

- Per wafer and test: the passing dies' median ± 6 [robust sigma](https://wafertools.github.io/tsmap/learn/glossary/#robust-sigma), never wider than the limits
- A wafer needs 30 passing values on a test
- It shows what PAT would flag; screening belongs in the test program

More in the [wafer map guide](https://wafertools.github.io/wafermap/user-guide/#1012-part-average-testing-pat)

---

<!-- _class: split -->
<!-- covers: Group by › None; Group by › Split; glossary › Group by; glossary › Wafer attribute; tsmap guide › Grouping data in the Insights tab -->

# Group by

When a wafer field varies across the lot, **Group by** offers it. **None** shows each wafer; a field such as **Split (5)** pools wafers into groups. One wafer has nothing to group, so it has no Group by.

![The Group by menu, offering None and Split (5)](images/05/group-by-menu.png)

---

# Grouped by Split

One bar per split, and the pareto shows each split's share of each bin. SS is lowest at 54.1%, TT highest at 96.3%. Click a split's bar to see its wafers; **Back** returns.

![The Overview grouped by Split](images/05/grouped-overview.png)

---

<!-- _class: lab -->

# Try it yourself

1. In the [web app](https://wafertools.github.io/tsmap/app/), **Load sample data**, then switch to **Insights**
2. **Sort: yield**, then open **Pass rate by test**: which test passes least often?
3. **Group by → Split**: which split has the lowest yield?

---

<!-- _class: answers -->

# Check your results

2. **`fmax_MHz`** passes least often, at 93.8%. `vth_n_mV` and `vth_p_mV` are close behind at 93.9%.
3. **SS** has the lowest yield, at 54.1%. TT is highest, at 96.3%.

---

# Recap

- **Overview** shows where yield is lost: by wafer, by bin and by test
- Every chart has a **⋯** menu, and every mark opens something
- **What divides yield** and **Part average testing** point at causes; **Group by** compares groups

More in the [wafer map guide](https://wafertools.github.io/wafermap/user-guide/#8-insights-tab)

---

<!-- _class: next -->
<!-- _paginate: false -->

# Next lesson

[06 · Insights: distributions and data →](06-insights-distributions.md)

How values spread, how groups compare, and the tables behind every chart.
