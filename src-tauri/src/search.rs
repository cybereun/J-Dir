use crate::fs_ops::{entry_from_path, normalize_windows_path};
use crate::jobs::Reporter;
use crate::models::FileEntry;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

const MAX_RESULTS: usize = 5000;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchQuery {
    /// Wildcard list (`*.jpg;report*`) or plain substring. Empty matches everything.
    pub pattern: String,
    pub include_dirs: bool,
    pub include_hidden: bool,
    pub min_size: Option<u64>,
    pub max_size: Option<u64>,
    pub modified_after_ms: Option<i64>,
    pub modified_before_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub entries: Vec<FileEntry>,
    pub truncated: bool,
    pub cancelled: bool,
    pub scanned: u64,
}

/// Case-insensitive glob match supporting `*` and `?`.
pub fn wildcard_match(pattern: &str, text: &str) -> bool {
    let p: Vec<char> = pattern.to_lowercase().chars().collect();
    let t: Vec<char> = text.to_lowercase().chars().collect();
    let (mut pi, mut ti) = (0usize, 0usize);
    let (mut star, mut mark) = (None::<usize>, 0usize);
    while ti < t.len() {
        if pi < p.len() && (p[pi] == '?' || p[pi] == t[ti]) {
            pi += 1;
            ti += 1;
        } else if pi < p.len() && p[pi] == '*' {
            star = Some(pi);
            mark = ti;
            pi += 1;
        } else if let Some(s) = star {
            pi = s + 1;
            mark += 1;
            ti = mark;
        } else {
            return false;
        }
    }
    while pi < p.len() && p[pi] == '*' {
        pi += 1;
    }
    pi == p.len()
}

fn name_matches(tokens: &[String], name: &str) -> bool {
    if tokens.is_empty() {
        return true;
    }
    tokens.iter().any(|tok| {
        if tok.contains('*') || tok.contains('?') {
            wildcard_match(tok, name)
        } else {
            name.to_lowercase().contains(&tok.to_lowercase())
        }
    })
}

pub fn search_files(
    root: String,
    query: SearchQuery,
    rep: &Reporter,
) -> Result<SearchResult, String> {
    let root_path = normalize_windows_path(&root);
    if !root_path.is_dir() {
        return Err(format!("검색 시작 폴더가 존재하지 않습니다: {}", root_path.display()));
    }

    let tokens: Vec<String> = query
        .pattern
        .split([';', ','])
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .collect();

    let mut entries = Vec::new();
    let mut scanned = 0u64;
    let mut truncated = false;
    let mut cancelled = false;

    let walker = WalkDir::new(&root_path).follow_links(false).into_iter();
    for item in walker.filter_entry(|e| {
        // hidden dirs are skipped entirely unless requested
        query.include_hidden || e.depth() == 0 || !is_hidden_name(e)
    }) {
        let Ok(item) = item else { continue };
        if item.depth() == 0 {
            continue;
        }
        scanned += 1;
        if scanned % 200 == 0 {
            if rep.is_cancelled() {
                cancelled = true;
                break;
            }
            rep.set_progress(0, scanned, &item.path().parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default());
        }

        let is_dir = item.file_type().is_dir();
        if is_dir && !query.include_dirs {
            continue;
        }
        let name = item.file_name().to_string_lossy();
        if !name_matches(&tokens, &name) {
            continue;
        }
        let Some(fe) = entry_from_path(item.path()) else { continue };
        if !query.include_hidden && fe.is_hidden {
            continue;
        }
        if !fe.is_dir {
            if query.min_size.is_some_and(|m| fe.size < m) || query.max_size.is_some_and(|m| fe.size > m) {
                continue;
            }
        }
        if query.modified_after_ms.is_some_and(|m| fe.modified_ms < m)
            || query.modified_before_ms.is_some_and(|m| fe.modified_ms > m)
        {
            continue;
        }
        entries.push(fe);
        if entries.len() >= MAX_RESULTS {
            truncated = true;
            break;
        }
    }

    Ok(SearchResult { entries, truncated, cancelled, scanned })
}

fn is_hidden_name(e: &walkdir::DirEntry) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if let Ok(m) = e.metadata() {
            return m.file_attributes() & 0x2 != 0;
        }
    }
    e.file_name().to_string_lossy().starts_with('.')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wildcard_basics() {
        assert!(wildcard_match("*.jpg", "Photo.JPG"));
        assert!(wildcard_match("rep?rt*", "report_final.txt"));
        assert!(!wildcard_match("*.png", "a.jpg"));
        assert!(wildcard_match("*", "anything"));
    }

    #[test]
    fn search_finds_by_pattern_and_size() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("sub")).unwrap();
        std::fs::write(dir.path().join("a.txt"), b"hello").unwrap();
        std::fs::write(dir.path().join("sub").join("b.log"), vec![0u8; 100]).unwrap();
        let q = SearchQuery {
            pattern: "*.log".into(),
            include_dirs: false,
            include_hidden: true,
            min_size: Some(50),
            max_size: None,
            modified_after_ms: None,
            modified_before_ms: None,
        };
        let r = search_files(dir.path().to_string_lossy().to_string(), q, &Reporter::noop()).unwrap();
        assert_eq!(r.entries.len(), 1);
        assert_eq!(r.entries[0].name, "b.log");
    }
}
