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

export interface ImportPlotsResult {
  added: number;
  replaced: number;
  /** Titles the file's plots carry, in file order. A plot with no title has none to report: its name follows its fields. */
  titles: string[];
  /** How many of the plots read have no title. */
  untitled: number;
  /** Settings or plots wmap's reader dropped, each naming where. */
  warnings: string[];
  /** Set when nothing could be read: the saved plots are left as they were. */
  error?: string;
}

/**
 * Read a plots file (wmap's own, or an older `tsmap-sweeps` file — the reader takes both) into the saved plots.
 *
 * For a file named on the command line, not the Plot tab's Import: a plot whose id is already saved is replaced, so
 * launching with the same file twice leaves one copy of each rather than a growing list (the tab's Import adds a copy
 * instead, to protect plots edited since). The reader is wmap's; this adds nothing to its validation.
 */
export function importPlotsText(text: string): ImportPlotsResult {
  const read = readPlotsFile(text);
  if (read.error !== undefined) return { added: 0, replaced: 0, titles: [], untitled: 0, warnings: read.warnings, error: read.error };
  const saved = loadSavedPlots();
  const incoming = new Map(read.plots.map(p => [p.id, p]));
  const merged = saved.map(p => incoming.get(p.id) ?? p);
  const known = new Set(saved.map(p => p.id));
  const fresh = read.plots.filter(p => !known.has(p.id));
  savePlots([...merged, ...fresh]);
  return {
    added: fresh.length,
    replaced: read.plots.length - fresh.length,
    titles: read.plots.flatMap(p => (p.title ? [p.title] : [])),
    untitled: read.plots.filter(p => !p.title).length,
    warnings: read.warnings,
  };
}

/** The example Help → Definitions file formats… saves: one sweep, in the file Export plots… writes. */
export function plotsTemplateText(): string {
  const volts = Array.from({ length: 31 }, (_, i) => Math.round((-1.5 + i * 0.1) * 10) / 10);
  return writePlotsFile([{
    id: 'set-reset',
    title: 'Set / reset switching',
    chart: 'sweep',
    sweep: {
      xLabel: 'Voltage (V)',
      yLabel: 'Read current',
      series: [
        { label: 'Reset (falling)', tests: ['3000..3030'], xValues: volts },
        { label: 'Set (rising)', tests: ['3100..3130'], xValues: volts },
      ],
      separationAt: [10, 50],
    },
  }]);
}

/** Test seam: forget the in-memory copy, as a fresh start would. */
export function resetPlotPrefsForTests(): void {
  latest = null;
}
