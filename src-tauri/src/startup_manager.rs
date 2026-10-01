use crate::network_probe::{acquire_job, execute_script, ProbeExecution};
use crate::service_manager::SYSTEM_CHANGE_LOCK;
use serde::Deserialize;
use std::time::{Duration, Instant};

const SOURCES: &[&str] = &["hkcu-run-64", "hkcu-run-32", "hklm-run-64", "hklm-run-32",
    "hkcu-runonce-64", "hkcu-runonce-32", "hklm-runonce-64", "hklm-runonce-32", "user-folder", "common-folder"];
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartupRequest {
    action: String, source: String, name: String, expected: String, confirmed: bool,
    #[serde(default)] value: String, #[serde(default)] kind: String,
    #[serde(default)] backup: bool, #[serde(default)] token: String,
}
fn validate(r: &StartupRequest) -> Result<(), String> {
    let folder = r.source.ends_with("-folder");
    let valid = SOURCES.contains(&r.source.as_str()) && if r.action == "list" {
        !r.confirmed && r.name.is_empty() && r.expected.is_empty() && r.value.is_empty()
            && r.kind.is_empty() && !r.backup && r.token.is_empty()
    } else {
        r.confirmed && !r.source.contains("runonce") && !r.name.is_empty()
            && r.name.encode_utf16().count() <= (if folder { 255 } else { 256 })
            && !r.name.chars().any(char::is_control) && !r.value.contains('\0')
            && r.value.encode_utf16().count() <= (if folder { 4096 } else { 8192 })
            && (if folder {
                crate::file_scan::valid_component(&r.name) && r.kind == "File"
                    && r.token.len() == 64 && r.token.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            } else { ["String", "ExpandString"].contains(&r.kind.as_str()) && r.token.is_empty() })
            && match r.action.as_str() {
                "disable" => r.expected == "registered" && !r.backup,
                "restore" => r.expected == "recoverable" && r.backup,
                _ => false,
            }
    };
    if valid { Ok(()) } else { Err("启动项参数无效，请重新读取所选来源并逐项确认。".into()) }
}
fn compact_script(source: &str) -> String {
    // Only fixed crate-owned source; user text is sent as JSON on stdin.
    let script = if source.ends_with("-folder") { include_str!("native_scripts/startup_folders.ps1") }
        else { include_str!("native_scripts/startup_manager.ps1") };
    script.lines().map(str::trim).filter(|line| !line.is_empty() && !line.starts_with('#') && !line.starts_with("//"))
        .collect::<Vec<_>>().join("\n")
}
#[tauri::command]
pub async fn run_startup_manager(job_id: String, request: StartupRequest) -> Result<ProbeExecution, String> {
    let lease = acquire_job(&job_id)?;
    validate(&request)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = SYSTEM_CHANGE_LOCK.try_lock().map_err(|_| "已有系统管理任务，请等待其结束。".to_owned())?;
        execute_script(&lease, &compact_script(&request.source),
            &serde_json::json!({"action":request.action,"source":request.source,"name":request.name,"expected":request.expected,
                "confirmed":request.confirmed,"value":request.value,"kind":request.kind,"backup":request.backup,"token":request.token}),
            Instant::now(), Duration::from_secs(20))
    }).await.map_err(|_| "启动项任务异常结束；请重新读取，勿直接重试。".to_owned())?
}
#[cfg(test)]
mod tests {
    use super::*;
    fn request(source: &str, action: &str) -> StartupRequest { StartupRequest { source: source.into(), action: action.into(),
        name: "Example.lnk".into(), value: "raw %PATH%".into(), kind: "String".into(), token: String::new(),
        backup: action == "restore", expected: if action == "restore" { "recoverable" } else { "registered" }.into(), confirmed: true } }
    #[test] fn accepts_explicit_run_views() {
        for source in &SOURCES[..4] { for action in ["disable", "restore"] { assert!(validate(&request(source, action)).is_ok()); } }
    }
    #[test] fn denies_other_sources_and_unconfirmed_or_stale_requests() {
        for source in &SOURCES[4..8] { assert!(validate(&request(source, "disable")).is_err()); }
        let mut r = request("hkcu-run-64", "disable"); r.confirmed = false; assert!(validate(&r).is_err());
        r.confirmed = true; r.backup = true; assert!(validate(&r).is_err());
        r.backup = false; r.expected = "recoverable".into(); assert!(validate(&r).is_err());
        for action in ["execute", "add", "edit", "set", "delete"] { assert!(validate(&request("hkcu-run-64", action)).is_err()); }
    }
    #[test] fn bounds_text_and_folder_identity() {
        let mut r = request("user-folder", "disable"); r.kind = "File".into(); r.token = "a".repeat(64);
        assert!(validate(&r).is_ok());
        for name in ["../X", "CON.lnk", "A:stream", "A\\B", "trailing.", "A\nB"] { r.name = name.into(); assert!(validate(&r).is_err()); }
        r = request("hkcu-run-64", "disable"); r.value = "😀".repeat(4096); assert!(validate(&r).is_ok());
        r.value.push('x'); assert!(validate(&r).is_err());
    }
    #[test] fn fixed_scripts_fit_windows_command_line() {
        for source in ["user-folder", "hkcu-run-64"] {
            assert!((compact_script(source).encode_utf16().count() + 700) * 8 / 3 + 300 < 32_767);
        }
    }
}
