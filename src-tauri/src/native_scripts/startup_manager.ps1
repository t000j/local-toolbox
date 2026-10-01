# Fixed registry sources only. Never execute values or modify StartupApproved.
if ($request.source -cnotmatch '\A(hkcu|hklm)-(run|runonce)-(32|64)\z') { throw 'Invalid source' }
$hiveName = $Matches[1]; $keyName = $Matches[2]; $bits = $Matches[3]
if ($bits -eq '64' -and ![Environment]::Is64BitOperatingSystem) { throw '64-bit registry view unavailable' }
$hive = if ($hiveName -eq 'hkcu') { [Microsoft.Win32.RegistryHive]::CurrentUser } else { [Microsoft.Win32.RegistryHive]::LocalMachine }
$view = if ($bits -eq '64') { [Microsoft.Win32.RegistryView]::Registry64 } else { [Microsoft.Win32.RegistryView]::Registry32 }
$root = [Microsoft.Win32.RegistryKey]::OpenBaseKey($hive, $view)
$runPath = 'Software\Microsoft\Windows\CurrentVersion\' + $(if ($keyName -eq 'run') { 'Run' } else { 'RunOnce' })
# Preserve the original version's HKCU Run64 backups; all other backups stay in the same hive/view as their source.
$backupPath = if ($request.source -ceq 'hkcu-run-64') { 'Software\LocalToolbox\StartupBackup' } else { 'Software\LocalToolbox\StartupBackupV2\' + $request.source }
$run = $null; $backup = $null; $count = 0; $bytes = 0
function Read-Exact($key, $name) {
    if ($null -eq $key -or !(@($key.GetValueNames()) -contains $name)) { return $null }
    $kind = $key.GetValueKind($name).ToString()
    if ($kind -notin @('String', 'ExpandString')) { return @{ kind = $kind; value = '' } }
    return @{ kind = $kind; value = $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) }
}
function Matches($value) { return $null -ne $value -and $value.kind -ceq $request.kind -and $value.value -is [string] -and $value.value -ceq $request.value }
function Same($a, $b) { return $null -ne $a -and $null -ne $b -and $a.kind -ceq $b.kind -and $a.value -ceq $b.value }
function Valid-Name($name) { return $name -is [string] -and $name.Length -gt 0 -and $name.Length -le 256 -and $name -notmatch '[\x00-\x1f\x7f-\x9f]' }
function Valid-Value($item) {
    if ($null -eq $item -or $item.kind -notin @('String', 'ExpandString') -or $item.value -isnot [string] -or $item.value.Length -gt 8192 -or $item.value.Contains([string][char]0)) { return $false }
    try { [void]([Text.UTF8Encoding]::new($false, $true)).GetByteCount($item.value); return $true } catch { return $false }
}
try {
    $write = $request.action -ne 'list'
    if ($write -and ($request.confirmed -ne $true -or $keyName -ne 'run' -or !(Valid-Name $request.name)
        -or !(Valid-Value @{kind=$request.kind;value=$request.value}) -or $request.token -cne ''
        -or ($request.action -ceq 'disable' -and ($request.backup -ne $false -or $request.expected -cne 'registered'))
        -or ($request.action -ceq 'restore' -and ($request.backup -ne $true -or $request.expected -cne 'recoverable'))
        -or $request.action -cnotin @('disable', 'restore'))) { throw 'Invalid change or confirmation' }
    $run = $root.OpenSubKey($runPath, $write)
    if ($keyName -eq 'run') { $backup = $root.OpenSubKey($backupPath, $write) }
    if (!$write) {
        foreach ($source in @(@{ key = $run; backup = $false }, @{ key = $backup; backup = $true })) {
            if ($null -eq $source.key) { continue }
            foreach ($name in $source.key.GetValueNames()) {
                if ($count -ge 500 -or $bytes -ge 55*1024) { [Console]::WriteLine('{"limited":true}'); break }; $count++
                $item = Read-Exact $source.key $name
                if (!(Valid-Name $name) -or !(Valid-Value $item)) { [Console]::WriteLine('{"limited":true}'); continue }
                $action = ''; $state = 'readonly'
                if ($keyName -eq 'run') {
                    if ($source.backup) {
                        $state = 'recoverable'; $action = 'restore'
                        if ($null -ne (Read-Exact $run $name)) { $state = 'conflict'; $action = '' }
                    } else {
                        $state = 'registered'; $action = 'disable'; $saved = Read-Exact $backup $name
                        if ($null -ne $saved -and !(Same $saved $item)) { $state = 'conflict'; $action = '' }
                    }
                }
                $line = @{ source=$request.source; name=$name; value=$item.value; kind=$item.kind; backup=$source.backup; state=$state; action=$action; token='' } | ConvertTo-Json -Compress
                $bytes += [Text.Encoding]::UTF8.GetByteCount($line) + 2
                if ($bytes -gt 55*1024) { [Console]::WriteLine('{"limited":true}'); break }
                [Console]::WriteLine($line)
            }
        }
        [Console]::WriteLine((@{startupSnapshot=$true;source=$request.source} | ConvertTo-Json -Compress))
    } else {
        if ($null -eq $run) { throw 'Existing Run key required' }
        if ($request.action -eq 'disable') {
            if (!(Matches (Read-Exact $run $request.name))) { throw 'Stale snapshot' }
            if ($null -eq $backup) { $backup = $root.CreateSubKey($backupPath) }
            $existing = Read-Exact $backup $request.name
            if ($null -ne $existing -and !(Matches $existing)) { throw 'Backup conflict; no overwrite' }
            # Reuse an identical backup without writing it. Registry compare/write is not atomic against external processes.
            if ($null -eq $existing) { $backup.SetValue($request.name, $request.value, ([Enum]::Parse([Microsoft.Win32.RegistryValueKind], $request.kind))); $backup.Flush() }
            if (!(Matches (Read-Exact $backup $request.name)) -or !(Matches (Read-Exact $run $request.name))) { throw 'Changed during backup' }
            $run.DeleteValue($request.name, $true); $run.Flush()
            if ($null -ne (Read-Exact $run $request.name) -or !(Matches (Read-Exact $backup $request.name))) { throw 'Unverified removal or backup' }
        } elseif ($request.action -eq 'restore') {
            if (!(Matches (Read-Exact $backup $request.name)) -or $null -ne (Read-Exact $run $request.name)) { throw 'Restore conflict' }
            $run.SetValue($request.name, $request.value, ([Enum]::Parse([Microsoft.Win32.RegistryValueKind], $request.kind))); $run.Flush()
            if (!(Matches (Read-Exact $run $request.name))) { throw 'Unverified restore' }
            # Retain the backup deliberately; do not automatically retry, roll back, or delete recovery data.
        }
        [Console]::WriteLine((@{ verified = $true; action=$request.action; source=$request.source; name=$request.name } | ConvertTo-Json -Compress))
    }
} finally { if ($run) { $run.Dispose() }; if ($backup) { $backup.Dispose() }; $root.Dispose() }
