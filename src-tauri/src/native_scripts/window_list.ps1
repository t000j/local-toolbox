$items = [System.Collections.Generic.List[object]]::new()
$callback = [ToolboxWindowApi+EnumProc] {
  param($window, $parameter)
  if ([ToolboxWindowApi]::IsWindowVisible($window) -and $window -ne [ToolboxWindowApi]::GetShellWindow() -and $window -ne [ToolboxWindowApi]::GetDesktopWindow()) {
    $title = [ToolboxWindowApi]::Title($window)
    [uint32]$ownerId = 0
    [void][ToolboxWindowApi]::GetWindowThreadProcessId($window, [ref]$ownerId)
    if ($title -and $ownerId -ne [uint32]$env:TOOLBOX_OWN_PID -and $items.Count -lt 500) {
      $rect = [ToolboxWindowApi+Rect]::new()
      $hasRect = [ToolboxWindowApi]::GetWindowRect($window, [ref]$rect)
      $position = if ($hasRect) { @{left=$rect.Left; top=$rect.Top; right=$rect.Right; bottom=$rect.Bottom} } else { $null }
      $name = '未知进程'
      try { $name = [System.Diagnostics.Process]::GetProcessById($ownerId).ProcessName } catch {}
      $items.Add([pscustomobject]@{rect=$position; handle=$window.ToInt64(); processId=$ownerId; title=$title; processName=$name; topMost=[ToolboxWindowApi]::TopMost($window); minimized=[ToolboxWindowApi]::IsIconic($window); maximized=[ToolboxWindowApi]::IsZoomed($window)})
    }
  }
  return $true
}
[void][ToolboxWindowApi]::EnumWindows($callback, [IntPtr]::Zero)
ConvertTo-Json -InputObject @($items.ToArray()) -Compress -Depth 4
