Add-Type -AssemblyName System.Windows.Forms
$power = [System.Windows.Forms.SystemInformation]::PowerStatus
$warnings = [System.Collections.Generic.List[string]]::new()
try {
  $batteries = @(Get-CimInstance -ClassName Win32_Battery | ForEach-Object {
    $runtime = $null
    $charge = $null
    if ($null -ne $_.EstimatedChargeRemaining -and $_.EstimatedChargeRemaining -le 100) { $charge = [int]$_.EstimatedChargeRemaining }
    if ($_.EstimatedRunTime -gt 0 -and $_.EstimatedRunTime -lt 1000000) { $runtime = [int]$_.EstimatedRunTime }
    [pscustomobject]@{name=$_.Name; deviceId=$_.DeviceID; charge=$charge; status=[int]$_.BatteryStatus; runtimeMinutes=$runtime}
  })
} catch { $batteries = @(); $warnings.Add($_.Exception.Message) }
$capacities = @()
try {
  $static = @(Get-CimInstance -Namespace root\wmi -ClassName BatteryStaticData)
  $full = @(Get-CimInstance -Namespace root\wmi -ClassName BatteryFullChargedCapacity)
  $capacities = @($static | ForEach-Object {
    $instance = $_.InstanceName
    $current = $full | Where-Object { $_.InstanceName -eq $instance } | Select-Object -First 1
    $health = $null
    if ($_.DesignedCapacity -gt 0 -and $current.FullChargedCapacity -gt 0) { $health = [math]::Round(100 * $current.FullChargedCapacity / $_.DesignedCapacity, 1) }
    $unit = 'mWh'
    if (($_.Capabilities -band 0x40000000) -ne 0) { $unit = '相对单位' }
    [pscustomobject]@{instance=$instance; designCapacity=$_.DesignedCapacity; fullChargeCapacity=$current.FullChargedCapacity; healthPercent=$health; unit=$unit}
  })
} catch { $warnings.Add('电池容量信息不可用。') }
$scheme = ''
try { $scheme = ((& "$env:SystemRoot\System32\powercfg.exe" /getactivescheme) -join ' ').Trim() } catch { $warnings.Add('无法读取当前电源计划。') }
ConvertTo-Json -InputObject @{acStatus=$power.PowerLineStatus.ToString(); batteryStatus=$power.BatteryChargeStatus.ToString(); batteries=$batteries; capacities=$capacities; activeScheme=$scheme; warnings=@($warnings.ToArray())} -Compress -Depth 5
