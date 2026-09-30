# Effective ActiveStore rules only. No rule, profile or security-setting mutation.
$count = 0
Get-NetFirewallRule -PolicyStore ActiveStore -ErrorAction Stop | Select-Object -First 1001 | ForEach-Object {
    if ($count -ge 1000) { [Console]::WriteLine('{"limited":true}'); return }
    $rule = $_; $detail = ''; $incomplete = $false
    try {
        $port = @($rule | Get-NetFirewallPortFilter -ErrorAction Stop)
        $address = @($rule | Get-NetFirewallAddressFilter -ErrorAction Stop)
        $app = @($rule | Get-NetFirewallApplicationFilter -ErrorAction Stop)
        $service = @($rule | Get-NetFirewallServiceFilter -ErrorAction Stop)
        $detail = (@{ ports = @($port | Select-Object Protocol, LocalPort, RemotePort)
            addresses = @($address | Select-Object LocalAddress, RemoteAddress)
            applications = @($app | Select-Object Program, Package)
            services = @($service | Select-Object Service) } | ConvertTo-Json -Compress -Depth 6)
        if ($detail.Length -gt 8192) { $detail = '筛选详情超过 8192 字符，未显示'; $incomplete = $true }
    } catch { $detail = '筛选详情无权限或不可读'; $incomplete = $true }
    [Console]::WriteLine((@{ name = [string]$rule.Name; displayName = [string]$rule.DisplayName
        direction = [string]$rule.Direction; action = [string]$rule.Action; enabled = [string]$rule.Enabled
        profile = [string]$rule.Profile; source = [string]$rule.PolicyStoreSourceType
        detail = $detail; incomplete = $incomplete } | ConvertTo-Json -Compress -Depth 3))
    $count++
}
