use testdata_parser::parse_csv::CsvMapping;
use testdata_parser::parse_json::{json_headers_sync, parse_json_sync, JsonHeadersResult};
use testdata_parser::error::ParseError;
use tauri::ipc::Response;
use super::columnar;

#[tauri::command]
pub async fn json_headers(path: String) -> Result<JsonHeadersResult, ParseError> {
    tokio::task::spawn_blocking(move || json_headers_sync(path))
        .await
        .map_err(ParseError::internal)?
}

#[tauri::command]
pub async fn parse_json(path: String, mapping: CsvMapping) -> Result<Response, ParseError> {
    tokio::task::spawn_blocking(move || parse_json_sync(path, mapping).map(columnar))
        .await
        .map_err(ParseError::internal)?
}
