//! Remembers where the main window was (monitor, position, size, maximized) between runs.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewWindow, Window};

pub const MAIN_WINDOW: &str = "main";
const FILE_NAME: &str = "window-state.json";

#[derive(Clone, Copy, Serialize, Deserialize)]
struct SavedState {
    /// Outer (frame) position in virtual-desktop pixels; may be negative on a left/upper monitor.
    x: i32,
    y: i32,
    /// Inner (client) size in pixels.
    width: u32,
    height: u32,
    maximized: bool,
}

/// Last known state of the window while it was in its normal (not maximized/minimized) shape.
#[derive(Default)]
pub struct WindowMemory(Mutex<Option<SavedState>>);

fn state_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(FILE_NAME))
}

/// Tracks the window while it is moved / resized.
pub fn track(window: &Window) {
    if window.is_minimized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false) {
        return;
    }
    let maximized = window.is_maximized().unwrap_or(false);
    let mem = window.state::<WindowMemory>();
    let Ok(mut guard) = mem.0.lock() else { return };
    if maximized {
        // keep the previous normal rect (it is on the same monitor), just remember the flag
        if let Some(s) = guard.as_mut() {
            s.maximized = true;
        }
        return;
    }
    let (Ok(pos), Ok(size)) = (window.outer_position(), window.inner_size()) else { return };
    *guard = Some(SavedState {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        maximized: false,
    });
}

/// Writes the tracked state to disk (called when the window is closing).
pub fn save(window: &Window) {
    // make sure the very latest shape is captured even if the last event was missed
    track(window);
    let app = window.app_handle();
    let mem = window.state::<WindowMemory>();
    let Ok(guard) = mem.0.lock() else { return };
    let Some(state) = *guard else { return };
    let Some(path) = state_path(app) else { return };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(json) = serde_json::to_string(&state) {
        let _ = std::fs::write(path, json);
    }
}

/// Moves the main window back to where it was (if that spot is still on a connected monitor) and
/// only then shows it. The window is created hidden (`visible: false` in tauri.conf.json), so it
/// never flashes at the default spot first. It is shown on every path, even when nothing is restored.
pub fn restore(app: &AppHandle) {
    let Some(win) = app.get_webview_window(MAIN_WINDOW) else { return };
    apply_saved(app, &win);
    let _ = win.show();
}

fn apply_saved(app: &AppHandle, win: &WebviewWindow) {
    let Some(path) = state_path(app) else { return };
    let Ok(text) = std::fs::read_to_string(path) else { return };
    let Ok(saved) = serde_json::from_str::<SavedState>(&text) else { return };
    let Ok(monitors) = win.available_monitors() else { return };

    // the title bar's middle must be visible on some monitor, otherwise the window would be lost
    let px = saved.x + (saved.width / 2) as i32;
    let py = saved.y + 16;
    let on_screen = monitors.iter().any(|m| {
        let p = m.position();
        let s = m.size();
        px >= p.x && px < p.x + s.width as i32 && py >= p.y && py < p.y + s.height as i32
    });
    if !on_screen || saved.width < 300 || saved.height < 200 {
        return;
    }

    // position first so the size is applied with the target monitor's scale factor
    let _ = win.set_position(PhysicalPosition::new(saved.x, saved.y));
    let _ = win.set_size(PhysicalSize::new(saved.width, saved.height));
    let _ = win.set_position(PhysicalPosition::new(saved.x, saved.y));
    if saved.maximized {
        let _ = win.maximize();
    }
    if let Some(mem) = app.try_state::<WindowMemory>() {
        if let Ok(mut guard) = mem.0.lock() {
            *guard = Some(saved);
        }
    }
}
