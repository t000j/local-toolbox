use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::Value;
use std::env;
use std::io::Read;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

fn read_output(mut stream: impl Read, limit: usize) -> std::io::Result<Vec<u8>> {
    let mut output = Vec::new();
    let mut buffer = [0u8; 8192];
    loop {
        let count = stream.read(&mut buffer)?;
        if count == 0 { break; }
        let keep = count.min(limit.saturating_sub(output.len()));
        output.extend_from_slice(&buffer[..keep]);
    }
    Ok(output)
}

pub fn run_powershell(script: &str, variables: &[(&str, String)]) -> Result<Value, String> {
    let root = env::var_os("SystemRoot").ok_or("无法定位 Windows 系统目录")?;
    let executable = PathBuf::from(root).join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let script = format!("$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); try {{ & {{\n{script}\n}} }} catch {{ [Console]::Error.WriteLine($_.Exception.Message); exit 1 }}");
    let utf16: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
    let mut child = Command::new(executable)
        .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", &STANDARD.encode(utf16)])
        .envs(variables.iter().map(|(key, value)| (*key, value)))
        .creation_flags(0x0800_0000).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()
        .map_err(|error| format!("无法启动本机查询：{error}"))?;
    let stdout = child.stdout.take().ok_or("无法读取查询输出")?;
    let stderr = child.stderr.take().ok_or("无法读取查询错误")?;
    let out_reader = thread::spawn(move || read_output(stdout, 8 * 1024 * 1024 + 1));
    let err_reader = thread::spawn(move || read_output(stderr, 64 * 1024));
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if started.elapsed() < Duration::from_secs(45) => thread::sleep(Duration::from_millis(50)),
            _ => { let _ = child.kill(); let _ = child.wait(); break None; }
        }
    };
    let output = out_reader.join().map_err(|_| "读取查询输出失败")?.map_err(|error| error.to_string())?;
    let error = err_reader.join().map_err(|_| "读取查询错误失败")?.map_err(|error| error.to_string())?;
    let status = status.ok_or("本机查询超时，已停止查询")?;
    if !status.success() {
        let detail: String = String::from_utf8_lossy(&error).trim().chars().take(2000).collect();
        return Err(if detail.is_empty() { format!("本机查询未能完成，退出代码 {:?}", status.code()) } else { detail });
    }
    if output.len() > 8 * 1024 * 1024 { return Err("查询结果过大，请缩小范围".to_owned()); }
    serde_json::from_slice(&output).map_err(|error| format!("无法解析本机查询结果：{error}"))
}

#[tauri::command]
pub async fn list_desktop_windows() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let script = format!("{}\n{}", include_str!("native_scripts/window_api.ps1"), include_str!("native_scripts/window_list.ps1"));
        run_powershell(&script, &[("TOOLBOX_OWN_PID", std::process::id().to_string())])
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn control_desktop_window(handle: u64, process_id: u32, title: String, action: String) -> Result<Value, String> {
    if handle == 0 || handle > i64::MAX as u64 || process_id == 0 || process_id == std::process::id() || title.len() > 4096 {
        return Err("窗口信息无效，请刷新列表".to_owned());
    }
    if !["pin", "unpin", "minimize", "maximize", "restore", "close"].contains(&action.as_str()) { return Err("不支持此窗口操作".to_owned()); }
    tauri::async_runtime::spawn_blocking(move || {
        let script = format!("{}\n{}", include_str!("native_scripts/window_api.ps1"), include_str!("native_scripts/window_action.ps1"));
        run_powershell(&script, &[("TOOLBOX_HANDLE", handle.to_string()), ("TOOLBOX_OWNER", process_id.to_string()), ("TOOLBOX_TITLE", title), ("TOOLBOX_ACTION", action)])
    }).await.map_err(|error| error.to_string())?
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
pub struct WindowRect { left: i32, top: i32, right: i32, bottom: i32 }
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WindowMove {
    handle: u64, process_id: u32, title: String, expected: WindowRect, x: i32, y: i32, confirmed: bool,
}
#[tauri::command]
pub async fn move_desktop_window(request: WindowMove) -> Result<Value, String> {
    let r = &request.expected;
    if !request.confirmed || request.handle == 0 || request.handle > i64::MAX as u64
        || request.process_id == 0 || request.process_id == std::process::id() || request.title.len() > 4096
        || [r.left, r.top, r.right, r.bottom, request.x, request.y].iter().any(|v| !(-100000..=100000).contains(v))
        || r.right <= r.left || r.bottom <= r.top {
        return Err("窗口移动参数无效，请重新读取并确认。".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let script = format!("{}\n{}", include_str!("native_scripts/window_api.ps1"),
            include_str!("native_scripts/window_move.ps1"));
        run_powershell(&script, &[("TOOLBOX_HANDLE", request.handle.to_string()),
            ("TOOLBOX_OWNER", request.process_id.to_string()), ("TOOLBOX_TITLE", request.title),
            ("TOOLBOX_RECT", serde_json::to_string(&request.expected).map_err(|e| e.to_string())?),
            ("TOOLBOX_X", request.x.to_string()), ("TOOLBOX_Y", request.y.to_string())])
    }).await.map_err(|_| "窗口移动任务异常，请重新读取位置，勿自动重试。".to_owned())?
}

async fn query(script: &'static str, variables: Vec<(&'static str, String)>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || run_powershell(script, &variables)).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn list_installed_apps() -> Result<Value, String> { query(include_str!("native_scripts/apps.ps1"), vec![]).await }

#[tauri::command]
pub async fn query_event_logs(log_name: String, days: u32, level: u32, limit: u32, provider: String) -> Result<Value, String> {
    if !["System", "Application"].contains(&log_name.as_str()) || ![1, 7, 30].contains(&days) || level > 5 || limit == 0 || limit > 200 || provider.len() > 200 || provider.chars().any(|character| "*?[]".contains(character)) {
        return Err("事件查询参数无效".to_owned());
    }
    query(include_str!("native_scripts/events.ps1"), vec![("TOOLBOX_LOG", log_name), ("TOOLBOX_DAYS", days.to_string()), ("TOOLBOX_LEVEL", level.to_string()), ("TOOLBOX_LIMIT", limit.to_string()), ("TOOLBOX_PROVIDER", provider)]).await
}

#[tauri::command]
pub async fn get_battery_power() -> Result<Value, String> { query(include_str!("native_scripts/battery.ps1"), vec![]).await }

#[tauri::command]
pub async fn inspect_file_permissions(path: String) -> Result<Value, String> {
    let path = PathBuf::from(path);
    if !path.is_absolute() { return Err("请选择有效的文件或目录".to_owned()); }
    path.canonicalize().map_err(|error| error.to_string())?;
    query(include_str!("native_scripts/permissions.ps1"), vec![("TOOLBOX_PATH", path.to_string_lossy().into_owned())]).await
}

#[tauri::command]
pub async fn list_local_certificates(scope: String, store: String) -> Result<Value, String> {
    if !["CurrentUser", "LocalMachine"].contains(&scope.as_str()) || !["My", "Root", "CA"].contains(&store.as_str()) { return Err("请选择受支持的证书存储区".to_owned()); }
    query(include_str!("native_scripts/certificates.ps1"), vec![("TOOLBOX_SCOPE", scope), ("TOOLBOX_STORE", store)]).await
}

#[tauri::command]
pub async fn list_device_drivers() -> Result<Value, String> { query(include_str!("native_scripts/devices.ps1"), vec![]).await }
