use crate::service_manager::SYSTEM_CHANGE_LOCK;
use serde::{Deserialize, Serialize};
use std::{ffi::c_void, fs::{self, File, OpenOptions}, io::{Read, Seek, SeekFrom, Write}, net::IpAddr, path::PathBuf};
use std::os::windows::{ffi::OsStringExt, fs::{MetadataExt, OpenOptionsExt}, io::AsRawHandle};
const LIMIT: usize = 256 * 1024;
#[link(name = "kernel32")]
extern "system" {
    fn GetWindowsDirectoryW(buffer: *mut u16, size: u32) -> u32;
    fn GetFileInformationByHandle(handle: *mut c_void, info: *mut FileInfo) -> i32;
}
#[repr(C)]
#[derive(Default)]
struct FileInfo { attributes: u32, times: [u32; 6], volume: u32, size_high: u32, size_low: u32, links: u32, index_high: u32, index_low: u32 }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HostsRequest { action: String, expected: String, content: String, bom: bool, confirmed: bool }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostsSnapshot { path: String, content: String, bom: bool, backup: Option<String> }
fn hosts_path() -> Result<PathBuf, String> {
    let mut buffer = vec![0u16; 32768];
    let n = unsafe { GetWindowsDirectoryW(buffer.as_mut_ptr(), buffer.len() as u32) } as usize;
    if n == 0 || n >= buffer.len() { return Err("无法定位 Windows 目录。".into()); }
    let path = PathBuf::from(std::ffi::OsString::from_wide(&buffer[..n])).join("System32/drivers/etc/hosts");
    if !path.is_absolute() { return Err("系统路径无效。".into()); }
    for part in path.ancestors().filter(|p| p.parent().is_some()) {
        if fs::symlink_metadata(part).map_err(|e| e.to_string())?.file_attributes() & 0x400 != 0 {
            return Err("拒绝重解析点或符号链接路径。".into());
        }
    }
    Ok(path)
}
fn read_bytes(file: &mut File) -> Result<Vec<u8>, String> {
    if file.metadata().map_err(|e| e.to_string())?.len() > LIMIT as u64 { return Err("Hosts 超过 256 KiB。".into()); }
    file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    let mut data = Vec::new(); (&mut *file).take((LIMIT + 1) as u64).read_to_end(&mut data).map_err(|e| e.to_string())?;
    if data.len() > LIMIT { return Err("Hosts 超过 256 KiB。".into()); } Ok(data)
}
fn encode(text: &str, bom: bool) -> Vec<u8> {
    let mut bytes = if bom { vec![0xef, 0xbb, 0xbf] } else { vec![] }; bytes.extend_from_slice(text.as_bytes()); bytes
}
pub(crate) fn validate(text: &str) -> Result<(), String> {
    if text.len() > LIMIT - 3 || text.chars().any(|c| c.is_control() && !['\r', '\n', '\t'].contains(&c)) { return Err("内容过大或含不允许的控制字符。".into()); }
    for (i, line) in text.lines().enumerate() {
        let fields: Vec<_> = line.split('#').next().unwrap_or("").split_ascii_whitespace().collect();
        if fields.is_empty() { continue; }
        let valid_host = |host: &str| {
            let host = host.strip_suffix('.').unwrap_or(host);
            !host.is_empty() && host.len() <= 253 && host.split('.').all(|label| !label.is_empty() && label.len() <= 63
                && !label.starts_with('-') && !label.ends_with('-') && label.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-'))
        };
        if fields.len() < 2 || fields[0].parse::<IpAddr>().is_err() || !fields[1..].iter().all(|h| valid_host(h)) {
            return Err(format!("第 {} 行须为严格 IPv4/IPv6 与 ASCII 主机名（国际域名请用 Punycode）。", i + 1));
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn manage_hosts(request: HostsRequest) -> Result<HostsSnapshot, String> {
    if !["read", "save"].contains(&request.action.as_str()) || request.expected.len() > LIMIT || request.content.len() > LIMIT
        || (request.action == "save" && !request.confirmed) { return Err("Hosts 请求无效或未经确认。".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = SYSTEM_CHANGE_LOCK.try_lock().map_err(|_| "已有系统管理任务。".to_owned())?;
        let saving = request.action == "save";
        if saving { validate(&request.content)?; }
        let path = hosts_path()?;
        // No create/truncate. Deny sharing while comparing, backing up and writing this exact handle.
        let mut file = OpenOptions::new().read(true).write(saving).share_mode(0).custom_flags(0x00200000)
            .open(&path).map_err(|e| format!("无法打开 Hosts；可能无权限或被占用，不会提权：{e}"))?;
        let mut info = FileInfo::default();
        if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0 || info.links != 1
            || info.attributes & (0x400 | 0x10) != 0 { return Err("Hosts 必须为非链接的普通单链接文件。".into()); }
        let old = read_bytes(&mut file)?;
        let bom = old.starts_with(&[0xef, 0xbb, 0xbf]);
        let content = std::str::from_utf8(if bom { &old[3..] } else { &old }).map_err(|_| "仅支持严格 UTF-8 / ASCII；不猜测或转换旧编码。")?.to_owned();
        if content.contains('\0') { return Err("不支持 UTF-16 或含 NUL 的 Hosts。".into()); }
        if !saving { return Ok(HostsSnapshot { path: path.display().to_string(), content, bom, backup: None }); }
        if encode(&request.expected, request.bom) != old { return Err("文件已被修改，请重新读取并预览；未写入。".into()); }
        let bytes = encode(&request.content, bom);
        if bytes == old { return Err("内容没有变化。".into()); }
        let id = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
        let backup = path.with_file_name(format!("hosts.localtoolbox-{id}-{}.bak", std::process::id()));
        let mut copy = OpenOptions::new().read(true).write(true).create_new(true).share_mode(0).open(&backup).map_err(|e| format!("未能建立备份，未写入：{e}"))?;
        copy.write_all(&old).and_then(|_| copy.sync_all()).map_err(|e| format!("备份失败，未写入：{e}"))?;
        if read_bytes(&mut copy)? != old { return Err("备份核验失败，未写入。".into()); }
        let write = (|| -> Result<(), String> {
            file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
            file.write_all(&bytes).and_then(|_| file.set_len(bytes.len() as u64)).and_then(|_| file.sync_all()).map_err(|e| e.to_string())?;
            if read_bytes(&mut file)? != bytes { return Err("写后核验不一致".into()); } Ok(())
        })();
        write.map_err(|e| format!("保存未核验，可能部分写入；不要重试。原始备份 {}：{e}", backup.display()))?;
        Ok(HostsSnapshot { path: path.display().to_string(), content: request.content, bom, backup: Some(backup.display().to_string()) })
    }).await.map_err(|_| "Hosts 任务异常；请重新读取，不要直接重试。".to_owned())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn format_validation() {
        for s in ["", "# 注释\r\n", "127.0.0.1 localhost alias # test", "::1 localhost", "2001:db8::1 xn--bcher-kva.example"] { assert!(validate(s).is_ok()); }
        for s in ["127.1 host", "1.2.3.999 host", "::1 -host", "::1 a..b", "::1 *.example", "::1 中文", "::1 a\0"] { assert!(validate(s).is_err()); }
    }
}
