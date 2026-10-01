use crate::{image_codec as codec, image_io::{self, Context}, network_probe::acquire_job};
use serde::Serialize;
use std::time::Instant;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo {
    width: u32, height: u32, size_bytes: u64, format: String, preview_data_url: String, source_hash: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageCompressionPreview {
    width: u32, height: u32, input_size_bytes: u64, output_size_bytes: u64, reduction_percent: f64,
    format: String, preview_data_url: String, source_hash: String, output_hash: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageCompressionResult {
    input_size_bytes: u64, output_size_bytes: u64, reduction_percent: f64, format: String,
}
async fn run<T: Send + 'static>(job_id: String, work: impl FnOnce(Context) -> Result<T, String> + Send + 'static) -> Result<T, String> {
    let ctx = Context { lease: acquire_job(&job_id)?, started: Instant::now() };
    tauri::async_runtime::spawn_blocking(move || work(ctx)).await
        .map_err(|_| "图片任务异常结束；如已提交保存，请检查目标，不要自动重试。".to_owned())?
}
#[tauri::command]
pub async fn inspect_image_file(job_id: String, path: String) -> Result<ImageInfo, String> {
    run(job_id, move |ctx| {
        let (bytes, hash) = image_io::snapshot(&path, None, &ctx)?;
        let (image, format) = codec::decode(&bytes, &ctx)?;
        Ok(ImageInfo { width: image.width(), height: image.height(), size_bytes: bytes.len() as u64,
            format: codec::label(format).into(), preview_data_url: codec::preview(&image, &ctx)?, source_hash: hash })
    }).await
}
#[tauri::command]
pub async fn preview_image_compression(job_id: String, path: String, output_format: String,
    jpeg_quality: u8, expected_hash: String) -> Result<ImageCompressionPreview, String> {
    run(job_id, move |ctx| {
        let format = codec::format(&output_format, true)?;
        let (bytes, source_hash) = image_io::snapshot(&path, Some(&expected_hash), &ctx)?;
        let (image, _) = codec::decode(&bytes, &ctx)?;
        let encoded = codec::encode(&image, format, jpeg_quality, true, &ctx)?;
        drop(image);
        let (output_image, _) = codec::decode(&encoded, &ctx)?;
        let input_size_bytes = bytes.len() as u64; let output_size_bytes = encoded.len() as u64;
        Ok(ImageCompressionPreview { width: output_image.width(), height: output_image.height(), input_size_bytes, output_size_bytes,
            reduction_percent: codec::reduction(input_size_bytes, output_size_bytes), format: codec::label(format).into(),
            preview_data_url: codec::preview(&output_image, &ctx)?, source_hash, output_hash: image_io::digest(&encoded) })
    }).await
}
#[tauri::command]
pub async fn compress_image_file(job_id: String, input_path: String, output_path: String, output_format: String,
    jpeg_quality: u8, expected_hash: String, expected_output_hash: String) -> Result<ImageCompressionResult, String> {
    run(job_id, move |ctx| {
        image_io::validate_hash(&expected_output_hash)?;
        let format = codec::format(&output_format, true)?; codec::extension(&output_path, format)?;
        let (bytes, _) = image_io::snapshot(&input_path, Some(&expected_hash), &ctx)?;
        let (image, _) = codec::decode(&bytes, &ctx)?;
        let encoded = codec::encode(&image, format, jpeg_quality, true, &ctx)?;
        if image_io::digest(&encoded) != expected_output_hash { return Err("压缩输出与预览不一致，请重新生成预览。".into()); }
        image_io::save(&output_path, &encoded, &ctx)?;
        let input_size_bytes = bytes.len() as u64; let output_size_bytes = encoded.len() as u64;
        Ok(ImageCompressionResult { input_size_bytes, output_size_bytes,
            reduction_percent: codec::reduction(input_size_bytes, output_size_bytes), format: codec::label(format).into() })
    }).await
}
#[tauri::command]
pub async fn convert_image_file(job_id: String, input_path: String, output_path: String, format: String,
    jpeg_quality: u8, expected_hash: String) -> Result<ImageInfo, String> {
    run(job_id, move |ctx| {
        let format = codec::format(&format, false)?; codec::extension(&output_path, format)?;
        let (bytes, _) = image_io::snapshot(&input_path, Some(&expected_hash), &ctx)?;
        let (image, _) = codec::decode(&bytes, &ctx)?;
        let encoded = codec::encode(&image, format, jpeg_quality, false, &ctx)?;
        drop(image);
        let (output_image, _) = codec::decode(&encoded, &ctx)?;
        let preview_data_url = codec::preview(&output_image, &ctx)?;
        let width = output_image.width(); let height = output_image.height(); drop(output_image);
        image_io::save(&output_path, &encoded, &ctx)?;
        Ok(ImageInfo { width, height, size_bytes: encoded.len() as u64,
            format: codec::label(format).into(), preview_data_url, source_hash: image_io::digest(&encoded) })
    }).await
}
