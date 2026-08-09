//! Deterministic, collision-safe test numbers for formats that have no real
//! test number of their own (CSV/JSON long-format — test identity comes from
//! a value in the data, not a fixed column). STDF/ATDF never use this: their
//! test numbers are real, parsed from the file, and untouched here.
//!
//! Numbers used to be assigned by simple encounter order (1001, 1002, …),
//! which meant re-parsing the same logical test set in a different row order
//! — a re-exported file, a reordered upstream dataset — silently renumbered
//! every test. A hash of the test's own identity string is stable regardless
//! of row order; the only remaining job is making sure two different
//! identities never hash to the same number within one parse.

use std::collections::HashSet;

/// Kept out of this range on purpose: real STDF test numbers and the app's
/// old sequential CSV/JSON scheme (1001, 1002, …) both live well under this,
/// so a hashed number can never be mistaken for one of those by coincidence.
const RESERVED_BELOW: u32 = 1_000_000;

/// FNV-1a, 32-bit. Deterministic across runs/platforms — unlike Rust's
/// default `HashMap` hasher, which is seeded randomly per process specifically
/// to resist hash-flooding attacks. That randomization is exactly wrong here:
/// the same test name must hash to the same number on every launch, or a
/// saved test list would stop matching the moment the app restarts.
fn fnv1a_32(s: &str) -> u32 {
    let mut hash: u32 = 0x811c_9dc5;
    for b in s.as_bytes() {
        hash ^= *b as u32;
        hash = hash.wrapping_mul(0x0100_0193);
    }
    hash
}

/// Deterministic number for `identity`, guaranteed not to collide with any
/// value already in `used` (which is updated with the result). Callers seed
/// `used` with any numbers that must not be reassigned — e.g. this file's own
/// wide-format test numbers, assigned upstream in TypeScript before the
/// long-format pass runs — so the two schemes can never collide even though
/// they're computed independently.
pub fn stable_test_number(identity: &str, used: &mut HashSet<u32>) -> u32 {
    let mut n = fnv1a_32(identity);
    if n < RESERVED_BELOW {
        n += RESERVED_BELOW;
    }
    while used.contains(&n) {
        n = n.wrapping_add(1);
        if n < RESERVED_BELOW {
            n = RESERVED_BELOW;
        }
    }
    used.insert(n);
    n
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_identity_always_hashes_the_same() {
        let mut used_a = HashSet::new();
        let mut used_b = HashSet::new();
        assert_eq!(
            stable_test_number("GAIN_DB", &mut used_a),
            stable_test_number("GAIN_DB", &mut used_b),
        );
    }

    #[test]
    fn different_identities_usually_hash_differently() {
        let mut used = HashSet::new();
        let a = stable_test_number("GAIN_DB", &mut used);
        let b = stable_test_number("NF_DB", &mut used);
        assert_ne!(a, b);
    }

    #[test]
    fn never_lands_below_the_reserved_band() {
        let mut used = HashSet::new();
        for name in ["", "a", "1001", "1002", "test_000", "x"] {
            assert!(stable_test_number(name, &mut used) >= RESERVED_BELOW);
        }
    }

    #[test]
    fn probes_forward_on_collision_instead_of_reusing_the_slot() {
        // Find the exact number "collide-me" would land on with a clean set,
        // then pre-occupy that number and confirm a second call is forced
        // somewhere else rather than silently colliding.
        let natural = stable_test_number("collide-me", &mut HashSet::new());
        let mut used = HashSet::new();
        used.insert(natural);
        let bumped = stable_test_number("collide-me", &mut used);
        assert_ne!(bumped, natural);
        assert!(used.contains(&bumped));
    }

    #[test]
    fn many_distinct_identities_never_collide_within_one_parse() {
        let mut used = HashSet::new();
        let mut seen = HashSet::new();
        for i in 0..2000 {
            let n = stable_test_number(&format!("test_{i}"), &mut used);
            assert!(seen.insert(n), "collision at test_{i} -> {n}");
        }
    }

    #[test]
    fn respects_numbers_seeded_by_the_caller() {
        // Simulates wide-format numbers (assigned upstream in TS) reserving
        // slots before the long-format pass computes any of its own.
        let mut used: HashSet<u32> = HashSet::new();
        used.insert(RESERVED_BELOW + 42);
        let n = stable_test_number("a name that happens to hash there", &mut used);
        assert_ne!(n, RESERVED_BELOW + 42);
    }
}
