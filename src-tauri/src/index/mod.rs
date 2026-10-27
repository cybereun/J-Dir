//! Opt-in full-text index of user-chosen folders, stored in an encrypted (SQLCipher) database.

pub mod db;
mod batching;
pub mod indexer;
pub mod key;
pub mod parser;

use indexer::IndexService;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

#[derive(Default)]
pub struct IndexHolder(Mutex<Option<Arc<IndexService>>>);

impl IndexHolder {
    /// Lazily creates the service so users who never open the search tab pay nothing.
    pub fn service(&self, app: &AppHandle) -> Result<Arc<IndexService>, String> {
        let mut guard = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(svc) = guard.as_ref() {
            return Ok(Arc::clone(svc));
        }
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("앱 데이터 폴더를 찾을 수 없습니다: {}", e))?
            .join("index");
        let key = key::load_or_create(&dir)?;
        let parser = crate::docparse::locate_parser(app.path().resource_dir().ok())
            .ok_or_else(|| "문서 파서(jdir-parser.exe)를 찾을 수 없습니다.".to_string())?;
        let svc = Arc::new(IndexService::new(dir, key, parser));
        *guard = Some(Arc::clone(&svc));
        Ok(svc)
    }
}
