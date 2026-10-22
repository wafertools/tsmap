---
marp: true
theme: tsmap
paginate: true
title: "02 · Reading a map and the toolbar"
description: Plot modes, colour schemes, overlays, orientation, the gallery layout, and one wafer close up.
footer: tsmap training · 02 Reading a map
---

<!-- _class: title -->
<!-- _paginate: false -->

# Reading a map and the toolbar

## Session 02

tsmap training · a self-paced course

---

# In this session

- Change what the maps show: bins or a test's values
- Add overlays and turn the wafer to your convention
- Zoom into one wafer and read a single die

---

<!-- _class: divider -->

# What the map shows

---

<!-- covers: Download gallery PNG -->

# The gallery toolbar

Every button here acts on all the wafers at once. The camera saves the whole gallery as one PNG.

![The gallery toolbar](images/02/gallery-toolbar.png)

---

<!-- covers: Plot mode; Plot mode › Test Value ▶; Plot mode › Hard Bin; Plot mode › Soft Bin -->

# Plot mode

Colour each die by its hard bin, its soft bin, or one test's value. The stacked modes come in session 04.

![The Plot mode menu](images/02/plot-mode-menu.png)

---

# Soft Bin

The test program's failure category for each die, with its own legend.

![The sample lot in Soft Bin mode](images/02/soft-bin.png)

---

# Test Value

Each die coloured by its reading. ▽ and △ mark dies below and above the test limits.

![W01 coloured by fmax_MHz](images/02/test-value-card.png)

---

<!-- covers: Toggle log scale; Colorbar range: test limits (click for data range) -->

# Two more buttons for values

<span class="badge">1</span> Log scale. <span class="badge">2</span> Colorbar range: the test limits, the same on every wafer, or the data's own range.

![The gallery in Test Value mode, with its two extra buttons outlined](images/02/test-value.png)

---

<!-- covers: Colour scheme; Colour scheme › ✓Default; Colour scheme › ✓Colour-blind safe -->

# Colour scheme

Default or colour-blind safe bin colours. Passing bins are always shades of green.

![The Colour scheme menu](images/02/colour-scheme-menu.png)

---

# Highlight a bin

Click a bin in the legend and the others grey out. Click it again to clear.

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

# Rings and quadrants

Ring boundaries match the zones the findings use. Quadrant lines split the wafer N, S, E and W.

![W01 with ring boundaries and quadrant lines](images/02/overlays-on.png)

---

<!-- covers: Orientation; Orientation › * -->

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
<!-- covers: Download PNG; Zoom (drag to zoom region); Zoom in; Zoom out; Reset zoom (double-click); Pan (drag to move); Select (drag to select dies) -->

# Each wafer's toolbar

- <span class="badge">1</span> Save this map as a PNG
- <span class="badge">2</span> Zoom to a region, in, out, reset
- <span class="badge">3</span> Pan &nbsp;<span class="badge">4</span> Select dies (session 07)

![A wafer card's toolbar](images/02/card-toolbar.png)

---

# Zoom in

The mouse wheel zooms at the cursor, arrow keys pan, and Ctrl + 0 resets.

![W01 zoomed in two steps](images/02/zoomed-card.png)

---

# Read one die

Hover a die for its coordinates, bins, site and part ID.

![The tooltip for one die on W01](images/02/die-tooltip.png)

---

# The wafer's details

The **▾** beside a wafer's name lists everything the file says about that wafer.

![W01's details, expanded](images/02/wafer-info.png)

---

<!-- _class: lab -->

# Try it yourself

1. In the [web app](https://wafertools.github.io/tsmap/app/), **Load sample data**
2. **Plot mode → Test Value → fmax_MHz**: which corner reads lowest?
3. **Overlays → Ring boundaries**, then back to **Hard Bin**
4. Zoom into W04 · SS and hover a failing die

---

# Recap

- **Plot mode** picks bins or a test; the legend highlights one bin
- **Overlays** and **Orientation** change how every map is drawn
- Each card zooms, pans and saves on its own

More in the [wafer map guide](https://wafertools.github.io/wafermap/user-guide/#3-toolbar-controls)

---

<!-- _class: next -->
<!-- _paginate: false -->

# Next session

03 · Findings

What tsmap noticed in the lot, and how to read it.
