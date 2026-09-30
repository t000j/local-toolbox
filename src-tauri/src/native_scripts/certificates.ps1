$path = 'Cert:\' + $env:TOOLBOX_SCOPE + '\' + $env:TOOLBOX_STORE
$certificates = @(Get-ChildItem -Path $path | Select-Object -First 1001)
$items = @($certificates | Select-Object -First 1000 | ForEach-Object {
  [pscustomobject]@{subject=$_.Subject; issuer=$_.Issuer; thumbprint=$_.Thumbprint; notBefore=$_.NotBefore.ToUniversalTime().ToString('o'); notAfter=$_.NotAfter.ToUniversalTime().ToString('o'); hasPrivateKey=$_.HasPrivateKey; friendlyName=$_.FriendlyName; serialNumber=$_.SerialNumber}
})
ConvertTo-Json -InputObject @{items=$items; truncated=($certificates.Count -gt 1000)} -Compress -Depth 4
