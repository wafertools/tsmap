---
marp: true
theme: tsmap
paginate: true
title: "04 · The lot view"
description: Stack a lot into one map, select the same dies on every wafer, and name wafer splits.
footer: tsmap training · 04 The lot view
---

<!-- _class: title -->
<!-- _paginate: false -->

# The lot view

## Session 04

tsmap training · a self-paced course

---

# In this session

- Combine every wafer of a lot into one stacked map
- Select the same dies on every wafer
- Name wafer splits and show them on the maps

---

<!-- _class: divider -->

# Gallery and stack

---

# One card per wafer

A gallery shows each wafer on its own card. This is EDGE-LOT-01, eight wafers with an edge-ring defect. The buttons above act on all the cards at once (session 02).

![EDGE-LOT-01 as a gallery, one card per wafer](images/04/gallery.png)

---

<!-- _class: split -->
<!-- covers: Plot mode › Stacked Test Values; Plot mode › Stacked Hard Bins; Plot mode › Stacked Soft Bins -->

# Stack the lot

Under **Lot aggregation**, three plot modes combine all the wafers into one map per bin or per test.

![The Plot mode menu with its three stacked modes outlined](images/04/plot-mode-stacked.png)

---

# Stacked Hard Bins

One card per bin. Each die position is coloured by how many wafers had that bin there: 0 to 8 here. Pass is high everywhere except a ring at the edge, where the defect sits.

![Stacked Hard Bins for EDGE-LOT-01, with the stack header outlined](images/04/stack-hard.png)

---

# Stacked Soft Bins

The same for soft bins, so lot-level failure modes show as one map per soft bin.

![Stacked Soft Bins for EDGE-LOT-01](images/04/stack-soft.png)

---

# Stacked Test Values

One card per test (three here), with the values combined across the wafers. The header says how many wafers were stacked and how they were combined.

![Stacked Test Values: one card per test, with the Σ button outlined](images/04/stack-values.png)

---

<!-- _class: split -->

# Aggregation method

The **Σ** button, in stacked value modes, picks how the wafers are combined at each die position. Std Dev shows where values vary most across the lot.

![The Aggregation method menu: Mean, Median, Std Dev, Min, Max and Count](images/04/aggregation-menu.png)

---

<!-- _class: divider -->

# Selecting across wafers

---

<!-- covers: Select the same dies on every wafer: off (click to turn on) -->

# Select the same dies on every wafer

Off by default, so each card selects on its own. Click the button to turn it on.

![The Select the same dies on every wafer button, outlined](images/04/same-dies-toggle.png)

---

# One box, every wafer

Back on the sample lot, drag a box on one wafer and the same die positions are selected on all of them. The badge counts them. Clicking the button clears the selection.

![A box dragged on W01 selects the same dies on every wafer; the badge reads 24](images/04/same-dies-selected.png)

*(Charts of the selected dies are covered in session 07.)*

---

<!-- _class: divider -->

# Wafer splits

---

<!-- _class: split -->
<!-- covers: Setup ▾ › Splits… -->

# What a split is

A split is a name you give a wafer that the test data file doesn't include, such as a process corner. **Setup ▾ → Splits…** opens the dialog.

![The Setup menu with Splits… outlined](images/04/setup-menu.png)

---

<!-- _class: split -->
<!-- covers: Splits… › wafer row; Splits… › Select all; Splits… › Select none; Dialog › Maximize (F); Dialog › Close (Esc) -->

# The Splits dialog

The banner says where things stand. The sample lot's corners are already assigned. **Maximize (F)** and **Close (Esc)**, top right, are on every dialog.

![The Wafer splits dialog for the sample lot](images/04/splits-dialog.png)

---

<!-- covers: Splits… › Show split in wafer map labels -->

# Splits in the labels

With **Show split in wafer map labels** ticked, the split follows the wafer ID on every card.

![Card headers reading W01 · TT, W02 · FF and W03 · TT](images/04/labels-on.png)

---

# Plain wafer IDs

Untick it and the cards show plain wafer IDs. The assignments are unchanged either way.

![Card headers reading W01, W02 and W03](images/04/labels-off.png)

---

<!-- _class: split -->
<!-- covers: Splits… › Assign to selected; Splits… › Clear split; Splits… › Clear all -->

# Assign a split

Tick wafers and type a name <span class="badge">1</span>, then **Assign to selected** <span class="badge">2</span>. **Clear split** <span class="badge">3</span> clears the ticked wafers; **Clear all** clears every wafer.

![The dialog after Clear all, with five wafers ticked and TT typed](images/04/splits-assign-ready.png)

---

<!-- _class: split -->
<!-- covers: Splits… › split name suggestion -->

# Reuse a name

Every action applies at once. Names in use appear beside **In use**: click one to reuse it, so TT and tt don't drift apart.

![The dialog after assigning TT to five wafers](images/04/splits-assigned.png)

---

<!-- _class: split -->
<!-- covers: Splits… › Save splits…; Splits… › Load splits…; Splits… › Done -->

# Save, load, finish

<span class="badge">1</span> writes every wafer's split to a CSV. <span class="badge">2</span> reads one back, matching by lot and wafer ID. <span class="badge">3</span> closes the dialog.

![The Save splits, Load splits and Done buttons, outlined](images/04/splits-save-load.png)

---

# Remembered for the lot

tsmap remembers splits per lot and wafer, so reopening the same lot restores them and shows you what it restored. **Clear all** forgets them too.

Data with no lot ID can't be matched this way, so its splits are not remembered. Save them to a CSV instead.

---

<!-- _class: divider -->

# A wafer on its own

---

<!-- _class: split -->
<!-- covers: Open full view; Reattach to gallery -->

# Detach a wafer and bring it back

**Open full view**, the expand button in a card's header, detaches that wafer into its own window with the full single-map toolbar.

The vacated card becomes a placeholder. Its **Reattach to gallery** button puts the wafer back; closing the window does the same.

![A wafer card's header with the Open full view button outlined](images/04/open-full-view.png)

---

<!-- covers: Map; Expand (E) -->

# Expand a single wafer

With one wafer loaded, the view switch reads **Map | Insights**. **Expand (E)** opens the map in an enlarged overlay. **F** maximises it; **Esc** closes it.

---

<!-- _class: lab -->

# Try it yourself

1. In the [web app](https://wafertools.github.io/tsmap/app/), **Load sample data**
2. **Plot mode → Stacked Hard Bins**: where do the failing bins gather?
3. **Stacked Test Values**, then **Σ → Std Dev**
4. Back to **Hard Bin**, turn on **Select the same dies on every wafer** and drag a box
5. **Setup ▾ → Splits…**: tick W01 and W03, then assign a new name

---

# Recap

- **Stacked modes** turn a lot into one map per bin or test
- **Select the same dies** reads one region across every wafer
- **Splits** name wafers the file doesn't, and show on every label

More in the [wafer map guide](https://wafertools.github.io/wafermap/user-guide/#7-lot-stack-maps)

---

<!-- _class: next -->
<!-- _paginate: false -->

# Next session

05 · Insights

Charts and statistics for the whole lot.
