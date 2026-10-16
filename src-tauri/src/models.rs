use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_hidden: bool,
    pub is_system: bool,
    pub is_readonly: bool,
    pub size: u64,
    pub modified_ms: i64,
    pub created_ms: i64,
    pub extension: String,
    pub file_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DriveInfo {
    pub letter: String,
    pub root_path: String,
    pub label: String,
    pub drive_type: String,
    pub total_bytes: u64,
    pub free_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SpecialPaths {
    pub desktop: String,
    pub documents: String,
    pub downloads: String,
    pub appdata: String,
    pub windir: String,
    pub sysdir: String,
    pub user_profile: String,
    pub current_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FolderSizeStats {
    pub path: String,
    pub total_bytes: u64,
    pub file_count: u64,
    pub dir_count: u64,
    #[serde(default)]
    pub cancelled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ColorFilterRule {
    pub id: String,
    pub label: String,
    pub pattern: String,
    pub color_hex: String,
    pub enabled: bool,
    pub is_bold: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QDirWorkspaceConfig {
    pub source_dir: String,
    pub layout_mode: u32,
    pub use_color_start: bool,
    pub design_mode: u32,
    pub tree_mode: u32,
    pub sp0: u32,
    pub sp1: u32,
    pub sp2: u32,
    pub spt: u32,
    pub tree1: u32,
    pub tree2: u32,
    pub tree3: u32,
    pub tree4: u32,
    pub tree1_split: u32,
    pub tree2_split: u32,
    pub tree3_split: u32,
    pub tree4_split: u32,
    pub preview_enabled: bool,
    pub preview_pos: u32,
    pub preview_filter: String,
    pub active_focus: u32,
    pub pane_paths: [String; 4],
    pub pane_view_modes: [u32; 4],
    pub show_filter_pane3: bool,
    pub color_rules: Vec<ColorFilterRule>,
    pub quick_links: Vec<QuickLinkItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuickLinkItem {
    pub name: String,
    pub target_path: String,
    pub category: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileActionReport {
    pub succeeded: Vec<String>,
    pub failed: Vec<FileActionError>,
    #[serde(default)]
    pub skipped: Vec<String>,
    /// (from, to) for every moved/copied item — used for undo.
    #[serde(default)]
    pub pairs: Vec<PathPair>,
    #[serde(default)]
    pub cancelled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PathPair {
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileActionError {
    pub path: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FilePreviewData {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified_ms: i64,
    pub preview_kind: String, // "image" | "text" | "video" | "audio" | "hex" | "directory"
    pub mime_type: String,
    pub text_content: Option<String>,
    pub data_url: Option<String>,
    pub hex_dump: Option<String>,
    pub encoding: Option<String>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub release_name: String,
    pub release_notes: String,
    pub published_at: String,
    pub download_url: String,
    pub asset_name: String,
    pub html_url: String,
}

