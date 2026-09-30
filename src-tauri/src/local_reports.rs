use serde_json::{json, Value};
use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn write_new_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new().create_new(true).write(true).open(path).map_err(|error| format!("无法创建报告，目标文件可能已存在：{error}"))?;
    if let Err(error) = file.write_all(bytes).and_then(|()| file.flush()) {
        drop(file);
        let _ = fs::remove_file(path);
        return Err(format!("报告写入失败：{error}"));
    }
    Ok(())
}

fn output_path(value: String, extensions: &[&str]) -> Result<PathBuf, String> {
    let path = PathBuf::from(value);
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or_default().to_lowercase();
    if !path.is_absolute() || !extensions.contains(&extension.as_str()) || !path.parent().is_some_and(Path::is_dir) { return Err("报告路径或扩展名无效".to_owned()); }
    Ok(path)
}

#[tauri::command]
pub async fn export_battery_report(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output = output_path(path, &["html"])?;
        if output.exists() { return Err("目标报告已存在，请使用其他文件名".to_owned()); }
        let temp = env::temp_dir().canonicalize().map_err(|error| error.to_string())?;
        let id = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
        let directory = temp.join(format!("toolbox-battery-{}-{id}", std::process::id()));
        fs::create_dir(&directory).map_err(|error| error.to_string())?;
        let staging = directory.join("battery-report.html");
        let result = (|| {
            let root = env::var_os("SystemRoot").ok_or("无法定位 Windows 目录")?;
            let report = Command::new(PathBuf::from(root).join("System32/powercfg.exe")).args(["/batteryreport", "/output"]).arg(&staging)
                .creation_flags(0x0800_0000).output().map_err(|error| error.to_string())?;
            if !report.status.success() { return Err("Windows 未能生成电池报告，设备可能无电池或当前权限不足".to_owned()); }
            let bytes = fs::read(&staging).map_err(|error| error.to_string())?;
            if bytes.len() > 16 * 1024 * 1024 { return Err("电池报告过大".to_owned()); }
            write_new_file(&output, &bytes)
        })();
        let _ = fs::remove_file(&staging);
        let _ = fs::remove_dir(&directory);
        result
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn collect_diagnostic_report(include_network: bool) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut warnings = Vec::new();
        let system = serde_json::to_value(crate::system::get_system_overview()).map_err(|error| error.to_string())?;
        let volumes = match crate::native_windows::run_powershell(include_str!("native_scripts/volumes.ps1"), &[]) {
            Ok(value) => value, Err(error) => { warnings.push(error); Value::Null }
        };
        let network = if include_network {
            match crate::network::get_network_info().and_then(|value| serde_json::to_value(value).map_err(|error| error.to_string())) {
                Ok(value) => value, Err(error) => { warnings.push(error); Value::Null }
            }
        } else { Value::Null };
        Ok(json!({"reportVersion": 1, "system": system, "volumes": volumes, "network": network, "networkIncluded": include_network, "warnings": warnings}))
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn save_local_report(path: String, content: String) -> Result<(), String> {
    if content.is_empty() || content.len() > 2 * 1024 * 1024 { return Err("报告内容为空或超过 2 MB".to_owned()); }
    tauri::async_runtime::spawn_blocking(move || {
        let path = output_path(path, &["json", "txt"])?;
        if path.extension().and_then(|extension| extension.to_str()).is_some_and(|extension| extension.eq_ignore_ascii_case("json")) { serde_json::from_str::<Value>(&content).map_err(|_| "JSON 报告格式无效".to_owned())?; }
        write_new_file(&path, content.as_bytes())
    }).await.map_err(|error| error.to_string())?
}
