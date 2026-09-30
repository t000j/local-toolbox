use crate::{file_parts_manifest::{Manifest,Part,MAX_BYTES,MIN_CHUNK,MAX_CHUNK,part_name,valid_prefix},file_parts_stream::{Context,copy_bytes,verify_output,commit},
    safe_file_io::{Directory,stamp},network_probe::{acquire_job,ProbeExecution,ProbeStatus}};
use serde::{Deserialize,Serialize};
use sha2::{Digest,Sha256};
use std::{io::{Read,Write},time::Instant};
#[derive(Deserialize)]
#[serde(tag="mode",rename_all="lowercase",deny_unknown_fields)]
pub enum PartsRequest {
    Split {source: String,destination: String,prefix: String,#[serde(rename="chunkBytes")] chunk_bytes: u64},
    Merge {manifest: String,output: String},
}
#[derive(Serialize)] #[serde(rename_all="camelCase")]
struct Outcome {mode: &'static str,bytes: u64,part_count: usize,output_path: String,sha256: String}
fn split(source: &str,destination: &str,prefix: &str,chunk_bytes: u64,context: &Context<'_>) -> Result<Outcome,String> {
    if !valid_prefix(prefix) || !(MIN_CHUNK..=MAX_CHUNK).contains(&chunk_bytes) {return Err("前缀限 1–64 个字母/数字/下划线/连字符，分块限 1–64 MiB。".into());}
    context.check()?; let (parent,name)=Directory::parent(source)?; let mut input=parent.read(&name)?; let before=stamp(&input)?;
    if before.size>MAX_BYTES {return Err("源文件超过 512 MiB 上限。".into());}
    let directory=Directory::open(destination)?; let count=before.size.div_ceil(chunk_bytes).max(1) as usize;
    let manifest_name=format!("{prefix}.manifest.json");
    // Reserve every output before reading source data, failing on conflicts.
    let mut outputs=Vec::new();
    for index in 1..=count {context.check()?;outputs.push(directory.create(&part_name(prefix,index))?);}
    outputs.push(directory.create(&manifest_name)?);
    let mut manifest=Manifest{format:"local-toolbox-parts".into(),schema_version:1,prefix:prefix.into(),original_name:name,
        original_bytes:before.size,chunk_bytes,sha256:String::new(),parts:Vec::new()}; let mut whole=Sha256::new();
    for (i,output) in outputs[..count].iter_mut().enumerate() {
        let bytes=before.size.saturating_sub(i as u64*chunk_bytes).min(chunk_bytes);
        let hash=copy_bytes(&mut input,&mut output.file,bytes,&mut whole,||context.check())?;
        verify_output(output,bytes,&hash,context)?;
        manifest.parts.push(Part{index:i+1,name:part_name(prefix,i+1),bytes,sha256:hash});
    }
    if stamp(&input)?!=before {return Err("源文件在读取期间变化，输出未提交。".into());}
    manifest.sha256=format!("{:x}",whole.finalize()); manifest.validate()?;
    let json=serde_json::to_vec_pretty(&manifest).map_err(|e|e.to_string())?;
    if json.len()>256*1024 {return Err("分割清单超限。".into());}
    outputs[count].file.write_all(&json).map_err(|e|e.to_string())?;
    commit(&mut outputs,context)?;
    Ok(Outcome{mode:"split",bytes:before.size,part_count:count,output_path:format!("{}\\{manifest_name}",destination.trim_end_matches(['\\','/'])),sha256:manifest.sha256})
}
fn merge(manifest_path: &str,output_path: &str,context: &Context<'_>) -> Result<Outcome,String> {
    context.check()?; let (directory,name)=Directory::parent(manifest_path)?; let mut input=directory.read(&name)?; let before=stamp(&input)?;
    if before.size>256*1024 {return Err("清单超过 256 KiB。".into());}
    let mut json=Vec::new(); (&mut input).take(256*1024+1).read_to_end(&mut json).map_err(|e|e.to_string())?;
    if json.len()>256*1024 || stamp(&input)?!=before {return Err("清单超限或在读取期间变化。".into());}
    let manifest: Manifest=serde_json::from_slice(&json).map_err(|_|"不是受支持的分割清单。".to_owned())?; manifest.validate()?;
    let (parent,output_name)=Directory::parent(output_path)?; let mut outputs=vec![parent.create(&output_name)?]; let mut whole=Sha256::new();
    for part in &manifest.parts {
        context.check()?; let mut source=directory.read(&part.name)?; let before=stamp(&source)?;
        if before.size!=part.bytes {return Err(format!("分块 {} 大小不符，输出未提交。",part.index));}
        let hash=copy_bytes(&mut source,&mut outputs[0].file,part.bytes,&mut whole,||context.check())?;
        if !hash.eq_ignore_ascii_case(&part.sha256) || stamp(&source)?!=before {return Err(format!("分块 {} 校验失败或发生变化，输出未提交。",part.index));}
    }
    let hash=format!("{:x}",whole.finalize());
    if !hash.eq_ignore_ascii_case(&manifest.sha256) {return Err("合并总 SHA-256 不符，输出未提交。".into());}
    verify_output(&mut outputs[0],manifest.original_bytes,&hash,context)?; commit(&mut outputs,context)?;
    Ok(Outcome{mode:"merge",bytes:manifest.original_bytes,part_count:manifest.parts.len(),output_path:output_path.into(),sha256:hash})
}
#[tauri::command]
pub async fn run_file_parts(job_id: String,request: PartsRequest) -> Result<ProbeExecution,String> {
    let lease=acquire_job(&job_id)?; let started=Instant::now();
    tauri::async_runtime::spawn_blocking(move || {
        let context=Context{lease:&lease,started};
        let outcome=match request {PartsRequest::Split{source,destination,prefix,chunk_bytes}=>split(&source,&destination,&prefix,chunk_bytes,&context),
            PartsRequest::Merge{manifest,output}=>merge(&manifest,&output,&context)}?;
        Ok(ProbeExecution{output:serde_json::to_string(&outcome).map_err(|e|e.to_string())?,status:ProbeStatus::Completed,exit_code:Some(0),elapsed_ms:started.elapsed().as_millis() as u64})
    }).await.map_err(|e|format!("分割合并线程异常：{e}"))?
}
#[cfg(test)] #[path="file_parts_tests.rs"] mod tests;
