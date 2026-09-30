$window = [IntPtr]::new([int64]$env:TOOLBOX_HANDLE)
if ($window -eq [ToolboxWindowApi]::GetShellWindow() -or $window -eq [ToolboxWindowApi]::GetDesktopWindow()) { throw '系统桌面窗口不支持此操作。' }
[uint32]$ownerId = 0
[void][ToolboxWindowApi]::GetWindowThreadProcessId($window, [ref]$ownerId)
if (-not [ToolboxWindowApi]::IsWindow($window) -or $ownerId -ne [uint32]$env:TOOLBOX_OWNER -or [ToolboxWindowApi]::Title($window) -cne $env:TOOLBOX_TITLE) { throw '窗口已变化或关闭，请刷新后重试。' }
switch ($env:TOOLBOX_ACTION) {
  'pin' { if (-not [ToolboxWindowApi]::SetWindowPos($window, [IntPtr]::new(-1), 0, 0, 0, 0, 19)) { throw '置顶失败，目标窗口可能需要更高权限。' } }
  'unpin' { if (-not [ToolboxWindowApi]::SetWindowPos($window, [IntPtr]::new(-2), 0, 0, 0, 0, 19)) { throw '取消置顶失败。' } }
  'minimize' { [void][ToolboxWindowApi]::ShowWindowAsync($window, 6) }
  'maximize' { [void][ToolboxWindowApi]::ShowWindowAsync($window, 3) }
  'restore' { [void][ToolboxWindowApi]::ShowWindowAsync($window, 9) }
  'close' { if (-not [ToolboxWindowApi]::PostMessage($window, 16, [IntPtr]::Zero, [IntPtr]::Zero)) { throw '无法向窗口发送关闭请求。' } }
  default { throw '不支持此窗口操作。' }
}
ConvertTo-Json -InputObject @{requested=$true} -Compress
