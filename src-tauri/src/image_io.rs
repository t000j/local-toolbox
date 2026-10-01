//! Stable snapshots and create-only outputs for the legacy native image tools.
use crate::{network_probe::JobLease, safe_file_io::{Directory, stamp}};
use sha2::{Digest, Sha256};
use std::io::{self, BufRead, Cursor, Read, Seek, SeekFrom, Write};
use std::time::{Duration, Instant};
pub(crate) const MAX_INPUT: u64 = 100 * 1024 * 1024;
pub(crate) const MAX_OUTPUT: u64 = 128 * 1024 * 1024;
pub(crate) struct Context { pub lease: JobLease, pub started: Instant }
impl Context {
    pub(crate) fn check(&self) -> Result<(), String> {
        if self.lease.cancelled() { return Err("已取消；尚未提交的输出由句柄清理。".into()); }
        if self.started.elapsed() > Duration::from_secs(60) { return Err("达到 60 秒协作时限；编解码可能延迟响应。".into()); }
        Ok(())
    }
    fn io(&self) -> io::Result<()> { self.check().map_err(|s| io::Error::new(io::ErrorKind::Other, s)) }
}
pub(crate) fn digest(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }
pub(crate) fn validate_hash(hash: &str) -> Result<(), String> {
    if hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) {
        return Err("图片快照已失效，请重新选择图片。".into());
    } Ok(())
}
pub(crate) fn snapshot(path: &str, expected: Option<&str>, ctx: &Context) -> Result<(Vec<u8>, String), String> {
    ctx.check()?;
    if let Some(hash) = expected { validate_hash(hash)?; }
    let (parent, name) = Directory::parent(path)?;
    let mut file = parent.read(&name)?;
    let before = stamp(&file)?;
    if before.size == 0 || before.size > MAX_INPUT { return Err("图片不能为空且最多 100 MiB。".into()); }
    let mut bytes = Vec::new();
    bytes.try_reserve_exact(before.size as usize).map_err(|_| "无法分配图片快照缓冲区。")?;
    let mut buffer = [0u8; 256 * 1024];
    loop {
        ctx.check()?;
        let count = file.read(&mut buffer).map_err(|e| format!("图片读取失败：{e}"))?;
        if count == 0 { break }
        if bytes.len() as u64 + count as u64 > MAX_INPUT { return Err("图片读取超过 100 MiB。".into()); }
        bytes.extend_from_slice(&buffer[..count]);
    }
    if stamp(&file)? != before || bytes.len() as u64 != before.size { return Err("图片在读取时发生变化，请重新选择。".into()); }
    ctx.check()?;
    let hash = digest(&bytes);
    if expected.is_some_and(|value| value != hash) { return Err("原图内容已变化，请重新选择并预览。".into()); }
    Ok((bytes, hash))
}
pub(crate) struct CheckedReader<'a> { cursor: Cursor<&'a [u8]>, ctx: &'a Context }
impl<'a> CheckedReader<'a> { pub(crate) fn new(bytes: &'a [u8], ctx: &'a Context) -> Self { Self { cursor: Cursor::new(bytes), ctx } } }
impl Read for CheckedReader<'_> {
    fn read(&mut self, bytes: &mut [u8]) -> io::Result<usize> { self.ctx.io()?; self.cursor.read(bytes) }
}
impl std::io::BufRead for CheckedReader<'_> {
    fn fill_buf(&mut self) -> io::Result<&[u8]> { self.ctx.io()?; self.cursor.fill_buf() }
    fn consume(&mut self, amount: usize) { self.cursor.consume(amount); }
}
impl Seek for CheckedReader<'_> {
    fn seek(&mut self, pos: SeekFrom) -> io::Result<u64> { self.ctx.io()?; self.cursor.seek(pos) }
}
pub(crate) struct BoundedOutput<'a> { pub cursor: Cursor<Vec<u8>>, ctx: &'a Context, limit: u64 }
impl<'a> BoundedOutput<'a> {
    pub(crate) fn new(ctx: &'a Context, limit: u64) -> Self { Self { cursor: Cursor::new(Vec::new()), ctx, limit } }
}
impl Write for BoundedOutput<'_> {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.ctx.io()?;
        if self.cursor.position().checked_add(bytes.len() as u64).is_none_or(|end| end > self.limit) {
            return Err(io::Error::new(io::ErrorKind::FileTooLarge, "图片输出超过上限"));
        }
        self.cursor.write(bytes)
    }
    fn flush(&mut self) -> io::Result<()> { self.ctx.io()?; Ok(()) }
}
impl Seek for BoundedOutput<'_> {
    fn seek(&mut self, pos: SeekFrom) -> io::Result<u64> {
        self.ctx.io()?;
        let old = self.cursor.position(); let next = self.cursor.seek(pos)?;
        if next > self.limit { self.cursor.set_position(old); return Err(io::Error::new(io::ErrorKind::InvalidInput, "编码位置超过上限")); }
        Ok(next)
    }
}
pub(crate) fn save(path: &str, bytes: &[u8], ctx: &Context) -> Result<(), String> {
    ctx.check()?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_OUTPUT { return Err("图片输出为空或超过 128 MiB。".into()); }
    let (parent, name) = Directory::parent(path)?;
    let mut output = parent.create(&name)?;
    for chunk in bytes.chunks(256 * 1024) { ctx.check()?; output.file.write_all(chunk).map_err(|e| e.to_string())?; }
    output.file.flush().map_err(|e| e.to_string())?;
    output.file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    let mut hash = Sha256::new(); let mut buffer = [0u8; 256 * 1024]; let mut total = 0;
    loop { ctx.check()?; let n = output.file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 { break } total += n; if total > bytes.len() { return Err("输出长度核验失败。".into()); } hash.update(&buffer[..n]); }
    if total != bytes.len() || format!("{:x}", hash.finalize()) != digest(bytes) { return Err("输出回读核验失败。".into()); }
    ctx.check()?;
    // Deliberately short non-cancellable commit; navigation cannot undo it.
    output.persist()?; output.accept(); Ok(())
}
