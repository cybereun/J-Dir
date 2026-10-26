use super::key::SecretKey;
use rusqlite::{params, params_from_iter, types::Value as SqlValue, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Instant;

pub fn open(path: &Path, key: &SecretKey) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("색인 폴더 생성 실패: {}", e))?;
    }
    let conn = Connection::open(path).map_err(|e| format!("색인 DB 열기 실패: {}", e))?;
    conn.execute_batch(&key.pragma()).map_err(|e| format!("색인 DB 키 설정 실패: {}", e))?;
    // Reading the schema fails here if the key is wrong or the file is not an encrypted DB.
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get::<_, i64>(0))
        .map_err(|_| "색인 DB를 열 수 없습니다. 키가 일치하지 않거나 파일이 손상되었습니다.".to_string())?;
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 8000;")
        .map_err(|e| format!("색인 DB 설정 실패: {}", e))?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            added_ms INTEGER NOT NULL,
            last_indexed_ms INTEGER
         );
         CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY,
            folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
            path TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            ext TEXT NOT NULL,
            size INTEGER NOT NULL,
            mtime_ms INTEGER NOT NULL,
            status TEXT NOT NULL,
            error TEXT
         );
         CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);
         CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts USING fts5(name, body, tokenize = 'trigram');",
    )
    .map_err(|e| format!("색인 DB 초기화 실패: {}", e))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderInfo {
    pub id: i64,
    pub path: String,
    pub doc_count: i64,
    pub error_count: i64,
    pub last_indexed_ms: Option<i64>,
}

pub fn list_folders(conn: &Connection) -> Result<Vec<FolderInfo>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT f.id, f.path, f.last_indexed_ms,
                    (SELECT count(*) FROM documents d WHERE d.folder_id = f.id),
                    (SELECT count(*) FROM documents d WHERE d.folder_id = f.id AND d.status = 'error')
             FROM folders f ORDER BY f.id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(FolderInfo {
                id: r.get(0)?,
                path: r.get(1)?,
                last_indexed_ms: r.get(2)?,
                doc_count: r.get(3)?,
                error_count: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn norm(path: &str) -> String {
    path.trim_end_matches(['\\', '/']).to_lowercase().replace('/', "\\")
}

pub fn add_folder(conn: &Connection, path: &str) -> Result<i64, String> {
    let clean = path.trim_end_matches(['\\', '/']).to_string();
    if !Path::new(&clean).is_dir() {
        return Err("폴더를 찾을 수 없습니다.".to_string());
    }
    let new_n = norm(&clean);
    for f in list_folders(conn)? {
        let old_n = norm(&f.path);
        if old_n == new_n {
            return Err("이미 색인에 추가된 폴더입니다.".to_string());
        }
        if new_n.starts_with(&format!("{}\\", old_n)) {
            return Err(format!("이미 색인된 폴더({})의 하위 폴더입니다.", f.path));
        }
        if old_n.starts_with(&format!("{}\\", new_n)) {
            return Err(format!("이미 색인된 폴더({})를 포함합니다. 먼저 해당 폴더를 제거해 주세요.", f.path));
        }
    }
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute("INSERT INTO folders(path, added_ms) VALUES (?1, ?2)", params![clean, now])
        .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

pub fn remove_folder(conn: &mut Connection, id: i64) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM doc_fts WHERE rowid IN (SELECT id FROM documents WHERE folder_id = ?1)", params![id])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM documents WHERE folder_id = ?1", params![id]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM folders WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

// ---------------------------------------------------------------- search

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    pub text: String,
    /// "keyword" (body + name) or "filename"
    pub mode: String,
    #[serde(default)]
    pub exts: Vec<String>,
    pub folder_id: Option<i64>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub id: i64,
    pub folder_id: i64,
    pub path: String,
    pub name: String,
    pub ext: String,
    pub size: i64,
    pub mtime_ms: i64,
    pub status: String,
    /// Context around the first match; matches are wrapped in U+E000 / U+E001.
    pub snippet: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub hits: Vec<SearchHit>,
    pub total: i64,
    pub elapsed_ms: u64,
    pub tokens: Vec<String>,
}

pub const MARK_OPEN: char = '\u{E000}';
pub const MARK_CLOSE: char = '\u{E001}';

fn like_pattern(token: &str) -> String {
    let mut out = String::from("%");
    for c in token.chars() {
        if matches!(c, '%' | '_' | '\\') {
            out.push('\\');
        }
        out.push(c);
    }
    out.push('%');
    out
}

pub fn search(conn: &Connection, req: &SearchRequest) -> Result<SearchResponse, String> {
    let started = Instant::now();
    // Punctuation separates words like a space does, so "1,2학년" and "1, 2학년" search the same.
    let tokens: Vec<String> = req
        .text
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string())
        .collect();
    if tokens.is_empty() {
        return Ok(SearchResponse { hits: vec![], total: 0, elapsed_ms: 0, tokens });
    }
    let filename_only = req.mode == "filename";

    let mut where_parts: Vec<String> = Vec::new();
    let mut args: Vec<SqlValue> = Vec::new();
    let mut use_match = false;

    if filename_only {
        for t in &tokens {
            where_parts.push("d.name LIKE ? ESCAPE '\\'".into());
            args.push(SqlValue::Text(like_pattern(t)));
        }
    } else {
        // Trigram FTS needs >= 3 characters per token; shorter tokens fall back to LIKE.
        let long: Vec<&String> = tokens.iter().filter(|t| t.chars().count() >= 3).collect();
        if !long.is_empty() {
            let expr = long
                .iter()
                .map(|t| format!("\"{}\"", t.replace('"', "\"\"")))
                .collect::<Vec<_>>()
                .join(" AND ");
            where_parts.push("doc_fts MATCH ?".into());
            args.push(SqlValue::Text(expr));
            use_match = true;
        }
        for t in tokens.iter().filter(|t| t.chars().count() < 3) {
            where_parts.push("(doc_fts.body LIKE ? ESCAPE '\\' OR d.name LIKE ? ESCAPE '\\')".into());
            args.push(SqlValue::Text(like_pattern(t)));
            args.push(SqlValue::Text(like_pattern(t)));
        }
    }
    if !req.exts.is_empty() {
        let marks = vec!["?"; req.exts.len()].join(",");
        where_parts.push(format!("d.ext IN ({})", marks));
        for e in &req.exts {
            args.push(SqlValue::Text(e.to_lowercase()));
        }
    }
    if let Some(fid) = req.folder_id {
        where_parts.push("d.folder_id = ?".into());
        args.push(SqlValue::Integer(fid));
    }
    let where_sql = where_parts.join(" AND ");
    let from = "FROM doc_fts JOIN documents d ON d.id = doc_fts.rowid";

    let total: i64 = conn
        .query_row(&format!("SELECT count(*) {} WHERE {}", from, where_sql), params_from_iter(args.iter()), |r| r.get(0))
        .map_err(|e| format!("검색 실패: {}", e))?;

    let order = if use_match && !filename_only { "ORDER BY bm25(doc_fts, 4.0, 1.0)" } else { "ORDER BY d.mtime_ms DESC" };
    let limit = req.limit.unwrap_or(50).clamp(1, 200);
    let offset = req.offset.unwrap_or(0);
    let sql = format!(
        "SELECT d.id, d.folder_id, d.path, d.name, d.ext, d.size, d.mtime_ms, d.status, doc_fts.body
         {} WHERE {} {} LIMIT {} OFFSET {}",
        from, where_sql, order, limit, offset
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("검색 실패: {}", e))?;
    let rows = stmt
        .query_map(params_from_iter(args.iter()), |r| {
            let body: String = r.get(8)?;
            Ok(SearchHit {
                id: r.get(0)?,
                folder_id: r.get(1)?,
                path: r.get(2)?,
                name: r.get(3)?,
                ext: r.get(4)?,
                size: r.get(5)?,
                mtime_ms: r.get(6)?,
                status: r.get(7)?,
                snippet: if filename_only { String::new() } else { make_snippet(&body, &tokens) },
            })
        })
        .map_err(|e| format!("검색 실패: {}", e))?;
    let hits = rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("검색 실패: {}", e))?;

    Ok(SearchResponse { hits, total, elapsed_ms: started.elapsed().as_millis() as u64, tokens })
}

/// A short window of text around the first match, with every match in the window marked.
pub fn make_snippet(body: &str, tokens: &[String]) -> String {
    const BEFORE: usize = 50;
    const AFTER: usize = 130;
    if body.is_empty() {
        return String::new();
    }
    let chars: Vec<char> = body.chars().collect();
    let lower: Vec<char> = chars.iter().map(|c| c.to_lowercase().next().unwrap_or(*c)).collect();
    let needles: Vec<Vec<char>> = tokens
        .iter()
        .map(|t| t.chars().map(|c| c.to_lowercase().next().unwrap_or(c)).collect())
        .filter(|n: &Vec<char>| !n.is_empty())
        .collect();

    let find_from = |start: usize, needle: &[char]| -> Option<usize> {
        if needle.is_empty() || lower.len() < needle.len() {
            return None;
        }
        (start..=lower.len() - needle.len()).find(|&i| lower[i..i + needle.len()] == *needle)
    };

    let first = needles.iter().filter_map(|n| find_from(0, n)).min();
    let Some(first) = first else {
        // Matched by file name only: show the beginning of the document instead.
        let head: String = chars.iter().take(AFTER).collect();
        return collapse(&head);
    };
    let start = first.saturating_sub(BEFORE);
    let end = (first + AFTER).min(chars.len());

    // Collect match ranges inside the window.
    let mut ranges: Vec<(usize, usize)> = Vec::new();
    for n in &needles {
        let mut from = start;
        while let Some(i) = find_from(from, n) {
            if i >= end {
                break;
            }
            ranges.push((i, i + n.len()));
            from = i + n.len();
        }
    }
    ranges.sort();
    let mut merged: Vec<(usize, usize)> = Vec::new();
    for r in ranges {
        match merged.last_mut() {
            Some(last) if r.0 <= last.1 => last.1 = last.1.max(r.1),
            _ => merged.push(r),
        }
    }

    let mut out = String::new();
    if start > 0 {
        out.push('…');
    }
    let mut cursor = start;
    for (a, b) in merged {
        out.extend(chars[cursor..a].iter());
        out.push(MARK_OPEN);
        out.extend(chars[a..b.min(end.max(b))].iter());
        out.push(MARK_CLOSE);
        cursor = b;
    }
    if cursor < end {
        out.extend(chars[cursor..end].iter());
    }
    if end < chars.len() {
        out.push('…');
    }
    collapse(&out)
}

fn collapse(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_key() -> SecretKey {
        SecretKey([7u8; super::super::key::KEY_LEN])
    }

    fn insert(conn: &Connection, folder: i64, path: &str, name: &str, ext: &str, body: &str) {
        conn.execute(
            "INSERT INTO documents(folder_id, path, name, ext, size, mtime_ms, status) VALUES (?1,?2,?3,?4,10,1,'ok')",
            params![folder, path, name, ext],
        )
        .unwrap();
        let id = conn.last_insert_rowid();
        conn.execute("INSERT INTO doc_fts(rowid, name, body) VALUES (?1,?2,?3)", params![id, name, body]).unwrap();
    }

    #[test]
    fn encrypted_db_search_korean_and_short_tokens() {
        let dir = tempfile::tempdir().unwrap();
        let docs = dir.path().join("docs");
        std::fs::create_dir(&docs).unwrap();
        let path = dir.path().join("idx.db");
        let conn = open(&path, &test_key()).unwrap();
        let fid = add_folder(&conn, &docs.to_string_lossy()).unwrap();
        insert(&conn, fid, "C:\\a\\서식.hwp", "[한글서식]부크크서식.hwp", "hwp", "저자 생텍쥐페리 펴낸곳 주식회사 부크크 출판사등록 2014");
        insert(&conn, fid, "C:\\a\\메모.txt", "메모.txt", "txt", "오늘 회의 내용: 예산 검토");

        let req = |text: &str, mode: &str| SearchRequest {
            text: text.into(), mode: mode.into(), exts: vec![], folder_id: None, limit: None, offset: None,
        };
        let r = search(&conn, &req("부크크", "keyword")).unwrap();
        assert_eq!(r.total, 1);
        assert!(r.hits[0].snippet.contains(MARK_OPEN), "snippet: {}", r.hits[0].snippet);
        assert_eq!(search(&conn, &req("예산 검토", "keyword")).unwrap().total, 1);
        assert_eq!(search(&conn, &req("예산 없는말", "keyword")).unwrap().total, 0);
        // punctuation between tokens is treated like a space
        assert_eq!(search(&conn, &req("예산,검토", "keyword")).unwrap().total, 1);
        assert_eq!(search(&conn, &req("예산, 검토", "keyword")).unwrap().total, 1);
        // two-character token goes through the LIKE fallback
        assert_eq!(search(&conn, &req("회의", "keyword")).unwrap().total, 1);
        assert_eq!(search(&conn, &req("부크크서식", "filename")).unwrap().total, 1);
        assert_eq!(search(&conn, &req("부크크", "keyword")).unwrap().hits[0].ext, "hwp");

        // overlapping / nested folders are rejected
        assert!(add_folder(&conn, &docs.to_string_lossy()).is_err());
        drop(conn);

        // the file on disk is encrypted and cannot be opened with another key
        let wrong = SecretKey([9u8; super::super::key::KEY_LEN]);
        assert!(open(&path, &wrong).is_err());
        let raw = std::fs::read(&path).unwrap();
        assert!(!raw.starts_with(b"SQLite format 3"));
    }

    #[test]
    fn snippet_marks_matches_case_insensitively() {
        let s = make_snippet("The Quick brown fox", &["quick".to_string()]);
        assert!(s.contains(&format!("{}Quick{}", MARK_OPEN, MARK_CLOSE)), "{}", s);
    }
}
