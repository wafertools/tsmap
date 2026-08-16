// Generic sortable/filterable table — rows in, a selection out. Deliberately
// knows nothing about "files" or how its rows were produced: the file-filter
// feature (fileFilterUI.ts) is its first caller, but the table itself takes
// `{ id, columns: Record<string, string> }[]` and a selection callback, so a
// future caller (e.g. filtering wafers within one already-fetched dataset,
// per the discussion this feature grew out of) can reuse it by supplying a
// different row source, not by rewriting the UI.
//
// No existing sortable-table precedent in this app — dieList.ts's table has
// no sort/filter, buildBinSection's rows aren't a table at all. Closest
// relative is testSelectorUI.ts's search/shift-select conventions for a
// *list*, adapted here for a *table* with per-column filtering.

import { openAnchoredMenu } from './anchoredMenu';

export interface FilterTableColumn {
  key: string;
  label: string;
}

export interface FilterTableRow {
  id: string;
  /** Display text per column key. Also what the per-column filter popups and
   *  the free-text search match against — those are string operations by
   *  nature, so the formatted value is the right one there. */
  columns: Record<string, string>;
  /**
   * Optional numeric sort key per column, for columns whose display text
   * doesn't sort the way the underlying value does — a formatted `"900.0 KB"`
   * vs `"1.5 MB"`, or a localized date. Without this the sort falls back to
   * `Number(columns[key])` and then `localeCompare`, which orders those two
   * examples 1.5 MB → 12.0 MB → 900.0 KB. Only supply it where the column has
   * a real underlying number (bytes, epoch ms); a row missing one for a column
   * that others define sorts last in both directions.
   */
  sortValues?: Record<string, number>;
}

/** Serializable filter state — what Save filter…/Load filter… persist. */
export interface FilterCriteria {
  /** column key -> set of values to INCLUDE. A column absent from this map
   *  (or with an empty set) is unfiltered. */
  columnValues: Record<string, string[]>;
  searchText: string;
}

/** Envelope for a saved filter. Without a self-identifying wrapper, `Load
 *  filter…` accepted *any* valid JSON — pointed at a `package.json` it
 *  "succeeded", clearing every filter and selecting all rows. */
export const FILTER_FILE_KIND = 'tsmap-file-filter';
export const FILTER_FILE_VERSION = 1;

interface SavedFilterFile extends FilterCriteria {
  kind: typeof FILTER_FILE_KIND;
  version: number;
}

export function formatFilterFile(criteria: FilterCriteria): string {
  const out: SavedFilterFile = { kind: FILTER_FILE_KIND, version: FILTER_FILE_VERSION, ...criteria };
  return JSON.stringify(out, null, 2);
}

/** Returns the criteria, or an error message explaining why this isn't one. */
export function parseFilterFile(text: string): { criteria: FilterCriteria } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: 'not valid JSON' };
  }
  if (typeof raw !== 'object' || raw === null) return { error: 'not a saved filter' };
  const obj = raw as Partial<SavedFilterFile>;
  if (obj.kind !== FILTER_FILE_KIND) return { error: 'not a tsmap filter file' };
  if (typeof obj.version !== 'number' || obj.version > FILTER_FILE_VERSION) {
    return { error: `saved by a newer version of tsmap (format ${String(obj.version)})` };
  }
  if (typeof obj.columnValues !== 'object' || obj.columnValues === null) {
    return { error: 'missing its column filters' };
  }
  // Normalise defensively — a hand-edited file may carry the wrong value shape.
  const columnValues: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(obj.columnValues)) {
    if (Array.isArray(values)) columnValues[key] = values.map(String);
  }
  return { criteria: { columnValues, searchText: typeof obj.searchText === 'string' ? obj.searchText : '' } };
}

export interface FilterTableOptions {
  columns: FilterTableColumn[];
  onSelectionChange?: (selectedIds: Set<string>) => void;
  /** Accessible name for the table itself — screen readers announce it when
   *  entering the grid. Required in spirit; defaulted so a caller can't ship
   *  an unnamed one by omission. */
  ariaLabel?: string;
}

export interface FilterTableHandle {
  el: HTMLElement;
  /** Replaces all rows (used for the initial/final population). */
  setRows(rows: FilterTableRow[]): void;
  /** Appends one row without re-rendering the rest — used for progressive,
   *  scan-as-it-completes population of a large batch. */
  addRow(row: FilterTableRow): void;
  getSelectedIds(): Set<string>;
  selectAll(): void;
  selectNone(): void;
  invertSelection(): void;
  getCriteria(): FilterCriteria;
  /**
   * Applies saved criteria (Load filter…) and re-selects every row that
   * matches it — used once rows exist (after a fresh scan).
   *
   * Returns the criteria's column keys that this table has no column for.
   * Criteria are saved against whatever columns one batch of files happened to
   * produce, so a filter reused on a different batch can name keys that aren't
   * here; those are dropped, and the caller is expected to say so rather than
   * let the filter look like it silently did nothing.
   */
  applyCriteria(
    criteria: FilterCriteria,
    opts?: {
      /** Also select every row the filter leaves visible. Default true — that
       *  is what "Load filter…" means. Pass false when restoring a filter the
       *  user didn't just ask for (the remembered one on open), where
       *  pre-ticking rows would be presumptuous. */
      select?: boolean;
    },
  ): { unknownColumns: string[] };
  rowCount(): number;
}

/**
 * Pure row filter/sort — extracted from the component so it's unit-testable
 * without a DOM (this repo's Vitest config runs `environment: 'node'`; no
 * existing module here is DOM-tested, only their pure logic is — see
 * testSelectorUI.test.ts/multiFileUI.test.ts for the same boundary). The
 * component below is a thin DOM shell around this.
 */
export function filterAndSortRows(
  rows: FilterTableRow[],
  opts: {
    columnFilters?: Map<string, Set<string>>;
    searchText?: string;
    sortKey?: string | null;
    sortDir?: SortDir;
  },
): FilterTableRow[] {
  let out = rows;
  const { columnFilters, searchText, sortKey, sortDir } = opts;
  if (columnFilters && columnFilters.size > 0) {
    out = out.filter(r => [...columnFilters.entries()].every(([key, values]) => values.has(r.columns[key] ?? '')));
  }
  if (searchText?.trim()) {
    const needle = searchText.trim().toLowerCase();
    out = out.filter(r => Object.values(r.columns).some(v => v.toLowerCase().includes(needle)));
  }
  if (sortKey && sortDir) {
    const key = sortKey; const dir = sortDir === 'asc' ? 1 : -1;
    out = [...out].sort((a, b) => {
      const asv = a.sortValues?.[key], bsv = b.sortValues?.[key];
      if (asv !== undefined || bsv !== undefined) {
        // Blanks last regardless of direction — a file whose size couldn't be
        // read shouldn't claim "smallest" one way and "largest" the other.
        if (asv === undefined) return 1;
        if (bsv === undefined) return -1;
        return (asv - bsv) * dir;
      }
      const av = a.columns[key] ?? '', bv = b.columns[key] ?? '';
      const an = Number(av), bn = Number(bv);
      const cmp = (!isNaN(an) && !isNaN(bn) && av !== '' && bv !== '') ? an - bn : av.localeCompare(bv);
      return cmp * dir;
    });
  }
  return out;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  styles?: Partial<CSSStyleDeclaration>,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (styles) Object.assign(e.style, styles);
  if (text !== undefined) e.textContent = text;
  return e;
}

type SortDir = 'asc' | 'desc' | null;

/** Long enough to swallow a burst of typing, short enough not to feel laggy. */
const SEARCH_DEBOUNCE_MS = 150;

export function buildFilterTable(options: FilterTableOptions): FilterTableHandle {
  const { columns, onSelectionChange } = options;

  let rows: FilterTableRow[] = [];
  const selected = new Set<string>();
  // column key -> included values (absent/empty = unfiltered)
  const columnFilters = new Map<string, Set<string>>();
  let searchText = '';
  let sortKey: string | null = null;
  let sortDir: SortDir = null;
  // Pending coalesced body rebuild from addRow (see the handle's addRow below).
  let pendingAddFrame: number | null = null;

  const root = el('div', { display: 'flex', flexDirection: 'column', gap: '8px', flex: '1', minHeight: '0' });

  // ── Toolbar: search, select all/none/invert, count ──────────────────────
  const toolbar = el('div', {
    display: 'flex', alignItems: 'center', gap: '8px', flexShrink: '0', flexWrap: 'wrap',
  });
  const searchInput = el('input', {
    flex: '1', minWidth: '160px', padding: '4px 8px', fontSize: '12px',
    border: '1px solid var(--border-dim)', borderRadius: '4px',
    background: 'var(--bg-overlay)', color: 'var(--text-primary)',
  }) as HTMLInputElement;
  searchInput.type = 'text';
  searchInput.placeholder = 'Search…';
  // `searchText` updates synchronously (so getCriteria/Save filter… is always
  // current), but the re-render is coalesced: without this, every keystroke
  // tore down and rebuilt every visible row, which is felt immediately on a
  // few hundred files. Body only — searching changes nothing in the header.
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  searchInput.addEventListener('input', () => {
    searchText = searchInput.value;
    if (searchTimer !== null) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { searchTimer = null; buildBodyRows(); }, SEARCH_DEBOUNCE_MS);
  });
  toolbar.appendChild(searchInput);

  function toolbarBtn(label: string, onClick: () => void): HTMLButtonElement {
    const btn = el('button', {
      fontSize: '12px', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer',
      border: '1px solid var(--border-dim)', background: 'none', color: 'var(--text-secondary)',
      whiteSpace: 'nowrap',
    }, label);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    toolbar.appendChild(btn);
    return btn;
  }
  toolbarBtn('Select all', () => selectAll());
  toolbarBtn('Select none', () => selectNone());
  toolbarBtn('Invert', () => invertSelection());
  // Page-wide reset — every per-column filter (checkbox popups) plus the
  // free-text search box, in one click, rather than having to clear each
  // column filter individually.
  toolbarBtn('Clear filters', () => {
    columnFilters.clear();
    searchText = '';
    searchInput.value = '';
    render();
  });

  // Columns ▾ — the column set is a union of every metadata key across the
  // scanned files, so 20-30 columns is normal and most are irrelevant to any
  // one question. Hiding a column only affects display: its filter (if any)
  // still applies, which is why the row says so rather than silently dropping
  // it. Deliberately not persisted with the saved filter — the useful columns
  // depend on the files in front of you, not on the filter.
  const hiddenColumns = new Set<string>();
  const columnsBtn = toolbarBtn('Columns ▾', () => {
    openAnchoredMenu(columnsBtn, { stack: true, minWidth: '200px', maxWidth: '280px', fontSize: '12px' }, (popup, close) => {
      popup.setAttribute('role', 'dialog');
      popup.setAttribute('aria-label', 'Choose visible columns');
      const list = el('div', { display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '300px', overflow: 'auto' });
      const boxes: { key: string; box: HTMLInputElement }[] = [];
      for (const col of columns) {
        const row = el('label', { display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 4px', cursor: 'pointer' });
        const box = el('input') as HTMLInputElement;
        box.type = 'checkbox';
        box.checked = !hiddenColumns.has(col.key);
        boxes.push({ key: col.key, box });
        row.appendChild(box);
        const filtered = columnFilters.get(col.key)?.size ? ' (filtered)' : '';
        row.appendChild(el('span', { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          col.label + filtered));
        list.appendChild(row);
      }
      popup.appendChild(list);
      requestAnimationFrame(() => boxes[0]?.box.focus());

      const actions = el('div', { display: 'flex', gap: '6px', marginTop: '6px', borderTop: '1px solid var(--border-dim)', paddingTop: '6px' });
      const linkBtn = (label: string, onClick: () => void) => {
        const b = el('button', { fontSize: '12px', border: 'none', background: 'none', color: 'var(--accent)', cursor: 'pointer' }, label);
        b.type = 'button';
        b.addEventListener('click', onClick);
        actions.appendChild(b);
        return b;
      };
      linkBtn('All', () => { for (const c of boxes) c.box.checked = true; });
      linkBtn('None', () => { for (const c of boxes) c.box.checked = false; });
      const okBtn = el('button', {
        marginLeft: 'auto', fontSize: '12px', padding: '2px 10px', borderRadius: '4px', cursor: 'pointer',
        border: '1px solid var(--accent)', background: 'none', color: 'var(--accent)',
      }, 'OK');
      okBtn.type = 'button';
      okBtn.addEventListener('click', () => {
        hiddenColumns.clear();
        for (const c of boxes) if (!c.box.checked) hiddenColumns.add(c.key);
        close();
        render();
      });
      actions.appendChild(okBtn);
      popup.appendChild(actions);
    });
  });
  columnsBtn.setAttribute('aria-haspopup', 'dialog');

  /** Columns actually rendered — hidden ones still filter, they just don't show. */
  const visibleColumns = () => columns.filter(c => !hiddenColumns.has(c.key));

  const countLabel = el('span', { fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto', whiteSpace: 'nowrap' });
  toolbar.appendChild(countLabel);
  root.appendChild(toolbar);

  // ── Scroll body ───────────────────────────────────────────────────────────
  const scrollWrap = el('div', {
    flex: '1', minHeight: '0', overflow: 'auto',
    border: '1px solid var(--border-dim)', borderRadius: '4px',
  });
  const table = el('table', { width: '100%', borderCollapse: 'collapse', fontSize: '12px' });
  table.setAttribute('aria-label', options.ariaLabel ?? 'Filterable table');
  const thead = el('thead');
  const tbody = el('tbody');
  table.appendChild(thead);
  table.appendChild(tbody);
  scrollWrap.appendChild(table);
  root.appendChild(scrollWrap);

  const headerCheckbox = el('input') as HTMLInputElement;
  headerCheckbox.type = 'checkbox';
  headerCheckbox.title = 'Select all / none (of the rows currently shown)';
  headerCheckbox.setAttribute('aria-label', 'Select all rows currently shown');
  // Wired once, here — NOT inside buildHeaderRow(), which re-runs on every
  // render() (each search keystroke, sort, and selection change) and would
  // therefore stack up a fresh listener each time, so one later click fired a
  // growing pile of handlers, each re-rendering again.
  headerCheckbox.addEventListener('change', () => {
    if (headerCheckbox.checked) selectAll(); else selectNone();
  });

  function buildHeaderRow(): void {
    thead.replaceChildren();
    const tr = el('tr');
    // left:'0' in addition to top:'0' — sticky on BOTH axes, so the select
    // column (and its per-row checkboxes below) stays visible whether the
    // user has scrolled down, right, or both. A wide dynamic column set
    // (the whole point of this table) makes horizontal scroll the common
    // case, and losing sight of the checkbox column there was the bug.
    const thSelect = el('th', {
      position: 'sticky', top: '0', left: '0', zIndex: '2', background: 'var(--bg-overlay)', padding: '4px 6px',
      borderBottom: '1px solid var(--border-dim)', textAlign: 'left', width: '24px',
    });
    thSelect.scope = 'col';
    thSelect.appendChild(headerCheckbox);
    tr.appendChild(thSelect);

    for (const col of visibleColumns()) {
      const th = el('th', {
        position: 'sticky', top: '0', background: 'var(--bg-overlay)', padding: '4px 6px',
        borderBottom: '1px solid var(--border-dim)', textAlign: 'left', whiteSpace: 'nowrap',
      });
      th.scope = 'col';
      // aria-sort belongs on the header cell, and must be present on the sorted
      // column only — screen readers announce the direction from it.
      const sorted = sortKey === col.key && sortDir !== null;
      th.setAttribute('aria-sort', sorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none');

      const inner = el('div', { display: 'flex', alignItems: 'center', gap: '4px' });
      // A real <button>, not a click handler on the <th>: sorting has to be
      // reachable and operable from the keyboard, and needs to announce itself
      // as a control. It's styled flat so the header still reads as a header.
      const sortBtn = el('button', {
        display: 'flex', alignItems: 'center', gap: '4px', flex: '1',
        border: 'none', background: 'none', padding: '0', cursor: 'pointer',
        font: 'inherit', color: 'inherit', textAlign: 'left', whiteSpace: 'nowrap',
      });
      sortBtn.type = 'button';
      sortBtn.appendChild(el('span', {}, col.label));
      sortBtn.appendChild(el('span', { fontSize: '12px', color: 'var(--text-muted)' },
        sorted ? (sortDir === 'asc' ? '▲' : '▼') : ''));
      sortBtn.title = `Sort by ${col.label}`;
      sortBtn.setAttribute('aria-label',
        `Sort by ${col.label}${sorted ? (sortDir === 'asc' ? ' (currently ascending)' : ' (currently descending)') : ''}`);
      sortBtn.addEventListener('click', () => {
        if (sortKey !== col.key) { sortKey = col.key; sortDir = 'asc'; }
        else if (sortDir === 'asc') { sortDir = 'desc'; }
        else { sortKey = null; sortDir = null; }
        render();
      });
      inner.appendChild(sortBtn);

      const activeFilter = columnFilters.get(col.key)?.size;
      const filterBtn = el('button', {
        marginLeft: 'auto', fontSize: '12px', border: 'none', background: 'none', cursor: 'pointer',
        color: activeFilter ? 'var(--accent)' : 'var(--text-muted)', padding: '0 2px',
      }, '▾');
      filterBtn.type = 'button';
      filterBtn.title = `Filter by ${col.label}`;
      // The glyph alone carries "filtered" only in colour; name the state so it
      // isn't colour-only information (WCAG 1.4.1).
      filterBtn.setAttribute('aria-label',
        `Filter by ${col.label}${activeFilter ? ' (filter active)' : ''}`);
      filterBtn.setAttribute('aria-haspopup', 'dialog');
      filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openColumnFilterMenu(filterBtn, col);
      });
      inner.appendChild(filterBtn);
      th.appendChild(inner);
      tr.appendChild(th);
    }
    thead.appendChild(tr);
  }

  // `onlyValue`, when passed, opens the popup pre-set to that single value
  // (a right-click on a body cell — "filter to what I just clicked") instead
  // of the column's existing filter state.
  function openColumnFilterMenu(anchor: HTMLElement, col: FilterTableColumn, onlyValue?: string): void {
    const uniqueValues = [...new Set(rows.map(r => r.columns[col.key] ?? ''))].sort();
    openAnchoredMenu(anchor, { stack: true, minWidth: '200px', maxWidth: '280px', fontSize: '12px' }, (popup, close) => {
      // anchoredMenu owns the box and its dismissal but is content-agnostic —
      // this particular popup is a small form, so it names itself as one.
      popup.setAttribute('role', 'dialog');
      popup.setAttribute('aria-label', `Filter by ${col.label}`);
      const current = columnFilters.get(col.key);
      const list = el('div', { display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '260px', overflow: 'auto' });
      const checkboxes: { value: string; box: HTMLInputElement }[] = [];
      for (const v of uniqueValues) {
        const row = el('label', { display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 4px', cursor: 'pointer' });
        const box = el('input') as HTMLInputElement;
        box.type = 'checkbox';
        box.checked = onlyValue !== undefined ? v === onlyValue : (!current || current.has(v));
        checkboxes.push({ value: v, box });
        row.appendChild(box);
        row.appendChild(el('span', { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, v || '(blank)'));
        list.appendChild(row);
      }
      popup.appendChild(list);
      // Move focus into the popup so keyboard users land inside it rather than
      // being left on the trigger behind it, and so Tab cycles its controls.
      requestAnimationFrame(() => checkboxes[0]?.box.focus());
      const actions = el('div', { display: 'flex', gap: '6px', marginTop: '6px', borderTop: '1px solid var(--border-dim)', paddingTop: '6px' });
      const apply = (values: Set<string> | null) => {
        if (values === null || values.size === uniqueValues.length) columnFilters.delete(col.key);
        else columnFilters.set(col.key, values);
        render();
      };
      const allBtn = el('button', { fontSize: '12px', border: 'none', background: 'none', color: 'var(--accent)', cursor: 'pointer' }, 'All');
      allBtn.type = 'button';
      allBtn.addEventListener('click', () => { for (const c of checkboxes) c.box.checked = true; });
      const noneBtn = el('button', { fontSize: '12px', border: 'none', background: 'none', color: 'var(--accent)', cursor: 'pointer' }, 'None');
      noneBtn.type = 'button';
      noneBtn.addEventListener('click', () => { for (const c of checkboxes) c.box.checked = false; });
      // Distinct from "All" + OK (functionally equivalent, but explicit and
      // immediate) — removes this column's filter entirely and closes
      // without needing a separate OK click.
      const clearBtn = el('button', { fontSize: '12px', border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }, 'Clear');
      clearBtn.type = 'button';
      clearBtn.addEventListener('click', () => { apply(null); close(); });
      const okBtn = el('button', {
        marginLeft: 'auto', fontSize: '12px', padding: '2px 10px', borderRadius: '4px', cursor: 'pointer',
        border: '1px solid var(--accent)', background: 'none', color: 'var(--accent)',
      }, 'OK');
      okBtn.type = 'button';
      okBtn.addEventListener('click', () => { apply(new Set(checkboxes.filter(c => c.box.checked).map(c => c.value))); close(); });
      actions.appendChild(clearBtn);
      actions.appendChild(allBtn);
      actions.appendChild(noneBtn);
      actions.appendChild(okBtn);
      popup.appendChild(actions);
    });
  }

  function visibleRows(): FilterTableRow[] {
    return filterAndSortRows(rows, { columnFilters, searchText, sortKey, sortDir });
  }

  function buildBodyRows(): void {
    tbody.replaceChildren();
    const vis = visibleRows();
    for (const row of vis) {
      const isSelected = selected.has(row.id);
      // The whole row is tinted when selected, not just the checkbox — so
      // selection state reads at a glance without needing to see column 0
      // at all (belt-and-suspenders with the sticky checkbox column below).
      const rowBg = isSelected ? 'var(--bg-accent-hover)' : 'transparent';
      const tr = el('tr', { background: rowBg });
      tr.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        toggleRow(row.id);
      });
      // position:sticky;left:0 mirrors the header cell above — this column
      // must stay visible through horizontal scroll too. Needs its own
      // explicit (non-transparent) background matching the row's selection
      // tint, since a sticky cell paints over whatever content has scrolled
      // beneath it and would otherwise show see-through/mismatched colour.
      const tdSelect = el('td', {
        padding: '3px 6px', borderBottom: '1px solid var(--border-strong)',
        position: 'sticky', left: '0', zIndex: '1',
        background: isSelected ? 'var(--bg-accent-hover)' : 'var(--bg-overlay)',
      });
      const box = el('input') as HTMLInputElement;
      box.type = 'checkbox';
      box.checked = isSelected;
      // Named after the row's first column (the file name, for the file
      // filter), so tabbing through announces *which* row is being selected
      // rather than "checkbox, checkbox, checkbox". This checkbox is also the
      // keyboard path to selection — the whole-row click below is a mouse
      // convenience on top of it, not the only way in.
      box.setAttribute('aria-label', `Select ${row.columns[visibleColumns()[0]?.key ?? ''] || row.id}`);
      box.addEventListener('change', () => toggleRow(row.id));
      tdSelect.appendChild(box);
      tr.appendChild(tdSelect);
      for (const col of visibleColumns()) {
        const cellValue = row.columns[col.key] ?? '';
        const td = el('td', {
          padding: '3px 6px', borderBottom: '1px solid var(--border-strong)', color: 'var(--text-secondary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '260px',
        }, cellValue);
        // Right-click a cell to jump straight to that column's filter popup,
        // pre-set to this cell's value — quicker than hunting the header's ▾
        // button when the column is scrolled out of view.
        td.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openColumnFilterMenu(td, col, cellValue);
        });
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    const allVisSelected = vis.length > 0 && vis.every(r => selected.has(r.id));
    headerCheckbox.checked = allVisSelected;
    headerCheckbox.indeterminate = !allVisSelected && vis.some(r => selected.has(r.id));
    countLabel.textContent = `${selected.size} selected / ${vis.length} shown / ${rows.length} total`;
  }

  function toggleRow(id: string): void {
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    onSelectionChange?.(new Set(selected));
    buildBodyRows();
  }

  /**
   * Full rebuild — header AND body. Only needed when something the *header*
   * displays changes: sort state (glyph + `aria-sort`) or whether a column has
   * an active filter (the ▾ tint). Anything that only changes which rows show,
   * or which are ticked, should call `buildBodyRows` instead: the header is
   * one row but rebuilding it also re-creates every column's two buttons.
   */
  function render(): void {
    buildHeaderRow();
    buildBodyRows();
  }

  function selectAll(): void {
    for (const r of visibleRows()) selected.add(r.id);
    onSelectionChange?.(new Set(selected));
    buildBodyRows();
  }
  function selectNone(): void {
    for (const r of visibleRows()) selected.delete(r.id);
    onSelectionChange?.(new Set(selected));
    buildBodyRows();
  }
  function invertSelection(): void {
    for (const r of visibleRows()) { if (selected.has(r.id)) selected.delete(r.id); else selected.add(r.id); }
    onSelectionChange?.(new Set(selected));
    buildBodyRows();
  }

  render();

  return {
    el: root,
    // Copied, not aliased: `addRow` pushes into `rows`, so holding the
    // caller's array would silently mutate it from under them.
    setRows(newRows) { rows = [...newRows]; render(); },
    addRow(row) {
      // `rows.push`, not `rows = [...rows, row]` — the spread copied the whole
      // array per call, so populating N rows was O(N²) before any DOM work.
      rows.push(row);
      // Renders are coalesced to one per frame: a caller appending 500 rows in
      // a loop gets one body rebuild, not 500 (and no header rebuild at all —
      // adding a row changes nothing the header shows). `rowCount()` and the
      // row data stay correct synchronously; only the paint is deferred.
      if (pendingAddFrame !== null) return;
      pendingAddFrame = requestAnimationFrame(() => {
        pendingAddFrame = null;
        buildBodyRows();
      });
    },
    getSelectedIds: () => new Set(selected),
    selectAll,
    selectNone,
    invertSelection,
    rowCount: () => rows.length,
    getCriteria(): FilterCriteria {
      const columnValues: Record<string, string[]> = {};
      for (const [key, values] of columnFilters) columnValues[key] = [...values];
      return { columnValues, searchText };
    },
    applyCriteria(criteria: FilterCriteria, opts?: { select?: boolean }) {
      const known = new Set(columns.map(c => c.key));
      const unknownColumns: string[] = [];
      columnFilters.clear();
      for (const [key, values] of Object.entries(criteria.columnValues)) {
        if (values.length === 0) continue;
        // A key this table has no column for can't be matched against anything.
        // Applying it would filter every row out and look like a broken filter,
        // so it's dropped and reported instead.
        if (!known.has(key)) { unknownColumns.push(key); continue; }
        columnFilters.set(key, new Set(values));
      }
      searchText = criteria.searchText;
      searchInput.value = searchText;
      render();
      // Pre-select every row currently matching the just-applied filter —
      // "Load filter…" is meant to reselect the same subset, not just narrow
      // the view. Opt out for a filter the user didn't explicitly load.
      if (opts?.select !== false) selectAll();
      return { unknownColumns };
    },
  };
}
