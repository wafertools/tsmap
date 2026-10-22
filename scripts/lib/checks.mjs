/**
 * Beat checks, shared by the scenario runner (scripts/run-scenario.mjs) and the
 * training screenshot runner (scripts/training-shots.mjs).
 *
 * A check is `{ name, describe, get(page), expect(actual) }`. `get` may read or
 * drive the live page; `expect` is a predicate on what it returned. A throw in
 * either counts as a failure and is reported, never swallowed.
 */
export async function runChecks(page, checks) {
  const results = [];
  for (const check of checks) {
    let actual, error;
    try {
      actual = await check.get(page);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const passed = error === undefined && (() => {
      try { return !!check.expect(actual); } catch (e) { error = e instanceof Error ? e.message : String(e); return false; }
    })();
    results.push({ name: check.name, describe: check.describe, passed, actual, error });
  }
  return results;
}

/** A check that passes when exactly one element matches `selector` and it is visible. */
export function isVisible(selector, describe = `${selector} is visible`) {
  return {
    name: `visible ${selector}`,
    describe,
    get: async (page) => {
      const loc = page.locator(selector);
      const n = await loc.count();
      return { n, visible: n === 1 && await loc.isVisible() };
    },
    expect: (v) => v.visible,
  };
}

/** A check that passes when the one element matching `selector` contains `text`. */
export function hasText(selector, text, describe = `${selector} contains "${text}"`) {
  return {
    name: `text ${selector}`,
    describe,
    get: (page) => page.locator(selector).innerText({ timeout: 5000 }),
    expect: (t) => typeof t === 'string' && t.includes(text),
  };
}
