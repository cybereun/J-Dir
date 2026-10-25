use crate::archive::{decode_entry_name, unzip_selected};
use crate::docparse;
use crate::jobs::Reporter;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Entries returned to the preview list; the rest is summarized as `truncated`.
const MAX_LISTED: usize = 20_000;
/// Largest single entry that will be inflated into memory for preview.
const MAX_ENTRY_BYTES: u64 = 150 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZipEntryInfo {
    pub index: usize,
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub compressed: u64,
    pub modified: Option<String>,
    pub encrypted: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZipListing {
    pub entries: Vec<ZipEntryInfo>,
    pub total_entries: usize,
    pub total_files: usize,
    pub total_size: u64,
    pub total_compressed: u64,
    pub truncated: bool,
}

fn open_archive(path: &str) -> Result<zip::ZipArchive<File>, String> {
    let file = File::open(path).map_err(|e| format!("압축 파일 열기 실패: {}", e))?;
    zip::ZipArchive::new(file).map_err(|e| format!("올바른 zip 파일이 아니거나 읽을 수 없습니다: {}", e))
}

pub fn list_zip(path: &str) -> Result<ZipListing, String> {
    let mut archive = open_archive(path)?;
    let total_entries = archive.len();
    let mut entries = Vec::with_capacity(total_entries.min(MAX_LISTED));
    let (mut total_files, mut total_size, mut total_compressed) = (0usize, 0u64, 0u64);
    for i in 0..total_entries {
        // by_index_raw lists names and sizes without decrypting, so encrypted archives still list.
        let f = match archive.by_index_raw(i) {
            Ok(f) => f,
            Err(_) => continue,
        };
        let name = decode_entry_name(f.name_raw());
        let is_dir = f.is_dir() || name.ends_with('/');
        if !is_dir {
            total_files += 1;
            total_size += f.size();
            total_compressed += f.compressed_size();
        }
        if entries.len() < MAX_LISTED {
            entries.push(ZipEntryInfo {
                index: i,
                name,
                is_dir,
                size: f.size(),
                compressed: f.compressed_size(),
                modified: f.last_modified().map(|d| {
                    format!(
                        "{:04}-{:02}-{:02} {:02}:{:02}",
                        d.year(),
                        d.month(),
                        d.day(),
                        d.hour(),
                        d.minute()
                    )
                }),
                encrypted: f.encrypted(),
            });
        }
    }
    Ok(ZipListing {
        truncated: total_entries > entries.len(),
        entries,
        total_entries,
        total_files,
        total_size,
        total_compressed,
    })
}

fn entry_error(e: zip::result::ZipError) -> String {
    let text = e.to_string();
    if text.to_ascii_lowercase().contains("password") || text.contains("encrypt") {
        "ENCRYPTED: 암호로 보호된 항목은 미리볼 수 없습니다.".to_string()
    } else {
        format!("항목 읽기 실패: {}", text)
    }
}

pub fn read_entry(path: &str, index: usize) -> Result<Vec<u8>, String> {
    let mut archive = open_archive(path)?;
    let mut entry = archive.by_index(index).map_err(entry_error)?;
    if entry.size() > MAX_ENTRY_BYTES {
        return Err("SOURCE_TOO_LARGE".to_string());
    }
    let mut buf = Vec::with_capacity(entry.size().min(MAX_ENTRY_BYTES) as usize);
    // take() also guards against entries whose header understates the real size (zip bombs).
    (&mut entry)
        .take(MAX_ENTRY_BYTES + 1)
        .read_to_end(&mut buf)
        .map_err(|e| format!("압축 해제 실패: {}", e))?;
    if buf.len() as u64 > MAX_ENTRY_BYTES {
        return Err("SOURCE_TOO_LARGE".to_string());
    }
    Ok(buf)
}

/// Inflates one entry to a throw-away temp file, parses it with the document parser, and cleans up.
pub fn parse_entry(path: &str, index: usize, resource_dir: Option<PathBuf>) -> Result<Value, String> {
    let bytes = read_entry(path, index)?;
    let name = {
        let mut archive = open_archive(path)?;
        let e = archive.by_index_raw(index).map_err(entry_error)?;
        decode_entry_name(e.name_raw())
    };
    let ext: String = Path::new(&name)
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(8)
        .collect();
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let dir = std::env::temp_dir().join(format!("jdir-zip-{}-{}", std::process::id(), nanos));
    fs::create_dir_all(&dir).map_err(|e| format!("임시 폴더 생성 실패: {}", e))?;
    // The temp name never uses the archive's own entry name, so it cannot escape the folder.
    let file = dir.join(if ext.is_empty() {
        "entry".to_string()
    } else {
        format!("entry.{}", ext)
    });
    let result = fs::write(&file, &bytes)
        .map_err(|e| format!("임시 파일 쓰기 실패: {}", e))
        .and_then(|_| docparse::parse_document(&file.to_string_lossy(), resource_dir));
    let _ = fs::remove_dir_all(&dir);
    result
}

/// Extracts the archive (or only `indices`) into a new folder inside `dest_dir`.
pub fn extract(path: &str, dest_dir: &str, indices: Option<Vec<usize>>) -> Result<String, String> {
    let set: Option<HashSet<usize>> = indices.map(|v| v.into_iter().collect());
    unzip_selected(path.to_string(), dest_dir.to_string(), set.as_ref(), &Reporter::noop())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn make_zip(dir: &Path) -> String {
        let p = dir.join("t.zip");
        let mut w = zip::ZipWriter::new(File::create(&p).unwrap());
        let opts = zip::write::SimpleFileOptions::default();
        w.add_directory("폴더/", opts).unwrap();
        w.start_file("폴더/a.txt", opts).unwrap();
        w.write_all(b"hello").unwrap();
        w.start_file("b.txt", opts).unwrap();
        w.write_all(b"world!").unwrap();
        w.finish().unwrap();
        p.to_string_lossy().to_string()
    }

    #[test]
    fn lists_reads_and_selectively_extracts() {
        let dir = tempfile::tempdir().unwrap();
        let zip = make_zip(dir.path());
        let listing = list_zip(&zip).unwrap();
        assert_eq!(listing.total_files, 2);
        assert_eq!(listing.total_size, 11);
        let a = listing.entries.iter().find(|e| e.name == "폴더/a.txt").unwrap();
        assert_eq!(read_entry(&zip, a.index).unwrap(), b"hello");
        assert!(read_entry(&zip, 99).is_err());

        let b = listing.entries.iter().find(|e| e.name == "b.txt").unwrap();
        let out = extract(&zip, &dir.path().to_string_lossy(), Some(vec![b.index])).unwrap();
        assert!(Path::new(&out).join("b.txt").is_file());
        assert!(!Path::new(&out).join("폴더").join("a.txt").exists());
        assert!(extract(&zip, &dir.path().to_string_lossy(), Some(vec![])).is_err());

        let all = extract(&zip, &dir.path().to_string_lossy(), None).unwrap();
        assert!(Path::new(&all).join("폴더").join("a.txt").is_file());
    }
}
