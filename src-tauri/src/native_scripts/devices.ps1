function Read-DeviceText($value) {
  if ($null -eq $value) { return '' }
  $text = ([string]$value).Trim()
  if ($text.Length -gt 1024) { return $text.Substring(0, 1024) }
  return $text
}

function Read-DriverDate($value) {
  if ($null -eq $value) { return '' }
  if ($value -is [datetime]) { return $value.ToString('yyyy-MM-dd') }
  try { return [Management.ManagementDateTimeConverter]::ToDateTime([string]$value).ToString('yyyy-MM-dd') } catch { return '' }
}

$devices = @(Get-CimInstance -ClassName Win32_PnPEntity -Property DeviceID,Name,PNPClass,Manufacturer,Status,ConfigManagerErrorCode,Present | Select-Object -First 2001)
$drivers = @{}
$warnings = [Collections.Generic.List[string]]::new()
try {
  $driverRows = @(Get-CimInstance -ClassName Win32_PnPSignedDriver -Property DeviceID,DriverProviderName,DriverVersion,DriverDate,IsSigned,Signer | Select-Object -First 5001)
  foreach ($driver in ($driverRows | Select-Object -First 5000 | Sort-Object DriverDate -Descending)) {
    if ($driver.DeviceID -and -not $drivers.ContainsKey([string]$driver.DeviceID)) { $drivers[[string]$driver.DeviceID] = $driver }
  }
  if ($driverRows.Count -gt 5000) { $warnings.Add('驱动登记信息超过 5000 条，仅匹配前 5000 条。') }
} catch { $warnings.Add('无法读取驱动登记信息，设备清单仍可查看；驱动字段显示为未提供。') }

$items = @($devices | Select-Object -First 2000 | Sort-Object PNPClass,Name | ForEach-Object {
  $device = $_
  $driver = $null
  if ($device.DeviceID) { $driver = $drivers[[string]$device.DeviceID] }
  [pscustomobject]@{
    id = Read-DeviceText $device.DeviceID; name = Read-DeviceText $device.Name; category = Read-DeviceText $device.PNPClass
    manufacturer = Read-DeviceText $device.Manufacturer; status = Read-DeviceText $device.Status
    errorCode = $(if ($null -eq $device.ConfigManagerErrorCode) { $null } else { [int]$device.ConfigManagerErrorCode })
    present = $(if ($null -eq $device.Present) { $null } else { [bool]$device.Present })
    driverVersion = Read-DeviceText $driver.DriverVersion; driverProvider = Read-DeviceText $driver.DriverProviderName
    driverDate = Read-DriverDate $driver.DriverDate; signer = Read-DeviceText $driver.Signer
    signed = $(if ($null -eq $driver.IsSigned) { $null } else { [bool]$driver.IsSigned })
  }
})
ConvertTo-Json -InputObject @{items=$items; truncated=($devices.Count -gt 2000); warnings=@($warnings.ToArray())} -Compress -Depth 4
