---
marp: true
theme: tsmap
paginate: true
title: "06 · Correlation"
description: Find tests that move together, and check the relationship holds inside each group.
footer: tsmap training · 06 Correlation
---

<!-- _class: title -->
<!-- _paginate: false -->

# Correlation

## Session 06

tsmap training · a self-paced course

---

# In this session

- Read the correlation matrix and open a pair as a scatter
- Check a relationship wafer by wafer and group by group
- Chart just the dies you drag a box around

---

<!-- _class: divider -->

# The matrix and the scatter

---

<!-- covers: Correlation -->

# The Correlation tab

A matrix of the correlation between pairs of tests on the left, and a scatter of one pair on the right, a point per die.

![The Correlation tab: the matrix and the test scatter](images/06/correlation-tab.png)

---

<!-- _class: split -->
<!-- covers: Max tests:; Correlation CSV -->

# The matrix

Each cell is the Pearson correlation, r, of two tests over the dies. Blue is positive: the two tests rise and fall together. Orange is negative: when one rises the other falls. The stronger the colour, the closer r is to +1 or −1. <span class="badge">1</span> sets how many tests it shows; <span class="badge">2</span> saves it as a table.

![The matrix, with Max tests and Correlation CSV outlined](images/06/matrix.png)

---

# Fewer tests

You can set **Max tests** between 5 and 100 (default 20). The card counts pairs with |r| of 0.7 or more as strong and 0.4 to 0.7 as moderate. With five tests it finds 2 strong and 4 moderate.

![The matrix limited to five tests](images/06/max-tests.png)

---

<!-- _class: split -->

# Open a pair

Click a cell and the scatter shows that pair. Above the scatter, **r** is the correlation and **n** the number of dies. Here idsat_p_uA falls as vth_p_mV rises, r = −0.865. The matrix rounds it to two decimals.

![The scatter after clicking the idsat_p_uA, vth_p_mV cell](images/06/scatter-pair.png)

---

<!-- _class: divider -->

# Is it real?

---

<!-- covers: Correlation bin chip -->

# Bin buttons

The **Bin 1**, **Bin 2** and **Bin 3** buttons above the plot show or hide the dies of each bin. Click one to switch it off or on, so you can see whether failing dies sit at one end of the relationship.

![The scatter with only bin 1 shown, the Bin 1 button outlined](images/06/scatter-bins.png)

---

<!-- _class: split -->

# The Mixed Split warning

When the dies pool several values of a field such as the split, the card warns that the correlation may mislead. A trend can appear only because the groups sit at different levels, not because the two tests are related inside each group. This is known as Simpson's paradox.

![The Mixed Split warning above the matrix](images/06/mixed-warning.png)

---

<!-- covers: Wafer; Test -->

# One wafer at a time

The **Wafer** menu narrows the scatter to one wafer. The **X** and **Y** menus pick the tests, as the matrix cells do.

![The Wafer menu on the scatter](images/06/wafer-picker.png)

---

# Inside one wafer

On W07 alone, r is −0.564, not −0.865. Part of the pooled figure may come from the splits sitting at different levels. The warning is gone because only one wafer is left.

![The scatter for W07 · TT only](images/06/one-wafer.png)

---

<!-- covers: Group by › Split -->

# Group by

With **Group by** on, the scatter colours its points by group. The **Show** menu picks one group, and the matrix then uses only that group's dies. With **All groups** the matrix still pools every wafer.

![The Correlation tab grouped by Split](images/06/grouped.png)

---

<!-- _class: divider -->

# Dies from the scatter

---

# Drag a box

Drag a rectangle over the scatter to select the dies inside it, across as many wafers as they fall on. A menu opens with the **Value histogram** and **Process capability** charts, **New plot…** and **New sweep…**, and the **Test statistics**, **Wafers** and **Dies** tables, all for just those dies.

![A box dragged over the scatter, with the menu of charts and tables](images/06/drag-box.png)

*(The same menu is the subject of session 07.)*

---

<!-- _class: lab -->

# Try it yourself

1. In the [web app](https://wafertools.github.io/tsmap/app/), **Load sample data**, then **Insights → Correlation**
2. Click the strongest orange cell (each pair appears twice): which two tests, and what is r?
3. Pick **W07 · TT** in the **Wafer** menu: how does r change?
4. Set **Group by** to **Split**, then pick one group in **Show**: does the relationship hold in that group?
5. Drag a box over the scatter and open **Test statistics**

---

# Recap

- The matrix shows every pair; a cell opens that pair as a scatter
- r says two tests move together, not why
- Check it wafer by wafer and group by group before trusting a pooled figure

More in the [wafer map guide](https://wafertools.github.io/wafermap/user-guide/#8-insights-tab)

---

<!-- _class: next -->
<!-- _paginate: false -->

# Next session

07 · Drilling into any population

Filter, select and chart just the dies you care about.
