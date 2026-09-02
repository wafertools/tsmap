// Range selection for tsmap's three multi-select lists — the file filter table,
// the test selector, and the splits dialog.
//
// One implementation, because three is how the behaviour drifted in the first
// place: the test selector and splits dialog each grew their own copy and the
// filter table never got one at all, so shift-clicking there simply toggled a
// single row.
//
// ── The model ───────────────────────────────────────────────────────────────
//
// These lists are CHECKBOX lists (Gmail/GitHub shaped), not selection lists
// (Finder/Explorer shaped). The distinction decides what Shift must do:
//
//   selection list — a plain click REPLACES the selection, so Shift+Click
//                    replaces it with the range.
//   checkbox list  — a plain click TOGGLES one row and selection accumulates,
//                    so Shift+Click applies the ANCHOR'S RESULTING STATE across
//                    the range. Shift-clicking after *un*ticking the anchor
//                    therefore deselects the range, which is what makes one
//                    gesture serve both directions.
//
// Mixing the two models is the usual reason selection "feels wrong".
//
// ── The anchor ──────────────────────────────────────────────────────────────
//
// The anchor is the last row toggled WITHOUT Shift. Shift never moves it, so
// repeated Shift+Clicks re-extend from the same origin instead of chaining —
// the single most commonly mis-implemented detail.
//
// It is stored as an ID, not a row index. The previous per-dialog copies stored
// an index into the visible array and nothing reset it when the filter or
// search changed, so after narrowing the list a Shift+Click extended from
// whatever row happened to land in that slot. An id either still resolves to a
// visible row or it doesn't, and "doesn't" is a clean no-anchor case.

/** What the host list must tell us about itself. Ids are the host's own row
 *  identity — a test number, a wafer index, a file id — never a position. */
export interface RangeSelectionHost<Id> {
  /** Ids of the currently visible rows, in display order. Re-read on every
   *  interaction, so filtering and sorting need no notification. */
  visibleIds: () => Id[];
  isSelected: (id: Id) => boolean;
  setSelected: (id: Id, on: boolean) => void;
  /** Re-render rows and refresh any count/footer text. */
  onChanged: () => void;
  /** Move DOM focus to the row control at a visible index, for keyboard
   *  navigation. Omit in a list with no per-row focusable control. */
  focusRow?: (visibleIndex: number) => void;
}

export interface RangeSelection<Id> {
  /** Record a plain (non-Shift) toggle. This — and only this — moves the anchor. */
  setAnchor: (id: Id) => void;
  /** Handle a click on a row control. Returns true when it applied a range, in
   *  which case the caller must `preventDefault()` so the checkbox's own toggle
   *  doesn't also fire and fight the range. */
  handleClick: (id: Id, evt: { shiftKey: boolean }) => boolean;
  /** Handle a keydown on a row control. Returns true when handled, in which
   *  case the caller must `preventDefault()`. */
  handleKeydown: (id: Id, evt: KeyboardEvent) => boolean;
  /** Forget the anchor — e.g. after the list is repopulated wholesale. */
  reset: () => void;
}

export function createRangeSelection<Id>(host: RangeSelectionHost<Id>): RangeSelection<Id> {
  let anchorId: Id | null = null;

  /** Apply the anchor's own current state across anchor→target inclusive.
   *  Returns false when there is no usable anchor (never set, or filtered out),
   *  leaving the caller's ordinary toggle to happen instead. */
  function applyRange(targetId: Id): boolean {
    if (anchorId === null) return false;
    const ids = host.visibleIds();
    const from = ids.indexOf(anchorId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return false;

    // The anchor's CURRENT state, read before anything changes — this is the
    // value propagated across the range.
    const on = host.isSelected(anchorId);
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    for (let i = lo; i <= hi; i++) host.setSelected(ids[i], on);
    host.onChanged();
    return true;
  }

  return {
    setAnchor(id) { anchorId = id; },

    handleClick(id, evt) {
      if (!evt.shiftKey) return false;   // ordinary toggle; caller sets the anchor
      return applyRange(id);
    },

    handleKeydown(id, evt) {
      const ids = host.visibleIds();
      const i = ids.indexOf(id);
      if (i === -1) return false;

      // Shift+Space extends to the focused row without moving focus — the
      // keyboard equivalent of Shift+Click (WCAG 2.1.1: every mouse gesture
      // needs a keyboard path).
      if (evt.key === ' ' && evt.shiftKey) return applyRange(id);

      if (evt.key === 'ArrowDown' || evt.key === 'ArrowUp') {
        const next = evt.key === 'ArrowDown' ? i + 1 : i - 1;
        if (next < 0 || next >= ids.length) return false;
        // Plain arrows move focus only. Selection and focus are deliberately
        // separate (WAI-ARIA APG): arrowing through a list must not silently
        // rewrite what is selected.
        if (evt.shiftKey) applyRange(ids[next]);
        host.focusRow?.(next);
        return true;
      }

      // Ctrl/Cmd+A selects everything currently SHOWN, not everything that
      // exists — matching the header checkbox and Select all, which are also
      // scoped to the filter. Scoped to a row control by the caller, so it
      // never steals select-all from a text field.
      if ((evt.key === 'a' || evt.key === 'A') && (evt.ctrlKey || evt.metaKey)) {
        for (const rowId of ids) host.setSelected(rowId, true);
        anchorId = ids[0] ?? null;
        host.onChanged();
        return true;
      }
      return false;
    },

    reset() { anchorId = null; },
  };
}
