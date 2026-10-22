---
marp: true
theme: tsmap
paginate: true
title: "02 · Reading a map and the toolbar"
description: Plot modes, colour schemes, overlays, orientation, the gallery layout, and one wafer close up.
footer: Learn tsmap · 02 Reading a map
---

<!-- _class: title -->
<!-- _paginate: false -->

# Reading a map and the toolbar

## Lesson 02

Learn tsmap

---

# In this lesson

- Open one wafer, then a whole lot
- Change what the maps show: bins or a test's values
- Add overlays, turn the wafer, zoom in and read a single die

---

<!-- _class: divider -->

# One wafer on its own

A file that holds a single wafer

---

# One map

A file with one wafer opens as one full-size map, with the Summary panel open beside it. This is EDGE-LOT-01's first wafer.

![One wafer: the map, its legend and the Summary panel](images/02/one-wafer.png)

---

<!-- covers: Map; Expand (E) -->

# One toolbar

- <span class="badge">1</span> Save, zoom, pan, select and chart this map
- <span class="badge">2</span> What it shows and how it looks
- <span class="badge">3</span> **Expand (E)**: **F** maximises, **Esc** closes
- <span class="badge">4</span> **Map | Insights**

![The one-wafer toolbar, its four groups numbered](images/02/one-wafer-toolbar.png)

---

# Insights for one wafer

The same tabs, over this wafer's dies. There is no **Group by**: one wafer has nothing to group.

![Insights on one wafer: the tabs with no Group by](images/02/one-wafer-insights.png)

---

# What needs several wafers

One wafer has nothing to stack, group or compare, so these appear only for a lot:

- the stacked plot modes, **Columns** and **Select the same dies** (lesson 04)
- the Summary panel's **Wafer Yield** list (lesson 03)
- in Insights, **Group by**, What divides yield and the comparisons (lesson 05)

---

<!-- _class: divider -->

# What the map shows

---

<!-- covers: Download gallery PNG; wmap guide › Gallery; wmap guide › Toolbar controls -->

# The gallery toolbar

Several wafers open as a gallery, one card per wafer. Every button here acts on all of them at once. The camera saves the whole gallery as one PNG.

![The gallery toolbar](images/02/gallery-toolbar.png)

---

<!-- covers: Plot mode; Plot mode › Test Value ▶; Plot mode › Hard Bin; Plot mode › Soft Bin; wmap guide › Plot modes -->

# Plot mode

Colour each die by its hard bin, its soft bin, or one test's value. The stacked modes come in lesson 04, PAT verdict in lesson 05.

![The Plot mode menu](images/02/plot-mode-menu.png)

---

# Soft Bin

The test program's failure category for each die, with its own legend.

![The sample lot in Soft Bin mode](images/02/soft-bin.png)

---

<!-- covers: chart › Test value map -->

# Test Value

Each die coloured by its reading. ▽ and △ mark dies below and above the test limits.

![W01 coloured by fmax_MHz](images/02/test-value-card.png)

---

<!-- covers: Toggle log scale; Colorbar range: test limits (click for data range); wmap guide › Test Value mode — colorbar range and test limits -->

# Two more buttons for values

<span class="badge">1</span> Log scale. <span class="badge">2</span> Colorbar range: the test limits, the same on every wafer, or the data's own range.

![The gallery in Test Value mode, with its two extra buttons outlined](images/02/test-value.png)

---

<!-- covers: glossary › Test limit; glossary › Spec limit -->

# Two kinds of limit

- **Test limits** are what the tester judged each die by: they decide pass or fail
- **Spec limits** are the process specification: capability is measured against them when a test has both
- Charts draw test limits with short dashes and spec limits with long ones

---

<!-- covers: chart › Limit pass/fail map; chart › Test pass/fail map; glossary › Pass/fail display -->

# Pass or fail, two ways

In Test Value mode **Overlays** adds <span class="badge">1</span> **Limit pass/fail**, judged by the test limits, and <span class="badge">2</span> **Test pass/fail**, the verdict the tester recorded.

![The Overlays menu in Test Value mode](images/02/passfail-menu.png)

---

<!-- _class: split -->

# Limit pass/fail

Dies inside the limits in green, below the low limit in blue, above the high limit in red, each with its count.

![W01 in Limit pass/fail](images/02/limit-passfail.png)

---

<!-- _class: split -->

# Test pass/fail

The tester's own verdict. It can differ from the limits: guard bands are one reason. A functional test always shows this way.

![W01 in Test pass/fail](images/02/test-passfail.png)

---

<!-- covers: Colour scheme; Colour scheme › ✓Default; Colour scheme › ✓Colour-blind safe -->

# Colour scheme

Default or colour-blind safe bin colours; passing bins are always shades of green. In Test Value mode the same menu picks the value colours, and **Reverse gradient** flips them.

![The Colour scheme menu](images/02/colour-scheme-menu.png)

---

# Highlight a bin

Click a bin in the legend and the others grey out; **Ctrl** or **Cmd** + click adds more. Click it again to clear.

![Bin 2 highlighted across the lot](images/02/highlight-bin.png)

---

<!-- _class: divider -->

# Overlays and orientation

---

<!-- covers: Overlays; Overlays › ✓Ring boundaries; Overlays › ✓Quadrant lines; Overlays › ✓Die labels; Overlays › ✓XY indicator; Overlays › ✓Axis labels; Overlays › ✓Mark failing dies; Overlays › Clear overlays -->

# Overlays

Layers drawn over every map. **Clear overlays** turns them all off, and is greyed when none are on.

![The Overlays menu](images/02/overlays-menu.png)

---

<!-- covers: wmap guide › Overlays -->

# Rings and quadrants

Ring boundaries match the zones the findings use. Quadrant lines split the wafer N, S, E and W.

![W01 with ring boundaries and quadrant lines](images/02/overlays-on.png)

---

<!-- covers: Orientation; Orientation › *; wmap guide › Wafer orientation; glossary › Notch / flat -->

# Orientation

Rotate or flip how the wafer is drawn. Die coordinates never change.

![The Orientation menu](images/02/orientation-menu.png)

---

# Turned to your convention

The first turn also shows the XY indicator. **Reset orientation** goes back to the start.

![W01 rotated 90° clockwise, with the XY indicator](images/02/rotated-card.png)

---

<!-- covers: Legend style; Legend style › * -->

# Legend style

**Legend on each map** adds a legend to every card, then lets you choose where it sits.

![The Legend style menu](images/02/legend-style-menu.png)

---

<!-- covers: Columns; Columns › * -->

# Columns

**Auto** fits as many readable cards as it can. A number shares the width between that many.

![The Columns menu](images/02/columns-menu.png)

---

<!-- _class: divider -->

# One wafer close up

---

<!-- _class: split -->
<!-- covers: wmap guide › Zoom and pan; Download PNG; Zoom (drag to zoom region); Zoom in; Zoom out; Reset zoom (double-click); Pan (drag to move); Select (drag to select dies) -->

# Each wafer's toolbar

- <span class="badge">1</span> Save this map as a PNG
- <span class="badge">2</span> Zoom to a region, in, out, reset
- <span class="badge">3</span> Pan &nbsp;<span class="badge">4</span> Select dies (lesson 07)

![A wafer card's toolbar](images/02/card-toolbar.png)

---

<!-- covers: wmap guide › Keyboard shortcuts; tsmap guide › Zooming the interface -->

# Zoom in

The wheel zooms at the cursor; hold **Space** and drag to pan. Click a map first and **Ctrl + / − / 0** zoom it; anywhere else they scale the whole window.

![W01 zoomed in two steps](images/02/zoomed-card.png)

---

<!-- covers: wmap guide › Hover; wmap guide › Die grid and coordinates; glossary › Prober step coordinates -->

# Read one die

Hover a die for its coordinates, bins, site and part ID. Coordinates are the prober's grid steps, the same however the wafer is turned.

![The tooltip for one die on W01](images/02/die-tooltip.png)

---

# The wafer's details

The **▾** beside a wafer's name lists everything the file says about that wafer.

![W01's details, expanded](images/02/wafer-info.png)

---

<!-- covers: wmap guide › Die appearance; wmap guide › Legend and colorbar -->

# Reading the colours

- **Grey** is no result for that die: not a fail
- **Dimmed** at the rim is the edge exclusion; **faded** is a die a filter drops (lessons 07 and 09)
- The legend lists pass bins first, then failing bins from the most dies down

---

<!-- covers: wmap guide › Single map -->

# When the map warns you

A **⚠** or **⛔** button appears in the toolbar only when there is something to report. ⛔ means dies may not sit where they appear, usually because the wafer size was guessed. ⚠ means something was skipped, but what is drawn is right. Click it to read why.

---

<!-- _class: lab -->

# Try it yourself

1. Open the [single wafer](https://wafertools.github.io/tsmap/app/?dataUrl=https%3A%2F%2Fwafertools.github.io%2Ftsmap%2Fsamples%2Ftsmap-single-wafer.stdf&dataFormat=stdf) and find the toolbar's four groups
2. **Clear files**, then **Load sample data**
3. **Plot mode → Test Value → fmax_MHz**: which corner reads lowest?
4. **Overlays → Ring boundaries**, then back to **Hard Bin**
5. Zoom into W04 · SS and hover a failing die

---

# Recap

- **Plot mode** picks bins or a test; the legend highlights one bin
- **Overlays** and **Orientation** change how every map is drawn
- Each card zooms, pans and saves on its own

More in the [wafer map guide](https://wafertools.github.io/wafermap/user-guide/#3-toolbar-controls)

---

<!-- _class: next -->
<!-- _paginate: false -->

# Next lesson

[03 · Findings →](03-findings.md)

What tsmap noticed in the lot, and how to read it.
