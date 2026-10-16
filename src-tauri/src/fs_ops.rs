use crate::jobs::Reporter;
use crate::models::{DriveInfo, FileEntry, FolderSizeStats, SpecialPaths};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

#[cfg(windows)]
use std::os::windows::fs::MetadataExt;

const FILE_ATTRIBUTE_READONLY: u32 = 0x00000001;
const FILE_ATTRIBUTE_HIDDEN: u32 = 0x00000002;
const FILE_ATTRIBUTE_SYSTEM: u32 = 0x00000004;

fn system_time_to_ms(time: std::io::Result<std::time::SystemTime>) -> i64 {
    time.ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn describe_file_type(is_dir: bool, ext: &str) -> String {
    if is_dir {
        return "파일 폴더".to_string();
    }
    if ext.is_empty() {
        return "파일".to_string();
    }
    match ext.to_ascii_lowercase().as_str() {
        "exe" | "msi" | "com" => "응용 프로그램".to_string(),
        "bat" | "cmd" | "ps1" => "Windows 스크립트".to_string(),
        "dll" | "sys" | "ocx" => "시스템 확장 파일".to_string(),
        "zip" | "rar" | "7z" | "gz" | "tar" | "bz2" | "xz" => "압축 아카이브".to_string(),
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "ico" | "webp" | "svg" => "이미지 파일".to_string(),
        "mp4" | "mkv" | "avi" | "mov" | "wmv" | "webm" => "비디오 미디어".to_string(),
        "mp3" | "wav" | "flac" | "wma" | "ogg" | "m4a" | "aac" => "오디오 미디어".to_string(),
        "pdf" => "PDF 문서".to_string(),
        "doc" | "docx" | "hwp" | "hwpx" | "rtf" => "워드/한글 문서".to_string(),
        "xls" | "xlsx" | "csv" => "스프레드시트".to_string(),
        "ppt" | "pptx" => "프레젠테이션".to_string(),
        "txt" | "md" | "log" => "텍스트 문서".to_string(),
        "ini" | "qdr" | "cfg" | "conf" | "toml" | "yaml" | "yml" | "json" => "설정 파일".to_string(),
        "html" | "htm" | "url" => "웹 문서/바로가기".to_string(),
        "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "c" | "cpp" | "h" | "hpp" | "cs" | "java" | "go" => {
            format!("{} 소스 코드", ext.to_ascii_uppercase())
        }
        other => format!("{} 파일", other.to_ascii_uppercase()),
    }
}

pub fn normalize_windows_path(raw: &str) -> PathBuf {
    let trimmed = raw.trim();
    if trimmed.len() == 2 && trimmed.ends_with(':') {
        PathBuf::from(format!("{}\\", trimmed))
    } else {
        PathBuf::from(trimmed)
    }
}

pub fn entry_from_path(path: &Path) -> Option<FileEntry> {
    let meta = fs::symlink_metadata(path).ok()?;
    let is_dir = meta.is_dir();
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string());

    #[cfg(windows)]
    let attrs = meta.file_attributes();
    #[cfg(not(windows))]
    let attrs = 0u32;

    let is_hidden = (attrs & FILE_ATTRIBUTE_HIDDEN) != 0 || name.starts_with('.');
    let is_system = (attrs & FILE_ATTRIBUTE_SYSTEM) != 0;
    let is_readonly = (attrs & FILE_ATTRIBUTE_READONLY) != 0 || meta.permissions().readonly();

    let extension = if is_dir {
        String::new()
    } else {
        path.extension()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_default()
    };

    let file_type = describe_file_type(is_dir, &extension);

    Some(FileEntry {
        name,
        path: path.to_string_lossy().to_string(),
        is_dir,
        is_hidden,
        is_system,
        is_readonly,
        size: if is_dir { 0 } else { meta.len() },
        modified_ms: system_time_to_ms(meta.modified()),
        created_ms: system_time_to_ms(meta.created()),
        extension,
        file_type,
    })
}

pub fn list_directory(path: String, show_hidden: bool) -> Result<Vec<FileEntry>, String> {
    let target = normalize_windows_path(&path);
    if !target.exists() {
        return Err(format!("경로가 존재하지 않습니다: {}", target.display()));
    }
    if !target.is_dir() {
        return Err(format!("디렉토리가 아닙니다: {}", target.display()));
    }

    let read_dir = fs::read_dir(&target)
        .map_err(|e| format!("디렉토리 읽기 실패 ({}): {}", target.display(), e))?;

    let mut entries = Vec::new();
    for item in read_dir.flatten() {
        let item_path = item.path();
        if let Some(fe) = entry_from_path(&item_path) {
            if !show_hidden && fe.is_hidden {
                continue;
            }
            entries.push(fe);
        }
    }

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

pub fn list_subdirectories(path: String, show_hidden: bool) -> Result<Vec<FileEntry>, String> {
    let all = list_directory(path, show_hidden)?;
    Ok(all.into_iter().filter(|e| e.is_dir).collect())
}

pub fn list_drives() -> Result<Vec<DriveInfo>, String> {
    let mut drives = Vec::new();

    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            GetDiskFreeSpaceExW, GetDriveTypeW, GetLogicalDrives, GetVolumeInformationW,
        };

        let bitmask = unsafe { GetLogicalDrives() };
        for i in 0..26u32 {
            if (bitmask & (1 << i)) == 0 {
                continue;
            }
            let letter_char = (b'A' + i as u8) as char;
            let letter = format!("{}:", letter_char);
            let root_path = format!("{}:\\", letter_char);
            let wide_root: Vec<u16> = std::ffi::OsStr::new(&root_path)
                .encode_wide()
                .chain([0])
                .collect();

            let dtype_code = unsafe { GetDriveTypeW(wide_root.as_ptr()) };
            let drive_type = match dtype_code {
                2 => "이동식 디스크".to_string(),
                3 => "로컬 디스크".to_string(),
                4 => "네트워크 드라이브".to_string(),
                5 => "CD/DVD 드라이브".to_string(),
                6 => "RAM 디스크".to_string(),
                _ => "디스크".to_string(),
            };

            let mut free_avail: u64 = 0;
            let mut total_bytes: u64 = 0;
            let mut total_free: u64 = 0;
            unsafe {
                GetDiskFreeSpaceExW(
                    wide_root.as_ptr(),
                    &mut free_avail,
                    &mut total_bytes,
                    &mut total_free,
                );
            }

            let mut vol_name_buf = [0u16; 261];
            let mut serial_num = 0u32;
            let mut max_comp_len = 0u32;
            let mut fs_flags = 0u32;
            let ok = unsafe {
                GetVolumeInformationW(
                    wide_root.as_ptr(),
                    vol_name_buf.as_mut_ptr(),
                    vol_name_buf.len() as u32,
                    &mut serial_num,
                    &mut max_comp_len,
                    &mut fs_flags,
                    std::ptr::null_mut(),
                    0,
                )
            };

            let label = if ok != 0 {
                let len = vol_name_buf
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(vol_name_buf.len());
                let raw_label = String::from_utf16_lossy(&vol_name_buf[..len]);
                if raw_label.trim().is_empty() {
                    drive_type.clone()
                } else {
                    raw_label
                }
            } else {
                drive_type.clone()
            };

            drives.push(DriveInfo {
                letter,
                root_path,
                label,
                drive_type,
                total_bytes,
                free_bytes: total_free,
            });
        }
    }

    Ok(drives)
}

pub fn get_special_paths() -> Result<SpecialPaths, String> {
    let user_profile = env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\Public".to_string());
    let appdata = env::var("APPDATA").unwrap_or_else(|_| format!("{}\\AppData\\Roaming", user_profile));
    let windir = env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string());
    let sysdir = format!("{}\\System32", windir);
    let desktop = format!("{}\\Desktop", user_profile);
    let documents = format!("{}\\Documents", user_profile);
    let downloads = format!("{}\\Downloads", user_profile);
    let current_dir = env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "C:\\".to_string());

    Ok(SpecialPaths {
        desktop,
        documents,
        downloads,
        appdata,
        windir,
        sysdir,
        user_profile,
        current_dir,
    })
}

pub fn calculate_folder_size(path: String, rep: &Reporter) -> Result<FolderSizeStats, String> {
    let root = normalize_windows_path(&path);
    if !root.exists() {
        return Err(format!("경로를 찾을 수 없습니다: {}", root.display()));
    }

    let mut total_bytes = 0u64;
    let mut file_count = 0u64;
    let mut dir_count = 0u64;

    let mut cancelled = false;
    let mut seen = 0u64;
    for entry in WalkDir::new(&root).max_depth(32).into_iter().flatten() {
        if entry.path() == root {
            continue;
        }
        seen += 1;
        if seen % 500 == 0 {
            if rep.is_cancelled() {
                cancelled = true;
                break;
            }
            let cur = entry.path().parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
            rep.set_progress(total_bytes, file_count, &cur);
        }
        if let Ok(meta) = entry.metadata() {
            if meta.is_dir() {
                dir_count += 1;
            } else {
                file_count += 1;
                total_bytes += meta.len();
            }
        }
    }

    Ok(FolderSizeStats {
        path: root.to_string_lossy().to_string(),
        total_bytes,
        file_count,
        dir_count,
        cancelled,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_list_directory_and_folder_size() {
        let dir = tempdir().expect("create temp dir");
        let sub = dir.path().join("SubFolder");
        fs::create_dir(&sub).unwrap();
        let f1 = dir.path().join("alpha.txt");
        fs::write(&f1, b"hello world").unwrap();
        let f2 = sub.join("archive.zip");
        fs::write(&f2, b"1234567890").unwrap();

        let entries = list_directory(dir.path().to_string_lossy().to_string(), true).unwrap();
        assert_eq!(entries.len(), 2);
        // Directory should be sorted first
        assert!(entries[0].is_dir);
        assert_eq!(entries[0].name, "SubFolder");
        assert_eq!(entries[1].name, "alpha.txt");
        assert_eq!(entries[1].size, 11);

        let stats = calculate_folder_size(dir.path().to_string_lossy().to_string(), &Reporter::noop()).unwrap();
        assert_eq!(stats.file_count, 2);
        assert_eq!(stats.dir_count, 1);
        assert_eq!(stats.total_bytes, 21);
    }
}
