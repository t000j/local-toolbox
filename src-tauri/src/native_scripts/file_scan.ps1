# Fixed, read-only scanner. All user data arrives through the runner's JSON stdin.
# Child names are resolved against retained directory handles, never joined and
# reopened by path. Handles deny write/delete sharing; reparse/offline objects
# are rejected before use. This is a bounded live view, not a filesystem snapshot.
$scanJson = $request | ConvertTo-Json -Compress
Add-Type -ReferencedAssemblies System.dll,System.Core.dll,System.Web.Extensions.dll -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using Handle=Microsoft.Win32.SafeHandles.SafeFileHandle;
public class BoundedFileScan {
 sealed class ScanFault:IOException { public ScanFault(string message):base(message) {} }
 public class Query { public string root,mode,name,extension; public long? minBytes,maxBytes,afterMs,beforeMs; }
 [StructLayout(LayoutKind.Sequential)] struct US { public ushort len,max; public IntPtr text; }
 [StructLayout(LayoutKind.Sequential)] struct OA { public int len; public IntPtr root,name; public uint attrs; public IntPtr sd,qos; }
 [StructLayout(LayoutKind.Sequential)] struct IOS { public IntPtr status,info; }
 [StructLayout(LayoutKind.Sequential)] struct Info { public uint attrs,cLo,cHi,aLo,aHi,mLo,mHi,volume,hi,lo,links,idHi,idLo; }
 [DllImport("ntdll.dll")] static extern int NtCreateFile(out IntPtr h,uint access,ref OA oa,out IOS io,IntPtr size,uint attrs,uint share,uint disposition,uint options,IntPtr ea,uint eaSize);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern Handle CreateFile(string p,uint access,uint share,IntPtr sa,uint creation,uint flags,IntPtr template);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern uint GetDriveType(string p);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandle(Handle h,StringBuilder p,uint n,uint flags);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(Handle h,out Info i);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandleEx(Handle h,int kind,IntPtr data,uint size);
 class Dir { public Handle h; public string path; public int depth; }
 class Item { public Dir parent; public string name,path; public Info info; public long change; }
 Query q; JavaScriptSerializer json=new JavaScriptSerializer(); Stopwatch watch=Stopwatch.StartNew();
 List<Handle> held=new List<Handle>(); List<Dir> dirs=new List<Dir>();
 Dictionary<long,List<Item>> groups=new Dictionary<long,List<Item>>(); HashSet<string> identities=new HashSet<string>();
 Dictionary<string,int> reasons=new Dictionary<string,int>(); List<string> limits=new List<string>(); List<object> issues=new List<object>();
 int visited,skipped,rows,hashed,outputBytes; long hashBytes; bool stop,fatal;
 const uint Blocked=0x400|0x1000|0x40000|0x400000;
 static long Size(Info i) { return ((long)i.hi<<32)|i.lo; }
 static long WriteTime(Info i) { return ((long)i.mHi<<32)|i.mLo; }
 static long Modified(Info i) { return WriteTime(i)/10000-11644473600000L; }
 void Skip(string reason,string path) { skipped++; if(!reasons.ContainsKey(reason)) reasons[reason]=0; reasons[reason]++; if(issues.Count<8) issues.Add(new {reason=reason,path=path.Length>120?path.Substring(0,120):path}); }
 void Fail(IOException e,string path) { Skip(e is ScanFault?e.Message:"io-error",path); }
 void Limit(string reason) { if(!limits.Contains(reason)) limits.Add(reason); }
 bool Time(int ms) { if(watch.ElapsedMilliseconds<ms) return false; Limit("time-budget"); return true; }
 static bool Part(string p) { return p.Length>0 && p.Length<=255 && p!="." && p!=".." && !p.EndsWith(".") && !p.EndsWith(" ") && p.IndexOfAny(new char[]{'\\','/',':','\0','<','>','"','|','?','*'})<0; }
 Info Check(Handle h,bool dir) {
  Info i; if(h.IsInvalid || !GetFileInformationByHandle(h,out i)) throw new ScanFault("metadata-unavailable");
  if((i.attrs&Blocked)!=0) throw new ScanFault("reparse-or-offline");
  if(((i.attrs&16)!=0)!=dir) throw new ScanFault("entry-type-changed"); return i;
 }
 long Change(Handle h) {
  IntPtr b=Marshal.AllocHGlobal(40); try { if(!GetFileInformationByHandleEx(h,0,b,40)) throw new ScanFault("change-time-unavailable"); return Marshal.ReadInt64(b,24); } finally { Marshal.FreeHGlobal(b); }
 }
 Handle Open(Handle parent,string name,bool dir,bool data) {
  if(!Part(name)) throw new ScanFault("invalid-entry-name");
  IntPtr text=Marshal.StringToHGlobalUni(name), ptr=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(US)));
  try {
   US u=new US {len=(ushort)(name.Length*2),max=(ushort)(name.Length*2),text=text}; Marshal.StructureToPtr(u,ptr,false);
   // Preserve exact entry casing, including case-sensitive NTFS directories.
   OA oa=new OA {len=Marshal.SizeOf(typeof(OA)),root=parent.DangerousGetHandle(),name=ptr,attrs=0x1000}; IOS io; IntPtr raw;
   // FILE_OPEN only; READ_ATTRIBUTES/SYNCHRONIZE and optional READ_DATA/LIST.
   // FILE_SHARE_READ only; OPEN_REPARSE_POINT/NO_RECALL, synchronous, fixed type.
   int status=NtCreateFile(out raw,0x100080U|((dir||data)?1U:0U),ref oa,out io,IntPtr.Zero,0,1,1,0x600020U|(dir?1U:0x40U),IntPtr.Zero,0);
   if(status<0) throw new ScanFault("open-denied-or-changed");
   Handle h=new Handle(raw,true); try { Check(h,dir); return h; } catch { h.Dispose(); throw; }
  } finally { Marshal.FreeHGlobal(ptr); Marshal.FreeHGlobal(text); }
 }
 bool Match(string name,Info i) {
  long size=Size(i),ms=Modified(i);
  return (String.IsNullOrEmpty(q.name)||name.IndexOf(q.name,StringComparison.OrdinalIgnoreCase)>=0)
   && (String.IsNullOrEmpty(q.extension)||String.Equals(Path.GetExtension(name),"."+q.extension,StringComparison.OrdinalIgnoreCase))
   && (!q.minBytes.HasValue||size>=q.minBytes.Value) && (!q.maxBytes.HasValue||size<=q.maxBytes.Value)
   && (!q.afterMs.HasValue||ms>=q.afterMs.Value) && (!q.beforeMs.HasValue||ms<=q.beforeMs.Value);
 }
 bool Row(Item i,string hash) {
  if(rows>=1000) { Limit("result-limit"); stop=true; return false; }
  Dictionary<string,object> row=new Dictionary<string,object>{{"path",i.path},{"name",i.name},{"bytes",Size(i.info)},{"modifiedMs",Modified(i.info)}};
  if(hash!=null) row.Add("hash",hash); string line=json.Serialize(row); int bytes=Encoding.UTF8.GetByteCount(line)+2;
  if(outputBytes+bytes>55*1024) { Limit("output-budget"); stop=true; return false; }
  Console.WriteLine(line); Console.Out.Flush(); outputBytes+=bytes; rows++; return true;
 }
 void Entry(Dir parent,string name,uint attrs) {
  if(name=="."||name=="..") return;
  if(visited>=10000) { Limit("entry-limit"); stop=true; return; } visited++;
  string path=parent.path+"\\"+name;
  if(!Part(name)||path.Length>4096) { Skip("invalid-or-long-path",path); return; }
  if((attrs&Blocked)!=0) { Skip("reparse-or-offline",path); return; }
  bool dir=(attrs&16)!=0;
  if(dir) {
   if(parent.depth>=32||dirs.Count>=1000) { Limit(parent.depth>=32?"depth-limit":"directory-limit"); Skip("directory-limit",path); return; }
   try { Handle h=Open(parent.h,name,true,false); held.Add(h); dirs.Add(new Dir{h=h,path=path,depth=parent.depth+1}); }
   catch(IOException e) { Fail(e,path); } return;
  }
  try { using(Handle h=Open(parent.h,name,false,false)) {
   Info i=Check(h,false); if(!Match(name,i)) return;
   Item item=new Item{parent=parent,name=name,path=path,info=i,change=Change(h)};
   if(q.mode=="search") { Row(item,null); return; }
   if(Size(i)>64L*1024*1024) { Skip("file-hash-size-limit",path); Limit("file-hash-size-limit"); return; }
   string id=i.volume+":"+i.idHi+":"+i.idLo;
   if(i.idHi==0 && i.idLo==0) { Skip("identity-unavailable",path); return; }
   if(!identities.Add(id)) { Skip("hard-link-alias",path); return; }
   if(!groups.ContainsKey(Size(i))) groups.Add(Size(i),new List<Item>()); groups[Size(i)].Add(item);
  }} catch(IOException e) { Fail(e,path); }
 }
 void Walk(Dir dir) {
  IntPtr b=Marshal.AllocHGlobal(65536); try {
   bool first=true;
   while(!stop && !Time(q.mode=="duplicates"?11000:22000)) {
    if(!GetFileInformationByHandleEx(dir.h,first?15:14,b,65536)) { if(Marshal.GetLastWin32Error()!=18) Skip("directory-read-failed",dir.path); break; } first=false;
    int at=0;
    while(!stop) {
     if(at<0||at>65536-68) throw new ScanFault("invalid-directory-record");
     int next=Marshal.ReadInt32(b,at),length=Marshal.ReadInt32(b,at+60); uint attrs=(uint)Marshal.ReadInt32(b,at+56);
     if(length<0||length>510||(length&1)!=0||at+68+length>65536) throw new ScanFault("invalid-directory-record");
     Entry(dir,Marshal.PtrToStringUni(IntPtr.Add(b,at+68),length/2),attrs);
     if(Time(q.mode=="duplicates"?11000:22000)) return;
     if(next==0) break; if(next<68+length||(next&7)!=0) throw new ScanFault("invalid-directory-record"); at+=next;
    }
   }
  } catch(IOException e) { Fail(e,dir.path); } finally { Marshal.FreeHGlobal(b); }
 }
 bool Same(Item item,Info i,long change) {
  Info old=item.info; return i.volume==old.volume && i.idHi==old.idHi && i.idLo==old.idLo && Size(i)==Size(old) && WriteTime(i)==WriteTime(old) && change==item.change;
 }
 void Hash(Item item) {
  long size=Size(item.info); if(hashBytes+size>512L*1024*1024) { Limit("total-hash-budget"); Skip("total-hash-budget",item.path); return; }
  try { using(Handle h=Open(item.parent.h,item.name,false,true)) {
   if(!Same(item,Check(h,false),Change(h))) { Skip("file-changed",item.path); return; }
   using(FileStream stream=new FileStream(h,FileAccess.Read,65536,false)) using(SHA256 sha=SHA256.Create()) {
    byte[] buffer=new byte[65536]; long read=0;
    while(read<size) {
     if(Time(22000)) { stop=true; Skip("hash-incomplete",item.path); return; }
     int n=stream.Read(buffer,0,(int)Math.Min(buffer.Length,size-read)); if(n==0) break;
     hashBytes+=n; read+=n; sha.TransformBlock(buffer,0,n,buffer,0);
    }
    sha.TransformFinalBlock(new byte[0],0,0);
    if(read!=size||stream.Length!=size||!Same(item,Check(h,false),Change(h))) { Skip("file-changed",item.path); return; }
    hashed++; Row(item,BitConverter.ToString(sha.Hash).Replace("-","").ToLowerInvariant());
   }
  }} catch(IOException e) { Fail(e,item.path); } catch(UnauthorizedAccessException) { Skip("access-denied",item.path); }
 }
 void Scan() {
  string drive=q.root.Substring(0,3); uint type=GetDriveType(drive);
  if(type!=2&&type!=3&&type!=5&&type!=6) throw new ScanFault("local-drive-required");
  Handle h=CreateFile(drive,0x100081,1,IntPtr.Zero,3,0x02200000,IntPtr.Zero); held.Add(h); Check(h,true);
  StringBuilder final=new StringBuilder(1024); uint n=GetFinalPathNameByHandle(h,final,1024,0);
  if(n==0||n>=1024||!String.Equals(final.ToString(),"\\\\?\\"+drive,StringComparison.OrdinalIgnoreCase)) throw new ScanFault("drive-alias-or-reparse-root");
  foreach(string part in q.root.Substring(3).Split('\\')) { h=Open(h,part,true,false); held.Add(h); }
  dirs.Add(new Dir{h=h,path=q.root,depth=0});
  for(int at=0;at<dirs.Count&&!stop;at++) { if(Time(q.mode=="duplicates"?11000:22000)) break; Walk(dirs[at]); }
  // Size grouping precedes all content reads. Every completed hash is emitted
  // immediately, so cancellation/output clipping can still retain valid groups.
  if(q.mode=="duplicates") { stop=false; foreach(List<Item> list in groups.Values) { if(list.Count<2) continue; foreach(Item item in list) { if(stop||Time(22000)) return; Hash(item); } } }
 }
 public static void Run(string input) {
  BoundedFileScan scan=new BoundedFileScan();
  try { scan.q=scan.json.Deserialize<Query>(input); scan.Scan(); }
  catch(IOException e) { scan.fatal=true; scan.Fail(e,scan.q==null?"":scan.q.root); }
  catch(Exception) { scan.fatal=true; scan.Skip("scan-failed",scan.q==null?"":scan.q.root); }
  finally {
   for(int i=scan.held.Count-1;i>=0;i--) scan.held[i].Dispose();
   Console.WriteLine(scan.json.Serialize(new {summary=true,visited=scan.visited,skipped=scan.skipped,limited=scan.limits.Count>0,limitReasons=scan.limits,skipReasons=scan.reasons,issues=scan.issues,results=scan.rows,hashed=scan.hashed,hashBytes=scan.hashBytes,failed=scan.fatal,complete=!scan.fatal&&scan.limits.Count==0&&scan.skipped==0})); Console.Out.Flush();
  }
 }
}
'@
[BoundedFileScan]::Run($scanJson)
