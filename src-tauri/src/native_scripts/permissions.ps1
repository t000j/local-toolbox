$acl = Get-Acl -LiteralPath $env:TOOLBOX_PATH
$rules = @($acl.Access | Select-Object -First 500 | ForEach-Object {
  [pscustomobject]@{identity=$_.IdentityReference.Value; rights=$_.FileSystemRights.ToString(); type=$_.AccessControlType.ToString(); inherited=$_.IsInherited; inheritance=$_.InheritanceFlags.ToString(); propagation=$_.PropagationFlags.ToString()}
})
ConvertTo-Json -InputObject @{path=$env:TOOLBOX_PATH; owner=$acl.Owner; group=$acl.Group; inheritanceProtected=$acl.AreAccessRulesProtected; rules=$rules; truncated=(@($acl.Access).Count -gt 500)} -Compress -Depth 4
