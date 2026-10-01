use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;
use crate::safe_file_io::Directory;

const MAX_PNG_BYTES: usize = 64 * 1024 * 1024;
const PNG_SIGNATURE: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];

// Both screenshot paths use create-only retained handles. Failed writes remain
// delete-pending, and never truncate an existing user file or unlink by path.
fn save_new_png(output_path: String, png_base64: String) -> Result<(), String> {
    if png_base64.len() > MAX_PNG_BYTES.saturating_mul(4) / 3 + 8 {
        return Err("图片超过 64 MB 保存上限".to_owned());
    }
    let bytes = STANDARD.decode(png_base64).map_err(|_| "图片数据无效".to_owned())?;
    if bytes.is_empty() || bytes.len() > MAX_PNG_BYTES || !bytes.starts_with(&PNG_SIGNATURE) {
        return Err("图片不是有效的 PNG 数据或超过保存上限".to_owned());
    }
    if !Path::new(&output_path).extension().and_then(|extension| extension.to_str()).is_some_and(|extension| extension.eq_ignore_ascii_case("png")) {
        return Err("请选择新的 PNG 文件路径；已有文件不会被覆盖".to_owned());
    }
    let (parent, name) = Directory::parent(&output_path)?;
    let mut output = parent.create(&name)?;
    output.file.write_all(&bytes).map_err(|error| format!("保存图片失败：{error}"))?;
    output.file.seek(SeekFrom::Start(0)).map_err(|error| format!("无法核验图片：{error}"))?;
    let mut buffer = [0u8; 8192];
    for expected in bytes.chunks(buffer.len()) {
        output.file.read_exact(&mut buffer[..expected.len()]).map_err(|error| format!("读取保存结果失败：{error}"))?;
        if &buffer[..expected.len()] != expected { return Err("保存图片字节核验失败，未提交输出".to_owned()); }
    }
    let mut end = [0u8; 1];
    if output.file.read(&mut end).map_err(|error| error.to_string())? != 0 { return Err("保存图片长度核验失败".to_owned()); }
    output.persist()?;
    output.accept();
    Ok(())
}

#[tauri::command]
pub fn save_screenshot_png(output_path: String, png_base64: String) -> Result<(), String> { save_new_png(output_path, png_base64) }

#[tauri::command]
pub fn save_annotated_png(output_path: String, png_base64: String) -> Result<(), String> { save_new_png(output_path, png_base64) }

#[cfg(test)]
mod audit_tests {
    use super::*;
    #[test]
    fn synthetic_new_png_never_overwrites_existing_target() {
        let root = std::env::temp_dir().join(format!("toolbox-screenshot-audit-{}-{}", std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir(&root).unwrap();
        // A generated 1x1 PNG. No real user files or screenshots are touched.
        let mut png = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgba8(1, 1).write_to(&mut png, image::ImageFormat::Png).unwrap();
        let expected = png.into_inner();
        let encoded = STANDARD.encode(&expected);
        let target = root.join("new.png");
        save_new_png(target.to_string_lossy().into_owned(), encoded.clone()).unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), expected);
        assert!(save_new_png(target.to_string_lossy().into_owned(), encoded.clone()).is_err());
        assert_eq!(std::fs::read(&target).unwrap(), expected);
        assert!(save_new_png(root.join("bad.png").to_string_lossy().into_owned(), "invalid".into()).is_err());
        assert!(!root.join("bad.png").exists());
        assert!(save_new_png(root.join("bad.jpg").to_string_lossy().into_owned(), encoded.clone()).is_err());
        assert!(!root.join("bad.jpg").exists());
        std::fs::remove_file(target).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
}
