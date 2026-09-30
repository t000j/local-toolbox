use crate::network_probe::{acquire_job, execute_script, ProbeExecution};
use crate::service_manager::SYSTEM_CHANGE_LOCK;
use serde::Deserialize;
use std::time::{Duration, Instant};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EnvironmentRequest {
    action: String, name: String, expected: String, confirmed: bool,
    #[serde(default)] value: String, #[serde(default)] kind: String,
    #[serde(default)] new_value: String, #[serde(default)] scope: String,
}
#[tauri::command]
pub async fn run_environment_manager(job_id: String, request: EnvironmentRequest) -> Result<ProbeExecution, String> {
    let lease = acquire_job(&job_id)?;
    if !["list", "edit"].contains(&request.action.as_str()) || request.name.len() > 256
        || request.name.chars().any(|c| c.is_control() || c == '=')
        || request.value.len() > 8192 || request.new_value.len() > 8192
        || request.value.contains('\0') || request.new_value.contains('\0')
        || (request.action == "edit" && (!request.confirmed || request.name.is_empty()
            || request.new_value.is_empty() || request.scope != "用户 HKCU Environment"
            || request.expected != "可预览修改" || !["String", "ExpandString"].contains(&request.kind.as_str()))) {
        return Err("环境变量参数无效，仅可修改既有普通用户变量的非空值。".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = SYSTEM_CHANGE_LOCK.try_lock().map_err(|_| "已有系统管理任务，请等待其结束。".to_owned())?;
        execute_script(&lease, include_str!("native_scripts/environment_manager.ps1"),
            &serde_json::json!({"action":request.action,"name":request.name,"value":request.value,
                "newValue":request.new_value,"kind":request.kind,"confirmed":request.confirmed}), Instant::now(), Duration::from_secs(20))
    }).await.map_err(|_| "环境变量任务异常结束；请重新读取，勿直接重试。".to_owned())?
}
