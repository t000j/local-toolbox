//! Bounded save-as for generated ZIP, extracted entry, and converted text.
//! No destination is derived from an archive path. Retained handles reject
//! reparse points; exclusive creation never overwrites an existing file.
use base64::Engine;
use std::{io::Write, sync::atomic::{AtomicBool, Ordering}};
use crate::safe_file_io::Directory;
const MAX_OUTPUT: usize = 32 * 1024 * 1024;
static SAVING: AtomicBool = AtomicBool::new(false);
struct SaveGuard;
impl Drop for SaveGuard { fn drop(&mut self) { SAVING.store(false, Ordering::Release); } }
#[tauri::command]
pub async fn save_binary_output(path: String, content: String) -> Result<(), String> {
    if content.len() > 4 * MAX_OUTPUT.div_ceil(3) { return Err("输出最多 32 MiB。".into()); }
    SAVING.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .map_err(|_| "已有二进制输出正在保存，请等待完成。")?;
    let guard = SaveGuard;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let bytes = base64::engine::general_purpose::STANDARD.decode(content).map_err(|_| "无效二进制输出。")?;
        if bytes.len() > MAX_OUTPUT { return Err("输出最多 32 MiB。".into()); }
        let (parent, name) = Directory::parent(&path)?;
        let mut output = parent.create(&name)?;
        output.file.write_all(&bytes).map_err(|e| format!("写入失败，未完成输出将尽力清理：{e}"))?;
        output.persist()?;
        output.accept();
        Ok(())
    }).await.map_err(|e| format!("保存线程异常：{e}"))?
}
