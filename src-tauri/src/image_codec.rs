//! Decode only a bounded in-memory snapshot; apply limits before decoder setup.
use crate::image_io::{BoundedOutput, CheckedReader, Context, MAX_OUTPUT};
use image::{DynamicImage, ImageDecoder, ImageFormat, ImageReader, Limits, Rgb, RgbImage};
use image::codecs::{jpeg::JpegEncoder, png::{CompressionType, FilterType, PngEncoder}};
use base64::{engine::general_purpose::STANDARD, Engine as _};
pub(crate) const MAX_PIXELS: u64 = 40_000_000;
const MAX_DECODE_BYTES: u64 = 256 * 1024 * 1024;
pub(crate) fn label(format: ImageFormat) -> &'static str {
    match format { ImageFormat::Png => "PNG", ImageFormat::Jpeg => "JPG", ImageFormat::Gif => "GIF",
        ImageFormat::WebP => "WebP", ImageFormat::Bmp => "BMP", ImageFormat::Tiff => "TIFF", _ => "其他" }
}
pub(crate) fn format(value: &str, compression: bool) -> Result<ImageFormat, String> {
    match value { "png" => Ok(ImageFormat::Png), "jpeg" => Ok(ImageFormat::Jpeg), "gif" if !compression => Ok(ImageFormat::Gif),
        "webp" if !compression => Ok(ImageFormat::WebP), "bmp" if !compression => Ok(ImageFormat::Bmp),
        "tiff" if !compression => Ok(ImageFormat::Tiff), _ => Err("不支持所选输出格式。".into()) }
}
pub(crate) fn extension(path: &str, format: ImageFormat) -> Result<(), String> {
    let ext = std::path::Path::new(path).extension().and_then(|v| v.to_str()).unwrap_or_default().to_ascii_lowercase();
    let good = match format { ImageFormat::Png => ext == "png", ImageFormat::Jpeg => matches!(ext.as_str(), "jpg" | "jpeg"),
        ImageFormat::Gif => ext == "gif", ImageFormat::WebP => ext == "webp", ImageFormat::Bmp => ext == "bmp",
        ImageFormat::Tiff => matches!(ext.as_str(), "tif" | "tiff"), _ => false };
    if good { Ok(()) } else { Err("保存扩展名与所选格式不一致。".into()) }
}
pub(crate) fn decode(bytes: &[u8], ctx: &Context) -> Result<(DynamicImage, ImageFormat), String> {
    ctx.check()?;
    let mut reader = ImageReader::new(CheckedReader::new(bytes, ctx)).with_guessed_format().map_err(|e| e.to_string())?;
    let format = reader.format().ok_or("无法识别图片格式。")?;
    if !matches!(format, ImageFormat::Png | ImageFormat::Jpeg | ImageFormat::Gif | ImageFormat::WebP | ImageFormat::Bmp | ImageFormat::Tiff) {
        return Err("不支持此图片格式。".into());
    }
    let mut limits = Limits::default(); limits.max_image_width = Some(16384); limits.max_image_height = Some(16384);
    limits.max_alloc = Some(MAX_DECODE_BYTES); reader.limits(limits.clone());
    let mut decoder = reader.into_decoder().map_err(|e| format!("图片解码器初始化失败：{e}"))?;
    decoder.set_limits(limits).map_err(|e| format!("图片解码器不满足限制：{e}"))?;
    let (width, height) = decoder.dimensions();
    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > MAX_PIXELS || decoder.total_bytes() > MAX_DECODE_BYTES {
        return Err("图片超限：最多 4000 万像素、单边 16384、解码数据 256 MiB。".into());
    }
    let orientation = decoder.orientation().map_err(|e| format!("无法可靠读取图片方向：{e}"))?;
    ctx.check()?;
    let mut image = DynamicImage::from_decoder(decoder).map_err(|e| format!("图片解码失败：{e}"))?;
    ctx.check()?; image.apply_orientation(orientation); ctx.check()?; Ok((image, format))
}
fn flatten(image: &DynamicImage, ctx: &Context) -> Result<RgbImage, String> {
    ctx.check()?; let rgba = image.to_rgba8(); let mut rgb = RgbImage::new(rgba.width(), rgba.height());
    for (x, y, pixel) in rgba.enumerate_pixels() {
        if x == 0 { ctx.check()?; }
        let alpha = u32::from(pixel[3]);
        let blend = |c: u8| ((u32::from(c) * alpha + 255 * (255 - alpha) + 127) / 255) as u8;
        rgb.put_pixel(x, y, Rgb([blend(pixel[0]), blend(pixel[1]), blend(pixel[2])]));
    } Ok(rgb)
}
pub(crate) fn encode(image: &DynamicImage, format: ImageFormat, quality: u8, compression: bool, ctx: &Context) -> Result<Vec<u8>, String> {
    ctx.check()?;
    if !(1..=100).contains(&quality) { return Err("JPEG 质量必须在 1–100 之间。".into()); }
    let mut output = BoundedOutput::new(ctx, MAX_OUTPUT);
    let result = if format == ImageFormat::Jpeg { JpegEncoder::new_with_quality(&mut output, quality).encode_image(&flatten(image, ctx)?) }
        else if compression { image.write_with_encoder(PngEncoder::new_with_quality(&mut output, CompressionType::Best, FilterType::Adaptive)) }
        else { image.write_to(&mut output, format) };
    result.map_err(|e| format!("图片编码失败或超限：{e}"))?; ctx.check()?; Ok(output.cursor.into_inner())
}
pub(crate) fn preview(image: &DynamicImage, ctx: &Context) -> Result<String, String> {
    ctx.check()?; let thumbnail = image.thumbnail(480, 360); ctx.check()?;
    let mut output = BoundedOutput::new(ctx, 1024 * 1024);
    thumbnail.write_to(&mut output, ImageFormat::Png).map_err(|e| format!("无法生成预览：{e}"))?;
    ctx.check()?; Ok(format!("data:image/png;base64,{}", STANDARD.encode(output.cursor.into_inner())))
}
pub(crate) fn reduction(input: u64, output: u64) -> f64 { (input as f64 - output as f64) * 100.0 / input as f64 }

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{image_io::digest, network_probe::{prepare_network_probe, acquire_job, cancel_network_probe}};
    use std::{io::{Seek, SeekFrom, Write}, time::Instant};
    // Pure generated pixels/memory only. Run serially because the native lease is shared.
    #[test]
    fn native_image_memory_fixtures() {
        let token = prepare_network_probe().unwrap();
        let ctx = Context { lease: acquire_job(&token).unwrap(), started: Instant::now() };
        let mut pixels = image::RgbaImage::new(2, 2);
        pixels.put_pixel(0, 0, image::Rgba([255, 0, 0, 0]));
        pixels.put_pixel(1, 0, image::Rgba([255, 0, 0, 255]));
        pixels.put_pixel(0, 1, image::Rgba([0, 255, 0, 128]));
        pixels.put_pixel(1, 1, image::Rgba([0, 0, 255, 255]));
        let image = DynamicImage::ImageRgba8(pixels);
        assert_eq!(flatten(&image, &ctx).unwrap().get_pixel(0, 0).0, [255, 255, 255]);
        for format in [ImageFormat::Png, ImageFormat::Jpeg, ImageFormat::Gif, ImageFormat::WebP, ImageFormat::Bmp, ImageFormat::Tiff] {
            let bytes = encode(&image, format, 90, false, &ctx).unwrap();
            let (decoded, actual) = decode(&bytes, &ctx).unwrap();
            assert_eq!((decoded.width(), decoded.height(), actual), (2, 2, format));
            if format == ImageFormat::Png { assert_eq!(decoded.to_rgba8(), image.to_rgba8()); }
        }
        let first = encode(&image, ImageFormat::Png, 80, true, &ctx).unwrap();
        let second = encode(&image, ImageFormat::Png, 80, true, &ctx).unwrap();
        assert_eq!(digest(&first), digest(&second));
        assert!(decode(b"not an image", &ctx).is_err());
        let wide = DynamicImage::new_rgba8(16385, 1);
        assert!(decode(&encode(&wide, ImageFormat::Png, 80, false, &ctx).unwrap(), &ctx).is_err());
        let mut output = BoundedOutput::new(&ctx, 4);
        output.write_all(b"1234").unwrap(); assert!(output.write_all(b"5").is_err());
        assert!(output.seek(SeekFrom::Start(5)).is_err()); assert_eq!(output.cursor.position(), 4);
        output.seek(SeekFrom::Start(0)).unwrap(); output.write_all(b"x").unwrap();
        assert_eq!(output.cursor.get_ref(), b"x234");
        assert!(cancel_network_probe(token)); assert!(ctx.check().is_err());
        assert!(output.write_all(b"x").is_err()); assert!(decode(&first, &ctx).is_err());
    }
}
