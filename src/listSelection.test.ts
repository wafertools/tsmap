import { describe, it, expect } from 'vitest';
import { createRangeSelection } from './listSelection';

/** A list of ids with a mutable selection and a mutable visible subset, which
 *  is what filtering actually does to these dialogs. */
function harness(all: string[]) {
  const selected = new Set<string>();
  let visible = [...all];
  let renders = 0;
  let focused: number | null = null;
  const sel = createRangeSelection<string>({
    visibleIds: () => visible,
    isSelected: (id) => selected.has(id),
    setSelected: (id, on) => { if (on) selected.add(id); else selected.delete(id); },
    onChanged: () => { renders++; },
    focusRow: (i) => { focused = i; },
  });
  return {
    sel, selected,
    setVisible: (v: string[]) => { visible = v; },
    get renders() { return renders; },
    get focused() { return focused; },
    /** A plain toggle, as the host does it: flip, then set the anchor. */
    toggle(id: string) {
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      sel.setAnchor(id);
    },
    ids: () => [...selected].sort(),
  };
}

const ROWS = ['a', 'b', 'c', 'd', 'e'];

describe('createRangeSelection — the checkbox-list model', () => {
  it('shift-click selects the range when the anchor was selected', () => {
    const h = harness(ROWS);
    h.toggle('b');
    expect(h.sel.handleClick('d', { shiftKey: true })).toBe(true);
    expect(h.ids()).toEqual(['b', 'c', 'd']);
  });

  it('shift-click DEselects the range when the anchor was deselected', () => {
    // The half everyone forgets: one gesture serves both directions, because
    // the range takes the anchor's own resulting state.
    const h = harness(ROWS);
    for (const r of ROWS) h.selected.add(r);
    h.toggle('b');                       // b was selected -> now deselected, anchor
    h.sel.handleClick('d', { shiftKey: true });
    expect(h.ids()).toEqual(['a', 'e']);
  });

  it('extends upward as readily as downward', () => {
    const h = harness(ROWS);
    h.toggle('d');
    h.sel.handleClick('b', { shiftKey: true });
    expect(h.ids()).toEqual(['b', 'c', 'd']);
  });

  it('does not move the anchor, so repeated shift-clicks re-extend from it', () => {
    const h = harness(ROWS);
    h.toggle('a');
    h.sel.handleClick('e', { shiftKey: true });
    expect(h.ids()).toEqual(['a', 'b', 'c', 'd', 'e']);
    // Shrink back down from the SAME anchor rather than chaining off 'e'.
    h.selected.clear(); h.selected.add('a');
    h.sel.handleClick('c', { shiftKey: true });
    expect(h.ids()).toEqual(['a', 'b', 'c']);
  });

  it('a plain click is not handled here — the host does its own toggle', () => {
    const h = harness(ROWS);
    h.toggle('b');
    expect(h.sel.handleClick('d', { shiftKey: false })).toBe(false);
  });

  it('does nothing when no anchor has been set yet', () => {
    const h = harness(ROWS);
    expect(h.sel.handleClick('c', { shiftKey: true })).toBe(false);
    expect(h.ids()).toEqual([]);
  });

  it('reset() forgets the anchor', () => {
    const h = harness(ROWS);
    h.toggle('b');
    h.sel.reset();
    expect(h.sel.handleClick('d', { shiftKey: true })).toBe(false);
  });
});

describe('createRangeSelection — anchor survives filtering by ID, not position', () => {
  it('an anchor filtered out of view is dropped, not silently reused', () => {
    // The bug the per-dialog copies had: they stored an INDEX into the visible
    // array, so narrowing the list left the anchor pointing at whatever row had
    // moved into that slot, and the next shift-click extended from a row the
    // user never clicked.
    const h = harness(ROWS);
    h.toggle('a');                       // anchor = 'a', index 0
    h.setVisible(['c', 'd', 'e']);       // 'a' filtered away; index 0 is now 'c'
    expect(h.sel.handleClick('e', { shiftKey: true })).toBe(false);
    expect(h.ids()).toEqual(['a']);      // untouched — no phantom range from 'c'
  });

  it('an anchor still visible after a filter extends over the NEW order', () => {
    const h = harness(ROWS);
    h.toggle('b');
    h.setVisible(['b', 'd']);            // 'c' filtered out of the middle
    h.sel.handleClick('d', { shiftKey: true });
    expect(h.ids()).toEqual(['b', 'd']); // 'c' is not swept in — it isn't shown
  });
});

describe('createRangeSelection — keyboard parity (WCAG 2.1.1)', () => {
  const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
    ({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, ...mods }) as KeyboardEvent;

  it('Shift+Space extends to the focused row, like Shift+Click', () => {
    const h = harness(ROWS);
    h.toggle('b');
    expect(h.sel.handleKeydown('d', key(' ', { shiftKey: true }))).toBe(true);
    expect(h.ids()).toEqual(['b', 'c', 'd']);
  });

  it('plain arrows move focus without changing selection', () => {
    const h = harness(ROWS);
    h.toggle('b');
    const before = h.ids();
    expect(h.sel.handleKeydown('b', key('ArrowDown'))).toBe(true);
    expect(h.focused).toBe(2);
    expect(h.ids()).toEqual(before);
  });

  it('Shift+Arrow moves focus AND extends', () => {
    const h = harness(ROWS);
    h.toggle('b');
    h.sel.handleKeydown('b', key('ArrowDown', { shiftKey: true }));
    expect(h.focused).toBe(2);
    expect(h.ids()).toEqual(['b', 'c']);
  });

  it('arrows stop at the ends rather than wrapping', () => {
    const h = harness(ROWS);
    h.toggle('a');
    expect(h.sel.handleKeydown('a', key('ArrowUp'))).toBe(false);
    expect(h.sel.handleKeydown('e', key('ArrowDown'))).toBe(false);
  });

  it('Ctrl+A selects everything SHOWN, not everything that exists', () => {
    const h = harness(ROWS);
    h.setVisible(['b', 'c']);
    expect(h.sel.handleKeydown('b', key('a', { ctrlKey: true }))).toBe(true);
    expect(h.ids()).toEqual(['b', 'c']);
  });

  it('Cmd+A works too, for macOS', () => {
    const h = harness(ROWS);
    h.setVisible(['b', 'c']);
    expect(h.sel.handleKeydown('b', key('a', { metaKey: true }))).toBe(true);
    expect(h.ids()).toEqual(['b', 'c']);
  });

  it('an unrelated key is not handled', () => {
    const h = harness(ROWS);
    h.toggle('b');
    expect(h.sel.handleKeydown('b', key('Enter'))).toBe(false);
  });
});
