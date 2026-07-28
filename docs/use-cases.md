# Use cases

A few workflows tsmap is built for. Each links to the relevant [user guide](user-guide.md)
section for the exact steps.

## Yield triage across a lot

Load a multi-wafer STDF lot and scan the gallery for outliers — a wafer sitting well below
the rest immediately stands out. Drill into it in soft-bin mode and check the always-on
spatial findings for edge effects or clustering that would point at a process or handling
issue rather than a random fail.

![Multi-wafer gallery](images/gallery.png)
![Wafer map in soft-bin mode](images/wafer-map-softbin.png)

See [Opening files](user-guide.md#2-opening-files) and
[The wafer map view](user-guide.md#5-the-wafer-map-view).

## Root-causing a parametric fail via correlation

Spot a test with a high fail rate in test-value (parametric heat-map) mode. Open Insights,
switch to the Correlation sub-tab, and check whether that test correlates with another —
a strong Pearson r pointing at a shared root cause. Click the matrix cell to jump straight to
a scatter plot of the two tests and confirm the relationship visually.

![Wafer map in test-value mode](images/wafer-map-testvalue.png)
![Test correlation matrix](images/correlation.png)
![Test scatter](images/scatter.png)

See [The wafer map view](user-guide.md#5-the-wafer-map-view) and
[Insights tab](user-guide.md#7-insights-tab).

## Comparing process corners with splits

Assign a process-corner label (TT/FF/SS/FS/SF, or whatever labels your experiment uses) to
each wafer via the Splits dialog, then group the Insights Overview by Split to see yield and
bin pareto broken out per corner side by side. Drill into a single corner for its own
per-wafer breakdown.

![Splits dialog with corners loaded](images/splits-modal-loaded.png)
![Insights Overview grouped by Split](images/charts-grouped-by-split.png)

See [Wafer splits](user-guide.md#6-wafer-splits).

## Scripted and offline batch workflows

On the desktop app, open files directly from the command line (`tsmap lot1.stdf lot2.stdf`),
supply a pre-built test selection with `--tests`, or seed wafer splits with `--splits` — all
without touching the GUI's file pickers. Because parsing is entirely local, this works
offline and is safe for confidential lot data: nothing is uploaded, ever, on either platform.

See [Command line](user-guide.md#command-line) in the user guide.
