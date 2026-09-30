# Never expand values, log them, evaluate them, or read process environment blocks.
# Keep the policy patterns identical to environmentManager.ts; the native script is authoritative.
function Sensitive-Name($name) { return $name -match '(?i)(password|passwd|secret|token|credential|private|api.?key|access.?key|auth|cookie)' }
function Protected-Name($name) { return $name -match '(?i)^(path|pathext|comspec|systemroot|windir|psmodulepath|powershell.*|__.*|.*proxy|node_.*|npm_.*|python.*|java.*|jdk_.*|_java.*|dotnet.*|coreclr.*|cor_.*|complus.*|openssl.*|ssl_.*|git_.*|ssh_.*|gpg_.*|gnupg.*|ld_.*|dyld_.*|bash_env|env|shell|zsh.*|ruby.*|gem_.*|perl.*|lua.*|r_home|r_profile.*|r_environ.*|curl_ca_bundle|requests_ca_bundle|kubeconfig|docker_.*|cargo_.*|rust.*|cl|_cl_|link|_link_|include|lib|libpath|home|homedrive|homepath|userprofile|appdata|localappdata|programdata|programfiles.*|commonprogramfiles.*|temp|tmp|username|userdomain|userdnsdomain|computername|logonserver|os|processor_.*|number_of_processors|allusersprofile|public)$' }
function Editable-Name($name) { return $name -cmatch '\A[A-Za-z_][A-Za-z0-9_]{0,255}\z' -and !(Sensitive-Name $name) -and !(Protected-Name $name) }
function Valid-Value($value) {
    if ($value -isnot [string] -or $value.Length -gt 8192 -or $value.Contains([string][char]0)) { return $false }
    # Reject unpaired UTF-16 surrogates rather than silently replacing them during JSON transport.
    try { [void]([Text.UTF8Encoding]::new($false, $true)).GetByteCount($value); return $true } catch { return $false }
}
$roots = @(); $keys = @()
try {
    $mutation = $request.action -in @('add', 'edit', 'delete')
    if ($request.action -ne 'list' -and !$mutation) { throw 'Invalid action' }
    if ($mutation) {
        if ($request.confirmed -ne $true -or $request.scope -cne '用户 HKCU Environment' -or !(Editable-Name $request.name)
            -or $request.kind -cnotin @('String', 'ExpandString') -or !(Valid-Value $request.value) -or !(Valid-Value $request.newValue)) { throw 'Not editable' }
        if (($request.action -eq 'add' -and ($request.expected -cne 'absent' -or $request.value -cne ''))
            -or ($request.action -ne 'add' -and $request.expected -cne 'present')
            -or ($request.action -eq 'delete' -and $request.newValue -cne '')
            -or ($request.action -eq 'edit' -and $request.value -ceq $request.newValue)) { throw 'Invalid expected state' }
    }
    $userRoot = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryView]::Registry64)
    $roots += $userRoot
    $userKey = $userRoot.OpenSubKey('Environment', $mutation); $keys += $userKey
    if ($mutation) {
        # Creating the ordinary HKCU Environment key is only needed for the first user variable.
        # No permissions are changed, and no system registry key is opened writable.
        if (!$userKey) {
            if ($request.action -ne 'add') { throw 'Missing existing variable' }
            $userKey = $userRoot.CreateSubKey('Environment', $true); $keys += $userKey
            if (!$userKey) { throw 'Cannot open user environment' }
        }
        $exists = @($userKey.GetValueNames()) -contains $request.name
        if ($request.action -eq 'add') {
            if ($exists) { throw 'Add conflict; no overwrite' }
            $kind = $request.kind
        } else {
            if (!$exists) { throw 'Missing existing variable' }
            $kind = $userKey.GetValueKind($request.name).ToString()
            $old = $userKey.GetValue($request.name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
            if ($kind -cne $request.kind -or $old -isnot [string] -or $old -cne $request.value) { throw 'Stale value or kind' }
        }
        # This compare/write is not atomic against other programs. Never retry or rollback automatically.
        if ($request.action -eq 'delete') { $userKey.DeleteValue($request.name, $true) }
        else { $userKey.SetValue($request.name, $request.newValue, ([Enum]::Parse([Microsoft.Win32.RegistryValueKind], $kind))) }
        $userKey.Flush()
        $existsAfter = @($userKey.GetValueNames()) -contains $request.name
        if ($request.action -eq 'delete') {
            if ($existsAfter) { throw 'Unverified deletion' }
        } else {
            if (!$existsAfter) { throw 'Unverified write' }
            $actual = $userKey.GetValue($request.name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
            if ($actual -isnot [string] -or $actual -cne $request.newValue -or $userKey.GetValueKind($request.name).ToString() -cne $kind) { throw 'Unverified write' }
        }
        [Console]::WriteLine((@{ verified = $true; action = $request.action; name = $request.name; scope = $request.scope } | ConvertTo-Json -Compress))
    } else {
        $systemRoot = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, [Microsoft.Win32.RegistryView]::Registry64)
        $roots += $systemRoot
        $systemKey = $systemRoot.OpenSubKey('SYSTEM\CurrentControlSet\Control\Session Manager\Environment', $false); $keys += $systemKey
        if (!$systemKey) { [Console]::WriteLine('{"limited":true}') }
        $count = 0
        foreach ($source in @(@{ key = $userKey; scope = '用户 HKCU Environment' }, @{ key = $systemKey; scope = '系统 HKLM Environment（只读）' })) {
            if (!$source.key) { continue }
            foreach ($name in $source.key.GetValueNames()) {
                if ($count -ge 500) { [Console]::WriteLine('{"limited":true}'); break }; $count++
                if (!$name -or $name.Length -gt 256 -or $name -match '[\x00-\x1f\x7f=]') { [Console]::WriteLine('{"limited":true}'); continue }
                $action = ''; $state = '只读'; $kind = $source.key.GetValueKind($name).ToString()
                if ($kind -notin @('String', 'ExpandString')) { [Console]::WriteLine('{"limited":true}'); continue }
                if (Sensitive-Name $name) { $value = '[敏感名称：未读取内容]'; $state = '内容已隐藏' }
                else {
                    $value = $source.key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
                    if (!(Valid-Value $value)) { [Console]::WriteLine('{"limited":true}'); continue }
                    if ($source.scope -eq '用户 HKCU Environment' -and (Editable-Name $name)) { $action = 'edit'; $state = '可预览修改' }
                }
                [Console]::WriteLine((@{ name = $name; value = $value; kind = $kind; scope = $source.scope; state = $state; action = $action } | ConvertTo-Json -Compress))
            }
        }
        # Even a zero-row snapshot needs this terminal marker before the UI permits add.
        [Console]::WriteLine('{"environmentSnapshot":true}')
    }
} finally { foreach ($key in $keys) { if ($key) { $key.Dispose() } }; foreach ($root in $roots) { $root.Dispose() } }
