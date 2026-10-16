use serde::Serialize;
use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

fn cancelled_set() -> &'static Mutex<HashSet<String>> {
    static SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SET.get_or_init(|| Mutex::new(HashSet::new()))
}

pub fn cancel_job(job_id: &str) {
    if let Ok(mut set) = cancelled_set().lock() {
        set.insert(job_id.to_string());
    }
}

pub fn finish_job(job_id: &str) {
    if let Ok(mut set) = cancelled_set().lock() {
        set.remove(job_id);
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub job_id: String,
    pub done_bytes: u64,
    pub total_bytes: u64,
    pub done_items: u64,
    pub total_items: u64,
    pub current: String,
}

type Sink = Box<dyn Fn(&ProgressEvent) + Send + Sync>;

/// Progress + cancellation handle shared by long-running file operations.
pub struct Reporter {
    job_id: String,
    sink: Option<Sink>,
    total_bytes: AtomicU64,
    total_items: AtomicU64,
    done_bytes: AtomicU64,
    done_items: AtomicU64,
    last_emit: Mutex<Option<Instant>>,
}

impl Reporter {
    pub fn noop() -> Self {
        Self::build(String::new(), None)
    }

    pub fn new(job_id: String, sink: Sink) -> Self {
        Self::build(job_id, Some(sink))
    }

    fn build(job_id: String, sink: Option<Sink>) -> Self {
        Self {
            job_id,
            sink,
            total_bytes: AtomicU64::new(0),
            total_items: AtomicU64::new(0),
            done_bytes: AtomicU64::new(0),
            done_items: AtomicU64::new(0),
            last_emit: Mutex::new(None),
        }
    }

    pub fn set_totals(&self, bytes: u64, items: u64) {
        self.total_bytes.store(bytes, Ordering::Relaxed);
        self.total_items.store(items, Ordering::Relaxed);
    }

    pub fn add_total_bytes(&self, n: u64) {
        self.total_bytes.fetch_add(n, Ordering::Relaxed);
    }

    pub fn is_cancelled(&self) -> bool {
        if self.sink.is_none() || self.job_id.is_empty() {
            return false;
        }
        cancelled_set()
            .lock()
            .map(|s| s.contains(&self.job_id))
            .unwrap_or(false)
    }

    pub fn add_bytes(&self, n: u64, current: &str) {
        self.done_bytes.fetch_add(n, Ordering::Relaxed);
        self.emit(current, false);
    }

    pub fn item_done(&self, current: &str) {
        self.done_items.fetch_add(1, Ordering::Relaxed);
        self.emit(current, true);
    }

    /// Sets absolute counters (used by scans that do not know their totals up-front).
    pub fn set_progress(&self, bytes: u64, items: u64, current: &str) {
        self.done_bytes.store(bytes, Ordering::Relaxed);
        self.done_items.store(items, Ordering::Relaxed);
        self.emit(current, false);
    }

    fn emit(&self, current: &str, force: bool) {
        let Some(sink) = &self.sink else { return };
        if !force {
            if let Ok(mut last) = self.last_emit.lock() {
                let now = Instant::now();
                if let Some(prev) = *last {
                    if now.duration_since(prev) < Duration::from_millis(80) {
                        return;
                    }
                }
                *last = Some(now);
            }
        }
        sink(&ProgressEvent {
            job_id: self.job_id.clone(),
            done_bytes: self.done_bytes.load(Ordering::Relaxed),
            total_bytes: self.total_bytes.load(Ordering::Relaxed),
            done_items: self.done_items.load(Ordering::Relaxed),
            total_items: self.total_items.load(Ordering::Relaxed),
            current: current.to_string(),
        });
    }
}
