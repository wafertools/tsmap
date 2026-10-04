// The user's saved plots — the recipes behind Insights' Plot tab — remembered across loads and restarts.
//
// wmap keeps nothing itself: it is handed the list (`insights.plots`) and reports every change
// (`insights.onPlotsChange`, debounced). tsmap stores the file text, exactly what wmap's own Export plots… writes, so a
// plot saved here can be exported, shared and imported with no conversion, and wmap's reader is the only validator of
// the format (a second one here would be two copies of a rule).
//
// Global, not per lot: a plot is a recipe with no population, and one that vanished when a different file opened would
// defeat keeping it. A plot that needs a test the open lot lacks stays in the list, greyed, until a lot that has it.

import { readPlotsFile, writePlotsFile } from '@wafertools/wafermap';
import type { PlotSpec } from '@wafertools/wafermap';
import { storageKey } from './storageKeys';

const KEY = storageKey('tsmap:plots');

/** The latest list, so a re-render that happens before the next change is reported still starts from it. */
let latest: PlotSpec[] | null = null;

/** The saved plots, or none when nothing is saved or storage is unavailable. */
export function loadSavedPlots(): PlotSpec[] {
  if (latest) return latest;
  let text: string | null;
  try { text = localStorage.getItem(KEY); } catch { return (latest = []); }
  if (!text) return (latest = []);
  // Lenient on purpose: a plot that cannot be read is dropped and the rest are kept, rather than losing all of them.
  latest = readPlotsFile(text).plots;
  return latest;
}

export function savePlots(plots: PlotSpec[]): void {
  latest = plots;
  try {
    if (plots.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, writePlotsFile(plots));
  } catch { /* storage full or unavailable: the plots last for this session */ }
}

/** Test seam: forget the in-memory copy, as a fresh start would. */
export function resetPlotPrefsForTests(): void {
  latest = null;
}
