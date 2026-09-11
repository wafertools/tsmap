// A row of mutually exclusive toggle buttons — the "segmented options" shape of
// UI_STANDARDS.md's `toggle` (bordered, tinted when on: `.btn-secondary.is-on`
// in index.html). Each button carries `aria-pressed`, and the row is a named
// `role="group"` so a screen reader announces what the choice is about.
//
// Shared rather than restated: the test selector's type filter (All /
// Parametric / Functional) was the only copy until the file filter's format
// buttons needed the same thing.

export interface ToggleOption<T extends string> {
  value: T;
  label: string;
}

export interface ToggleGroup<T extends string> {
  el: HTMLDivElement;
  /** Show `value` as the pressed button without calling `onChange` — for
   *  reflecting a state set elsewhere. A value matching no option leaves
   *  every button unpressed (e.g. a filter no single option describes). */
  setActive(value: T | null): void;
}

export function buildToggleGroup<T extends string>(opts: {
  options: ToggleOption<T>[];
  active: T | null;
  ariaLabel: string;
  onChange: (value: T) => void;
}): ToggleGroup<T> {
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', opts.ariaLabel);

  const buttons = opts.options.map(({ value, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-secondary';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      setActive(value);
      opts.onChange(value);
    });
    el.appendChild(btn);
    return { value, btn };
  });

  function setActive(active: T | null): void {
    for (const { value, btn } of buttons) {
      const on = value === active;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', String(on));
    }
  }
  // Marked up front: a group that opens with nothing shown as selected reads
  // as having no state (the test selector's filter row once did exactly that).
  setActive(opts.active);

  return { el, setActive };
}
