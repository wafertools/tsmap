import { describe, expect, it, vi, afterEach } from 'vitest';
import { isShortcutsKey, SHORTCUT_GROUPS } from './shortcutsUI';

const press = (init: Record<string, unknown>): KeyboardEvent =>
  ({ key: '?', ctrlKey: false, metaKey: false, altKey: false, target: { closest: () => null }, ...init }) as unknown as KeyboardEvent;

afterEach(() => vi.unstubAllGlobals());

describe('the ? shortcut', () => {
  it('opens the list from the page', () => {
    vi.stubGlobal('document', { querySelector: () => null });
    expect(isShortcutsKey(press({}))).toBe(true);
  });

  it('ignores other keys and any modifier', () => {
    vi.stubGlobal('document', { querySelector: () => null });
    expect(isShortcutsKey(press({ key: '/' }))).toBe(false);
    expect(isShortcutsKey(press({ ctrlKey: true }))).toBe(false);
    expect(isShortcutsKey(press({ metaKey: true }))).toBe(false);
  });

  it('does not fire while typing in a field', () => {
    vi.stubGlobal('document', { querySelector: () => null });
    expect(isShortcutsKey(press({ target: { closest: () => ({}) } }))).toBe(false);
  });

  it('ignores a key whose target is not an element, rather than throwing', () => {
    vi.stubGlobal('document', { querySelector: () => null });
    expect(isShortcutsKey(press({ target: {} }))).toBe(true);
  });

  it('does not stack on top of an open window', () => {
    vi.stubGlobal('document', { querySelector: () => ({}) });
    expect(isShortcutsKey(press({}))).toBe(false);
  });
});

describe('the shortcut list', () => {
  it('has no empty group and no row missing its keys or action', () => {
    for (const g of SHORTCUT_GROUPS) {
      expect(g.rows.length).toBeGreaterThan(0);
      for (const [keys, action] of g.rows) { expect(keys.trim()).not.toBe(''); expect(action.trim()).not.toBe(''); }
    }
  });
});
