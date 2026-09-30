//! Opt-in Windows tests; disposable synthetic trees only, never user fixtures.
//! cargo test zip_directories -- --test-threads=1
use super::*;
use super::plan::{crc32, parts, MAX_FILE};
use std::fs;
fn dir(name: &str) -> TreeEntry { TreeEntry { name: name.into(), directory: true, content: String::new(), size: 0, crc: 0 } }
fn data(name: &str, bytes: &[u8]) -> TreeEntry { TreeEntry { name: name.into(), directory: false, content: base64::engine::general_purpose::STANDARD.encode(bytes), size: bytes.len(), crc: crc32(bytes) } }
#[test]
fn validates_names_aliases_types_sizes_and_crc_before_output() {
    for name in ["../x", "/abs", "a\\b", "C:/x", "NUL.txt", "COM0", "conout$", "a:x", "a. ", "a//b", "a\u{0085}"] { assert!(parts(name, false).is_err(), "{name}"); }
    assert!(parts("根/中文😀.txt", false).is_ok());
    assert_eq!(crc32(b"123456789"), 0xcbf4_3926);
    assert!(validate(vec![data("file", b"okay")]).is_ok()); assert!(validate(Vec::new()).is_ok());
    for entries in [vec![data("a/b", b"x")], vec![dir("A/"), data("a/b", b"x")], vec![dir("a/"), data("a", b"x")], vec![data("a", b"x"), data("A", b"y")], vec![dir("a/"), dir("a/")]] { assert!(validate(entries).is_err()); }
    let mut broken = data("f", b"okay"); broken.crc ^= 1; assert!(validate(vec![broken]).is_err());
    let mut broken = dir("a/"); broken.size = 1; assert!(validate(vec![broken]).is_err());
    let mut broken = data("f", b"x"); broken.size = MAX_FILE + 1; assert!(validate(vec![broken]).is_err());
    assert!(validate((0..201).map(|i| dir(&format!("d{i}/"))).collect()).is_err());
}
#[test]
fn synthetic_tree_round_trip_empty_conflict_hardlink_cleanup_and_cancel() {
    let root = std::env::temp_dir().join(format!("toolbox-zip-test-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
    fs::create_dir(&root).unwrap();
    struct Cleanup(std::path::PathBuf); impl Drop for Cleanup { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }
    let _cleanup = Cleanup(root.clone());
    let source = root.join("fixture"); fs::create_dir(&source).unwrap(); fs::create_dir(source.join("empty")).unwrap(); fs::create_dir(source.join("nested")).unwrap();
    let bytes: Vec<_> = (0..700_001).map(|i| (i % 251) as u8).collect(); fs::write(source.join("nested").join("data.bin"), &bytes).unwrap(); fs::write(source.join("zero.txt"), []).unwrap();
    let id = crate::network_probe::prepare_network_probe().unwrap(); let lease = acquire_job(&id).unwrap(); let context = Context { lease: &lease, started: Instant::now() };
    let mut entries = Vec::new(); let mut total = 0;
    { let directory = Directory::open(source.to_str().unwrap()).unwrap(); scan(directory.handle(), "fixture/", &mut entries, &mut total, &context).unwrap(); }
    assert_eq!(entries.len(), 5); assert_eq!(total, bytes.len());
    let saved = restore(root.to_str().unwrap(), "restored", entries, &context).unwrap(); assert_eq!(saved.entries, 5); assert_eq!(saved.bytes, bytes.len());
    assert!(root.join("restored/fixture/empty").is_dir()); assert_eq!(fs::read(root.join("restored/fixture/nested/data.bin")).unwrap(), bytes); assert_eq!(fs::metadata(root.join("restored/fixture/zero.txt")).unwrap().len(), 0);
    assert!(restore(root.to_str().unwrap(), "restored", vec![], &context).is_err()); assert_eq!(fs::read(root.join("restored/fixture/nested/data.bin")).unwrap(), bytes);
    restore(root.to_str().unwrap(), "empty-output", Vec::new(), &context).unwrap(); assert!(root.join("empty-output").is_dir());
    // Reject even a hardlink inside an otherwise safe tree before returning data.
    fs::hard_link(source.join("zero.txt"), root.join("hardlink.txt")).unwrap();
    { let directory = Directory::open(source.to_str().unwrap()).unwrap(); assert!(scan(directory.handle(), "fixture/", &mut Vec::new(), &mut 0, &context).is_err()); }
    fs::remove_file(root.join("hardlink.txt")).unwrap();
    // Exercise handle-only reverse cleanup with a nested new directory and a
    // pending partially written file; originals are never rollback targets.
    { let parent = Directory::open(root.to_str().unwrap()).unwrap(); let mut tree = NewTree::new(); tree.directories.push(safe_file_io::relative(parent.handle(), "rollback", true, true).unwrap());
      let nested = safe_file_io::relative(&tree.directories[0], "nested", true, true).unwrap(); tree.directories.push(nested);
      tree.files.push(NewFile::create_at(&tree.directories[1], "partial.bin").unwrap()); tree.files[0].file.write_all(b"partial").unwrap(); assert!(tree.rollback()); }
    assert!(!root.join("rollback").exists());
    // Existing links conflict without following them or removing their target.
    fs::hard_link(source.join("zero.txt"), root.join("existing-link")).unwrap(); assert!(restore(root.to_str().unwrap(), "existing-link", Vec::new(), &context).is_err()); assert!(root.join("existing-link").exists());
    crate::network_probe::cancel_network_probe(id); assert!(restore(root.to_str().unwrap(), "cancelled", vec![data("f", b"x")], &context).is_err()); assert!(!root.join("cancelled").exists());
    assert_eq!(fs::read(source.join("nested/data.bin")).unwrap(), bytes);
}
