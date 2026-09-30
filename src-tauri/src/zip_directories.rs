//! ZIP directory transport: bounded reads and create-only, authorized tree restore.
//! See docs/zip-archives.md; no ZIP parsing, shell, or path-based cleanup here.
#[path = "zip_directory_plan.rs"] mod plan;
#[path = "zip_directory_io.rs"] mod io;
use crate::{network_probe::{acquire_job, JobLease, ProbeExecution, ProbeStatus}, safe_file_io::{self, Directory, NewFile}};
use self::{plan::{component, crc_update, validate, TreeEntry, BLOCK}, io::{checked_stamp, scan, NewTree}};
use serde::Serialize;
use std::{collections::BTreeMap, io::{Read, Seek, SeekFrom, Write}, time::{Duration, Instant}};
struct Context<'a> { lease: &'a JobLease, started: Instant }
impl Context<'_> {
    fn check(&self) -> Result<(), String> {
        if self.lease.cancelled() { return Err("已取消 ZIP 目录操作。".into()); }
        if self.started.elapsed() > Duration::from_secs(60) { return Err("ZIP 目录操作达到 60 秒协作时限。".into()); }
        Ok(())
    }
}
#[derive(Serialize)] #[serde(rename_all = "camelCase")]
struct Saved { output_path: String, entries: usize, bytes: usize }
fn restore(destination: &str, name: &str, entries: Vec<TreeEntry>, context: &Context<'_>) -> Result<Saved, String> {
    if !component(name) { return Err("新目录名称无效；只允许一个安全名称。".into()); }
    context.check()?; let plan = validate(entries)?; context.check()?;
    let parent = Directory::open(destination)?; let mut tree = NewTree::new();
    let output_path = format!("{}\\{name}", destination.trim_end_matches(['\\', '/']));
    // Bound the *complete* path too, before creating even the root directory.
    safe_file_io::path_parts(&output_path)?;
    for item in &plan { safe_file_io::path_parts(&format!("{output_path}\\{}", item.name.replace('/', "\\")))?; }
    let operation = (|| -> Result<Saved, String> {
        context.check()?;
        tree.directories.push(safe_file_io::relative(parent.handle(), name, true, true)?);
        checked_stamp(&tree.directories[0], true)?;
        let mut indexes = BTreeMap::new(); indexes.insert(String::new(), 0usize);
        let mut files = Vec::new();
        // Reserve all names before writing content; no existing directory is
        // reused. FILE_CREATE also catches filesystem-specific alias collisions.
        for (index, item) in plan.iter().enumerate() {
            context.check()?;
            let (prefix, basename) = item.name.rsplit_once('/').unwrap_or(("", &item.name));
            let parent_index = *indexes.get(prefix).ok_or("父目录尚未创建。")?;
            if item.directory {
                let child = safe_file_io::relative(&tree.directories[parent_index], basename, true, true)?;
                indexes.insert(item.name.clone(), tree.directories.len()); tree.directories.push(child);
                checked_stamp(tree.directories.last().unwrap(), true)?;
            } else {
                tree.files.push(NewFile::create_at(&tree.directories[parent_index], basename)?); files.push(index);
            }
        }
        let mut bytes = 0;
        for (output, index) in tree.files.iter_mut().zip(files) {
            let item = &plan[index];
            checked_stamp(&output.file, false)?;
            for chunk in item.bytes.chunks(BLOCK) { context.check()?; output.file.write_all(chunk).map_err(|e| format!("ZIP 写入失败：{e}"))?; }
            context.check()?; output.file.sync_all().map_err(|e| e.to_string())?;
            output.file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
            let mut crc = 0xffff_ffff; let mut remaining = item.bytes.len(); let mut buffer = vec![0; BLOCK];
            while remaining > 0 { context.check()?; let n = remaining.min(BLOCK); output.file.read_exact(&mut buffer[..n]).map_err(|e| e.to_string())?; crc = crc_update(crc, &buffer[..n]); remaining -= n; }
            if (crc ^ 0xffff_ffff) != item.crc || checked_stamp(&output.file, false)?.size != item.bytes.len() as u64 { return Err("ZIP 输出回读校验失败。".into()); }
            bytes += item.bytes.len();
        }
        context.check()?;
        // Deliberately short, non-cancellable retention phase. A process crash
        // here may retain a subset. Directory trees are not crash-atomic.
        for output in &mut tree.files { output.retain()?; }
        for output in &mut tree.files { output.accept(); }
        tree.accepted = true;
        Ok(Saved { output_path: output_path.clone(), entries: plan.len(), bytes })
    })();
    match operation {
        Ok(saved) => Ok(saved),
        Err(error) => { let cleaned = tree.rollback(); Err(format!("{error} {}请检查本次新目录 {output_path}；原有文件未覆盖。", if cleaned { "已尝试按句柄清理。" } else { "部分新建内容未能清理。" })) }
    }
}
fn response(output: String, started: Instant) -> ProbeExecution { ProbeExecution { output, status: ProbeStatus::Completed, exit_code: Some(0), elapsed_ms: started.elapsed().as_millis() as u64 } }
#[tauri::command]
pub async fn read_zip_directory(job_id: String, path: String) -> Result<ProbeExecution, String> {
    let lease = acquire_job(&job_id)?; let started = Instant::now();
    tauri::async_runtime::spawn_blocking(move || {
        let context = Context { lease: &lease, started }; context.check()?;
        let (_, path_parts) = safe_file_io::path_parts(&path)?;
        let name = path_parts.last().ok_or("缺少目录名称。")?;
        if !component(name) { return Err("源根目录名称不适合 ZIP。".into()); }
        let directory = Directory::open(&path)?; let mut entries = Vec::new(); let mut total = 0;
        scan(directory.handle(), &format!("{name}/"), &mut entries, &mut total, &context)?;
        context.check()?;
        Ok(response(serde_json::to_string(&entries).map_err(|e| e.to_string())?, started))
    }).await.map_err(|e| format!("ZIP 目录读取线程异常：{e}"))?
}
#[tauri::command]
pub async fn save_zip_directory(job_id: String, destination: String, name: String, entries: Vec<TreeEntry>) -> Result<ProbeExecution, String> {
    let lease = acquire_job(&job_id)?; let started = Instant::now();
    tauri::async_runtime::spawn_blocking(move || {
        let context = Context { lease: &lease, started };
        let saved = restore(&destination, &name, entries, &context)?;
        Ok(response(serde_json::to_string(&saved).map_err(|e| e.to_string())?, started))
    }).await.map_err(|e| format!("ZIP 目录恢复线程异常：{e}"))?
}
#[cfg(test)] #[path = "zip_directories_tests.rs"] mod tests;
