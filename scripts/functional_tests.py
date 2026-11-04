"""The functional (FTR) tests every sample lot carries after its scan chain.

A lot with one functional test shows nothing for the functional pass-rate and "Fails together" charts to rank, so each
generator draws these as well. They come from a stream of their own, so the parametric values a generator has always
produced do not move, and a die that fails one of them fails the die, like any other test.
"""

import random

# (test number offset from the generator's scan-chain number, name, base fail probability)
EXTRA_FTR = [(1, 'bist_mem', 0.004), (2, 'io_loopback', 0.002), (3, 'pll_lock', 0.002), (4, 'jtag_idcode', 0.0005)]
EDGE_FACTOR = 4.0   # an edge die fails these this many times as often


class ExtraFtr:
    def __init__(self, scan_chain_num: int, seed: int = 31):
        self.base = scan_chain_num
        self.rng = random.Random(seed)

    def draw(self, edge: bool = False):
        """(test number, name, passed) for each extra functional test on one die."""
        for off, name, p in EXTRA_FTR:
            yield self.base + off, name, self.rng.random() >= p * (EDGE_FACTOR if edge else 1.0)
