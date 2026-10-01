# Inputs are native-validated JSON, never executable code. No DNS, ports or MAC lookups.
function To-Number([Net.IPAddress]$address) {
    $b = $address.GetAddressBytes()
    return [uint64]$b[0] * 16777216 + [uint64]$b[1] * 65536 + [uint64]$b[2] * 256 + $b[3]
}
function To-Address([uint64]$number) {
    return '{0}.{1}.{2}.{3}' -f (($number -shr 24) -band 255), (($number -shr 16) -band 255), (($number -shr 8) -band 255), ($number -band 255)
}
$parts = $request.cidr.Split('/')
$network = To-Number ([Net.IPAddress]::Parse($parts[0]))
$size = [uint64][Math]::Pow(2, (32 - [int]$parts[1]))
$last = $network + $size - 1
$localMatch = $false
foreach ($adapter in [Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
    if ($adapter.OperationalStatus -ne 'Up' -or $adapter.NetworkInterfaceType -notin @('Ethernet', 'Wireless80211')) { continue }
    foreach ($address in $adapter.GetIPProperties().UnicastAddresses) {
        if ($address.Address.AddressFamily -ne 'InterNetwork') { continue }
        $local = To-Number $address.Address
        $mask = To-Number $address.IPv4Mask
        # Reject unknown masks. Both ends must belong to a currently connected local subnet.
        if ($mask -eq 0) { continue }
        $base = $local -band $mask
        if (($network -band $mask) -eq $base -and ($last -band $mask) -eq $base) { $localMatch = $true }
    }
}
if (-not $localMatch) {
    [Console]::WriteLine('Rejected: range must be inside a connected Ethernet/Wi-Fi IPv4 subnet. No packets sent.')
    exit 2
}
[Console]::WriteLine('IP address | ICMP result | round-trip ms (only Success confirms a reply)')
$timer = [Diagnostics.Stopwatch]::StartNew()
$ping = [Net.NetworkInformation.Ping]::new()
try {
    for ($hostNumber = $network + 1; $hostNumber -lt $last; $hostNumber++) {
        if ($timer.Elapsed.TotalSeconds -ge 35) { [Console]::WriteLine('Stopped at internal 35 second limit.'); exit 3 }
        $ip = To-Address $hostNumber
        try {
            $reply = $ping.Send([Net.IPAddress]::Parse($ip), 500, [byte[]]@(0), [Net.NetworkInformation.PingOptions]::new(1, $false))
            if ($reply.Status -eq 'Success' -and $reply.Address.ToString() -eq $ip) {
                [Console]::WriteLine('{0} | Success | {1}' -f $ip, $reply.RoundtripTime)
            } else { [Console]::WriteLine('{0} | No confirmed reply | -' -f $ip) }
        } catch { [Console]::WriteLine('{0} | Probe unavailable | -' -f $ip) }
    }
} finally { $ping.Dispose() }
