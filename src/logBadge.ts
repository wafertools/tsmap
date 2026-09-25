/**
 * The Log toggle's new-problem badges: warnings and errors logged while the
 * panel was closed. Opening the panel is what "seen" means, so it clears them;
 * the next problem shows again. Pure — main.ts turns the parts into elements.
 */

export type ProblemLevel = 'error' | 'warn';

export interface LogBadgePart {
  level: ProblemLevel;
  /** Decorative; rendered aria-hidden. The text carries the meaning. */
  glyph: string;
  text: string;
}

export class UnseenProblems {
  private counts: Record<ProblemLevel, number> = { error: 0, warn: 0 };

  /** Count an entry unless the panel is open (then it has been seen). */
  record(level: 'info' | ProblemLevel, panelOpen: boolean): void {
    if (level !== 'info' && !panelOpen) this.counts[level]++;
  }

  clear(): void {
    this.counts = { error: 0, warn: 0 };
  }

  /** Most severe first; empty when there is nothing unseen. */
  parts(): LogBadgePart[] {
    const out: LogBadgePart[] = [];
    for (const [level, glyph, noun] of [['error', '✕', 'error'], ['warn', '▲', 'warning']] as const) {
      const n = this.counts[level];
      if (n > 0) out.push({ level, glyph, text: `${n} new ${noun}${n > 1 ? 's' : ''}` });
    }
    return out;
  }
}
