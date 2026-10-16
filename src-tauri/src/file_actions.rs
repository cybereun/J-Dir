use crate::fs_ops::normalize_windows_path;
use crate::models::{FileActionError, FileActionReport, FileEntry};
use chrono::{DateTime, Local, TimeZone};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

fn resolve_collision_path(dest_dir: &Path, file_name: &str, overwrite: bool) -> PathBuf {
    let candidate = dest_dir.join(file_name);
    if overwrite || !candidate.exists() {
        return candidate;
    }

    let path_obj = Path::new(file_name);
    let stem = path_obj
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| file_name.to_string());
    let ext = path_obj
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();

    for idx in 1..1000 {
        let numbered = dest_dir.join(format!("{} ({}){}", stem, idx, ext));
        if !numbered.exists() {
            return numbered;
        }
    }
    candidate
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    if !dst.exists() {
        fs::create_dir_all(dst).map_err(|e| format!("폴더 생성 실패 ({}): {}", dst.display(), e))?;
    }
    let entries = fs::read_dir(src).map_err(|e| format!("폴더 읽기 실패 ({}): {}", src.display(), e))?;
    for item in entries.flatten() {
        let item_path = item.path();
        let target_path = dst.join(item.file_name());
        if item_path.is_dir() {
            copy_dir_recursive(&item_path, &target_path)?;
        } else {
            fs::copy(&item_path, &target_path)
                .map_err(|e| format!("파일 복사 실패 ({}): {}", item_path.display(), e))?;
        }
    }
    Ok(())
}

pub fn copy_items(
    sources: Vec<String>,
    destination_dir: String,
    overwrite: bool,
) -> Result<FileActionReport, String> {
    let dest = normalize_windows_path(&destination_dir);
    if !dest.exists() || !dest.is_dir() {
        return Err(format!("대상 폴더가 존재하지 않습니다: {}", dest.display()));
    }

    let mut succeeded = Vec::new();
    let mut failed = Vec::new();

    for src_str in sources {
        let src = PathBuf::from(&src_str);
        if !src.exists() {
            failed.push(FileActionError {
                path: src_str,
                error: "원본 항목이 존재하지 않습니다.".to_string(),
            });
            continue;
        }
        let Some(name_os) = src.file_name() else {
            failed.push(FileActionError {
                path: src_str,
                error: "유효하지 않은 파일 이름입니다.".to_string(),
            });
            continue;
        };
        let file_name = name_os.to_string_lossy().to_string();
        let target = resolve_collision_path(&dest, &file_name, overwrite);

        let res = if src.is_dir() {
            if target.starts_with(&src) && target != src {
                Err("상위 폴더를 자기 자신의 하위 폴더로 복사할 수 없습니다.".to_string())
            } else {
                copy_dir_recursive(&src, &target)
            }
        } else {
            fs::copy(&src, &target)
                .map(|_| ())
                .map_err(|e| format!("복사 오류: {}", e))
        };

        match res {
            Ok(()) => succeeded.push(target.to_string_lossy().to_string()),
            Err(err) => failed.push(FileActionError {
                path: src_str,
                error: err,
            }),
        }
    }

    Ok(FileActionReport { succeeded, failed })
}

pub fn move_items(
    sources: Vec<String>,
    destination_dir: String,
    overwrite: bool,
) -> Result<FileActionReport, String> {
    let dest = normalize_windows_path(&destination_dir);
    if !dest.exists() || !dest.is_dir() {
        return Err(format!("대상 폴더가 존재하지 않습니다: {}", dest.display()));
    }

    let mut succeeded = Vec::new();
    let mut failed = Vec::new();

    for src_str in sources {
        let src = PathBuf::from(&src_str);
        if !src.exists() {
            failed.push(FileActionError {
                path: src_str,
                error: "원본 항목이 존재하지 않습니다.".to_string(),
            });
            continue;
        }
        let Some(name_os) = src.file_name() else {
            failed.push(FileActionError {
                path: src_str,
                error: "유효하지 않은 파일 이름입니다.".to_string(),
            });
            continue;
        };
        let file_name = name_os.to_string_lossy().to_string();
        let target = resolve_collision_path(&dest, &file_name, overwrite);

        if src == target {
            succeeded.push(target.to_string_lossy().to_string());
            continue;
        }

        if src.is_dir() && target.starts_with(&src) {
            failed.push(FileActionError {
                path: src_str,
                error: "폴더를 자기 자신의 하위 폴더로 이동할 수 없습니다.".to_string(),
            });
            continue;
        }

        // Try fast fs::rename first; fallback to copy + remove across volumes
        match fs::rename(&src, &target) {
            Ok(()) => succeeded.push(target.to_string_lossy().to_string()),
            Err(_) => {
                let fallback = if src.is_dir() {
                    copy_dir_recursive(&src, &target)
                        .and_then(|_| fs::remove_dir_all(&src).map_err(|e| e.to_string()))
                } else {
                    fs::copy(&src, &target)
                        .map_err(|e| e.to_string())
                        .and_then(|_| fs::remove_file(&src).map_err(|e| e.to_string()))
                };
                match fallback {
                    Ok(()) => succeeded.push(target.to_string_lossy().to_string()),
                    Err(err) => failed.push(FileActionError {
                        path: src_str,
                        error: format!("이동 실패: {}", err),
                    }),
                }
            }
        }
    }

    Ok(FileActionReport { succeeded, failed })
}

#[cfg(windows)]
fn move_to_recycle_bin_win32(path_str: &str) -> Result<(), String> {
    use std::ptr::null;
    use windows_sys::Win32::UI::Shell::{
        SHFileOperationW, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT, FO_DELETE,
        SHFILEOPSTRUCTW,
    };

    let mut from: Vec<u16> = path_str.encode_utf16().collect();
    from.push(0);
    from.push(0);

    let mut op = SHFILEOPSTRUCTW {
        hwnd: std::ptr::null_mut(),
        wFunc: FO_DELETE,
        pFrom: from.as_ptr(),
        pTo: null(),
        fFlags: (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_NOERRORUI | FOF_SILENT) as u16,
        fAnyOperationsAborted: 0,
        hNameMappings: std::ptr::null_mut(),
        lpszProgressTitle: null(),
    };

    let code = unsafe { SHFileOperationW(&mut op) };
    if code == 0 && op.fAnyOperationsAborted == 0 && !Path::new(path_str).exists() {
        Ok(())
    } else {
        Err(format!("휴지통 이동 실패 (오류 코드: {})", code))
    }
}

pub fn delete_items(paths: Vec<String>, permanent: bool) -> Result<FileActionReport, String> {
    let mut succeeded = Vec::new();
    let mut failed = Vec::new();

    for path_str in paths {
        let path = PathBuf::from(&path_str);
        if !path.exists() {
            failed.push(FileActionError {
                path: path_str,
                error: "항목이 이미 존재하지 않습니다.".to_string(),
            });
            continue;
        }

        let res = if !permanent {
            #[cfg(windows)]
            {
                move_to_recycle_bin_win32(&path_str)
            }
            #[cfg(not(windows))]
            {
                if path.is_dir() {
                    fs::remove_dir_all(&path).map_err(|e| e.to_string())
                } else {
                    fs::remove_file(&path).map_err(|e| e.to_string())
                }
            }
        } else if path.is_dir() {
            fs::remove_dir_all(&path).map_err(|e| format!("폴더 영구 삭제 실패: {}", e))
        } else {
            fs::remove_file(&path).map_err(|e| format!("파일 영구 삭제 실패: {}", e))
        };

        match res {
            Ok(()) => succeeded.push(path_str),
            Err(err) => failed.push(FileActionError {
                path: path_str,
                error: err,
            }),
        }
    }

    Ok(FileActionReport { succeeded, failed })
}

pub fn rename_item(path: String, new_name: String) -> Result<String, String> {
    let trimmed = new_name.trim();
    if trimmed.is_empty() || trimmed.contains(['\\', '/', ':', '*', '?', '"', '<', '>', '|']) {
        return Err("파일 이름에 사용할 수 없는 문자가 포함되어 있습니다.".to_string());
    }

    let src = PathBuf::from(&path);
    if !src.exists() {
        return Err("원본 파일이나 폴더가 존재하지 않습니다.".to_string());
    }

    let parent = src
        .parent()
        .ok_or_else(|| "상위 폴더를 확인할 수 없습니다.".to_string())?;
    let dst = parent.join(trimmed);

    if dst.exists() && dst != src {
        return Err(format!("이미 같은 이름의 항목이 존재합니다: {}", trimmed));
    }

    fs::rename(&src, &dst).map_err(|e| format!("이름 변경 실패: {}", e))?;
    Ok(dst.to_string_lossy().to_string())
}

pub fn create_directory(parent_dir: String, name: String) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("폴더 이름을 입력해 주세요.".to_string());
    }
    let parent = normalize_windows_path(&parent_dir);
    let target = resolve_collision_path(&parent, trimmed, false);
    fs::create_dir_all(&target).map_err(|e| format!("새 폴더 생성 실패: {}", e))?;
    Ok(target.to_string_lossy().to_string())
}

pub fn create_text_file(parent_dir: String, name: String, content: String) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("파일 이름을 입력해 주세요.".to_string());
    }
    let parent = normalize_windows_path(&parent_dir);
    let target = resolve_collision_path(&parent, trimmed, false);
    fs::write(&target, content.as_bytes()).map_err(|e| format!("새 파일 생성 실패: {}", e))?;
    Ok(target.to_string_lossy().to_string())
}

pub fn open_item(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        Command::new("cmd")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|e| format!("항목 열기 실패: {}", e))?;
    }
    Ok(())
}

pub fn open_in_explorer(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let p = Path::new(&path);
        if p.is_file() {
            Command::new("explorer.exe")
                .arg(format!("/select,{}", path))
                .spawn()
                .map_err(|e| format!("탐색기 열기 실패: {}", e))?;
        } else {
            Command::new("explorer.exe")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("탐색기 열기 실패: {}", e))?;
        }
    }
    Ok(())
}

pub fn open_in_terminal(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let dir = if Path::new(&path).is_file() {
            Path::new(&path)
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or(path)
        } else {
            path
        };
        Command::new("cmd")
            .args(["/C", "start", "powershell.exe", "-NoExit", "-Command", &format!("Set-Location -LiteralPath '{}'", dir.replace('\'', "''"))])
            .spawn()
            .map_err(|e| format!("터미널 열기 실패: {}", e))?;
    }
    Ok(())
}

fn format_timestamp(ms: i64) -> String {
    if ms <= 0 {
        return "-".to_string();
    }
    Local
        .timestamp_millis_opt(ms)
        .single()
        .map(|dt: DateTime<Local>| dt.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_else(|| "-".to_string())
}

pub fn export_file_list(
    entries: Vec<FileEntry>,
    output_path: String,
    format: String,
) -> Result<String, String> {
    let mut out = String::new();
    let is_csv = format.eq_ignore_ascii_case("csv");

    if is_csv {
        // UTF-8 BOM for Excel Korean compatibility
        out.push('\u{FEFF}');
        out.push_str("이름,유형,크기(Bytes),수정한 날짜,숨김,전체 경로\r\n");
        for e in &entries {
            let escaped_name = e.name.replace('"', "\"\"");
            let escaped_type = e.file_type.replace('"', "\"\"");
            let escaped_path = e.path.replace('"', "\"\"");
            out.push_str(&format!(
                "\"{}\",\"{}\",{},{},{},\"{}\"\r\n",
                escaped_name,
                escaped_type,
                if e.is_dir { 0 } else { e.size },
                format_timestamp(e.modified_ms),
                if e.is_hidden { "Y" } else { "N" },
                escaped_path
            ));
        }
    } else {
        out.push_str("================================================================================\r\n");
        out.push_str(&format!("J-Dir 파일 목록 내보내기 (총 {}개 항목)\r\n", entries.len()));
        out.push_str("================================================================================\r\n");
        out.push_str(&format!(
            "{:<40} {:<16} {:>14} {:<20}\r\n",
            "이름", "유형", "크기(Bytes)", "수정한 날짜"
        ));
        out.push_str("--------------------------------------------------------------------------------\r\n");
        for e in &entries {
            let size_str = if e.is_dir {
                "<DIR>".to_string()
            } else {
                format!("{}", e.size)
            };
            out.push_str(&format!(
                "{:<40} {:<16} {:>14} {:<20}\r\n",
                e.name,
                e.file_type,
                size_str,
                format_timestamp(e.modified_ms)
            ));
        }
    }

    fs::write(&output_path, out.as_bytes())
        .map_err(|e| format!("목록 내보내기 파일 저장 실패: {}", e))?;
    Ok(output_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_file_lifecycle_copy_move_rename_export() {
        let src_dir = tempdir().unwrap();
        let dst_dir = tempdir().unwrap();

        let created = create_text_file(
            src_dir.path().to_string_lossy().to_string(),
            "note.txt".to_string(),
            "J-Dir Test Content".to_string(),
        )
        .unwrap();
        assert!(Path::new(&created).exists());

        let renamed = rename_item(created, "renamed_note.txt".to_string()).unwrap();
        assert!(Path::new(&renamed).exists());

        let copy_rep = copy_items(
            vec![renamed.clone()],
            dst_dir.path().to_string_lossy().to_string(),
            false,
        )
        .unwrap();
        assert_eq!(copy_rep.succeeded.len(), 1);
        assert!(Path::new(&copy_rep.succeeded[0]).exists());

        let csv_out = dst_dir.path().join("export.csv").to_string_lossy().to_string();
        let entries = crate::fs_ops::list_directory(dst_dir.path().to_string_lossy().to_string(), true).unwrap();
        export_file_list(entries, csv_out.clone(), "csv".to_string()).unwrap();
        let csv_text = fs::read_to_string(&csv_out).unwrap();
        assert!(csv_text.contains("renamed_note.txt"));
    }
}
