---
marp: true
theme: tsmap
paginate: true
title: "07 · Drilling into any population"
description: Filter wafers and dies, then chart and tabulate any selection, bin, wafer or finding.
footer: tsmap training · 07 Drilling down
---

<!-- _class: title -->
<!-- _paginate: false -->

# Drilling into any population

## Session 07

tsmap training · a self-paced course

---

# In this session

- Keep only the wafers and dies that meet your conditions
- Chart and tabulate any selection, bin or wafer
- Know what each entry of the right-click menu opens

---

<!-- _class: divider -->

# Filtering

---

<!-- covers: Filter… -->

# Filter…

The button at the right of the toolbar, beside Maps and Insights. It keeps only the wafers and dies that meet conditions you set, in the gallery, on a single map and on every Insights tab.

![The Filter… button, outlined](images/07/filter-button.png)

---

<!-- _class: split -->

# The Filter window

Add conditions; every one must hold. At the bottom of the window, **Apply** filters and **Cancel** leaves things as they were.

![The empty Filter window](images/07/filter-window.png)

---

<!-- _class: split -->

# Choose a field

A condition starts with a field: a test, a die field such as bin, ring or site, or a wafer field such as split, lot or yield. Type to search the list.

![The list of fields for a condition](images/07/filter-fields.png)

---

<!-- _class: split -->

# Category and number fields

A category field, such as the split, lists its values to tick; **is not** keeps everything except the ticked values. A number field, such as a test or a wafer's yield, keeps a range.

![A condition on Split, with every value ticked](images/07/filter-split.png)

---

<!-- _class: split -->

# What it would keep

Untick every split except SS. As you edit, the window shows how many wafers and dies the conditions would keep.

![Only SS ticked: keeps 2 of 13 wafers](images/07/filter-keeps.png)

---

# Wafer or die

A condition on a **wafer** field keeps whole wafers: the others' cards leave the gallery. A condition on a **die** field keeps only the matching dies on the wafers that remain, and a map draws the other dies faded.

Everything beside the map, the Summary panel and its findings included, is analysed again over what is kept.

---

<!-- _class: split -->

# Saved filters

Name the conditions and **Save** them to keep them in the window's list. **Load** puts a saved filter's conditions in the window so you can check what they keep; press **Apply** to use them. **Delete** removes a saved filter. **Export…** writes the list to a file, and **Import…** reads such a file back in, so you can share it or use it on another machine.

![The window after saving the filter as SS wafers](images/07/filter-saved.png)

---

# Applied

Two cards remain, and the legend and yield describe only those wafers.

![The gallery filtered to the SS wafers](images/07/filtered-gallery.png)

---

# The filter line

A line above the view always states the filter and what it keeps. Its checkbox switches the filter off and on without losing it. <span class="badge">1</span> **Edit…** reopens the window; <span class="badge">2</span> **Remove** deletes the filter.

![The filter line with Edit… and Remove outlined](images/07/filter-line.png)

---

# Insights follows

It is one filter for everything you are looking at, so Insights shows the same two wafers, and its charts and the **Group by** control work on what is kept.

![Insights Overview with the SS filter on](images/07/filter-insights.png)

---

<!-- _class: divider -->

# Charting a population

---

# Select dies

Drag a box on a map: the selected dies keep their colour and the rest fade, with an outline round them. Ctrl or Cmd + click adds or removes a die; **Esc** clears.

![A box dragged on W02; the other dies are faded](images/07/selected-dies.png)

---

<!-- covers: Charts and tables for this wafer (or right-click) -->

# Right-click

Right-click the selection for a menu of charts and tables drawn from just those dies. It has three sections: **Distributions**, **Plots** (the plots you have saved, plus **New plot…** and **New sweep…**) and **Tables**. The **Wafers** table is offered when the dies fall on more than one wafer.

![The right-click menu on a selection](images/07/context-menu.png)

---

<!-- covers: Charts and tables for this wafer (or right-click) › Value histogram -->

# Value histogram

How one test is distributed over just those dies. The title and the line above state the population, so it cannot be mistaken for the whole wafer. The PAT lines are outlier limits worked out per wafer (session 05).

![A value histogram of 60 selected dies](images/07/dies-histogram.png)

---

<!-- covers: Charts and tables for this wafer (or right-click) › Process capability -->

# Process capability

Each test's spread over the selected dies only, drawn against its limits and ordered worst Ppk first. Ppk is a capability index: below 1.0 is poor. Compare it with the whole lot's capability in session 05.

![Process capability of the selected dies](images/07/dies-capability.png)

---

<!-- covers: Charts and tables for this wafer (or right-click) › Test statistics -->

# Test statistics

The Test Values and Functional Tests tables, over the same dies.

![Test statistics for the selected dies](images/07/dies-statistics.png)

---

<!-- covers: Charts and tables for this wafer (or right-click) › Dies -->

# Dies

One row per selected die, with its position, bins and every test value. **Export CSV** writes the table to a file and **Copy** puts it on the clipboard. Choose **Wide** (a column per test) or **Long** (a row per die and test) first.

![The Dies table for the selection](images/07/dies-table.png)

---

# What you right-click decides the population

| If you right-click… | the charts and tables cover… |
| --- | --- |
| dies you have selected | just those selected dies |
| empty map space, with nothing selected | every die on that wafer |
| a card's header | every die on that wafer |
| a bin in the legend | every die in that bin, on every wafer |
| a finding in the Summary panel | the dies the finding is about |

---

# A bin

Right-click a bin in the gallery's legend: the menu opens on that bin's dies on every wafer of the lot. It leaves your selection as it is; the legend only changes what is drawn.

![The menu opened from the bin 3 legend entry](images/07/legend-menu.png)

---

# A whole wafer

Each card's **Charts and tables** button, the small chart icon in its toolbar, opens the same menu for that wafer.

![A card's Charts and tables button, outlined](images/07/wafer-charts-button.png)

---

<!-- _class: lab -->

# Try it yourself

1. In the [web app](https://wafertools.github.io/tsmap/app/), **Load sample data**
2. **Filter…**, add **Split**, keep only **SS**, **Apply**
3. **Remove** the filter. Drag a box on W04 · SS and right-click it
4. Open **Value histogram**, then **Process capability**: which test has the lowest Ppk?
5. Right-click bin **3** in the legend and open **Dies**

---

# Recap

- **Filter…** keeps wafers and dies by condition, in every view
- Select dies, then right-click for charts and tables of just those dies
- A bin, a wafer or a finding each opens the same menu on its own dies

More in the [wafer map guide](https://wafertools.github.io/wafermap/user-guide/#44-charting-dies-and-wafers)

---

<!-- _class: next -->
<!-- _paginate: false -->

# Next session

08 · Your own plots

Build charts, sweeps and derived tests.
