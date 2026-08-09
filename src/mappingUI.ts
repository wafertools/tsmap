// Column mapping overlay — shown after csv_headers, before parse_csv.
// Mirrors the wmap showcase mapping phase.

import { escapeHtml as esc, stableTestNumber } from './lib';

export interface CsvTestCol {
  col: string;
  testNumber: number;
  name: string;
}

export interface CsvMapping {
  x: string;
  y: string;
  hbin: string | null;
  sbin: string | null;
  wafer: string | null;
  lot: string | null;
  site: string | null;
  tests: CsvTestCol[];
  meta: string[];
  splitBy: string[];
  testnameCol: string | null;
  testvalueCol: string | null;
  loLimitCol: string | null;
  hiLimitCol: string | null;
  unitsCol: string | null;
  passBins: number[];
}

export interface HeadersResult {
  headers: string[];
  sample: Record<string, string>[];
  rowCount: number;
}

// ── Column role detection — mirrors showcase detectRole ───────────────────────

type ColRole = 'x' | 'y' | 'hbin' | 'sbin' | 'wafer' | 'lot' | 'site' | 'testname' | 'testvalue' | 'loLimit' | 'hiLimit' | 'units' | 'test' | 'metadata' | '';

const EXACT_ROLES: { role: ColRole; patterns: string[] }[] = [
  { role: 'x',         patterns: ['x','die_x','x_loc','xloc','col','column','step_x','stepx','diex','xstep','x_step','xcoord','x_coord','xpos','x_pos'] },
  { role: 'y',         patterns: ['y','die_y','y_loc','yloc','row','step_y','stepy','diey','ystep','y_step','ycoord','y_coord','ypos','y_pos'] },
  { role: 'hbin',      patterns: ['hbin','hard_bin','h_bin','hardbin','hb','hbn','bin','hard_bin_num','hbin_num'] },
  { role: 'sbin',      patterns: ['sbin','soft_bin','s_bin','softbin','sb','sbn','soft_bin_num','sbin_num'] },
  { role: 'wafer',     patterns: ['wafer','wafer_id','waferid','wafer_num','wafernum','wid','wafer_no','waferno','wfr','wfr_id','wnum'] },
  { role: 'lot',       patterns: ['lot','lot_id','lotid','lot_num','lotnum','lot_no','lotno'] },
  { role: 'site',      patterns: ['site','site_num','sitenum','site_no','siteno','site_id','siteid'] },
  { role: 'testname',  patterns: ['test_name','testname','param','parameter','param_name','measurement','test_item','test_num','tnum'] },
  { role: 'testvalue', patterns: ['result','value','val','measured','meas','reading','test_value','test_result','meas_value','meas_val'] },
  { role: 'loLimit',   patterns: ['lo_limit','low_limit','lolimit','lower_limit','ll','lsl','spec_lo','spec_low','min_limit','lo_lim'] },
  { role: 'hiLimit',   patterns: ['hi_limit','high_limit','hilimit','upper_limit','ul','usl','spec_hi','spec_high','max_limit','hi_lim'] },
  { role: 'units',     patterns: ['units','unit','uom','test_units','test_unit'] },
  { role: 'metadata',  patterns: [
    'testdate','test_date','date','temp','temperature','tst_temp',
    'operator','oper','testprogram','test_program','job_nam',
    'node','node_nam','tester','tstr_typ','part_typ','part_type','device',
    'handler','hand_typ','sublot','sblot_id',
    'exec_typ','exec_ver','serl_num','serial',
  ]},
];

const REGEX_ROLES: { role: ColRole; re: RegExp }[] = [
  { role: 'x',     re: /^(?:die[_\s-]?x|x[_\s-]?(?:pos(?:ition)?|loc(?:ation)?|coord|idx|index|step)|col(?:umn)?[_\s-]?(?:idx|index|num|pos)|step[_\s-]?x|chip[_\s-]?x)$/ },
  { role: 'y',     re: /^(?:die[_\s-]?y|y[_\s-]?(?:pos(?:ition)?|loc(?:ation)?|coord|idx|index|step)|row[_\s-]?(?:idx|index|num|pos)|step[_\s-]?y|chip[_\s-]?y)$/ },
  { role: 'hbin',  re: /^(?:hard[_\s-]?bin(?:[_\s-]?(?:num|no|number))?|h[_\s-]?bin(?:[_\s-]?(?:num|no))?|bin[_\s-]?(?:num|no|number|code|result)|bin(?:_?num)?)$/ },
  { role: 'sbin',    re: /^(?:soft[_\s-]?bin(?:[_\s-]?(?:num|no|number))?|s[_\s-]?bin(?:[_\s-]?(?:num|no))?)$/ },
  { role: 'wafer',   re: /^(?:wafer[_\s-]?(?:id|num|no|number|name|idx|index)?|wfr[_\s-]?(?:id|num|no)?|wid|w[_\s-]?num)$/ },
  { role: 'lot',     re: /^(?:lot[_\s-]?(?:id|num|no|number|name)?)$/ },
  { role: 'loLimit', re: /^(?:lo(?:w(?:er)?)?[_\s-]?(?:lim(?:it)?|spec|bound|thresh(?:old)?)|l[_\s-]?lim(?:it)?|min[_\s-]?(?:lim(?:it)?|spec)|spec[_\s-]?lo(?:w)?|lsl)$/ },
  { role: 'hiLimit', re: /^(?:hi(?:gh(?:er)?)?[_\s-]?(?:lim(?:it)?|spec|bound|thresh(?:old)?)|h[_\s-]?lim(?:it)?|max[_\s-]?(?:lim(?:it)?|spec)|spec[_\s-]?hi(?:gh)?|usl)$/ },
  { role: 'units',   re: /^(?:unit(?:s)?|u[_\s-]?o[_\s-]?m|test[_\s-]?unit(?:s)?|meas[_\s-]?unit(?:s)?)$/ },
  // Compound long-format identity/value columns the exact list above doesn't
  // enumerate — e.g. `test_val` (real-world fixture: correlated_long.csv) fell
  // through every EXACT_ROLES pattern (only `test_value`/`val`/`meas_val` etc.
  // are listed, not this compound) and the numeric fallback below then silently
  // classified it as a single WIDE-format "Test value" column. With
  // `testvalueCol` unset, the parser falls back to wide-format parsing of that
  // one bogus column — every other test in the file disappears with no error,
  // since nothing here was actually wrong, just unrecognized.
  { role: 'testname',  re: /^(?:test[_\s-]?name|param(?:eter)?(?:[_\s-]?name)?|test[_\s-]?item|test[_\s-]?num(?:ber)?|t[_\s-]?num)$/ },
  { role: 'testvalue', re: /^(?:test[_\s-]?(?:val(?:ue)?|result)|result[_\s-]?val(?:ue)?|meas(?:ured)?[_\s-]?(?:val(?:ue)?|result))$/ },
];

const STRUCTURAL_DISQUALIFIERS = new Set(['id','idx','index','count','total','num','number','no','diameter','radius','pitch','size','width','height','mm','um','nm','time','sec','ms','us','date','ts','timestamp']);
const NON_TEST_TOKENS = new Set(['index','idx','num','no','number','id','count','grid','rows','cols','size','width','height','bits','label','class','site','head','seq','order','rank','flag','code','type','ver','rev','mm','um','nm','sec','ms','us','ns','time','duration','elapsed','diameter','radius','pitch']);

export function tokenize(col: string): string[] {
  return col.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase().split(/[\s_\-./]+/).filter(Boolean);
}

export function detectRole(col: string, sample: Record<string, string>[]): ColRole {
  const key = col.toLowerCase().trim();
  for (const { role, patterns } of EXACT_ROLES) if (patterns.includes(key)) return role;
  for (const { role, re } of REGEX_ROLES) if (re.test(key)) return role;
  const t = tokenize(col);
  const noDisq = !t.some(s => STRUCTURAL_DISQUALIFIERS.has(s));
  if ((t.includes('x') || t.includes('col') || t.includes('column')) && !t.includes('y') && noDisq) return 'x';
  if ((t.includes('y') || t.includes('row')) && !t.includes('x') && noDisq) return 'y';
  if ((t.includes('hbin') || (t.includes('bin') && !t.includes('soft') && !t.includes('sbin'))) && noDisq) return 'hbin';
  if ((t.includes('sbin') || (t.includes('bin') && t.includes('soft'))) && noDisq) return 'sbin';
  if ((t.includes('wafer') || t.includes('wfr')) && !t.includes('lot') && noDisq) return 'wafer';
  if (t.includes('lot') && !t.includes('sublot') && noDisq) return 'lot';
  // Numeric → test; otherwise metadata
  const sampleVal = sample.find(r => r[col] !== '')?.[col] ?? '';
  const isNumeric = sampleVal !== '' && !isNaN(Number(sampleVal));
  return (isNumeric && !t.some(s => NON_TEST_TOKENS.has(s))) ? 'test' : 'metadata';
}

// ── localStorage persistence ──────────────────────────────────────────────────

const LS_KEY = 'tsmap:csv-mappings';

function fingerprintHeaders(headers: string[]): string {
  return [...headers].sort().join('\x00');
}

function loadSavedMapping(headers: string[]): Partial<CsvMapping> | null {
  try {
    const store = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}');
    return store[fingerprintHeaders(headers)] ?? null;
  } catch { return null; }
}

function saveMapping(headers: string[], mapping: CsvMapping) {
  try {
    const store = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}');
    store[fingerprintHeaders(headers)] = mapping;
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch { /* quota exceeded — silently skip */ }
}

/** Drop the remembered mapping for this header set, so the next load of the
 *  same file auto-detects again. Backs the overlay's "Reset to auto-detected"
 *  button — without it, resetting the on-screen roles would be undone the next
 *  time the file was opened, and there was no in-app route back to detection
 *  at all once a mapping had been saved. */
function forgetMapping(headers: string[]) {
  try {
    const store = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}');
    delete store[fingerprintHeaders(headers)];
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch { /* unavailable — nothing to forget */ }
}

// ── Role options (matches showcase) ──────────────────────────────────────────

const ROLE_OPTIONS: { value: ColRole; label: string }[] = [
  { value: 'x',         label: 'X position' },
  { value: 'y',         label: 'Y position' },
  { value: 'hbin',      label: 'Hard bin' },
  { value: 'sbin',      label: 'Soft bin' },
  { value: 'wafer',     label: 'Wafer ID' },
  { value: 'lot',       label: 'Lot ID' },
  { value: 'site',      label: 'Test site' },
  { value: 'test',      label: 'Test value' },
  { value: 'testname',  label: 'Test name (long format)' },
  { value: 'testvalue', label: 'Test result (long format)' },
  { value: 'loLimit',   label: 'Low limit (long format)' },
  { value: 'hiLimit',   label: 'High limit (long format)' },
  { value: 'units',     label: 'Units (long format)' },
  { value: 'metadata',  label: 'Display info' },
  { value: '',          label: '— ignore —' },
];

// ── Role assignment validation ───────────────────────────────────────────────

/**
 * Roles that can only ever be filled by ONE column, with the label the picker
 * shows for each. `test`, `metadata` and `''` are excluded — those are the
 * genuinely many-per-file roles.
 */
const SINGLE_VALUE_ROLES: ReadonlyArray<ColRole> =
  ['x', 'y', 'hbin', 'sbin', 'wafer', 'lot', 'site', 'testname', 'testvalue', 'loLimit', 'hiLimit', 'units'];

function roleLabel(role: ColRole): string {
  return ROLE_OPTIONS.find(o => o.value === role)?.label ?? role;
}

/**
 * Reject an assignment that puts two columns in the same single-valued role.
 *
 * `readMapping` fills those roles by plain overwrite in DOM order, so without
 * this the second column silently wins and the first is discarded with no
 * feedback — easy to do by accident in a wide file, and invisible afterwards
 * because the resulting wafer map looks perfectly plausible, just built from
 * the wrong column. Pure and exported so the rule is unit-testable without a
 * DOM.
 *
 * Returns a message naming every clash (not just the first), or null if valid.
 */
export function validateRoleAssignments(
  assignments: ReadonlyArray<{ col: string; role: ColRole }>,
): string | null {
  const byRole = new Map<ColRole, string[]>();
  for (const { col, role } of assignments) {
    if (!SINGLE_VALUE_ROLES.includes(role)) continue;
    const cols = byRole.get(role);
    if (cols) cols.push(col); else byRole.set(role, [col]);
  }
  const clashes = [...byRole].filter(([, cols]) => cols.length > 1);
  if (clashes.length === 0) return null;
  const parts = clashes.map(([role, cols]) => `“${roleLabel(role)}” on ${cols.join(', ')}`);
  return `Each of these roles takes a single column — ${parts.join('; ')}. Change all but one to “Test value” or “— ignore —”.`;
}

// ── Read mapping from the overlay DOM ────────────────────────────────────────

/** Every row's current column→role pairing, in DOM order. Shared by
 *  `readMapping` and `validateRoleAssignments` so the two can't drift. */
function readRoleAssignments(overlay: HTMLElement): Array<{ col: string; role: ColRole }> {
  return [...overlay.querySelectorAll<HTMLTableRowElement>('tr[data-col]')].map(tr => ({
    col: tr.dataset.col!,
    role: (tr.querySelector<HTMLSelectElement>('select')?.value ?? '') as ColRole,
  }));
}

function readMapping(overlay: HTMLElement, passBinInput: HTMLInputElement): CsvMapping {
  const rows = overlay.querySelectorAll<HTMLTableRowElement>('tr[data-col]');
  let x = '', y = '';
  let hbin: string | null = null, sbin: string | null = null;
  let wafer: string | null = null, lot: string | null = null, site: string | null = null;
  let testnameCol: string | null = null, testvalueCol: string | null = null;
  let loLimitCol: string | null = null, hiLimitCol: string | null = null, unitsCol: string | null = null;
  const tests: CsvTestCol[] = [];
  const meta: string[] = [];
  const splitBy: string[] = [];
  // Hashed from the column's own key (`col`), not its user-editable display
  // name — `col` is guaranteed unique per file (it's the real header text),
  // while two rows can end up with the same typed-in name. Deterministic and
  // order-independent: the same column gets the same number whether it's the
  // 3rd column or the 30th, so a saved test list / override survives a column
  // reorder or an added/removed column. `usedTestNumbers` guarantees no two
  // columns in this one mapping ever collide, however the hash lands.
  const usedTestNumbers = new Set<number>();

  for (const tr of rows) {
    const col = tr.dataset.col!;
    const role = (tr.querySelector<HTMLSelectElement>('select')?.value ?? '') as ColRole;
    if (role === 'x')         x = col;
    else if (role === 'y')    y = col;
    else if (role === 'hbin') hbin = col;
    else if (role === 'sbin') sbin = col;
    else if (role === 'wafer') wafer = col;
    else if (role === 'lot')   lot = col;
    else if (role === 'site')  site = col;
    else if (role === 'testname')  testnameCol = col;
    else if (role === 'testvalue') testvalueCol = col;
    else if (role === 'loLimit') loLimitCol = col;
    else if (role === 'hiLimit') hiLimitCol = col;
    else if (role === 'units')   unitsCol = col;
    else if (role === 'test') {
      const nameInput = tr.querySelector<HTMLInputElement>('input[type="text"]');
      const name = nameInput?.value.trim() || col;
      tests.push({ col, testNumber: stableTestNumber(col, usedTestNumbers), name });
    } else if (role === 'metadata') {
      meta.push(col);
      const splitCheck = tr.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (splitCheck?.checked) splitBy.push(col);
    }
  }

  const passBins = passBinInput.value
    .split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));

  return {
    x, y, hbin, sbin, wafer, lot, site, tests, meta, splitBy, testnameCol, testvalueCol,
    loLimitCol, hiLimitCol, unitsCol,
    passBins: passBins.length ? passBins : [1],
  };
}

// ── Long-format confirmation modal ────────────────────────────────────────────

function detectLongFormat(mapping: CsvMapping, sample: Record<string, string>[]): { nameCol: string; valueCol: string } | null {
  if (!mapping.testnameCol || !mapping.testvalueCol) return null;
  // Check if coordinates repeat in sample (indicates long format)
  const posSet = new Set(sample.map(r => `${r[mapping.x]},${r[mapping.y]}`));
  if (posSet.size >= sample.length && sample.length >= 5) return null; // every row unique
  return { nameCol: mapping.testnameCol, valueCol: mapping.testvalueCol };
}

function showLongFormatModal(): Promise<boolean> {
  return new Promise(resolve => {
    const modal = document.createElement('div');
    // The id, not just the class, is what the parent overlay's Escape guard
    // looks for — `.tsmap-modal-backdrop` is now shared with every openModal
    // dialog, so matching on the class alone would suppress the mapping
    // overlay's Escape whenever any app modal happened to be open.
    modal.id = 'tsmap-longformat-backdrop';
    modal.className = 'tsmap-modal-backdrop';
    modal.innerHTML = `
      <div class="tsmap-modal" role="dialog" aria-modal="true" aria-labelledby="lf-title">
        <h3 id="lf-title">Long-format CSV detected</h3>
        <p>Multiple rows share the same X/Y coordinates — this looks like long format (one row per test per die). Render will pivot to wide format automatically.</p>
        <div class="tsmap-modal-buttons">
          <button id="lf-cancel" class="btn-secondary">Cancel</button>
          <button id="lf-confirm" class="btn-primary">Render as long format</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const finish = (result: boolean) => {
      document.removeEventListener('keydown', onKeyDown);
      modal.remove();
      resolve(result);
    };
    // Escape closes only this sub-modal (cancel). stopPropagation keeps it from
    // also reaching the parent mapping overlay's Escape handler.
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
    }
    document.addEventListener('keydown', onKeyDown);

    modal.querySelector('#lf-cancel')!.addEventListener('click', () => finish(false));
    modal.querySelector('#lf-confirm')!.addEventListener('click', () => finish(true));
  });
}

// ── Main: build overlay ───────────────────────────────────────────────────────

export async function showMappingOverlay(
  result: HeadersResult,
  onConfirm: (mapping: CsvMapping) => void,
  onCancel: () => void,
): Promise<void> {
  const { headers, sample, rowCount } = result;
  const saved = loadSavedMapping(headers);

  const overlay = document.createElement('div');
  overlay.id = 'tsmap-mapping-overlay';

  // Detect initial roles — use saved mapping if available
  const detectedRoles: Record<string, ColRole> = {};
  for (const h of headers) {
    detectedRoles[h] = detectRole(h, sample);
  }

  // Build saved role map
  const savedRoles: Record<string, ColRole> = {};
  if (saved) {
    if (saved.x)    savedRoles[saved.x]    = 'x';
    if (saved.y)    savedRoles[saved.y]    = 'y';
    if (saved.hbin) savedRoles[saved.hbin] = 'hbin';
    if (saved.sbin) savedRoles[saved.sbin] = 'sbin';
    if (saved.wafer) savedRoles[saved.wafer] = 'wafer';
    if (saved.lot)   savedRoles[saved.lot]   = 'lot';
    if (saved.site)  savedRoles[saved.site]  = 'site';
    if (saved.testnameCol)  savedRoles[saved.testnameCol]  = 'testname';
    if (saved.testvalueCol) savedRoles[saved.testvalueCol] = 'testvalue';
    if (saved.loLimitCol) savedRoles[saved.loLimitCol] = 'loLimit';
    if (saved.hiLimitCol) savedRoles[saved.hiLimitCol] = 'hiLimit';
    if (saved.unitsCol)   savedRoles[saved.unitsCol]   = 'units';
    saved.tests?.forEach(t => { savedRoles[t.col] = 'test'; });
    saved.meta?.forEach(c  => { savedRoles[c] = 'metadata'; });
  }

  const effectiveRoles: Record<string, ColRole> = saved ? savedRoles : detectedRoles;

  // Build table rows
  let tableRows = '';
  for (const h of headers) {
    const role = effectiveRoles[h] ?? '';
    const savedTest = saved?.tests?.find(t => t.col === h);
    const testName = savedTest?.name ?? h;
    const uniqueVals = new Set(sample.map(r => r[h]).filter(v => v !== '')).size;
    const cardinalityHint = uniqueVals <= 1 ? '(same for all)' : `(${uniqueVals} values in sample)`;
    const isSavedSplitBy = saved?.splitBy?.includes(h) ?? false;

    const options = ROLE_OPTIONS.map(o =>
      `<option value="${o.value}"${o.value === role ? ' selected' : ''}>${o.label}</option>`
    ).join('');

    tableRows += `
      <tr data-col="${esc(h)}">
        <td class="col-name">${esc(h)}</td>
        <td class="col-arrow">→</td>
        <td><select>${options}</select></td>
        <td><input type="text" class="test-name-input" value="${esc(testName)}" placeholder="Test name"
             style="display:${role === 'test' ? 'inline-block' : 'none'}"></td>
        <td class="split-cell" style="visibility:${role === 'metadata' ? 'visible' : 'hidden'}">
          <label class="split-label" title="Subdivide this flat file into one wafer map per distinct value of this column. Use only when a single file packs several wafers together with no wafer-ID column. Not for parallel-test sites — map those to 'Test site' instead.">
            <input type="checkbox"${isSavedSplitBy ? ' checked' : ''}>
            <span>Subdivide file by this column</span>
            <span class="cardinality-hint">${cardinalityHint}</span>
          </label>
        </td>
      </tr>`;
  }

  const savedPassBins = saved?.passBins?.join(', ') ?? '1';

  overlay.innerHTML = `
    <div class="mapping-panel" role="dialog" aria-modal="true" aria-labelledby="mapping-title" tabindex="-1">
      <div class="mapping-header">
        <span class="mapping-title" id="mapping-title">Column mapping</span>
        <span class="mapping-file-info">${rowCount.toLocaleString()} rows · ${headers.length} columns</span>
      </div>
      <div class="mapping-tools">
        <input id="map-filter" type="search" placeholder="Filter columns…" aria-label="Filter columns by name">
        <button id="map-bulk-test" class="tool-btn" type="button">Shown → Test value</button>
        <button id="map-bulk-ignore" class="tool-btn" type="button">Shown → Ignore</button>
        <button id="map-redetect" class="tool-btn tool-sep" type="button">Reset to auto-detected</button>
        <span id="map-count" class="tool-count"></span>
      </div>
      <div class="mapping-scroll">
        <table class="mapping-table">
          <thead><tr>
            <th>Column</th><th></th><th>Role</th><th>Test name</th>
            <th>Subdivide file</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      <div class="mapping-footer">
        <button id="map-cancel" class="btn-secondary">Cancel</button>
        <div class="pass-bin-group">
          <label>Pass bin(s):</label>
          <input id="pass-bin-input" type="text" value="${savedPassBins}"
                 title="Comma-separated hard bin numbers counted as pass, e.g. 1 or 1,2">
          <span class="muted">(hard bins, comma-separated)</span>
        </div>
        <span id="map-validation" class="mapping-validation" role="alert"></span>
        <button id="map-render" class="btn-primary">Continue →</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  // NOTE: this overlay must NOT clear #map-container. It used to, on the
  // assumption it only ever ran before anything was rendered — but handleFiles()
  // is the shared path for "Open file" AND "Add files", so appending a CSV to an
  // existing gallery opened this overlay over a live map, wiped it, and left the
  // user on a permanently blank view if they then cancelled (the app still held
  // the wafers, so nothing re-rendered and no empty state appeared). It also
  // bypassed destroyMainView(), leaking wmap's controller and observers —
  // see WMAP_ISSUES.md #21. Clearing the view is handleFiles' own job, which it
  // does via showLoadingState() only AFTER the cancellable gates have resolved.
  overlay.querySelector<HTMLElement>('.mapping-panel')?.focus(); // focus the dialog for Esc/SR

  const rowEls = [...overlay.querySelectorAll<HTMLTableRowElement>('tr[data-col]')];
  // Declared here (not at its use site further down) because the role-change
  // handler below clears it — a `const` declared after this loop would be in the
  // temporal dead zone for anything that read it eagerly.
  const validationEl = overlay.querySelector<HTMLElement>('#map-validation')!;

  // Wire up role change → show/hide test name input and split checkbox
  for (const tr of rowEls) {
    const sel = tr.querySelector<HTMLSelectElement>('select')!;
    const nameInput = tr.querySelector<HTMLInputElement>('input[type="text"]')!;
    const splitCell = tr.querySelector<HTMLElement>('.split-cell')!;
    const splitCheck = tr.querySelector<HTMLInputElement>('input[type="checkbox"]')!;

    sel.addEventListener('change', () => {
      nameInput.style.display = sel.value === 'test' ? 'inline-block' : 'none';
      splitCell.style.visibility = sel.value === 'metadata' ? 'visible' : 'hidden';
      if (sel.value !== 'metadata') splitCheck.checked = false;
      validationEl.textContent = ''; // stale clash message — re-checked on Continue
    });
  }

  // ── Filter / bulk-assign / re-detect ───────────────────────────────────────
  // A wide CSV can carry 100+ columns; without these the only way to change a
  // hundred roles is a hundred dropdowns, and a saved mapping could never be
  // returned to auto-detection from inside the app at all.

  const filterInput = overlay.querySelector<HTMLInputElement>('#map-filter')!;
  const countEl = overlay.querySelector<HTMLElement>('#map-count')!;

  /** Rows currently passing the filter. Bulk actions apply to exactly these,
   *  so "Shown → …" always means what's on screen. */
  const shownRows = (): HTMLTableRowElement[] => rowEls.filter(tr => !tr.hidden);

  function applyFilter(): void {
    const q = filterInput.value.trim().toLowerCase();
    for (const tr of rowEls) tr.hidden = q !== '' && !tr.dataset.col!.toLowerCase().includes(q);
    const shown = shownRows().length;
    countEl.textContent = shown === rowEls.length
      ? `${rowEls.length} columns`
      : `${shown} of ${rowEls.length} columns`;
  }
  filterInput.addEventListener('input', applyFilter);
  applyFilter();

  /** Set every currently-shown row to `role`, firing the same `change` handler a
   *  manual edit would so the test-name/split cells stay in step. */
  function bulkAssign(role: ColRole): void {
    for (const tr of shownRows()) {
      const sel = tr.querySelector<HTMLSelectElement>('select')!;
      if (sel.value === role) continue;
      sel.value = role;
      sel.dispatchEvent(new Event('change'));
    }
  }
  overlay.querySelector('#map-bulk-test')!.addEventListener('click', () => bulkAssign('test'));
  overlay.querySelector('#map-bulk-ignore')!.addEventListener('click', () => bulkAssign(''));

  // Re-detect discards the saved mapping for this header set as well as the
  // on-screen state — otherwise the next load of the same file would silently
  // restore what the user just reset.
  overlay.querySelector('#map-redetect')!.addEventListener('click', () => {
    for (const tr of rowEls) {
      const sel = tr.querySelector<HTMLSelectElement>('select')!;
      sel.value = detectedRoles[tr.dataset.col!] ?? '';
      sel.dispatchEvent(new Event('change'));
    }
    forgetMapping(headers);
  });

  const passBinInput = overlay.querySelector<HTMLInputElement>('#pass-bin-input')!;

  const closeOverlay = () => {
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  };

  // Escape cancels the mapping overlay — same path as the Cancel button. Bail
  // while the long-format sub-modal is open (it has its own Escape handler); we
  // don't want Escape there to also tear down the parent mapping overlay.
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    if (document.getElementById('tsmap-longformat-backdrop')) return;
    closeOverlay();
    onCancel();
  }
  document.addEventListener('keydown', onKeyDown);

  overlay.querySelector('#map-cancel')!.addEventListener('click', () => {
    closeOverlay();
    onCancel();
  });

  overlay.querySelector('#map-render')!.addEventListener('click', async () => {
    // Duplicate single-valued roles must be caught BEFORE readMapping, which
    // resolves them by silent last-one-wins overwrite.
    const clash = validateRoleAssignments(readRoleAssignments(overlay));
    if (clash) {
      validationEl.textContent = clash;
      return;
    }

    const mapping = readMapping(overlay, passBinInput);

    if (!mapping.x || !mapping.y) {
      validationEl.textContent = 'Assign X and Y position columns before continuing.';
      return;
    }
    validationEl.textContent = '';

    // Long-format confirmation
    const longFmt = detectLongFormat(mapping, sample);
    if (longFmt) {
      const confirmed = await showLongFormatModal();
      if (!confirmed) return;
    }

    saveMapping(headers, mapping);
    closeOverlay();
    onConfirm(mapping);
  });
}
