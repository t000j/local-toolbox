//! Local, handle-relative IO. Existing files are read-only; new outputs are
//! exclusive and delete-pending until commit. No path-based reopen or unlink.
//! Mirrors file_scan.ps1 traversal; see docs/file-io-safety.md for guarantees.
use std::{ffi::c_void, fs::File, io, mem::{size_of, zeroed}, os::windows::io::{AsRawHandle, FromRawHandle}, ptr::{null, null_mut}};
type Handle = *mut c_void;
#[repr(C)] struct Unicode { len: u16, max: u16, text: *const u16 }
#[repr(C)] struct Attributes { len: u32, root: Handle, name: *const Unicode, attrs: u32, sd: Handle, qos: Handle }
#[repr(C)] struct Status { status: usize, info: usize }
#[repr(C)] #[derive(Default)] struct Info { attrs: u32, created: [u32;2], access: [u32;2], modified: [u32;2], volume: u32, size_hi: u32, size_lo: u32, links: u32, id_hi: u32, id_lo: u32 }
#[repr(C)] struct Basic { created: i64, access: i64, modified: i64, change: i64, attrs: u32 }
#[link(name="ntdll")]
extern "system" { fn NtCreateFile(h: *mut Handle, access: u32, attrs: *const Attributes, status: *mut Status, size: *const i64, flags: u32, share: u32, disposition: u32, options: u32, ea: Handle, ea_size: u32) -> i32; }
#[link(name="kernel32")]
extern "system" {
    fn CreateFileW(path: *const u16, access: u32, share: u32, security: Handle, creation: u32, flags: u32, template: Handle) -> Handle;
    fn GetDriveTypeW(path: *const u16) -> u32;
    fn GetFinalPathNameByHandleW(h: Handle, path: *mut u16, size: u32, flags: u32) -> u32;
    fn GetFileInformationByHandle(h: Handle, info: *mut Info) -> i32;
    fn GetFileInformationByHandleEx(h: Handle, kind: u32, data: *mut c_void, size: u32) -> i32;
    fn SetFileInformationByHandle(h: Handle, kind: u32, data: *const c_void, size: u32) -> i32;
}
fn err() -> String { format!("本地文件操作失败（权限、占用、名称冲突或文件变化）：{}", io::Error::last_os_error()) }
fn check(file: &File, directory: bool) -> Result<Info,String> {
    let mut info = Info::default();
    if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0 { return Err(err()); }
    if info.attrs & (0x400|0x1000|0x40000|0x400000) != 0 || (info.attrs & 16 != 0) != directory { return Err("拒绝链接、重解析点、离线文件或变化的文件类型。".into()); }
    Ok(info)
}
pub(crate) fn path_parts(value: &str) -> Result<(String,Vec<String>),String> {
    let path = value.replace('/', "\\"); let p = path.trim_end_matches('\\'); let bytes = p.as_bytes();
    if bytes.len()<4 || !bytes[0].is_ascii_alphabetic() || bytes[1]!=b':' || bytes[2]!=b'\\' || p.encode_utf16().count()>1000 { return Err("请选择本地子目录中的绝对路径；拒绝整盘、网络或设备路径。".into()); }
    let parts: Vec<_> = p[3..].split('\\').map(str::to_owned).collect();
    if parts.len()>64 || !parts.iter().all(|s| crate::file_scan::valid_component(s)) { return Err("路径含无效、保留名称或过多层级。".into()); }
    Ok((p[..3].to_owned(),parts))
}
fn relative(parent: &File, name: &str, directory: bool, create: bool) -> Result<File,String> {
    if !crate::file_scan::valid_component(name) { return Err("无效文件名。".into()); }
    let text: Vec<u16> = name.encode_utf16().collect(); let u=Unicode{len:(text.len()*2) as u16,max:(text.len()*2) as u16,text:text.as_ptr()};
    let a=Attributes{len:size_of::<Attributes>() as u32,root:parent.as_raw_handle(),name:&u,attrs:0x1000,sd:null_mut(),qos:null_mut()};
    let mut raw=null_mut(); let mut status=Status{status:0,info:0};
    // OBJ_DONT_REPARSE; FILE_OPEN_REPARSE_POINT | FILE_OPEN_NO_RECALL;
    // exact-case opens, retained parents, share-read only for existing files.
    let code=unsafe { NtCreateFile(&mut raw,if create {0x110183} else {0x100081},&a,&mut status,null(),0,
        if create {0} else {1},if create {2} else {1},0x600020|if directory {1} else {0x40},null_mut(),0) };
    if code<0 { return Err(format!("无法安全打开或新建文件（NT 状态 {code:#x}）；目标可能已存在。")); }
    let file=unsafe {File::from_raw_handle(raw)};
    check(&file,directory)?; Ok(file)
}
pub(crate) struct Directory { held: Vec<File> }
impl Directory {
    pub(crate) fn open(path: &str) -> Result<Self,String> {
        let (drive,parts)=path_parts(path)?; Self::from_parts(&drive,&parts)
    }
    pub(crate) fn parent(path: &str) -> Result<(Self,String),String> {
        let (drive,mut parts)=path_parts(path)?; let name=parts.pop().ok_or("缺少文件名。")?;
        if parts.is_empty() { return Err("请选择本地子目录，不允许直接使用盘符根目录。".into()); }
        Ok((Self::from_parts(&drive,&parts)?,name))
    }
    fn from_parts(drive: &str,parts: &[String]) -> Result<Self,String> {
        let wide: Vec<u16>=drive.encode_utf16().chain(Some(0)).collect();
        if !matches!(unsafe {GetDriveTypeW(wide.as_ptr())},2|3|5|6) { return Err("只支持本地驱动器。".into()); }
        let raw=unsafe {CreateFileW(wide.as_ptr(),0x100081,1,null_mut(),3,0x02200000,null_mut())};
        if raw as isize == -1 { return Err(err()); }
        let file=unsafe {File::from_raw_handle(raw)}; check(&file,true)?;
        let mut final_path=[0u16;1024]; let n=unsafe {GetFinalPathNameByHandleW(file.as_raw_handle(),final_path.as_mut_ptr(),1024,0)} as usize;
        if n==0 || n>=1024 || !String::from_utf16_lossy(&final_path[..n]).eq_ignore_ascii_case(&format!("\\\\?\\{drive}")) {return Err("拒绝驱动器别名或重解析根路径。".into());}
        let mut directory=Self{held:vec![file]};
        for part in parts { let child=relative(directory.handle(),part,true,false)?; directory.held.push(child); }
        Ok(directory)
    }
    fn handle(&self) -> &File { self.held.last().expect("retained root") }
    pub(crate) fn read(&self,name: &str) -> Result<File,String> { relative(self.handle(),name,false,false) }
    pub(crate) fn create(&self,name: &str) -> Result<NewFile,String> {
        let file=relative(self.handle(),name,false,true)?;
        let mut new=NewFile{file,committed:false}; new.mark_delete(true)?; Ok(new)
    }
}
#[derive(PartialEq,Eq)] pub(crate) struct Stamp { pub size: u64, volume: u32, id: u64, modified: u64, change: i64 }
pub(crate) fn stamp(file: &File) -> Result<Stamp,String> {
    let i=check(file,false)?; let mut b: Basic=unsafe {zeroed()};
    if unsafe {GetFileInformationByHandleEx(file.as_raw_handle(),0,(&mut b as *mut Basic).cast(),size_of::<Basic>() as u32)}==0 || (i.id_hi==0 && i.id_lo==0) {return Err("无法核验文件标识或变更时间。".into());}
    Ok(Stamp{size:((i.size_hi as u64)<<32)|i.size_lo as u64,volume:i.volume,id:((i.id_hi as u64)<<32)|i.id_lo as u64,modified:((i.modified[1] as u64)<<32)|i.modified[0] as u64,change:b.change})
}
pub(crate) struct NewFile { pub file: File, committed: bool }
impl NewFile {
    fn mark_delete(&mut self,delete: bool) -> Result<(),String> {
        let flag=delete as u8;
        if unsafe {SetFileInformationByHandle(self.file.as_raw_handle(),4,(&flag as *const u8).cast(),1)}==0 {return Err(err());} Ok(())
    }
    pub(crate) fn persist(&mut self) -> Result<(),String> { self.file.sync_all().map_err(|_|err())?; self.mark_delete(false) }
    pub(crate) fn accept(&mut self) { self.committed=true; }
}
impl Drop for NewFile { fn drop(&mut self) { if !self.committed { let _=self.mark_delete(true); } } }

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read,Write};
    #[test] fn rejects_unsafe_paths() {
        for p in ["C:\\",r"\\host\share",r"C:\a\..\b",r"C:\a\NUL.txt",r"C:\a\x:ads",r"C:\a.\b"] { assert!(path_parts(p).is_err()); }
        assert!(path_parts(r"C:\fixture\目录").is_ok());
    }
    #[test] fn synthetic_new_file_commit_conflict_and_drop() {
        let root=std::env::temp_dir().join(format!("toolbox-output-test-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir(&root).unwrap();
        {
            let dir=Directory::open(root.to_str().unwrap()).unwrap();
            { let mut f=dir.create("discard.bin").unwrap(); f.file.write_all(b"partial").unwrap(); }
            assert!(!root.join("discard.bin").exists());
            { let mut f=dir.create("keep.bin").unwrap(); f.file.write_all(b"complete").unwrap(); f.persist().unwrap(); f.accept(); }
            assert!(dir.create("keep.bin").is_err());
            let mut f=dir.read("keep.bin").unwrap(); let mut bytes=Vec::new(); f.read_to_end(&mut bytes).unwrap(); assert_eq!(bytes,b"complete");
        }
        std::fs::remove_dir_all(root).unwrap();
    }
}
