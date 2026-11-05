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

## STDF and ATDF
The tester's own file formats. STDF is the binary standard test data format; ATDF is its text form. tsmap reads both directly, so there is nothing to convert. Lessons [00](00-welcome.md) and [01](01-getting-data-in.md).

## Prober
The machine that steps the wafer under the probe card, one die after another, so the tester can touch each die in turn. Lesson [00](00-welcome.md).

## Site
Many testers probe several dies at once, each through its own numbered site (1, 2, 3…). Sites are positions on the probe card, not separate wafers: all of them belong to the same wafer. Lesson [11](11-unusual-wafers.md).

## Hard bin
The sort result for a die. A pass bin, usually bin 1, is a good die. The wafer map's legend lists the hard bins with their counts. Lesson [00](00-welcome.md).

## Soft bin
The test program's own reason for a result. It is finer than the hard bin: several soft bins usually roll up into one hard bin. Lesson [00](00-welcome.md).

## Pass bin
The hard bin, or bins, that count as a pass. The default is 1, but some test programs pass in another bin or in several. The yield figure and its label follow the pass bins you set, so check them first when a yield looks wrong. Lesson [01](01-getting-data-in.md).

## Test value
One number measured on one die by one test, such as a threshold voltage or a leakage current. A die carries a value for every test the program ran on it. Lesson [00](00-welcome.md).

## Functional test
A test with no measured value, only a pass or a fail, such as a scan chain. It has no value to colour on a gradient, so the map shows the tester's verdict, and it gets a pass rate instead of statistics such as Ppk. Lessons [00](00-welcome.md), [03](03-findings.md) and [05](05-insights-yield.md).

## Yield
The share of dies that land in a pass bin. A wafer's yield counts that wafer's dies. A lot's **mean per-wafer yield** averages its wafers' yields, so each wafer counts once. A **pooled yield** counts every die once, so a wafer with more dies weighs more. The label always says which. Lessons [00](00-welcome.md) and [03](03-findings.md).

## Edge exclusion
A band at the rim of the wafer, measured in millimetres, that is left out of yield and drawn dimmed. Edge dies are handled roughly and may fall partly outside the exposed area. It needs a wafer diameter first. Lessons [02](02-reading-a-map.md) and [11](11-unusual-wafers.md).

## Notch and flat
The cut in the edge of a wafer that tells machines which way round it is: a small V-shaped notch, or on older wafers a straight flat. Orientation turns the drawn map to match your convention; the dies' coordinates never change. Lesson [02](02-reading-a-map.md).

## Test limits
The range a test's value must fall in for the die to pass: the low and high limits stored in the test program. In Test Value mode a die outside them is marked ▽ (below) or △ (above). Lesson [02](02-reading-a-map.md).

## Verdict
A go or no-go result: the pass or fail the tester recorded for a die on a test, or a derived test that gives yes or no. It can differ from what the limits say; guard bands are one reason. A verdict has no value to plot, so charts treat it as a category. Lessons [02](02-reading-a-map.md) and [10](10-your-own-plots.md).

## Spec limits
The product specification for a test. Test limits are often set inside the spec limits as a guard band. Process capability is measured against the spec limits when a test has both, and against the test limits otherwise. Lesson [06](06-insights-distributions.md).

## Validity limits
The range a real measurement can lie in. A tester that runs out of range records its limit, such as a current held at its clamp, and that number is not a reading. A value outside the validity limits can be left out of the statistics. Lesson [11](11-unusual-wafers.md).

## Excluded value
A test value outside the limits you chose for exclusion, the validity limits by default. It counts as missing for that test on that die, in the map, the statistics and every chart, and the die is drawn grey. Bins and the tester's own pass or fail are unchanged, so yield is the same. Lesson [11](11-unusual-wafers.md).

## Split
A name you give a wafer that the data file does not include, such as a process corner: TT, FF, SS. Splits are what **Group by** compares in Insights. Lesson [04](04-the-lot-view.md).

## Lot stack
Every wafer of a lot laid over the others, so each die position shows a count or a combined value across the wafers. One wafer's pattern can be chance; the same positions failing on many wafers is not. Lesson [04](04-the-lot-view.md).

## Wafer attribute
A fact about a whole wafer rather than a die: its lot, product, test program, temperature, operator or test date, or a split you gave it. A wafer attribute tells wafers apart, and it is what **Group by** pools them on. Lessons [01](01-getting-data-in.md) and [05](05-insights-yield.md).

## Group by
Pools whole wafers by a wafer attribute for every chart on the Insights tab, so each chart draws one group for each value. It takes wafer attributes only; to separate the dies within each wafer use **Compare by**. One wafer has nothing to group, so it appears only for a lot. Lessons [05](05-insights-yield.md) and [10](10-your-own-plots.md).

## Compare by
What one plot separates its marks by: its **Colour** and, on a bar or box, its **Categories**. It can use a wafer attribute, or a ring, bin, site or verdict. Where **Group by** pools wafers for the whole tab, Compare by acts on a single plot. Lesson [10](10-your-own-plots.md).

## Die region
A category a die falls into from where it sits, worked out rather than recorded: its ring, quadrant, reticle cell or reticle shot. A die belongs to all of them at once, which is why a region can separate the dies in a plot but is never a **Group by** choice. Lessons [10](10-your-own-plots.md) and [11](11-unusual-wafers.md).

## Reticle
The rectangular area exposed in one step of the lithography machine. The same pattern is stepped across the wafer, so each reticle holds a fixed block of dies. tsmap can overlay the reticle grid. Lesson [11](11-unusual-wafers.md).

## Reticle cell
A die's place inside the reticle: which of the field's dies it is, such as column 1, row 3 of a 4 × 3 field. The same cell recurs in every exposure across the wafer, so a cell that is poor everywhere points at the mask or the lens rather than at the wafer. Lesson [11](11-unusual-wafers.md).

## Reticle shot
Where on the wafer the reticle was placed for a die: one exposure of the mask. Each shot is a different place on the wafer, so a poor shot points at something that varies across the wafer, such as focus, tilt or the edge. This is not the reticle cell, which is inside the mask. Lesson [11](11-unusual-wafers.md).

## Retest policy
When the same die position appears more than once, one result has to stand for the die. **Last** is the default; **First** keeps the earliest probe; **Best** prefers a pass over a fail, then the lower hard bin; **Worst** prefers a fail over a pass, then the higher hard bin. The choice feeds every figure. Lesson [11](11-unusual-wafers.md).

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

## z-score
How far a value is from the average, counted in standard deviations. A z-score of 0 is average, +1 is one standard deviation above and −1 one below. Rescaling every test to z-scores puts tests in different units on one colour scale. Lesson [06](06-insights-distributions.md).

## Filter
Conditions that keep only some wafers and dies, such as one split, a bin, or a range on a test. One filter applies to the gallery, the map and every Insights tab, and each figure is worked out again over what is kept. A die the filter drops is drawn faded. Lesson [08](08-drilling-down.md).

## Probability plot
Each group's sorted values against their cumulative share, on a scale stretched so that normally spread data falls on a straight line. A shift, a wider spread, a second population and outliers each bend the line differently. Lessons [06](06-insights-distributions.md) and [10](10-your-own-plots.md).

## Western Electric rules
Four tests for a control chart that say a run of points is unlikely to be chance: one point beyond 3σ; two of three beyond 2σ on one side; four of five beyond 1σ on one side; eight in a row on one side of the centre. Each is marked at the point that completes it. Lesson [10](10-your-own-plots.md).
