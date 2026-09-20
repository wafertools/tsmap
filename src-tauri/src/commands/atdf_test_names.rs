use testdata_parser::parse_atdf::parse_atdf_test_names;
use testdata_parser::types::ScanResult;
use testdata_parser::error::ParseError;

#[tauri::command]
pub async fn atdf_test_names(path: String) -> Result<ScanResult, ParseError> {
    tokio::task::spawn_blocking(move || {
        let bytes = testdata_parser::read_file::read_bytes(&path)?;
        parse_atdf_test_names(&bytes)
    })
    .await
    .map_err(ParseError::internal)?
}
