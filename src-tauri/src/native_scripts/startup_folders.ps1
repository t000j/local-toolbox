# Fixed local known folders only. Opaque file moves; no reading contents or resolving shortcuts.
$startupJson = $request | ConvertTo-Json -Compress
Add-Type -ReferencedAssemblies System.dll,System.Core.dll,System.Web.Extensions.dll -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using Handle=Microsoft.Win32.SafeHandles.SafeFileHandle;
public class StartupFolders {
 public class Query { public string action,source,name,expected,value,kind,token; public bool confirmed,backup; }
 [StructLayout(LayoutKind.Sequential)] struct US { public ushort len,max; public IntPtr text; }
 [StructLayout(LayoutKind.Sequential)] struct OA { public int len; public IntPtr root,name; public uint attrs; public IntPtr sd,qos; }
 [StructLayout(LayoutKind.Sequential)] struct IOS { public IntPtr status,info; }
 [StructLayout(LayoutKind.Sequential)] struct Info { public uint attrs,cLo,cHi,aLo,aHi,mLo,mHi,volume,hi,lo,links,idHi,idLo; }
 [DllImport("ntdll.dll")] static extern int NtCreateFile(out IntPtr h,uint access,ref OA oa,out IOS io,IntPtr size,uint attrs,uint share,uint disposition,uint options,IntPtr ea,uint eaSize);
 [DllImport("ntdll.dll")] static extern int NtSetInformationFile(Handle h,out IOS io,IntPtr data,uint size,int kind);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern Handle CreateFile(string p,uint access,uint share,IntPtr sa,uint creation,uint flags,IntPtr template);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern uint GetDriveType(string p);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandle(Handle h,StringBuilder p,uint n,uint flags);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(Handle h,out Info i);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandleEx(Handle h,int kind,IntPtr data,uint size);
 const string BackupName=".LocalToolbox-StartupBackup", MarkerName=".local-toolbox-origin-v1";
 const uint Blocked=0x400|0x1000|0x40000|0x400000;
 Query q; JavaScriptSerializer json=new JavaScriptSerializer(); List<Handle> held=new List<Handle>();
 Handle parent,active,saved; string path,backupPath; int count,bytes; bool limited;
 static void Need(bool test) { if(!test) throw new IOException("Startup folder changed, unsupported, denied or conflicting"); }
 static bool Part(string s) {
  if(String.IsNullOrEmpty(s)||s.Length>255||s.EndsWith(".")||s.EndsWith(" ")||s.IndexOfAny(new char[]{'\\','/',':','<','>','"','|','?','*'})>=0) return false;
  foreach(char c in s) if(Char.IsControl(c)) return false;
  string stem=s.Split('.')[0].TrimEnd().ToUpperInvariant();
  return !System.Text.RegularExpressions.Regex.IsMatch(stem,@"\A(CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[1-9¹²³]|LPT[1-9¹²³])\z");
 }
 static Info Check(Handle h,bool dir) {
  Info i=new Info(); Need(!h.IsInvalid&&GetFileInformationByHandle(h,out i));
  Need((i.attrs&Blocked)==0&&((i.attrs&16)!=0)==dir&&(dir||i.links==1)); return i;
 }
 static string Identity(Info i) { return i.volume+":"+i.idHi+":"+i.idLo; }
 static string Final(Handle h) { StringBuilder s=new StringBuilder(4096); uint n=GetFinalPathNameByHandle(h,s,4096,0); Need(n>0&&n<4096); return s.ToString(); }
 static long Change(Handle h) { IntPtr p=Marshal.AllocHGlobal(40); try { Need(GetFileInformationByHandleEx(h,0,p,40)); return Marshal.ReadInt64(p,24); } finally { Marshal.FreeHGlobal(p); } }
 static Handle Open(Handle root,string name,bool dir,uint access,uint disposition,bool optional) {
  Need(Part(name)); IntPtr text=Marshal.StringToHGlobalUni(name),p=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(US)));
  try {
   US u=new US{len=(ushort)(name.Length*2),max=(ushort)(name.Length*2),text=text}; Marshal.StructureToPtr(u,p,false);
   OA oa=new OA{len=Marshal.SizeOf(typeof(OA)),root=root.DangerousGetHandle(),name=p,attrs=0x1000}; IOS io; IntPtr raw;
   // Exact names, object-manager no-reparse, FILE_OPEN_REPARSE_POINT, no recall, no write/delete sharing.
   int status=NtCreateFile(out raw,0x100080U|access|(dir?1U:0U),ref oa,out io,IntPtr.Zero,0,1,disposition,0x600020U|(dir?1U:0x40U),IntPtr.Zero,0);
   if(optional&&(status==unchecked((int)0xc0000034)||status==unchecked((int)0xc000003a))) return null;
   Need(status>=0); Handle h=new Handle(raw,true); try { Check(h,dir); return h; } catch { h.Dispose(); throw; }
  } finally { Marshal.FreeHGlobal(p); Marshal.FreeHGlobal(text); }
 }
 string Token(Handle root,Handle file) {
  Info i=Check(file,false); Need(i.idHi!=0||i.idLo!=0);
  string s=q.source+"\n"+path+"\n"+Identity(Check(parent,true))+"\n"+Identity(Check(active,true))+"\n"+Identity(Check(root,true))+"\n"+Identity(i)+":"+i.hi+":"+i.lo+":"+i.mHi+":"+i.mLo+":"+i.attrs+":"+Change(file);
  using(SHA256 hash=SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(s))).Replace("-","").ToLowerInvariant();
 }
 byte[] Marker() { return Encoding.UTF8.GetBytes("LocalToolbox startup backup v1\n"+q.source+"\n"+path+"\n"+Identity(Check(parent,true))+"\n"+Identity(Check(active,true))); }
 void CheckMarker(bool create) {
  byte[] expected=Marker();
  using(Handle h=Open(saved,MarkerName,false,create?3U:1U,create?2U:1U,false)) using(FileStream f=new FileStream(h,create?FileAccess.ReadWrite:FileAccess.Read,4096,false)) {
   if(create) { f.Write(expected,0,expected.Length); f.Flush(true); f.Position=0; }
   Need(f.Length==expected.Length); byte[] actual=new byte[expected.Length]; int at=0,n;
   while(at<actual.Length&&(n=f.Read(actual,at,actual.Length-at))>0) at+=n;
   Need(at==expected.Length); for(int k=0;k<at;k++) Need(expected[k]==actual[k]);
  }
 }
 void Roots() {
  Need(q.source=="user-folder"||q.source=="common-folder");
  path=Environment.GetFolderPath(q.source=="user-folder"?Environment.SpecialFolder.Startup:Environment.SpecialFolder.CommonStartup,Environment.SpecialFolderOption.DoNotVerify);
  Need(path.Length>3&&path.Length<1000&&Char.IsLetter(path[0])&&path[1]==':'&&path[2]=='\\'&&!path.EndsWith("\\"));
  string drive=path.Substring(0,3); Need(GetDriveType(drive)==3);
  Handle h=CreateFile(drive,0x100081,1,IntPtr.Zero,3,0x02200000,IntPtr.Zero); held.Add(h); Check(h,true);
  Need(String.Equals(Final(h),"\\\\?\\"+drive,StringComparison.OrdinalIgnoreCase));
  string[] parts=path.Substring(3).Split('\\'); Need(parts.Length>=2&&parts.Length<=64);
  for(int k=0;k<parts.Length;k++) { Need(Part(parts[k])); if(k==parts.Length-1) parent=h; h=Open(h,parts[k],true,0,1,false); held.Add(h); }
  active=h; Need(String.Equals(Final(active),"\\\\?\\"+path,StringComparison.OrdinalIgnoreCase));
  backupPath=path.Substring(0,path.LastIndexOf('\\')+1)+BackupName;
  saved=Open(parent,BackupName,true,0,1,true); if(saved!=null) { held.Add(saved); CheckMarker(false); }
 }
 void Limit() { limited=true; }
 List<string> Names(Handle dir) {
  List<string> names=new List<string>(); if(dir==null) return names;
  IntPtr p=Marshal.AllocHGlobal(65536); try {
   bool first=true;
   while(true) {
    if(!GetFileInformationByHandleEx(dir,first?15:14,p,65536)) { Need(Marshal.GetLastWin32Error()==18); break; } first=false;
    int at=0;
    while(true) {
     Need(at>=0&&at<=65536-68); int next=Marshal.ReadInt32(p,at),length=Marshal.ReadInt32(p,at+60);
     Need(length>=0&&length<=510&&(length&1)==0&&at+68+length<=65536);
     string name=Marshal.PtrToStringUni(IntPtr.Add(p,at+68),length/2);
     if(name!="."&&name!=".."&&!(dir==saved&&name==MarkerName)&&!String.Equals(name,"desktop.ini",StringComparison.OrdinalIgnoreCase)) {
      if(names.Count>=500) { Limit(); return names; } names.Add(name);
     }
     if(next==0) break; Need(next>=68+length&&(next&7)==0); at+=next;
    }
   }
  } finally { Marshal.FreeHGlobal(p); } return names;
 }
 void List() {
  List<string> originals=Names(active),backups=Names(saved);
  foreach(bool backup in new bool[]{false,true}) {
   Handle root=backup?saved:active; List<string> list=backup?backups:originals,other=backup?originals:backups;
   foreach(string name in list) {
    if(count>=500||bytes>=55*1024) { Limit(); break; } count++;
    try { using(Handle h=Open(root,name,false,0,1,false)) {
     bool conflict=other.Exists(delegate(string n) { return String.Equals(n,name,StringComparison.OrdinalIgnoreCase); });
     string line=json.Serialize(new {source=q.source,name=name,value=(backup?backupPath:path)+"\\"+name,kind="File",backup=backup,state=conflict?"conflict":backup?"recoverable":"registered",action=conflict?"":backup?"restore":"disable",token=Token(root,h)});
     bytes+=Encoding.UTF8.GetByteCount(line)+2; if(bytes>55*1024) { Limit(); break; } Console.WriteLine(line);
    }} catch(IOException) { Limit(); } catch(UnauthorizedAccessException) { Limit(); }
   }
  }
  if(limited) Console.WriteLine("{\"limited\":true}");
  Console.WriteLine(json.Serialize(new {startupSnapshot=true,source=q.source}));
 }
 void Move() {
  Need(q.confirmed&&Part(q.name)&&q.kind=="File"&&((q.action=="disable"&&!q.backup&&q.expected=="registered")||(q.action=="restore"&&q.backup&&q.expected=="recoverable")));
  Need(q.name!=MarkerName&&!String.Equals(q.name,"desktop.ini",StringComparison.OrdinalIgnoreCase));
  Handle from=q.backup?saved:active; Need(from!=null);
  Need(q.value==(q.backup?backupPath:path)+"\\"+q.name);
  using(Handle file=Open(from,q.name,false,0x10000,1,false)) {
   Need(Token(from,file)==q.token); Info before=Check(file,false);
   if(saved==null) { saved=Open(parent,BackupName,true,0,2,false); held.Add(saved); CheckMarker(true); }
   Handle to=q.backup?active:saved; CheckMarker(false);
   // Native same-volume rename: ReplaceIfExists is false. Existing names, including directories and links, fail atomically.
   int rootAt=IntPtr.Size==8?8:4,lengthAt=rootAt+IntPtr.Size,nameAt=lengthAt+4;
   byte[] name=Encoding.Unicode.GetBytes(q.name); IntPtr p=Marshal.AllocHGlobal(nameAt+name.Length);
   try {
    for(int k=0;k<nameAt;k++) Marshal.WriteByte(p,k,0);
    Marshal.WriteIntPtr(p,rootAt,to.DangerousGetHandle()); Marshal.WriteInt32(p,lengthAt,name.Length); Marshal.Copy(name,0,IntPtr.Add(p,nameAt),name.Length);
    Need(Token(from,file)==q.token); IOS io;
    Need(NtSetInformationFile(file,out io,p,(uint)(nameAt+name.Length),10)>=0);
   } finally { Marshal.FreeHGlobal(p); }
   Info after=Check(file,false); Need(Identity(before)==Identity(after)&&before.hi==after.hi&&before.lo==after.lo&&before.attrs==after.attrs&&before.mHi==after.mHi&&before.mLo==after.mLo);
   Need(String.Equals(Final(file),"\\\\?\\"+(q.backup?path:backupPath)+"\\"+q.name,StringComparison.OrdinalIgnoreCase));
   using(Handle remains=Open(from,q.name,false,0,1,true)) Need(remains==null);
  }
  Console.WriteLine(json.Serialize(new {verified=true,action=q.action,source=q.source,name=q.name}));
 }
 public static void Run(string input) {
  StartupFolders s=new StartupFolders(); try { s.q=s.json.Deserialize<Query>(input); s.Roots(); if(s.q.action=="list") s.List(); else s.Move(); }
  finally { for(int k=s.held.Count-1;k>=0;k--) s.held[k].Dispose(); }
 }
}
'@
[StartupFolders]::Run($startupJson)
