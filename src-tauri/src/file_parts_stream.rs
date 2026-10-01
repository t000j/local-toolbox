use crate::{network_probe::JobLease,safe_file_io::NewFile};
use sha2::{Digest,Sha256};
use std::{io::{Read,Write,Seek,SeekFrom},time::{Duration,Instant}};
pub(crate) struct Context<'a> {pub lease: &'a JobLease,pub started: Instant}
impl Context<'_> {
    pub(crate) fn check(&self) -> Result<(),String> {
        if self.lease.cancelled() {return Err("已取消；未提交的输出由句柄清理，原文件未修改。".into());}
        if self.started.elapsed()>Duration::from_secs(120) {return Err("达到 120 秒协作时限；未提交输出由句柄清理。".into());} Ok(())
    }
}
pub(crate) fn copy_bytes(input: &mut impl Read,output: &mut impl Write,bytes: u64,whole: &mut Sha256,mut check: impl FnMut()->Result<(),String>) -> Result<String,String> {
    let mut buffer=vec![0u8;256*1024]; let mut remaining=bytes; let mut piece=Sha256::new();
    while remaining>0 {
        check()?; let count=remaining.min(buffer.len() as u64) as usize;
        input.read_exact(&mut buffer[..count]).map_err(|e|format!("读取不完整或失败：{e}"))?;
        output.write_all(&buffer[..count]).map_err(|e|format!("写入失败：{e}"))?;
        whole.update(&buffer[..count]); piece.update(&buffer[..count]); remaining-=count as u64;
    }
    check()?; Ok(format!("{:x}",piece.finalize()))
}
pub(crate) fn verify_output(output: &mut NewFile,bytes: u64,expected: &str,context: &Context<'_>) -> Result<(),String> {
    output.file.flush().map_err(|e|e.to_string())?;
    output.file.seek(SeekFrom::Start(0)).map_err(|e|e.to_string())?;
    let actual=copy_bytes(&mut output.file,&mut std::io::sink(),bytes,&mut Sha256::new(),||context.check())?;
    if actual!=expected || output.file.metadata().map_err(|e|e.to_string())?.len()!=bytes {return Err("输出回读校验失败，取消保留输出。".into());} Ok(())
}
pub(crate) fn commit(outputs: &mut [NewFile],context: &Context<'_>) -> Result<(),String> {
    for output in outputs.iter_mut() { context.check()?; output.file.sync_all().map_err(|e|e.to_string())?; }
    context.check()?;
    // Commit is deliberately a short non-cancellable phase. On failure, Drop
    // re-arms deletion on all unaccepted handles, including already persisted
    // ones. A crash/OS failure here can still leave complete orphaned outputs.
    for output in outputs.iter_mut() { output.retain().map_err(|e|format!("提交失败；请检查本次生成文件是否残留：{e}"))?; }
    for output in outputs {output.accept();} Ok(())
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn streams_binary_and_checks_interruption() {
        let input: Vec<u8>=(0..700001).map(|n|(n%251) as u8).collect(); let mut output=Vec::new(); let mut whole=Sha256::new();
        let hash=copy_bytes(&mut input.as_slice(),&mut output,input.len() as u64,&mut whole,||Ok(())).unwrap();
        assert_eq!(output,input);assert_eq!(hash,format!("{:x}",Sha256::digest(&input)));assert_eq!(hash,format!("{:x}",whole.finalize()));
        let mut calls=0;let mut output=Vec::new();
        assert!(copy_bytes(&mut input.as_slice(),&mut output,input.len() as u64,&mut Sha256::new(),||{calls+=1;if calls>=2 {Err("cancel".into())} else {Ok(())}}).is_err());
        assert_eq!(output.len(),256*1024);
        assert!(copy_bytes(&mut b"short".as_slice(),&mut Vec::new(),6,&mut Sha256::new(),||Ok(())).is_err());
    }
}
