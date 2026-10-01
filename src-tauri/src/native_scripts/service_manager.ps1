# Local, bounded dependency plans. No elevation, wildcard mutation or cascading stop.
$clock = [Diagnostics.Stopwatch]::StartNew()
Add-Type -AssemblyName System.ServiceProcess
$services = [ServiceProcess.ServiceController]::GetServices()
try {
    if ($request.action -eq 'list') {
        $count = 0
        foreach ($service in $services) {
            if ($count -ge 500) { [Console]::WriteLine('{"limited":true}'); break }
            try {
                $state = $service.Status.ToString(); $action = ''
                if ($state -eq 'Stopped') { $action = 'start' }
                if ($state -eq 'Running' -and $service.CanStop) { $action = 'stop' }
                [Console]::WriteLine((@{ name = $service.ServiceName; value = $service.DisplayName; state = $state; action = $action; scope = '本机服务' } | ConvertTo-Json -Compress))
                $count++
            } catch { [Console]::WriteLine('{"limited":true}') }
        }
        return
    }
    if ($services.Count -gt 500) { throw 'Service list limit' }
    # QueryServiceConfig preserves raw +group dependencies. ServiceController.Stop()
    # implicitly stops dependents, so use non-cascading ControlService instead.
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
public static class ToolboxServiceNative {
 [StructLayout(LayoutKind.Sequential)] struct Config {
  public uint type, start, error; public IntPtr binary, group; public uint tag;
  public IntPtr dependencies, account, display;
 }
 [StructLayout(LayoutKind.Sequential)] struct Status { public uint type, state, controls, exit, specific, checkpoint, hint; }
 [DllImport("advapi32.dll", CharSet=CharSet.Unicode, ExactSpelling=true, SetLastError=true)] static extern IntPtr OpenSCManagerW(string machine, string database, uint access);
 [DllImport("advapi32.dll", CharSet=CharSet.Unicode, ExactSpelling=true, SetLastError=true)] static extern IntPtr OpenServiceW(IntPtr manager, string name, uint access);
 [DllImport("advapi32.dll", ExactSpelling=true, SetLastError=true)] static extern bool QueryServiceConfigW(IntPtr service, IntPtr buffer, uint size, out uint needed);
 [DllImport("advapi32.dll", ExactSpelling=true, SetLastError=true)] static extern bool ControlService(IntPtr service, uint control, out Status status);
 [DllImport("advapi32.dll", ExactSpelling=true)] static extern bool CloseServiceHandle(IntPtr handle);
 public sealed class Snapshot { public string[] Dependencies; public string Hash; public uint Start; }
 static IntPtr Open(string name, uint access) {
  IntPtr manager = OpenSCManagerW(null, null, 1);
  if (manager == IntPtr.Zero) throw new Win32Exception();
  try { IntPtr service = OpenServiceW(manager, name, access); if (service == IntPtr.Zero) throw new Win32Exception(); return service; }
  finally { CloseServiceHandle(manager); }
 }
 static string Read(IntPtr p) { return p == IntPtr.Zero ? "" : Marshal.PtrToStringUni(p); }
 static void Field(StringBuilder b, string s) { b.Append(s.Length).Append(':').Append(s); }
 public static Snapshot ReadConfig(string name) {
  IntPtr service = Open(name, 1), buffer = IntPtr.Zero;
  try {
   uint needed; QueryServiceConfigW(service, IntPtr.Zero, 0, out needed);
   if (Marshal.GetLastWin32Error() != 122 || needed == 0 || needed > 8192) throw new InvalidOperationException("Config unavailable or oversized");
   buffer = Marshal.AllocHGlobal((int)needed);
   if (!QueryServiceConfigW(service, buffer, needed, out needed)) throw new Win32Exception();
   Config c = (Config)Marshal.PtrToStructure(buffer, typeof(Config));
   if (c.type != 16 && c.type != 32 && c.type != 272 && c.type != 288) throw new InvalidOperationException("Driver or special service unsupported");
   var deps = new List<string>(); IntPtr p = c.dependencies;
   while (p != IntPtr.Zero) {
    string s = Read(p); if (s.Length == 0) break;
    if (s[0] == '+' || s.Length > 256 || deps.Count >= 32) throw new InvalidOperationException("Group or dependency limit");
    deps.Add(s); p = IntPtr.Add(p, (s.Length + 1) * 2);
   }
   var b = new StringBuilder();
   foreach (string s in new[] { c.type.ToString(), c.start.ToString(), c.error.ToString(), Read(c.binary), Read(c.group), c.tag.ToString(), Read(c.account), Read(c.display) }) Field(b, s);
   foreach (string s in deps) Field(b, s);
   using (var sha = SHA256.Create()) return new Snapshot { Dependencies = deps.ToArray(), Start = c.start, Hash = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(b.ToString()))).Replace("-", "").ToLowerInvariant() };
  } finally { if (buffer != IntPtr.Zero) Marshal.FreeHGlobal(buffer); CloseServiceHandle(service); }
 }
 public static void StopOne(string name) {
  IntPtr service = Open(name, 32);
  try { Status s; if (!ControlService(service, 1, out s)) throw new Win32Exception(); }
  finally { CloseServiceHandle(service); }
 }
}
'@
    $map = [Collections.Generic.Dictionary[string,object]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($s in $services) { $map.Add($s.ServiceName, $s) }
    if (!$map.ContainsKey($request.name) -or $map[$request.name].ServiceName -cne $request.name) { throw 'Target changed' }
    $action = if ($request.action -eq 'preview') { if ($request.expected -eq 'Stopped') { 'start' } else { 'stop' } } else { $request.action }
    if ($action -notin @('start','stop')) { throw 'Invalid action' }
    $wanted = if ($action -eq 'start') { 'Running' } else { 'Stopped' }
    function Check-Time { if ($clock.ElapsedMilliseconds -gt 15000) { throw 'Plan time limit' } }
    function Get-Plan {
        $ordered = [Collections.Generic.List[object]]::new()
        $visited = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        $visiting = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        function Visit-Service([string]$name) {
            Check-Time
            if ($visiting.Contains($name)) { throw 'Dependency cycle' }
            if ($visited.Contains($name)) { return }
            if ($visited.Count + $visiting.Count -ge 32 -or !$map.ContainsKey($name)) { throw 'Graph limit or driver dependency' }
            $s = $map[$name]; $s.Refresh(); $state = $s.Status.ToString()
            if ($state -notin @('Running','Stopped')) { throw 'Transitional or paused state' }
            $config = [ToolboxServiceNative]::ReadConfig($s.ServiceName)
            if ($action -eq 'start' -and $state -eq 'Stopped' -and $config.Start -eq 4) { throw 'Disabled service' }
            if ($action -eq 'stop' -and $state -eq 'Running' -and !$s.CanStop) { throw 'Cannot stop' }
            $null = $visiting.Add($name)
            $links = [Collections.Generic.List[string]]::new()
            if ($action -eq 'start') { foreach ($dep in $config.Dependencies) {
                if (!$map.ContainsKey($dep)) { throw 'Missing or driver dependency' }
                $links.Add($map[$dep].ServiceName)
            } } else {
                $dependents = $s.DependentServices
                try { foreach ($dep in $dependents) {
                    if (!$map.ContainsKey($dep.ServiceName)) { throw 'Missing or driver dependent' }
                    $links.Add($map[$dep.ServiceName].ServiceName)
                } } finally { foreach ($dep in $dependents) { $dep.Dispose() } }
            }
            $links.Sort([StringComparer]::Ordinal)
            foreach ($link in $links) { Visit-Service $link }
            $null = $visiting.Remove($name); $null = $visited.Add($name)
            $ordered.Add([ordered]@{ name = $s.ServiceName; displayName = $s.DisplayName; state = $state; nextState = $wanted; links = @($links.ToArray()); config = $config.Hash })
        }
        Visit-Service $request.name
        return ,$ordered.ToArray()
    }
    function Plan-Hash($nodes) {
        $json = ConvertTo-Json -InputObject @($nodes) -Depth 6 -Compress
        $sha = [Security.Cryptography.SHA256]::Create()
        try { return [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($json))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
    }
    $plan = Get-Plan
    if ($plan[-1].state -cne $request.expected -or $plan[-1].state -eq $wanted) { throw 'Stale target state' }
    $fingerprint = Plan-Hash $plan
    if ($request.action -eq 'preview') {
        $public = @($plan | ForEach-Object { [ordered]@{ name = $_.name; displayName = $_.displayName; state = $_.state; nextState = $_.nextState; links = @($_.links) } })
        [Console]::WriteLine(([ordered]@{ plan = $true; name = $request.name; action = $action; expected = $request.expected; fingerprint = $fingerprint; services = $public } | ConvertTo-Json -Depth 6 -Compress))
        return
    }
    if ($request.confirmed -ne $true) { throw 'Confirmation required' }
    if ($fingerprint -cne $request.fingerprint -or $plan.Count -ne $request.names.Count) { throw 'Stale dependency preview' }
    for ($i = 0; $i -lt $plan.Count; $i++) { if ($plan[$i].name -cne $request.names[$i]) { throw 'Confirmed scope changed' } }
    function Assert-Plan {
        Check-Time
        if ((Plan-Hash (Get-Plan)) -cne (Plan-Hash $plan)) { throw 'Dependency configuration or state changed' }
    }
    foreach ($entry in $plan) {
        Assert-Plan
        if ($entry.state -eq $wanted) { continue }
        $s = $map[$entry.name]
        if ($action -eq 'start') {
            # All known dependencies have reached Running; SCM races are not atomic.
            foreach ($link in $entry.links) { $map[$link].Refresh(); if ($map[$link].Status.ToString() -cne 'Running') { throw 'Dependency changed before start' } }
            $s.Start()
        } else { [ToolboxServiceNative]::StopOne($entry.name) }
        $s.WaitForStatus([ServiceProcess.ServiceControllerStatus]$wanted, [TimeSpan]::FromSeconds(3))
        $entry.state = $wanted
        Assert-Plan
        [Console]::WriteLine((@{ progress = $true; name = $entry.name; state = $wanted } | ConvertTo-Json -Compress))
    }
    Assert-Plan
    [Console]::WriteLine((@{ verified = $true; name = $request.name; action = $action; fingerprint = $fingerprint } | ConvertTo-Json -Compress))
} finally { foreach ($service in $services) { $service.Dispose() } }
