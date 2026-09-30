use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

const MAX_PNG_BYTES: usize = 64 * 1024 * 1024;
const PNG_SIGNATURE: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];

#[tauri::command]
pub fn save_screenshot_png(output_path: String, png_base64: String) -> Result<(), String> {
    if png_base64.len() > MAX_PNG_BYTES.saturating_mul(4) / 3 + 8 {
        return Err("截图超过 64 MB 保存上限".to_owned());
    }
    let bytes = STANDARD.decode(png_base64).map_err(|_| "截图数据无效".to_owned())?;
    if bytes.is_empty() || bytes.len() > MAX_PNG_BYTES || !bytes.starts_with(&PNG_SIGNATURE) {
        return Err("截图数据不是有效的 PNG 图片或超过保存上限".to_owned());
    }

    let path = PathBuf::from(output_path);
    let has_png_extension = path.extension().and_then(|extension| extension.to_str()).is_some_and(|extension| extension.eq_ignore_ascii_case("png"));
    if !path.is_absolute() || !has_png_extension {
        return Err("请选择有效的 PNG 文件路径".to_owned());
    }
    fs::write(&path, bytes).map_err(|error| format!("写入截图文件失败：{error}"))
}

#[tauri::command]
pub fn save_annotated_png(output_path: String, png_base64: String) -> Result<(), String> {
    if png_base64.len() > MAX_PNG_BYTES.saturating_mul(4) / 3 + 8 {
        return Err("标注图片超过 64 MB 保存上限".to_owned());
    }
    let bytes = STANDARD.decode(png_base64).map_err(|_| "标注图片数据无效".to_owned())?;
    if bytes.is_empty() || bytes.len() > MAX_PNG_BYTES || !bytes.starts_with(&PNG_SIGNATURE) {
        return Err("标注图片不是有效的 PNG 或超过保存上限".to_owned());
    }

    let path = PathBuf::from(output_path);
    let has_png_extension = path.extension().and_then(|extension| extension.to_str()).is_some_and(|extension| extension.eq_ignore_ascii_case("png"));
    if !path.is_absolute() || !has_png_extension || !path.parent().is_some_and(|parent| parent.is_dir()) {
        return Err("请选择有效的 PNG 文件路径".to_owned());
    }
    let mut file = OpenOptions::new().write(true).create_new(true).open(&path)
        .map_err(|error| format!("无法创建标注图片；目标文件可能已存在：{error}"))?;
    if let Err(error) = file.write_all(&bytes).and_then(|()| file.flush()) {
        drop(file);
        let _ = fs::remove_file(&path);
        return Err(format!("保存标注图片失败：{error}"));
    }
    Ok(())
}
