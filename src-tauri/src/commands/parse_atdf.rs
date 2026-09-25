use testdata_parser::parse_atdf::parse_atdf_sync;
use testdata_parser::error::ParseError;
use tauri::ipc::Response;
use super::columnar;

#[tauri::command]
pub async fn parse_atdf(path: String) -> Result<Response, ParseError> {
    tokio::task::spawn_blocking(move || parse_atdf_sync(path).map(columnar))
        .await
        .map_err(ParseError::internal)?
}
