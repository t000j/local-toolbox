use serde::{Deserialize,Serialize};
pub(crate) const MAX_BYTES: u64=512*1024*1024;
pub(crate) const MIN_CHUNK: u64=1024*1024;
pub(crate) const MAX_CHUNK: u64=64*1024*1024;
#[derive(Deserialize,Serialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub(crate) struct Part { pub index: usize, pub name: String, pub bytes: u64, pub sha256: String }
#[derive(Deserialize,Serialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub(crate) struct Manifest { pub format: String, pub schema_version: u32, pub prefix: String, pub original_name: String,
    pub original_bytes: u64, pub chunk_bytes: u64, pub sha256: String, pub parts: Vec<Part> }
pub(crate) fn valid_prefix(s: &str) -> bool { !s.is_empty() && s.len()<=64 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b==b'-' || b==b'_') }
pub(crate) fn part_name(prefix: &str,index: usize) -> String { format!("{prefix}.part{index:05}.bin") }
pub(crate) fn valid_hash(s: &str) -> bool {s.len()==64 && s.bytes().all(|b|b.is_ascii_hexdigit())}
impl Manifest {
    pub(crate) fn validate(&self) -> Result<(),String> {
        if self.format!="local-toolbox-parts" || self.schema_version!=1 || !valid_prefix(&self.prefix)
            || !crate::file_scan::valid_component(&self.original_name) || self.original_bytes>MAX_BYTES
            || !(MIN_CHUNK..=MAX_CHUNK).contains(&self.chunk_bytes) || !valid_hash(&self.sha256) {return Err("不支持或无效的分割清单。".into());}
        let count=self.original_bytes.div_ceil(self.chunk_bytes).max(1) as usize;
        if self.parts.len()!=count || count>512 {return Err("分块数量与总大小不符。".into());}
        for (i,p) in self.parts.iter().enumerate() {
            let bytes=self.original_bytes.saturating_sub(i as u64*self.chunk_bytes).min(self.chunk_bytes);
            if p.index!=i+1 || p.name!=part_name(&self.prefix,i+1) || p.bytes!=bytes || !valid_hash(&p.sha256) {return Err("分块顺序、名称、大小或 SHA-256 无效；不能混用清单。".into());}
        }
        Ok(())
    }
}
#[cfg(test)] mod tests {
    use super::*;
    fn manifest() -> Manifest { Manifest{format:"local-toolbox-parts".into(),schema_version:1,prefix:"fixture".into(),original_name:"input.bin".into(),original_bytes:0,chunk_bytes:MIN_CHUNK,sha256:"a".repeat(64),parts:vec![Part{index:1,name:part_name("fixture",1),bytes:0,sha256:"a".repeat(64)}]} }
    #[test] fn validates_shape_and_order() {
        assert!(manifest().validate().is_ok());
        let mut m=manifest();m.parts[0].name="..\\outside.bin".into();assert!(m.validate().is_err());
        let mut m=manifest();m.parts[0].index=2;assert!(m.validate().is_err());
        let mut m=manifest();m.original_bytes=MAX_BYTES+1;assert!(m.validate().is_err());
        let mut m=manifest();m.parts[0].sha256="bad".into();assert!(m.validate().is_err());
        let mut m=manifest();m.parts.clear();assert!(m.validate().is_err());
        for p in ["", "../x", "a.b", "中文", "CON:"] {assert!(!valid_prefix(p));}
    }
}
