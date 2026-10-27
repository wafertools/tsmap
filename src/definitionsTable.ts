// The editable table the definitions editors are built on: the bin editor, the test editor and the derived-test editor.
//
// Two halves. `TableModel` is pure: rows of typed cells, each remembering the value
// it started with, so "edited", "revert this row" and "revert all" are answered by
// comparing, not by tracking events. `mountDefinitionsTable` is the DOM over it:
// a real <table> of inputs, an edited marker and Revert button per row, a filter
// box, and range selection (listSelection.ts) with bulk actions for the toggle
// columns. Nothing here knows what a bin or a test is.

import { createRangeSelection } from './listSelection';
import { attachTooltip } from './tooltip';

export type Cell = string | boolean | undefined;

export interface TableRow {
  id: string;
  cells: Record<string, Cell>;
}

/** Blank text and "unset" are the same state, so retyping an empty cell is not an edit. */
function same(a: Cell, b: Cell): boolean {
  if (typeof a === 'string' || typeof b === 'string' || a === undefined || b === undefined) {
    if (typeof a === 'boolean' || typeof b === 'boolean') return a === b;
    return (a ?? '') === (b ?? '');
  }
  return a === b;
}

export class TableModel {
  private current = new Map<string, TableRow>();
  /** The cells each row started with. A row added after construction has none: it is new. */
  private base = new Map<string, Record<string, Cell>>();
  private order: string[] = [];
  /** Rows taken out of the table: hidden and left out of `rows()`, but remembered so revert can bring them back. */
  private removed = new Set<string>();
  private listeners = new Set<(changedId?: string) => void>();

  constructor(rows: readonly TableRow[]) {
    for (const r of rows) {
      this.order.push(r.id);
      this.current.set(r.id, { id: r.id, cells: { ...r.cells } });
      this.base.set(r.id, { ...r.cells });
    }
  }

  /** `fn` hears every change; it is given the row's id when the change touched one row's cells, so a view can redraw just that row. */
  subscribe(fn: (changedId?: string) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(changedId?: string): void { for (const fn of this.listeners) fn(changedId); }

  rows(): TableRow[] { return this.order.filter(id => !this.removed.has(id)).map(id => this.current.get(id)!); }
  row(id: string): TableRow | undefined { return this.removed.has(id) ? undefined : this.current.get(id); }
  removedIds(): string[] { return this.order.filter(id => this.removed.has(id)); }
  get(id: string, col: string): Cell { return this.current.get(id)?.cells[col]; }

  set(id: string, col: string, value: Cell): void {
    const r = this.row(id);
    if (!r || same(r.cells[col], value)) return;
    r.cells[col] = value;
    this.emit(id);
  }

  /** Add a row the table did not start with (a loaded file naming a bin the data lacks). */
  add(row: TableRow, compare?: (a: TableRow, b: TableRow) => number): void {
    if (this.current.has(row.id)) return;
    // With a comparison the row goes where it sorts among the rows already there; without, at the end.
    const at = compare ? this.order.findIndex(id => compare(row, this.current.get(id)!) < 0) : -1;
    if (at < 0) this.order.push(row.id); else this.order.splice(at, 0, row.id);
    this.current.set(row.id, { id: row.id, cells: { ...row.cells } });
    this.emit();
  }

  isNew(id: string): boolean { return this.current.has(id) && !this.base.has(id); }

  /** Take a row out. A row the table did not start with is simply forgotten; one it did is kept to revert. */
  remove(id: string): void {
    if (!this.row(id)) return;
    if (this.isNew(id)) {
      this.current.delete(id);
      this.order = this.order.filter(x => x !== id);
    } else {
      this.removed.add(id);
    }
    this.emit();
  }

  /** Columns whose value differs from where the row started; every column of a new row. */
  editedColumns(id: string): string[] {
    const r = this.current.get(id);
    if (!r) return [];
    const b = this.base.get(id);
    if (!b) return Object.keys(r.cells);
    return Object.keys(r.cells).filter(c => !same(r.cells[c], b[c]));
  }
  isEdited(id: string): boolean { return this.removed.has(id) || this.isNew(id) || this.editedColumns(id).length > 0; }
  /** Rows still in the table that are new or changed; removed rows are `removedIds()`. */
  editedIds(): string[] { return this.order.filter(id => !this.removed.has(id) && this.isEdited(id)); }

  /** Back to the starting values; a row that was added is removed. */
  revertRow(id: string): void {
    const kind = this.revert(id);
    // A row whose cells went back is one changed row; a row that came back or went away changes the list.
    if (kind) this.emit(kind === 'cells' ? id : undefined);
  }
  /** Reverts one row without announcing it: 'cells' when the row stays where it is, 'list' when it came back or was dropped. */
  private revert(id: string): 'cells' | 'list' | null {
    if (this.removed.delete(id)) {
      // Back in the table as it was, whatever was typed into it before it went.
      this.current.get(id)!.cells = { ...this.base.get(id)! };
      return 'list';
    }
    const b = this.base.get(id);
    if (!b) {
      if (!this.current.delete(id)) return null;
      this.order = this.order.filter(x => x !== id);
      return 'list';
    }
    const r = this.current.get(id);
    if (!r || this.editedColumns(id).length === 0) return null;
    r.cells = { ...b };
    return 'cells';
  }
  /** One announcement for the lot, not one per row. */
  revertAll(): void {
    let any = false;
    for (const id of [...this.removed]) any = this.revert(id) !== null || any;
    for (const id of this.editedIds()) any = this.revert(id) !== null || any;
    if (any) this.emit();
  }
}

export interface ColumnSpec {
  id: string;
  header: string;
  kind: 'text' | 'colour' | 'toggle' | 'readonly';
  /** Fixed width, e.g. `'90px'`; omitted columns share what is left. */
  width?: string;
  placeholder?: string;
  tooltip?: string;
  /** Text and colour columns: the value to keep for what was typed, `undefined` for blank, or
   *  `null` when it is not acceptable (the input goes back to its old value and `onNote` says why). */
  normalise?: (text: string) => string | undefined | null;
  invalidNote?: string;
  /** Readonly columns: how a cell reads. */
  show?: (cell: Cell, row: TableRow) => string;
  /** Toggle columns: the words for off and on. */
  toggleLabels?: readonly [string, string];
  /** Toggle columns: a row whose files disagree, shown as the third word instead of either. */
  mixed?: (row: TableRow) => boolean;
  /** Toggle columns: a row that cannot be set at all (soft bins have no pass flag). */
  disabled?: (row: TableRow) => boolean;
}

export interface BulkAction {
  label: string;
  /** Applied to the ticked, visible rows. */
  apply: (ids: string[], model: TableModel) => void;
}

export interface DefinitionsTableOptions {
  columns: readonly ColumnSpec[];
  /** Names the table for assistive technology. */
  label: string;
  /** Columns the filter box searches, besides the row id. */
  searchColumns?: readonly string[];
  bulk?: readonly BulkAction[];
  /** Rows' text depends on other rows (the derived tests' checks), so a change redraws every row rather than just its own. */
  dependent?: boolean;
  /** Offer a Delete button on every row (derived tests); without it, only rows a load added can be removed. */
  removable?: boolean;
  onNote?: (message: string) => void;
}

export interface MountedTable {
  el: HTMLElement;
  refresh: () => void;
}

export function mountDefinitionsTable(model: TableModel, opts: DefinitionsTableOptions): MountedTable {
  const selected = new Set<string>();
  let query = '';

  const root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-height:0;flex:1';

  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Filter…';
  search.setAttribute('aria-label', `Filter ${opts.label}`);
  search.style.cssText = [
    'flex:1;min-width:140px;padding:6px 8px;font-size:12px',
    'border:1px solid var(--border-mid);border-radius:var(--radius-control)',
    'background:var(--bg-input);color:var(--text-secondary)',
  ].join(';');
  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); rowLimit = PAGE; render(); });
  toolbar.append(search);

  const bulkButtons: HTMLButtonElement[] = [];
  for (const action of opts.bulk ?? []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-secondary';
    b.addEventListener('click', () => { action.apply([...selected].filter(id => model.row(id)), model); });
    bulkButtons.push(b);
    toolbar.append(b);
  }

  const scroller = document.createElement('div');
  scroller.style.cssText = [
    'overflow:auto;flex:1;min-height:120px',
    'border:1px solid var(--border-mid);border-radius:var(--radius-control)',
  ].join(';');
  const table = document.createElement('table');
  table.setAttribute('aria-label', opts.label);
  table.style.cssText = 'border-collapse:collapse;width:100%;font-size:12px';
  scroller.append(table);
  root.append(toolbar, scroller);

  const matches = (r: TableRow): boolean => {
    if (!query) return true;
    const hay = [r.id, ...(opts.searchColumns ?? []).map(c => String(r.cells[c] ?? ''))].join(' ').toLowerCase();
    return hay.includes(query);
  };
  const visibleIds = (): string[] => model.rows().filter(matches).map(r => r.id);

  /** The rows on screen, by id, so one changed row can be replaced without rebuilding the table. */
  const rowEls = new Map<string, HTMLTableRowElement>();
  /** A table of thousands of tests is drawn a page at a time: the filter and the bulk actions still reach every row. */
  const PAGE = 200;
  let rowLimit = PAGE;

  const range = createRangeSelection<string>({
    visibleIds,
    isSelected: id => selected.has(id),
    setSelected: (id, on) => { if (on) selected.add(id); else selected.delete(id); },
    onChanged: () => render(),
    focusRow: n => { table.querySelectorAll<HTMLInputElement>('input[data-select]')[n]?.focus(); },
  });

  const cellStyle = 'padding:3px 6px;border-bottom:1px solid var(--border-mid);vertical-align:middle';
  const inputStyle = [
    'width:100%;box-sizing:border-box;font:inherit;color:var(--text-secondary)',
    'background:var(--bg-input);border:1px solid var(--border-mid);border-radius:var(--radius-control);padding:2px 6px',
  ].join(';');

  /** Builds one row's cells into `tr`. */
  function fillRow(tr: HTMLTableRowElement, id: string): void {
    const row = model.row(id)!;
    const editedCols = new Set(model.editedColumns(id));
    const tdSel = tr.insertCell();
    tdSel.style.cssText = cellStyle;
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.select = '1';
    cb.checked = selected.has(id);
    cb.setAttribute('aria-label', `Tick ${id}`);
    cb.addEventListener('change', () => { if (cb.checked) selected.add(id); else selected.delete(id); range.setAnchor(id); renderBulk(); });
    cb.addEventListener('click', evt => { if (range.handleClick(id, evt)) evt.preventDefault(); });
    cb.addEventListener('keydown', evt => { if (range.handleKeydown(id, evt)) evt.preventDefault(); });
    tdSel.append(cb);

    for (const c of opts.columns) {
      const td = tr.insertCell();
      td.style.cssText = cellStyle + (editedCols.has(c.id) ? ';background:var(--bg-hover-row)' : '');
      const cell = row.cells[c.id];
      const key = `${id}\u0000${c.id}`;
      if (c.kind === 'readonly') {
        td.textContent = c.show ? c.show(cell, row) : String(cell ?? '');
        td.style.color = 'var(--text-secondary)';
      } else if (c.kind === 'toggle') {
        const [off, on] = c.toggleLabels ?? ['No', 'Yes'];
        const isMixed = c.mixed?.(row) ?? false;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn-secondary';
        b.dataset.focusKey = key;
        const dead = c.disabled?.(row) ?? false;
        b.textContent = dead ? '—' : isMixed ? 'Mixed' : cell === true ? on : off;
        b.disabled = dead;
        b.style.cssText = 'min-width:64px';
        b.setAttribute('aria-label', `${c.header} of ${id}: ${b.textContent}`);
        if (!dead) {
          if (!isMixed) b.setAttribute('aria-pressed', String(cell === true));
          b.addEventListener('click', () => model.set(id, c.id, isMixed ? true : !(cell === true)));
        }
        td.append(b);
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.spellcheck = false;
        input.value = typeof cell === 'string' ? cell : '';
        input.placeholder = c.placeholder ?? '';
        input.dataset.focusKey = key;
        input.setAttribute('aria-label', `${c.header} of ${id}`);
        input.style.cssText = inputStyle;
        const commit = () => {
          const raw = input.value.trim();
          const next = c.normalise ? c.normalise(raw) : (raw === '' ? undefined : raw);
          if (next === null) {
            input.value = typeof cell === 'string' ? cell : '';
            input.setAttribute('aria-invalid', 'true');
            opts.onNote?.(c.invalidNote ?? `“${raw}” is not a valid ${c.header.toLowerCase()}.`);
            return;
          }
          input.removeAttribute('aria-invalid');
          model.set(id, c.id, next);
        };
        input.addEventListener('change', commit);
        input.addEventListener('keydown', evt => {
          if (evt.key === 'Enter') { evt.preventDefault(); commit(); input.blur(); }
          // Escape abandons this edit (modal.ts leaves the dialog open while a field is focused).
          if (evt.key === 'Escape') { input.value = typeof cell === 'string' ? cell : ''; input.blur(); }
        });
        td.append(input);
        if (c.kind === 'colour') {
          const sw = document.createElement('span');
          sw.setAttribute('aria-hidden', 'true');
          sw.style.cssText = 'display:inline-block;width:12px;height:12px;margin-left:6px;vertical-align:middle;border:1px solid var(--border-mid);border-radius:var(--radius-control);'
            + (typeof cell === 'string' && cell ? `background:${cell}` : 'visibility:hidden');
          td.append(sw);
        }
      }
    }

    const tdEdit = tr.insertCell();
    tdEdit.style.cssText = cellStyle;
    if (model.isEdited(id)) {
      const mark = document.createElement('span');
      mark.textContent = model.isNew(id) ? 'new ' : '● ';
      mark.style.color = 'var(--accent)';
      tdEdit.append(mark);
      // With a Delete button a new row needs no Remove of its own; Revert is for changed rows.
      if (!(opts.removable && model.isNew(id))) {
        const rev = document.createElement('button');
        rev.type = 'button';
        rev.className = 'btn-secondary';
        rev.textContent = model.isNew(id) ? 'Remove' : 'Revert';
        rev.dataset.focusKey = `${id}\u0000revert`;
        rev.setAttribute('aria-label', `${rev.textContent} ${id}`);
        rev.addEventListener('click', () => model.revertRow(id));
        tdEdit.append(rev);
      }
    }
    if (opts.removable) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn-secondary';
      del.textContent = 'Delete';
      del.style.marginLeft = '4px';
      del.dataset.focusKey = `${id}\u0000delete`;
      del.setAttribute('aria-label', `Delete ${id}`);
      del.addEventListener('click', () => model.remove(id));
      tdEdit.append(del);
    }
  }

  const restoreFocus = (focusKey: string | undefined): void => {
    if (!focusKey) return;
    for (const el of table.querySelectorAll<HTMLElement>('[data-focus-key]')) {
      if (el.dataset.focusKey === focusKey) { el.focus(); break; }
    }
  };

  function render(changedId?: string): void {
    // Keep keyboard position across the rebuild: the focused input's row and column.
    const active = document.activeElement as HTMLElement | null;
    const focusKey = active && table.contains(active) ? active.dataset.focusKey : undefined;

    // One row's cells changed and nothing else depends on it: redraw that row alone. Editing a cell of a table of thousands
    // of tests must not recreate every input in it.
    if (changedId !== undefined && !opts.dependent) {
      const old = rowEls.get(changedId);
      const row = model.row(changedId);
      if (old && row && matches(row)) {
        const tr = document.createElement('tr');
        fillRow(tr, changedId);
        old.replaceWith(tr);
        rowEls.set(changedId, tr);
        renderBulk();
        restoreFocus(focusKey);
        return;
      }
    }

    table.innerHTML = '';
    rowEls.clear();
    const head = table.createTHead().insertRow();
    const th = (text: string, width?: string, hidden = false) => {
      const h = document.createElement('th');
      h.scope = 'col';
      h.style.cssText = `${cellStyle};text-align:left;color:var(--text-dim);font-weight:600;position:sticky;top:0;background:var(--bg-toolbar)` + (width ? `;width:${width}` : '');
      if (hidden) { const s = document.createElement('span'); s.textContent = text; s.style.cssText = 'position:absolute;left:-9999px'; h.append(s); } else h.textContent = text;
      head.append(h);
      return h;
    };
    const allBox = document.createElement('input');
    allBox.type = 'checkbox';
    allBox.setAttribute('aria-label', 'Tick every row that matches the filter');
    const vis = visibleIds();
    allBox.checked = vis.length > 0 && vis.every(id => selected.has(id));
    allBox.addEventListener('change', () => { for (const id of visibleIds()) { if (allBox.checked) selected.add(id); else selected.delete(id); } render(); });
    const selTh = th('', '28px');
    selTh.append(allBox);
    for (const c of opts.columns) {
      const h = th(c.header, c.width);
      if (c.tooltip) attachTooltip(h, c.tooltip);
    }
    th('Edited', opts.removable ? '170px' : '86px');

    const body = table.createTBody();
    const shown = vis.slice(0, rowLimit);
    for (const id of shown) {
      const tr = body.insertRow();
      fillRow(tr, id);
      rowEls.set(id, tr);
    }
    if (vis.length > shown.length) {
      const more = body.insertRow().insertCell();
      more.colSpan = opts.columns.length + 2;
      more.style.cssText = cellStyle + ';text-align:center;color:var(--text-dim)';
      more.append(`Showing ${shown.length.toLocaleString()} of ${vis.length.toLocaleString()}. `);
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'btn-secondary';
      next.dataset.focusKey = 'more';
      next.textContent = `Show ${Math.min(PAGE, vis.length - shown.length).toLocaleString()} more`;
      next.addEventListener('click', () => { rowLimit += PAGE; render(); });
      more.append(next);
    }

    renderBulk();
    restoreFocus(focusKey);
  }

  function renderBulk(): void {
    const n = [...selected].filter(id => model.row(id)).length;
    (opts.bulk ?? []).forEach((a, i) => {
      bulkButtons[i].textContent = n > 0 ? `${a.label} (${n})` : a.label;
      bulkButtons[i].disabled = n === 0;
      bulkButtons[i].style.opacity = n === 0 ? '0.5' : '';
    });
  }

  model.subscribe(render);
  render();
  return { el: root, refresh: () => render() };
}
