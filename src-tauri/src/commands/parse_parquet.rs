pub use testdata_parser::parse_csv::CsvMapping;
pub use testdata_parser::parse_parquet::ParquetHeadersResult;
use testdata_parser::parse_parquet::{parquet_distinct_count_inner, parquet_headers_inner, parse_parquet_inner};
use testdata_parser::types::ParsedStdf;
use testdata_parser::error::ParseError;

#[tauri::command]
pub async fn parquet_headers(path: String) -> Result<ParquetHeadersResult, ParseError> {
    tokio::task::spawn_blocking(move || parquet_headers_inner(path))
        .await
        .map_err(ParseError::internal)?
}

/// The file filter's Parquet wafer count — see `parquet_distinct_count_from_bytes`.
#[tauri::command]
pub async fn parquet_distinct_count(path: String, columns: Vec<String>) -> Result<usize, ParseError> {
    tokio::task::spawn_blocking(move || parquet_distinct_count_inner(path, columns))
        .await
        .map_err(ParseError::internal)?
}

#[tauri::command]
pub async fn parse_parquet(path: String, mapping: CsvMapping) -> Result<ParsedStdf, ParseError> {
    tokio::task::spawn_blocking(move || parse_parquet_inner(path, mapping))
        .await
        .map_err(ParseError::internal)?
}
