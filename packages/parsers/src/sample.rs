//! The preview rows a headers scan returns: the first `HEAD_ROWS` rows, then up
//! to `SPREAD_ROWS` more spread evenly through the rest of the file.
//!
//! The head is what the column-mapping dialog has always seen, so detection
//! results for a file whose first rows are representative do not move. The
//! spread is what lets a caller tell a column that varies later in the file from
//! one that is constant: agreement across a few rows at the top shows neither.

/// Rows taken from the top of the file.
pub const HEAD_ROWS: usize = 5;
/// Rows taken from the rest of the file, evenly spaced.
pub const SPREAD_ROWS: usize = 20;

/// Row indices for the spread: up to `SPREAD_ROWS`, evenly spaced over
/// `HEAD_ROWS..total`, strictly increasing, none inside the head.
pub fn spread_indices(total: usize) -> Vec<usize> {
    if total <= HEAD_ROWS { return Vec::new(); }
    let rest = total - HEAD_ROWS;
    let n = SPREAD_ROWS.min(rest);
    let mut out: Vec<usize> = (0..n).map(|k| HEAD_ROWS + k * rest / n).collect();
    out.dedup();
    out
}

/// Byte offsets for a seek-based spread over a file of `len` bytes, evenly
/// spaced and starting after the first `skip` bytes (the head's own extent).
pub fn spread_offsets(len: usize, skip: usize) -> Vec<usize> {
    if len <= skip { return Vec::new(); }
    let rest = len - skip;
    (1..=SPREAD_ROWS).map(|k| skip + k * rest / (SPREAD_ROWS + 1)).collect()
}

/// The first complete line that starts after `off` in `chunk`, which was read
/// from `off`. The line `off` falls inside is skipped, since it is usually
/// partial. `None` when the chunk holds no complete line (a line longer than
/// the chunk, or the end of the file) or the line is blank.
pub fn line_after(chunk: &[u8], at_eof: bool) -> Option<&[u8]> {
    let start = chunk.iter().position(|&b| b == b'\n')? + 1;
    let rest = &chunk[start..];
    let end = match rest.iter().position(|&b| b == b'\n') {
        Some(e) => e,
        None if at_eof => rest.len(),
        None => return None,
    };
    let line = &rest[..end];
    let line = line.strip_suffix(b"\r").unwrap_or(line);
    if line.iter().all(|b| b.is_ascii_whitespace()) { None } else { Some(line) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spread_skips_the_head_and_stays_in_range() {
        assert!(spread_indices(5).is_empty());
        assert_eq!(spread_indices(8), vec![5, 6, 7]);
        let idx = spread_indices(1_000_000);
        assert_eq!(idx.len(), SPREAD_ROWS);
        assert!(idx[0] >= HEAD_ROWS && *idx.last().unwrap() < 1_000_000);
        assert!(idx.windows(2).all(|w| w[0] < w[1]));
    }

    /// The golden file is shared with `src/sample.test.ts`, which holds the web
    /// build's copy of this rule (`sampleIndices` in `platform.ts`) to the same
    /// answers. Rows before the head are the head itself, so the golden lists
    /// the whole preview: head rows first, then `spread_indices`.
    #[test]
    fn matches_the_shared_golden_file() {
        let golden: serde_json::Value =
            serde_json::from_str(include_str!("../tests/sample-golden/indices.json")).unwrap();
        assert_eq!(golden["head"].as_u64().unwrap() as usize, HEAD_ROWS);
        assert_eq!(golden["spread"].as_u64().unwrap() as usize, SPREAD_ROWS);
        for case in golden["cases"].as_array().unwrap() {
            let rows = case["rows"].as_u64().unwrap() as usize;
            let want: Vec<usize> = case["indices"].as_array().unwrap().iter()
                .map(|v| v.as_u64().unwrap() as usize).collect();
            let got: Vec<usize> = (0..rows.min(HEAD_ROWS)).chain(spread_indices(rows)).collect();
            assert_eq!(got, want, "{rows} rows");
        }
    }

    #[test]
    fn line_after_skips_the_partial_line() {
        assert_eq!(line_after(b"rtial\nfull,line\nnext", false), Some(&b"full,line"[..]));
        assert_eq!(line_after(b"rtial\nlast,line", true), Some(&b"last,line"[..]));
        assert_eq!(line_after(b"rtial\nlast,line", false), None);
        assert_eq!(line_after(b"no newline", true), None);
    }
}
