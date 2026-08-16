// UI for multi-file loading: rename step + append confirmation with mismatch warnings.

import type { ParsedFile, WaferData, WaferSource } from './types';
import { makeWaferSource, escapeHtml as esc } from './lib';
import { openModal } from './modal';
import { hasPosition } from '@wafertools/wafermap';

// ── Rename overlay ────────────────────────────────────────────────────────────

export interface FileWaferEntry {
  filePath: string;
  fileName: string;
  parsed: ParsedFile;
}

export interface RenamedWafer {
  waferId: string;
  results: WaferData['results'];
  partCount?: number;
  goodCount?: number;
  failCount?: number;
  /** Per-wafer metadata (WIR/WRR fields) — carried through so facets work. */
  fields?: WaferData['fields'];
  /**
   * Provenance of this wafer, carried through the rename overlay so it survives
   * into the merge. Wafers from the same source file share one instance by
   * reference (see `makeWaferSource`/stamping in main.ts).
   */
  source?: WaferSource;
}

export interface RenameRow {
  defaultId: string;
  fileLabel: string;
  wafer: WaferData;
  source: WaferSource;
}

/**
 * Build one row per wafer across all entries, assigning ONE `WaferSource` per
 * entry shared by reference across that entry's wafers — so downstream grouping
 * can key on referential identity and a metadata edit is a single write. Pure
 * (no DOM) so the sharing guarantee is unit-testable.
 */
export function buildRenameRows(entries: FileWaferEntry[]): RenameRow[] {
  const rows: RenameRow[] = [];
  for (const entry of entries) {
    const source = makeWaferSource(entry.parsed.meta, entry.fileName);
    const lotId = entry.parsed.meta.fields.find(f => f.key === 'lotId')?.value;
    for (const wafer of entry.parsed.wafers) {
      const defaultId = resolveWaferId(wafer.waferId, entry.fileName, lotId);
      rows.push({ defaultId, fileLabel: entry.fileName, wafer, source });
    }
  }
  return rows;
}

/**
 * Show a rename overlay listing one editable wafer ID row per parsed file.
 * Files that produced multiple wafers show one row per wafer.
 * Returns the flat list of renamed wafers to add to the gallery.
 */
export function showRenameOverlay(
  entries: FileWaferEntry[],
  onConfirm: (wafers: RenamedWafer[]) => void,
  onCancel: () => void,
): void {
  const overlay = document.createElement('div');
  overlay.id = 'tsmap-rename-overlay';

  const rows = buildRenameRows(entries);

  const tableRows = rows.map((row, i) => `
    <tr>
      <td class="rename-file">${esc(row.fileLabel)}</td>
      <td class="rename-arrow">→</td>
      <td><input type="text" class="rename-input" data-idx="${i}" value="${esc(row.defaultId)}"></td>
      <td class="rename-count">${row.wafer.results.length.toLocaleString()} dies</td>
    </tr>`).join('');

  overlay.innerHTML = `
    <div class="mapping-panel" role="dialog" aria-modal="true" aria-labelledby="rename-title" tabindex="-1">
      <div class="mapping-header">
        <span class="mapping-title" id="rename-title">Wafer labels</span>
        <span class="mapping-file-info">${rows.length} wafer${rows.length !== 1 ? 's' : ''} from ${entries.length} file${entries.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="mapping-scroll">
        <table class="mapping-table">
          <thead><tr><th>Source file</th><th></th><th>Wafer label</th><th>Dies</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      <div class="mapping-footer">
        <button id="rename-cancel" class="btn-secondary">Cancel</button>
        <button id="rename-confirm" class="btn-primary">Continue →</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const closeOverlay = () => {
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
  };

  const cancel = () => { closeOverlay(); onCancel(); };

  const confirm = () => {
    const inputs = overlay.querySelectorAll<HTMLInputElement>('.rename-input');
    const renamed: RenamedWafer[] = rows.map((row, i) => ({
      waferId: inputs[i].value.trim() || row.defaultId,
      results: row.wafer.results,
      partCount: row.wafer.partCount,
      goodCount: row.wafer.goodCount,
      failCount: row.wafer.failCount,
      fields: row.wafer.fields,
      source: row.source,
    }));
    closeOverlay();
    onConfirm(renamed);
  };

  // Keyboard parity with every other overlay in the app. This one had none:
  // Escape did nothing and Enter did nothing, so a full-screen form whose only
  // exit was a mouse click. Enter commits (the natural gesture after typing the
  // last label) and Escape cancels, matching the mapping overlay and the test
  // selector, which both route Escape through their own cancel path.
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirm(); }
  }
  document.addEventListener('keydown', onKeyDown);

  overlay.querySelector('#rename-cancel')!.addEventListener('click', cancel);
  overlay.querySelector('#rename-confirm')!.addEventListener('click', confirm);

  // Focus the first label so the form is immediately typeable and Escape has
  // somewhere to land, rather than leaving focus on whatever was behind.
  overlay.querySelector<HTMLInputElement>('.rename-input')?.focus();
}

/**
 * Resolve a display wafer ID, preferring metadata in the data over the filename.
 * Precedence:
 *   1. A non-generic wafer ID from the data (e.g. `LOT123-W05`) — use as-is.
 *   2. A generic wafer ID (`W01`) plus a lot ID — combine: `<lotId> · W01`. This
 *      keeps wafers distinct within and across lots without touching the
 *      filename, even for multi-wafer files where every wafer shares the lot.
 *   3. Neither — fall back to the filename stem (the genuinely metadata-less
 *      case, e.g. a bare CSV with no lot/wafer columns).
 */
export function resolveWaferId(contentId: string, fileName: string, lotId?: string): string {
  const generic = /^W\d+$/.test(contentId); // W1, W01, W12 etc.
  if (!generic) return contentId;
  if (lotId && lotId.trim()) return `${lotId} · ${contentId}`;
  const stem = fileName.replace(/\.[^.]+$/, '');
  return stem || contentId;
}

// ── Append confirmation ───────────────────────────────────────────────────────

export interface AppendWarning {
  level: 'warn' | 'info';
  message: string;
}

export interface AppendConfirmParams {
  incoming: RenamedWafer[];
  existing: WaferData[];
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirm appending wafers to an existing gallery, surfacing any structural
 * mismatches first.
 *
 * Goes through the shared `openModal` rather than hand-rolling a backdrop — the
 * previous version was a near-copy of it that had drifted: no Escape, no
 * backdrop-click-to-close, no `role="dialog"`/`aria-modal`, no scroll lock and
 * no focus handling, all of which openModal provides. It's sized to its content
 * and its own footer carries the actions, so the header keeps only the close
 * button's job (which openModal treats as a cancel, consistent with Escape).
 */
export function showAppendConfirm({ incoming, existing, onConfirm, onCancel }: AppendConfirmParams): void {
  const warnings = detectMismatches(incoming, existing);
  const hasWarn = warnings.some(w => w.level === 'warn');

  // Guards against onCancel firing after a confirm: openModal's onClose runs on
  // every close path including the one the confirm button itself triggers.
  let settled = false;

  const warningHtml = warnings.length > 0
    ? `<div class="append-warnings">${warnings.map(w =>
        `<div class="append-warning append-${w.level}">
          <span class="warn-icon">${w.level === 'warn' ? '⚠' : 'ℹ'}</span>
          <span>${esc(w.message)}</span>
        </div>`).join('')}</div>`
    : `<div class="append-ok">No structural mismatches detected.</div>`;

  const handle = openModal({
    title: `Add ${incoming.length} wafer${incoming.length !== 1 ? 's' : ''} to gallery`,
    sizing: 'content',
    contentSize: { width: 'min(92vw, 460px)', height: 'auto' },
    bodyOverflow: 'auto',
    // Escape, the header X and a backdrop click all land here — every one of
    // them means "don't append", the same as the Cancel button.
    onClose: () => { if (!settled) { settled = true; onCancel(); } },
    mount(body) {
      body.innerHTML = `
        <div class="tsmap-modal append-modal">
          <p class="append-summary">
            Current gallery: <strong>${existing.length}</strong> wafer${existing.length !== 1 ? 's' : ''} &nbsp;+&nbsp;
            Adding: <strong>${incoming.length}</strong> wafer${incoming.length !== 1 ? 's' : ''}
            &nbsp;=&nbsp; <strong>${existing.length + incoming.length}</strong> total
          </p>
          ${warningHtml}
          <div class="tsmap-modal-buttons">
            <button id="append-cancel" class="btn-secondary" type="button">Cancel</button>
            <button id="append-confirm" class="btn-primary${hasWarn ? ' btn-warn' : ''}" type="button">
              ${hasWarn ? 'Add anyway' : 'Add to gallery'}
            </button>
          </div>
        </div>`;

      body.querySelector('#append-cancel')!.addEventListener('click', () => handle.close());
      body.querySelector('#append-confirm')!.addEventListener('click', () => {
        settled = true;          // set before close() so onClose won't also cancel
        handle.close();
        onConfirm();
      });
      // The append is the affirmative action the user came here for, but when
      // there are warnings the safe default should be under the cursor/keyboard
      // first — focus Cancel in that case, Confirm otherwise.
      body.querySelector<HTMLButtonElement>(hasWarn ? '#append-cancel' : '#append-confirm')?.focus();
    },
  });
}

export function detectMismatches(incoming: RenamedWafer[], existing: WaferData[]): AppendWarning[] {
  const warnings: AppendWarning[] = [];
  if (existing.length === 0) return warnings;

  const existingCounts = existing.map(w => w.results.length);
  const incomingCounts = incoming.map(w => w.results.length);
  const existingMean = mean(existingCounts);
  const incomingMean = mean(incomingCounts);

  // Die count mismatch — flag if means differ by more than 5%
  if (Math.abs(existingMean - incomingMean) / Math.max(existingMean, incomingMean) > 0.05) {
    warnings.push({
      level: 'warn',
      message: `Die count differs — existing wafers average ${Math.round(existingMean)} dies, incoming average ${Math.round(incomingMean)} dies`,
    });
  }

  // Coordinate range mismatch — proxy for different die size / wafer geometry.
  // Both axes are checked: the message says "grid size", and a lot whose rows
  // match but whose columns don't (or vice versa) is exactly the mismatch worth
  // catching. Previously only X was compared, so a differing Y span passed
  // silently under a warning that claimed to cover the grid.
  // Spatial-only heuristic — coordinate-less dies have no grid position to
  // compare, so they're excluded rather than producing a bogus 0-span.
  const existingRange = coordRange(existing.flatMap(w => w.results).filter(hasPosition));
  const incomingRange = coordRange(incoming.flatMap(w => w.results).filter(hasPosition));
  if (existingRange && incomingRange) {
    const differing: string[] = [];
    const xSpanExist = existingRange.maxX - existingRange.minX;
    const xSpanNew   = incomingRange.maxX - incomingRange.minX;
    const ySpanExist = existingRange.maxY - existingRange.minY;
    const ySpanNew   = incomingRange.maxY - incomingRange.minY;
    if (Math.abs(xSpanExist - xSpanNew) > 4) { // more than 4 die-steps difference
      differing.push(`existing spans ${xSpanExist} columns, incoming ${xSpanNew}`);
    }
    if (Math.abs(ySpanExist - ySpanNew) > 4) {
      differing.push(`existing spans ${ySpanExist} rows, incoming ${ySpanNew}`);
    }
    if (differing.length > 0) {
      warnings.push({ level: 'warn', message: `Wafer grid size differs — ${differing.join('; ')}` });
    }
  }

  // Hard bin set mismatch. `hbin` is optional on DieResult — a CSV mapped
  // without a hard-bin column yields undefined for every die, which used to
  // land in the set and then print literally as "undefined" in the message.
  // Dies with no bin carry no information about the bin sets, so drop them.
  const binSet = (dies: { hbin?: number }[]) =>
    new Set(dies.map(d => d.hbin).filter((b): b is number => b !== undefined));
  const existingBins = binSet(existing.flatMap(w => w.results));
  const incomingBins = binSet(incoming.flatMap(w => w.results));
  const onlyInExisting = [...existingBins].filter(b => !incomingBins.has(b)).sort((a, b) => a - b);
  const onlyInIncoming = [...incomingBins].filter(b => !existingBins.has(b)).sort((a, b) => a - b);
  if (onlyInExisting.length > 0 || onlyInIncoming.length > 0) {
    warnings.push({
      level: 'warn',
      message: `Hard bin sets differ — bins only in existing: [${onlyInExisting.join(', ') || 'none'}], only in new: [${onlyInIncoming.join(', ') || 'none'}]`,
    });
  }

  // Duplicate wafer IDs
  const existingIds = new Set(existing.map(w => w.waferId));
  const dupes = incoming.map(w => w.waferId).filter(id => existingIds.has(id));
  if (dupes.length > 0) {
    warnings.push({
      level: 'warn',
      message: `Duplicate wafer ID${dupes.length > 1 ? 's' : ''}: ${dupes.join(', ')} — already in gallery`,
    });
  }

  return warnings;
}

function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function coordRange(results: { x: number; y: number }[]) {
  if (!results.length) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { x, y } of results) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}
