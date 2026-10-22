---
marp: true
theme: tsmap
paginate: true
title: "03 · Findings"
description: What stands out, the findings list, and the Summary panel's tables, read on the sample lot.
footer: tsmap training · 03 Findings
---

<!-- _class: title -->
<!-- _paginate: false -->

# Findings

## Session 03

tsmap training · a self-paced course

---

# In this session

- Read **What stands out** and show any row on the map
- Read the **Findings** list and the patterns behind it
- Use the Summary panel's tables and reports

---

<!-- _class: divider -->

# The headline items

---

<!-- _class: split -->
# The Summary panel

It docks beside the maps and describes the lot you are looking at. A **Filter…** narrows it to what is kept.

![The Summary panel for the sample lot](images/03/summary-panel.png)

---

<!-- _class: split -->

# Open and close it

<span class="badge">1</span> **Summary** opens and closes the panel. The **▸** at the end of the panel's title closes it too.

![The Summary button in the row above the maps](images/03/summary-button.png)

---

<!-- _class: split -->
<!-- covers: What stands out -->

# What stands out

The headline is the yield. Below it, the items that cost the lot most, largest first.

![What stands out: the headline and the top item](images/03/what-stands-out.png)

---

<!-- covers: Finding row -->

# Every row shows the affected dies

Click a row and the map shows the affected dies. Click it again to clear.

![The map after clicking the vth_n_mV row](images/03/row-on-map.png)

---

# Losses and signals

A **loss** costs dies: a weak region, a low wafer, a test outside its limits. A **signal** moves values without costing dies, as the split item on top does here.

Three dots and a word say how much of the lot it affects. Items under 1% of the dies stay in the Findings list.

---

<!-- _class: split -->
<!-- covers: fmax_MHz 3.2σ; idsat_n_uA 2.8σ; idsat_p_uA 2.7σ; vth_p_mV 2.7σ; vth_n_mV 2.6σ; Finding chip (test) -->

# The parts of an item

Under the top item, small rounded buttons each name one part of it. Here each is a test that differs by split, with its shift in σ.

![The part buttons under the top item, outlined](images/03/top-item-chips.png)

---

# Show one part

Click a part button to show that part alone. This is fmax_MHz, with the dies outside its limits marked ▽ and △.

![The gallery showing fmax_MHz after clicking its button](images/03/chip-on-map.png)

---

<!-- _class: split -->
<!-- covers: Finding chart link -->

# Chart links

**Chart** opens Insights at this item's card, under **Worth a look**. Insights is session 05.

![The Chart link on the top item](images/03/chart-link.png)

---

<!-- covers: Full report ▸ -->

# Full report

**Full report ▸** at the foot of the section opens the report, which begins with the same items.

![The Summary report, opened from Full report](images/03/full-report.png)

---

<!-- _class: split -->
# A lot with nothing to report

When no region, bin or wafer costs about a yield point, the panel says so and lists what it compared.

![What stands out for HY-LOT-04](images/03/nothing-stands-out.png)

---

# Bigger lots

Findings on the test values of one region take longer to compute. A large load shows a row with an **Analyse** button instead, and the findings stay while the load is open.

More in the [user guide](../user-guide.md#test-value-findings)

---

<!-- _class: divider -->

# The Findings list

---

<!-- _class: split -->
<!-- covers: Summary › Findings; Findings severity group; Finding detail row -->

# The Findings section

Each anomaly is ranked by severity, shown as three dots: Unusual, Notable or Minor. The **Unusual** and **Notable** buttons narrow the list.

![The Findings section of the sample lot](images/03/findings-list.png)

---

# A finding on the map

Click a finding to show it on the map. Click it again to clear.

![The edge spatial pattern selected on the map](images/03/finding-on-map.png)

---

<!-- _class: split -->
<!-- covers: Show supporting findings -->

# A pattern and what backs it

A spatial pattern can have a **Show N supporting findings** line. This is EDGE-LOT-01.

![A spatial pattern with its supporting findings closed](images/03/supporting-closed.png)

---

<!-- _class: split -->
# The supporting findings

Opened, it lists the regional findings the pattern explains.

![The same pattern with 14 supporting findings open](images/03/supporting-findings.png)

---

<!-- _class: split -->
# An edge ring

The item names the pattern, the bins that make up the loss, and the test behind it.

![What stands out for EDGE-LOT-01](images/03/edge-top-item.png)

---

<!-- covers: Finding chip (bin) -->

# A bin part

A bin's button carries its legend colour and shows only those dies. This is hard bin 3.

![EDGE-LOT-01 after clicking the Hard bin 3 button](images/03/edge-bin-chip.png)

---

<!-- _class: divider -->

# The tables

---

<!-- covers: Summary › Wafer Yield; Slot; Wafer yield row -->

# Wafer Yield

One bar per wafer, in slot order, so a slot-related pattern shows. A badge counts the wafer's findings; click a row to open that wafer.

![Wafer Yield in slot order](images/03/wafer-yield.png)

---

<!-- covers: Yield -->

# Sorted by yield

**Yield** re-sorts the wafers from lowest to highest. A row a point or more below the median is tinted, darker as the gap grows.

![Wafer Yield sorted by yield](images/03/wafer-yield-sorted.png)

---

<!-- covers: Summary › Hard Bin Breakdown; Hard -->

# Hard Bin Breakdown

Bars as a share of dies: pass bins first, then failing bins from the most dies to the fewest.

![Hard Bin Breakdown](images/03/bin-breakdown.png)

---

<!-- covers: Soft -->

# Soft bins

**Soft** switches the breakdown to soft bins, with their own colours. By default it follows the map's plot mode.

![The breakdown in Soft](images/03/bin-breakdown-soft.png)

---

<!-- covers: Ring Yield; Ring -->

# Ring Yield

Yield by ring from the centre out, each row with its difference from the wafer's yield. Ring is the default because edge roll-off dominates real wafer maps.

![Ring Yield for the sample lot](images/03/ring-yield.png)

---

<!-- covers: Quadrant -->

# Quadrant

**Quadrant** splits the wafer into NE, NW, SE and SW instead of rings.

![Quadrant Yield for the sample lot](images/03/quadrant-yield.png)

---

<!-- covers: Summary › Test Values -->

# Test Values

Per test: the mean, **Ppk** and the share of dies within limits. Ppk uses the overall spread, wafer-to-wafer variation included.

![The Test Values table](images/03/test-values.png)

---

<!-- covers: Summary › Functional Tests -->

# Functional Tests

Pass and fail counts and the pass rate for each functional test.

![The Functional Tests table](images/03/functional-tests.png)

---

<!-- covers: Summary report -->

# Summary report

<span class="badge">1</span> opens a printable report: the findings, bins, regions and the full per-test table. It is the report **Full report ▸** opens. Save it as a PDF from the print dialog.

![The Summary report and Data tables buttons, outlined](images/03/report-buttons.png)

---

<!-- covers: Data tables -->

# Data tables

<span class="badge">2</span> opens statistics, every die, and one row per wafer, each with **Copy** and **Export CSV**. Insights does not need to be on.

![The Data tables dialog](images/03/data-tables.png)

---

<!-- _class: lab -->

# Try it yourself

1. In the [web app](https://wafertools.github.io/tsmap/app/), **Load sample data**
2. Click the **fmax_MHz** button under the top item: which wafer has the most marked dies?
3. Open **Findings** and click the spatial pattern: which wafers does it mark?
4. In **Wafer Yield**, choose **Yield**: which wafer is lowest?
5. Open **Data tables** and look at the **Wafers** table

---

# Recap

- **What stands out** ranks losses and signals; every row shows the affected dies
- **Findings** lists anomalies by severity; patterns carry their supporting findings
- The tables, **Summary report** and **Data tables** carry the numbers

More in the [wafer map guide](https://wafertools.github.io/wafermap/user-guide/#6-summary-panel)

---

<!-- _class: next -->
<!-- _paginate: false -->

# Next session

04 · The lot view

Gallery, stack and splits.
