# Features

A tour of what tsmap does. For step-by-step instructions on any of this, see the
[user guide](user-guide.md) — this page covers capability and benefit, not the click-by-click.

## Open any format

STDF, ATDF, CSV, and JSON — all multi-wafer by default, and all mergeable into one gallery
from several files at once. Gzip (`.gz`) and Zip (`.zip`) archives are handled transparently.

![Multi-wafer gallery](images/gallery.png)

STDF and ATDF are parsed natively in Rust on both platforms (compiled to WebAssembly for the
browser), which is where tsmap's speed comes from: a 341 MB / 266,000-die STDF lot parses in
about 3.5 seconds (~96 MB/s) on a 2021 ThinkPad laptop, and about 2.3 seconds (~148 MB/s) on
a small desktop. CSV and ATDF parsing saw similar jumps in a 2026 rewrite — CSV about 3.4×
faster, ATDF about 2.8× faster.

See [Supported file formats](user-guide.md#1-supported-file-formats) and
[Opening files](user-guide.md#2-opening-files) in the user guide.

## Two-pass test selector

STDF/ATDF files with a lot of tests get a fast first-pass scan, then a selector overlay to
choose which tests to actually import — before the full parse runs. Selections (and renames)
can be saved to a file and reloaded later, or supplied on the command line.

![Test selector overlay](images/test-selector.png)

See [Test selector](user-guide.md#4-test-selector-stdf-and-atdf) in the user guide.

## Interactive wafer maps

Yield, soft-bin, and per-test parametric heat-map views, with zoom, pan, and hover. Spatial
findings (edge effects, clustering) are always computed; an optional value-findings mode adds
statistical outlier detection on top.

![Wafer map in test-value mode](images/wafer-map-testvalue.png)
![Wafer map in soft-bin mode](images/wafer-map-softbin.png)

See [The wafer map view](user-guide.md#5-the-wafer-map-view) in the user guide.

## Wafer splits — compare process corners

Attach an arbitrary label to each wafer — a process corner (TT/FF/SS/FS/SF), an experiment
group, anything not present in the source file — and save/load the assignment as CSV. Splits
feed straight into every chart's **Group by** control.

![Splits dialog with corners loaded](images/splits-modal-loaded.png)
![Gallery showing split labels on each card](images/gallery-splits.png)

See [Wafer splits](user-guide.md#6-wafer-splits) in the user guide.

## Charts & Insights

The Insights tab (wmap's own built-in chart suite) covers yield, bin pareto, process
capability, boxplot, histogram, correlation matrix, and scatter — organized into Overview,
Distributions, and Correlation sub-tabs, with a shared **Group by** control (lot, program,
tester, node, part type, or any wafer split) and click-through drilldown.

![Insights Overview — yield, bin pareto, ring/quadrant yield, test values](images/charts-overview.png)

<div style="display:flex; gap:12px; flex-wrap:wrap;">
<img src="images/chart-yield.png" alt="Yield by wafer, expanded" style="flex:1; min-width:220px; border:1px solid var(--md-default-fg-color--lightest); border-radius:4px;">
<img src="images/chart-pareto.png" alt="Bin pareto, expanded" style="flex:1; min-width:220px; border:1px solid var(--md-default-fg-color--lightest); border-radius:4px;">
<img src="images/boxplot.png" alt="Test value distribution boxplot, expanded" style="flex:1; min-width:220px; border:1px solid var(--md-default-fg-color--lightest); border-radius:4px;">
</div>
<div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:12px;">
<img src="images/histogram.png" alt="Value histogram, expanded" style="flex:1; min-width:220px; border:1px solid var(--md-default-fg-color--lightest); border-radius:4px;">
<img src="images/correlation.png" alt="Test correlation matrix, expanded" style="flex:1; min-width:220px; border:1px solid var(--md-default-fg-color--lightest); border-radius:4px;">
<img src="images/scatter.png" alt="Test scatter, expanded" style="flex:1; min-width:220px; border:1px solid var(--md-default-fg-color--lightest); border-radius:4px;">
</div>

Grouping and drilldown work together: group the Overview by a wafer split to see yield and
bin pareto broken out per corner, then click a group's bar to drill in-place to that corner's
own per-wafer view.

![Insights Overview grouped by Split](images/charts-grouped-by-split.png)
![Yield drilled into a single Split](images/yield-group-drilldown.png)

See [Insights tab](user-guide.md#7-insights-tab) in the user guide.

## Export & desktop/browser parity

Every chart has a camera button for a clean PNG export at full resolution, and the wafer map
toolbar has its own PNG export too. The desktop app and browser build share the same Rust
parsing core and the same rendering — same maps, same charts, both fully local and both
usable offline once loaded.

![Wafer map toolbar with the plot-mode dropdown open](images/wafer-map-toolbar.png)

See [Exporting charts](user-guide.md#8-exporting-charts) and the full
[desktop vs browser comparison](web.md#differences-from-the-desktop-app) in the web app page.
