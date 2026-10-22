---
marp: true
theme: tsmap
paginate: true
title: "09 · Unusual wafers"
description: Multi-project wafers, wafers with no positions, retests, multi-site testing, reticles, wafer geometry and clamped values.
footer: tsmap training · 09 Unusual wafers
---

<!-- _class: title -->
<!-- _paginate: false -->

# Unusual wafers

## Session 09

tsmap training · a self-paced course

---

# In this session

- Read multi-project wafers and wafers with missing positions
- Set the reticle, diameter and edge exclusion
- Handle clamped values and repeated dies

---

<!-- _class: divider -->

# Layouts

---

<!-- _class: split -->

# A multi-project wafer

Each reticle holds only a few of one product's dies, so the map is mostly empty and every die is tiny. This is MPW-LOT-08.

![The multi-project wafer map, mostly empty](images/09/mpw-wafer.png)

---

<!-- _class: split -->
<!-- covers: Overlays › ✓Compact layout; Overlays › Layout diagnostics -->

# Compact layout

When the occupied columns and rows repeat at a regular pitch, **Overlays** offers **Compact layout** and **Layout diagnostics** at the top.

![The Overlays menu with Compact layout and Layout diagnostics](images/09/overlays-compact.png)

---

# Compact

Empty rows and columns are removed and each group of dies is outlined. Every die is still counted, so yield and findings do not change, and labels give the original coordinates.

![The three wafers in the compact layout](images/09/mpw-compact.png)

---

<!-- _class: split -->

# Layout diagnostics

If a layout is not recognised as you expect, this window shows what the detector saw: counts and scores only, with no positions, bins or wafer names. **Copy** or **Save as file** to send it to support.

![The Layout diagnostics window](images/09/layout-diagnostics.png)

---

<!-- _class: divider -->

# Missing positions

---

# Three kinds of wafer

In COORDLESS-LOT-01, **W01** has an X/Y position for every die. **W02** is mixed: some dies have results but no X/Y position. **W03** has results for its dies but no X/Y positions at all, so there is nowhere to draw them on a map.

![The lot's three wafers](images/09/coordless-lot.png)

---

<!-- covers: Dies without position -->

# A mixed wafer

It draws the dies that have positions. A footer counts the rest; click it to see them.

![W02 with its dies-without-position footer outlined](images/09/mixed-footer.png)

---

<!-- covers: View die list -->

# No positions at all

With no positions there is no map to draw, so the card shows a summary matching the plot mode instead. **View die list** shows every die.

![W03's summary card, with View die list outlined](images/09/positionless-card.png)

---

# The die list

Position and site, bins and every test value, with its own CSV export. **View chart** switches back.

![W03's die list](images/09/die-list.png)

---

# What it changes

Layout findings (edge ring, quadrants, clusters) use only positioned dies. Yield, bin counts and test statistics include every die.

More in the [user guide](../user-guide.md#dies-with-no-reported-position)

---

<!-- _class: divider -->

# Repeats and sites

---

# Retests

When the same die position appears twice, tsmap keeps the last result. (The wafer map library can also keep the first, best or worst; tsmap has no control for that choice.) The die's tooltip says how often it was probed, and the log notes repeated dies. RETEST-LOT-07 has a second pass over most failing dies.

---

# The same wafer twice

If one file holds the same wafer more than once, a column that tells the passes apart (a temperature, say) makes each pass its own map, and the log names the column. With nothing to tell them apart the repeats are treated as retests.

---

<!-- covers: Column mapping › Subdivide file by this column -->

# Test site

Some testers probe several dies at once, each through its own site, numbered 1, 2, 3… If your file has a column with that site number, map it to the **Test site** role in column mapping.

All sites stay on one wafer map. The site shows in each die's tooltip, and you can colour or group a chart by it, for example to see whether one probe site fails more often.

The column must hold numbers.

Don't use **Subdivide file by this column** for sites. It splits the file into one wafer per value, and is only for flat files that pack several wafers together with no wafer column.

---

<!-- _class: divider -->

# Geometry and limits

---

<!-- _class: split -->
<!-- covers: Setup ▾ › Reticle…; Reticle… › Field width (dies); Reticle… › Field height (dies); Reticle… › Corner die X; Reticle… › Corner die Y; Reticle… › Clear; Reticle… › Cancel; Reticle… › Apply -->

# Reticle…

A wafer file doesn't record how many dies make up a stepper field, so you enter it here: the field's width and height, counted in dies. **Corner die X** and **Corner die Y** give the position of the field's bottom-left die, if it isn't die (0, 0).

![The Reticle window](images/09/reticle-dialog.png)

---

<!-- _class: split -->

# A field of 4 by 3

**Apply** takes effect at once. **Clear** removes the reticle. It applies to every wafer and is remembered.

![The Reticle window with 4 by 3 entered](images/09/reticle-filled.png)

---

# The field grid

The grid is drawn on every map, a die's tooltip gives its position within its field, and the Summary panel looks for findings that repeat at the same cell of every field. That points at the mask or stepper, not the wafer.

![The three wafers with the reticle grid drawn](images/09/reticle-grid.png)

---

<!-- covers: Overlays › ✓Reticle grid -->

# Reticle grid

**Overlays ▾ → Reticle grid** hides or shows it.

![The Overlays menu with Reticle grid ticked](images/09/overlays-reticle.png)

---

<!-- _class: split -->
<!-- covers: Setup ▾ › Diameter & edge exclusion…; Diameter & edge exclusion… › Wafer diameter (mm); Diameter & edge exclusion… › Edge exclusion width (mm); Diameter & edge exclusion… › Clear; Diameter & edge exclusion… › Cancel; Diameter & edge exclusion… › Apply -->

# Diameter and edge exclusion

tsmap normally works the size out from the data. Override it when there are too few dies to infer from, or to add an **edge exclusion** band whose dies are left out of yield and drawn dimmed. The width needs a diameter first.

![The Diameter and edge exclusion window](images/09/diameter-dialog.png)

---

# A band at the edge

With 300 mm and 3 mm entered, dies within 3 mm of the edge are left out of yield and drawn dimmed. Both values are remembered.

![The wafers with an edge exclusion band](images/09/edge-exclusion.png)

---

<!-- _class: split -->
<!-- covers: Setup ▾ › Exclude values outside limits… -->

# Exclude values outside limits…

A tester at its limit records its rail, such as a current at the compliance clamp, not a reading. One of these stretches the colour scale and moves the mean. A value outside the chosen limit set is treated as missing: grey on the map, left out of statistics, and counted wherever it matters.

![The Exclude values outside limits window](images/09/exclude-values.png)

---

# Nothing is hidden

The tooltip on a grey die names the excluded value, and the Summary panel's Test Values table shows an **Excl.** column. Bins and the tester's pass/fail are unchanged, so yield is the same. Open `VALID-LOT-09.csv` and switch between **Validity limits** and **Off** to see it.

---

<!-- _class: lab -->

# Try it yourself

1. In the [web app](https://wafertools.github.io/tsmap/app/), load `MPW-LOT-08.csv` and turn on **Overlays → Compact layout**
2. Load `COORDLESS-LOT-01.stdf`: open W03's **View die list**
3. On the sample lot, **Setup ▾ → Reticle…**, enter 4 by 3 and **Apply**
4. Open **Diameter & edge exclusion…** and try 300 and 3

---

# Recap

- **Compact layout** shows multi-project wafers at a readable size
- Wafers with missing positions keep every die in the numbers
- **Reticle…**, **Diameter & edge exclusion…** and **Exclude values** correct what the file does not say

More in the [user guide](../user-guide.md#analysing-your-data)

---

<!-- _class: next -->
<!-- _paginate: false -->

# Next session

10 · Automation and integration

The command line, links, and definitions files.
