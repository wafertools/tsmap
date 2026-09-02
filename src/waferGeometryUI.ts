// Small modal for setting wmap's wafer diameter and edge-exclusion band width
// (both mm) — single values applied to every wafer currently loaded, unlike
// the Splits dialog's per-wafer assignment. Persistence and the
// diameter-gates-exclusion rule live in waferGeometry.ts; this module only
// owns the dialog.

import { openModal } from './modal';
import { normalizeWaferGeometry, type WaferGeometry } from './waferGeometry';

// Three-tier hint, in order of trust: a WCR (Wafer Configuration Record)
// value read straight from the file's own metadata is real data, not a
// guess, so it carries no confidence figure; wmap's own geometric inference
// only applies when it actually resolved real physical units (`'mm'` —
// otherwise the "diameter" it computed is a dimensionless grid-step count,
// not millimetres, and must never be shown as one); `'none'` covers both "no
// WCR" and "wmap has nothing to go on but grid-step positions."
export type InferredDiameterHint =
  | { source: 'wcr'; diameter: number }
  | { source: 'inferred'; diameter: number; confidencePercent: number }
  | { source: 'none' };

export function showWaferGeometryDialog(
  current: WaferGeometry,
  inferredHint: InferredDiameterHint,
  onApply: (geometry: WaferGeometry) => void,
): void {
  const fieldInputCss = [
    'padding:6px 8px;border:1px solid var(--border-mid);border-radius:var(--radius-control)',
    'background:var(--bg-input);color:var(--text-secondary);font-size:12px',
  ].join(';');

  const modalHandle = openModal({
    title: 'Diameter & edge exclusion',
    sizing: 'content',
    contentSize: { width: 'min(90vw, 440px)', height: 'auto' },
    mount(body) {
      body.style.cssText += 'padding:16px;gap:12px;font-size:12px;color:var(--text-light)';

      // ── Diameter ──────────────────────────────────────────────────────────
      const diameterLabel = document.createElement('label');
      diameterLabel.style.cssText = 'display:flex;flex-direction:column;gap:4px';
      const diameterLabelText = document.createElement('span');
      diameterLabelText.textContent = 'Wafer diameter (mm)';
      diameterLabelText.style.cssText = 'font-size:12px;color:var(--text-dim)';

      const diameterInput = document.createElement('input');
      diameterInput.type = 'number';
      diameterInput.min = '0';
      diameterInput.step = '1';
      diameterInput.placeholder = 'e.g. 300';
      if (current.diameterMm !== undefined) {
        diameterInput.value = String(current.diameterMm);
      } else if (inferredHint.source !== 'none') {
        diameterInput.value = String(inferredHint.diameter);
      }
      diameterInput.style.cssText = fieldInputCss;

      diameterLabel.append(diameterLabelText, diameterInput);

      // Informational only — never blocks Apply. Explains a pre-fill when
      // nothing is pinned yet, flags a stale pin that disagrees with what
      // this file/wmap now say (e.g. a different lot loaded since the
      // diameter was last set), or explains why there's nothing to pre-fill
      // at all (no WCR record, and wmap has only dimensionless grid-step
      // positions to go on — never presented as if it were millimetres).
      const diameterHintText = document.createElement('div');
      diameterHintText.style.cssText = 'font-size:12px;min-height:16px';
      if (current.diameterMm === undefined) {
        if (inferredHint.source === 'wcr') {
          diameterHintText.style.color = 'var(--text-dim)';
          diameterHintText.textContent = `From this file's WCR record: ${inferredHint.diameter} mm.`;
        } else if (inferredHint.source === 'inferred') {
          diameterHintText.style.color = 'var(--text-dim)';
          diameterHintText.textContent =
            `wmap's current estimate for this wafer: ${inferredHint.diameter} mm (confidence ${inferredHint.confidencePercent}%)`;
        } else {
          diameterHintText.style.color = 'var(--warn-text)';
          diameterHintText.textContent =
            "wmap has no physical size information for this data (no die size or wafer diameter recorded) — enter your process's actual wafer diameter.";
        }
      } else if (inferredHint.source !== 'none' && Math.abs(inferredHint.diameter - current.diameterMm) > 0.5) {
        diameterHintText.style.color = 'var(--warn-text)';
        diameterHintText.textContent = inferredHint.source === 'wcr'
          ? `This file's WCR record specifies ${inferredHint.diameter} mm — confirm this is still the right lot.`
          : `wmap's own estimate for this wafer is now ~${inferredHint.diameter} mm — confirm this is still the right lot.`;
      }

      // ── Edge exclusion ────────────────────────────────────────────────────
      const exclusionLabel = document.createElement('label');
      exclusionLabel.style.cssText = 'display:flex;flex-direction:column;gap:4px';
      const exclusionLabelText = document.createElement('span');
      exclusionLabelText.textContent = 'Edge exclusion width (mm)';
      exclusionLabelText.style.cssText = 'font-size:12px;color:var(--text-dim)';

      const exclusionInput = document.createElement('input');
      exclusionInput.type = 'number';
      exclusionInput.min = '0';
      exclusionInput.step = '0.1';
      exclusionInput.placeholder = 'e.g. 3';
      if (current.edgeExclusionMm !== undefined) exclusionInput.value = String(current.edgeExclusionMm);
      exclusionInput.style.cssText = fieldInputCss;

      exclusionLabel.append(exclusionLabelText, exclusionInput);

      const exclusionHintText = document.createElement('div');
      exclusionHintText.style.cssText = 'font-size:12px;color:var(--text-dim);min-height:16px';
      exclusionHintText.textContent =
        'Dies within this distance of the wafer edge are excluded from yield and shown dimmed on the map.';

      // Diameter gates exclusion — an absolute mm value is only meaningful
      // relative to a confirmed diameter (WMAP_ISSUES.md #42). Enforced live,
      // not just on Apply, so the constraint is visible while typing. One
      // shared parse, used by both updateExclusionEnabled (live) and
      // readValidated (Apply) — these used to be two independent
      // re-derivations of the same "is this a positive number" rule, which
      // could silently drift apart (e.g. a future upper bound added to one
      // and not the other) since nothing enforced they stayed in sync.
      type DiameterFieldResult = { kind: 'blank' } | { kind: 'valid'; value: number } | { kind: 'invalid' };
      function parseDiameterField(): DiameterFieldResult {
        const raw = diameterInput.value.trim();
        if (raw === '') return { kind: 'blank' };
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? { kind: 'valid', value: n } : { kind: 'invalid' };
      }
      function updateExclusionEnabled(): void {
        const enabled = parseDiameterField().kind === 'valid';
        exclusionInput.disabled = !enabled;
        exclusionInput.style.opacity = enabled ? '' : '0.5';
        exclusionHintText.textContent = enabled
          ? 'Dies within this distance of the wafer edge are excluded from yield and shown dimmed on the map.'
          : 'Set a diameter first.';
      }
      diameterInput.addEventListener('input', updateExclusionEnabled);
      updateExclusionEnabled();

      const errorText = document.createElement('div');
      errorText.style.cssText = 'font-size:12px;color:var(--error-text);min-height:16px';
      // Announced, like mappingUI's own validation line. Without this the
      // message is visible-only: Apply appears to do nothing to a screen
      // reader, since focus never moves and nothing is spoken.
      errorText.setAttribute('role', 'alert');

      function readValidated():
        | { ok: true; diameterMm: number | undefined; edgeExclusionMm: number | undefined }
        | { ok: false } {
        const parsedDiameter = parseDiameterField();
        if (parsedDiameter.kind === 'invalid') {
          errorText.textContent = "Enter a positive diameter, or leave blank to use wmap's automatic estimate.";
          return { ok: false };
        }
        const diameterMm = parsedDiameter.kind === 'valid' ? parsedDiameter.value : undefined;
        let edgeExclusionMm: number | undefined;
        const rawE = exclusionInput.value.trim();
        if (diameterMm === undefined || rawE === '') {
          edgeExclusionMm = undefined;
        } else {
          const n = Number(rawE);
          if (!Number.isFinite(n) || n < 0) {
            errorText.textContent = 'Enter a non-negative exclusion width, or leave blank to turn exclusion off.';
            return { ok: false };
          }
          edgeExclusionMm = n;
        }
        errorText.textContent = '';
        return { ok: true, diameterMm, edgeExclusionMm };
      }

      const doApply = () => {
        const result = readValidated();
        if (!result.ok) return;
        onApply(normalizeWaferGeometry(result.diameterMm, result.edgeExclusionMm));
        modalHandle.close();
      };
      for (const input of [diameterInput, exclusionInput]) {
        input.addEventListener('keydown', (evt) => {
          if (evt.key !== 'Enter') return;
          evt.preventDefault();
          doApply();
        });
      }

      const buttonRow = document.createElement('div');
      buttonRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px';

      const clearBtn = document.createElement('button');
      clearBtn.textContent = 'Clear';
      clearBtn.className = 'btn-secondary';
      clearBtn.addEventListener('mouseenter', () => { clearBtn.style.borderColor = 'var(--error-text)'; clearBtn.style.color = 'var(--error-text)'; });
      clearBtn.addEventListener('mouseleave', () => { clearBtn.style.borderColor = 'var(--border-mid)'; clearBtn.style.color = 'var(--text-secondary)'; });
      clearBtn.addEventListener('click', () => {
        // Clears both together — leaving a pinned exclusion behind after
        // diameter reverts to auto-inferred would reopen WMAP_ISSUES.md #42.
        onApply({ diameterMm: undefined, edgeExclusionMm: undefined });
        modalHandle.close();
      });

      const rightGroup = document.createElement('div');
      rightGroup.style.cssText = 'display:flex;gap:8px';

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.className = 'btn-secondary';
      cancelBtn.addEventListener('click', () => modalHandle.close());

      const applyBtn = document.createElement('button');
      applyBtn.textContent = 'Apply';
      applyBtn.className = 'btn-primary';
      applyBtn.addEventListener('click', doApply);

      rightGroup.append(cancelBtn, applyBtn);
      buttonRow.append(clearBtn, rightGroup);

      body.append(diameterLabel, diameterHintText, exclusionLabel, exclusionHintText, errorText, buttonRow);
      diameterInput.focus();
      diameterInput.select();
    },
  });
}
