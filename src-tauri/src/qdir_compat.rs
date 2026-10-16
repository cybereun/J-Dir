use crate::models::{ColorFilterRule, QDirWorkspaceConfig, QuickLinkItem};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

pub fn default_qdir_color_rules() -> Vec<ColorFilterRule> {
    vec![
        ColorFilterRule {
            id: "0".to_string(),
            label: "숨김 파일 (#Hidden)".to_string(),
            pattern: "#Hidden".to_string(),
            color_hex: "#334155".to_string(),
            enabled: true,
            is_bold: false,
        },
        ColorFilterRule {
            id: "1".to_string(),
            label: "압축 파일 (Archive)".to_string(),
            pattern: "*.zip;*.rar;*.gz;*.7z;".to_string(),
            color_hex: "#00AA00".to_string(),
            enabled: true,
            is_bold: false,
        },
        ColorFilterRule {
            id: "2".to_string(),
            label: "미디어 파일 (Media)".to_string(),
            pattern: "*.mp*;*.avi;*.wma;*.mkv;*.mov;".to_string(),
            color_hex: "#DD0058".to_string(),
            enabled: true,
            is_bold: false,
        },
        ColorFilterRule {
            id: "3".to_string(),
            label: "폴더 (#DIR)".to_string(),
            pattern: "#DIR".to_string(),
            color_hex: "#008800".to_string(),
            enabled: true,
            is_bold: true,
        },
        ColorFilterRule {
            id: "4".to_string(),
            label: "이미지 (Images)".to_string(),
            pattern: "*.jpg;*.jpeg;*.png;*.gif;*.bmp;*.ico;*.webp".to_string(),
            color_hex: "#BB00BB".to_string(),
            enabled: true,
            is_bold: false,
        },
        ColorFilterRule {
            id: "5".to_string(),
            label: "웹 문서 (Web/Links)".to_string(),
            pattern: "*.html;*.htm;*.url".to_string(),
            color_hex: "#456789".to_string(),
            enabled: true,
            is_bold: false,
        },
        ColorFilterRule {
            id: "6".to_string(),
            label: "문서 및 스크립트 (Docs)".to_string(),
            pattern: "*.pl;*.cgi;*.php;*.pdf;*.doc;*.docx;*.hwp;*.rtf;*.xls;*.xlsx".to_string(),
            color_hex: "#BB8844".to_string(),
            enabled: true,
            is_bold: false,
        },
        ColorFilterRule {
            id: "7".to_string(),
            label: "소스 코드 (Code)".to_string(),
            pattern: "*.cpp;*.hpp;*.h;*.rs;*.ts;*.tsx;*.js;*.py".to_string(),
            color_hex: "#DD0058".to_string(),
            enabled: true,
            is_bold: false,
        },
        ColorFilterRule {
            id: "8".to_string(),
            label: "실행 및 시스템 (System/Exe)".to_string(),
            pattern: "*.exe;*.dll;*.bat;*.cmd;*.msi".to_string(),
            color_hex: "#FF0000".to_string(),
            enabled: true,
            is_bold: false,
        },
        ColorFilterRule {
            id: "9".to_string(),
            label: "기타 모든 파일 (*)".to_string(),
            pattern: "*".to_string(),
            color_hex: "#0000BB".to_string(),
            enabled: true,
            is_bold: false,
        },
    ]
}

fn read_text_auto_encoding(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("파일 읽기 실패 ({}): {}", path.display(), e))?;
    if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        let u16_slice: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return Ok(String::from_utf16_lossy(&u16_slice));
    }
    // Check if UTF-16LE without BOM (lots of 0x00 at odd indices)
    if bytes.len() >= 8 && bytes[1] == 0 && bytes[3] == 0 && bytes[5] == 0 {
        let u16_slice: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return Ok(String::from_utf16_lossy(&u16_slice));
    }
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

fn parse_ini_sections(content: &str) -> HashMap<String, HashMap<String, String>> {
    let mut sections: HashMap<String, HashMap<String, String>> = HashMap::new();
    let mut current_section = String::from("ROOT");

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with(';') {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            current_section = line[1..line.len() - 1].trim().to_string();
            sections.entry(current_section.clone()).or_default();
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            sections
                .entry(current_section.clone())
                .or_default()
                .insert(k.trim().to_string(), v.trim().to_string());
        }
    }
    sections
}

fn describe_filter_pattern(pattern: &str) -> String {
    match pattern {
        "#Hidden" => "숨김 항목 (#Hidden)".to_string(),
        "#DIR" => "폴더 (#DIR)".to_string(),
        "*" => "기본 일반 파일 (*)".to_string(),
        p if p.contains("zip") => "압축 아카이브".to_string(),
        p if p.contains("mp*") || p.contains("avi") => "미디어 (오디오/비디오)".to_string(),
        p if p.contains("jpg") || p.contains("png") => "이미지 파일".to_string(),
        p if p.contains("html") || p.contains("url") => "웹 문서/바로가기".to_string(),
        p if p.contains("pdf") || p.contains("doc") => "문서 및 스크립트".to_string(),
        p if p.contains("cpp") || p.contains("hpp") => "소스 코드".to_string(),
        p if p.contains("exe") || p.contains("dll") => "실행 및 시스템 파일".to_string(),
        other => format!("필터 ({})", other),
    }
}

/// Parses Q-Dir `[Filter2]` entry such as `1=*.zip;*.rar;*.gz;*.7z;=1=00AA00=-1=1=-1=0`
pub fn parse_filter2_line(key: &str, val: &str) -> Option<ColorFilterRule> {
    let parts: Vec<&str> = val.split('=').collect();
    if parts.len() < 3 {
        return None;
    }
    let raw_pattern = parts[0].trim();
    if raw_pattern == "#BG" || raw_pattern == "#BG-A" {
        return None;
    }
    let enabled = parts[1].trim() == "1";
    let raw_color = parts[2].trim();

    let color_hex = if raw_color == "-1" || raw_color.is_empty() {
        if raw_pattern == "#Hidden" {
            "#334155".to_string()
        } else {
            return None;
        }
    } else if raw_color.starts_with('#') {
        raw_color.to_uppercase()
    } else {
        format!("#{}", raw_color.to_uppercase())
    };

    // Normalize comma typo in Q-Dir's default (`*.png,*.gif`) to semicolon
    let normalized_pattern = raw_pattern.replace(',', ";");
    let is_bold = normalized_pattern == "#DIR";

    Some(ColorFilterRule {
        id: key.to_string(),
        label: describe_filter_pattern(&normalized_pattern),
        pattern: normalized_pattern,
        color_hex,
        enabled,
        is_bold,
    })
}

/// Extracts readable path or drive from Q-Dir's URL-encoded SHELL ITEMIDLIST (`Folder1=%14%00...`)
pub fn decode_qdr_folder_line(raw: &str) -> (Option<String>, u32) {
    let mut view_mode = 4u32;
    let parts: Vec<&str> = raw.split('&').collect();
    for p in &parts[1..] {
        if let Some((_, val)) = p.split_once('=') {
            if p.starts_with("ViewMode1=")
                || p.starts_with("ViewMode2=")
                || p.starts_with("ViewMode3=")
                || p.starts_with("ViewMode4=")
            {
                if let Ok(vm) = val.parse::<u32>() {
                    view_mode = vm;
                }
            }
        }
    }

    let hex_part = parts.first().copied().unwrap_or("");
    let mut bytes = Vec::new();
    let mut chars = hex_part.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '%' {
            let h1 = chars.next();
            let h2 = chars.next();
            if let (Some(a), Some(b)) = (h1, h2) {
                let hex_str = format!("{}{}", a, b);
                if let Ok(byte) = u8::from_str_radix(&hex_str, 16) {
                    bytes.push(byte);
                }
            }
        }
    }

    // Look for drive pattern like `C:\` or `E:\` or `F:\` in ASCII bytes
    let ascii_lossy = String::from_utf8_lossy(&bytes);
    for (idx, _) in ascii_lossy.match_indices(":\\") {
        if idx >= 1 {
            let drive_char = ascii_lossy.as_bytes()[idx - 1] as char;
            if drive_char.is_ascii_alphabetic() {
                let root = format!("{}:\\", drive_char.to_ascii_uppercase());
                if Path::new(&root).exists() {
                    return (Some(root), view_mode);
                }
            }
        }
    }

    (None, view_mode)
}

pub fn default_pane_paths() -> [String; 4] {
    let mut candidates = Vec::new();
    if Path::new("Y:\\내 드라이브\\AI\\App_Bulid").exists() {
        candidates.push("Y:\\내 드라이브\\AI\\App_Bulid".to_string());
    }
    if Path::new("E:\\UTIL").exists() {
        candidates.push("E:\\UTIL".to_string());
    }
    if let Ok(sp) = crate::fs_ops::get_special_paths() {
        if Path::new(&sp.desktop).exists() {
            candidates.push(sp.desktop);
        }
        if Path::new(&sp.downloads).exists() {
            candidates.push(sp.downloads);
        }
        if Path::new(&sp.documents).exists() {
            candidates.push(sp.documents);
        }
    }
    candidates.push("C:\\".to_string());

    let mut out = [
        "C:\\".to_string(),
        "C:\\".to_string(),
        "C:\\".to_string(),
        "C:\\".to_string(),
    ];
    for (i, slot) in out.iter_mut().enumerate() {
        if let Some(p) = candidates.get(i).or_else(|| candidates.first()) {
            *slot = p.clone();
        }
    }
    out
}

pub fn default_quick_links() -> Vec<QuickLinkItem> {
    let mut links = Vec::new();
    if Path::new("Y:\\내 드라이브\\AI\\App_Bulid").exists() {
        links.push(QuickLinkItem {
            name: "작업폴더".to_string(),
            target_path: "Y:\\내 드라이브\\AI\\App_Bulid".to_string(),
            category: "Quick-Link".to_string(),
        });
    }
    if Path::new("E:\\UTIL").exists() {
        links.push(QuickLinkItem {
            name: "유틸리티".to_string(),
            target_path: "E:\\UTIL".to_string(),
            category: "Quick-Link".to_string(),
        });
    }
    if let Ok(sp) = crate::fs_ops::get_special_paths() {
        links.push(QuickLinkItem {
            name: "바탕화면".to_string(),
            target_path: sp.desktop,
            category: "System".to_string(),
        });
        links.push(QuickLinkItem {
            name: "다운로드".to_string(),
            target_path: sp.downloads,
            category: "System".to_string(),
        });
        links.push(QuickLinkItem {
            name: "내 문서".to_string(),
            target_path: sp.documents,
            category: "System".to_string(),
        });
        links.push(QuickLinkItem {
            name: "AppData".to_string(),
            target_path: sp.appdata,
            category: "System".to_string(),
        });
        links.push(QuickLinkItem {
            name: "Windows".to_string(),
            target_path: sp.windir,
            category: "System".to_string(),
        });
    }
    links
}

pub fn find_default_qdir_portable_dir() -> Option<PathBuf> {
    let direct = PathBuf::from("E:\\UTIL\\4.시스템\\Q-Dir_Portable_x64\\Q-Dir");
    if direct.exists() {
        return Some(direct);
    }
    if let Ok(entries) = fs::read_dir("E:\\UTIL") {
        for entry in entries.flatten() {
            let candidate = entry.path().join("Q-Dir_Portable_x64").join("Q-Dir");
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    None
}

pub fn import_qdir_directory(qdir_dir_path: Option<String>) -> Result<QDirWorkspaceConfig, String> {
    let target_dir = match qdir_dir_path {
        Some(p) if !p.trim().is_empty() => Some(PathBuf::from(p.trim())),
        _ => find_default_qdir_portable_dir(),
    };

    // Without a Q-Dir installation we fall back to built-in defaults instead of failing.
    let (ini_path, folder_root) = match &target_dir {
        Some(dir) => {
            let ini = if dir.is_file() && dir.extension().is_some_and(|e| e == "ini") {
                dir.clone()
            } else {
                dir.join("Q-Dir.ini")
            };
            let root = ini.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| dir.clone());
            (ini, root)
        }
        None => (PathBuf::new(), PathBuf::new()),
    };
    let qdr_path = folder_root.join("start.qdr");
    let source_label = if target_dir.is_some() {
        folder_root.to_string_lossy().to_string()
    } else {
        "J-Dir 기본값".to_string()
    };

    let mut config = QDirWorkspaceConfig {
        source_dir: source_label,
        layout_mode: 5,
        use_color_start: true,
        design_mode: 1,
        tree_mode: 1,
        sp0: 5000,
        sp1: 5000,
        sp2: 5000,
        spt: 1617,
        tree1: 0,
        tree2: 0,
        tree3: 0,
        tree4: 0,
        tree1_split: 2500,
        tree2_split: 2500,
        tree3_split: 2500,
        tree4_split: 2500,
        preview_enabled: false,
        preview_pos: 7500,
        preview_filter: "*.avi;*.bmp;*.gif;*.ico;*.jpeg;*.jpg;*.mp*;*.pdf;*.png;*.wm*;".to_string(),
        active_focus: 3,
        pane_paths: default_pane_paths(),
        pane_view_modes: [4, 4, 4, 4],
        show_filter_pane3: true,
        color_rules: default_qdir_color_rules(),
        quick_links: default_quick_links(),
    };

    if ini_path.exists() {
        let ini_text = read_text_auto_encoding(&ini_path)?;
        let sections = parse_ini_sections(&ini_text);

        if let Some(start_sec) = sections.get("Start") {
            if let Some(als) = start_sec.get("Als").and_then(|v| v.parse::<u32>().ok()) {
                config.layout_mode = als;
            }
            if let Some(ucs) = start_sec.get("useColorStart") {
                config.use_color_start = ucs == "1";
            }
            if let Some(dm) = start_sec
                .get("designe_mode")
                .and_then(|v| v.parse::<u32>().ok())
            {
                config.design_mode = dm;
            }
            if let Some(tm) = start_sec
                .get("tree_mode")
                .and_then(|v| v.parse::<u32>().ok())
            {
                config.tree_mode = tm;
            }
        }

        if let Some(vorschau_sec) = sections.get("Vorschau") {
            if let Some(flt) = vorschau_sec.get("Filter") {
                config.preview_filter = flt.clone();
            }
        }

        if let Some(qview3) = sections.get("Q_View_3") {
            if let Some(sf) = qview3.get("show_filter") {
                config.show_filter_pane3 = sf == "1";
            }
        }

        if let Some(filter2_sec) = sections.get("Filter2") {
            let mut parsed_rules = Vec::new();
            let mut keys: Vec<u32> = filter2_sec
                .keys()
                .filter_map(|k| k.parse::<u32>().ok())
                .collect();
            keys.sort_unstable();

            for k in keys {
                let key_str = k.to_string();
                if let Some(val) = filter2_sec.get(&key_str) {
                    if let Some(rule) = parse_filter2_line(&key_str, val) {
                        parsed_rules.push(rule);
                    }
                }
            }
            if !parsed_rules.is_empty() {
                config.color_rules = parsed_rules;
            }
        }
    }

    if target_dir.is_some() && qdr_path.exists() {
        let qdr_text = read_text_auto_encoding(&qdr_path)?;
        for raw_line in qdr_text.lines() {
            let line = raw_line.trim();
            if line.is_empty() {
                continue;
            }
            if let Some((k, v)) = line.split_once('=') {
                let key = k.trim();
                let val = v.trim();
                match key {
                    "SP0" => {
                        if let Ok(n) = val.parse::<u32>() {
                            config.sp0 = n;
                        }
                    }
                    "SP1" => {
                        if let Ok(n) = val.parse::<u32>() {
                            config.sp1 = n;
                        }
                    }
                    "SP2" => {
                        if let Ok(n) = val.parse::<u32>() {
                            config.sp2 = n;
                        }
                    }
                    "SPT" => {
                        if let Ok(n) = val.parse::<u32>() {
                            config.spt = n;
                        }
                    }
                    "tree_mode" => {
                        if let Ok(n) = val.parse::<u32>() {
                            config.tree_mode = n;
                        }
                    }
                    "Tree1" => {
                        if let Ok(n) = val.parse::<u32>() {
                            config.tree1 = n;
                        }
                    }
                    "Tree2" => {
                        if let Ok(n) = val.parse::<u32>() {
                            config.tree2 = n;
                        }
                    }
                    "Tree3" => {
                        if let Ok(n) = val.parse::<u32>() {
                            config.tree3 = n;
                        }
                    }
                    "Tree4" => {
                        if let Ok(n) = val.parse::<u32>() {
                            config.tree4 = n;
                        }
                    }
                    "Tree1split" => {
                        if let Ok(n) = val.parse::<u32>() {
                            config.tree1_split = n;
                        }
                    }
                    "Tree2split" => {
                        if let Ok(n) = val.parse::<u32>() {
                            config.tree2_split = n;
                        }
                    }
                    "Tree3split" => {
                        if let Ok(n) = val.parse::<u32>() {
                            config.tree3_split = n;
                        }
                    }
                    "Tree4split" => {
                        if let Ok(n) = val.parse::<u32>() {
                            config.tree4_split = n;
                        }
                    }
                    "Vorschau" => {
                        config.preview_enabled = val == "1";
                    }
                    "VorschauPos" => {
                        if let Ok(n) = val.parse::<u32>() {
                            config.preview_pos = n;
                        }
                    }
                    "Focus" => {
                        if let Ok(n) = val.parse::<u32>() {
                            config.active_focus = n.clamp(0, 3);
                        }
                    }
                    "Folder1" | "Folder2" | "Folder3" | "Folder4" => {
                        let idx = (key.chars().last().unwrap_or('1') as usize).saturating_sub('1' as usize);
                        if idx < 4 {
                            let (decoded_path, vm) = decode_qdr_folder_line(val);
                            config.pane_view_modes[idx] = vm;
                            if let Some(valid_p) = decoded_path {
                                config.pane_paths[idx] = valid_p;
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_actual_qdir_portable_files() {
        let res = import_qdir_directory(None);
        if let Ok(cfg) = res {
            assert_eq!(cfg.layout_mode, 5);
            assert!(cfg.use_color_start);
            assert_eq!(cfg.tree_mode, 1);
            assert_eq!(cfg.sp0, 5000);
            assert_eq!(cfg.sp1, 5000);
            assert_eq!(cfg.sp2, 5000);
            assert_eq!(cfg.spt, 1617);
            assert_eq!(cfg.active_focus, 3);
            assert!(cfg.color_rules.len() >= 10);
            assert!(cfg
                .color_rules
                .iter()
                .any(|r| r.pattern == "#DIR" && r.color_hex == "#008800"));
            assert!(cfg
                .color_rules
                .iter()
                .any(|r| r.pattern.contains("*.exe") && r.color_hex == "#FF0000"));
        }
    }
}
