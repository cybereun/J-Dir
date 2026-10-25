use crate::file_actions::{exists_any, resolve_collision_path};
use crate::fs_ops::normalize_windows_path;
use crate::jobs::Reporter;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;

const CANCELLED: &str = "사용자가 작업을 취소했습니다.";

fn zip_entry_name(base: &Path, path: &Path) -> String {
    path.strip_prefix(base)
        .unwrap_or(path)
        .components()
        .filter_map(|c| match c {
            Component::Normal(s) => Some(s.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// Compresses `sources` (files / folders) into a new zip at `dest_zip` (auto-numbered on collision).
pub fn zip_items(sources: Vec<String>, dest_zip: String, rep: &Reporter) -> Result<String, String> {
    if sources.is_empty() {
        return Err("압축할 항목이 없습니다.".to_string());
    }
    let dest_raw = normalize_windows_path(&dest_zip);
    let dest_dir = dest_raw
        .parent()
        .ok_or_else(|| "저장 위치를 확인할 수 없습니다.".to_string())?
        .to_path_buf();
    let dest_name = dest_raw
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or_else(|| "압축 파일 이름이 올바르지 않습니다.".to_string())?;
    let dest = resolve_collision_path(&dest_dir, &dest_name, false);

    // Gather (absolute path, entry name, is_dir)
    let mut items: Vec<(PathBuf, String, bool)> = Vec::new();
    let mut total_bytes = 0u64;
    for src in &sources {
        let src_path = PathBuf::from(src);
        let parent = src_path.parent().unwrap_or(Path::new("")).to_path_buf();
        for entry in WalkDir::new(&src_path).follow_links(false).into_iter().flatten() {
            let ft = entry.file_type();
            if ft.is_symlink() {
                continue;
            }
            let name = zip_entry_name(&parent, entry.path());
            if name.is_empty() || entry.path() == dest {
                continue;
            }
            if ft.is_file() {
                total_bytes += entry.metadata().map(|m| m.len()).unwrap_or(0);
            }
            items.push((entry.path().to_path_buf(), name, ft.is_dir()));
        }
    }
    rep.set_totals(total_bytes, items.len() as u64);

    let file = File::create(&dest).map_err(|e| format!("압축 파일 생성 실패: {}", e))?;
    let mut writer = zip::ZipWriter::new(file);
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let result = (|| -> Result<(), String> {
        let mut buf = vec![0u8; 256 * 1024];
        for (path, name, is_dir) in &items {
            if rep.is_cancelled() {
                return Err(CANCELLED.to_string());
            }
            if *is_dir {
                writer
                    .add_directory(format!("{}/", name), opts)
                    .map_err(|e| format!("폴더 추가 실패: {}", e))?;
            } else {
                writer
                    .start_file(name.as_str(), opts)
                    .map_err(|e| format!("파일 추가 실패 ({}): {}", name, e))?;
                let mut f = File::open(path).map_err(|e| format!("파일 열기 실패 ({}): {}", path.display(), e))?;
                loop {
                    let n = f.read(&mut buf).map_err(|e| format!("파일 읽기 실패: {}", e))?;
                    if n == 0 {
                        break;
                    }
                    writer.write_all(&buf[..n]).map_err(|e| format!("압축 쓰기 실패: {}", e))?;
                    rep.add_bytes(n as u64, name);
                    if rep.is_cancelled() {
                        return Err(CANCELLED.to_string());
                    }
                }
            }
            rep.item_done(name);
        }
        Ok(())
    })();

    match result {
        Ok(()) => {
            writer.finish().map_err(|e| format!("압축 마무리 실패: {}", e))?;
            Ok(dest.to_string_lossy().to_string())
        }
        Err(err) => {
            drop(writer);
            let _ = fs::remove_file(&dest);
            Err(err)
        }
    }
}

pub fn decode_entry_name(raw: &[u8]) -> String {
    match std::str::from_utf8(raw) {
        Ok(s) => s.to_string(),
        // Legacy Korean zips store CP949 names without the UTF-8 flag.
        Err(_) => encoding_rs::EUC_KR.decode(raw).0.to_string(),
    }
}

/// Safely maps an archive entry name to a relative path (rejects absolute paths and `..`).
fn safe_relative(name: &str) -> Option<PathBuf> {
    let mut out = PathBuf::new();
    for part in name.replace('\\', "/").split('/') {
        match part {
            "" | "." => {}
            ".." => return None,
            p if p.contains(':') => return None,
            p => out.push(p),
        }
    }
    if out.as_os_str().is_empty() {
        None
    } else {
        Some(out)
    }
}

/// Extracts a zip into a new folder named after the archive inside `dest_dir`. Returns the folder.
pub fn unzip_archive(zip_path: String, dest_dir: String, rep: &Reporter) -> Result<String, String> {
    unzip_selected(zip_path, dest_dir, None, rep)
}

/// Like [`unzip_archive`], optionally limited to the entries whose index is in `only`.
pub fn unzip_selected(
    zip_path: String,
    dest_dir: String,
    only: Option<&std::collections::HashSet<usize>>,
    rep: &Reporter,
) -> Result<String, String> {
    let zip_p = PathBuf::from(&zip_path);
    let dest_parent = normalize_windows_path(&dest_dir);
    if !dest_parent.is_dir() {
        return Err(format!("대상 폴더가 존재하지 않습니다: {}", dest_parent.display()));
    }
    let stem = zip_p
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "압축해제".to_string());
    let out_dir = resolve_collision_path(&dest_parent, &stem, false);

    let file = File::open(&zip_p).map_err(|e| format!("압축 파일 열기 실패: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("올바른 zip 파일이 아닙니다: {}", e))?;

    let wanted = |i: usize| only.map_or(true, |set| set.contains(&i));
    if only.map_or(false, |set| set.is_empty()) {
        return Err("풀 항목이 선택되지 않았습니다.".to_string());
    }
    let mut total = 0u64;
    let mut count = 0u64;
    for i in 0..archive.len() {
        if !wanted(i) {
            continue;
        }
        if let Ok(f) = archive.by_index_raw(i) {
            total += f.size();
            count += 1;
        }
    }
    rep.set_totals(total, count);
    fs::create_dir_all(&out_dir).map_err(|e| format!("폴더 생성 실패: {}", e))?;

    let result = (|| -> Result<(), String> {
        let mut buf = vec![0u8; 256 * 1024];
        for i in 0..archive.len() {
            if !wanted(i) {
                continue;
            }
            if rep.is_cancelled() {
                return Err(CANCELLED.to_string());
            }
            let mut entry = archive.by_index(i).map_err(|e| format!("항목 읽기 실패: {}", e))?;
            let name = decode_entry_name(entry.name_raw());
            let Some(rel) = safe_relative(&name) else { continue };
            let target = out_dir.join(&rel);
            if entry.is_dir() || name.ends_with('/') {
                fs::create_dir_all(&target).map_err(|e| format!("폴더 생성 실패: {}", e))?;
            } else {
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent).map_err(|e| format!("폴더 생성 실패: {}", e))?;
                }
                if exists_any(&target) {
                    continue;
                }
                let mut out = File::create(&target)
                    .map_err(|e| format!("파일 생성 실패 ({}): {}", target.display(), e))?;
                loop {
                    let n = entry.read(&mut buf).map_err(|e| format!("압축 해제 실패 ({}): {}", name, e))?;
                    if n == 0 {
                        break;
                    }
                    out.write_all(&buf[..n]).map_err(|e| format!("파일 쓰기 실패: {}", e))?;
                    rep.add_bytes(n as u64, &name);
                    if rep.is_cancelled() {
                        return Err(CANCELLED.to_string());
                    }
                }
            }
            rep.item_done(&name);
        }
        Ok(())
    })();

    match result {
        Ok(()) => Ok(out_dir.to_string_lossy().to_string()),
        Err(err) => {
            let _ = fs::remove_dir_all(&out_dir);
            Err(err)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zip_roundtrip_and_zip_slip_guard() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("한글폴더");
        fs::create_dir(&folder).unwrap();
        fs::write(folder.join("a.txt"), b"hello zip").unwrap();
        let zip_path = dir.path().join("out.zip").to_string_lossy().to_string();
        let made = zip_items(
            vec![folder.to_string_lossy().to_string()],
            zip_path,
            &Reporter::noop(),
        )
        .unwrap();

        let out = unzip_archive(made, dir.path().to_string_lossy().to_string(), &Reporter::noop()).unwrap();
        let extracted = Path::new(&out).join("한글폴더").join("a.txt");
        assert_eq!(fs::read_to_string(extracted).unwrap(), "hello zip");

        assert!(safe_relative("../evil.txt").is_none());
        assert!(safe_relative("C:/x").is_none());
        assert_eq!(safe_relative("a/b.txt").unwrap(), PathBuf::from("a").join("b.txt"));
    }
}
