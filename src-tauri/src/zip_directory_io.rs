//! Handle-relative ZIP source enumeration and owned-output rollback.
use super::{Context, plan::{component, parts, crc32, TreeEntry, MAX_ENTRIES, MAX_FILE, BLOCK}};
use crate::safe_file_io::{self, NewFile};
use base64::Engine;
use std::{collections::BTreeSet, ffi::c_void, fs::File, io::Read, mem::{size_of, zeroed}, os::windows::io::AsRawHandle, ptr::null_mut};
type Handle = *mut c_void;
#[repr(C)] struct IoStatus { status: usize, info: usize }
#[repr(C)] #[derive(Default)] struct FileInfo { attrs: u32, created: [u32; 2], access: [u32; 2], modified: [u32; 2], volume: u32, size_hi: u32, size_lo: u32, links: u32, id_hi: u32, id_lo: u32 }
#[repr(C)] struct BasicInfo { created: i64, access: i64, modified: i64, change: i64, attrs: u32 }
#[link(name = "ntdll")]
extern "system" {
    fn NtQueryDirectoryFile(file: Handle, event: Handle, apc: Handle, context: Handle, status: *mut IoStatus, data: *mut c_void, size: u32, kind: u32, single: u8, name: Handle, restart: u8) -> i32;
}
#[link(name = "kernel32")]
extern "system" {
    fn GetFileInformationByHandle(file: Handle, info: *mut FileInfo) -> i32;
    fn GetFileInformationByHandleEx(file: Handle, kind: u32, data: *mut c_void, size: u32) -> i32;
    fn SetFileInformationByHandle(file: Handle, kind: u32, data: *const c_void, size: u32) -> i32;
}
#[derive(PartialEq, Eq)] pub(super) struct Stamp { volume: u32, id: u64, pub(super) size: u64, modified: i64, change: i64 }
pub(super) fn checked_stamp(file: &File, directory: bool) -> Result<Stamp, String> {
    let mut info = FileInfo::default();
    let mut basic: BasicInfo = unsafe { zeroed() };
    if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0
        || unsafe { GetFileInformationByHandleEx(file.as_raw_handle(), 0, (&mut basic as *mut BasicInfo).cast(), size_of::<BasicInfo>() as u32) } == 0 {
        return Err("无法核验 ZIP 源或输出句柄。".into());
    }
    if info.attrs & (0x400 | 0x1000 | 0x40000 | 0x400000) != 0 || (info.attrs & 16 != 0) != directory
        || (!directory && info.links != 1) || (info.id_hi == 0 && info.id_lo == 0) {
        return Err("拒绝重解析点、链接/硬链接、离线条目或变化的文件类型。".into());
    }
    Ok(Stamp { volume: info.volume, id: (u64::from(info.id_hi) << 32) | u64::from(info.id_lo), size: (u64::from(info.size_hi) << 32) | u64::from(info.size_lo), modified: basic.modified, change: basic.change })
}
fn list(directory: &File, context: &Context<'_>) -> Result<Vec<(String, bool)>, String> {
    // FILE_DIRECTORY_INFORMATION: fixed 64-byte prefix, UTF-16 FileName. u64
    // storage satisfies the kernel's 8-byte alignment requirement.
    let mut storage = vec![0u64; 8192]; let mut restart = 1; let mut entries = Vec::new(); let mut names = BTreeSet::new();
    loop {
        context.check()?;
        let mut status = IoStatus { status: 0, info: 0 };
        let code = unsafe { NtQueryDirectoryFile(directory.as_raw_handle(), null_mut(), null_mut(), null_mut(), &mut status, storage.as_mut_ptr().cast(), (storage.len() * 8) as u32, 1, 0, null_mut(), restart) };
        restart = 0;
        if code as u32 == 0x8000_0006 { break; } // STATUS_NO_MORE_FILES
        if code != 0 || status.info < 64 || status.info > storage.len() * 8 { return Err("目录枚举失败或不完整；没有生成压缩包。".into()); }
        let buffer = unsafe { std::slice::from_raw_parts(storage.as_ptr().cast::<u8>(), status.info) };
        let mut offset = 0;
        loop {
            if offset + 64 > buffer.len() { return Err("目录枚举结构无效。".into()); }
            let u32_at = |at: usize| u32::from_le_bytes(buffer[at..at + 4].try_into().unwrap());
            let next = u32_at(offset) as usize; let attrs = u32_at(offset + 56); let len = u32_at(offset + 60) as usize;
            if len == 0 || len % 2 != 0 || len > 510 || offset + 64 + len > buffer.len()
                || (next != 0 && (next % 8 != 0 || next < 64 + len || offset + next + 64 > buffer.len())) { return Err("目录枚举名称/偏移无效。".into()); }
            let wide: Vec<_> = buffer[offset + 64..offset + 64 + len].chunks_exact(2).map(|b| u16::from_le_bytes([b[0], b[1]])).collect();
            let name = String::from_utf16(&wide).map_err(|_| "拒绝无效 UTF-16 文件名。")?;
            if name != "." && name != ".." {
                if !component(&name) || attrs & (0x400 | 0x1000 | 0x40000 | 0x400000) != 0 || !names.insert(name.to_lowercase()) { return Err("源目录含不安全、重复、链接或离线条目。".into()); }
                entries.push((name, attrs & 16 != 0));
                if entries.len() > MAX_ENTRIES { return Err("源目录超过 200 项。".into()); }
            }
            if next == 0 { break; }
            offset += next;
        }
    }
    entries.sort_by(|a, b| a.0.cmp(&b.0)); Ok(entries)
}
pub(super) fn scan(directory: &File, prefix: &str, entries: &mut Vec<TreeEntry>, total: &mut usize, context: &Context<'_>) -> Result<(), String> {
    context.check()?; parts(prefix, true)?;
    let before = checked_stamp(directory, true)?;
    entries.push(TreeEntry { name: prefix.into(), directory: true, content: String::new(), size: 0, crc: 0 });
    if entries.len() > MAX_ENTRIES { return Err("源树（含根目录与空目录）最多 200 项。".into()); }
    for (name, is_directory) in list(directory, context)? {
        context.check()?;
        let path = format!("{prefix}{name}{}", if is_directory { "/" } else { "" }); parts(&path, is_directory)?;
        let mut child = safe_file_io::relative(directory, &name, is_directory, false)?;
        if is_directory { scan(&child, &path, entries, total, context)?; continue; }
        if entries.len() >= MAX_ENTRIES { return Err("源树最多 200 项。".into()); }
        let before = checked_stamp(&child, false)?;
        if before.size > MAX_FILE as u64 || *total + before.size as usize > MAX_FILE { return Err("创建 ZIP 源文件合计最多 16 MiB。".into()); }
        let mut bytes = vec![0; before.size as usize];
        for chunk in bytes.chunks_mut(BLOCK) { context.check()?; child.read_exact(chunk).map_err(|e| format!("读取源文件失败：{e}"))?; }
        let mut extra = [0];
        if child.read(&mut extra).map_err(|e| e.to_string())? != 0 || checked_stamp(&child, false)? != before { return Err("源文件在读取时变化。".into()); }
        context.check()?; *total += bytes.len();
        entries.push(TreeEntry { name: path, directory: false, content: base64::engine::general_purpose::STANDARD.encode(&bytes), size: bytes.len(), crc: crc32(&bytes) });
    }
    if checked_stamp(directory, true)? != before { return Err("源目录在枚举期间变化，请重试。".into()); }
    context.check()
}
pub(super) struct NewTree { pub(super) files: Vec<NewFile>, pub(super) directories: Vec<File>, pub(super) accepted: bool }
impl NewTree {
    pub(super) fn new() -> Self { Self { files: Vec::new(), directories: Vec::new(), accepted: false } }
    pub(super) fn rollback(&mut self) -> bool {
        // Files first, then deepest directories. Only our retained handles are
        // used. Foreign entries, sharing violations or OS failure stop cleanup.
        self.files.clear(); let mut okay = true;
        while let Some(directory) = self.directories.pop() {
            let delete = 1u8;
            if unsafe { SetFileInformationByHandle(directory.as_raw_handle(), 4, (&delete as *const u8).cast(), 1) } == 0 { okay = false; }
            drop(directory);
        }
        okay
    }
}
impl Drop for NewTree { fn drop(&mut self) { if !self.accepted { self.rollback(); } } }
