# Edge-Corner Lot

Source description for `edge-corner-lot.mjs`. Written in plain prose — if you
edit this file to change the story, ask Claude to regenerate the `.mjs` from
it (and re-verify it against the real app; see `README.md`'s workflow note).
Don't hand-edit `edge-corner-lot.mjs` and let this file drift out of sync with it.

Fixture: `npm run demo:data` generates 202 STDF files under
`testdata/edge-corner-lot/` — 190 decoys, 12 real wafers belonging to lot
LOT-A417, split across four process corners (TT/FF/FS/SS) that aren't
recoverable from the STDF data itself.

## 1. The haystack

A folder of 202 files sits on disk. Most are decoys from unrelated lots.
Twelve of them are the lot that actually matters.

## 2. Filter files

Open "Filter files…" and pick all 202 files. Wait for the scan to finish —
every file's lot metadata (lot ID, part type, tester, node, job name) gets
read without fully parsing the die data. Type "LOT-A417" into the search
box. The table narrows from 202 down to exactly the 12 files belonging to
this lot.

## 3. Open the lot

Select all 12 filtered files and click "Load selection…". Because more than
one file is being loaded at once, a rename overlay appears listing every
wafer — accept the defaults and continue. The gallery renders: 12 wafer
maps, 2652 dies total.

## 4. Look at a wafer

Hover the first wafer's card to reveal its toolbar, then open the "Plot
mode" dropdown. It lists Hard Bin, Soft Bin, and Test Value — a real,
live-populated menu, not a static mockup.

## 5. Bring in the process-corner splits

Open the Lot ▾ menu, choose "Splits…", and load the matching
`LOT-A417_splits.csv` — this assigns each wafer to a process corner (TT,
FF, FS, or SS). Close the dialog.

Open Insights, and set "Group by:" to Split. The Overview tab now shows
yield broken out by corner instead of lumped together — and one corner (SS)
is clearly, badly behind the other three.

## 6. Find the test responsible

Switch to the Distributions tab. The "Process capability" panel ranks all
six tests by how well they're meeting spec, worst first. The very first
column is `fmax_MHz`, and clicking it does something useful: both the
boxplot ("Test value distribution") and the histogram next to it snap to
show that same test, broken out by corner. SS's fmax distribution sits
closer to the lower spec limit than any other corner's.

## 7. Drill down to the wafer

In the boxplot, click the SS group's box — it drills in place to show that
corner's three individual wafers. Click again on the same spot (now showing
one specific wafer) and a wafer map opens in a modal — already switched to
Test Value mode, already showing `fmax_MHz`, no extra clicks needed. The map
makes the story visible: dies fail overwhelmingly at the wafer's outer edge,
forming a ring, while the core stays clean.

That's the investigation — a bad corner, on one test, with a spatial
signature — found by filtering, grouping, and drilling, not by already
knowing the answer.
