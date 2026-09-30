use serde::Serialize;
use std::collections::HashSet;
use std::env;
use std::fs;
use std::os::windows::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

struct Candidate { path: PathBuf, bytes: u64, modified: SystemTime }
struct Snapshot { token: String, root: PathBuf, created: Instant, files: Vec<Candidate> }
static SNAPSHOT: OnceLock<Mutex<Option<Snapshot>>> = OnceLock::new();
static SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupFile { id: usize, path: String, bytes: u64, modified_at: u64 }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupPreview { token: String, root: String, files: Vec<CleanupFile>, total_bytes: u64, skipped_count: u64, truncated: bool }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupFailure { path: String, reason: String }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupResult { deleted_count: usize, deleted_bytes: u64, failures: Vec<CleanupFailure> }

fn current_temp_root() -> Result<PathBuf, String> {
    let local = env::var_os("LOCALAPPDATA").ok_or("无法定位用户临时目录")?;
    let expected_input = PathBuf::from(local).join("Temp");
    let actual_input = env::temp_dir();
    for path in [&expected_input, &actual_input] {
        let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
        if metadata.file_attributes() & 0x400 != 0 || metadata.file_type().is_symlink() { return Err("临时目录是链接或重解析点，已停止清理".to_owned()); }
    }
    let expected = expected_input.canonicalize().map_err(|error| error.to_string())?;
    let actual = actual_input.canonicalize().map_err(|error| error.to_string())?;
    if actual.to_string_lossy().to_lowercase() != expected.to_string_lossy().to_lowercase() || !actual.is_dir() {
        return Err("清理仅支持当前用户的 AppData\\Local\\Temp 目录".to_owned());
    }
    Ok(actual)
}

fn no_redirects(root: &Path, path: &Path) -> bool {
    if !path.starts_with(root) { return false; }
    for ancestor in path.ancestors() {
        let Ok(metadata) = fs::symlink_metadata(ancestor) else { return false };
        if metadata.file_attributes() & 0x400 != 0 || metadata.file_type().is_symlink() { return false; }
        if ancestor == root { return true; }
    }
    false
}

#[tauri::command]
pub async fn preview_temp_cleanup() -> Result<CleanupPreview, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let root = current_temp_root()?;
        let cutoff = SystemTime::now().checked_sub(Duration::from_secs(7 * 86400)).ok_or("无法计算清理时间范围")?;
        let started = Instant::now();
        let mut stack = vec![(root.clone(), 0usize)];
        let mut candidates = Vec::new();
        let mut skipped_count = 0;
        let mut truncated = false;
        let mut visited = 0;
        'scan: while let Some((directory, depth)) = stack.pop() {
            if depth > 16 { skipped_count += 1; continue; }
            let entries = match fs::read_dir(&directory) { Ok(entries) => entries, Err(_) => { skipped_count += 1; continue; } };
            for entry in entries {
                if visited >= 50_000 || candidates.len() >= 2000 || started.elapsed() > Duration::from_secs(10) { truncated = true; break 'scan; }
                visited += 1;
                let entry = match entry { Ok(entry) => entry, Err(_) => { skipped_count += 1; continue; } };
                let metadata = match fs::symlink_metadata(entry.path()) { Ok(metadata) => metadata, Err(_) => { skipped_count += 1; continue; } };
                if metadata.file_attributes() & 0x400 != 0 || metadata.file_type().is_symlink() { skipped_count += 1; continue; }
                if metadata.is_dir() { stack.push((entry.path(), depth + 1)); }
                else if metadata.is_file() {
                    if let Ok(modified) = metadata.modified() {
                        if modified < cutoff { candidates.push(Candidate { path: entry.path(), bytes: metadata.len(), modified }); }
                    }
                }
            }
        }
        candidates.sort_by_key(|item| std::cmp::Reverse(item.bytes));
        let token = format!("{}-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos(), SEQUENCE.fetch_add(1, Ordering::Relaxed));
        let files = candidates.iter().enumerate().map(|(id, item)| CleanupFile {
            id, path: item.path.to_string_lossy().into_owned(), bytes: item.bytes,
            modified_at: item.modified.duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64,
        }).collect();
        let total_bytes = candidates.iter().map(|item| item.bytes).sum();
        let preview = CleanupPreview { token: token.clone(), root: root.to_string_lossy().into_owned(), files, total_bytes, skipped_count, truncated };
        *SNAPSHOT.get_or_init(|| Mutex::new(None)).lock().map_err(|_| "清理预览状态不可用")? = Some(Snapshot { token, root, created: Instant::now(), files: candidates });
        Ok(preview)
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn execute_temp_cleanup(token: String, ids: Vec<usize>) -> Result<CleanupResult, String> {
    if ids.is_empty() || ids.len() > 2000 { return Err("请选择 1—2000 个预览文件".to_owned()); }
    tauri::async_runtime::spawn_blocking(move || {
        let mut state = SNAPSHOT.get_or_init(|| Mutex::new(None)).lock().map_err(|_| "清理预览状态不可用")?;
        let snapshot = state.as_ref().ok_or("请先生成清理预览")?;
        if snapshot.token != token || snapshot.created.elapsed() > Duration::from_secs(600) { return Err("清理预览已失效，请重新扫描".to_owned()); }
        if ids.iter().any(|id| *id >= snapshot.files.len()) { return Err("清理选择不属于本次预览".to_owned()); }
        let snapshot = state.take().ok_or("清理预览不可用")?;
        drop(state);
        if current_temp_root()? != snapshot.root { return Err("用户临时目录已发生变化，请重新扫描".to_owned()); }
        let selected: HashSet<_> = ids.into_iter().collect();
        let mut result = CleanupResult { deleted_count: 0, deleted_bytes: 0, failures: Vec::new() };
        for (id, item) in snapshot.files.into_iter().enumerate() {
            if !selected.contains(&id) { continue; }
            let deletion = (|| -> Result<(), String> {
                if !no_redirects(&snapshot.root, &item.path) { return Err("路径或链接已变化，已跳过".to_owned()); }
                let metadata = fs::symlink_metadata(&item.path).map_err(|error| error.to_string())?;
                if !metadata.is_file() || metadata.len() != item.bytes || metadata.modified().ok() != Some(item.modified) { return Err("文件内容或修改时间已变化，已跳过".to_owned()); }
                fs::remove_file(&item.path).map_err(|error| error.to_string())
            })();
            match deletion {
                Ok(()) => { result.deleted_count += 1; result.deleted_bytes += item.bytes; }
                Err(reason) => result.failures.push(CleanupFailure { path: item.path.to_string_lossy().into_owned(), reason }),
            }
        }
        Ok(result)
    }).await.map_err(|error| error.to_string())?
}
