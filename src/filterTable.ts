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
import { createRangeSelection } from './listSelection';
import { attachTooltip } from './tooltip';

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
  /** Fired whenever the column filters change — a column menu, Clear filters,
   *  or `applyCriteria`. Lets a control outside the table that sets one of its
   *  filters (the file filter's format buttons) show the table's state rather
   *  than keep a second copy of it. Search text is not a column filter and
   *  does not fire this. */
  onFilterChange?: (criteria: FilterCriteria) => void;
  /** Hide any column that is blank in every row currently shown, re-judged as
   *  the filter or search changes. For tables whose columns are a union over
   *  unlike rows (the file filter: STDF header fields next to CSV files that
   *  carry none), where a view of one kind would otherwise be mostly empty
   *  columns. A column with an active filter is never hidden. */
  hideEmptyColumns?: boolean;
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
  /** Ids currently passing the filter/search — a selection can legitimately
   *  contain rows this does not, and a caller refusing a load needs to be able
   *  to say so rather than leaving the user hunting. */
  getShownIds(): Set<string>;
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

/** Default and minimum column widths (px) for the resizable header. Filenames
 *  are the whole reason this table exists (fileFilterUI.ts), and 180px
 *  truncates most of them — wider than the old fixed 260px *max-width* cap,
 *  since that was a ceiling shared by every column, not a per-column start
 *  point a user can grow from. */
const DEFAULT_COL_WIDTH = 180;
const MIN_COL_WIDTH = 60;
/** Arrow-key resize step, mirrored from the pointer-drag experience. */
const RESIZE_KEY_STEP = 16;
/** Ceiling for auto-sizing — a single very long value (a long path, a stray
 *  sentence in an error column) shouldn't be able to blow one column out to
 *  fill the whole table. A user can still drag past this manually. */
const AUTO_SIZE_MAX_WIDTH = 420;
/** "A bit of margin" beyond the tightest fit, so text doesn't sit flush
 *  against the next column's sort/filter controls. */
const AUTO_SIZE_MARGIN = 16;
/** Cell padding (both th and td use 6px horizontal padding — see below). */
const AUTO_SIZE_CELL_PADDING = 12;
/** Reserved width for a header's sort button + filter ▾ button + the gaps
 *  between them — these sit next to the label text, not on top of it, so an
 *  auto-fit header needs room for both or the controls get squeezed. */
const AUTO_SIZE_HEADER_CHROME = 50;

/** Long enough to swallow a burst of typing, short enough not to feel laggy. */
const SEARCH_DEBOUNCE_MS = 150;

export function buildFilterTable(options: FilterTableOptions): FilterTableHandle {
  const { columns, onSelectionChange, onFilterChange, hideEmptyColumns } = options;

  let rows: FilterTableRow[] = [];
  const selected = new Set<string>();
  // Roving tabindex: the one row Tab lands on, and the row to re-focus after a
  // body rebuild (every selection change rebuilds it, which would otherwise
  // drop keyboard focus to <body> after each Space).
  let focusedId: string | null = null;
  const rowEls = new Map<string, HTMLTableRowElement>();
  // column key -> included values (absent/empty = unfiltered)
  const columnFilters = new Map<string, Set<string>>();
  let searchText = '';
  let sortKey: string | null = null;
  let sortDir: SortDir = null;

  /** The filter state as saved/applied criteria — one builder for both
   *  `getCriteria` and `onFilterChange`. */
  function criteriaNow(): FilterCriteria {
    const columnValues: Record<string, string[]> = {};
    for (const [key, values] of columnFilters) columnValues[key] = [...values];
    return { columnValues, searchText };
  }
  /** Call after any change to `columnFilters`. */
  function filtersChanged(): void {
    onFilterChange?.(criteriaNow());
  }
  // Pending coalesced body rebuild from addRow (see the handle's addRow below).
  let pendingAddFrame: number | null = null;
  // column key -> width in px. Missing = DEFAULT_COL_WIDTH. Not persisted with
  // saved filters (same reasoning as hiddenColumns above) — column widths are
  // a per-session display preference, not part of what a filter means.
  const columnWidths = new Map<string, number>();
  const colEls = new Map<string, HTMLTableColElement>();
  // Columns the user has actually dragged/keyboard-resized — autoSizeColumns
  // (below) skips these on a later setRows, so a manual resize survives a
  // fresh data load instead of being clobbered by the next auto-fit.
  const userResizedColumns = new Set<string>();

  const root = el('div', { display: 'flex', flexDirection: 'column', gap: '8px', flex: '1', minHeight: '0' });

  // ── Toolbar: search, select all/none/invert, count ──────────────────────
  const toolbar = el('div', {
    display: 'flex', alignItems: 'center', gap: '8px', flexShrink: '0', flexWrap: 'wrap',
  });
  const searchInput = el('input', {
    flex: '1', minWidth: '160px', padding: '4px 8px', fontSize: '12px',
    border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-control)',
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
    const btn = el('button', { whiteSpace: 'nowrap' }, label);
    btn.className = 'btn-secondary';
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
    filtersChanged();
  });

  // Columns ▾ — the column set is a union of every metadata key across the
  // scanned files, so 20-30 columns is normal and most are irrelevant to any
  // one question. Hiding a column only affects display: its filter (if any)
  // still applies, which is why the row says so rather than silently dropping
  // it. Deliberately not persisted with the saved filter — the useful columns
  // depend on the files in front of you, not on the filter.
  const hiddenColumns = new Set<string>();
  const columnsBtn = toolbarBtn('Columns ▾', () => {
    // `commit` is set by the fill callback below and run on dismissal as well
    // as on OK. Without it, unticking a column and then clicking away — the
    // ordinary way to leave a menu — threw the change away silently, which
    // reads as the Columns filter simply not working. Escape still cancels,
    // which is the only reason `onClose` needs the reason at all.
    let commit: (() => void) | null = null;
    openAnchoredMenu(columnsBtn, {
      stack: true, minWidth: '200px', maxWidth: '280px', fontSize: '12px',
      onClose: (reason) => { if (reason !== 'escape') commit?.(); },
    }, (popup, close) => {
      popup.setAttribute('role', 'dialog');
      popup.setAttribute('aria-label', 'Choose visible columns');
      const list = el('div', { display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '300px', overflow: 'auto' });
      const boxes: { key: string; box: HTMLInputElement }[] = [];
      for (const col of columns) {
        const row = el('label', { display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 4px', cursor: 'pointer' });
        row.className = 'click-row';
        const box = el('input') as HTMLInputElement;
        box.type = 'checkbox';
        box.checked = !hiddenColumns.has(col.key);
        boxes.push({ key: col.key, box });
        row.appendChild(box);
        // Say why a ticked column isn't on screen, rather than let its tick
        // look broken (hideEmptyColumns).
        const note = columnFilters.get(col.key)?.size ? ' (filtered)'
          : emptyColumns.has(col.key) ? ' (blank in every row shown)' : '';
        row.appendChild(el('span', { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          col.label + note));
        list.appendChild(row);
      }
      popup.appendChild(list);
      requestAnimationFrame(() => boxes[0]?.box.focus());

      const actions = el('div', { display: 'flex', gap: '6px', marginTop: '6px', borderTop: '1px solid var(--border-dim)', paddingTop: '6px' });
      const linkBtn = (label: string, onClick: () => void) => {
        const b = el('button', {}, label);
        b.className = 'btn-link';
        b.type = 'button';
        b.addEventListener('click', onClick);
        actions.appendChild(b);
        return b;
      };
      linkBtn('All', () => { for (const c of boxes) c.box.checked = true; });
      linkBtn('None', () => { for (const c of boxes) c.box.checked = false; });
      const okBtn = el('button', {
        marginLeft: 'auto',
      }, 'OK');
      okBtn.className = 'btn-secondary';
      okBtn.type = 'button';
      commit = () => {
        hiddenColumns.clear();
        for (const c of boxes) if (!c.box.checked) hiddenColumns.add(c.key);
        render();
      };
      okBtn.addEventListener('click', () => {
        // close() runs onClose, which commits — doing it here as well would
        // just repeat the same idempotent work.
        close();
      });
      actions.appendChild(okBtn);
      popup.appendChild(actions);
    });
  });
  columnsBtn.setAttribute('aria-haspopup', 'dialog');

  // Columns blank in every row currently shown (hideEmptyColumns), kept
  // current by syncEmptyColumns wherever the shown rows can change.
  let emptyColumns = new Set<string>();
  /** Recompute `emptyColumns` for the rows now shown. Returns true when the
   *  set changed — the caller must then rebuild the header, which lists the
   *  columns. A column with an active filter is never hidden: its ▾ is the
   *  only way to clear that filter. With no rows shown nothing is hidden, so
   *  the header still says what the table would contain. */
  function syncEmptyColumns(shown: FilterTableRow[]): boolean {
    if (!hideEmptyColumns) return false;
    const next = new Set(shown.length === 0 ? [] : columns
      .filter(c => !columnFilters.get(c.key)?.size && !shown.some(r => r.columns[c.key]))
      .map(c => c.key));
    const changed = next.size !== emptyColumns.size || [...next].some(k => !emptyColumns.has(k));
    emptyColumns = next;
    return changed;
  }

  /** Columns actually rendered — hidden ones still filter, they just don't show. */
  const visibleColumns = () => columns.filter(c => !hiddenColumns.has(c.key) && !emptyColumns.has(c.key));

  const countLabel = el('span', { fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto', whiteSpace: 'nowrap' });
  toolbar.appendChild(countLabel);
  root.appendChild(toolbar);

  // ── Scroll body ───────────────────────────────────────────────────────────
  const scrollWrap = el('div', {
    flex: '1', minHeight: '0', overflow: 'auto',
    border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-control)',
  });
  // table-layout:fixed makes column widths come from <colgroup>/the first
  // row's <th> widths rather than content — the standard technique for both
  // reliable truncation (the ellipsis below only clips at a size the browser
  // isn't also trying to grow to fit content) and resizability (there is a
  // single per-column width to drag, not a content-driven one the drag would
  // fight).
  const table = el('table', { width: '100%', borderCollapse: 'collapse', fontSize: '12px', tableLayout: 'fixed' });
  table.setAttribute('aria-label', options.ariaLabel ?? 'Filterable table');
  // A grid, not a plain table: its rows are selectable and take focus, which
  // `role="table"` rows cannot announce (aria-selected is only defined for
  // grid/treegrid rows). Row-level focus, not cell-level — there is nothing to
  // do inside a cell.
  table.setAttribute('role', 'grid');
  table.setAttribute('aria-multiselectable', 'true');
  const colgroup = el('colgroup');
  const thead = el('thead');
  const tbody = el('tbody');
  table.appendChild(colgroup);
  table.appendChild(thead);
  table.appendChild(tbody);
  scrollWrap.appendChild(table);
  root.appendChild(scrollWrap);

  // Single offscreen canvas context reused for every measurement — creating
  // one per call is wasteful, and font metrics don't change between calls.
  let measureCtx: CanvasRenderingContext2D | null | undefined;
  function measureTextWidth(text: string): number {
    if (measureCtx === undefined) {
      measureCtx = document.createElement('canvas').getContext('2d');
      if (measureCtx) {
        measureCtx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
      }
    }
    // No 2d context (e.g. a test environment with no canvas backing) — fall
    // back to a rough monospace-ish estimate rather than leaving every
    // column at DEFAULT_COL_WIDTH regardless of content.
    return measureCtx ? measureCtx.measureText(text).width : text.length * 7;
  }

  /** Fits every column not already manually resized to its content — the
   *  widest of its header label (plus room for the sort/filter buttons) and
   *  every row's value in that column, capped at AUTO_SIZE_MAX_WIDTH so one
   *  outlier value can't dominate the table. Called after each fresh
   *  setRows, so a table that's had columns hand-resized keeps those on a
   *  later reload while still fitting whatever is new. */
  function autoSizeColumns(): void {
    for (const col of columns) {
      if (userResizedColumns.has(col.key)) continue;
      let widest = measureTextWidth(col.label) + AUTO_SIZE_HEADER_CHROME;
      for (const row of rows) {
        const w = measureTextWidth(row.columns[col.key] ?? '');
        if (w > widest) widest = w;
      }
      const fitted = Math.round(widest) + AUTO_SIZE_CELL_PADDING + AUTO_SIZE_MARGIN;
      columnWidths.set(col.key, Math.min(AUTO_SIZE_MAX_WIDTH, Math.max(MIN_COL_WIDTH, fitted)));
    }
  }

  /** Rebuilds <colgroup> to match the current visible columns — must run
   *  whenever the visible column set changes (Columns ▾), since table-layout
   *  fixed reads column widths from these <col> elements, not from the <th>s. */
  function buildColGroup(): void {
    colgroup.replaceChildren();
    colEls.clear();
    for (const col of visibleColumns()) {
      const c = el('col');
      c.style.width = `${columnWidths.get(col.key) ?? DEFAULT_COL_WIDTH}px`;
      colEls.set(col.key, c);
      colgroup.appendChild(c);
    }
  }

  function buildHeaderRow(): void {
    buildColGroup();
    thead.replaceChildren();
    const tr = el('tr');
    for (const col of visibleColumns()) {
      const th = el('th', {
        position: 'sticky', top: '0', background: 'var(--bg-overlay)', padding: '4px 6px',
        borderBottom: '1px solid var(--border-dim)', textAlign: 'left', whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis',
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
      const sortBtn = el('button', {});
      sortBtn.className = 'btn-header';
      sortBtn.type = 'button';
      sortBtn.appendChild(el('span', {}, col.label));
      sortBtn.appendChild(el('span', { fontSize: '12px', color: 'var(--text-muted)' },
        sorted ? (sortDir === 'asc' ? '▲' : '▼') : ''));
      attachTooltip(sortBtn, `Sort by ${col.label}`);
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
      const filterBtn = el('button', {}, '▾');
      filterBtn.className = activeFilter ? 'btn-caret is-on' : 'btn-caret';
      filterBtn.type = 'button';
      attachTooltip(filterBtn, `Filter by ${col.label}`);
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
      th.appendChild(buildResizeHandle(col));
      tr.appendChild(th);
    }
    thead.appendChild(tr);
  }

  /** A draggable divider on a header cell's trailing edge — mouse drag and
   *  Left/Right arrow keys both adjust the column's stored width, which is
   *  applied live to the matching <col> (table-layout:fixed means that's the
   *  only element that needs to change; no full re-render mid-drag). Modeled
   *  as a WAI-ARIA separator (APG "window splitter" pattern) since it's a
   *  draggable boundary between two regions, not a button or slider. */
  function buildResizeHandle(col: FilterTableColumn): HTMLDivElement {
    const handle = el('div', {
      position: 'absolute', top: '0', right: '0', bottom: '0', width: '6px',
      cursor: 'col-resize', touchAction: 'none',
    });
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', `Resize ${col.label} column`);
    handle.tabIndex = 0;
    // A focusable separator is a WINDOW SPLITTER in APG terms, and a splitter
    // without aria-value* announces no position and no range — the arrow keys
    // below change something the user cannot hear. Kept in step by applyWidth.
    handle.setAttribute('aria-valuemin', String(MIN_COL_WIDTH));
    handle.setAttribute('aria-valuemax', String(AUTO_SIZE_MAX_WIDTH));

    const currentWidth = () => columnWidths.get(col.key) ?? DEFAULT_COL_WIDTH;
    const applyWidth = (px: number) => {
      const clamped = Math.max(MIN_COL_WIDTH, px);
      handle.setAttribute('aria-valuenow', String(Math.round(clamped)));
      userResizedColumns.add(col.key);
      columnWidths.set(col.key, clamped);
      const c = colEls.get(col.key);
      if (c) c.style.width = `${clamped}px`;
    };

    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startWidth = currentWidth();
      const onMove = (ev: PointerEvent) => applyWidth(startWidth + (ev.clientX - startX));
      // `pointercancel` too, not just `pointerup`: a cancelled drag (the browser
      // taking over the gesture, the pointer leaving the window, a touch being
      // interrupted) fires cancel and NOT up. Without it `onMove` stayed
      // attached, so afterwards merely hovering the handle resized the column
      // using a stale startX/startWidth — and every subsequent drag stacked
      // another live listener on top.
      const onUp = () => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    });

    handle.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); applyWidth(currentWidth() - RESIZE_KEY_STEP); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); applyWidth(currentWidth() + RESIZE_KEY_STEP); }
    });

    return handle;
  }

  function openColumnFilterMenu(anchor: HTMLElement, col: FilterTableColumn): void {
    const uniqueValues = [...new Set(rows.map(r => r.columns[col.key] ?? ''))].sort();
    // Same contract as the column picker above: dismissing by clicking away
    // commits, Escape cancels. `Clear` sets its own commit first so a cleared
    // filter is not immediately re-applied from the still-ticked boxes.
    let commit: (() => void) | null = null;
    openAnchoredMenu(anchor, {
      stack: true, minWidth: '200px', maxWidth: '280px', fontSize: '12px',
      onClose: (reason) => { if (reason !== 'escape') commit?.(); },
    }, (popup, close) => {
      // anchoredMenu owns the box and its dismissal but is content-agnostic —
      // this particular popup is a small form, so it names itself as one.
      popup.setAttribute('role', 'dialog');
      popup.setAttribute('aria-label', `Filter by ${col.label}`);
      const current = columnFilters.get(col.key);
      const list = el('div', { display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '260px', overflow: 'auto' });
      const checkboxes: { value: string; box: HTMLInputElement }[] = [];
      for (const v of uniqueValues) {
        const row = el('label', { display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 4px', cursor: 'pointer' });
        row.className = 'click-row';
        const box = el('input') as HTMLInputElement;
        box.type = 'checkbox';
        box.checked = !current || current.has(v);
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
        filtersChanged();
      };
      commit = () => apply(new Set(checkboxes.filter(c => c.box.checked).map(c => c.value)));
      const allBtn = el('button', {}, 'All');
      allBtn.className = 'btn-link';
      allBtn.type = 'button';
      allBtn.addEventListener('click', () => { for (const c of checkboxes) c.box.checked = true; });
      const noneBtn = el('button', {}, 'None');
      noneBtn.className = 'btn-link';
      noneBtn.type = 'button';
      noneBtn.addEventListener('click', () => { for (const c of checkboxes) c.box.checked = false; });
      // Distinct from "All" + OK (functionally equivalent, but explicit and
      // immediate) — removes this column's filter entirely and closes
      // without needing a separate OK click.
      const clearBtn = el('button', {}, 'Clear');
      clearBtn.className = 'btn-link btn-link--muted';
      clearBtn.type = 'button';
      clearBtn.addEventListener('click', () => { commit = () => apply(null); close(); });
      const okBtn = el('button', {
        marginLeft: 'auto',
      }, 'OK');
      okBtn.className = 'btn-secondary';
      okBtn.type = 'button';
      okBtn.addEventListener('click', () => { close(); });
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
    const vis = visibleRows();
    // A search or an added row can change which columns have anything to show
    // (hideEmptyColumns) — the one case a body-only rebuild touches the header.
    if (syncEmptyColumns(vis)) buildHeaderRow();
    if (focusedId === null || !vis.some(r => r.id === focusedId)) focusedId = vis[0]?.id ?? null;
    const hadFocus = tbody.contains(document.activeElement);
    tbody.replaceChildren();
    rowEls.clear();
    for (const row of vis) {
      const isSelected = selected.has(row.id);
      // No checkbox column: the row tint IS the selection indicator, and
      // aria-selected carries the same state to screen readers. The model is
      // still the checkbox list's (UI_STANDARDS.md, listSelection.ts) — a
      // click toggles and selection accumulates — because picking files across
      // two different searches is a real workflow here, and a Finder-style
      // click that cleared the selection would silently drop the rows the
      // current filter hides.
      const tr = el('tr', { background: isSelected ? 'var(--bg-selected)' : 'transparent' });
      tr.setAttribute('aria-selected', String(isSelected));
      tr.tabIndex = row.id === focusedId ? 0 : -1;
      tr.addEventListener('focus', () => { focusedId = row.id; });
      // Shift+Click is a range here, not "extend the text selection" — stop
      // the browser highlighting every cell between the two clicks.
      tr.addEventListener('mousedown', (e) => { if (e.shiftKey) e.preventDefault(); });
      tr.addEventListener('click', (e) => {
        if (rangeSel.handleClick(row.id, e)) return;
        toggleRow(row.id);
      });
      tr.addEventListener('keydown', (e) => {
        if (rangeSel.handleKeydown(row.id, e)) { e.preventDefault(); return; }
        // Plain Space toggles the focused row — the job the row checkbox's own
        // native Space used to do (Shift+Space is the range, handled above).
        if (e.key === ' ' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          toggleRow(row.id);
        }
      });
      rowEls.set(row.id, tr);
      for (const col of visibleColumns()) {
        const cellValue = row.columns[col.key] ?? '';
        const td = el('td', {
          padding: '3px 6px', borderBottom: '1px solid var(--border-strong)', color: 'var(--text-secondary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }, cellValue);
        // Native `title`, deliberately — this is the ONE case UI_STANDARDS.md
        // permits it: the cell is truncated by CSS (overflow/ellipsis above) and
        // the browser's own "show the full string" behaviour is exactly what is
        // wanted. A themed tooltip on every cell of a 4,000-row scan would cost
        // far more than it returns, and would not survive a native copy.
        td.title = cellValue;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    if (hadFocus && focusedId !== null) rowEls.get(focusedId)?.focus();
    // Name the hidden part of the selection explicitly. `selected` deliberately
    // survives a filter change (ticking across two different searches is a real
    // workflow), so it can legitimately exceed what is on screen — and when it
    // silently did, a refused load looked like it was complaining about the
    // rows in front of you. Also the only cue that "Select all" is scoped to
    // the shown rows while "Select none" clears everything: that asymmetry is
    // forced (a scoped "none" cannot reach hidden rows at all), so the state it
    // produces has to be legible.
    const hiddenSelected = [...selected].filter(id => !vis.some(r => r.id === id)).length;
    countLabel.textContent = hiddenSelected > 0
      ? `${selected.size} selected (${hiddenSelected} hidden) / ${vis.length} shown / ${rows.length} total`
      : `${selected.size} selected / ${vis.length} shown / ${rows.length} total`;
  }

  /** Shift/keyboard range selection — the shared checkbox-list convention, the
   *  same one the test selector and splits dialog use. This table had none: a
   *  shift-click just toggled the row under the pointer. See listSelection.ts. */
  const rangeSel = createRangeSelection<string>({
    visibleIds: () => visibleRows().map(r => r.id),
    isSelected: (id) => selected.has(id),
    setSelected: (id, on) => { if (on) selected.add(id); else selected.delete(id); },
    onChanged: () => { onSelectionChange?.(new Set(selected)); buildBodyRows(); },
    focusRow: (i) => {
      const id = visibleRows()[i]?.id;
      if (id !== undefined) rowEls.get(id)?.focus();
    },
  });

  function toggleRow(id: string): void {
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    // Only a plain toggle moves the anchor; Shift never does, so repeated
    // shift-clicks re-extend from the same origin instead of chaining.
    rangeSel.setAnchor(id);
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
    syncEmptyColumns(visibleRows());
    buildHeaderRow();
    buildBodyRows();
  }

  function selectAll(): void {
    for (const r of visibleRows()) selected.add(r.id);
    onSelectionChange?.(new Set(selected));
    buildBodyRows();
  }
  function selectNone(): void {
    // Clears EVERYTHING, not just the visible rows — unlike `selectAll`, which
    // is deliberately "all of what you are looking at".
    //
    // The asymmetry is the point. Scoping this to visible rows made "Select
    // none" not mean none: with a search active it left the hidden rows
    // selected, with no control on screen able to reach them. A user narrowing
    // a mixed-format batch to one format got "4 selected / 2 shown", a load
    // still refused for mixed formats, and no way out except guessing that the
    // search box was the culprit. "None" has to mean none, or it is a dead end.
    selected.clear();
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
    setRows(newRows) { rows = [...newRows]; autoSizeColumns(); render(); },
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
    getShownIds: () => new Set(visibleRows().map(r => r.id)),
    selectAll,
    selectNone,
    invertSelection,
    rowCount: () => rows.length,
    getCriteria: criteriaNow,
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
      filtersChanged();
      // Pre-select every row currently matching the just-applied filter —
      // "Load filter…" is meant to reselect the same subset, not just narrow
      // the view. Opt out for a filter the user didn't explicitly load.
      if (opts?.select !== false) selectAll();
      return { unknownColumns };
    },
  };
}
