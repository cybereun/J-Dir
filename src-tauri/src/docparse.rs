use serde_json::{json, Value};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

const PARSER_NAME: &str = "jdir-parser.exe";
const PARSE_TIMEOUT: Duration = Duration::from_secs(90);
const MAX_PARSE_BYTES: u64 = 200 * 1024 * 1024;
/// Upper bound for original-layout bytes handed to the WebView (PDF / HWP / images).
pub const MAX_RAW_BYTES: u64 = 150 * 1024 * 1024;

/// Finds the bundled kordoc parser: next to the installed resources first,
/// then (dev builds) the source tree's `resources` folder.
fn locate_parser(resource_dir: Option<PathBuf>) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(dir) = resource_dir {
        candidates.push(dir.join("resources").join(PARSER_NAME));
        candidates.push(dir.join(PARSER_NAME));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("resources").join(PARSER_NAME));
            candidates.push(dir.join(PARSER_NAME));
        }
    }
    candidates.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("resources").join(PARSER_NAME));
    candidates.into_iter().find(|p| p.is_file())
}

pub fn read_raw_bytes(path: &str, max_bytes: u64) -> Result<Vec<u8>, String> {
    let p = Path::new(path);
    let meta = fs::metadata(p).map_err(|e| format!("파일 정보를 읽을 수 없습니다: {}", e))?;
    if !meta.is_file() {
        return Err("파일이 아닙니다.".to_string());
    }
    if meta.len() > max_bytes.min(MAX_RAW_BYTES) {
        return Err("SOURCE_TOO_LARGE".to_string());
    }
    fs::read(p).map_err(|e| format!("파일 읽기 실패: {}", e))
}

/// Runs the kordoc parser sidecar once for `path` and returns its parsed document
/// (`title`, `markdown`, `plainText`, `blocks`, `warnings`).
pub fn parse_document(path: &str, resource_dir: Option<PathBuf>) -> Result<Value, String> {
    let parser = locate_parser(resource_dir)
        .ok_or_else(|| "PARSER_MISSING: 문서 파서(jdir-parser.exe)를 찾을 수 없습니다.".to_string())?;

    let request = json!({
        "id": "1",
        "operation": "parse",
        "path": path,
        "options": { "maxBytes": MAX_PARSE_BYTES },
    });

    let mut command = Command::new(&parser);
    command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = command.spawn().map_err(|e| format!("파서 실행 실패: {}", e))?;

    let mut stdin = child.stdin.take().ok_or("파서 입력 연결 실패")?;
    let mut stdout = child.stdout.take().ok_or("파서 출력 연결 실패")?;
    stdin
        .write_all(format!("{}\n", request).as_bytes())
        .map_err(|e| format!("파서 요청 실패: {}", e))?;
    // Keep stdin open until the response arrives; the host exits when it is closed.
    let (tx, rx) = mpsc::channel::<Vec<u8>>();
    std::thread::spawn(move || {
        let mut out = Vec::new();
        let mut byte = [0u8; 8192];
        loop {
            match stdout.read(&mut byte) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    out.extend_from_slice(&byte[..n]);
                    if out.last() == Some(&b'\n') {
                        break;
                    }
                }
            }
        }
        let _ = tx.send(out);
    });

    let received = rx.recv_timeout(PARSE_TIMEOUT);
    drop(stdin);
    let _ = child.kill();
    let _ = child.wait();
    let raw = received.map_err(|_| "PARSE_TIMEOUT: 문서 분석 시간이 초과되었습니다.".to_string())?;

    let response: Value = serde_json::from_slice(&raw).map_err(|_| "파서 응답이 올바르지 않습니다.".to_string())?;
    if response.get("ok").and_then(Value::as_bool) == Some(true) {
        return Ok(response.get("document").cloned().unwrap_or(Value::Null));
    }
    let code = response
        .pointer("/error/code")
        .and_then(Value::as_str)
        .unwrap_or("INTERNAL");
    let message = response
        .pointer("/error/message")
        .and_then(Value::as_str)
        .unwrap_or("문서를 분석하지 못했습니다.");
    Err(format!("{}: {}", code, message))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_hwpx_fixture_through_sidecar() {
        let sample = Path::new(r"C:\Users\cybereun\Documents\Welcome to Hwp.hwpx");
        if !sample.is_file() {
            return; // sample document only exists on the author's machine
        }
        let doc = parse_document(sample.to_str().unwrap(), None).expect("parse");
        let text = doc["plainText"].as_str().unwrap_or_default();
        assert!(!text.is_empty());
        assert!(doc["blocks"].as_array().map(|b| !b.is_empty()).unwrap_or(false));
    }

    #[test]
    fn rejects_oversized_raw_read() {
        let dir = std::env::temp_dir().join("jdir_docparse_test.bin");
        fs::write(&dir, vec![0u8; 2048]).unwrap();
        assert_eq!(read_raw_bytes(dir.to_str().unwrap(), 1024).unwrap_err(), "SOURCE_TOO_LARGE");
        assert_eq!(read_raw_bytes(dir.to_str().unwrap(), 4096).unwrap().len(), 2048);
        let _ = fs::remove_file(dir);
    }
}
