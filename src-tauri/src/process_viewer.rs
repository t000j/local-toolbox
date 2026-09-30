use crate::network_probe::{acquire_job, execute_script, ProbeExecution};
use std::time::{Duration, Instant};

#[tauri::command]
pub async fn run_process_snapshot(job_id: String) -> Result<ProbeExecution, String> {
    let lease = acquire_job(&job_id)?;
    let started = Instant::now();
    tauri::async_runtime::spawn_blocking(move || {
        execute_script(&lease, include_str!("native_scripts/process_viewer.ps1"),
            &serde_json::json!({}), started, Duration::from_secs(15))
    }).await.map_err(|_| "进程快照工作线程异常结束。".to_owned())?
}
