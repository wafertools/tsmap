---
title: Glossary
description: The words used in wafer testing and in the Learn tsmap lessons, in plain English.
---

# Glossary

The words the lessons use, in plain English, each with the lesson that teaches it. Terms are in the order you meet them.

## Wafer
A thin disc of silicon, usually 200 or 300 mm across, that carries hundreds or thousands of identical chips. Lesson [00](00-welcome.md).

## Die
One chip on a wafer. A wafer map draws one square for each die, coloured by its result. Lesson [00](00-welcome.md).

## Lot
A batch of wafers made and tested together, often 25. tsmap says "lot" only when every wafer carries the same lot ID. Lesson [00](00-welcome.md).

## Tester
The equipment that runs the test program and records each die's results. Also called ATE, for automatic test equipment. It writes the STDF or ATDF file tsmap reads. Lesson [00](00-welcome.md).

## Prober
The machine that steps the wafer under the probe card, one die after another, so the tester can touch each die in turn. Lesson [00](00-welcome.md).

## Site
Many testers probe several dies at once, each through its own numbered site (1, 2, 3…). Sites are positions on the probe card, not separate wafers: all of them belong to the same wafer. Lesson [11](11-unusual-wafers.md).

## Hard bin
The sort result for a die. A pass bin, usually bin 1, is a good die. The wafer map's legend lists the hard bins with their counts. Lesson [00](00-welcome.md).

## Soft bin
The test program's own reason for a result. It is finer than the hard bin: several soft bins usually roll up into one hard bin. Lesson [00](00-welcome.md).

## Yield
The share of dies that land in a pass bin. A wafer's yield counts that wafer's dies. A lot's **mean per-wafer yield** averages its wafers' yields, so each wafer counts once. A **pooled yield** counts every die once, so a wafer with more dies weighs more. The label always says which. Lessons [00](00-welcome.md) and [03](03-findings.md).

## Test limits
The range a test's value must fall in for the die to pass: the low and high limits stored in the test program. In Test Value mode a die outside them is marked ▽ (below) or △ (above). Lesson [02](02-reading-a-map.md).

## Spec limits
The product specification for a test. Test limits are often set inside the spec limits as a guard band. Process capability is measured against the spec limits when a test has both, and against the test limits otherwise. Lesson [06](06-insights-distributions.md).

## Validity limits
The range a real measurement can lie in. A tester that runs out of range records its limit, such as a current held at its clamp, and that number is not a reading. A value outside the validity limits can be left out of the statistics. Lesson [11](11-unusual-wafers.md).

## Split
A name you give a wafer that the data file does not include, such as a process corner: TT, FF, SS. Splits are what **Group by** compares in Insights. Lesson [04](04-the-lot-view.md).

## Reticle
The rectangular area exposed in one step of the lithography machine. The same pattern is stepped across the wafer, so each reticle holds a fixed block of dies. tsmap can overlay the reticle grid. Lesson [11](11-unusual-wafers.md).

## Part average testing (PAT)
A screen for dies that pass every limit but sit far from the rest of their wafer on a test. The PAT limits are worked out per wafer and test: the median plus or minus six robust sigma, never wider than the test's own limits. A die outside them is a **PAT outlier**. Lesson [05](05-insights-yield.md).

## Robust sigma
A measure of spread that outliers cannot inflate: the interquartile range divided by 1.35, around the median. PAT sets its limits from it. Lesson [05](05-insights-yield.md).

## Ppk
A capability index: the gap from a test's mean to its nearest limit, in units of three standard deviations, using the overall spread, wafer-to-wafer variation included. 1.33 or more is usually called capable; under 1.0 is poor. Lesson [06](06-insights-distributions.md).

## r
The correlation between two tests, from −1 to 1. Near 1 means one rises as the other rises; near −1 means one falls as the other rises; near 0 means no straight-line link. **n** is the number of dies behind it. Lesson [07](07-correlation.md).

## Welch p
How likely a difference between groups of wafers is to be chance, comparing the groups' means without assuming equal spreads. Each wafer counts once, so n is the number of wafers. A small p says the difference is unlikely to be chance, not that it matters or why it is there. Lesson [06](06-insights-distributions.md).

## Rank p
The same question as Welch p, asked of ranks instead of values (the Kruskal–Wallis test), so one odd wafer cannot drive the answer. Lesson [06](06-insights-distributions.md).

## q
Welch p adjusted for how many tests were compared at once (the Benjamini–Hochberg method). Compare many tests and some will look different by chance; q allows for that. Lesson [06](06-insights-distributions.md).
