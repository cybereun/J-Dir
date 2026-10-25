//! A long-lived document-parser process: one spawn serves many files, which is what makes
//! indexing thousands of documents practical (spawning the 100MB host per file would not be).

use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

const PARSE_TIMEOUT: Duration = Duration::from_secs(90);
const MAX_PARSE_BYTES: u64 = 200 * 1024 * 1024;

type Reply = Result<String, String>;
type Pending = Arc<Mutex<HashMap<String, Sender<Reply>>>>;

struct Proc {
    child: Child,
    stdin: ChildStdin,
}

pub struct ParserPool {
    program: PathBuf,
    proc: Mutex<Option<Proc>>,
    pending: Pending,
    seq: AtomicU64,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl ParserPool {
    pub fn new(program: PathBuf) -> Self {
        Self {
            program,
            proc: Mutex::new(None),
            pending: Arc::new(Mutex::new(HashMap::new())),
            seq: AtomicU64::new(1),
        }
    }

    /// Returns the document's plain text. Errors carry the parser's code (e.g. `ENCRYPTED: ...`).
    pub fn parse_text(&self, path: &str) -> Result<String, String> {
        for attempt in 0..2 {
            match self.try_parse(path) {
                Err(e) if e.starts_with("UNEXPECTED_EXIT") && attempt == 0 => continue,
                other => return other,
            }
        }
        Err("UNEXPECTED_EXIT: 파서가 비정상 종료했습니다.".to_string())
    }

    fn try_parse(&self, path: &str) -> Reply {
        let id = format!("p{}", self.seq.fetch_add(1, Ordering::Relaxed));
        let (tx, rx) = mpsc::channel();
        lock(&self.pending).insert(id.clone(), tx);

        let line = json!({
            "id": id,
            "operation": "parse",
            "path": path,
            "options": { "maxBytes": MAX_PARSE_BYTES },
        })
        .to_string();

        let write_ok = {
            let mut guard = lock(&self.proc);
            if let Err(e) = self.ensure_running(&mut guard) {
                lock(&self.pending).remove(&id);
                return Err(e);
            }
            let proc = guard.as_mut().expect("process ensured");
            writeln!(proc.stdin, "{}", line).and_then(|_| proc.stdin.flush()).is_ok()
        };
        if !write_ok {
            lock(&self.pending).remove(&id);
            self.kill();
            return Err("UNEXPECTED_EXIT: 파서 요청 전송 실패".to_string());
        }

        match rx.recv_timeout(PARSE_TIMEOUT) {
            Ok(reply) => reply,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                lock(&self.pending).remove(&id);
                // A stuck document would block every later request; restart the host.
                self.kill();
                Err("TIMEOUT: 문서 분석 시간이 초과되었습니다.".to_string())
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => Err("UNEXPECTED_EXIT: 파서가 종료되었습니다.".to_string()),
        }
    }

    fn ensure_running(&self, guard: &mut Option<Proc>) -> Result<(), String> {
        if let Some(proc) = guard.as_mut() {
            if matches!(proc.child.try_wait(), Ok(None)) {
                return Ok(());
            }
            *guard = None;
        }
        let mut command = Command::new(&self.program);
        command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS: indexing must not slow the foreground.
            command.creation_flags(0x0800_0000 | 0x0000_4000);
        }
        let mut child = command.spawn().map_err(|e| format!("START: 파서를 시작할 수 없습니다: {}", e))?;
        let stdin = child.stdin.take().ok_or("START: 파서 입력 연결 실패")?;
        let stdout = child.stdout.take().ok_or("START: 파서 출력 연결 실패")?;
        let pending = Arc::clone(&self.pending);
        std::thread::Builder::new()
            .name("jdir-parser-reader".into())
            .spawn(move || {
                for line in BufReader::new(stdout).lines() {
                    let Ok(line) = line else { break };
                    let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
                    let Some(id) = v.get("id").and_then(Value::as_str) else { continue };
                    let reply: Reply = if v.get("ok").and_then(Value::as_bool) == Some(true) {
                        Ok(v.pointer("/document/plainText").and_then(Value::as_str).unwrap_or("").to_string())
                    } else {
                        let code = v.pointer("/error/code").and_then(Value::as_str).unwrap_or("INTERNAL");
                        let msg = v.pointer("/error/message").and_then(Value::as_str).unwrap_or("");
                        Err(format!("{}: {}", code, msg))
                    };
                    if let Some(tx) = lock(&pending).remove(id) {
                        let _ = tx.send(reply);
                    }
                }
                // Process ended: release everyone still waiting.
                let waiting: Vec<_> = lock(&pending).drain().collect();
                for (_, tx) in waiting {
                    let _ = tx.send(Err("UNEXPECTED_EXIT: 파서가 종료되었습니다.".to_string()));
                }
            })
            .map_err(|e| format!("START: {}", e))?;
        *guard = Some(Proc { child, stdin });
        Ok(())
    }

    fn kill(&self) {
        if let Some(mut proc) = lock(&self.proc).take() {
            let _ = proc.child.kill();
            let _ = proc.child.wait();
        }
    }

    pub fn shutdown(&self) {
        self.kill();
    }
}

impl Drop for ParserPool {
    fn drop(&mut self) {
        self.kill();
    }
}
