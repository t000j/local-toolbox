# Never expand values, log them, evaluate them, or read process environment blocks.
function Sensitive-Name($name) { return $name -match '(?i)(password|passwd|secret|token|credential|private|api.?key|access.?key|auth|cookie)' }
function Protected-Name($name) { return $name -match '(?i)^(path|pathext|comspec|systemroot|windir|psmodulepath|powershell.*|__.*|.*proxy|node_options|python.*|java.*|dotnet.*|cor_.*|openssl.*|ssl_.*|git_.*)$' }
$roots = @(); $keys = @()
try {
    $userRoot = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryView]::Registry64)
    $roots += $userRoot
    $userKey = $userRoot.OpenSubKey('Environment', $request.action -eq 'edit'); $keys += $userKey
    if ($request.action -eq 'edit') {
        if ($request.confirmed -ne $true -or (Sensitive-Name $request.name) -or (Protected-Name $request.name) -or !$userKey) { throw 'Not editable' }
        if (!(@($userKey.GetValueNames()) -contains $request.name)) { throw 'Missing existing variable' }
        $kind = $userKey.GetValueKind($request.name).ToString()
        $old = $userKey.GetValue($request.name, '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        if ($kind -cne $request.kind -or $old -cne $request.value -or $request.newValue.Length -eq 0 -or $request.newValue.Length -gt 8192) { throw 'Stale or invalid value' }
        $userKey.SetValue($request.name, $request.newValue, ([Enum]::Parse([Microsoft.Win32.RegistryValueKind], $kind)))
        $userKey.Flush()
        $actual = $userKey.GetValue($request.name, '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        if ($actual -cne $request.newValue -or $userKey.GetValueKind($request.name).ToString() -cne $kind) { throw 'Unverified write' }
        [Console]::WriteLine('{"verified":true}')
    } elseif ($request.action -eq 'list') {
        $systemRoot = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, [Microsoft.Win32.RegistryView]::Registry64)
        $roots += $systemRoot
        $systemKey = $systemRoot.OpenSubKey('SYSTEM\CurrentControlSet\Control\Session Manager\Environment', $false); $keys += $systemKey
        $count = 0
        foreach ($source in @(@{ key = $userKey; scope = '用户 HKCU Environment' }, @{ key = $systemKey; scope = '系统 HKLM Environment（只读）' })) {
            if (!$source.key) { continue }
            foreach ($name in $source.key.GetValueNames()) {
                if ($count -ge 500) { [Console]::WriteLine('{"limited":true}'); break }
                if (!$name -or $name.Length -gt 256) { [Console]::WriteLine('{"limited":true}'); continue }
                $action = ''; $state = '只读'; $kind = $source.key.GetValueKind($name).ToString()
                if ($kind -notin @('String', 'ExpandString')) { [Console]::WriteLine('{"limited":true}'); continue }
                if (Sensitive-Name $name) { $value = '[敏感名称：未读取内容]'; $state = '内容已隐藏' }
                else {
                    $value = $source.key.GetValue($name, '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
                    if ($value.Length -gt 8192) { [Console]::WriteLine('{"limited":true}'); continue }
                    if ($source.scope -eq '用户 HKCU Environment' -and !(Protected-Name $name)) { $action = 'edit'; $state = '可预览修改' }
                }
                [Console]::WriteLine((@{ name = $name; value = $value; kind = $kind; scope = $source.scope; state = $state; action = $action } | ConvertTo-Json -Compress))
                $count++
            }
        }
    } else { throw 'Invalid action' }
} finally { foreach ($key in $keys) { if ($key) { $key.Dispose() } }; foreach ($root in $roots) { $root.Dispose() } }
