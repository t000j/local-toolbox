//! Bounded ZIP tree transport validation before native output creation.
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
pub(super) const MAX_ENTRIES: usize = 200;
pub(super) const MAX_FILE: usize = 16 * 1024 * 1024;
const MAX_TOTAL: usize = 64 * 1024 * 1024;
pub(super) const BLOCK: usize = 256 * 1024;
pub(super) fn component(name: &str) -> bool {
    if name.encode_utf16().count() > 120 || !crate::file_scan::valid_component(name) { return false; }
    let stem = name.split('.').next().unwrap_or("").trim_end().to_uppercase();
    !matches!(stem.as_str(), "COM0" | "LPT0")
}
pub(super) fn parts(name: &str, directory: bool) -> Result<Vec<&str>, String> {
    if name.encode_utf16().count() > 512 || name.ends_with('/') != directory { return Err("ZIP 路径长度或类型无效。".into()); }
    let path = if directory { name.strip_suffix('/').unwrap_or("") } else { name };
    let parts: Vec<_> = path.split('/').collect();
    if parts.is_empty() || parts.len() > 16 || !parts.iter().all(|part| component(part)) { return Err("ZIP 路径含不安全名称或超过 16 层。".into()); }
    Ok(parts)
}
#[derive(Deserialize, Serialize)] #[serde(deny_unknown_fields)]
pub struct TreeEntry { pub(super) name: String, pub(super) directory: bool, pub(super) content: String, pub(super) size: usize, #[serde(default)] pub(super) crc: u32 }
pub(super) fn crc32(bytes: &[u8]) -> u32 { crc_update(0xffff_ffff, bytes) ^ 0xffff_ffff }
pub(super) fn crc_update(mut crc: u32, bytes: &[u8]) -> u32 {
    for byte in bytes { crc ^= u32::from(*byte); for _ in 0..8 { crc = (crc >> 1) ^ (0xedb8_8320 & 0u32.wrapping_sub(crc & 1)); } }
    crc
}
pub(super) struct Planned { pub(super) name: String, pub(super) directory: bool, pub(super) bytes: Vec<u8>, pub(super) crc: u32 }
pub(super) fn validate(entries: Vec<TreeEntry>) -> Result<Vec<Planned>, String> {
    if entries.len() > MAX_ENTRIES { return Err("包括父目录在内最多 200 项。".into()); }
    let mut names = BTreeMap::new(); let mut total = 0usize; let mut plan = Vec::new();
    for entry in entries {
        let path = parts(&entry.name, entry.directory)?.join("/");
        if names.insert(path.to_lowercase(), (path.clone(), entry.directory)).is_some() { return Err("重复或大小写冲突路径。".into()); }
        total = total.checked_add(entry.size).ok_or("ZIP 大小溢出。")?;
        if entry.size > MAX_FILE || total > MAX_TOTAL || entry.content.len() > 4 * entry.size.div_ceil(3)
            || (entry.directory && (entry.size != 0 || !entry.content.is_empty() || entry.crc != 0)) { return Err("ZIP 输出超过大小预算或目录数据不为空。".into()); }
        let bytes = base64::engine::general_purpose::STANDARD.decode(entry.content).map_err(|_| "ZIP 输出编码无效。")?;
        if bytes.len() != entry.size || crc32(&bytes) != entry.crc { return Err("ZIP 输出大小或 CRC32 不符。".into()); }
        plan.push(Planned { name: path, directory: entry.directory, bytes, crc: entry.crc });
    }
    for item in &plan {
        let components: Vec<_> = item.name.split('/').collect();
        for i in 1..components.len() {
            let parent = components[..i].join("/");
            if !names.get(&parent.to_lowercase()).is_some_and(|(exact, directory)| *directory && exact == &parent) { return Err("缺少父目录或路径大小写/类型冲突。".into()); }
        }
    }
    plan.sort_by(|a, b| a.name.split('/').count().cmp(&b.name.split('/').count()).then(a.name.cmp(&b.name)));
    Ok(plan)
}
