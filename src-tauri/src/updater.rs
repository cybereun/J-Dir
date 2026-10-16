use crate::models::UpdateCheckResult;
use serde_json::Value;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const GITHUB_LATEST_RELEASE_URL: &str =
    "https://api.github.com/repos/cybereun/J-Dir/releases/latest";
const GITHUB_DOWNLOAD_PREFIX: &str = "https://github.com/cybereun/J-Dir/releases/download/";
const GITHUB_RELEASES_HTML_URL: &str = "https://github.com/cybereun/J-Dir/releases";

fn parse_semver(ver: &str) -> (u32, u32, u32) {
    let cleaned = ver.trim().trim_start_matches(['v', 'V']);
    let mut parts = cleaned.split(['.', '-']);
    let major = parts
        .next()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(0);
    let minor = parts
        .next()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(0);
    let patch = parts
        .next()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(0);
    (major, minor, patch)
}

pub fn is_newer_version(current: &str, latest: &str) -> bool {
    let cur = parse_semver(current);
    let lat = parse_semver(latest);
    lat > cur
}

pub fn check_for_updates() -> Result<UpdateCheckResult, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();

    let mut cmd = Command::new("C:\\Windows\\System32\\curl.exe");
    cmd.args([
        "-sSL",
        "--max-time",
        "10",
        "-H",
        "Accept: application/vnd.github+json",
        "-H",
        "User-Agent: J-Dir-Updater/1.0",
        GITHUB_LATEST_RELEASE_URL,
    ]);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .output()
        .map_err(|e| format!("GitHub 업데이트 확인 실행 실패: {}", e))?;

    if !output.status.success() {
        return Err("GitHub 서버에 연결할 수 없습니다.".to_string());
    }

    let body = String::from_utf8_lossy(&output.stdout);
    let json: Value = serde_json::from_str(&body)
        .map_err(|e| format!("GitHub 응답 파싱 실패: {}", e))?;

    // Handle case where no release exists yet
    if json.get("tag_name").is_none() {
        return Ok(UpdateCheckResult {
            current_version: current_version.clone(),
            latest_version: current_version,
            update_available: false,
            release_name: "J-Dir".to_string(),
            release_notes: "등록된 릴리즈 정보를 확인했습니다.".to_string(),
            published_at: String::new(),
            download_url: String::new(),
            asset_name: String::new(),
            html_url: GITHUB_RELEASES_HTML_URL.to_string(),
        });
    }

    let raw_tag = json["tag_name"].as_str().unwrap_or("v1.0.0");
    let latest_version = raw_tag.trim_start_matches(['v', 'V']).to_string();
    let release_name = json["name"]
        .as_str()
        .unwrap_or(raw_tag)
        .to_string();
    let release_notes = json["body"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let published_at = json["published_at"]
        .as_str()
        .unwrap_or("")
        .chars()
        .take(10)
        .collect::<String>();
    let html_url = json["html_url"]
        .as_str()
        .unwrap_or(GITHUB_RELEASES_HTML_URL)
        .to_string();

    let mut download_url = String::new();
    let mut asset_name = String::new();

    if let Some(assets) = json["assets"].as_array() {
        // Prefer NSIS setup.exe first, then any .exe
        for asset in assets {
            let name = asset["name"].as_str().unwrap_or("");
            let url = asset["browser_download_url"].as_str().unwrap_or("");
            let lower = name.to_lowercase();
            if lower.ends_with("setup.exe") || lower.contains("-setup") {
                asset_name = name.to_string();
                download_url = url.to_string();
                break;
            }
        }
        if download_url.is_empty() {
            for asset in assets {
                let name = asset["name"].as_str().unwrap_or("");
                let url = asset["browser_download_url"].as_str().unwrap_or("");
                if name.to_lowercase().ends_with(".exe") {
                    asset_name = name.to_string();
                    download_url = url.to_string();
                    break;
                }
            }
        }
    }

    let update_available = is_newer_version(&current_version, &latest_version);

    Ok(UpdateCheckResult {
        current_version,
        latest_version,
        update_available,
        release_name,
        release_notes,
        published_at,
        download_url,
        asset_name,
        html_url,
    })
}

pub fn install_update_and_restart(
    download_url: String,
    asset_name: String,
) -> Result<String, String> {
    if !download_url.starts_with(GITHUB_DOWNLOAD_PREFIX) {
        return Err("유효하지 않은 다운로드 URL입니다.".to_string());
    }

    let safe_name = if asset_name.trim().is_empty() {
        "J-Dir-Update-Setup.exe".to_string()
    } else {
        asset_name
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '.' || *c == '-' || *c == '_')
            .collect()
    };

    let temp_path = std::env::temp_dir().join(&safe_name);
    let temp_path_str = temp_path.to_string_lossy().to_string();

    let mut curl_cmd = Command::new("C:\\Windows\\System32\\curl.exe");
    curl_cmd.args([
        "-sSL",
        "--max-time",
        "120",
        "-o",
        &temp_path_str,
        &download_url,
    ]);

    #[cfg(target_os = "windows")]
    curl_cmd.creation_flags(CREATE_NO_WINDOW);

    let output = curl_cmd
        .output()
        .map_err(|e| format!("업데이트 파일 다운로드 실패: {}", e))?;

    if !output.status.success() || !temp_path.exists() {
        return Err("설치 파일을 다운로드하지 못했습니다.".to_string());
    }

    let current_exe = std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let is_installer = safe_name.to_lowercase().contains("setup");

    let ps_script = if is_installer {
        format!(
            "Start-Sleep -Milliseconds 600; Start-Process -FilePath '{}' -ArgumentList '/S' -Wait; Start-Process -FilePath '{}'",
            temp_path_str.replace('\'', "''"),
            current_exe.replace('\'', "''")
        )
    } else {
        format!(
            "Start-Sleep -Milliseconds 900; Copy-Item -Path '{}' -Destination '{}' -Force; Start-Process -FilePath '{}'",
            temp_path_str.replace('\'', "''"),
            current_exe.replace('\'', "''"),
            current_exe.replace('\'', "''")
        )
    };

    let mut updater_proc = Command::new("powershell.exe");
    updater_proc.args([
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-Command",
        &ps_script,
    ]);

    #[cfg(target_os = "windows")]
    updater_proc.creation_flags(CREATE_NO_WINDOW);

    updater_proc
        .spawn()
        .map_err(|e| format!("설치 프로세스 실행 실패: {}", e))?;

    // Exit current instance after a short delay so the response returns cleanly
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_millis(350));
        std::process::exit(0);
    });

    Ok(temp_path_str)
}
