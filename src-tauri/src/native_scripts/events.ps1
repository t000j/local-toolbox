$filter = @{LogName=$env:TOOLBOX_LOG; StartTime=(Get-Date).AddDays(-[int]$env:TOOLBOX_DAYS)}
if ([int]$env:TOOLBOX_LEVEL -gt 0) { $filter.Level = [int]$env:TOOLBOX_LEVEL }
if ($env:TOOLBOX_PROVIDER) { $filter.ProviderName = $env:TOOLBOX_PROVIDER }
try { $events = @(Get-WinEvent -FilterHashtable $filter -MaxEvents ([int]$env:TOOLBOX_LIMIT) -ErrorAction Stop) }
catch { if ($_.FullyQualifiedErrorId -like 'NoMatchingEventsFound*') { $events = @() } else { throw } }
$items = @($events | ForEach-Object {
  $detail = ''
  try { $detail = [string]$_.Message } catch { $detail = '此事件的消息模板不可用。' }
  $cut = $detail.Length -gt 4000
  if ($cut) { $detail = $detail.Substring(0, 4000) + '…（消息已截断）' }
  [pscustomobject]@{recordId=$_.RecordId; id=$_.Id; time=$_.TimeCreated.ToUniversalTime().ToString('o'); provider=$_.ProviderName; level=[int]$_.Level; levelName=$_.LevelDisplayName; message=$detail; truncated=$cut}
})
ConvertTo-Json -InputObject $items -Compress -Depth 4
