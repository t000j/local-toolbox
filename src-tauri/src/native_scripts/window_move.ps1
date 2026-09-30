$window = [IntPtr]::new([int64]$env:TOOLBOX_HANDLE)
$expected = $env:TOOLBOX_RECT | ConvertFrom-Json
$x = [int]$env:TOOLBOX_X; $y = [int]$env:TOOLBOX_Y
function Assert-Window {
  [uint32]$ownerId = 0
  [void][ToolboxWindowApi]::GetWindowThreadProcessId($window, [ref]$ownerId)
  if (-not [ToolboxWindowApi]::IsWindow($window) -or -not [ToolboxWindowApi]::IsWindowVisible($window) -or
      $window -eq [ToolboxWindowApi]::GetShellWindow() -or $window -eq [ToolboxWindowApi]::GetDesktopWindow() -or
      $ownerId -ne [uint32]$env:TOOLBOX_OWNER -or [ToolboxWindowApi]::Title($window) -cne $env:TOOLBOX_TITLE -or
      [ToolboxWindowApi]::IsIconic($window) -or [ToolboxWindowApi]::IsZoomed($window)) {
    throw '窗口已变化、关闭或不是普通窗口，请刷新。'
  }
}
function Read-Rect {
  $rect = [ToolboxWindowApi+Rect]::new()
  if (-not [ToolboxWindowApi]::GetWindowRect($window, [ref]$rect)) { throw '读取窗口位置失败。' }
  return $rect
}
Assert-Window
$old = Read-Rect
if ($old.Left -ne $expected.left -or $old.Top -ne $expected.top -or
    $old.Right -ne $expected.right -or $old.Bottom -ne $expected.bottom) { throw '窗口位置或尺寸已变化，请重新预览。' }
$target = [ToolboxWindowApi+Rect]::new()
$target.Left = $x; $target.Top = $y
$target.Right = $x + ($old.Right - $old.Left); $target.Bottom = $y + ($old.Bottom - $old.Top)
$hasVisibleTop = $false
foreach ($work in [ToolboxWindowApi]::MonitorWorkAreas()) {
  if ([ToolboxWindowApi]::HasVisibleTopStrip($target, $work)) { $hasVisibleTop = $true; break }
}
if (-not $hasVisibleTop) {
  throw '请保留至少 64 像素宽及顶部 32 像素在显示器工作区内，以便再次拖动窗口。'
}
Assert-Window
$check = Read-Rect
if ($check.Left -ne $old.Left -or $check.Top -ne $old.Top -or
    $check.Right -ne $old.Right -or $check.Bottom -ne $old.Bottom) { throw '窗口位置已变化，请重新预览。' }
# SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE: do not resize, reorder, or focus.
if (-not [ToolboxWindowApi]::SetWindowPos($window, [IntPtr]::Zero, $x, $y, 0, 0, 21)) {
  throw '移动失败，目标应用可能拒绝控制；不会自动提权或重试。'
}
Assert-Window
$after = Read-Rect
if ($after.Left -ne $x -or $after.Top -ne $y -or
    ($after.Right - $after.Left) -ne ($old.Right - $old.Left) -or
    ($after.Bottom - $after.Top) -ne ($old.Bottom - $old.Top)) {
  throw '已请求移动，但实际位置或尺寸不同，请刷新查看；不会自动重试或回滚。'
}
ConvertTo-Json -InputObject @{verified=$true; left=$after.Left; top=$after.Top} -Compress
