pub use testdata_parser::parse_csv::{CsvHeadersResult, CsvMapping};
use testdata_parser::parse_csv::{csv_headers_inner, parse_csv_inner};
use testdata_parser::error::ParseError;
use tauri::ipc::Response;
use super::columnar;

#[tauri::command]
pub async fn csv_headers(path: String) -> Result<CsvHeadersResult, ParseError> {
    tokio::task::spawn_blocking(move || csv_headers_inner(path))
        .await
        .map_err(ParseError::internal)?
}

#[tauri::command]
pub async fn parse_csv(path: String, mapping: CsvMapping) -> Result<Response, ParseError> {
    tokio::task::spawn_blocking(move || parse_csv_inner(path, mapping).map(columnar))
        .await
        .map_err(ParseError::internal)?
}
