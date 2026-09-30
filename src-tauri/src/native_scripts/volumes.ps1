$volumes = @(Get-CimInstance -ClassName Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object {
  [pscustomobject]@{drive=$_.DeviceID; name=$_.VolumeName; totalBytes=[double]$_.Size; freeBytes=[double]$_.FreeSpace; fileSystem=$_.FileSystem}
})
ConvertTo-Json -InputObject $volumes -Compress -Depth 3
