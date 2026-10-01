use crate::network_probe::{acquire_job, execute_script, ProbeExecution};
use std::time::{Duration, Instant};
#[tauri::command]
pub async fn run_firewall_snapshot(job_id: String) -> Result<ProbeExecution, String> {
    let lease = acquire_job(&job_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        execute_script(&lease, include_str!("native_scripts/firewall_viewer.ps1"), &serde_json::json!({}),
            Instant::now(), Duration::from_secs(20))
    }).await.map_err(|_| "防火墙只读查询异常结束。".to_owned())?
}
