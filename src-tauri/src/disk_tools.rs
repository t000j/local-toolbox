use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::os::windows::fs::MetadataExt;
use std::path::PathBuf;
use std::time::{Duration, Instant};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SizedPath { path: String, bytes: u64 }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskScan { root: String, total_bytes: u64, file_count: u64, directory_count: u64, skipped_count: u64, truncated: bool, folders: Vec<SizedPath>, large_files: Vec<SizedPath> }

#[tauri::command]
pub async fn list_disk_volumes() -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(|| crate::native_windows::run_powershell(include_str!("native_scripts/volumes.ps1"), &[])).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn analyze_disk_space(path: String) -> Result<DiskScan, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let input = PathBuf::from(path);
        if !input.is_absolute() { return Err("请选择绝对路径的本地文件夹".to_owned()); }
        let root = input.canonicalize().map_err(|error| error.to_string())?;
        if !root.is_dir() { return Err("所选路径不是文件夹".to_owned()); }
        let started = Instant::now();
        let mut stack = vec![(root.clone(), 0usize, String::new())];
        let mut result = DiskScan { root: input.to_string_lossy().into_owned(), total_bytes: 0, file_count: 0, directory_count: 0, skipped_count: 0, truncated: false, folders: Vec::new(), large_files: Vec::new() };
        let mut groups: BTreeMap<String, u64> = BTreeMap::new();
        let mut visited = 0;
        'scan: while let Some((directory, depth, group)) = stack.pop() {
            if depth > 64 { result.skipped_count += 1; continue; }
            let entries = match fs::read_dir(&directory) { Ok(entries) => entries, Err(_) => { result.skipped_count += 1; continue; } };
            for entry in entries {
                if visited >= 200_000 || started.elapsed() > Duration::from_secs(20) { result.truncated = true; break 'scan; }
                visited += 1;
                let entry = match entry { Ok(entry) => entry, Err(_) => { result.skipped_count += 1; continue; } };
                let metadata = match fs::symlink_metadata(entry.path()) { Ok(metadata) => metadata, Err(_) => { result.skipped_count += 1; continue; } };
                if metadata.file_attributes() & 0x400 != 0 || metadata.file_type().is_symlink() { result.skipped_count += 1; continue; }
                let key = if depth == 0 && metadata.is_dir() { entry.file_name().to_string_lossy().into_owned() } else if group.is_empty() { "根目录文件".to_owned() } else { group.clone() };
                if metadata.is_dir() {
                    result.directory_count += 1;
                    groups.entry(key.clone()).or_default();
                    stack.push((entry.path(), depth + 1, key));
                } else if metadata.is_file() {
                    let bytes = metadata.len();
                    result.file_count += 1;
                    result.total_bytes = result.total_bytes.saturating_add(bytes);
                    let total = groups.entry(key).or_default();
                    *total = total.saturating_add(bytes);
                    result.large_files.push(SizedPath { path: entry.path().to_string_lossy().into_owned(), bytes });
                    if result.large_files.len() >= 200 { result.large_files.sort_by_key(|item| std::cmp::Reverse(item.bytes)); result.large_files.truncate(50); }
                }
            }
        }
        result.large_files.sort_by_key(|item| std::cmp::Reverse(item.bytes));
        result.large_files.truncate(50);
        result.folders = groups.into_iter().map(|(path, bytes)| SizedPath { path, bytes }).collect();
        result.folders.sort_by_key(|item| std::cmp::Reverse(item.bytes));
        result.folders.truncate(50);
        Ok(result)
    }).await.map_err(|error| error.to_string())?
}
