param(
  [int]$Port = 3002
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
$cloudflaredExecutable = (Get-Command cloudflared -ErrorAction Stop).Source
$serverOut = Join-Path $projectRoot '.public-server.out.log'
$serverErr = Join-Path $projectRoot '.public-server.err.log'
$tunnelOut = Join-Path $projectRoot '.public-tunnel.out.log'
$tunnelErr = Join-Path $projectRoot '.public-tunnel.err.log'
$publicUrlFile = Join-Path $projectRoot '.public-url.txt'

Remove-Item -LiteralPath $serverOut, $serverErr, $tunnelOut, $tunnelErr, $publicUrlFile -Force -ErrorAction SilentlyContinue

function Start-AfiliHubServer {
  Start-Process `
    -FilePath $nodeExecutable `
    -ArgumentList 'dist/server.cjs' `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $serverOut `
    -RedirectStandardError $serverErr `
    -Environment @{
      PORT = [string]$Port
      HOST = '127.0.0.1'
      NODE_ENV = 'production'
    } `
    -PassThru
}

function Start-AfiliHubTunnel {
  Start-Process `
    -FilePath $cloudflaredExecutable `
    -ArgumentList @('tunnel', '--no-autoupdate', '--url', "http://127.0.0.1:$Port") `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $tunnelOut `
    -RedirectStandardError $tunnelErr `
    -PassThru
}

$serverProcess = $null
$tunnelProcess = $null

while ($true) {
  if ($null -eq $serverProcess -or $serverProcess.HasExited) {
    $serverProcess = Start-AfiliHubServer
  }

  if ($null -eq $tunnelProcess -or $tunnelProcess.HasExited) {
    $tunnelProcess = Start-AfiliHubTunnel
  }

  if (Test-Path -LiteralPath $tunnelErr) {
    $match = Select-String -Path $tunnelErr -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches |
      Select-Object -Last 1
    if ($match) {
      $url = $match.Matches[-1].Value
      if (-not (Test-Path -LiteralPath $publicUrlFile) -or (Get-Content -Raw $publicUrlFile).Trim() -ne $url) {
        Set-Content -LiteralPath $publicUrlFile -Value $url -Encoding utf8NoBOM
      }
    }
  }

  Start-Sleep -Seconds 2
}
