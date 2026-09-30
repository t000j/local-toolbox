# Read only. Never query command lines, credentials, paths, environment or modules.
$processes = [Diagnostics.Process]::GetProcesses()
$count = 0
try {
    foreach ($process in $processes) {
        if ($count -ge 2000) { [Console]::WriteLine('{"limited":true}'); break }
        $processId = $null; $name = $null; $memory = $null; $cpu = $null
        try { $processId = $process.Id; $name = $process.ProcessName } catch { continue }
        if ($name.Length -gt 128) { $name = $name.Substring(0, 128) }
        try { $memory = $process.WorkingSet64 } catch { }
        try { $cpu = [Math]::Round($process.TotalProcessorTime.TotalSeconds, 3) } catch { }
        $row = [ordered]@{ pid = $processId; name = $name; memoryBytes = $memory; cpuSeconds = $cpu }
        [Console]::WriteLine(($row | ConvertTo-Json -Compress))
        $count++
    }
} finally {
    foreach ($process in $processes) { $process.Dispose() }
}
