#!/usr/bin/env python3
"""Generate sample_data/COORDLESS-LOT-01.atdf: one wafer of eight dies, six positioned and two with a blank PRR X/Y ("no position
reported"), the ATDF counterpart of the coordinate-less wafers in COORDLESS-LOT-01.stdf. Small enough to read by eye: the parser's
tests pin its shape (6 positioned dies, 2 without, every die kept with its bin and value).

Built with the spec-conformant record builders (atdf_spec.py); `scripts/validate_stdf_atdf.py` checks it.

Usage:
  python3 scripts/generate_atdf_coordless_mixed.py [output]     (default sample_data/COORDLESS-LOT-01.atdf)
"""
import sys
from pathlib import Path

import atdf_spec as A

# (x, y, hard bin); x and y None is a die with no reported position.
DIES = [(0, 0, 1), (1, 0, 1), (-1, 0, 1), (0, 1, 1), (0, -1, 1), (1, 1, 1), (None, None, 2), (None, None, 1)]


def generate(out: Path) -> None:
    lines = [A.far(), A.mir('LOT-COORDLESS-01', 'WIDGET', 'JOB1', 'NODE1', 'TSTR-A', sblot_id='SUBLOT-1'), A.sdr(1, 1, [1]),
             A.wir(1, 'W01', site_grp=1)]
    good = 0
    for part_id, (x, y, hbin) in enumerate(DIES, start=1):
        passed = hbin == 1
        good += passed
        lines += [A.pir(1, 1),
                  # Limit Compare L: the low-limit comparison was >=, so a value equal to the low limit passes.
                  A.ptr(1001, 1, 1, 2.5, True, 'leakage_nA', 0.0, 5.0, 'nA', first=True, compare='L'),
                  A.prr(1, 1, x, y, hbin, hbin, part_id, passed, num_tests=1)]
    lines += [A.wrr(1, 'W01', len(DIES), good, site_grp=1), A.hbr(1, good, 'P', 'Pass'), A.hbr(2, len(DIES) - good, 'F', 'Fail'),
              A.file_end(len(DIES), good)]
    out.write_text(''.join(lines))
    print(f'Written {out} — {len(DIES)} dies, {sum(1 for d in DIES if d[0] is None)} without a position')


if __name__ == '__main__':
    generate(Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent.parent / 'sample_data' / 'COORDLESS-LOT-01.atdf')
