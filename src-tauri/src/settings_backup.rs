use serde_json::Value;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::PathBuf;

const MAX_BACKUP_BYTES: usize = 4 * 1024 * 1024;

fn backup_path(value: String) -> Result<PathBuf, String> {
    let path = PathBuf::from(value);
    if !path.is_absolute() || !path.extension().and_then(|extension| extension.to_str()).is_some_and(|extension| extension.eq_ignore_ascii_case("json")) {
        return Err("请选择有效的 JSON 备份文件路径".to_owned());
    }
    Ok(path)
}

fn validate_backup(content: &str) -> Result<(), String> {
    if content.len() > MAX_BACKUP_BYTES { return Err("备份文件超过 4 MiB".to_owned()); }
    let data: Value = serde_json::from_str(content.trim_start_matches('\u{feff}')).map_err(|_| "备份文件不是有效的 JSON".to_owned())?;
    if data.get("format").and_then(Value::as_str) != Some("localtoolbox-settings") || data.get("schemaVersion").and_then(Value::as_u64) != Some(1)
        || !data.get("settings").is_some_and(Value::is_object) {
        return Err("文件不是受支持的 LocalToolbox 设置备份".to_owned());
    }
    Ok(())
}

#[tauri::command]
pub async fn read_settings_backup(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = backup_path(path)?;
        let file = File::open(path).map_err(|error| format!("无法打开备份文件：{error}"))?;
        let metadata = file.metadata().map_err(|error| error.to_string())?;
        if !metadata.is_file() || metadata.len() > MAX_BACKUP_BYTES as u64 { return Err("备份不是普通文件或超过 4 MiB".to_owned()); }
        let mut bytes = Vec::new();
        file.take((MAX_BACKUP_BYTES + 1) as u64).read_to_end(&mut bytes).map_err(|error| error.to_string())?;
        if bytes.len() > MAX_BACKUP_BYTES { return Err("备份文件超过 4 MiB".to_owned()); }
        let content = String::from_utf8(bytes).map_err(|_| "备份文件必须使用 UTF-8 编码".to_owned())?;
        validate_backup(&content)?;
        Ok(content)
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn save_settings_backup(path: String, content: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_backup(&content)?;
        let path = backup_path(path)?;
        if !path.parent().is_some_and(|parent| parent.is_dir()) { return Err("备份保存目录无效".to_owned()); }
        let mut file = OpenOptions::new().create_new(true).write(true).open(&path).map_err(|error| format!("无法创建备份，请使用新的文件名：{error}"))?;
        if let Err(error) = file.write_all(content.as_bytes()).and_then(|()| file.flush()) {
            drop(file);
            let _ = fs::remove_file(path);
            return Err(format!("备份保存失败：{error}"));
        }
        Ok(())
    }).await.map_err(|error| error.to_string())?
}
