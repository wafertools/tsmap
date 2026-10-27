import { describe, it, expect } from 'vitest';
import { TableModel } from './definitionsTable';

const rows = () => [
  { id: 'a', cells: { name: 'Alpha', on: true } },
  { id: 'b', cells: { name: undefined, on: false } },
];

describe('TableModel', () => {
  it('starts with nothing edited', () => {
    expect(new TableModel(rows()).editedIds()).toEqual([]);
  });

  it('lists only the columns that moved', () => {
    const m = new TableModel(rows());
    m.set('a', 'on', false);
    expect(m.editedColumns('a')).toEqual(['on']);
    expect(m.editedIds()).toEqual(['a']);
  });

  it('does not count a boolean that went back as an edit', () => {
    const m = new TableModel(rows());
    m.set('a', 'on', false);
    m.set('a', 'on', true);
    expect(m.isEdited('a')).toBe(false);
  });

  it('keeps false and blank apart', () => {
    const m = new TableModel(rows());
    m.set('b', 'on', undefined);
    expect(m.isEdited('b')).toBe(true);
  });

  it('reverts everything, removing rows it did not start with', () => {
    const m = new TableModel(rows());
    m.set('a', 'name', 'Beta');
    m.add({ id: 'c', cells: { name: 'New' } });
    m.revertAll();
    expect(m.rows().map(r => r.id)).toEqual(['a', 'b']);
    expect(m.get('a', 'name')).toBe('Alpha');
  });

  it('ignores an add for an id it already has', () => {
    const m = new TableModel(rows());
    m.add({ id: 'a', cells: { name: 'Other' } });
    expect(m.get('a', 'name')).toBe('Alpha');
  });
});

describe('TableModel removal', () => {
  it('hides a removed row and brings it back on revert', () => {
    const m = new TableModel(rows());
    m.set('a', 'name', 'Changed');
    m.remove('a');
    expect(m.rows().map(r => r.id)).toEqual(['b']);
    expect(m.row('a')).toBeUndefined();
    expect(m.removedIds()).toEqual(['a']);
    m.revertAll();
    expect(m.rows().map(r => r.id)).toEqual(['a', 'b']);
    expect(m.get('a', 'name')).toBe('Alpha');
  });

  it('forgets a row it never started with', () => {
    const m = new TableModel(rows());
    m.add({ id: 'c', cells: { name: 'New' } });
    m.remove('c');
    expect(m.removedIds()).toEqual([]);
    expect(m.rows().map(r => r.id)).toEqual(['a', 'b']);
  });

  it('does not list a removed row among the edited ones', () => {
    const m = new TableModel(rows());
    m.remove('b');
    expect(m.editedIds()).toEqual([]);
  });
});

describe('TableModel add order', () => {
  it('puts a row where it sorts when given a comparison', () => {
    const m = new TableModel([{ id: 'a', cells: { n: '1' } }, { id: 'c', cells: { n: '3' } }]);
    m.add({ id: 'b', cells: { n: '2' } }, (x, y) => Number(x.cells.n) - Number(y.cells.n));
    expect(m.rows().map(r => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('puts a row last without one', () => {
    const m = new TableModel([{ id: 'a', cells: {} }]);
    m.add({ id: 'z', cells: {} });
    expect(m.rows().map(r => r.id)).toEqual(['a', 'z']);
  });
});

describe('TableModel change announcements', () => {
  const heard = (m: TableModel) => { const ids: Array<string | undefined> = []; m.subscribe(id => ids.push(id)); return ids; };

  it('names the row when one row’s cells change, so a view can redraw just that row', () => {
    const m = new TableModel(rows());
    const ids = heard(m);
    m.set('a', 'name', 'Beta');
    m.revertRow('a');
    expect(ids).toEqual(['a', 'a']);
  });

  it('names no row when the list itself changes', () => {
    const m = new TableModel(rows());
    const ids = heard(m);
    m.add({ id: 'c', cells: {} });
    m.remove('b');
    m.revertRow('b');          // brings a removed row back
    m.revertRow('c');          // drops an added row
    expect(ids).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('announces a revert of everything once, not once per row', () => {
    const m = new TableModel(rows());
    m.set('a', 'name', 'X'); m.set('b', 'on', true); m.remove('a');
    const ids = heard(m);
    m.revertAll();
    expect(ids).toEqual([undefined]);
    expect(m.editedIds()).toEqual([]);
  });

  it('says nothing when there was nothing to revert', () => {
    const m = new TableModel(rows());
    const ids = heard(m);
    m.revertAll();
    m.revertRow('a');
    expect(ids).toEqual([]);
  });
});
