use crate::network_probe::{acquire_job, execute_script, ProbeExecution};
use crate::service_manager::SYSTEM_CHANGE_LOCK;
use serde::Deserialize;
use std::time::{Duration, Instant};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartupRequest {
    action: String, name: String, expected: String, confirmed: bool,
    #[serde(default)] value: String, #[serde(default)] kind: String,
    #[serde(default)] new_value: String, #[serde(default)] scope: String,
}
#[tauri::command]
pub async fn run_startup_manager(job_id: String, request: StartupRequest) -> Result<ProbeExecution, String> {
    let lease = acquire_job(&job_id)?;
    if !["list", "disable", "restore"].contains(&request.action.as_str())
        || request.name.len() > 256 || request.name.chars().any(char::is_control)
        || request.value.len() > 8192 || request.value.contains('\0') || request.new_value.len() > 8192
        || (request.action != "list" && (!request.confirmed || request.name.is_empty()
            || !["String", "ExpandString"].contains(&request.kind.as_str())
            || (request.action == "disable" && (request.scope != "HKCU Run (64-bit)" || request.expected != "启用"))
            || (request.action == "restore" && (request.scope != "LocalToolbox 备份 (64-bit)" || request.expected != "可恢复")))) {
        return Err("启动项参数无效，请重新读取并确认。".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = SYSTEM_CHANGE_LOCK.try_lock().map_err(|_| "已有系统管理任务，请等待其结束。".to_owned())?;
        execute_script(&lease, include_str!("native_scripts/startup_manager.ps1"),
            &serde_json::json!({"action":request.action,"name":request.name,"expected":request.expected,
                "confirmed":request.confirmed,"value":request.value,"kind":request.kind}), Instant::now(), Duration::from_secs(20))
    }).await.map_err(|_| "启动项任务异常结束；请重新读取，勿直接重试。".to_owned())?
}
