pub use testdata_parser::parse_csv::CsvMapping;
pub use testdata_parser::parse_parquet::ParquetHeadersResult;
use testdata_parser::parse_parquet::{parquet_headers_inner, parse_parquet_inner};
use testdata_parser::types::ParsedStdf;

#[tauri::command]
pub async fn parquet_headers(path: String) -> Result<ParquetHeadersResult, String> {
    tokio::task::spawn_blocking(move || parquet_headers_inner(path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn parse_parquet(path: String, mapping: CsvMapping) -> Result<ParsedStdf, String> {
    tokio::task::spawn_blocking(move || parse_parquet_inner(path, mapping))
        .await
        .map_err(|e| e.to_string())?
}
