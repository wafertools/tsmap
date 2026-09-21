#!/usr/bin/env python3
"""The test numbers every generated fixture uses.

One place, because six generators have to agree on it and two copies of a rule
is the bug. `fixture_paths.py` is the sibling module for *where* fixtures go;
this one is for what is *in* them.

WHY THE NUMBERS MATTER AT ALL
-----------------------------
A parsed die carries its readings as `testValues`, a plain JS object keyed by
test number. Integer-like keys are not hash keys to V8 — they are *array
indices* — so such an object asks for a contiguous elements backing store
rather than a dictionary. Measured in Chrome (2026-09-20), heap per die for 50
tests, varying only the test numbers:

    max test number      B/die
              49           968     dense — packed doubles, near the 8 B floor
           1,049         6,708     the peak of the curve
           1,549         2,192     V8 gives up on the array, uses a dictionary
          20,000         2,192     flat from here up...
       4.29e9 (U*4 max)  2,780     ...to the end of the STDF range

Cost rises with the *largest* test number until V8 abandons the contiguous
store, then goes flat. Small sequential numbers are cheapest; the band around
1,000 is 3x worse than anything above ~1,500.

WHY THIS IS A LATENT HAZARD AND NOT A LIVE BUG
----------------------------------------------
No real path reaches the bad band, and that is worth knowing before anyone
"optimises" it:

  * CSV/JSON test numbers are **hashed**, not sequential — `test_identity.rs`
    forces them to `>= RESERVED_BELOW` (1,000,000), and `testNumberForColumn`
    in `src/lib.ts` uses a literal only for a column named purely of digits.
    So the app's CSV path has always been in the flat regime.
  * STDF/ATDF carry the program's own `TEST_NUM` (U*4), and real programs
    number in the tens of thousands upward — also flat.

`test_identity.rs` moved off sequential numbering (1001, 1002, ...) for an
unrelated reason: stability across row order. It got the memory behaviour for
free. **Anything that reintroduces small sequential test numbers reintroduces
the cost** — that is the thing this note exists to prevent.

WHAT THE GENERATORS WERE DOING, PRECISELY
-----------------------------------------
They picked `1000 + i`. For CSV/ATDF that fed the *column names* (`t1000`...),
which the app hashes anyway, so it never reached the app. What it did reach was
**benchmark harnesses that hand-write a mapping** with `testNumber: 1000 + i`
— and those sat on the peak of the curve while nothing in production did. A
400k x 50 CSV crashes the tab under that mapping and loads in 856 MB with
realistic numbering.

So this default buys **realism in benchmarks**, nothing more. It is not a fix
for `WEB_DIE_BUDGET`: that limit is set by the 266k-die STDF case, which
carries `testPass` as a second container per die and is unaffected by any of
this.

KEEPING THE PATHOLOGICAL CASE REACHABLE
---------------------------------------
The bad band must stay generatable, or the hazard above has nothing to test
against. Set `WAFERTOOLS_TESTNUM_BASE=1000` and `WAFERTOOLS_TESTNUM_STEP=1` to
reproduce the pre-2026-09-20 fixtures exactly.
"""

import os

__all__ = ['test_numbers', 'DEFAULT_BASE', 'DEFAULT_STEP']

# 20,000 is in the flat regime and matches how real programs number their
# blocks. The step leaves room for sub-tests, which real programs also do —
# and it deliberately makes the numbers non-contiguous, so nothing downstream
# can quietly assume `testNumber - base` is a dense index.
DEFAULT_BASE = 20_000
DEFAULT_STEP = 10


def test_numbers(n: int, base: int | None = None, step: int | None = None) -> list[int]:
    """`n` test numbers, realistically spaced.

    Override per-run with $WAFERTOOLS_TESTNUM_BASE / $WAFERTOOLS_TESTNUM_STEP —
    set base=1000, step=1 to regenerate the pre-2026-09-20 fixtures.
    """
    if base is None:
        base = int(os.environ.get('WAFERTOOLS_TESTNUM_BASE', DEFAULT_BASE))
    if step is None:
        step = int(os.environ.get('WAFERTOOLS_TESTNUM_STEP', DEFAULT_STEP))
    return [base + i * step for i in range(n)]


if __name__ == '__main__':
    nums = test_numbers(50)
    print(f'{len(nums)} tests: {nums[0]} .. {nums[-1]}  (step {nums[1] - nums[0]})')
