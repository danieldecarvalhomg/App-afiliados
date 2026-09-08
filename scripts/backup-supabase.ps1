$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:SUPABASE_DB_URL)) {
  throw "Defina SUPABASE_DB_URL com a connection string direta do Postgres."
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$backupDirectory = Join-Path $projectRoot "backups"
New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
$resolvedBackupDirectory = (Resolve-Path -LiteralPath $backupDirectory).Path
if (-not $resolvedBackupDirectory.StartsWith((Resolve-Path -LiteralPath $projectRoot).Path, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Diretório de backup fora do projeto; operação interrompida."
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$destination = Join-Path $resolvedBackupDirectory "promofy_$timestamp.dump"
& pg_dump --format=custom --no-owner --no-privileges --dbname=$env:SUPABASE_DB_URL --file=$destination
if ($LASTEXITCODE -ne 0) { throw "pg_dump falhou com código $LASTEXITCODE." }

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash.ToLowerInvariant()
Set-Content -LiteralPath "$destination.sha256" -Value "$hash  $(Split-Path -Leaf $destination)" -Encoding ascii

$cutoff = (Get-Date).AddDays(-30)
Get-ChildItem -LiteralPath $resolvedBackupDirectory -File |
  Where-Object { $_.Name -like "promofy_*.dump*" -and $_.LastWriteTime -lt $cutoff } |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }

Write-Output "Backup criado: $destination"
Write-Output "SHA-256: $hash"
