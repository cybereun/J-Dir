use crate::models::FilePreviewData;
use base64::Engine;
use std::fs::{self, File};
use std::io::Read;
use std::path::Path;
use std::time::UNIX_EPOCH;

fn format_hex_dump(bytes: &[u8]) -> String {
    let mut lines = Vec::new();
    for (row_idx, chunk) in bytes.chunks(16).enumerate() {
        let offset = row_idx * 16;
        let mut hex_part = String::with_capacity(48);
        let mut ascii_part = String::with_capacity(16);

        for (i, &b) in chunk.iter().enumerate() {
            if i == 8 {
                hex_part.push(' ');
            }
            hex_part.push_str(&format!("{:02X} ", b));
            if (0x20..=0x7E).contains(&b) {
                ascii_part.push(b as char);
            } else {
                ascii_part.push('.');
            }
        }
        lines.push(format!("{:08X}  {:<49} |{}|", offset, hex_part, ascii_part));
    }
    lines.join("\n")
}

pub fn read_file_preview(path: String, max_bytes: usize) -> Result<FilePreviewData, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("파일이 존재하지 않습니다: {}", path));
    }

    let meta = fs::metadata(p).map_err(|e| format!("메타데이터 읽기 실패: {}", e))?;
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());
    let modified_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    if meta.is_dir() {
        let count = fs::read_dir(p).map(|rd| rd.count()).unwrap_or(0);
        return Ok(FilePreviewData {
            path,
            name,
            size: 0,
            modified_ms,
            preview_kind: "directory".to_string(),
            mime_type: "inode/directory".to_string(),
            text_content: Some(format!("폴더 내부 항목 수: {}개", count)),
            data_url: None,
            hex_dump: None,
            encoding: None,
            truncated: false,
        });
    }

    let size = meta.len();
    let ext = p
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();

    // Image preview (up to 15 MB for inline base64 data URL)
    let image_mime = match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "bmp" => Some("image/bmp"),
        "ico" => Some("image/x-icon"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    };

    if let Some(mime) = image_mime {
        if size <= 15 * 1024 * 1024 {
            let bytes = fs::read(p).map_err(|e| format!("이미지 읽기 실패: {}", e))?;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            return Ok(FilePreviewData {
                path,
                name,
                size,
                modified_ms,
                preview_kind: "image".to_string(),
                mime_type: mime.to_string(),
                text_content: None,
                data_url: Some(format!("data:{};base64,{}", mime, b64)),
                hex_dump: None,
                encoding: None,
                truncated: false,
            });
        }
    }

    // Text / Code / Config extensions
    let is_known_text = matches!(
        ext.as_str(),
        "txt"
            | "md"
            | "ini"
            | "qdr"
            | "json"
            | "toml"
            | "yaml"
            | "yml"
            | "xml"
            | "html"
            | "htm"
            | "css"
            | "js"
            | "jsx"
            | "ts"
            | "tsx"
            | "rs"
            | "py"
            | "c"
            | "cpp"
            | "h"
            | "hpp"
            | "cs"
            | "java"
            | "go"
            | "bat"
            | "cmd"
            | "ps1"
            | "sh"
            | "log"
            | "csv"
            | "sql"
            | "url"
            | "gitignore"
    );

    let limit = max_bytes.clamp(1024, 256 * 1024);
    let mut file = File::open(p).map_err(|e| format!("파일 열기 실패: {}", e))?;
    let to_read = (size as usize).min(limit);
    let mut buf = vec![0u8; to_read];
    let n = file
        .read(&mut buf)
        .map_err(|e| format!("파일 데이터 읽기 실패: {}", e))?;
    buf.truncate(n);
    let truncated = (size as usize) > n;

    // Detect UTF-16LE BOM or UTF-16LE pattern
    let is_utf16le = (buf.len() >= 2 && buf[0] == 0xFF && buf[1] == 0xFE)
        || (buf.len() >= 8 && buf[1] == 0 && buf[3] == 0 && buf[5] == 0);

    if is_utf16le {
        let start = if buf.len() >= 2 && buf[0] == 0xFF && buf[1] == 0xFE {
            2
        } else {
            0
        };
        let u16s: Vec<u16> = buf[start..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        let text = String::from_utf16_lossy(&u16s);
        return Ok(FilePreviewData {
            path,
            name,
            size,
            modified_ms,
            preview_kind: "text".to_string(),
            mime_type: "text/plain".to_string(),
            text_content: Some(text),
            data_url: None,
            hex_dump: Some(format_hex_dump(&buf[..buf.len().min(512)])),
            encoding: Some("UTF-16LE".to_string()),
            truncated,
        });
    }

    // Check if binary (contains null bytes when not UTF-16)
    let has_null = buf.iter().take(512).any(|&b| b == 0);
    if is_known_text || (!has_null && !buf.is_empty()) {
        let (text, enc) = match std::str::from_utf8(&buf) {
            Ok(s) => (s.to_string(), "UTF-8"),
            Err(_) => (String::from_utf8_lossy(&buf).to_string(), "ANSI/Lossy"),
        };
        return Ok(FilePreviewData {
            path,
            name,
            size,
            modified_ms,
            preview_kind: "text".to_string(),
            mime_type: "text/plain".to_string(),
            text_content: Some(text),
            data_url: None,
            hex_dump: Some(format_hex_dump(&buf[..buf.len().min(512)])),
            encoding: Some(enc.to_string()),
            truncated,
        });
    }

    Ok(FilePreviewData {
        path,
        name,
        size,
        modified_ms,
        preview_kind: "hex".to_string(),
        mime_type: "application/octet-stream".to_string(),
        text_content: None,
        data_url: None,
        hex_dump: Some(format_hex_dump(&buf[..buf.len().min(1024)])),
        encoding: Some("BINARY / HEX".to_string()),
        truncated: size > 1024,
    })
}
