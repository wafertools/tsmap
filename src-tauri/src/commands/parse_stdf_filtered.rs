use std::collections::HashSet;
use testdata_parser::parse_stdf::parse_stdf_filtered_path;
use testdata_parser::error::ParseError;
use tauri::ipc::Response;
use super::columnar;

#[tauri::command]
pub async fn parse_stdf_filtered(path: String, selected: Vec<u32>) -> Result<Response, ParseError> {
    tokio::task::spawn_blocking(move || {
        let set: HashSet<u32> = selected.into_iter().collect();
        parse_stdf_filtered_path(&path, &set).map(columnar)
    })
    .await
    .map_err(ParseError::internal)?
}
