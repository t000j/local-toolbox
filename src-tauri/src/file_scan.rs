//! Read-only, bounded scans of an explicitly selected local directory.
//! The script opens children relative to retained, non-reparse directory handles.
//! No request text is interpolated into PowerShell or native command arguments.
use crate::network_probe::{acquire_job, execute_script, ProbeExecution};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

const SCRIPT: &str = include_str!("native_scripts/file_scan.ps1");
const DEADLINE: Duration = Duration::from_secs(30);
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileScanMode { Search, Duplicates, Tree }

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FileScanRequest {
    root: String,
    mode: FileScanMode,
    #[serde(default)] name: String,
    #[serde(default)] extension: String,
    min_bytes: Option<u64>,
    max_bytes: Option<u64>,
    after_ms: Option<i64>,
    before_ms: Option<i64>,
}

pub(crate) fn valid_component(component: &str) -> bool {
    if component.is_empty() || component.encode_utf16().count() > 255
        || component.ends_with('.') || component.ends_with(' ')
        || component.chars().any(|ch| ch.is_control() || "<>:\"/\\|?*".contains(ch)) {
        return false;
    }
    let stem = component.split('.').next().unwrap_or("").trim_end().to_uppercase();
    !matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$")
        && !["COM", "LPT"].iter().any(|prefix| stem.strip_prefix(prefix)
            .is_some_and(|number| matches!(number, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³")))
}

fn validate(mut request: FileScanRequest) -> Result<FileScanRequest, String> {
    request.root = request.root.replace('/', "\\");
    if request.root.ends_with('\\') { request.root.pop(); }
    let bytes = request.root.as_bytes();
    if bytes.len() < 4 || !bytes[0].is_ascii_alphabetic() || bytes[1] != b':' || bytes[2] != b'\\'
        || request.root.encode_utf16().count() > 1000 {
        return Err("请选择本地盘中的一个子文件夹；不支持整盘、相对路径、网络路径或设备路径。".to_owned());
    }
    let components: Vec<&str> = request.root[3..].split('\\').collect();
    if components.len() > 64 || !components.iter().all(|part| valid_component(part)) {
        return Err("文件夹路径包含无效组件、设备名称、备用数据流或过深的层级。".to_owned());
    }
    if request.name.encode_utf16().count() > 200 || request.name.chars().any(char::is_control) {
        return Err("文件名包含条件最多 200 个字符，不能包含控制字符。".to_owned());
    }
    request.extension = request.extension.strip_prefix('.').unwrap_or(&request.extension).to_owned();
    if request.extension.encode_utf16().count() > 32 || request.extension.chars().any(|ch|
        ch.is_control() || ch.is_whitespace() || "<>:\"/\\|?*.".contains(ch)) {
        return Err("扩展名请输入单个后缀，例如 txt 或 .jpg，不支持通配符。".to_owned());
    }
    if [request.min_bytes, request.max_bytes].into_iter().flatten().any(|n| n > MAX_SAFE_INTEGER)
        || [request.after_ms, request.before_ms].into_iter().flatten().any(|n| !(-11_644_473_600_000..=253_402_300_799_999).contains(&n))
        || matches!((request.min_bytes, request.max_bytes), (Some(min), Some(max)) if min > max)
        || matches!((request.after_ms, request.before_ms), (Some(after), Some(before)) if after > before) {
        return Err("文件大小或修改时间范围无效。".to_owned());
    }
    Ok(request)
}

fn compact_script() -> String {
    // This crate-owned script has no multiline string content except its C#
    // source. Strip indentation and whole-line comments so EncodedCommand stays
    // safely below CreateProcessW's 32,767 UTF-16-character command-line limit.
    SCRIPT.lines().map(str::trim).filter(|line|
        !line.is_empty() && !line.starts_with('#') && !line.starts_with("//"))
        .collect::<Vec<_>>().join("\n")
}

#[tauri::command]
pub async fn run_file_scan(job_id: String, request: FileScanRequest) -> Result<ProbeExecution, String> {
    // Consume the reservation before validation; cancellation and cleanup retain
    // the same protected single-job ownership as the other native tools.
    let lease = acquire_job(&job_id)?;
    let started = Instant::now();
    tauri::async_runtime::spawn_blocking(move || {
        let request = validate(request)?;
        let input = serde_json::to_value(request).map_err(|_| "无法准备文件扫描参数。".to_owned())?;
        execute_script(&lease, &compact_script(), &input, started, DEADLINE)
    }).await.map_err(|error| format!("文件扫描工作线程异常结束：{error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request(root: &str) -> FileScanRequest {
        FileScanRequest { root: root.to_owned(), mode: FileScanMode::Search, name: String::new(), extension: String::new(),
            min_bytes: None, max_bytes: None, after_ms: None, before_ms: None }
    }
    #[test]
    fn only_local_absolute_subdirectories_are_accepted() {
        for root in [r"C:\Users\Example", "d:/fixture/test/", r"E:\资料"] { assert!(validate(request(root)).is_ok(), "{root}"); }
        for root in ["", "C:", "C:/", "C:\\", r"C:relative", r"\relative", r"\\host\share", r"\\?\C:\data",
            r"\\.\C:\data", r"C:\data\..\elsewhere", r"C:\data\.\file", r"C:\data:stream", r"C:\\data",
            r"C:\data\NUL.txt", r"C:\CON\data", r"C:\LPT¹\data", r"C:\data.\test", "C:\\data ", "C:\\bad\nname"] {
            assert!(validate(request(root)).is_err(), "{root:?}");
        }
    }
    #[test]
    fn filters_are_literals_and_numeric_ranges_are_bounded() {
        let mut q = request(r"C:\fixture"); q.name = "literal [*] $()".to_owned(); q.extension = ".TXT".to_owned();
        assert_eq!(validate(q).unwrap().extension, "TXT");
        for ext in ["*.txt", "tar.gz", "txt:ads", "a/b", "a b"] {
            let mut q = request(r"C:\fixture"); q.extension = ext.to_owned(); assert!(validate(q).is_err());
        }
        let mut q = request(r"C:\fixture"); q.min_bytes = Some(2); q.max_bytes = Some(1); assert!(validate(q).is_err());
        let mut q = request(r"C:\fixture"); q.after_ms = Some(2); q.before_ms = Some(1); assert!(validate(q).is_err());
        let mut q = request(r"C:\fixture"); q.max_bytes = Some(MAX_SAFE_INTEGER + 1); assert!(validate(q).is_err());
        let mut q = request(r"C:\fixture"); q.after_ms = Some(-11_644_473_600_000); q.before_ms = Some(-1); assert!(validate(q).is_ok());
        let mut q = request(r"C:\fixture"); q.after_ms = Some(-11_644_473_600_001); assert!(validate(q).is_err());
    }
    #[test]
    fn script_fits_windows_encoded_command_and_uses_handle_relative_reads() {
        // execute_script adds a fixed wrapper, then UTF-16/base64 encodes it.
        assert!((compact_script().encode_utf16().count() + 700) * 8 / 3 + 300 < 32_767);
        assert!(SCRIPT.contains("NtCreateFile"));
        assert!(SCRIPT.contains("GetFileInformationByHandleEx"));
        assert!(SCRIPT.contains("SHA256.Create()"));
        assert!(!SCRIPT.contains("Get-ChildItem"));
    }
}
