use crate::network_probe::{acquire_job, execute_probe, ProbeExecution, ProbeStatus};
use crate::service_manager::SYSTEM_CHANGE_LOCK;
use std::time::{Duration, Instant};
#[link(name = "user32")]
extern "system" { fn LockWorkStation() -> i32; fn ExitWindowsEx(flags: u32, reason: u32) -> i32; }
#[link(name = "powrprof")]
extern "system" { fn SetSuspendState(hibernate: u8, force: u8, disable_wake_event: u8) -> u8; }
#[tauri::command]
pub async fn run_power_action(job_id: String, action: String, confirmed: bool) -> Result<ProbeExecution, String> {
    let lease = acquire_job(&job_id)?;
    if !confirmed || !["lock", "sleep", "logoff", "restart", "shutdown"].contains(&action.as_str()) {
        return Err("电源操作未确认或动作无效。".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = SYSTEM_CHANGE_LOCK.try_lock().map_err(|_| "已有系统管理任务，请等待结束。".to_owned())?;
        let started = Instant::now();
        if lease.cancelled() { return Err("执行前已取消。".into()); }
        if action == "restart" || action == "shutdown" {
            // A nonzero shutdown /t implicitly forces applications closed. Always use /t 0 and NEVER /f.
            let flag = if action == "restart" { "/r" } else { "/s" };
            return execute_probe(&lease, "shutdown.exe", &[flag.into(), "/t".into(), "0".into()], started, Duration::from_secs(15));
        }
        // No FORCE, privilege adjustment, hibernation flag or security-setting modification.
        let success = unsafe { match action.as_str() {
            "lock" => LockWorkStation() != 0,
            "logoff" => ExitWindowsEx(0, 0) != 0,
            "sleep" => SetSuspendState(0, 0, 0) != 0,
            _ => false,
        }};
        if !success { return Err(format!("系统未接受请求，不会提权或重试：{}", std::io::Error::last_os_error())); }
        Ok(ProbeExecution { output: "系统调用已返回成功；不代表最终状态已核验，应用或系统策略仍可能阻止操作。".into(),
            status: ProbeStatus::Completed, exit_code: Some(0), elapsed_ms: started.elapsed().as_millis() as u64 })
    }).await.map_err(|_| "电源任务结果不明；请观察系统状态，不要直接重试。".to_owned())?
}
