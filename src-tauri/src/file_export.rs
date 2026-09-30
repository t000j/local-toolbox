use crate::safe_file_io::Directory;
use std::io::Write;
#[tauri::command]
pub async fn save_file_list(path: String, content: String) -> Result<(),String> {
    if content.is_empty() || content.len()>1024*1024 { return Err("清单为空或超过 1 MiB。".into()); }
    let extension=path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    if !matches!(extension.as_str(),"csv"|"txt") { return Err("请选择 CSV 或 TXT 新文件。".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        let (parent,name)=Directory::parent(&path)?;
        let mut output=parent.create(&name)?;
        output.file.write_all(content.as_bytes()).map_err(|e|format!("清单写入失败：{e}"))?;
        output.persist()?; output.accept(); Ok(())
    }).await.map_err(|e|format!("清单保存线程异常：{e}"))?
}
