pub mod file_actions;
pub mod fs_ops;
pub mod models;
pub mod preview;
pub mod qdir_compat;
pub mod updater;

use models::{
    DriveInfo, FileActionReport, FileEntry, FilePreviewData, FolderSizeStats, QDirWorkspaceConfig,
    SpecialPaths, UpdateCheckResult,
};

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
fn cmd_calculate_folder_size(path: String) -> Result<FolderSizeStats, String> {
    fs_ops::calculate_folder_size(path)
}

#[tauri::command(async)]
fn cmd_copy_items(
    sources: Vec<String>,
    destination_dir: String,
    policy: String,
) -> Result<FileActionReport, String> {
    file_actions::copy_items(sources, destination_dir, policy)
}

#[tauri::command(async)]
fn cmd_move_items(
    sources: Vec<String>,
    destination_dir: String,
    policy: String,
) -> Result<FileActionReport, String> {
    file_actions::move_items(sources, destination_dir, policy)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            cmd_list_directory,
            cmd_list_subdirectories,
            cmd_list_drives,
            cmd_get_special_paths,
            cmd_calculate_folder_size,
            cmd_copy_items,
            cmd_move_items,
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
            cmd_check_for_updates,
            cmd_install_update_and_restart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running J-Dir application");
}
