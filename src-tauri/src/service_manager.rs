use crate::network_probe::{acquire_job, execute_script, ProbeExecution};
use serde::Deserialize;
use std::sync::Mutex;
pub(crate) static SYSTEM_CHANGE_LOCK: Mutex<()> = Mutex::new(());
use std::time::{Duration, Instant};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServiceRequest { action: String, name: String, expected: String, confirmed: bool }

#[tauri::command]
pub async fn run_service_manager(job_id: String, request: ServiceRequest) -> Result<ProbeExecution, String> {
    let lease = acquire_job(&job_id)?;
    if !["list", "start", "stop"].contains(&request.action.as_str())
        || request.name.len() > 256 || request.name.chars().any(char::is_control)
        || (request.action != "list" && (!request.confirmed || request.name.is_empty()
            || !["Running", "Stopped"].contains(&request.expected.as_str()))) {
        return Err("服务操作参数无效，请重新读取并确认。".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = SYSTEM_CHANGE_LOCK.try_lock().map_err(|_| "已有系统管理任务，请等待其结束。".to_owned())?;
        execute_script(&lease, include_str!("native_scripts/service_manager.ps1"),
            &serde_json::json!({"action":request.action,"name":request.name,
                "expected":request.expected,"confirmed":request.confirmed}), Instant::now(), Duration::from_secs(20))
    }).await.map_err(|_| "服务任务异常结束；如已提交操作，请重新读取状态，勿直接重试。".to_owned())?
}
