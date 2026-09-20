use testdata_parser::parse_atdf::parse_atdf_sync;
use testdata_parser::types::ParsedStdf;
use testdata_parser::error::ParseError;

#[tauri::command]
pub async fn parse_atdf(path: String) -> Result<ParsedStdf, ParseError> {
    tokio::task::spawn_blocking(move || parse_atdf_sync(path))
        .await
        .map_err(ParseError::internal)?
}
