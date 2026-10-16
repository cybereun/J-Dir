use crate::fs_ops::normalize_windows_path;
use crate::jobs::Reporter;
use crate::models::{FileActionError, FileActionReport, FileEntry, PathPair};
use chrono::{DateTime, Local, TimeZone};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use walkdir::WalkDir;

pub fn resolve_collision_path(dest_dir: &Path, file_name: &str, overwrite: bool) -> PathBuf {
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

fn is_reparse_point(path: &Path) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        fs::symlink_metadata(path)
            .map(|m| m.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0)
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        fs::symlink_metadata(path)
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(false)
    }
}

fn path_key(p: &Path) -> String {
    p.to_string_lossy()
        .trim_end_matches(['\\', '/'])
        .to_lowercase()
}

fn is_same_dir(a: &Path, b: &Path) -> bool {
    path_key(a) == path_key(b)
}

fn is_inside(child: &Path, parent: &Path) -> bool {
    path_key(child).starts_with(&format!("{}\\", path_key(parent)))
}

fn item_in_dir(src: &Path, dest: &Path) -> bool {
    src.parent().is_some_and(|p| is_same_dir(p, dest))
}

pub fn exists_any(p: &Path) -> bool {
    fs::symlink_metadata(p).is_ok()
}

const CANCEL_MSG: &str = "사용자가 작업을 취소했습니다.";
const CHUNK_COPY_THRESHOLD: u64 = 8 * 1024 * 1024;

/// Copies one file, reporting progress. Large files are streamed in chunks so the job can be cancelled.
fn copy_file_progress(src: &Path, dst: &Path, rep: &Reporter) -> Result<(), String> {
    let meta = fs::metadata(src).map_err(|e| format!("파일 정보 읽기 실패 ({}): {}", src.display(), e))?;
    let name = src
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    if rep.is_cancelled() {
        return Err(CANCEL_MSG.to_string());
    }
    if meta.len() < CHUNK_COPY_THRESHOLD {
        fs::copy(src, dst).map_err(|e| format!("파일 복사 실패 ({}): {}", src.display(), e))?;
        rep.add_bytes(meta.len(), &name);
        return Ok(());
    }

    let mut input = fs::File::open(src).map_err(|e| format!("파일 열기 실패 ({}): {}", src.display(), e))?;
    let mut output = fs::File::create(dst).map_err(|e| format!("파일 생성 실패 ({}): {}", dst.display(), e))?;
    let mut buf = vec![0u8; 1024 * 1024];
    loop {
        if rep.is_cancelled() {
            drop(output);
            let _ = fs::remove_file(dst);
            return Err(CANCEL_MSG.to_string());
        }
        let n = input.read(&mut buf).map_err(|e| format!("파일 읽기 실패: {}", e))?;
        if n == 0 {
            break;
        }
        output
            .write_all(&buf[..n])
            .map_err(|e| format!("파일 쓰기 실패 ({}): {}", dst.display(), e))?;
        rep.add_bytes(n as u64, &name);
    }
    if let Ok(modified) = meta.modified() {
        let _ = output.set_modified(modified);
    }
    drop(output);
    let _ = fs::set_permissions(dst, meta.permissions());
    Ok(())
}

/// Copies a directory tree. Junctions/symlinked folders are skipped (to avoid infinite
/// recursion); returns the number of skipped links.
fn copy_dir_recursive(src: &Path, dst: &Path, rep: &Reporter) -> Result<u32, String> {
    if !dst.exists() {
        fs::create_dir_all(dst).map_err(|e| format!("폴더 생성 실패 ({}): {}", dst.display(), e))?;
    }
    let mut skipped = 0u32;
    let entries = fs::read_dir(src).map_err(|e| format!("폴더 읽기 실패 ({}): {}", src.display(), e))?;
    for item in entries.flatten() {
        let item_path = item.path();
        let target_path = dst.join(item.file_name());
        if item_path.is_dir() {
            if is_reparse_point(&item_path) {
                skipped += 1;
                continue;
            }
            skipped += copy_dir_recursive(&item_path, &target_path, rep)?;
        } else {
            copy_file_progress(&item_path, &target_path, rep)?;
        }
    }
    Ok(skipped)
}

/// Total bytes of a file or directory tree (links are not followed).
fn tree_size(path: &Path) -> u64 {
    WalkDir::new(path)
        .follow_links(false)
        .into_iter()
        .flatten()
        .filter(|e| e.file_type().is_file())
        .map(|e| e.metadata().map(|m| m.len()).unwrap_or(0))
        .sum()
}

/// Returns names of sources that would collide with an existing item in `destination_dir`.
/// Items already located in the destination are not conflicts (copy auto-renames, move is a no-op).
pub fn check_conflicts(sources: Vec<String>, destination_dir: String) -> Result<Vec<String>, String> {
    let dest = normalize_windows_path(&destination_dir);
    if !dest.is_dir() {
        return Err(format!("대상 폴더가 존재하지 않습니다: {}", dest.display()));
    }
    let mut out = Vec::new();
    for src_str in sources {
        let src = PathBuf::from(&src_str);
        if item_in_dir(&src, &dest) {
            continue;
        }
        if let Some(name) = src.file_name() {
            if exists_any(&dest.join(name)) {
                out.push(name.to_string_lossy().to_string());
            }
        }
    }
    Ok(out)
}

/// policy: "rename" (keep both), "overwrite", "skip". Returns Ok(None) when the item is skipped.
fn resolve_target(src: &Path, dest: &Path, file_name: &str, policy: &str) -> Result<Option<PathBuf>, String> {
    if item_in_dir(src, dest) {
        return Ok(Some(resolve_collision_path(dest, file_name, false)));
    }
    let candidate = dest.join(file_name);
    if !exists_any(&candidate) {
        return Ok(Some(candidate));
    }
    match policy {
        "skip" => Ok(None),
        "overwrite" => {
            if candidate.is_dir() != src.is_dir() {
                Err("폴더와 파일 형식이 달라 덮어쓸 수 없습니다.".to_string())
            } else {
                Ok(Some(candidate))
            }
        }
        _ => Ok(Some(resolve_collision_path(dest, file_name, false))),
    }
}

pub fn copy_items(
    sources: Vec<String>,
    destination_dir: String,
    policy: String,
    rep: &Reporter,
) -> Result<FileActionReport, String> {
    let dest = normalize_windows_path(&destination_dir);
    if !dest.exists() || !dest.is_dir() {
        return Err(format!("대상 폴더가 존재하지 않습니다: {}", dest.display()));
    }

    let mut report = FileActionReport::default();
    let total_bytes: u64 = sources.iter().map(|s| tree_size(Path::new(s))).sum();
    rep.set_totals(total_bytes, sources.len() as u64);

    for src_str in sources {
        if rep.is_cancelled() {
            report.cancelled = true;
            break;
        }
        let src = PathBuf::from(&src_str);
        if !src.exists() {
            report.failed.push(FileActionError {
                path: src_str,
                error: "원본 항목이 존재하지 않습니다.".to_string(),
            });
            continue;
        }
        let Some(name_os) = src.file_name() else {
            report.failed.push(FileActionError {
                path: src_str,
                error: "유효하지 않은 파일 이름입니다.".to_string(),
            });
            continue;
        };
        let file_name = name_os.to_string_lossy().to_string();
        let target = match resolve_target(&src, &dest, &file_name, &policy) {
            Ok(Some(t)) => t,
            Ok(None) => {
                report.skipped.push(src_str);
                continue;
            }
            Err(err) => {
                report.failed.push(FileActionError { path: src_str, error: err });
                continue;
            }
        };

        let res = if src.is_dir() {
            if is_same_dir(&target, &src) || is_inside(&target, &src) {
                Err("상위 폴더를 자기 자신의 하위 폴더로 복사할 수 없습니다.".to_string())
            } else {
                copy_dir_recursive(&src, &target, rep).map(|_| ())
            }
        } else {
            copy_file_progress(&src, &target, rep)
        };

        match res {
            Ok(()) => {
                let target_str = target.to_string_lossy().to_string();
                report.pairs.push(PathPair { from: src_str, to: target_str.clone() });
                report.succeeded.push(target_str);
                rep.item_done(&file_name);
            }
            Err(err) if err == CANCEL_MSG => {
                // remove the partially copied item so no half-written tree is left behind
                if !exists_any(&src) || target != src {
                    if target.is_dir() {
                        let _ = fs::remove_dir_all(&target);
                    }
                }
                report.cancelled = true;
                break;
            }
            Err(err) => report.failed.push(FileActionError {
                path: src_str,
                error: err,
            }),
        }
    }

    Ok(report)
}

pub fn move_items(
    sources: Vec<String>,
    destination_dir: String,
    policy: String,
    rep: &Reporter,
) -> Result<FileActionReport, String> {
    let dest = normalize_windows_path(&destination_dir);
    if !dest.exists() || !dest.is_dir() {
        return Err(format!("대상 폴더가 존재하지 않습니다: {}", dest.display()));
    }

    let mut report = FileActionReport::default();
    // Byte totals are only known lazily (when a rename has to fall back to copy+delete).
    rep.set_totals(0, sources.len() as u64);

    for src_str in sources {
        if rep.is_cancelled() {
            report.cancelled = true;
            break;
        }
        let src = PathBuf::from(&src_str);
        if !src.exists() {
            report.failed.push(FileActionError {
                path: src_str,
                error: "원본 항목이 존재하지 않습니다.".to_string(),
            });
            continue;
        }
        let Some(name_os) = src.file_name() else {
            report.failed.push(FileActionError {
                path: src_str,
                error: "유효하지 않은 파일 이름입니다.".to_string(),
            });
            continue;
        };
        // Moving an item into the folder it already lives in is a no-op.
        if item_in_dir(&src, &dest) {
            report.skipped.push(src_str);
            continue;
        }
        let file_name = name_os.to_string_lossy().to_string();
        let target = match resolve_target(&src, &dest, &file_name, &policy) {
            Ok(Some(t)) => t,
            Ok(None) => {
                report.skipped.push(src_str);
                continue;
            }
            Err(err) => {
                report.failed.push(FileActionError { path: src_str, error: err });
                continue;
            }
        };

        if src.is_dir() && (is_same_dir(&target, &src) || is_inside(&target, &src)) {
            report.failed.push(FileActionError {
                path: src_str,
                error: "폴더를 자기 자신의 하위 폴더로 이동할 수 없습니다.".to_string(),
            });
            continue;
        }

        // Try fast fs::rename first; fallback to copy + remove across volumes
        match fs::rename(&src, &target) {
            Ok(()) => {
                let target_str = target.to_string_lossy().to_string();
                report.pairs.push(PathPair { from: src_str, to: target_str.clone() });
                report.succeeded.push(target_str);
                rep.item_done(&file_name);
            }
            Err(_) => {
                rep.add_total_bytes(tree_size(&src));
                let fallback = if src.is_dir() {
                    copy_dir_recursive(&src, &target, rep).and_then(|skipped| {
                        if skipped > 0 {
                            Err("링크(정션) 폴더가 포함되어 있어 원본을 유지했습니다.".to_string())
                        } else {
                            fs::remove_dir_all(&src).map_err(|e| e.to_string())
                        }
                    })
                } else {
                    copy_file_progress(&src, &target, rep)
                        .and_then(|_| fs::remove_file(&src).map_err(|e| e.to_string()))
                };
                match fallback {
                    Ok(()) => {
                        let target_str = target.to_string_lossy().to_string();
                        report.pairs.push(PathPair { from: src_str, to: target_str.clone() });
                        report.succeeded.push(target_str);
                        rep.item_done(&file_name);
                    }
                    Err(err) if err == CANCEL_MSG => {
                        if src.is_dir() && target.is_dir() {
                            let _ = fs::remove_dir_all(&target);
                        }
                        report.cancelled = true;
                        break;
                    }
                    Err(err) => report.failed.push(FileActionError {
                        path: src_str,
                        error: format!("이동 실패: {}", err),
                    }),
                }
            }
        }
    }

    Ok(report)
}

/// Reverts earlier moves/renames: moves every `to` back to its `from` location.
pub fn restore_moves(pairs: Vec<PathPair>) -> Result<FileActionReport, String> {
    let mut report = FileActionReport::default();
    for pair in pairs {
        let from = PathBuf::from(&pair.from);
        let to = PathBuf::from(&pair.to);
        if !exists_any(&to) {
            report.failed.push(FileActionError {
                path: pair.to,
                error: "되돌릴 항목을 찾을 수 없습니다.".to_string(),
            });
            continue;
        }
        if exists_any(&from) {
            report.failed.push(FileActionError {
                path: pair.from,
                error: "원래 위치에 같은 이름의 항목이 이미 있습니다.".to_string(),
            });
            continue;
        }
        if let Some(parent) = from.parent() {
            if !parent.is_dir() {
                report.failed.push(FileActionError {
                    path: pair.from,
                    error: "원래 폴더가 더 이상 존재하지 않습니다.".to_string(),
                });
                continue;
            }
        }
        let noop = Reporter::noop();
        let res = fs::rename(&to, &from).or_else(|_| {
            if to.is_dir() {
                copy_dir_recursive(&to, &from, &noop)
                    .map_err(std::io::Error::other)
                    .and_then(|_| fs::remove_dir_all(&to))
            } else {
                copy_file_progress(&to, &from, &noop)
                    .map_err(std::io::Error::other)
                    .and_then(|_| fs::remove_file(&to))
            }
        });
        match res {
            Ok(()) => report.succeeded.push(pair.from),
            Err(e) => report.failed.push(FileActionError {
                path: pair.to,
                error: format!("되돌리기 실패: {}", e),
            }),
        }
    }
    Ok(report)
}

/// Sets / clears the read-only and hidden attributes (None leaves the flag unchanged).
pub fn set_attributes(
    paths: Vec<String>,
    readonly: Option<bool>,
    hidden: Option<bool>,
) -> Result<FileActionReport, String> {
    let mut report = FileActionReport::default();
    for path in paths {
        #[cfg(windows)]
        let res: Result<(), String> = {
            use windows_sys::Win32::Storage::FileSystem::{GetFileAttributesW, SetFileAttributesW};
            let wide: Vec<u16> = path.encode_utf16().chain([0]).collect();
            let current = unsafe { GetFileAttributesW(wide.as_ptr()) };
            if current == 0xFFFF_FFFF {
                Err("속성을 읽을 수 없습니다.".to_string())
            } else {
                let mut attrs = current;
                for (flag, want) in [(0x1u32, readonly), (0x2u32, hidden)] {
                    match want {
                        Some(true) => attrs |= flag,
                        Some(false) => attrs &= !flag,
                        None => {}
                    }
                }
                if attrs == 0 {
                    attrs = 0x80; // FILE_ATTRIBUTE_NORMAL
                }
                if attrs == current || unsafe { SetFileAttributesW(wide.as_ptr(), attrs) } != 0 {
                    Ok(())
                } else {
                    Err("속성을 변경하지 못했습니다.".to_string())
                }
            }
        };
        #[cfg(not(windows))]
        let res: Result<(), String> = {
            let _ = (readonly, hidden);
            Ok(())
        };
        match res {
            Ok(()) => report.succeeded.push(path),
            Err(error) => report.failed.push(FileActionError { path, error }),
        }
    }
    Ok(report)
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
        if !exists_any(&path) {
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

    Ok(FileActionReport { succeeded, failed, ..Default::default() })
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
        use windows_sys::Win32::UI::Shell::ShellExecuteW;
        let wide = |s: &str| -> Vec<u16> { s.encode_utf16().chain([0]).collect() };
        let verb = wide("open");
        let file = wide(&path);
        // SW_SHOWNORMAL = 1. Return values <= 32 indicate failure.
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                verb.as_ptr(),
                file.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1,
            )
        } as isize;
        if result <= 32 {
            return Err(format!("항목 열기 실패 (코드 {}): {}", result, path));
        }
    }
    #[cfg(not(windows))]
    {
        let _ = path;
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
            "rename".to_string(),
            &Reporter::noop(),
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

    #[test]
    fn test_conflict_policies_and_same_folder_move() {
        let a = tempdir().unwrap();
        let b = tempdir().unwrap();
        let a_s = a.path().to_string_lossy().to_string();
        let b_s = b.path().to_string_lossy().to_string();
        let src = create_text_file(a_s.clone(), "x.txt".into(), "new".into()).unwrap();
        create_text_file(b_s.clone(), "x.txt".into(), "old".into()).unwrap();

        assert_eq!(check_conflicts(vec![src.clone()], b_s.clone()).unwrap(), vec!["x.txt"]);
        // an item already inside the destination is never a conflict
        assert!(check_conflicts(vec![src.clone()], a_s.clone()).unwrap().is_empty());

        let skip = copy_items(vec![src.clone()], b_s.clone(), "skip".into(), &Reporter::noop()).unwrap();
        assert_eq!(skip.skipped.len(), 1);
        assert_eq!(fs::read_to_string(b.path().join("x.txt")).unwrap(), "old");

        let keep = copy_items(vec![src.clone()], b_s.clone(), "rename".into(), &Reporter::noop()).unwrap();
        assert!(keep.succeeded[0].ends_with("x (1).txt"));

        copy_items(vec![src.clone()], b_s.clone(), "overwrite".into(), &Reporter::noop()).unwrap();
        assert_eq!(fs::read_to_string(b.path().join("x.txt")).unwrap(), "new");

        // moving into its own folder is a no-op (no "x (1).txt" duplicate)
        let mv = move_items(vec![src.clone()], a_s, "rename".into(), &Reporter::noop()).unwrap();
        assert_eq!(mv.skipped.len(), 1);
        assert!(Path::new(&src).exists());
        assert!(!a.path().join("x (1).txt").exists());
    }
}
