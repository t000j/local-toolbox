use serde::Serialize;
use std::env;
use std::path::PathBuf;
use std::process::{Command, Stdio};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchResult { path: String, launched: bool, detail: String }

#[tauri::command]
pub async fn launch_workspace(paths: Vec<String>) -> Result<Vec<LaunchResult>, String> {
    if paths.is_empty() || paths.len() > 20 { return Err("每次启动需包含 1—20 个应用或文件夹".to_owned()); }
    tauri::async_runtime::spawn_blocking(move || {
        paths.into_iter().map(|path| {
            let launch = (|| -> Result<(), String> {
                let input = PathBuf::from(&path);
                if !input.is_absolute() { return Err("路径必须为绝对路径".to_owned()); }
                let target = input.canonicalize().map_err(|error| format!("目标不可用：{error}"))?;
                let mut command = if target.is_dir() {
                    let root = env::var_os("SystemRoot").ok_or("无法定位 Windows 目录")?;
                    let mut command = Command::new(PathBuf::from(root).join("explorer.exe"));
                    command.arg(&input);
                    command
                } else if target.is_file() && target.extension().and_then(|value| value.to_str()).is_some_and(|value| value.eq_ignore_ascii_case("exe")) {
                    Command::new(&target)
                } else { return Err("仅支持应用 .exe 和文件夹".to_owned()); };
                command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|error| error.to_string())?;
                Ok(())
            })();
            match launch { Ok(()) => LaunchResult { path, launched: true, detail: "已请求打开".to_owned() }, Err(detail) => LaunchResult { path, launched: false, detail } }
        }).collect()
    }).await.map_err(|error| error.to_string())
}
