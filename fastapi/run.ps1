<#
.SYNOPSIS
  Run the Sentinel FastAPI inference service.

.EXAMPLE
  ./run.ps1
  $env:PORT = 9000; ./run.ps1
  ./run.ps1 --reload

.DESCRIPTION
  Creates .venv and installs requirements.txt on first run (and again whenever
  requirements.txt changes). Requires Python 3.10+.

  If script execution is blocked, run:
    powershell -ExecutionPolicy Bypass -File .\run.ps1
#>
[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $UvicornArgs
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$BindHost = if ($env:HOST) { $env:HOST } else { '127.0.0.1' }
$Port = if ($env:PORT) { $env:PORT } else { '8000' }
$Venv = if ($env:VENV) { $env:VENV } else { '.venv' }

function Resolve-Python {
  $candidates = @()
  if ($env:PYTHON) { $candidates += $env:PYTHON }
  $candidates += @('py', 'python')
  foreach ($candidate in $candidates) {
    if (-not $candidate) { continue }
    $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
  }
  throw 'Python 3.10+ not found. Install it, or set $env:PYTHON.'
}

# --- Create the virtual environment on first run ----------------------------
if (-not (Test-Path $Venv)) {
  Write-Host "==> Creating virtual environment in $Venv"
  & (Resolve-Python) -m venv $Venv
}

# --- Resolve the venv interpreter -------------------------------------------
$Vpy = Join-Path $Venv 'Scripts\python.exe'
if (-not (Test-Path $Vpy)) {
  $posix = Join-Path $Venv 'bin/python'
  if (Test-Path $posix) { $Vpy = $posix } else { throw "No python interpreter found in $Venv" }
}

# --- Install dependencies when requirements.txt is newer than the marker ---
# NOTE: torch must be >= 2.11 (see requirements.txt). On a GPU/CPU mismatch,
# install torch first from https://download.pytorch.org/whl/ and re-run.
$marker = Join-Path $Venv '.deps-installed'
$needsInstall = $true
if (Test-Path $marker) {
  $needsInstall = (Get-Item 'requirements.txt').LastWriteTimeUtc -gt (Get-Item $marker).LastWriteTimeUtc
}
if ($needsInstall) {
  Write-Host '==> Installing dependencies (requirements.txt)'
  & $Vpy -m pip install --upgrade pip
  & $Vpy -m pip install -r requirements.txt
  New-Item -ItemType File -Path $marker -Force | Out-Null
}

Write-Host "==> Inference API on http://${BindHost}:${Port}  (docs: /docs)"
& $Vpy -m uvicorn app.main:app --host $BindHost --port $Port @UvicornArgs
exit $LASTEXITCODE
