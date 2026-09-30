use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::metadata::Orientation;
use image::{DynamicImage, ImageDecoder, ImageFormat, ImageReader, Rgb, RgbImage};
use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};

const MAX_INPUT_BYTES: u64 = 100 * 1024 * 1024;
const MAX_PIXELS: u64 = 40_000_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo {
    width: u32,
    height: u32,
    size_bytes: u64,
    format: String,
    preview_data_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageConversionResult {
    width: u32,
    height: u32,
    size_bytes: u64,
    format: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageCompressionPreview {
    width: u32,
    height: u32,
    input_size_bytes: u64,
    output_size_bytes: u64,
    reduction_percent: f64,
    format: String,
    preview_data_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageCompressionResult {
    input_size_bytes: u64,
    output_size_bytes: u64,
    reduction_percent: f64,
    format: String,
}

fn format_label(format: ImageFormat) -> &'static str {
    match format {
        ImageFormat::Png => "PNG",
        ImageFormat::Jpeg => "JPG",
        ImageFormat::Gif => "GIF",
        ImageFormat::WebP => "WebP",
        ImageFormat::Bmp => "BMP",
        ImageFormat::Tiff => "TIFF",
        _ => "其他",
    }
}

fn output_format(value: &str) -> Result<ImageFormat, String> {
    match value {
        "png" => Ok(ImageFormat::Png),
        "jpeg" => Ok(ImageFormat::Jpeg),
        "gif" => Ok(ImageFormat::Gif),
        "webp" => Ok(ImageFormat::WebP),
        "bmp" => Ok(ImageFormat::Bmp),
        "tiff" => Ok(ImageFormat::Tiff),
        _ => Err("不支持所选的输出格式。".to_owned()),
    }
}

fn compression_format(value: &str) -> Result<ImageFormat, String> {
    match value {
        "png" => Ok(ImageFormat::Png),
        "jpeg" => Ok(ImageFormat::Jpeg),
        _ => Err("图片压缩目前支持 PNG 无损优化和 JPEG 质量压缩。".to_owned()),
    }
}

fn normalized_path(path: &Path) -> String {
    path.to_string_lossy().replace('/', "\\").to_lowercase()
}

fn read_image(path: &Path) -> Result<(DynamicImage, ImageFormat), String> {
    if !path.is_absolute() {
        return Err("图片路径无效，请重新选择图片。".to_owned());
    }
    let metadata = fs::metadata(path).map_err(|error| format!("无法读取图片文件：{error}"))?;
    if !metadata.is_file() {
        return Err("所选路径不是普通文件。".to_owned());
    }
    if metadata.len() > MAX_INPUT_BYTES {
        return Err("图片文件超过 100 MB。".to_owned());
    }

    let reader = ImageReader::open(path).map_err(|error| format!("无法打开图片：{error}"))?;
    let reader = reader.with_guessed_format().map_err(|error| format!("无法识别图片格式：{error}"))?;
    let format = reader.format().ok_or_else(|| "无法识别图片格式。".to_owned())?;
    let mut decoder = reader.into_decoder().map_err(|error| format!("无法解码图片：{error}"))?;
    let (width, height) = decoder.dimensions();
    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > MAX_PIXELS {
        return Err("图片分辨率过高，当前最多支持 4000 万像素。".to_owned());
    }
    let orientation = decoder.orientation().unwrap_or(Orientation::NoTransforms);
    let mut image = DynamicImage::from_decoder(decoder).map_err(|error| format!("图片解码失败：{error}"))?;
    image.apply_orientation(orientation);
    Ok((image, format))
}

fn validate_output_path(input: &Path, output: &Path, format: ImageFormat) -> Result<(), String> {
    if !output.is_absolute() || !output.parent().is_some_and(Path::is_dir) {
        return Err("请选择有效的保存位置。".to_owned());
    }
    if normalized_path(input) == normalized_path(output) {
        return Err("不能用转换结果覆盖原图。".to_owned());
    }
    if output.exists() || fs::symlink_metadata(output).is_ok() {
        return Err("目标文件已存在，请选择其他文件名；图片转换不会覆盖已有文件。".to_owned());
    }
    let extension = output.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase();
    let matches_format = match format {
        ImageFormat::Jpeg => matches!(extension.as_str(), "jpg" | "jpeg"),
        ImageFormat::Png => extension == "png",
        ImageFormat::Gif => extension == "gif",
        ImageFormat::WebP => extension == "webp",
        ImageFormat::Bmp => extension == "bmp",
        ImageFormat::Tiff => matches!(extension.as_str(), "tif" | "tiff"),
        _ => false,
    };
    if !matches_format {
        return Err("保存文件扩展名与所选格式不一致，请重新选择保存位置。".to_owned());
    }
    Ok(())
}

fn write_image(image: &DynamicImage, output: &Path, format: ImageFormat, jpeg_quality: u8) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(output)
        .map_err(|error| format!("无法创建输出文件：{error}"))?;
    let encoded = if format == ImageFormat::Jpeg {
        let rgb = flatten_on_white(image);
        JpegEncoder::new_with_quality(&mut file, jpeg_quality.clamp(1, 100)).encode_image(&rgb)
    } else {
        image.write_to(&mut file, format)
    };
    if let Err(error) = encoded {
        drop(file);
        let _ = fs::remove_file(output);
        return Err(format!("图片编码失败：{error}"));
    }
    if let Err(error) = file.flush() {
        drop(file);
        let _ = fs::remove_file(output);
        return Err(format!("保存图片失败：{error}"));
    }
    Ok(())
}

fn flatten_on_white(image: &DynamicImage) -> RgbImage {
    let rgba = image.to_rgba8();
    let mut rgb = RgbImage::new(rgba.width(), rgba.height());
    for (x, y, pixel) in rgba.enumerate_pixels() {
        let alpha = u32::from(pixel[3]);
        let blend = |channel: u8| ((u32::from(channel) * alpha + 255 * (255 - alpha) + 127) / 255) as u8;
        rgb.put_pixel(x, y, Rgb([blend(pixel[0]), blend(pixel[1]), blend(pixel[2])]));
    }
    rgb
}

fn encode_compressed_image(image: &DynamicImage, format: ImageFormat, jpeg_quality: u8) -> Result<Vec<u8>, String> {
    let mut bytes = Cursor::new(Vec::new());
    let result = if format == ImageFormat::Jpeg {
        let rgb = flatten_on_white(image);
        JpegEncoder::new_with_quality(&mut bytes, jpeg_quality.clamp(1, 100)).encode_image(&rgb)
    } else {
        image.write_with_encoder(PngEncoder::new_with_quality(&mut bytes, CompressionType::Best, FilterType::Adaptive))
    };
    result.map_err(|error| format!("图片压缩失败：{error}"))?;
    Ok(bytes.into_inner())
}

fn preview_data_url(image: &DynamicImage) -> Result<String, String> {
    let thumbnail = image.thumbnail(480, 360);
    let mut png = Cursor::new(Vec::new());
    thumbnail.write_to(&mut png, ImageFormat::Png).map_err(|error| format!("无法生成图片预览：{error}"))?;
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(png.into_inner())))
}

fn reduction_percent(input_size: u64, output_size: u64) -> f64 {
    if input_size == 0 { return 0.0; }
    (input_size as f64 - output_size as f64) * 100.0 / input_size as f64
}

#[tauri::command]
pub fn inspect_image_file(path: String) -> Result<ImageInfo, String> {
    let path = PathBuf::from(path);
    let (image, format) = read_image(&path)?;
    let width = image.width();
    let height = image.height();
    let preview_data_url = preview_data_url(&image)?;

    Ok(ImageInfo {
        width,
        height,
        size_bytes: fs::metadata(&path).map_err(|error| error.to_string())?.len(),
        format: format_label(format).to_owned(),
        preview_data_url,
    })
}

#[tauri::command]
pub fn preview_image_compression(path: String, output_format: String, jpeg_quality: u8) -> Result<ImageCompressionPreview, String> {
    let format = compression_format(&output_format)?;
    let path = PathBuf::from(path);
    let input_size_bytes = fs::metadata(&path).map_err(|error| format!("无法读取图片文件：{error}"))?.len();
    let (image, _) = read_image(&path)?;
    let width = image.width();
    let height = image.height();
    let encoded = encode_compressed_image(&image, format, jpeg_quality)?;
    let output_size_bytes = encoded.len() as u64;
    let encoded_image = ImageReader::new(Cursor::new(encoded.as_slice()))
        .with_guessed_format()
        .map_err(|error| format!("无法读取压缩预览：{error}"))?
        .decode()
        .map_err(|error| format!("无法生成压缩预览：{error}"))?;

    Ok(ImageCompressionPreview {
        width,
        height,
        input_size_bytes,
        output_size_bytes,
        reduction_percent: reduction_percent(input_size_bytes, output_size_bytes),
        format: format_label(format).to_owned(),
        preview_data_url: preview_data_url(&encoded_image)?,
    })
}

#[tauri::command]
pub fn compress_image_file(input_path: String, output_path: String, output_format: String, jpeg_quality: u8) -> Result<ImageCompressionResult, String> {
    let format = compression_format(&output_format)?;
    let input = PathBuf::from(input_path);
    let output = PathBuf::from(output_path);
    let canonical_input = input.canonicalize().map_err(|error| format!("无法读取原图：{error}"))?;
    validate_output_path(&canonical_input, &output, format)?;
    let input_size_bytes = fs::metadata(&canonical_input).map_err(|error| error.to_string())?.len();
    let (image, _) = read_image(&canonical_input)?;
    let encoded = encode_compressed_image(&image, format, jpeg_quality)?;

    let mut file = OpenOptions::new().write(true).create_new(true).open(&output)
        .map_err(|error| format!("无法创建输出文件：{error}"))?;
    if let Err(error) = file.write_all(&encoded).and_then(|()| file.flush()) {
        drop(file);
        let _ = fs::remove_file(&output);
        return Err(format!("保存压缩图片失败：{error}"));
    }
    let output_size_bytes = encoded.len() as u64;
    Ok(ImageCompressionResult {
        input_size_bytes,
        output_size_bytes,
        reduction_percent: reduction_percent(input_size_bytes, output_size_bytes),
        format: format_label(format).to_owned(),
    })
}

#[tauri::command]
pub fn convert_image_file(input_path: String, output_path: String, format: String, jpeg_quality: u8) -> Result<ImageConversionResult, String> {
    let format = output_format(&format)?;
    let input = PathBuf::from(input_path);
    let output = PathBuf::from(output_path);
    if !input.is_absolute() {
        return Err("图片路径无效，请重新选择图片。".to_owned());
    }
    let canonical_input = input.canonicalize().map_err(|error| format!("无法读取原图：{error}"))?;
    validate_output_path(&canonical_input, &output, format)?;

    let (image, _) = read_image(&canonical_input)?;
    let width = image.width();
    let height = image.height();
    write_image(&image, &output, format, jpeg_quality)?;

    Ok(ImageConversionResult {
        width,
        height,
        size_bytes: fs::metadata(&output).map_err(|error| error.to_string())?.len(),
        format: format_label(format).to_owned(),
    })
}
