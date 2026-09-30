$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskKeyPath = Join-Path $taskRoot '.secrets\updater.key'
$taskPasswordPath = Join-Path $taskRoot '.secrets\updater-password.txt'
if (-not (Test-Path -LiteralPath $taskKeyPath) -or -not (Test-Path -LiteralPath $taskPasswordPath)) { throw '缺少本机更新签名密钥或密码。请按 docs/RELEASING.md 配置，保留现有公钥对应的私钥。' }
$taskOldKey = $env:TAURI_SIGNING_PRIVATE_KEY
$taskOldPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
Push-Location $taskRoot
try {
  $env:TAURI_SIGNING_PRIVATE_KEY = $taskKeyPath
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [System.IO.File]::ReadAllText($taskPasswordPath).TrimEnd("`r", "`n")
  & node scripts/check-release.mjs
  if ($LASTEXITCODE -ne 0) { throw '发布配置校验未通过。' }
  & npm run tauri build -- --target x86_64-pc-windows-msvc
  if ($LASTEXITCODE -ne 0) { throw '安装包构建失败。' }
} finally {
  $env:TAURI_SIGNING_PRIVATE_KEY = $taskOldKey
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $taskOldPassword
  Pop-Location
}
