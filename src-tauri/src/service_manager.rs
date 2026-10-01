use crate::network_probe::{acquire_job, execute_script, ProbeExecution};
use serde::Deserialize;
use std::collections::HashSet;
use std::sync::Mutex;
pub(crate) static SYSTEM_CHANGE_LOCK: Mutex<()> = Mutex::new(());
use std::time::{Duration, Instant};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServiceRequest {
    action: String, name: String, expected: String, confirmed: bool,
    #[serde(default)] fingerprint: String,
    #[serde(default)] names: Vec<String>,
}
fn valid_name(name: &str) -> bool {
    !name.is_empty() && name.encode_utf16().count() <= 256 && !name.chars().any(char::is_control)
}
fn validate(request: &ServiceRequest) -> Result<(), String> {
    let valid = match request.action.as_str() {
        "list" => request.name.is_empty() && request.expected.is_empty() && !request.confirmed
            && request.fingerprint.is_empty() && request.names.is_empty(),
        "preview" => valid_name(&request.name) && ["Running", "Stopped"].contains(&request.expected.as_str())
            && !request.confirmed && request.fingerprint.is_empty() && request.names.is_empty(),
        "start" | "stop" => {
            let expected = if request.action == "start" { "Stopped" } else { "Running" };
            let mut unique = HashSet::new();
            request.confirmed && valid_name(&request.name) && request.expected == expected
                && request.fingerprint.len() == 64
                && request.fingerprint.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
                && !request.names.is_empty() && request.names.len() <= 32
                && request.names.last() == Some(&request.name)
                && request.names.iter().all(|n| valid_name(n) && unique.insert(n.to_lowercase()))
        },
        _ => false,
    };
    if valid { Ok(()) } else { Err("服务操作参数无效，请重新读取依赖预览并确认。".into()) }
}

#[tauri::command]
pub async fn run_service_manager(job_id: String, request: ServiceRequest) -> Result<ProbeExecution, String> {
    let lease = acquire_job(&job_id)?;
    validate(&request)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = SYSTEM_CHANGE_LOCK.try_lock().map_err(|_| "已有系统管理任务，请等待其结束。".to_owned())?;
        execute_script(&lease, include_str!("native_scripts/service_manager.ps1"),
            &serde_json::json!({"action":request.action,"name":request.name,
                "expected":request.expected,"confirmed":request.confirmed,
                "fingerprint":request.fingerprint,"names":request.names}), Instant::now(), Duration::from_secs(20))
    }).await.map_err(|_| "服务任务异常结束；如已提交操作，请重新读取状态，勿直接重试。".to_owned())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> ServiceRequest { ServiceRequest { action: "start".into(), name: "App".into(),
        expected: "Stopped".into(), confirmed: true, fingerprint: "a".repeat(64), names: vec!["Dependency".into(), "App".into()] } }
    #[test] fn accepts_bounded_confirmed_plan() { assert!(validate(&request()).is_ok()); }
    #[test] fn rejects_missing_confirmation_and_legacy_changes() {
        let mut r = request(); r.confirmed = false; assert!(validate(&r).is_err());
        r.confirmed = true; r.fingerprint.clear(); assert!(validate(&r).is_err());
    }
    #[test] fn rejects_scope_and_state_mismatch() {
        let mut r = request(); r.names.reverse(); assert!(validate(&r).is_err());
        r = request(); r.names.insert(0, "dependency".into()); assert!(validate(&r).is_err());
        r = request(); r.expected = "Running".into(); assert!(validate(&r).is_err());
        r = request(); r.names = vec!["X".into(); 33]; assert!(validate(&r).is_err());
    }
    #[test] fn rejects_control_names_and_bad_digest() {
        let mut r = request(); r.names[0] = "bad\nname".into(); assert!(validate(&r).is_err());
        r = request(); r.fingerprint = "z".repeat(64); assert!(validate(&r).is_err());
    }
}
