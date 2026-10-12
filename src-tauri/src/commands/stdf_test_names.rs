use testdata_parser::parse_stdf::parse_stdf_test_names_path;
use testdata_parser::types::ScanResult;
use testdata_parser::error::ParseError;

#[tauri::command]
pub async fn stdf_test_names(path: String) -> Result<ScanResult, ParseError> {
    tokio::task::spawn_blocking(move || {
        parse_stdf_test_names_path(&path)
    })
    .await
    .map_err(ParseError::internal)?
}
