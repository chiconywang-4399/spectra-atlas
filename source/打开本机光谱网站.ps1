$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverScript = Join-Path $projectRoot "scripts\local-secure-server.mjs"
$serverBuild = Join-Path $projectRoot "dist\server\index.js"
$siteUrl = "http://localhost:4173/"

$nodeCandidates = @(
  (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"),
  (Join-Path $env:ProgramFiles "nodejs\node.exe")
)

$nodePath = $nodeCandidates |
  Where-Object { Test-Path -LiteralPath $_ } |
  Select-Object -First 1

if (-not $nodePath) {
  Write-Host ""
  Write-Host "没有找到网站运行组件，请回到 Codex 让它重新配置本机入口。" -ForegroundColor Red
  Read-Host "按回车键关闭"
  exit 1
}

if (-not (Test-Path -LiteralPath $serverBuild)) {
  Write-Host ""
  Write-Host "网站尚未完成构建，请回到 Codex 让它重新构建。" -ForegroundColor Red
  Read-Host "按回车键关闭"
  exit 1
}

Write-Host ""
Write-Host "Spectra Atlas 本机安全入口" -ForegroundColor Cyan
Write-Host "--------------------------------"
Write-Host "请设置本次运行的访问密码（至少 8 个字符）。"
Write-Host "关闭此窗口后，密码会立即失效。" -ForegroundColor DarkGray
Write-Host ""

do {
  $securePassword = Read-Host "本次访问密码" -AsSecureString
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }

  if ($plainPassword.Length -lt 8) {
    Write-Host "密码至少需要 8 个字符，请重新设置。" -ForegroundColor Yellow
  }
} while ($plainPassword.Length -lt 8)

$env:SPECTRA_LOCAL_PASSWORD = $plainPassword
$env:SPECTRA_LOCAL_PORT = "4173"
$plainPassword = $null

Write-Host ""
Write-Host "正在启动网站，浏览器将自动打开……" -ForegroundColor Green
Write-Host "如果浏览器没有自动打开，请访问：$siteUrl" -ForegroundColor DarkGray
Write-Host ""

$openBrowserJob = Start-Job -ScriptBlock {
  param($url)

  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1
      if ($response.StatusCode -eq 200) {
        Start-Process $url
        return
      }
    }
    catch {
      Start-Sleep -Milliseconds 250
    }
  }
} -ArgumentList $siteUrl

try {
  & $nodePath $serverScript
}
finally {
  Remove-Item Env:SPECTRA_LOCAL_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:SPECTRA_LOCAL_PORT -ErrorAction SilentlyContinue
  Stop-Job $openBrowserJob -ErrorAction SilentlyContinue
  Remove-Job $openBrowserJob -Force -ErrorAction SilentlyContinue
}
