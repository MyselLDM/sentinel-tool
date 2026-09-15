<#
.SYNOPSIS
  Run the Sentinel Express API gateway.

.EXAMPLE
  ./run.ps1          # npm start   (http://localhost:4000)
  ./run.ps1 dev      # npm run dev (auto-restart on file changes)

.DESCRIPTION
  Installs dependencies on first run. Copy .env.example to .env to configure.
  Requires Node.js >= 18.

  If script execution is blocked, run:
    powershell -ExecutionPolicy Bypass -File .\run.ps1
#>
[CmdletBinding()]
param(
  [ValidateSet('start', 'dev')]
  [string] $Mode = 'start'
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'npm (Node.js >= 18) not found.'
}

if (-not (Test-Path 'node_modules')) {
  Write-Host '==> Installing dependencies (npm install)'
  npm install
}

if (-not (Test-Path '.env') -and (Test-Path '.env.example')) {
  Write-Host '==> No .env found - using defaults (copy .env.example to .env to customise).'
}

Write-Host "==> Express API starting ($Mode) ..."
npm run $Mode
exit $LASTEXITCODE
