$sources = @(
  @{path='HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'; scope='全部用户（64 位）'},
  @{path='HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'; scope='全部用户（32 位）'},
  @{path='HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'; scope='当前用户'}
)
$items = [System.Collections.Generic.List[object]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
foreach ($source in $sources) {
  foreach ($key in @(Get-ChildItem -LiteralPath $source.path -ErrorAction SilentlyContinue)) {
    $entry = Get-ItemProperty -LiteralPath $key.PSPath -ErrorAction SilentlyContinue
    if ($entry.DisplayName -and $entry.SystemComponent -ne 1) {
      $items.Add([pscustomobject]@{id=$key.PSPath; name=[string]$entry.DisplayName; version=[string]$entry.DisplayVersion; publisher=[string]$entry.Publisher; installDate=[string]$entry.InstallDate; location=[string]$entry.InstallLocation; scope=$source.scope})
    }
  }
}
try {
  foreach ($package in @(Get-AppxPackage | Where-Object { -not $_.IsFramework })) {
    $items.Add([pscustomobject]@{id=$package.PackageFullName; name=$package.Name; version=$package.Version.ToString(); publisher=$package.Publisher; installDate=''; location=$package.InstallLocation; scope='当前用户（商店应用）'})
  }
} catch { $warnings.Add('当前用户商店应用未能读取。') }
$sorted = @($items | Sort-Object name, version, scope | Select-Object -First 5000)
ConvertTo-Json -InputObject @{items=$sorted; truncated=($items.Count -gt 5000); warnings=@($warnings.ToArray())} -Compress -Depth 4
