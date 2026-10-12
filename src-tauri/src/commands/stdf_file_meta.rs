use testdata_parser::parse_stdf::parse_stdf_file_meta_path;
use testdata_parser::types::FileMeta;
use testdata_parser::error::ParseError;

#[tauri::command]
pub async fn stdf_file_meta(path: String) -> Result<FileMeta, ParseError> {
    tokio::task::spawn_blocking(move || {
        parse_stdf_file_meta_path(&path)
    })
    .await
    .map_err(ParseError::internal)?
}
