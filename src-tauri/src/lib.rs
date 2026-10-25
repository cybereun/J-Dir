pub mod archive;
pub mod clipboard;
pub mod docparse;
pub mod file_actions;
pub mod index;
pub mod fs_ops;
pub mod jobs;
pub mod models;
pub mod preview;
pub mod qdir_compat;
pub mod search;
pub mod updater;
pub mod zipview;

use jobs::Reporter;
use models::{
    DriveInfo, FileActionReport, FileEntry, FilePreviewData, FolderSizeStats, PathPair,
    QDirWorkspaceConfig, SpecialPaths, UpdateCheckResult,
};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

fn job_reporter(app: &AppHandle, job_id: String) -> Reporter {
    let app = app.clone();
    Reporter::new(
        job_id,
        Box::new(move |ev| {
            let _ = app.emit("jdir://progress", ev);
        }),
    )
}

fn main_hwnd(app: &AppHandle) -> isize {
    #[cfg(windows)]
    {
        if let Some(w) = app.get_webview_window("main") {
            if let Ok(h) = w.hwnd() {
                return h.0 as isize;
            }
        }
    }
    let _ = app;
    0
}

/// Keeps the active directory watcher alive (replaced whenever the watched set changes).
#[derive(Default)]
struct WatchState(Mutex<Option<notify::RecommendedWatcher>>);

#[tauri::command(async)]
fn cmd_list_directory(path: String, show_hidden: bool) -> Result<Vec<FileEntry>, String> {
    fs_ops::list_directory(path, show_hidden)
}

#[tauri::command(async)]
fn cmd_list_subdirectories(path: String, show_hidden: bool) -> Result<Vec<FileEntry>, String> {
    fs_ops::list_subdirectories(path, show_hidden)
}

#[tauri::command(async)]
fn cmd_list_drives() -> Result<Vec<DriveInfo>, String> {
    fs_ops::list_drives()
}

#[tauri::command(async)]
fn cmd_get_special_paths() -> Result<SpecialPaths, String> {
    fs_ops::get_special_paths()
}

#[tauri::command(async)]
fn cmd_calculate_folder_size(
    app: AppHandle,
    path: String,
    job_id: String,
) -> Result<FolderSizeStats, String> {
    fs_ops::calculate_folder_size(path, &job_reporter(&app, job_id))
}

#[tauri::command(async)]
fn cmd_cancel_job(job_id: String) {
    jobs::cancel_job(&job_id);
}

#[tauri::command(async)]
fn cmd_job_done(job_id: String) {
    jobs::finish_job(&job_id);
}

#[tauri::command(async)]
fn cmd_copy_items(
    app: AppHandle,
    sources: Vec<String>,
    destination_dir: String,
    policy: String,
    job_id: String,
) -> Result<FileActionReport, String> {
    file_actions::copy_items(sources, destination_dir, policy, &job_reporter(&app, job_id))
}

#[tauri::command(async)]
fn cmd_move_items(
    app: AppHandle,
    sources: Vec<String>,
    destination_dir: String,
    policy: String,
    job_id: String,
) -> Result<FileActionReport, String> {
    file_actions::move_items(sources, destination_dir, policy, &job_reporter(&app, job_id))
}

#[tauri::command(async)]
fn cmd_check_conflicts(
    sources: Vec<String>,
    destination_dir: String,
) -> Result<Vec<String>, String> {
    file_actions::check_conflicts(sources, destination_dir)
}

#[tauri::command(async)]
fn cmd_delete_items(paths: Vec<String>, permanent: bool) -> Result<FileActionReport, String> {
    file_actions::delete_items(paths, permanent)
}

#[tauri::command(async)]
fn cmd_rename_item(path: String, new_name: String) -> Result<String, String> {
    file_actions::rename_item(path, new_name)
}

#[tauri::command(async)]
fn cmd_create_directory(parent_dir: String, name: String) -> Result<String, String> {
    file_actions::create_directory(parent_dir, name)
}

#[tauri::command(async)]
fn cmd_create_text_file(
    parent_dir: String,
    name: String,
    content: String,
) -> Result<String, String> {
    file_actions::create_text_file(parent_dir, name, content)
}

#[tauri::command(async)]
fn cmd_open_item(path: String) -> Result<(), String> {
    file_actions::open_item(path)
}

#[tauri::command(async)]
fn cmd_open_in_explorer(path: String) -> Result<(), String> {
    file_actions::open_in_explorer(path)
}

#[tauri::command(async)]
fn cmd_open_in_terminal(path: String) -> Result<(), String> {
    file_actions::open_in_terminal(path)
}

#[tauri::command(async)]
fn cmd_export_file_list(
    entries: Vec<FileEntry>,
    output_path: String,
    format: String,
) -> Result<String, String> {
    file_actions::export_file_list(entries, output_path, format)
}

#[tauri::command(async)]
fn cmd_import_qdir_config(qdir_dir_path: Option<String>) -> Result<QDirWorkspaceConfig, String> {
    qdir_compat::import_qdir_directory(qdir_dir_path)
}

#[tauri::command(async)]
fn cmd_read_file_preview(path: String, max_bytes: usize) -> Result<FilePreviewData, String> {
    preview::read_file_preview(path, max_bytes)
}

/// Raw file bytes for original-layout viewers (PDF.js / rhwp WASM / images).
#[tauri::command(async)]
fn cmd_read_file_bytes(path: String, max_bytes: Option<u64>) -> Result<tauri::ipc::Response, String> {
    docparse::read_raw_bytes(&path, max_bytes.unwrap_or(docparse::MAX_RAW_BYTES))
        .map(tauri::ipc::Response::new)
}

/// Parses a document (HWP/HWPX/PDF/DOC/DOCX/XLS/XLSX/PPT/...) into structured text blocks.
#[tauri::command(async)]
fn cmd_parse_document(app: AppHandle, path: String) -> Result<serde_json::Value, String> {
    let mut doc = docparse::parse_document(&path, app.path().resource_dir().ok())?;
    if let Some(obj) = doc.as_object_mut() {
        obj.remove("markdown");
    }
    Ok(doc)
}

/// Grants the asset protocol read access to exactly one file so the WebView can stream it
/// (audio/video preview with Range requests) without loading it into memory.
#[tauri::command(async)]
fn cmd_allow_preview_stream(app: AppHandle, path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.is_file() {
        return Err("파일을 찾을 수 없습니다.".to_string());
    }
    app.asset_protocol_scope()
        .allow_file(p)
        .map_err(|e| format!("스트리밍 허용 실패: {}", e))
}

#[tauri::command(async)]
fn cmd_zip_list(path: String) -> Result<zipview::ZipListing, String> {
    zipview::list_zip(&path)
}

#[tauri::command(async)]
fn cmd_zip_read_entry(path: String, index: usize) -> Result<tauri::ipc::Response, String> {
    zipview::read_entry(&path, index).map(tauri::ipc::Response::new)
}

#[tauri::command(async)]
fn cmd_zip_parse_entry(app: AppHandle, path: String, index: usize) -> Result<serde_json::Value, String> {
    let mut doc = zipview::parse_entry(&path, index, app.path().resource_dir().ok())?;
    if let Some(obj) = doc.as_object_mut() {
        obj.remove("markdown");
    }
    Ok(doc)
}

#[tauri::command(async)]
fn cmd_zip_extract(path: String, dest_dir: String, indices: Option<Vec<usize>>) -> Result<String, String> {
    zipview::extract(&path, &dest_dir, indices)
}

#[tauri::command(async)]
fn cmd_index_folders(app: AppHandle, holder: State<index::IndexHolder>) -> Result<Vec<index::db::FolderInfo>, String> {
    let svc = holder.service(&app)?;
    index::db::list_folders(&svc.conn()?)
}

#[tauri::command(async)]
fn cmd_index_add_folder(app: AppHandle, holder: State<index::IndexHolder>, path: String) -> Result<i64, String> {
    let svc = holder.service(&app)?;
    index::db::add_folder(&svc.conn()?, &path)
}

#[tauri::command(async)]
fn cmd_index_remove_folder(app: AppHandle, holder: State<index::IndexHolder>, id: i64) -> Result<(), String> {
    let svc = holder.service(&app)?;
    index::db::remove_folder(&mut svc.conn()?, id)
}

#[tauri::command(async)]
fn cmd_index_start(app: AppHandle, holder: State<index::IndexHolder>, folder_id: Option<i64>) -> Result<(), String> {
    let svc = holder.service(&app)?;
    svc.start(app.clone(), folder_id)
}

#[tauri::command(async)]
fn cmd_index_cancel(app: AppHandle, holder: State<index::IndexHolder>) -> Result<(), String> {
    holder.service(&app)?.cancel();
    Ok(())
}

#[tauri::command(async)]
fn cmd_index_progress(app: AppHandle, holder: State<index::IndexHolder>) -> Result<index::indexer::IndexProgress, String> {
    Ok(holder.service(&app)?.progress())
}

#[tauri::command(async)]
fn cmd_index_search(
    app: AppHandle,
    holder: State<index::IndexHolder>,
    request: index::db::SearchRequest,
) -> Result<index::db::SearchResponse, String> {
    let svc = holder.service(&app)?;
    index::db::search(&svc.conn()?, &request)
}

const PREVIEW_WINDOW: &str = "preview";

/// Opens (or focuses) the detached preview window. It is a real OS window, so it can be
/// moved and resized anywhere on the desktop, outside the main window's bounds.
#[tauri::command(async)]
fn cmd_open_preview_window(
    app: AppHandle,
    x: Option<f64>,
    y: Option<f64>,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(PREVIEW_WINDOW) {
        let _ = w.unminimize();
        let _ = w.show();
        return w.set_focus().map_err(|e| e.to_string());
    }
    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        PREVIEW_WINDOW,
        tauri::WebviewUrl::App("index.html?preview=1".into()),
    )
    .title("J-Dir 미리보기")
    .inner_size(width.unwrap_or(620.0).max(360.0), height.unwrap_or(800.0).max(300.0))
    .min_inner_size(360.0, 300.0)
    .resizable(true)
    .drag_and_drop(false);
    builder = match (x, y) {
        (Some(x), Some(y)) => builder.position(x, y),
        _ => builder.center(),
    };
    builder.build().map(|_| ()).map_err(|e| format!("미리보기 창 열기 실패: {}", e))
}

#[tauri::command(async)]
fn cmd_close_preview_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(PREVIEW_WINDOW) {
        w.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command(async)]
fn cmd_check_for_updates() -> Result<UpdateCheckResult, String> {
    updater::check_for_updates()
}

#[tauri::command(async)]
fn cmd_install_update_and_restart(
    download_url: String,
    asset_name: String,
) -> Result<String, String> {
    updater::install_update_and_restart(download_url, asset_name)
}

#[tauri::command(async)]
fn cmd_restore_moves(pairs: Vec<PathPair>) -> Result<FileActionReport, String> {
    file_actions::restore_moves(pairs)
}

#[tauri::command(async)]
fn cmd_set_attributes(
    paths: Vec<String>,
    readonly: Option<bool>,
    hidden: Option<bool>,
) -> Result<FileActionReport, String> {
    file_actions::set_attributes(paths, readonly, hidden)
}

#[tauri::command(async)]
fn cmd_search_files(
    app: AppHandle,
    root: String,
    query: search::SearchQuery,
    job_id: String,
) -> Result<search::SearchResult, String> {
    search::search_files(root, query, &job_reporter(&app, job_id))
}

#[tauri::command(async)]
fn cmd_zip_items(
    app: AppHandle,
    sources: Vec<String>,
    dest_zip: String,
    job_id: String,
) -> Result<String, String> {
    archive::zip_items(sources, dest_zip, &job_reporter(&app, job_id))
}

#[tauri::command(async)]
fn cmd_unzip(
    app: AppHandle,
    zip_path: String,
    dest_dir: String,
    job_id: String,
) -> Result<String, String> {
    archive::unzip_archive(zip_path, dest_dir, &job_reporter(&app, job_id))
}

#[tauri::command(async)]
fn cmd_clipboard_set_files(app: AppHandle, paths: Vec<String>, cut: bool) -> Result<(), String> {
    clipboard::set_files(main_hwnd(&app), &paths, cut)
}

#[tauri::command(async)]
fn cmd_clipboard_get_files(app: AppHandle) -> Result<Option<clipboard::ClipboardFiles>, String> {
    clipboard::get_files(main_hwnd(&app))
}

#[tauri::command(async)]
fn cmd_clipboard_clear(app: AppHandle) -> Result<(), String> {
    clipboard::clear(main_hwnd(&app))
}

/// Replaces the set of watched directories; changes are reported via `jdir://fs-changed`.
#[tauri::command(async)]
fn cmd_watch_dirs(
    app: AppHandle,
    state: State<WatchState>,
    paths: Vec<String>,
) -> Result<(), String> {
    use notify::{EventKind, RecursiveMode, Watcher};

    let emit_app = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        if matches!(event.kind, EventKind::Access(_)) {
            return;
        }
        for p in &event.paths {
            if let Some(parent) = p.parent() {
                let _ = emit_app.emit("jdir://fs-changed", parent.to_string_lossy().to_string());
            }
            // the watched folder itself (e.g. deleted / renamed) is reported by its own path
            let _ = emit_app.emit("jdir://fs-changed", p.to_string_lossy().to_string());
        }
    })
    .map_err(|e| format!("폴더 감시 시작 실패: {}", e))?;

    for p in paths {
        let path = fs_ops::normalize_windows_path(&p);
        if path.is_dir() {
            // unreachable / network folders simply stay unwatched (focus refresh covers them)
            let _ = watcher.watch(&path, RecursiveMode::NonRecursive);
        }
    }
    *state.0.lock().map_err(|_| "감시 상태 잠금 실패".to_string())? = Some(watcher);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WatchState::default())
        .manage(index::IndexHolder::default())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if window.label() == PREVIEW_WINDOW {
                if let tauri::WindowEvent::Destroyed = event {
                    let _ = window.app_handle().emit("jdir://preview-closed", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            cmd_list_directory,
            cmd_list_subdirectories,
            cmd_list_drives,
            cmd_get_special_paths,
            cmd_calculate_folder_size,
            cmd_copy_items,
            cmd_move_items,
            cmd_cancel_job,
            cmd_job_done,
            cmd_restore_moves,
            cmd_set_attributes,
            cmd_search_files,
            cmd_zip_items,
            cmd_unzip,
            cmd_clipboard_set_files,
            cmd_clipboard_get_files,
            cmd_clipboard_clear,
            cmd_watch_dirs,
            cmd_check_conflicts,
            cmd_delete_items,
            cmd_rename_item,
            cmd_create_directory,
            cmd_create_text_file,
            cmd_open_item,
            cmd_open_in_explorer,
            cmd_open_in_terminal,
            cmd_export_file_list,
            cmd_import_qdir_config,
            cmd_read_file_preview,
            cmd_read_file_bytes,
            cmd_parse_document,
            cmd_allow_preview_stream,
            cmd_zip_list,
            cmd_zip_read_entry,
            cmd_zip_parse_entry,
            cmd_zip_extract,
            cmd_index_folders,
            cmd_index_add_folder,
            cmd_index_remove_folder,
            cmd_index_start,
            cmd_index_cancel,
            cmd_index_progress,
            cmd_index_search,
            cmd_open_preview_window,
            cmd_close_preview_window,
            cmd_check_for_updates,
            cmd_install_update_and_restart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running J-Dir application");
}
