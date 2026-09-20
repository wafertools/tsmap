use testdata_parser::parse_atdf::parse_atdf_file_meta;
use testdata_parser::types::FileMeta;
use testdata_parser::error::ParseError;

#[tauri::command]
pub async fn atdf_file_meta(path: String) -> Result<FileMeta, ParseError> {
    tokio::task::spawn_blocking(move || {
        let bytes = testdata_parser::read_file::read_bytes(&path)?;
        parse_atdf_file_meta(&bytes)
    })
    .await
    .map_err(ParseError::internal)?
}
