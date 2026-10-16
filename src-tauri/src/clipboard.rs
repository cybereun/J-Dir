//! Windows clipboard file interop (CF_HDROP + "Preferred DropEffect") so that
//! Ctrl+C / Ctrl+V works between J-Dir and Windows Explorer.

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardFiles {
    pub paths: Vec<String>,
    pub cut: bool,
}

#[cfg(windows)]
mod imp {
    use super::ClipboardFiles;
    use std::ffi::c_void;
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
        RegisterClipboardFormatW, SetClipboardData,
    };
    use windows_sys::Win32::Foundation::GlobalFree;
    use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use windows_sys::Win32::UI::Shell::DragQueryFileW;

    const CF_HDROP: u32 = 15;
    const DROPEFFECT_COPY: u32 = 1;
    const DROPEFFECT_MOVE: u32 = 2;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain([0]).collect()
    }

    fn drop_effect_format() -> u32 {
        unsafe { RegisterClipboardFormatW(wide("Preferred DropEffect").as_ptr()) }
    }

    /// Allocates a movable global block holding `bytes`. Caller hands ownership to the clipboard.
    unsafe fn alloc_global(bytes: &[u8]) -> Result<*mut c_void, String> {
        let h = GlobalAlloc(GMEM_MOVEABLE, bytes.len());
        if h.is_null() {
            return Err("클립보드 메모리 할당 실패".to_string());
        }
        let ptr = GlobalLock(h) as *mut u8;
        if ptr.is_null() {
            GlobalFree(h);
            return Err("클립보드 메모리 잠금 실패".to_string());
        }
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr, bytes.len());
        GlobalUnlock(h);
        Ok(h)
    }

    pub fn set_files(hwnd: isize, paths: &[String], cut: bool) -> Result<(), String> {
        // DROPFILES: pFiles(u32)=20, pt(i32,i32)=0, fNC(i32)=0, fWide(i32)=1
        let mut buf: Vec<u8> = Vec::new();
        buf.extend_from_slice(&20u32.to_le_bytes());
        buf.extend_from_slice(&0i32.to_le_bytes());
        buf.extend_from_slice(&0i32.to_le_bytes());
        buf.extend_from_slice(&0i32.to_le_bytes());
        buf.extend_from_slice(&1i32.to_le_bytes());
        for p in paths {
            for u in p.encode_utf16() {
                buf.extend_from_slice(&u.to_le_bytes());
            }
            buf.extend_from_slice(&0u16.to_le_bytes());
        }
        buf.extend_from_slice(&0u16.to_le_bytes());

        unsafe {
            let h_files = alloc_global(&buf)?;
            let effect = if cut { DROPEFFECT_MOVE } else { DROPEFFECT_COPY };
            let h_effect = match alloc_global(&effect.to_le_bytes()) {
                Ok(h) => h,
                Err(e) => {
                    GlobalFree(h_files);
                    return Err(e);
                }
            };

            if OpenClipboard(hwnd as *mut c_void) == 0 {
                GlobalFree(h_files);
                GlobalFree(h_effect);
                return Err("클립보드를 열 수 없습니다.".to_string());
            }
            EmptyClipboard();
            let ok_files = !SetClipboardData(CF_HDROP, h_files).is_null();
            let ok_effect = !SetClipboardData(drop_effect_format(), h_effect).is_null();
            CloseClipboard();
            if !ok_files {
                GlobalFree(h_files);
                if !ok_effect {
                    GlobalFree(h_effect);
                }
                return Err("클립보드에 파일을 설정하지 못했습니다.".to_string());
            }
            if !ok_effect {
                GlobalFree(h_effect);
            }
        }
        Ok(())
    }

    pub fn get_files(hwnd: isize) -> Result<Option<ClipboardFiles>, String> {
        unsafe {
            if IsClipboardFormatAvailable(CF_HDROP) == 0 {
                return Ok(None);
            }
            if OpenClipboard(hwnd as *mut c_void) == 0 {
                return Err("클립보드를 열 수 없습니다.".to_string());
            }
            let mut result: Option<ClipboardFiles> = None;
            let hdrop = GetClipboardData(CF_HDROP);
            if !hdrop.is_null() {
                let count = DragQueryFileW(hdrop, 0xFFFF_FFFF, std::ptr::null_mut(), 0);
                let mut paths = Vec::new();
                for i in 0..count {
                    let len = DragQueryFileW(hdrop, i, std::ptr::null_mut(), 0);
                    let mut buf = vec![0u16; len as usize + 1];
                    let n = DragQueryFileW(hdrop, i, buf.as_mut_ptr(), buf.len() as u32);
                    paths.push(String::from_utf16_lossy(&buf[..n as usize]));
                }

                let mut cut = false;
                let h_effect = GetClipboardData(drop_effect_format());
                if !h_effect.is_null() {
                    let p = GlobalLock(h_effect) as *const u32;
                    if !p.is_null() {
                        cut = (*p & DROPEFFECT_MOVE) != 0 && (*p & DROPEFFECT_COPY) == 0;
                        GlobalUnlock(h_effect);
                    }
                }
                if !paths.is_empty() {
                    result = Some(ClipboardFiles { paths, cut });
                }
            }
            CloseClipboard();
            Ok(result)
        }
    }

    pub fn clear(hwnd: isize) -> Result<(), String> {
        unsafe {
            if OpenClipboard(hwnd as *mut c_void) == 0 {
                return Err("클립보드를 열 수 없습니다.".to_string());
            }
            EmptyClipboard();
            CloseClipboard();
        }
        Ok(())
    }
}

#[cfg(windows)]
pub use imp::{clear, get_files, set_files};

#[cfg(not(windows))]
pub fn set_files(_hwnd: isize, _paths: &[String], _cut: bool) -> Result<(), String> {
    Ok(())
}
#[cfg(not(windows))]
pub fn get_files(_hwnd: isize) -> Result<Option<ClipboardFiles>, String> {
    Ok(None)
}
#[cfg(not(windows))]
pub fn clear(_hwnd: isize) -> Result<(), String> {
    Ok(())
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn clipboard_roundtrip() {
        let paths = vec!["C:\\Windows\\notepad.exe".to_string(), "C:\\한글 폴더\\a.txt".to_string()];
        if set_files(0, &paths, true).is_err() {
            return; // no interactive clipboard available (e.g. CI session)
        }
        let got = get_files(0).unwrap().expect("files on clipboard");
        assert_eq!(got.paths, paths);
        assert!(got.cut);
        clear(0).unwrap();
        assert!(get_files(0).unwrap().is_none());
    }
}
