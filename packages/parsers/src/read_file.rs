use std::borrow::Cow;
use std::io::Read;

/// Transparently unwrap a gzip container, detecting it by magic bytes (1f 8b)
/// and **borrowing** when there isn't one — so the overwhelmingly common
/// non-gzipped case costs nothing, which matters when the input is a 340 MB
/// STDF handed over from the browser.
///
/// THE rule for the bytes path: every `*_from_bytes`-shaped entry point in this
/// crate calls this first, so a `.stdf.gz` behaves the same whether it arrived
/// as a path (native — `read_bytes` unwraps it by extension) or as raw bytes
/// (WASM/browser, where there is no filename to inspect). Only `parse_csv` used
/// to do this, which is why a gzipped STDF/ATDF/JSON/Parquet parsed on desktop
/// but failed in the browser for any caller that hadn't decompressed first.
///
/// Safe to call on already-decompressed input: the magic-byte check makes a
/// second call a no-op, so the native path double-calling it is harmless.
pub fn maybe_gunzip(bytes: &[u8]) -> Result<Cow<'_, [u8]>, String> {
    if bytes.len() >= 2 && bytes[0] == 0x1f && bytes[1] == 0x8b {
        let mut buf = Vec::new();
        flate2::read::GzDecoder::new(bytes)
            .read_to_end(&mut buf)
            .map_err(|e| format!("gz decompress failed: {}", e))?;
        Ok(Cow::Owned(buf))
    } else {
        Ok(Cow::Borrowed(bytes))
    }
}

/// Owning form of [`maybe_gunzip`], kept for callers that already hold a `Vec`.
pub fn decompress_if_gzip(bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    match maybe_gunzip(&bytes)? {
        Cow::Owned(out) => Ok(out),
        Cow::Borrowed(_) => Ok(bytes),
    }
}

#[cfg(feature = "native")]
pub fn read_bytes(path: &str) -> Result<Vec<u8>, String> {
    use std::path::Path;
    let is_gz = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("gz"))
        .unwrap_or(false);

    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    if is_gz {
        flate2::read::GzDecoder::new(file)
            .read_to_end(&mut buf)
            .map_err(|e| format!("gz decompress failed: {}", e))?;
    } else {
        std::io::BufReader::new(file)
            .read_to_end(&mut buf)
            .map_err(|e| e.to_string())?;
    }
    Ok(buf)
}

#[cfg(feature = "native")]
pub fn read_text(path: &str) -> Result<String, String> {
    let bytes = read_bytes(path)?;
    String::from_utf8(bytes).map_err(|e| format!("UTF-8 decode failed: {}", e))
}
