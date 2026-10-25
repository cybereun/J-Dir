//! Database key protected with Windows DPAPI (bound to the current Windows user).

use std::fs;
use std::path::Path;

pub const KEY_LEN: usize = 32;

pub struct SecretKey(pub [u8; KEY_LEN]);

impl SecretKey {
    /// SQLCipher raw-key pragma value (`x'..'`), which skips the slow passphrase KDF.
    pub fn pragma(&self) -> String {
        let mut hex = String::with_capacity(KEY_LEN * 2 + 16);
        hex.push_str("PRAGMA key = \"x'");
        for b in self.0.iter() {
            hex.push_str(&format!("{:02x}", b));
        }
        hex.push_str("'\";");
        hex
    }
}

pub fn load_or_create(dir: &Path) -> Result<SecretKey, String> {
    fs::create_dir_all(dir).map_err(|e| format!("색인 폴더 생성 실패: {}", e))?;
    let key_path = dir.join("key.dat");
    if let Ok(protected) = fs::read(&key_path) {
        return unprotect(&protected);
    }
    let mut bytes = [0u8; KEY_LEN];
    getrandom::fill(&mut bytes).map_err(|e| format!("키 생성 실패: {}", e))?;
    let protected = protect(&bytes)?;
    let tmp = dir.join("key.dat.tmp");
    fs::write(&tmp, &protected).map_err(|e| format!("키 저장 실패: {}", e))?;
    fs::rename(&tmp, &key_path).map_err(|e| format!("키 저장 실패: {}", e))?;
    Ok(SecretKey(bytes))
}

#[cfg(windows)]
fn protect(plain: &[u8]) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB};

    let input = CRYPT_INTEGER_BLOB { cbData: plain.len() as u32, pbData: plain.as_ptr() as *mut u8 };
    let mut output = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
    let description: Vec<u16> = "J-Dir index key\0".encode_utf16().collect();
    // SAFETY: input points at a live slice; output is freed with LocalFree after copying.
    unsafe {
        let ok = CryptProtectData(
            &input,
            description.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        );
        if ok == 0 || output.pbData.is_null() {
            return Err("Windows 키 보호(DPAPI) 실패".to_string());
        }
        let data = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        LocalFree(output.pbData as *mut core::ffi::c_void);
        Ok(data)
    }
}

#[cfg(windows)]
fn unprotect(protected: &[u8]) -> Result<SecretKey, String> {
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB};

    let input = CRYPT_INTEGER_BLOB { cbData: protected.len() as u32, pbData: protected.as_ptr() as *mut u8 };
    let mut output = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
    // SAFETY: see `protect`.
    unsafe {
        let ok = CryptUnprotectData(
            &input,
            std::ptr::null_mut(),
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        );
        if ok == 0 || output.pbData.is_null() {
            return Err("색인 키를 복호화할 수 없습니다. (다른 Windows 계정에서 만든 색인일 수 있습니다)".to_string());
        }
        let data = std::slice::from_raw_parts_mut(output.pbData, output.cbData as usize);
        if data.len() != KEY_LEN {
            data.fill(0);
            LocalFree(output.pbData as *mut core::ffi::c_void);
            return Err("색인 키 길이가 올바르지 않습니다.".to_string());
        }
        let mut key = [0u8; KEY_LEN];
        key.copy_from_slice(data);
        data.fill(0);
        LocalFree(output.pbData as *mut core::ffi::c_void);
        Ok(SecretKey(key))
    }
}

#[cfg(not(windows))]
fn protect(_plain: &[u8]) -> Result<Vec<u8>, String> {
    Err("색인 키 보호는 Windows에서만 지원됩니다.".to_string())
}

#[cfg(not(windows))]
fn unprotect(_protected: &[u8]) -> Result<SecretKey, String> {
    Err("색인 키 보호는 Windows에서만 지원됩니다.".to_string())
}
