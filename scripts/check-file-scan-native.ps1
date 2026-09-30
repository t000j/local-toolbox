# Windows-only synthetic fixtures. Never scans the user's existing directories.
# Run explicitly: powershell -NoProfile -File scripts/check-file-scan-native.ps1
$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot '..\src-tauri\src\native_scripts\file_scan.ps1'
$sandbox = Join-Path ([IO.Path]::GetTempPath()) ('local-toolbox-scan-test-' + [Guid]::NewGuid().ToString('N'))
$root = Join-Path $sandbox 'selected'
$outside = Join-Path $sandbox 'outside'
$junction = Join-Path $root 'junction'
$originalOut = [Console]::Out
$utf8 = New-Object Text.UTF8Encoding($false)
function Assert-Scan($condition, [string]$message) {
    if (-not $condition) { throw "Synthetic scanner assertion failed: $message" }
}
function New-Query([string]$mode) {
    return @{ root=$root; mode=$mode; name=''; extension=''; minBytes=$null; maxBytes=$null; afterMs=$null; beforeMs=$null }
}
function Read-Scan($query, [switch]$First) {
    $writer = New-Object IO.StringWriter
    [Console]::SetOut($writer)
    try {
        if ($First) { $request = [PSCustomObject]$query; & $scriptPath }
        else { [BoundedFileScan]::Run(($query | ConvertTo-Json -Compress)) }
        $lines = @($writer.ToString().Split([char]10) | Where-Object { $_.Trim() } | ForEach-Object { $_ | ConvertFrom-Json })
        Assert-Scan ($lines.Count -ge 1 -and $lines[-1].summary) 'final summary must be present'
        Assert-Scan ([Text.Encoding]::UTF8.GetByteCount($writer.ToString()) -le 65536) 'output must fit capture budget'
        return @{ rows=@($lines | Where-Object { -not $_.summary }); summary=$lines[-1] }
    } finally { [Console]::SetOut($originalOut); $writer.Dispose() }
}
try {
    [void][IO.Directory]::CreateDirectory($root)
    [void][IO.Directory]::CreateDirectory((Join-Path $root 'nested'))
    [void][IO.Directory]::CreateDirectory((Join-Path $outside 'nested'))
    [IO.File]::WriteAllText((Join-Path $root 'alpha.txt'), 'same', $utf8)
    [IO.File]::WriteAllText((Join-Path $root 'beta.txt'), 'same', $utf8)
    [IO.File]::WriteAllText((Join-Path $root 'gamma.txt'), 'diff', $utf8)
    [IO.File]::WriteAllText((Join-Path $root 'zero-a.bin'), '', $utf8)
    [IO.File]::WriteAllText((Join-Path $root 'zero-b.bin'), '', $utf8)
    [IO.File]::WriteAllText((Join-Path $root 'nested\delta.log'), 'same', $utf8)
    [IO.File]::WriteAllText((Join-Path $outside 'leak.txt'), 'same', $utf8)
    [IO.File]::WriteAllText((Join-Path $outside 'nested\leak.txt'), 'same', $utf8)
    [void](New-Item -ItemType Junction -Path $junction -Target $outside)

    $q = New-Query 'search'; $q.name='ALPHA'; $q.extension='txt'; $q.minBytes=4; $q.maxBytes=4
    $r = Read-Scan $q -First
    Assert-Scan (-not $r.summary.failed) 'plain local fixture must open'
    Assert-Scan ($r.rows.Count -eq 1 -and $r.rows[0].name -eq 'alpha.txt') 'literal case-insensitive filters'
    Assert-Scan ($null -eq $r.rows[0].hash -and $r.rows[0].bytes -eq 4) 'search returns metadata only'
    Assert-Scan ($r.summary.skipped -ge 1) 'junction is skipped'

    $q = New-Query 'tree'
    $r = Read-Scan $q
    Assert-Scan (@($r.rows | Where-Object { $_.name -eq 'nested' -and $_.kind -eq 'directory' }).Count -eq 1) 'tree includes directories'
    Assert-Scan (@($r.rows | Where-Object { $_.kind -eq 'file' }).Count -eq 6) 'tree includes files'
    Assert-Scan (@($r.rows | Where-Object { $_.path -like '*leak*' }).Count -eq 0) 'tree cannot follow junctions'

    $q = New-Query 'duplicates'; $q.extension='txt'
    $r = Read-Scan $q
    Assert-Scan ($r.rows.Count -eq 3) 'size group hashes each ordinary matching file'
    Assert-Scan (@($r.rows | Where-Object { $_.path -like '*leak*' }).Count -eq 0) 'junction target never traversed'
    $sameRows = @($r.rows | Where-Object { $_.name -eq 'alpha.txt' -or $_.name -eq 'beta.txt' })
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $expected = [BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes('same'))).Replace('-','').ToLowerInvariant() }
    finally { $sha.Dispose() }
    Assert-Scan ($sameRows.Count -eq 2 -and $sameRows[0].hash -eq $expected -and $sameRows[1].hash -eq $expected) 'real SHA-256 content equality'
    Assert-Scan (($r.rows | Where-Object { $_.name -eq 'gamma.txt' }).hash -ne $expected) 'equal size does not imply equal hash'

    $q = New-Query 'duplicates'; $q.extension='bin'
    $r = Read-Scan $q
    Assert-Scan ($r.rows.Count -eq 2 -and $r.rows[0].hash -eq 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') 'empty-file hash'
    $q = New-Query 'search'; $q.afterMs=253402300799999
    $r = Read-Scan $q
    Assert-Scan ($r.rows.Count -eq 0) 'inclusive modified-time filtering'
    foreach ($unsafeRoot in @($junction, (Join-Path $junction 'nested'))) {
        $q = New-Query 'search'; $q.root=$unsafeRoot
        $r = Read-Scan $q
        Assert-Scan ($r.summary.failed -and $r.rows.Count -eq 0) 'root and ancestor junction must fail closed'
    }
    Write-Host 'Synthetic Windows scanner fixtures passed.'
} finally {
    [Console]::SetOut($originalOut)
    # Remove only the synthetic junction itself before recursive fixture cleanup.
    if ([IO.Directory]::Exists($junction)) { [IO.Directory]::Delete($junction) }
    if ([IO.Directory]::Exists($sandbox)) { [IO.Directory]::Delete($sandbox, $true) }
}
