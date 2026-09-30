//! Windows-only opt-in built-in tests, using newly created temporary fixtures.
//! Run: cargo test file_parts -- --test-threads=1
use super::*;
use std::fs;
#[test]
fn synthetic_split_merge_integrity_conflict_cleanup() {
    let root=std::env::temp_dir().join(format!("toolbox-parts-test-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
    fs::create_dir(&root).unwrap();
    struct Cleanup(std::path::PathBuf); impl Drop for Cleanup {fn drop(&mut self){let _=fs::remove_dir_all(&self.0);}}
    let _cleanup=Cleanup(root.clone());
    let data: Vec<u8>=(0..MIN_CHUNK+91).map(|n|(n%251) as u8).collect();
    let source=root.join("fixture.bin"); fs::write(&source,&data).unwrap();
    let id=crate::network_probe::prepare_network_probe().unwrap(); let lease=acquire_job(&id).unwrap();
    let context=Context{lease:&lease,started:Instant::now()};
    let result=split(source.to_str().unwrap(),root.to_str().unwrap(),"sample",MIN_CHUNK,&context).unwrap();
    assert_eq!(result.part_count,2); assert_eq!(fs::read(&source).unwrap(),data);
    let json=fs::read(root.join("sample.manifest.json")).unwrap(); let m: Manifest=serde_json::from_slice(&json).unwrap();m.validate().unwrap();
    assert_eq!(m.parts[0].bytes,MIN_CHUNK);assert_eq!(m.parts[1].bytes,91);
    let output=root.join("merged.bin");merge(&result.output_path,output.to_str().unwrap(),&context).unwrap();
    assert_eq!(fs::read(&output).unwrap(),data);
    assert!(merge(&result.output_path,output.to_str().unwrap(),&context).is_err());assert_eq!(fs::read(&output).unwrap(),data);
    assert!(split(source.to_str().unwrap(),root.to_str().unwrap(),"sample",MIN_CHUNK,&context).is_err());
    // Corrupt one newly created synthetic part: failed merge cannot leave output.
    fs::write(root.join("sample.part00002.bin"),vec![0u8;91]).unwrap();
    let bad=root.join("bad.bin");assert!(merge(&result.output_path,bad.to_str().unwrap(),&context).is_err());assert!(!bad.exists());
    fs::remove_file(root.join("sample.part00002.bin")).unwrap();
    assert!(merge(&result.output_path,bad.to_str().unwrap(),&context).is_err());assert!(!bad.exists());
    let empty=root.join("empty.bin");fs::write(&empty,[]).unwrap();
    let e=split(empty.to_str().unwrap(),root.to_str().unwrap(),"empty",MIN_CHUNK,&context).unwrap();
    let merged_empty=root.join("empty-output.bin");merge(&e.output_path,merged_empty.to_str().unwrap(),&context).unwrap();assert_eq!(fs::metadata(merged_empty).unwrap().len(),0);
    // A late output-name conflict cleans up already reserved new files.
    fs::write(root.join("conflict.part00002.bin"),b"original").unwrap();
    assert!(split(source.to_str().unwrap(),root.to_str().unwrap(),"conflict",MIN_CHUNK,&context).is_err());
    assert!(!root.join("conflict.part00001.bin").exists());assert_eq!(fs::read(root.join("conflict.part00002.bin")).unwrap(),b"original");
    crate::network_probe::cancel_network_probe(id);
    assert!(split(source.to_str().unwrap(),root.to_str().unwrap(),"cancelled",MIN_CHUNK,&context).is_err());
    assert!(!root.join("cancelled.part00001.bin").exists());assert_eq!(fs::read(source).unwrap(),data);
}
