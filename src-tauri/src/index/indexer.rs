use super::db;
use super::key::SecretKey;
use super::parser::ParserPool;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

/// Extensions whose text content is indexed.
pub const INDEXED_EXTS: &[&str] = &[
    "txt", "md", "markdown", "hwp", "hwpx", "hml", "hwpml", "pdf", "xlsx", "docx", "doc", "xls", "ppt", "pptx",
];
const MAX_TEXT_FILE: u64 = 20 * 1024 * 1024;
const MAX_DOC_FILE: u64 = 150 * 1024 * 1024;
const MAX_BODY_CHARS: usize = 3_000_000;
const WORKERS: usize = 2;
const BATCH: usize = 25;
const SKIP_DIRS: &[&str] = &["node_modules", ".git", ".svn", "$recycle.bin", "system volume information", "$windows.~bt"];

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct IndexProgress {
    pub running: bool,
    pub phase: String,
    pub folder_path: String,
    pub total: u64,
    pub done: u64,
    pub errors: u64,
    pub current: String,
    pub cancelled: bool,
    pub finished: bool,
    pub message: String,
}

struct Candidate {
    path: String,
    name: String,
    ext: String,
    size: u64,
    mtime_ms: i64,
}

struct Extracted {
    idx: usize,
    status: &'static str,
    error: Option<String>,
    body: String,
}

pub struct IndexService {
    dir: PathBuf,
    key: SecretKey,
    parser: Arc<ParserPool>,
    running: AtomicBool,
    cancel: AtomicBool,
    progress: Mutex<IndexProgress>,
}

impl IndexService {
    pub fn new(dir: PathBuf, key: SecretKey, parser_program: PathBuf) -> Self {
        Self {
            dir,
            key,
            parser: Arc::new(ParserPool::new(parser_program)),
            running: AtomicBool::new(false),
            cancel: AtomicBool::new(false),
            progress: Mutex::new(IndexProgress::default()),
        }
    }

    pub fn conn(&self) -> Result<Connection, String> {
        db::open(&self.dir.join("index.db"), &self.key)
    }

    pub fn progress(&self) -> IndexProgress {
        self.progress.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    fn set_progress(&self, app: &AppHandle, update: impl FnOnce(&mut IndexProgress)) {
        let snapshot = {
            let mut p = self.progress.lock().unwrap_or_else(|e| e.into_inner());
            update(&mut p);
            p.clone()
        };
        let _ = app.emit("jdir://index-progress", snapshot);
    }

    /// Starts indexing in the background. Only one run at a time.
    pub fn start(self: &Arc<Self>, app: AppHandle, folder_id: Option<i64>) -> Result<(), String> {
        if self.running.swap(true, Ordering::SeqCst) {
            return Err("이미 색인 중입니다.".to_string());
        }
        self.cancel.store(false, Ordering::SeqCst);
        let me = Arc::clone(self);
        let spawned = std::thread::Builder::new().name("jdir-indexer".into()).spawn(move || {
            #[cfg(windows)]
            lower_thread_priority();
            me.set_progress(&app, |p| *p = IndexProgress { running: true, phase: "scan".into(), ..Default::default() });
            let result = me.run(&app, folder_id);
            let cancelled = me.cancel.load(Ordering::SeqCst);
            me.parser.shutdown(); // release the parser host's memory when idle
            me.running.store(false, Ordering::SeqCst);
            me.set_progress(&app, |p| {
                p.running = false;
                p.finished = true;
                p.cancelled = cancelled;
                p.phase = "done".into();
                p.current.clear();
                if let Err(e) = &result {
                    p.message = e.clone();
                }
            });
        });
        if let Err(e) = spawned {
            self.running.store(false, Ordering::SeqCst);
            return Err(format!("색인 시작 실패: {}", e));
        }
        Ok(())
    }

    fn run(&self, app: &AppHandle, folder_id: Option<i64>) -> Result<(), String> {
        let conn = self.conn()?;
        let folders: Vec<_> =
            db::list_folders(&conn)?.into_iter().filter(|f| folder_id.map_or(true, |id| id == f.id)).collect();
        for f in folders {
            if self.cancel.load(Ordering::SeqCst) {
                break;
            }
            self.index_folder(app, &conn, f.id, &f.path)?;
            if !self.cancel.load(Ordering::SeqCst) {
                let now = chrono::Utc::now().timestamp_millis();
                let _ = conn.execute("UPDATE folders SET last_indexed_ms = ?1 WHERE id = ?2", params![now, f.id]);
            }
        }
        Ok(())
    }

    fn index_folder(&self, app: &AppHandle, conn: &Connection, folder_id: i64, root: &str) -> Result<(), String> {
        self.set_progress(app, |p| {
            p.phase = "scan".into();
            p.folder_path = root.to_string();
            p.total = 0;
            p.done = 0;
            p.current.clear();
        });

        let mut existing: HashMap<String, (i64, i64, i64)> = HashMap::new();
        {
            let mut stmt = conn
                .prepare("SELECT path, id, size, mtime_ms FROM documents WHERE folder_id = ?1")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![folder_id], |r| Ok((r.get::<_, String>(0)?, (r.get(1)?, r.get(2)?, r.get(3)?))))
                .map_err(|e| e.to_string())?;
            for row in rows.flatten() {
                existing.insert(row.0, row.1);
            }
        }

        let mut seen: HashSet<String> = HashSet::new();
        let mut todo: Vec<Candidate> = Vec::new();
        let mut visited = 0u64;
        for entry in WalkDir::new(root).follow_links(false).into_iter().filter_entry(|e| !skip_entry(e)) {
            visited += 1;
            if visited % 500 == 0 {
                if self.cancel.load(Ordering::SeqCst) {
                    return Ok(());
                }
                self.set_progress(app, |p| p.current = format!("{}개 항목 확인 중…", visited));
            }
            let Ok(entry) = entry else { continue };
            if !entry.file_type().is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("~$") {
                continue; // Office lock files
            }
            let ext = Path::new(&name).extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
            if !INDEXED_EXTS.contains(&ext.as_str()) {
                continue;
            }
            let Ok(meta) = entry.metadata() else { continue };
            let size = meta.len();
            let mtime_ms = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            let path = entry.path().to_string_lossy().to_string();
            seen.insert(path.clone());
            let unchanged = existing.get(&path).map_or(false, |(_, sz, mt)| *sz == size as i64 && *mt == mtime_ms);
            if !unchanged {
                todo.push(Candidate { path, name, ext, size, mtime_ms });
            }
        }

        // Files that disappeared since the last run.
        let gone: Vec<i64> = existing.iter().filter(|(p, _)| !seen.contains(*p)).map(|(_, v)| v.0).collect();
        if !gone.is_empty() {
            conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;
            for id in &gone {
                let _ = conn.execute("DELETE FROM doc_fts WHERE rowid = ?1", params![id]);
                let _ = conn.execute("DELETE FROM documents WHERE id = ?1", params![id]);
            }
            conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
        }

        let total = todo.len() as u64;
        self.set_progress(app, |p| {
            p.phase = "index".into();
            p.total = total;
            p.done = 0;
            p.current.clear();
        });
        if todo.is_empty() {
            return Ok(());
        }

        let next = AtomicUsize::new(0);
        let (tx, rx) = mpsc::channel::<Extracted>();
        let mut errors = 0u64;
        let mut done = 0u64;
        let mut in_batch = 0usize;
        let mut last_emit = Instant::now();
        conn.execute_batch("BEGIN").map_err(|e| e.to_string())?;
        let mut write_error: Option<String> = None;

        std::thread::scope(|scope| {
            for _ in 0..WORKERS {
                let tx = tx.clone();
                let todo = &todo;
                let next = &next;
                scope.spawn(move || {
                    #[cfg(windows)]
                    lower_thread_priority();
                    loop {
                        if self.cancel.load(Ordering::SeqCst) {
                            break;
                        }
                        let idx = next.fetch_add(1, Ordering::SeqCst);
                        let Some(c) = todo.get(idx) else { break };
                        let (status, error, body) = self.extract(c);
                        if tx.send(Extracted { idx, status, error, body }).is_err() {
                            break;
                        }
                    }
                });
            }
            drop(tx);

            for res in rx {
                let c = &todo[res.idx];
                if res.status == "error" {
                    errors += 1;
                }
                if write_error.is_none() {
                    if let Err(e) = upsert(conn, folder_id, c, res.status, res.error.as_deref(), &res.body) {
                        write_error = Some(e);
                        self.cancel.store(true, Ordering::SeqCst);
                    }
                }
                done += 1;
                in_batch += 1;
                if in_batch >= BATCH {
                    let _ = conn.execute_batch("COMMIT; BEGIN");
                    in_batch = 0;
                }
                if last_emit.elapsed() > Duration::from_millis(150) || done == total {
                    last_emit = Instant::now();
                    let name = c.name.clone();
                    self.set_progress(app, |p| {
                        p.done = done;
                        p.errors = errors;
                        p.current = name;
                    });
                }
            }
        });
        conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
        match write_error {
            Some(e) => Err(e),
            None => Ok(()),
        }
    }

    fn extract(&self, c: &Candidate) -> (&'static str, Option<String>, String) {
        match c.ext.as_str() {
            "txt" | "md" | "markdown" => {
                if c.size > MAX_TEXT_FILE {
                    return ("skipped", Some("파일이 커서 본문을 색인하지 않았습니다.".into()), String::new());
                }
                match std::fs::read(&c.path) {
                    Ok(bytes) => ("ok", None, truncate_chars(decode_plain_text(&bytes), MAX_BODY_CHARS)),
                    Err(e) => ("error", Some(format!("읽기 실패: {}", e)), String::new()),
                }
            }
            _ => {
                if c.size > MAX_DOC_FILE {
                    return ("skipped", Some("파일이 커서 본문을 색인하지 않았습니다.".into()), String::new());
                }
                match self.parser.parse_text(&c.path) {
                    Ok(text) if text.trim().is_empty() => ("empty", None, String::new()),
                    Ok(text) => ("ok", None, truncate_chars(text, MAX_BODY_CHARS)),
                    Err(e) if e.starts_with("IMAGE_BASED_PDF") => {
                        ("empty", Some("이미지로만 구성된 PDF입니다.".into()), String::new())
                    }
                    Err(e) => ("error", Some(e), String::new()),
                }
            }
        }
    }
}

fn upsert(conn: &Connection, folder_id: i64, c: &Candidate, status: &str, error: Option<&str>, body: &str) -> Result<(), String> {
    let existing: Option<i64> = conn
        .query_row("SELECT id FROM documents WHERE path = ?1", params![c.path], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    let id = match existing {
        Some(id) => {
            conn.execute(
                "UPDATE documents SET folder_id=?2, name=?3, ext=?4, size=?5, mtime_ms=?6, status=?7, error=?8 WHERE id=?1",
                params![id, folder_id, c.name, c.ext, c.size as i64, c.mtime_ms, status, error],
            )
            .map_err(|e| e.to_string())?;
            conn.execute("DELETE FROM doc_fts WHERE rowid = ?1", params![id]).map_err(|e| e.to_string())?;
            id
        }
        None => {
            conn.execute(
                "INSERT INTO documents(folder_id, path, name, ext, size, mtime_ms, status, error) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                params![folder_id, c.path, c.name, c.ext, c.size as i64, c.mtime_ms, status, error],
            )
            .map_err(|e| e.to_string())?;
            conn.last_insert_rowid()
        }
    };
    conn.execute("INSERT INTO doc_fts(rowid, name, body) VALUES (?1, ?2, ?3)", params![id, c.name, body])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn skip_entry(e: &walkdir::DirEntry) -> bool {
    if e.depth() == 0 {
        return false;
    }
    let name = e.file_name().to_string_lossy().to_lowercase();
    if e.file_type().is_dir() {
        if SKIP_DIRS.contains(&name.as_str()) {
            return true;
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if let Ok(m) = e.metadata() {
                const HIDDEN_SYSTEM: u32 = 0x2 | 0x4;
                return m.file_attributes() & HIDDEN_SYSTEM != 0;
            }
        }
    }
    false
}

fn truncate_chars(s: String, max: usize) -> String {
    if s.chars().count() <= max {
        s
    } else {
        s.chars().take(max).collect()
    }
}

pub fn decode_plain_text(buf: &[u8]) -> String {
    if buf.len() >= 2 && buf[0] == 0xFF && buf[1] == 0xFE {
        let units: Vec<u16> = buf[2..].chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        return String::from_utf16_lossy(&units);
    }
    if buf.len() >= 2 && buf[0] == 0xFE && buf[1] == 0xFF {
        let units: Vec<u16> = buf[2..].chunks_exact(2).map(|c| u16::from_be_bytes([c[0], c[1]])).collect();
        return String::from_utf16_lossy(&units);
    }
    crate::preview::decode_text(buf, false).0
}

#[cfg(windows)]
fn lower_thread_priority() {
    use windows_sys::Win32::System::Threading::{GetCurrentThread, SetThreadPriority, THREAD_PRIORITY_BELOW_NORMAL};
    // SAFETY: operates on the calling thread's own pseudo-handle.
    unsafe {
        SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_BELOW_NORMAL);
    }
}
