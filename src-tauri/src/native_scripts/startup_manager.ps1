# Only explicit HKCU Registry64 Run and this application's backup. Never execute values.
$root = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryView]::Registry64)
$runPath = 'Software\Microsoft\Windows\CurrentVersion\Run'
$backupPath = 'Software\LocalToolbox\StartupBackup'
$run = $null; $backup = $null
function Read-Exact($key, $name) {
    if ($null -eq $key -or !(@($key.GetValueNames()) -contains $name)) { return $null }
    $kind = $key.GetValueKind($name).ToString()
    if ($kind -notin @('String', 'ExpandString')) { return @{ kind = $kind; value = '' } }
    return @{ kind = $kind; value = $key.GetValue($name, '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) }
}
function Matches($value) {
    return $null -ne $value -and $value.kind -ceq $request.kind -and $value.value -ceq $request.value
}
try {
    $write = $request.action -ne 'list'
    $run = $root.OpenSubKey($runPath, $write)
    $backup = $root.OpenSubKey($backupPath, $write)
    if (!$write) {
        $count = 0
        foreach ($source in @(@{ key = $run; scope = 'HKCU Run (64-bit)' }, @{ key = $backup; scope = 'LocalToolbox 备份 (64-bit)' })) {
            if ($null -eq $source.key) { continue }
            foreach ($name in $source.key.GetValueNames()) {
                if ($count -ge 500) { [Console]::WriteLine('{"limited":true}'); break }
                $item = Read-Exact $source.key $name
                if ($name.Length -gt 256 -or $name.Length -eq 0 -or $item.value.Length -gt 8192 -or $item.kind -notin @('String', 'ExpandString')) {
                    [Console]::WriteLine('{"limited":true}'); continue
                }
                $action = 'disable'; $state = '启用'
                if ($source.scope -ne 'HKCU Run (64-bit)') {
                    $action = 'restore'; $state = '可恢复'
                    if ($null -ne (Read-Exact $run $name)) { $action = ''; $state = '备份保留（目标已存在）' }
                }
                [Console]::WriteLine((@{ name = $name; value = $item.value; kind = $item.kind; scope = $source.scope; state = $state; action = $action } | ConvertTo-Json -Compress))
                $count++
            }
        }
    } else {
        if ($request.confirmed -ne $true -or $null -eq $run) { throw 'Confirmation or Run key missing' }
        if ($request.action -eq 'disable') {
            if (!(Matches (Read-Exact $run $request.name))) { throw 'Stale snapshot' }
            if ($null -eq $backup) { $backup = $root.CreateSubKey($backupPath) }
            $existing = Read-Exact $backup $request.name
            if ($null -ne $existing -and !(Matches $existing)) { throw 'Backup conflict; no overwrite' }
            $backup.SetValue($request.name, $request.value, ([Enum]::Parse([Microsoft.Win32.RegistryValueKind], $request.kind)))
            $backup.Flush()
            if (!(Matches (Read-Exact $backup $request.name)) -or !(Matches (Read-Exact $run $request.name))) { throw 'Changed during backup' }
            $run.DeleteValue($request.name, $true); $run.Flush()
            if ($null -ne (Read-Exact $run $request.name)) { throw 'Unverified removal' }
        } elseif ($request.action -eq 'restore') {
            if (!(Matches (Read-Exact $backup $request.name)) -or $null -ne (Read-Exact $run $request.name)) { throw 'Restore conflict' }
            $run.SetValue($request.name, $request.value, ([Enum]::Parse([Microsoft.Win32.RegistryValueKind], $request.kind))); $run.Flush()
            if (!(Matches (Read-Exact $run $request.name))) { throw 'Unverified restore' }
            # Retain the backup deliberately: a failed final cleanup must not lose recovery data.
        } else { throw 'Invalid action' }
        [Console]::WriteLine('{"verified":true}')
    }
} finally { if ($run) { $run.Dispose() }; if ($backup) { $backup.Dispose() }; $root.Dispose() }
